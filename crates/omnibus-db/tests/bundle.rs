//! What a `.rabta` bundle must and must not contain, and that it survives a
//! round trip.

use rabta_db::{
    seal, unseal, Bundle, Db, DbConfig, Include, NewProject, NewTask, NewTaskResource,
};

fn db() -> Db {
    Db::open_in_memory(DbConfig::default()).expect("open")
}

/// A database with one project, one capsule, one captured resource and a
/// paired connector — enough for every assertion below.
fn seeded() -> Db {
    let db = db();
    let project = db
        .create_project(NewProject {
            name: "atlas-api".into(),
            repo_path: "/Users/sender/code/atlas-api".into(),
            dev_url: None,
            default_branch: "main".into(),
        })
        .expect("project");
    let task = db
        .create_task(NewTask {
            project_id: project.id.clone(),
            title: "Wire the reconnect".into(),
        })
        .expect("task");
    db.add_task_resource(NewTaskResource {
        task_id: task.id.clone(),
        connector_kind: "git".into(),
        resource_type: "branch".into(),
        payload: r#"{"branch":"feat/reconnect"}"#.into(),
    })
    .expect("resource");
    db
}

#[test]
fn survey_counts_only_live_rows() {
    let db = seeded();
    let before = db.migrate_survey().expect("survey");
    assert_eq!(before.projects, 1);
    assert_eq!(before.capsules, 1);

    let tasks = db.list_projects().expect("projects");
    let task = db
        .list_tasks(&tasks[0].id)
        .expect("tasks")
        .into_iter()
        .next()
        .expect("one task");
    db.delete_task(&task.id).expect("delete");

    // A capsule in the bin is not something the user still has; offering to
    // send it would overstate what crosses.
    let after = db.migrate_survey().expect("survey");
    assert_eq!(after.capsules, 0);
}

#[test]
fn round_trips_through_json_and_encryption() {
    let db = seeded();
    let bundle = db
        .export_bundle(
            Include::default(),
            Some("/Users/sender".into()),
            Some(r#"{"theme":"dark"}"#.into()),
        )
        .expect("export");

    let json = serde_json::to_vec(&bundle).expect("serialize");
    let sealed = seal(&json, "correct horse battery staple").expect("seal");
    let opened = unseal(&sealed, "correct horse battery staple").expect("unseal");
    let back: Bundle = serde_json::from_slice(&opened).expect("deserialize");

    back.check_readable().expect("readable");
    assert_eq!(back.projects.len(), 1);
    assert_eq!(back.tasks.len(), 1);
    assert_eq!(back.task_resources.len(), 1);
    assert_eq!(back.source_home.as_deref(), Some("/Users/sender"));
    assert_eq!(back.preferences.as_deref(), Some(r#"{"theme":"dark"}"#));
}

#[test]
fn the_ciphertext_does_not_leak_its_contents() {
    let db = seeded();
    let bundle = db
        .export_bundle(Include::default(), None, None)
        .expect("export");
    let json = serde_json::to_vec(&bundle).expect("serialize");
    let sealed = seal(&json, "pw").expect("seal");

    // The promise on the File step is that the bundle is unreadable without
    // the passphrase. At minimum, nothing recognisable survives in the clear.
    let haystack = String::from_utf8_lossy(&sealed);
    assert!(!haystack.contains("atlas-api"));
    assert!(!haystack.contains("Wire the reconnect"));
    assert!(!haystack.contains("feat/reconnect"));
}

#[test]
fn a_wrong_passphrase_says_so_and_nothing_else() {
    let sealed = seal(b"{}", "right").expect("seal");
    let err = unseal(&sealed, "wrong").expect_err("must not open");
    let message = err.to_string();
    assert!(
        message.contains("passphrase"),
        "a wrong passphrase is the likeliest failure here and must be named: {message}"
    );
}

/// The handoff's note on this checkbox is "You re-approve them on the new
/// Mac". A bundle is a file that ends up in Downloads, on a USB stick, in
/// an AirDrop — a live pairing token in it is a key left in a taxi.
#[test]
fn pairings_cross_without_their_tokens() {
    let db = seeded();
    db.upsert_connector("Chrome", "chrome", &["tabs".to_string()], Some("0.1.0"))
        .expect("connector");
    // A real, live pairing credential on the row — otherwise the assertion
    // below that it doesn't cross would pass on an empty column.
    db.set_connector_token("Chrome", "chrome", "sekrit-pairing-token")
        .expect("token");

    let bundle = db
        .export_bundle(Include::default(), None, None)
        .expect("export");
    assert_eq!(bundle.connectors.len(), 1);
    assert_eq!(bundle.connectors[0].name, "Chrome");

    let json = serde_json::to_string(&bundle).expect("serialize");
    assert!(
        !json.contains("token") && !json.contains("sekrit-pairing-token"),
        "a bundle must never carry a pairing credential"
    );
}

#[test]
fn unticked_sections_are_absent_not_filtered_later() {
    let db = seeded();
    db.upsert_connector("Chrome", "chrome", &[], None)
        .expect("connector");

    let bundle = db
        .export_bundle(
            Include {
                capsules: false,
                projects: true,
                pairings: false,
                preferences: false,
                history: false,
            },
            None,
            Some("{}".into()),
        )
        .expect("export");

    assert!(bundle.tasks.is_empty());
    assert!(bundle.task_resources.is_empty());
    assert!(bundle.connectors.is_empty());
    assert!(bundle.events.is_empty());
    assert_eq!(bundle.preferences, None, "unticked preferences must not be in the file");
    assert_eq!(bundle.projects.len(), 1);
}

/// A task whose project didn't cross is a dangling foreign key with no name
/// to show. Sending capsules pulls their projects along whatever the
/// Projects checkbox says.
#[test]
fn capsules_bring_their_projects() {
    let db = seeded();
    let bundle = db
        .export_bundle(
            Include {
                capsules: true,
                projects: false,
                pairings: false,
                preferences: false,
                history: false,
            },
            None,
            None,
        )
        .expect("export");
    assert_eq!(bundle.tasks.len(), 1);
    assert_eq!(bundle.projects.len(), 1, "capsules must bring their projects");
}

#[test]
fn refuses_a_bundle_from_a_newer_build() {
    let mut bundle: Bundle = serde_json::from_str(
        r#"{"format":"rabta.bundle","version":1,"createdAt":"now","sourceInstallId":"x",
            "sourceHome":null,
            "include":{"capsules":true,"projects":true,"pairings":true,"preferences":true,"history":true}}"#,
    )
    .expect("parse");
    bundle.check_readable().expect("version 1 is readable");

    bundle.version = 99;
    let err = bundle.check_readable().expect_err("must refuse");
    assert!(err.to_string().contains("newer version"));
}

#[test]
fn refuses_a_file_that_is_not_a_bundle() {
    let bundle = Bundle {
        format: "something.else".into(),
        version: 1,
        created_at: "now".into(),
        source_install_id: "x".into(),
        source_home: None,
        include: Include::default(),
        projects: vec![],
        tasks: vec![],
        task_resources: vec![],
        task_pins: vec![],
        connectors: vec![],
        events: vec![],
        preferences: None,
    };
    let err = bundle.check_readable().expect_err("must refuse");
    assert!(err.to_string().contains("not a Rabta bundle"));
}
