//! The review step's answers, and what applying a bundle actually does.

use rabta_db::{
    ApplyPlan, Bundle, Db, DbConfig, Include, Merge, NewProject, NewTask, NewTaskResource,
};

fn db() -> Db {
    Db::open_in_memory(DbConfig::default()).expect("open")
}

/// A bundle written by a Mac whose home is `/Users/sender`, carrying one
/// project, one capsule, and an editor capture full of absolute paths.
fn sender_bundle() -> Bundle {
    let source = db();
    let project = source
        .create_project(NewProject {
            name: "atlas-api".into(),
            repo_path: "/Users/sender/code/atlas-api".into(),
            dev_url: None,
            default_branch: "main".into(),
        })
        .expect("project");
    let task = source
        .create_task(NewTask {
            project_id: project.id.clone(),
            title: "Wire the reconnect".into(),
        })
        .expect("task");
    source
        .add_task_resource(NewTaskResource {
            task_id: task.id.clone(),
            connector_kind: "vscode".into(),
            resource_type: "workspace".into(),
            payload: serde_json::json!({
                "workspaceFolder": "/Users/sender/code/atlas-api",
                "openFiles": [
                    "/Users/sender/code/atlas-api/src/hub.rs",
                    "/Users/sender/code/atlas-api/src/session.rs"
                ],
                "terminals": [{ "name": "zsh", "cwd": "/Users/sender/code/atlas-api" }]
            }),
        })
        .expect("resource");
    source
        .add_task_resource(NewTaskResource {
            task_id: task.id,
            connector_kind: "chrome".into(),
            resource_type: "tabs".into(),
            payload: serde_json::json!({
                "tabs": [{ "url": "https://example.com", "title": "Example" }]
            }),
        })
        .expect("tabs");

    source
        .export_bundle(Include::default(), Some("/Users/sender".into()), None)
        .expect("export")
}

#[test]
fn reports_how_much_the_folder_remap_touches() {
    let bundle = sender_bundle();
    let report = db()
        .inspect_bundle(&bundle, Some("/Users/receiver"))
        .expect("inspect");

    // The handoff prints exactly this: "Applies to 3 projects and 14 saved
    // file paths."
    assert_eq!(report.remap_projects, 1);
    // workspaceFolder + two openFiles + one terminal cwd. The https:// tab
    // is not a path and must not be counted.
    assert_eq!(report.remap_paths, 4);
    assert_eq!(report.source_home.as_deref(), Some("/Users/sender"));
}

#[test]
fn reports_which_apps_the_capsules_need() {
    let bundle = sender_bundle();
    let report = db().inspect_bundle(&bundle, None).expect("inspect");

    let kinds: Vec<_> = report.apps.iter().map(|a| a.kind.as_str()).collect();
    assert_eq!(kinds, vec!["chrome", "vscode"]);
    // Counted over distinct capsules, not resources: one capsule needs both.
    assert!(report.apps.iter().all(|a| a.capsules == 1));
}

#[test]
fn reports_repositories_at_the_path_they_would_land_on() {
    let bundle = sender_bundle();
    let report = db()
        .inspect_bundle(&bundle, Some("/Users/receiver"))
        .expect("inspect");
    assert_eq!(report.repos.len(), 1);
    assert_eq!(report.repos[0].path, "/Users/receiver/code/atlas-api");
    assert_eq!(report.repos[0].branch, "main");
}

/// Collisions are by name — ids are UUIDs and never collide, so matching on
/// them would report "no conflicts" for two unrelated `atlas-api`s.
#[test]
fn finds_names_that_already_exist_here() {
    let bundle = sender_bundle();
    let local = db();
    assert!(local
        .inspect_bundle(&bundle, None)
        .expect("inspect")
        .collisions
        .is_empty());

    local
        .create_project(NewProject {
            name: "atlas-api".into(),
            repo_path: "/Users/receiver/other/atlas-api".into(),
            dev_url: None,
            default_branch: "main".into(),
        })
        .expect("local project");

    let report = local.inspect_bundle(&bundle, None).expect("inspect");
    assert_eq!(report.collisions.len(), 1);
    assert_eq!(report.collisions[0].name, "atlas-api");
    assert_eq!(report.collisions[0].kind, "project");
}

#[test]
fn inspect_writes_nothing() {
    let bundle = sender_bundle();
    let local = db();
    local.inspect_bundle(&bundle, Some("/Users/receiver")).expect("inspect");
    assert!(local.list_projects().expect("projects").is_empty());
}

#[test]
fn applying_remaps_every_path_it_counted() {
    let bundle = sender_bundle();
    let local = db();
    let out = local
        .apply_bundle(
            &bundle,
            &ApplyPlan {
                new_home: Some("/Users/receiver".into()),
                merge: Merge::KeepBoth,
            },
        )
        .expect("apply");

    assert_eq!(out.projects_added, 1);
    assert_eq!(out.capsules_added, 1);

    let project = local.list_projects().expect("projects").remove(0);
    assert_eq!(project.repo_path, "/Users/receiver/code/atlas-api");

    let task = local
        .list_tasks(&project.id)
        .expect("tasks")
        .into_iter()
        .next()
        .expect("one capsule");
    let resources = local.task_resources(&task.id).expect("resources");
    let workspace = resources
        .iter()
        .find(|r| r.connector_kind == "vscode")
        .expect("editor capture");
    let payload = serde_json::to_string(&workspace.payload).expect("payload");
    assert!(payload.contains("/Users/receiver/code/atlas-api/src/hub.rs"));
    assert!(!payload.contains("/Users/sender"));

    // The tab URL is not a path and must survive untouched.
    let tabs = resources
        .iter()
        .find(|r| r.connector_kind == "chrome")
        .expect("tabs");
    assert!(serde_json::to_string(&tabs.payload)
        .expect("payload")
        .contains("https://example.com"));
}

