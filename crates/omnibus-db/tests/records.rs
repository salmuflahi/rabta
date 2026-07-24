use rabta_db::{
    Db, DbConfig, DbError, NewProject, NewTask, NewTaskResource, TaskStatus, PROJECT_ICONS,
};
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
fn session_begin_resets_duration_and_accrual_credits_the_tasks_project() {
    let db = db();
    let p = a_project(&db, "Rabta");
    let t = db
        .create_task(NewTask {
            project_id: p.id.clone(),
            title: "Ship".into(),
        })
        .unwrap();

    db.begin_project_session_for_task(&t.id, "2026-07-23T12:00:00Z")
        .unwrap();
    db.add_active_seconds_for_task(&t.id, 17).unwrap();

    let current = db.get_project(&p.id).unwrap().unwrap();
    assert_eq!(current.last_task_id.as_deref(), Some(t.id.as_str()));
    assert_eq!(
        current.last_opened_at.as_deref(),
        Some("2026-07-23T12:00:00Z")
    );
    assert_eq!(current.active_seconds, 17);

    db.begin_project_session_for_task(&t.id, "2026-07-23T13:00:00Z")
        .unwrap();
    assert_eq!(db.get_project(&p.id).unwrap().unwrap().active_seconds, 0);
}

#[test]
fn session_operations_reject_missing_tasks_and_archived_projects() {
    let db = db();
    let p = a_project(&db, "Rabta");
    let t = db
        .create_task(NewTask {
            project_id: p.id.clone(),
            title: "Ship".into(),
        })
        .unwrap();

    assert!(matches!(
        db.begin_project_session_for_task("missing", "2026-07-23T12:00:00Z"),
        Err(DbError::NotFound { .. })
    ));
    assert!(matches!(
        db.add_active_seconds_for_task("missing", 1),
        Err(DbError::NotFound { .. })
    ));

    db.archive_project(&p.id).unwrap();
    assert!(matches!(
        db.begin_project_session_for_task(&t.id, "2026-07-23T12:00:00Z"),
        Err(DbError::NotFound { .. })
    ));
    assert!(matches!(
        db.add_active_seconds_for_task(&t.id, 1),
        Err(DbError::NotFound { .. })
    ));
}

#[test]
fn zero_second_accrual_is_a_no_op_only_for_an_active_project_task() {
    let db = db();
    let p = a_project(&db, "Rabta");
    let t = db
        .create_task(NewTask {
            project_id: p.id.clone(),
            title: "Ship".into(),
        })
        .unwrap();
    db.begin_project_session_for_task(&t.id, "2026-07-23T12:00:00Z")
        .unwrap();
    let before = db.get_project(&p.id).unwrap().unwrap();

    db.add_active_seconds_for_task(&t.id, 0).unwrap();

    assert_eq!(db.get_project(&p.id).unwrap().unwrap(), before);
    assert!(matches!(
        db.add_active_seconds_for_task("missing", 0),
        Err(DbError::NotFound { .. })
    ));
    db.archive_project(&p.id).unwrap();
    assert!(matches!(
        db.add_active_seconds_for_task(&t.id, 0),
        Err(DbError::NotFound { .. })
    ));
}

