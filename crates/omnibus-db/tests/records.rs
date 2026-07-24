use rabta_db::{Db, DbConfig, DbError, NewProject, NewTask, NewTaskResource, TaskStatus};
use serde_json::json;

fn db() -> Db {
    Db::open_in_memory(DbConfig::default()).unwrap()
}

fn a_project(db: &Db, name: &str) -> rabta_db::Project {
    db.create_project(NewProject {
        name: name.into(),
        repo_path: "/tmp/repo".into(),
        dev_url: Some("http://localhost:3000".into()),
        default_branch: "main".into(),
    })
    .unwrap()
}

#[test]
fn project_crud_round_trip() {
    let db = db();
    let p = a_project(&db, "omnibus");
    assert_eq!(p.created_at, p.updated_at);
    assert_eq!(p.icon, None);
    assert_eq!(p.archived_at, None);
    assert_eq!(p.last_opened_at, None);
    assert_eq!(p.last_task_id, None);
    assert_eq!(p.active_seconds, 0);
    assert_eq!(p.sort_order, 0);
    let listed = db.list_projects().unwrap();
    assert_eq!(listed, vec![p.clone()]);
    db.delete_project(&p.id).unwrap();
    assert!(db.list_projects().unwrap().is_empty());
}

#[test]
fn newly_created_projects_append_to_the_persisted_order() {
    let db = db();
    let first = a_project(&db, "Zulu");
    let second = a_project(&db, "Alpha");

    assert_eq!(first.sort_order, 0);
    assert_eq!(second.sort_order, 1);
    assert_eq!(
        db.list_projects()
            .unwrap()
            .into_iter()
            .map(|p| p.id)
            .collect::<Vec<_>>(),
        vec![first.id, second.id]
    );
}

#[test]
fn project_names_are_unique() {
    let db = db();
    a_project(&db, "omnibus");
    assert!(db
        .create_project(NewProject {
            name: "omnibus".into(),
            repo_path: "/elsewhere".into(),
            dev_url: None,
            default_branch: "main".into(),
        })
        .is_err());
}

#[test]
fn rename_archive_icon_and_unarchive_round_trip() {
    let db = db();
    let p = a_project(&db, "Rabta");
    let tail = a_project(&db, "Tail");
    let task = db
        .create_task(NewTask {
            project_id: p.id.clone(),
            title: "Preserved capsule".into(),
        })
        .unwrap();
    let resource = db
        .add_task_resource(NewTaskResource {
            task_id: task.id.clone(),
            connector_kind: "git".into(),
            resource_type: "branch".into(),
            payload: json!({"branch": "main"}),
        })
        .unwrap();

    let renamed = db.rename_project(&p.id, "  Rabta Desktop  ").unwrap();
    assert_eq!(renamed.name, "Rabta Desktop");

    let icon = db.set_project_icon(&p.id, Some("rocket")).unwrap();
    assert_eq!(icon.icon.as_deref(), Some("rocket"));
    assert!(db.set_project_icon(&p.id, Some("emoji")).is_err());
    assert_eq!(db.set_project_icon(&p.id, None).unwrap().icon, None);

    let archived = db.archive_project(&p.id).unwrap();
    assert!(archived.archived_at.is_some());
    assert_eq!(
        db.archive_project(&p.id).unwrap().archived_at,
        archived.archived_at
    );
    assert_eq!(db.list_projects().unwrap(), vec![tail.clone()]);
    assert_eq!(db.list_archived_projects().unwrap(), vec![archived]);
    assert_eq!(db.list_tasks(&p.id).unwrap(), vec![task.clone()]);
    assert_eq!(db.task_resources(&task.id).unwrap(), vec![resource]);

    let restored = db.unarchive_project(&p.id).unwrap();
    assert!(restored.archived_at.is_none());
    assert_eq!(
        db.unarchive_project(&p.id).unwrap().sort_order,
        restored.sort_order
    );
    assert_eq!(
        db.list_projects()
            .unwrap()
            .into_iter()
            .map(|project| project.id)
            .collect::<Vec<_>>(),
        vec![tail.id, restored.id]
    );
}

#[test]
fn project_mutations_reject_invalid_or_missing_targets() {
    let db = db();
    let a = a_project(&db, "A");
    let b = a_project(&db, "B");

    assert!(matches!(
        db.rename_project(&a.id, "  "),
        Err(DbError::Validation { field: "name", .. })
    ));
    assert!(db.rename_project(&a.id, "B").is_err());
    assert!(matches!(
        db.rename_project("missing", "New name"),
        Err(DbError::NotFound {
            entity: "project",
            ..
        })
    ));
    assert!(matches!(
        db.archive_project("missing"),
        Err(DbError::NotFound {
            entity: "project",
            ..
        })
    ));
    assert!(matches!(
        db.unarchive_project("missing"),
        Err(DbError::NotFound {
            entity: "project",
            ..
        })
    ));
    assert!(matches!(
        db.set_project_icon("missing", Some("code")),
        Err(DbError::NotFound {
            entity: "project",
            ..
        })
    ));
    assert_eq!(db.get_project(&a.id).unwrap().unwrap().name, "A");
    assert_eq!(db.get_project(&b.id).unwrap().unwrap().name, "B");
}

