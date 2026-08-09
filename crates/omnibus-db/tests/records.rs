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
fn session_operations_reject_a_task_whose_project_was_deleted() {
    // begin_project_session_for_task/add_active_seconds_for_task check
    // tasks.deleted_at (via a subquery) and projects.archived_at, but never
    // check projects.deleted_at directly — the JOIN pattern Task 6 audits
    // for. That is only safe because delete_project always tombstones its
    // tasks in the same transaction it tombstones itself, so a live task
    // under a deleted project cannot exist. This test pins that invariant
    // down: if a future change ever let a project become deleted without
    // cascading to its tasks, this would start failing (Ok instead of
    // NotFound), flagging that the missing projects.deleted_at filter has
    // become reachable and needs to be added for real.
    let db = db();
    let p = a_project(&db, "Rabta");
    let t = db
        .create_task(NewTask {
            project_id: p.id.clone(),
            title: "Ship".into(),
        })
        .unwrap();

    db.delete_project(&p.id).unwrap();

    assert!(matches!(
        db.begin_project_session_for_task(&t.id, "2026-07-23T12:00:00Z"),
        Err(DbError::NotFound { .. })
    ));
    assert!(matches!(
        db.add_active_seconds_for_task(&t.id, 1),
        Err(DbError::NotFound { .. })
    ));
    assert!(matches!(
        db.add_active_seconds_for_task(&t.id, 0),
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
fn session_accrual_does_not_advance_the_projects_rev() {
    // I3: rev is a local monotonic counter a later merge can trust; the UI
    // heartbeats every 15s, so if accrual bumped rev the way every genuine
    // edit does, rev would answer "how long was this Mac open" instead of
    // "how many times was this row genuinely edited". Accrual is metering,
    // not an edit, so it must leave rev untouched across many calls.
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
    let baseline = db.get_project(&p.id).unwrap().unwrap();

    for _ in 0..5 {
        db.add_active_seconds_for_task(&t.id, 15).unwrap();
    }

    let after = db.get_project(&p.id).unwrap().unwrap();
    assert_eq!(
        after.rev, baseline.rev,
        "repeated heartbeats must not advance rev"
    );
    assert_eq!(after.active_seconds, 75, "sanity: accrual itself did happen");
}

#[test]
fn fresh_rows_record_the_creating_install_id() {
    // I6: "New rows record the install that created them" — the spec's own
    // words. Every INSERT across the four tables migration 005 touched must
    // stamp created_by_install with Db::install_id(), so a later Migrate
    // collision review can tell which Mac created a given row.
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("rabta.db");
    let db = Db::open(&path, DbConfig::default()).unwrap();
    let install = db.install_id().unwrap();

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
            connector_kind: "git".into(),
            resource_type: "branch".into(),
            payload: json!({"branch": "main"}),
        })
        .unwrap();
    let replaced = db
        .replace_task_resources(&t.id, "vscode", "workspace", &json!({"openFiles": []}))
        .unwrap();
    let pin = db
        .add_task_pin(&t.id, "chrome", "https://a.test/", &json!({"a": 1}))
        .unwrap();

    let external = rusqlite::Connection::open(&path).unwrap();
    for (table, id) in [
        ("projects", p.id.as_str()),
        ("tasks", t.id.as_str()),
        ("task_resources", r.id.as_str()),
        ("task_resources", replaced.id.as_str()),
        ("task_pins", pin.id.as_str()),
    ] {
        let created_by: Option<String> = external
            .query_row(
                &format!("SELECT created_by_install FROM {table} WHERE id = ?1"),
                rusqlite::params![id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            created_by.as_deref(),
            Some(install.as_str()),
            "{table} row {id} must record the creating install"
        );
    }
}

#[test]
fn re_pinning_does_not_overwrite_the_original_created_by_install() {
    // The ON CONFLICT DO UPDATE path in add_task_pin must not touch
    // created_by_install — it records who created the row, not who most
    // recently edited it. A same-database re-pin cannot by itself
    // distinguish "left alone" from "overwritten with the same value" (both
    // observe this database's one install id), so this test manually stamps
    // the row as though a *different* Mac created it — simulating a pin
    // that arrived from another install — and proves re-pinning here does
    // not silently reassign its provenance to this install.
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("rabta.db");
    let db = Db::open(&path, DbConfig::default()).unwrap();
    let p = a_project(&db, "omnibus");
    let t = db
        .create_task(NewTask {
            project_id: p.id.clone(),
            title: "t".into(),
        })
        .unwrap();
    let first = db
        .add_task_pin(&t.id, "chrome", "https://a.test/", &json!({"a": 1}))
        .unwrap();

    let external = rusqlite::Connection::open(&path).unwrap();
    let other_install = "11111111-1111-1111-1111-111111111111";
    external
        .execute(
            "UPDATE task_pins SET created_by_install = ?2 WHERE id = ?1",
            rusqlite::params![first.id, other_install],
        )
        .unwrap();

    db.add_task_pin(&t.id, "chrome", "https://a.test/", &json!({"a": 2}))
        .unwrap();

    let after: Option<String> = external
        .query_row(
            "SELECT created_by_install FROM task_pins WHERE id = ?1",
            rusqlite::params![first.id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(
        after.as_deref(),
        Some(other_install),
        "re-pinning must not change who originally created the row"
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
fn re_archiving_an_already_archived_project_does_not_bump_rev() {
    // M6: the spec asks for "rev does not move on a no-op write". archive_project's
    // archived_at is deliberately idempotent (COALESCE), but the reviewer's rev
    // bump was unconditional, so a repeat archive of an already-archived
    // project still advanced rev — even though unarchive_project's own no-op
    // path (an already-unarchived project) correctly does not.
    let db = db();
    let p = a_project(&db, "omnibus");

    let archived = db.archive_project(&p.id).unwrap();
    assert_eq!(archived.rev, 1, "the first archive is a real transition");

    std::thread::sleep(std::time::Duration::from_millis(1));
    let archived_again = db.archive_project(&p.id).unwrap();

    assert_eq!(
        archived_again.rev, archived.rev,
        "re-archiving an already-archived project must not advance rev"
    );
}

#[test]
fn reordering_projects_back_to_their_current_positions_does_not_bump_rev() {
    // M6: a drag-and-drop that lands back on the same order must be a
    // true no-op for rev, not just for sort_order's stored value.
    let db = db();
    let a = a_project(&db, "A");
    let b = a_project(&db, "B");
    let before_a = db.get_project(&a.id).unwrap().unwrap();
    let before_b = db.get_project(&b.id).unwrap().unwrap();

    std::thread::sleep(std::time::Duration::from_millis(1));
    let reordered = db
        .reorder_projects(&[a.id.clone(), b.id.clone()])
        .unwrap();

    let after_a = reordered.iter().find(|p| p.id == a.id).unwrap();
    let after_b = reordered.iter().find(|p| p.id == b.id).unwrap();
    assert_eq!(
        after_a.rev, before_a.rev,
        "a project whose position did not change must not advance rev"
    );
    assert_eq!(
        after_b.rev, before_b.rev,
        "a project whose position did not change must not advance rev"
    );
    assert_eq!(after_a.updated_at, before_a.updated_at);
    assert_eq!(after_b.updated_at, before_b.updated_at);
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
fn reorder_projects_ignores_deleted_projects_in_the_active_set() {
    // reorder_projects treats "every archived_at IS NULL row" as the active
    // set it must be handed exactly. A deleted-but-not-archived project must
    // not join that set, or reordering would demand callers name an id they
    // can no longer see anywhere.
    let db = db();
    let a = a_project(&db, "A");
    let b = a_project(&db, "B");
    db.delete_project(&a.id).unwrap();

    let reordered = db.reorder_projects(&[b.id.clone()]).unwrap();
    assert_eq!(
        reordered.into_iter().map(|p| p.id).collect::<Vec<_>>(),
        vec![b.id]
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
fn set_task_status_on_a_tombstoned_task_errors_and_does_not_touch_the_row() {
    // I2: set_task_status used to be a silent no-op on a tombstoned task —
    // no deleted_at guard, no changed==0 check, unlike every sibling
    // mutation in this file. It still wrote to the row (bumping rev, moving
    // updated_at) while reporting success for a write that changed nothing
    // real. This test proves both halves: the call now errors, AND the
    // underlying row is untouched by it (rev/updated_at/status all
    // unchanged), which a "just filter reads" fix would not guarantee.
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("rabta.db");
    let db = Db::open(&path, DbConfig::default()).unwrap();
    let p = a_project(&db, "omnibus");
    let t = db
        .create_task(NewTask {
            project_id: p.id.clone(),
            title: "t".into(),
        })
        .unwrap();
    db.delete_task(&t.id).unwrap();

    let external = rusqlite::Connection::open(&path).unwrap();
    let before: (String, String, i64) = external
        .query_row(
            "SELECT status, updated_at, rev FROM tasks WHERE id = ?1",
            rusqlite::params![t.id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .unwrap();
    std::thread::sleep(std::time::Duration::from_millis(1));

    let result = db.set_task_status(&t.id, TaskStatus::Done);

    assert!(
        matches!(result, Err(DbError::NotFound { entity: "task", .. })),
        "set_task_status on a tombstoned task must error, got {result:?}"
    );
    assert!(db.get_task(&t.id).unwrap().is_none());
    assert!(db.list_tasks(&p.id).unwrap().is_empty());

    let after: (String, String, i64) = external
        .query_row(
            "SELECT status, updated_at, rev FROM tasks WHERE id = ?1",
            rusqlite::params![t.id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .unwrap();
    assert_eq!(
        after, before,
        "a refused write must not touch status, updated_at, or rev"
    );
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
fn duplicate_task_excludes_removed_resources_to_prevent_resurrection() {
    // Regression test: a previous fix added AND deleted_at IS NULL to the
    // resource-copy query in duplicate_task. Without this filter, duplicating
    // a task would resurrect resources the user had explicitly removed via
    // remove_task_resource, causing information loss.
    //
    // This test proves the filter works: create a task with three resources,
    // remove one, duplicate the task, and assert the duplicate contains only
    // the two remaining resources (not the removed one).
    let db = db();
    let p = a_project(&db, "Rabta");
    let source = db
        .create_task(NewTask {
            project_id: p.id,
            title: "Original".into(),
        })
        .unwrap();

    // Attach three resources in order.
    let resources = [
        ("git", "branch", json!({"branch": "main"})),
        ("chrome", "tabs", json!({"urls": ["https://example.com"]})),
        ("vscode", "workspace", json!({"openFiles": ["a.ts"]})),
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
    assert_eq!(resources.len(), 3);
    assert_eq!(db.task_resources(&source.id).unwrap().len(), 3);

    // Remove the middle resource (chrome tabs).
    db.remove_task_resource(&resources[1].id).unwrap();
    assert_eq!(
        db.task_resources(&source.id).unwrap().len(),
        2,
        "removed resource must disappear from the read path"
    );

    // Duplicate the task.
    let copy = db.duplicate_task(&source.id).unwrap();
    let copied_resources = db.task_resources(&copy.id).unwrap();

    // The duplicate must contain exactly the two remaining resources in their
    // original order, and must NOT contain the removed (chrome tabs) resource.
    assert_eq!(
        copied_resources.len(),
        2,
        "duplicate must contain only the non-removed resources"
    );

    // Assert the remaining resources are git and vscode, in order.
    assert_eq!(copied_resources[0].connector_kind, "git");
    assert_eq!(copied_resources[0].resource_type, "branch");
    assert_eq!(copied_resources[0].payload, json!({"branch": "main"}));

    assert_eq!(copied_resources[1].connector_kind, "vscode");
    assert_eq!(copied_resources[1].resource_type, "workspace");
    assert_eq!(
        copied_resources[1].payload,
        json!({"openFiles": ["a.ts"]})
    );

    // Verify chrome resource is truly absent.
    assert!(
        !copied_resources
            .iter()
            .any(|r| r.connector_kind == "chrome"),
        "removed resource must not be resurrected in the duplicate"
    );
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
fn delete_task_does_not_touch_an_already_tombstoned_projects_last_task_id() {
    // M5: delete_task's `UPDATE projects SET last_task_id = NULL ...` had
    // no `deleted_at IS NULL` guard, so it would bump rev/updated_at on an
    // already-tombstoned project that happens to still reference the task
    // being deleted. A tombstoned project is invisible to every read path,
    // so touching it here is pure noise on rev — exactly the thing this
    // whole branch exists to keep trustworthy.
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("rabta.db");
    let db = Db::open(&path, DbConfig::default()).unwrap();
    let p = a_project(&db, "omnibus");
    let t = db
        .create_task(NewTask {
            project_id: p.id.clone(),
            title: "t".into(),
        })
        .unwrap();

    let external = rusqlite::Connection::open(&path).unwrap();
    // Point the project at the task, then tombstone the project directly —
    // reproducing "a project that is already deleted while still
    // referencing this task" without relying on delete_project (which must
    // remain independently testable/safe).
    external
        .execute(
            "UPDATE projects SET last_task_id = ?2 WHERE id = ?1",
            rusqlite::params![p.id, t.id],
        )
        .unwrap();
    external
        .execute(
            "UPDATE projects SET deleted_at = ?2 WHERE id = ?1",
            rusqlite::params![p.id, "2026-01-01T00:00:00Z"],
        )
        .unwrap();
    let before: (i64, String) = external
        .query_row(
            "SELECT rev, updated_at FROM projects WHERE id = ?1",
            rusqlite::params![p.id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    std::thread::sleep(std::time::Duration::from_millis(1));

    db.delete_task(&t.id).unwrap();

    let after: (i64, String, Option<String>) = external
        .query_row(
            "SELECT rev, updated_at, last_task_id FROM projects WHERE id = ?1",
            rusqlite::params![p.id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .unwrap();
    assert_eq!(
        after.0, before.0,
        "delete_task must not bump rev on an already-tombstoned project"
    );
    assert_eq!(
        after.1, before.1,
        "delete_task must not touch updated_at on an already-tombstoned project"
    );
    assert_eq!(
        after.2.as_deref(),
        Some(t.id.as_str()),
        "a tombstoned project's stale last_task_id is left alone, not rewritten"
    );
}

#[test]
fn delete_project_clears_its_own_last_task_id_reference() {
    // M5, other half: delete_project never cleared last_task_id, leaving a
    // tombstoned project pointing at a tombstoned task underneath it.
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("rabta.db");
    let db = Db::open(&path, DbConfig::default()).unwrap();
    let p = a_project(&db, "omnibus");
    let t = db
        .create_task(NewTask {
            project_id: p.id.clone(),
            title: "t".into(),
        })
        .unwrap();
    db.begin_project_session_for_task(&t.id, "2026-07-23T12:00:00Z")
        .unwrap();
    assert_eq!(
        db.get_project(&p.id).unwrap().unwrap().last_task_id.as_deref(),
        Some(t.id.as_str())
    );

    db.delete_project(&p.id).unwrap();

    let external = rusqlite::Connection::open(&path).unwrap();
    let last_task_id: Option<String> = external
        .query_row(
            "SELECT last_task_id FROM projects WHERE id = ?1",
            rusqlite::params![p.id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(
        last_task_id, None,
        "delete_project must clear last_task_id, not leave it pointing at a tombstoned task"
    );
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
fn deleting_project_tombstones_its_tasks_and_their_resources_and_pins() {
    // Tombstoning (not hard-deleting) means the row survives with deleted_at
    // set. M1: task_resources/task_pins reads are now filtered by
    // deleted_at too (P0-T4 and P0-T5 landed), so this asserts both halves
    // for every table the delete cascades touch: disappearance from the
    // normal read path, and survival as a tombstone underneath it.
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("rabta.db");
    let db = Db::open(&path, DbConfig::default()).unwrap();
    let p = a_project(&db, "omnibus");
    let t = db
        .create_task(NewTask {
            project_id: p.id.clone(),
            title: "t".into(),
        })
        .unwrap();
    let resource = db
        .add_task_resource(NewTaskResource {
            task_id: t.id.clone(),
            connector_kind: "fake".into(),
            resource_type: "file".into(),
            payload: json!({"path": "src/main.ts"}),
        })
        .unwrap();
    let pin = db
        .add_task_pin(&t.id, "chrome", "https://a.test/", &json!({"a": 1}))
        .unwrap();

    db.delete_project(&p.id).unwrap();

    assert!(db.list_tasks(&p.id).unwrap().is_empty());
    assert!(db.get_task(&t.id).unwrap().is_none());
    assert!(
        db.task_resources(&t.id).unwrap().is_empty(),
        "task_resources read path must not show a resource under a deleted project's task"
    );
    assert!(
        db.task_pins(&t.id).unwrap().is_empty(),
        "task_pins read path must not show a pin under a deleted project's task"
    );

    let external = rusqlite::Connection::open(&path).unwrap();
    let task_deleted: Option<String> = external
        .query_row(
            "SELECT deleted_at FROM tasks WHERE id = ?1",
            rusqlite::params![t.id],
            |r| r.get(0),
        )
        .unwrap();
    assert!(
        task_deleted.is_some(),
        "task must survive as a tombstone, not vanish"
    );

    let resource_deleted: Option<String> = external
        .query_row(
            "SELECT deleted_at FROM task_resources WHERE id = ?1",
            rusqlite::params![resource.id],
            |r| r.get(0),
        )
        .unwrap();
    assert!(
        resource_deleted.is_some(),
        "resource must be tombstoned, not hard-deleted, when its project is deleted"
    );

    let pin_deleted: Option<String> = external
        .query_row(
            "SELECT deleted_at FROM task_pins WHERE id = ?1",
            rusqlite::params![pin.id],
            |r| r.get(0),
        )
        .unwrap();
    assert!(
        pin_deleted.is_some(),
        "pin must be tombstoned, not hard-deleted, when its project is deleted"
    );
}

#[test]
fn a_deleted_project_disappears_from_every_read_path() {
    let db = db();
    let p = a_project(&db, "Atlas");
    db.delete_project(&p.id).unwrap();

    assert!(db.list_projects().unwrap().iter().all(|x| x.id != p.id));
    assert!(db.get_project(&p.id).unwrap().is_none());
    assert!(db
        .list_archived_projects()
        .unwrap()
        .iter()
        .all(|x| x.id != p.id));
}

#[test]
fn deleting_a_project_keeps_the_row_as_a_tombstone() {
    // The whole point: "deleted here" must stay distinguishable from "never
    // arrived", or a later transfer cheerfully resurrects it.
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("rabta.db");
    let db = Db::open(&path, DbConfig::default()).unwrap();
    let p = a_project(&db, "Atlas");
    db.delete_project(&p.id).unwrap();

    let external = rusqlite::Connection::open(&path).unwrap();
    let (count, deleted_at): (i64, Option<String>) = external
        .query_row(
            "SELECT COUNT(*), MAX(deleted_at) FROM projects WHERE id = ?1",
            rusqlite::params![p.id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(count, 1, "the row must survive as a tombstone");
    assert!(deleted_at.is_some());
}

#[test]
fn a_deleted_task_disappears_from_every_read_path() {
    let db = db();
    let p = a_project(&db, "Atlas");
    let t = db
        .create_task(NewTask {
            project_id: p.id.clone(),
            title: "Wire the reconnect".into(),
        })
        .unwrap();
    db.delete_task(&t.id).unwrap();

    assert!(db.list_tasks(&p.id).unwrap().iter().all(|x| x.id != t.id));
    assert!(db.get_task(&t.id).unwrap().is_none());
}

#[test]
fn deleting_a_task_keeps_the_row_as_a_tombstone() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("rabta.db");
    let db = Db::open(&path, DbConfig::default()).unwrap();
    let p = a_project(&db, "Atlas");
    let t = db
        .create_task(NewTask {
            project_id: p.id.clone(),
            title: "Wire the reconnect".into(),
        })
        .unwrap();
    db.delete_task(&t.id).unwrap();

    let external = rusqlite::Connection::open(&path).unwrap();
    let (count, deleted_at): (i64, Option<String>) = external
        .query_row(
            "SELECT COUNT(*), MAX(deleted_at) FROM tasks WHERE id = ?1",
            rusqlite::params![t.id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(count, 1, "the row must survive as a tombstone");
    assert!(deleted_at.is_some());
}

#[test]
fn deleting_a_task_tombstones_its_resources_and_pins_without_hard_deleting_them() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("rabta.db");
    let db = Db::open(&path, DbConfig::default()).unwrap();
    let p = a_project(&db, "omnibus");
    let t = db
        .create_task(NewTask {
            project_id: p.id.clone(),
            title: "t".into(),
        })
        .unwrap();
    let resource = db
        .add_task_resource(NewTaskResource {
            task_id: t.id.clone(),
            connector_kind: "fake".into(),
            resource_type: "file".into(),
            payload: json!({"path": "src/main.ts"}),
        })
        .unwrap();
    let pin = db
        .add_task_pin(&t.id, "chrome", "https://a.test/", &json!({"a": 1}))
        .unwrap();

    db.delete_task(&t.id).unwrap();

    let external = rusqlite::Connection::open(&path).unwrap();
    let resource_deleted: Option<String> = external
        .query_row(
            "SELECT deleted_at FROM task_resources WHERE id = ?1",
            rusqlite::params![resource.id],
            |r| r.get(0),
        )
        .unwrap();
    assert!(
        resource_deleted.is_some(),
        "resource must be tombstoned, not left live and not hard-deleted"
    );

    let pin_deleted: Option<String> = external
        .query_row(
            "SELECT deleted_at FROM task_pins WHERE id = ?1",
            rusqlite::params![pin.id],
            |r| r.get(0),
        )
        .unwrap();
    assert!(
        pin_deleted.is_some(),
        "pin must be tombstoned, not left live and not hard-deleted"
    );
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
fn removing_one_resource_leaves_a_tombstone() {
    // User intent — "I do not want this file in this capsule" — must survive
    // as a tombstone, not vanish, so a later merge can tell removed-here from
    // never-arrived.
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("rabta.db");
    let db = Db::open(&path, DbConfig::default()).unwrap();
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

    db.remove_task_resource(&r.id).unwrap();

    // Disappears from the read path...
    assert!(db.task_resources(&t.id).unwrap().is_empty());

    // ...but the row survives as a tombstone underneath.
    let external = rusqlite::Connection::open(&path).unwrap();
    let (deleted_at, rev): (Option<String>, i64) = external
        .query_row(
            "SELECT deleted_at, rev FROM task_resources WHERE id = ?1",
            rusqlite::params![r.id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert!(
        deleted_at.is_some(),
        "removed resource must be tombstoned, not hard-deleted"
    );
    assert_eq!(rev, 1, "tombstoning must bump rev");
}

#[test]
fn replace_task_resources_refuses_a_tombstoned_parent_task() {
    // C1: save_capsule/replace_task_resources took no liveness check on the
    // parent task. Proven at HEAD: delete_task(t) then
    // replace_task_resources(t, ...) leaves a LIVE task_resources row under a
    // tombstoned task, resurrecting exactly what delete_task tombstoned.
    let db = db();
    let p = a_project(&db, "omnibus");
    let t = db
        .create_task(NewTask {
            project_id: p.id.clone(),
            title: "t".into(),
        })
        .unwrap();
    db.delete_task(&t.id).unwrap();

    let result = db.replace_task_resources(&t.id, "vscode", "workspace", &json!({"openFiles": []}));

    assert!(
        matches!(result, Err(DbError::NotFound { entity: "task", .. })),
        "replace_task_resources must refuse a tombstoned parent task, got {result:?}"
    );

    // And no live row was left behind under the tombstoned task.
    assert!(
        db.task_resources(&t.id).unwrap().is_empty(),
        "no live resource row may exist under a tombstoned task"
    );
}

#[test]
fn add_task_pin_refuses_a_tombstoned_parent_task() {
    // C1, other half: add_task_pin's ON CONFLICT DO UPDATE clears deleted_at
    // with no parent-liveness check, reviving a pin on a deleted task.
    let db = db();
    let p = a_project(&db, "omnibus");
    let t = db
        .create_task(NewTask {
            project_id: p.id.clone(),
            title: "t".into(),
        })
        .unwrap();
    db.delete_task(&t.id).unwrap();

    let result = db.add_task_pin(&t.id, "chrome", "https://a.test/", &json!({"a": 1}));

    assert!(
        matches!(result, Err(DbError::NotFound { entity: "task", .. })),
        "add_task_pin must refuse a tombstoned parent task, got {result:?}"
    );
    assert!(
        db.task_pins(&t.id).unwrap().is_empty(),
        "no live pin row may exist under a tombstoned task"
    );
}

#[test]
fn add_task_pin_reviving_a_tombstoned_pin_still_requires_a_live_parent_task() {
    // The trickier path: pin, unpin (tombstones the pin row), delete the
    // task, then try to re-pin the same identity. The ON CONFLICT DO UPDATE
    // path must also be blocked, not just the plain insert path.
    let db = db();
    let p = a_project(&db, "omnibus");
    let t = db
        .create_task(NewTask {
            project_id: p.id.clone(),
            title: "t".into(),
        })
        .unwrap();
    db.add_task_pin(&t.id, "chrome", "https://a.test/", &json!({"a": 1}))
        .unwrap();
    assert!(db
        .remove_task_pin(&t.id, "chrome", "https://a.test/")
        .unwrap());
    db.delete_task(&t.id).unwrap();

    let result = db.add_task_pin(&t.id, "chrome", "https://a.test/", &json!({"a": 2}));

    assert!(
        matches!(result, Err(DbError::NotFound { entity: "task", .. })),
        "re-pinning a tombstoned pin under a tombstoned task must still fail, got {result:?}"
    );
}

#[test]
fn recapturing_does_not_accumulate_rows() {
    // A snapshot replaced 50 times must not leave 50 generations behind —
    // replace purges prior rows (live and tombstoned) for that
    // (task_id, connector_kind) rather than tombstoning them. M3: the true
    // invariant is exactly one surviving row per (task, kind), not merely
    // "some small bound" — and the "purges already-tombstoned rows" clause
    // in replace_task_resources's doc comment needs a tombstoned row to
    // exist before the loop starts, or that clause is never actually
    // exercised.
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("rabta.db");
    let db = Db::open(&path, DbConfig::default()).unwrap();
    let p = a_project(&db, "omnibus");
    let t = db
        .create_task(NewTask {
            project_id: p.id.clone(),
            title: "t".into(),
        })
        .unwrap();

    // A tombstoned row for this exact (task_id, connector_kind), predating
    // the loop below. Without the un-filtered DELETE inside
    // replace_task_resources (i.e. if it only purged live rows), this row
    // would survive every subsequent replace as an orphaned tombstone.
    let stale = db
        .add_task_resource(NewTaskResource {
            task_id: t.id.clone(),
            connector_kind: "vscode".into(),
            resource_type: "workspace".into(),
            payload: json!({"openFiles": []}),
        })
        .unwrap();
    db.remove_task_resource(&stale.id).unwrap();

    for i in 0..50 {
        db.replace_task_resources(
            &t.id,
            "vscode",
            "workspace",
            &json!({"openFiles": [format!("file{i}.ts")]}),
        )
        .unwrap();
    }

    // Count every row for this task directly, tombstoned or not — the read
    // path already filters deleted_at, so only a raw count can catch rows
    // left behind as unbounded (or merely stale) tombstones.
    let external = rusqlite::Connection::open(&path).unwrap();
    let total: i64 = external
        .query_row(
            "SELECT COUNT(*) FROM task_resources WHERE task_id = ?1",
            rusqlite::params![t.id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(
        total, 1,
        "replace must supersede down to exactly one row per (task, kind), including purging \
         the pre-existing tombstone: found {total} rows"
    );
}

#[test]
fn recapturing_bumps_the_parent_task_rev() {
    // The capsule's contents changed; the task (not the resource row) is the
    // thing whose rev a later merge should look at.
    let db = db();
    let p = a_project(&db, "omnibus");
    let t = db
        .create_task(NewTask {
            project_id: p.id.clone(),
            title: "t".into(),
        })
        .unwrap();
    let before = db.get_task(&t.id).unwrap().unwrap();
    assert_eq!(before.rev, 0);

    // I5: nanosecond-precision `now()` (chrono's to_rfc3339) makes a strict
    // `>` safe and non-flaky here — a `>=` assertion is satisfied by
    // equality and so cannot catch a fix that stops touching updated_at at
    // all. A short sleep still keeps this robust against any future
    // reduction in clock precision.
    std::thread::sleep(std::time::Duration::from_millis(1));
    db.replace_task_resources(&t.id, "vscode", "workspace", &json!({"openFiles": []}))
        .unwrap();

    let after = db.get_task(&t.id).unwrap().unwrap();
    assert_eq!(after.rev, 1, "replace must bump the parent task's rev");
    assert!(
        after.updated_at > before.updated_at,
        "replace must bump the parent task's updated_at, but got {} <= {}",
        after.updated_at,
        before.updated_at
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

#[test]
fn task_pins_upsert_list_and_remove() {
    let db = db();
    let p = a_project(&db, "omnibus");
    let task = db
        .create_task(NewTask {
            project_id: p.id.clone(),
            title: "t".into(),
        })
        .unwrap();

    let pin = db
        .add_task_pin(
            &task.id,
            "chrome",
            "https://a.test/",
            &json!({"url": "https://a.test/", "title": "A"}),
        )
        .unwrap();
    assert_eq!(pin.identity, "https://a.test/");

    // Re-pinning the same identity replaces the payload rather than duplicating.
    db.add_task_pin(
        &task.id,
        "chrome",
        "https://a.test/",
        &json!({"url": "https://a.test/", "title": "A renamed"}),
    )
    .unwrap();
    let pins = db.task_pins(&task.id).unwrap();
    assert_eq!(pins.len(), 1, "re-pinning must not duplicate: {pins:?}");
    assert_eq!(pins[0].payload["title"], "A renamed");

    // Same identity under a different connector kind is a different pin.
    db.add_task_pin(
        &task.id,
        "vscode",
        "https://a.test/",
        &json!({"path": "/x"}),
    )
    .unwrap();
    assert_eq!(db.task_pins(&task.id).unwrap().len(), 2);

    assert!(db
        .remove_task_pin(&task.id, "chrome", "https://a.test/")
        .unwrap());
    assert!(!db
        .remove_task_pin(&task.id, "chrome", "https://a.test/")
        .unwrap());
    assert_eq!(db.task_pins(&task.id).unwrap().len(), 1);
}

#[test]
fn an_unpinned_item_stays_unpinned() {
    // Removing a pin must tombstone the row (deleted_at set), not hard-delete
    // it — a hard delete is exactly what would let a pin the user
    // deliberately removed come back from a transfer to a new Mac.
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("rabta.db");
    let db = Db::open(&path, DbConfig::default()).unwrap();
    let p = a_project(&db, "omnibus");
    let task = db
        .create_task(NewTask {
            project_id: p.id.clone(),
            title: "t".into(),
        })
        .unwrap();
    let pin = db
        .add_task_pin(
            &task.id,
            "chrome",
            "https://a.test/",
            &json!({"url": "https://a.test/", "title": "A"}),
        )
        .unwrap();

    assert!(db
        .remove_task_pin(&task.id, "chrome", "https://a.test/")
        .unwrap());

    // Absent from the read path.
    assert!(
        db.task_pins(&task.id).unwrap().is_empty(),
        "an unpinned item must not appear in task_pins reads"
    );

    // But the row itself survives, tombstoned.
    let external = rusqlite::Connection::open(&path).unwrap();
    let deleted_at: Option<String> = external
        .query_row(
            "SELECT deleted_at FROM task_pins WHERE id = ?1",
            rusqlite::params![pin.id],
            |r| r.get(0),
        )
        .unwrap();
    assert!(
        deleted_at.is_some(),
        "the removed pin must survive as a tombstone, not be hard-deleted"
    );
}

#[test]
fn re_pinning_revives_the_tombstone_rather_than_duplicating() {
    // pin -> unpin -> pin again. This must revive the tombstoned row (clear
    // deleted_at, bump rev) rather than either (a) insert a second row for
    // the same (task_id, connector_kind, identity), which would look fine
    // until a restore opened something twice, or (b) silently no-op and
    // leave the tombstone dead, which would mean re-pinning does nothing.
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("rabta.db");
    let db = Db::open(&path, DbConfig::default()).unwrap();
    let p = a_project(&db, "omnibus");
    let task = db
        .create_task(NewTask {
            project_id: p.id.clone(),
            title: "t".into(),
        })
        .unwrap();

    let first = db
        .add_task_pin(
            &task.id,
            "chrome",
            "https://a.test/",
            &json!({"url": "https://a.test/", "title": "A"}),
        )
        .unwrap();

    assert!(db
        .remove_task_pin(&task.id, "chrome", "https://a.test/")
        .unwrap());

    let second = db
        .add_task_pin(
            &task.id,
            "chrome",
            "https://a.test/",
            &json!({"url": "https://a.test/", "title": "A again"}),
        )
        .unwrap();

    // Discriminator 1: exactly one row for this identity, live or dead. This
    // alone would NOT catch a no-op revival (the tombstoned row would still
    // be the only row), so it is not sufficient by itself — see below.
    let external = rusqlite::Connection::open(&path).unwrap();
    let count: i64 = external
        .query_row(
            "SELECT COUNT(*) FROM task_pins WHERE task_id = ?1 AND connector_kind = ?2 AND identity = ?3",
            rusqlite::params![task.id, "chrome", "https://a.test/"],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(count, 1, "re-pinning must revive, not duplicate");

    // Discriminator 2: the revived row must be the SAME row (same id), not a
    // freshly minted one.
    assert_eq!(
        second.id, first.id,
        "re-pinning after removal must revive the original row's id"
    );

    // Discriminator 3: the row must actually be live again (deleted_at
    // cleared). This is what catches a no-op revival — a no-op would still
    // pass the count check above, because the dead row alone satisfies
    // COUNT = 1.
    let deleted_at: Option<String> = external
        .query_row(
            "SELECT deleted_at FROM task_pins WHERE id = ?1",
            rusqlite::params![first.id],
            |r| r.get(0),
        )
        .unwrap();
    assert!(
        deleted_at.is_none(),
        "a revived pin must have deleted_at cleared, not stay tombstoned"
    );

    // Discriminator 4: rev must have advanced past the tombstone write, so a
    // later merge can tell "revived" from "never touched again".
    assert!(
        second.rev > first.rev,
        "reviving a tombstoned pin must bump rev"
    );

    // And, from the ordinary read path: exactly one live pin, with the
    // re-pinned payload.
    let pins = db.task_pins(&task.id).unwrap();
    assert_eq!(pins.len(), 1, "exactly one live pin must be visible");
    assert_eq!(pins[0].id, first.id);
    assert_eq!(pins[0].payload["title"], "A again");
}

#[test]
fn re_pinning_returns_the_existing_rows_id_and_created_at() {
    let db = db();
    let p = a_project(&db, "omnibus");
    let task = db
        .create_task(NewTask {
            project_id: p.id.clone(),
            title: "t".into(),
        })
        .unwrap();

    let first = db
        .add_task_pin(
            &task.id,
            "chrome",
            "https://a.test/",
            &json!({"url": "https://a.test/", "title": "A"}),
        )
        .unwrap();

    // Re-pin the same identity with a different payload. The row is updated
    // in place (ON CONFLICT DO UPDATE), so the id and created_at must come
    // from the existing row, not from a freshly minted id()/now() pair.
    let second = db
        .add_task_pin(
            &task.id,
            "chrome",
            "https://a.test/",
            &json!({"url": "https://a.test/", "title": "A renamed"}),
        )
        .unwrap();

    assert_eq!(
        second.id, first.id,
        "re-pin must return the existing row's id, not a fabricated one"
    );
    assert_eq!(
        second.created_at, first.created_at,
        "re-pin must return the existing row's created_at, not a fabricated one"
    );

    let stored = &db.task_pins(&task.id).unwrap()[0];
    assert_eq!(stored.id, first.id, "returned id must match the stored row");
    assert_eq!(
        stored.created_at, first.created_at,
        "returned created_at must match the stored row"
    );
}

#[test]
fn every_update_bumps_rev_and_touches_updated_at() {
    // rev is a local monotonic counter, not a clock — it is what a later
    // merge can trust when wall clocks between two Macs disagree. Every
    // real mutation to a row in the four tables migration 005 touched
    // must advance that row's rev by exactly one.
    let db = db();
    let p = a_project(&db, "Atlas");
    assert_eq!(p.rev, 0);

    // I5: strict `>` — nanosecond-precision now() makes this safe, and a
    // `>=` here is satisfied by equality, so it cannot catch a fix that
    // stops touching updated_at at all.
    std::thread::sleep(std::time::Duration::from_millis(1));
    let renamed = db.rename_project(&p.id, "Atlas API").unwrap();
    assert_eq!(renamed.rev, 1, "rename_project must advance rev by one");
    assert!(
        renamed.updated_at > p.updated_at,
        "rename_project must bump updated_at, but got {} <= {}",
        renamed.updated_at,
        p.updated_at
    );

    let iconed = db.set_project_icon(&p.id, Some("rocket")).unwrap();
    assert_eq!(iconed.rev, 2, "set_project_icon must advance rev by one");

    let archived = db.archive_project(&p.id).unwrap();
    assert_eq!(archived.rev, 3, "archive_project must advance rev by one");

    let unarchived = db.unarchive_project(&p.id).unwrap();
    assert_eq!(unarchived.rev, 4, "unarchive_project must advance rev by one");

    // M6: reorder_projects only bumps rev/updated_at for a row whose
    // position genuinely changes, so this step needs a real change to
    // exercise that — a second project, with p actually moving from
    // position 0 to position 1 (not [p.id] alone, which would leave p's
    // sole position at 0 and so, correctly, bump nothing).
    let q = a_project(&db, "Zulu");
    let before_reorder = unarchived.updated_at.clone();
    std::thread::sleep(std::time::Duration::from_millis(1));
    db.reorder_projects(&[q.id.clone(), p.id.clone()]).unwrap();
    let reordered = db.get_project(&p.id).unwrap().unwrap();
    assert_eq!(reordered.sort_order, 1, "sanity: p must have actually moved");
    assert_eq!(
        reordered.rev, 5,
        "reorder_projects genuinely changing sort_order must advance rev"
    );
    assert!(
        reordered.updated_at > before_reorder,
        "reorder_projects must update updated_at, but got {} <= {}",
        reordered.updated_at,
        before_reorder
    );

    let task = db
        .create_task(NewTask {
            project_id: p.id.clone(),
            title: "Ship".into(),
        })
        .unwrap();
    assert_eq!(task.rev, 0);

    db.begin_project_session_for_task(&task.id, "2026-07-23T12:00:00Z")
        .unwrap();
    let after_session = db.get_project(&p.id).unwrap().unwrap();
    assert_eq!(
        after_session.rev, 6,
        "begin_project_session_for_task must advance the project's rev"
    );

    // I3: session-time accrual is metering, not an edit, and the UI
    // heartbeats every 15s — treating it as a rev-worthy mutation turned
    // projects.rev into a wall clock (~240 bumps/focused hour) while
    // tasks.rev only moves on genuine content change, making the two units
    // incomparable for a future merge. So, unlike every other case in this
    // test, add_active_seconds_for_task must NOT advance rev. updated_at
    // still moves, because the row's active_seconds genuinely changed and
    // updated_at's job is exactly to say "this row was last touched at
    // this wall-clock time" — only rev is reserved as the trusted,
    // clock-independent merge signal.
    std::thread::sleep(std::time::Duration::from_millis(1));
    db.add_active_seconds_for_task(&task.id, 5).unwrap();
    let after_seconds = db.get_project(&p.id).unwrap().unwrap();
    assert_eq!(
        after_seconds.rev, after_session.rev,
        "add_active_seconds_for_task must NOT advance the project's rev — accrual is metering, not an edit"
    );
    assert!(
        after_seconds.updated_at > after_session.updated_at,
        "add_active_seconds_for_task must still move updated_at, but got {} <= {}",
        after_seconds.updated_at,
        after_session.updated_at
    );

    let renamed_task = db.rename_task(&task.id, "Ship it").unwrap();
    assert_eq!(renamed_task.rev, 1, "rename_task must advance rev by one");

    db.set_task_status(&task.id, TaskStatus::Done).unwrap();
    let done_task = db.get_task(&task.id).unwrap().unwrap();
    assert_eq!(done_task.rev, 2, "set_task_status must advance rev by one");

    let pin = db
        .add_task_pin(
            &task.id,
            "chrome",
            "https://a.test/",
            &json!({"a": 1}),
        )
        .unwrap();
    assert_eq!(pin.rev, 0);
    let repinned = db
        .add_task_pin(
            &task.id,
            "chrome",
            "https://a.test/",
            &json!({"a": 2}),
        )
        .unwrap();
    assert_eq!(
        repinned.rev, 1,
        "re-pinning (the ON CONFLICT DO UPDATE path) must advance rev by one"
    );

    let before_delete = after_seconds.updated_at.clone();
    std::thread::sleep(std::time::Duration::from_millis(1));
    db.delete_task(&task.id).unwrap();
    let after_delete = db.get_project(&p.id).unwrap().unwrap();
    assert_eq!(
        after_delete.rev,
        after_seconds.rev + 1,
        "clearing last_task_id on delete_task must advance the project's rev"
    );
    assert!(
        after_delete.updated_at > before_delete,
        "delete_task must update updated_at (when clearing last_task_id), but got {} <= {}",
        after_delete.updated_at,
        before_delete
    );
}

#[test]
fn task_pin_identity_containing_a_nul_byte_round_trips() {
    // A vscode terminal's identity is `name + NUL + cwd` (see
    // capsules::identity_of on the desktop side) — NUL is chosen as the
    // separator specifically because it cannot occur in either field. Prove
    // sqlite storage and the exact-match SELECT/DELETE comparisons carry the
    // whole byte string through intact rather than truncating at the NUL,
    // the way a naive C-string-style comparison would.
    let db = db();
    let p = a_project(&db, "omnibus");
    let task = db
        .create_task(NewTask {
            project_id: p.id.clone(),
            title: "t".into(),
        })
        .unwrap();

    let identity = "zsh\0/repo";
    let pin = db
        .add_task_pin(
            &task.id,
            "vscode",
            identity,
            &json!({"name": "zsh", "cwd": "/repo"}),
        )
        .unwrap();
    assert_eq!(
        pin.identity, identity,
        "the NUL byte and everything after it must survive the insert round trip"
    );

    let pins = db.task_pins(&task.id).unwrap();
    assert_eq!(pins.len(), 1);
    assert_eq!(
        pins[0].identity, identity,
        "NUL byte must survive storage intact"
    );

    // A truncating comparison (anything that treats NUL as a C-string
    // terminator) would match on "zsh" alone. It must not: the byte after
    // the NUL is part of the identity, so a lookup missing it is a
    // *different* pin and must not remove the real one.
    assert!(
        !db.remove_task_pin(&task.id, "vscode", "zsh").unwrap(),
        "a truncated identity must not match the NUL-containing one"
    );
    assert_eq!(
        db.task_pins(&task.id).unwrap().len(),
        1,
        "the real pin must still be there after the truncated lookup"
    );

    assert!(
        db.remove_task_pin(&task.id, "vscode", identity).unwrap(),
        "remove must match the full identity including the bytes after the NUL"
    );
    assert!(db.task_pins(&task.id).unwrap().is_empty());
}
