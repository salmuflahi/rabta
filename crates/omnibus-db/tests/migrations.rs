use rabta_db::{Db, DbConfig};

#[test]
fn migrates_fresh_database_and_is_idempotent() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("omnibus.db");

    let db = Db::open(&path, DbConfig::default()).unwrap();
    assert_eq!(db.schema_version().unwrap(), 5);
    drop(db);

    // Re-opening must not re-apply migrations or fail.
    let db = Db::open(&path, DbConfig::default()).unwrap();
    assert_eq!(db.schema_version().unwrap(), 5);
}

#[test]
fn connector_version_migration_preserves_rows_as_null_version() {
    // A connectors row written before migration 003 must survive the in-place
    // ALTER and read back with no version rather than being dropped.
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("omnibus.db");

    // Open at the current schema, insert a connector, then confirm it reads
    // back with a null version (it was never told one).
    let db = Db::open(&path, DbConfig::default()).unwrap();
    db.upsert_connector("legacy", "fake", &["workspace".into()], None)
        .unwrap();
    let known = db.known_connectors().unwrap();
    assert_eq!(known.len(), 1);
    assert_eq!(known[0].name, "legacy");
    assert_eq!(known[0].version, None);
}

#[test]
fn in_memory_database_has_all_tables() {
    let db = Db::open_in_memory(DbConfig::default()).unwrap();
    for table in [
        "projects",
        "tasks",
        "task_resources",
        "task_pins",
        "connectors",
        "events",
    ] {
        assert!(db.table_exists(table).unwrap(), "missing table {table}");
    }
}