#[test]
fn session_accrual_atomically_saturates_the_stored_sqlite_integer_sum() {
    let db = db();
    let p = a_project(&db, "Rabta");
    let t = db
        .create_task(NewTask {
            project_id: p.id.clone(),
            title: "Ship".into(),
        })
        .unwrap();
    db.begin_project_session_for_task(&t.id, "2026-07-23T12:00:00Z")
        .unwrap();

    db.add_active_seconds_for_task(&t.id, i64::MAX as u64 - 1)
        .unwrap();
    assert_eq!(
        db.get_project(&p.id).unwrap().unwrap().active_seconds,
        i64::MAX as u64 - 1
    );

    db.add_active_seconds_for_task(&t.id, 2).unwrap();
    assert_eq!(
        db.get_project(&p.id).unwrap().unwrap().active_seconds,
        i64::MAX as u64
    );

    db.add_active_seconds_for_task(&t.id, 1).unwrap();
    db.add_active_seconds_for_task(&t.id, u64::MAX).unwrap();
    assert_eq!(
        db.get_project(&p.id).unwrap().unwrap().active_seconds,
        i64::MAX as u64
    );
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
fn newly_created_projects_append_after_archived_projects_too() {
    let db = db();
    let archived = a_project(&db, "Archived");
    db.archive_project(&archived.id).unwrap();

    let active = a_project(&db, "Active");

    assert_eq!(active.sort_order, archived.sort_order + 1);
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

    for icon_key in PROJECT_ICONS {
        assert_eq!(
            db.set_project_icon(&p.id, Some(icon_key))
                .unwrap()
                .icon
                .as_deref(),
            Some(*icon_key)
        );
    }

    let icon = db.set_project_icon(&p.id, Some("rocket")).unwrap();
    assert_eq!(icon.icon.as_deref(), Some("rocket"));
    assert!(db.set_project_icon(&p.id, Some("emoji")).is_err());
    assert_eq!(db.set_project_icon(&p.id, None).unwrap().icon, None);

    let archived = db.archive_project(&p.id).unwrap();
    assert!(archived.archived_at.is_some());
    std::thread::sleep(std::time::Duration::from_millis(1));
    let archived_again = db.archive_project(&p.id).unwrap();
    assert_eq!(archived_again.archived_at, archived.archived_at);
    assert!(archived_again.updated_at > archived.updated_at);
    assert_eq!(db.list_projects().unwrap(), vec![tail.clone()]);
    assert_eq!(db.list_archived_projects().unwrap(), vec![archived_again]);
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

    assert!(db.reorder_projects(&[a.id.clone(), b.id.clone()]).is_err());
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
    let t = db
        .create_task(NewTask {
            project_id: p.id.clone(),
            title: "fix login".into(),
        })
        .unwrap();
    assert_eq!(t.created_at, t.updated_at);
    assert_eq!(t.status, TaskStatus::Open);
    db.set_task_status(&t.id, TaskStatus::Done).unwrap();
    let tasks = db.list_tasks(&p.id).unwrap();
    assert_eq!(tasks.len(), 1);
    assert_eq!(tasks[0].status, TaskStatus::Done);
}

#[test]
fn duplicate_task_copies_all_resources_in_attachment_order_with_fresh_ids() {
    let db = db();
    let p = a_project(&db, "Rabta");
    let source = db
        .create_task(NewTask {
            project_id: p.id,
            title: "Ship".into(),
        })
        .unwrap();
    let source_resources = [
        ("git", "branch", json!({"branch": "main", "ahead": 2})),
        (
            "chrome",
            "tabs",
            json!({"urls": ["https://example.com", "https://docs.rs"]}),
        ),
    ]
    .into_iter()
    .map(|(connector_kind, resource_type, payload)| {
        db.add_task_resource(NewTaskResource {
            task_id: source.id.clone(),
            connector_kind: connector_kind.into(),
            resource_type: resource_type.into(),
            payload,
        })
        .unwrap()
    })
    .collect::<Vec<_>>();
    db.set_task_status(&source.id, TaskStatus::Done).unwrap();

    let copy = db.duplicate_task(&source.id).unwrap();
    let copied_resources = db.task_resources(&copy.id).unwrap();
    assert_eq!(copy.title, "Copy of Ship");
    assert_eq!(copy.status, TaskStatus::Open);
    assert_ne!(copy.id, source.id);
    assert_eq!(copied_resources.len(), source_resources.len());
    assert_eq!(
        copied_resources
            .iter()
            .map(|resource| (
                &resource.connector_kind,
                &resource.resource_type,
                &resource.payload
            ))
            .collect::<Vec<_>>(),
        source_resources
            .iter()
            .map(|resource| (
                &resource.connector_kind,
                &resource.resource_type,
                &resource.payload
            ))
            .collect::<Vec<_>>()
    );
    for (copied, source) in copied_resources.iter().zip(source_resources.iter()) {
        assert_ne!(copied.id, source.id);
        assert_eq!(copied.created_at, source.created_at);
    }

    let second_copy = db.duplicate_task(&source.id).unwrap();
    assert_eq!(second_copy.title, "Copy of Ship (2)");
}

#[test]
fn duplicate_task_rejects_a_missing_source() {
    let db = db();

    assert!(matches!(
        db.duplicate_task("missing"),
        Err(DbError::NotFound { entity: "task", .. })
    ));
}

#[test]
fn rename_task_trims_and_validates_its_target() {
    let db = db();
    let project = a_project(&db, "Rabta");
    let task = db
        .create_task(NewTask {
            project_id: project.id,
            title: "Old name".into(),
        })
        .unwrap();

    std::thread::sleep(std::time::Duration::from_millis(1));
    let renamed = db.rename_task(&task.id, "  New name  ").unwrap();
    assert_eq!(renamed.title, "New name");
    assert!(renamed.updated_at > task.updated_at);
    assert_eq!(db.get_task(&task.id).unwrap(), Some(renamed));
    assert!(matches!(
        db.rename_task(&task.id, " "),
        Err(DbError::Validation { field: "title", .. })
    ));
    assert!(matches!(
        db.rename_task("missing", "New name"),
        Err(DbError::NotFound { entity: "task", .. })
    ));
}

#[test]
fn duplicate_task_rolls_back_when_a_resource_copy_fails() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("rabta.db");
    let db = Db::open(&path, DbConfig::default()).unwrap();
    let project = a_project(&db, "Rabta");
    let source = db
        .create_task(NewTask {
            project_id: project.id.clone(),
            title: "Source".into(),
        })
        .unwrap();
    for connector_kind in ["git", "rollback-sentinel"] {
        db.add_task_resource(NewTaskResource {
            task_id: source.id.clone(),
            connector_kind: connector_kind.into(),
            resource_type: "state".into(),
            payload: json!({"kind": connector_kind}),
        })
        .unwrap();
    }
    let external = rusqlite::Connection::open(&path).unwrap();
    external
        .execute_batch(
            "CREATE TRIGGER fail_duplicate_resource
             BEFORE INSERT ON task_resources
             WHEN NEW.connector_kind = 'rollback-sentinel'
             BEGIN
               SELECT RAISE(ABORT, 'intentional duplicate failure');
             END;",
        )
        .unwrap();
    drop(external);

    assert!(db.duplicate_task(&source.id).is_err());
    assert_eq!(db.list_tasks(&project.id).unwrap(), vec![source.clone()]);
    assert_eq!(db.task_resources(&source.id).unwrap().len(), 2);
}

