use rabta_db::{Db, DbConfig};

#[test]
fn migrates_fresh_database_and_is_idempotent() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("omnibus.db");

    let db = Db::open(&path, DbConfig::default()).unwrap();
    assert_eq!(db.schema_version().unwrap(), 2);
    drop(db);

    // Re-opening must not re-apply migrations or fail.
    let db = Db::open(&path, DbConfig::default()).unwrap();
    assert_eq!(db.schema_version().unwrap(), 2);
}

#[test]
fn in_memory_database_has_all_tables() {
    let db = Db::open_in_memory(DbConfig::default()).unwrap();
    for table in [
        "projects",
        "tasks",
        "task_resources",
        "connectors",
        "events",
    ] {
        assert!(db.table_exists(table).unwrap(), "missing table {table}");
    }
}