#[test]
fn reorder_requires_the_exact_active_project_set_and_rolls_back() {
    let db = db();
    let a = a_project(&db, "A");
    let b = a_project(&db, "B");
    let c = a_project(&db, "C");

    db.reorder_projects(&[c.id.clone(), a.id.clone(), b.id.clone()])
        .unwrap();
    let expected = vec![c.id.clone(), a.id.clone(), b.id.clone()];
    assert_eq!(
        db.list_projects()
            .unwrap()
            .into_iter()
            .map(|project| project.id)
            .collect::<Vec<_>>(),
        expected
    );

    assert!(db
        .reorder_projects(&[a.id.clone(), b.id.clone()])
        .is_err());
    assert!(matches!(
        db.reorder_projects(&[a.id.clone(), a.id.clone(), c.id.clone()]),
        Err(DbError::Validation {
            field: "orderedIds",
            ..
        })
    ));
    assert!(db
        .reorder_projects(&[a.id.clone(), b.id.clone(), "unknown".into()])
        .is_err());
    assert_eq!(
        db.list_projects()
            .unwrap()
            .into_iter()
            .map(|project| project.id)
            .collect::<Vec<_>>(),
        expected
    );

    db.archive_project(&b.id).unwrap();
    assert!(db
        .reorder_projects(&[a.id.clone(), c.id.clone(), b.id.clone()])
        .is_err());
    assert_eq!(
        db.list_projects()
            .unwrap()
            .into_iter()
            .map(|project| project.id)
            .collect::<Vec<_>>(),
        vec![c.id, a.id]
    );
}

#[test]
fn task_crud_and_status() {
    let db = db();
    let p = a_project(&db, "omnibus");
    let t = db.create_task(NewTask { project_id: p.id.clone(), title: "fix login".into() }).unwrap();
    assert_eq!(t.created_at, t.updated_at);
    assert_eq!(t.status, TaskStatus::Open);
    db.set_task_status(&t.id, TaskStatus::Done).unwrap();
    let tasks = db.list_tasks(&p.id).unwrap();
    assert_eq!(tasks.len(), 1);
    assert_eq!(tasks[0].status, TaskStatus::Done);
}

#[test]
fn deleting_project_cascades_to_tasks_and_resources() {
    let db = db();
    let p = a_project(&db, "omnibus");
    let t = db.create_task(NewTask { project_id: p.id.clone(), title: "t".into() }).unwrap();
    db.add_task_resource(NewTaskResource {
        task_id: t.id.clone(),
        connector_kind: "fake".into(),
        resource_type: "file".into(),
        payload: json!({"path": "src/main.ts"}),
    })
    .unwrap();
    db.delete_project(&p.id).unwrap();
    assert!(db.list_tasks(&p.id).unwrap().is_empty());
    assert!(db.task_resources(&t.id).unwrap().is_empty());
}

#[test]
fn task_resources_round_trip() {
    let db = db();
    let p = a_project(&db, "omnibus");
    let t = db.create_task(NewTask { project_id: p.id.clone(), title: "t".into() }).unwrap();
    let r = db
        .add_task_resource(NewTaskResource {
            task_id: t.id.clone(),
            connector_kind: "chrome".into(),
            resource_type: "tab".into(),
            payload: json!({"url": "https://docs.rs"}),
        })
        .unwrap();
    assert_eq!(db.task_resources(&t.id).unwrap(), vec![r.clone()]);
    db.remove_task_resource(&r.id).unwrap();
    assert!(db.task_resources(&t.id).unwrap().is_empty());
}

#[test]
fn replace_task_resources_replaces_only_that_kind() {
    let db = db();
    let p = a_project(&db, "omnibus");
    let t = db.create_task(NewTask { project_id: p.id.clone(), title: "t".into() }).unwrap();
    db.add_task_resource(NewTaskResource {
        task_id: t.id.clone(),
        connector_kind: "chrome".into(),
        resource_type: "tabs".into(),
        payload: json!({"tabs": []}),
    })
    .unwrap();
    db.replace_task_resources(&t.id, "vscode", "workspace", &json!({"openFiles": ["a.ts"]})).unwrap();
    let replaced =
        db.replace_task_resources(&t.id, "vscode", "workspace", &json!({"openFiles": ["b.ts"]})).unwrap();
    assert_eq!(replaced.connector_kind, "vscode");
    assert_eq!(replaced.payload, json!({"openFiles": ["b.ts"]}));

    let all = db.task_resources(&t.id).unwrap();
    assert_eq!(all.len(), 2, "chrome row untouched, single vscode row");
    let kinds: Vec<&str> = all.iter().map(|r| r.connector_kind.as_str()).collect();
    assert!(kinds.contains(&"chrome") && kinds.contains(&"vscode"));
    let vs = all.iter().find(|r| r.connector_kind == "vscode").unwrap();
    assert_eq!(vs.payload, json!({"openFiles": ["b.ts"]}), "old vscode row replaced");
}

#[test]
fn get_task_and_project_by_id() {
    let db = db();
    let p = a_project(&db, "omnibus");
    let t = db.create_task(NewTask { project_id: p.id.clone(), title: "t".into() }).unwrap();
    assert_eq!(db.get_project(&p.id).unwrap().unwrap().name, "omnibus");
    assert_eq!(db.get_task(&t.id).unwrap().unwrap().title, "t");
    assert!(db.get_project("nope").unwrap().is_none());
    assert!(db.get_task("nope").unwrap().is_none());
}