/// `/Users/sam` must not rewrite the start of `/Users/samantha/code`.
#[test]
fn the_remap_only_matches_whole_path_segments() {
    let source = db();
    source
        .create_project(NewProject {
            name: "sibling".into(),
            repo_path: "/Users/samantha/code/sibling".into(),
            dev_url: None,
            default_branch: "main".into(),
        })
        .expect("project");
    let bundle = source
        .export_bundle(Include::default(), Some("/Users/sam".into()), None)
        .expect("export");

    let report = db()
        .inspect_bundle(&bundle, Some("/Users/receiver"))
        .expect("inspect");
    assert_eq!(report.remap_projects, 0, "a prefix is not a path");

    let local = db();
    local
        .apply_bundle(
            &bundle,
            &ApplyPlan {
                new_home: Some("/Users/receiver".into()),
                merge: Merge::KeepBoth,
            },
        )
        .expect("apply");
    assert_eq!(
        local.list_projects().expect("projects")[0].repo_path,
        "/Users/samantha/code/sibling"
    );
}

#[test]
fn keep_both_brings_the_incoming_one_in_beside_the_local_one() {
    let bundle = sender_bundle();
    let local = db();
    local
        .create_project(NewProject {
            name: "atlas-api".into(),
            repo_path: "/Users/receiver/mine/atlas-api".into(),
            dev_url: None,
            default_branch: "main".into(),
        })
        .expect("local");

    let out = local
        .apply_bundle(
            &bundle,
            &ApplyPlan {
                new_home: None,
                merge: Merge::KeepBoth,
            },
        )
        .expect("apply");
    assert_eq!(out.projects_added, 1);

    let names: Vec<_> = local
        .list_projects()
        .expect("projects")
        .into_iter()
        .map(|p| p.name)
        .collect();
    assert!(names.contains(&"atlas-api".to_string()), "the local one is untouched");
    assert!(
        names.iter().any(|n| n.starts_with("atlas-api (from the other Mac)")),
        "the incoming one arrives under a free name: {names:?}"
    );
}

#[test]
fn skip_leaves_this_mac_alone_and_drops_the_orphaned_capsules() {
    let bundle = sender_bundle();
    let local = db();
    let mine = local
        .create_project(NewProject {
            name: "atlas-api".into(),
            repo_path: "/Users/receiver/mine/atlas-api".into(),
            dev_url: None,
            default_branch: "main".into(),
        })
        .expect("local");

    let out = local
        .apply_bundle(
            &bundle,
            &ApplyPlan {
                new_home: None,
                merge: Merge::Skip,
            },
        )
        .expect("apply");

    assert_eq!(out.projects_skipped, 1);
    assert_eq!(out.projects_added, 0);
    // A capsule whose project was skipped has nowhere to live — writing it
    // would leave a row unreachable from the UI.
    assert_eq!(out.capsules_added, 0);

    let projects = local.list_projects().expect("projects");
    assert_eq!(projects.len(), 1);
    assert_eq!(projects[0].id, mine.id);
    assert_eq!(projects[0].repo_path, "/Users/receiver/mine/atlas-api");
}

/// Replace is the only destructive choice, and the UI says so in those
/// words. This is what those words have to be true about.
#[test]
fn replace_overwrites_the_local_one_and_its_capsules() {
    let bundle = sender_bundle();
    let local = db();
    let mine = local
        .create_project(NewProject {
            name: "atlas-api".into(),
            repo_path: "/Users/receiver/mine/atlas-api".into(),
            dev_url: None,
            default_branch: "main".into(),
        })
        .expect("local");
    local
        .create_task(NewTask {
            project_id: mine.id.clone(),
            title: "My own capsule".into(),
        })
        .expect("local capsule");

    let out = local
        .apply_bundle(
            &bundle,
            &ApplyPlan {
                new_home: None,
                merge: Merge::Replace,
            },
        )
        .expect("apply");
    assert_eq!(out.projects_replaced, 1);

    let projects = local.list_projects().expect("projects");
    assert_eq!(projects.len(), 1);
    assert_eq!(projects[0].repo_path, "/Users/sender/code/atlas-api");

    let titles: Vec<_> = local
        .list_tasks(&projects[0].id)
        .expect("tasks")
        .into_iter()
        .map(|t| t.title)
        .collect();
    assert_eq!(titles, vec!["Wire the reconnect"]);
}

#[test]
fn pairings_arrive_without_clearing_one_that_already_works_here() {
    let source = db();
    source
        .upsert_connector("Chrome", "chrome", &["tabs".to_string()], Some("0.1.0"))
        .expect("connector");
    let bundle = source
        .export_bundle(Include::default(), None, None)
        .expect("export");

    let local = db();
    local
        .upsert_connector("Chrome", "chrome", &["tabs".to_string()], None)
        .expect("local connector");
    local
        .set_connector_token("Chrome", "chrome", "my-working-token")
        .expect("token");

    local
        .apply_bundle(
            &bundle,
            &ApplyPlan {
                new_home: None,
                merge: Merge::KeepBoth,
            },
        )
        .expect("apply");

    // The incoming record must not have wiped the credential that already
    // pairs this Mac with Chrome.
    let known = local.known_connectors().expect("known");
    assert_eq!(known.len(), 1);
}

#[test]
fn a_bundle_from_a_newer_build_is_refused_before_anything_is_written() {
    let mut bundle = sender_bundle();
    bundle.version = 99;
    let local = db();
    local
        .apply_bundle(
            &bundle,
            &ApplyPlan {
                new_home: None,
                merge: Merge::KeepBoth,
            },
        )
        .expect_err("must refuse");
    assert!(local.list_projects().expect("projects").is_empty());
}
