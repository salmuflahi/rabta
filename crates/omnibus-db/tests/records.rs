use omnibus_db::{Db, DbConfig, NewProject, NewTask, NewTaskResource, TaskStatus};
use serde_json::json;

fn db() -> Db {
    Db::open_in_memory(DbConfig::default()).unwrap()
}

fn a_project(db: &Db, name: &str) -> omnibus_db::Project {
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
    let listed = db.list_projects().unwrap();
    assert_eq!(listed, vec![p.clone()]);
    db.delete_project(&p.id).unwrap();
    assert!(db.list_projects().unwrap().is_empty());
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