#[test]
fn deleting_last_opened_task_clears_the_project_soft_reference() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("rabta.db");
    let db = Db::open(&path, DbConfig::default()).unwrap();
    let project = a_project(&db, "Rabta");
    let task = db
        .create_task(NewTask {
            project_id: project.id.clone(),
            title: "Active".into(),
        })
        .unwrap();
    let external = rusqlite::Connection::open(&path).unwrap();
    external
        .execute(
            "UPDATE projects SET last_task_id = ?2 WHERE id = ?1",
            rusqlite::params![project.id, task.id],
        )
        .unwrap();
    drop(external);

    db.delete_task(&task.id).unwrap();
    assert_eq!(
        db.get_project(&project.id).unwrap().unwrap().last_task_id,
        None
    );
}

#[test]
fn deleting_project_cascades_to_tasks_and_resources() {
    let db = db();
    let p = a_project(&db, "omnibus");
    let t = db
        .create_task(NewTask {
            project_id: p.id.clone(),
            title: "t".into(),
        })
        .unwrap();
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
    let t = db
        .create_task(NewTask {
            project_id: p.id.clone(),
            title: "t".into(),
        })
        .unwrap();
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
    let t = db
        .create_task(NewTask {
            project_id: p.id.clone(),
            title: "t".into(),
        })
        .unwrap();
    db.add_task_resource(NewTaskResource {
        task_id: t.id.clone(),
        connector_kind: "chrome".into(),
        resource_type: "tabs".into(),
        payload: json!({"tabs": []}),
    })
    .unwrap();
    db.replace_task_resources(
        &t.id,
        "vscode",
        "workspace",
        &json!({"openFiles": ["a.ts"]}),
    )
    .unwrap();
    let replaced = db
        .replace_task_resources(
            &t.id,
            "vscode",
            "workspace",
            &json!({"openFiles": ["b.ts"]}),
        )
        .unwrap();
    assert_eq!(replaced.connector_kind, "vscode");
    assert_eq!(replaced.payload, json!({"openFiles": ["b.ts"]}));

    let all = db.task_resources(&t.id).unwrap();
    assert_eq!(all.len(), 2, "chrome row untouched, single vscode row");
    let kinds: Vec<&str> = all.iter().map(|r| r.connector_kind.as_str()).collect();
    assert!(kinds.contains(&"chrome") && kinds.contains(&"vscode"));
    let vs = all.iter().find(|r| r.connector_kind == "vscode").unwrap();
    assert_eq!(
        vs.payload,
        json!({"openFiles": ["b.ts"]}),
        "old vscode row replaced"
    );
}

#[test]
fn get_task_and_project_by_id() {
    let db = db();
    let p = a_project(&db, "omnibus");
    let t = db
        .create_task(NewTask {
            project_id: p.id.clone(),
            title: "t".into(),
        })
        .unwrap();
    assert_eq!(db.get_project(&p.id).unwrap().unwrap().name, "omnibus");
    assert_eq!(db.get_task(&t.id).unwrap().unwrap().title, "t");
    assert!(db.get_project("nope").unwrap().is_none());
    assert!(db.get_task("nope").unwrap().is_none());
}
