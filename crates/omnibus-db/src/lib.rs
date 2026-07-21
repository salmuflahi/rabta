//! Persistent storage for OmniBus: SQLite behind a small typed API.
//! Sibling to `omnibus-hub` — the hub never depends on this crate;
//! composition happens in the desktop app and the headless example.
use std::path::Path;
use std::sync::{Arc, Mutex};

use rusqlite::Connection;

/// Embedded migrations, applied in order via SQLite's `user_version`.
const MIGRATIONS: &[&str] = &[include_str!("../migrations/001_init.sql")];

mod activity;
pub use activity::{EventRow, KnownConnector};

mod records;
pub use records::{NewProject, NewTask, NewTaskResource, Project, Task, TaskResource, TaskStatus};

mod recorder;
pub use recorder::Recorder;

/// Storage configuration.
#[derive(Clone)]
pub struct DbConfig {
    /// Maximum rows kept in `events`; older rows are pruned on insert.
    pub event_cap: u64,
}

impl Default for DbConfig {
    fn default() -> Self {
        Self { event_cap: 10_000 }
    }
}

/// Errors from the storage layer.
#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("database schema version {0} is newer than this build supports")]
    SchemaTooNew(i64),
}

pub type Result<T> = std::result::Result<T, DbError>;

/// Handle to the OmniBus database. Cheap to clone; single writer internally,
/// which is exactly SQLite's model.
#[derive(Clone)]
pub struct Db {
    pub(crate) conn: Arc<Mutex<Connection>>,
    pub(crate) cfg: DbConfig,
}

/// Current UTC time as ISO-8601 text — the storage timestamp format.
pub(crate) fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

/// Fresh UUID v4 string — the storage id format.
pub(crate) fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

impl Db {
    /// Opens (creating if needed) the database at `path`, enables WAL and
    /// foreign keys, and applies pending migrations.
    pub fn open(path: &Path, cfg: DbConfig) -> Result<Db> {
        let conn = Connection::open(path)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        Self::init(conn, cfg)
    }

    /// In-memory database for tests; same migrations as `open`.
    pub fn open_in_memory(cfg: DbConfig) -> Result<Db> {
        Self::init(Connection::open_in_memory()?, cfg)
    }

    fn init(conn: Connection, cfg: DbConfig) -> Result<Db> {
        conn.pragma_update(None, "foreign_keys", "ON")?;
        migrate(&conn)?;
        Ok(Db { conn: Arc::new(Mutex::new(conn)), cfg })
    }

    /// Number of applied migrations (SQLite `user_version`).
    pub fn schema_version(&self) -> Result<i64> {
        let conn = self.conn.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        Ok(conn.query_row("PRAGMA user_version", [], |r| r.get(0))?)
    }

    /// Whether a table exists — used by tests and sanity checks.
    pub fn table_exists(&self, name: &str) -> Result<bool> {
        let conn = self.conn.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
            [name],
            |r| r.get(0),
        )?;
        Ok(count > 0)
    }
}

/// Applies any migrations beyond the connection's current `user_version`.
fn migrate(conn: &Connection) -> Result<()> {
    apply_migrations(conn, MIGRATIONS)
}

/// Applies `migrations` beyond the connection's current `user_version`, in
/// order. Each migration (its SQL plus the `user_version` bump) runs inside
/// one transaction, so a failure partway through a migration rolls back that
/// migration's DDL and leaves `user_version` unchanged — the database is
/// never left half-applied. Errors if the database's recorded `user_version`
/// is already ahead of `migrations.len()` (an older build opened against a
/// newer schema).
fn apply_migrations(conn: &Connection, migrations: &[&str]) -> Result<()> {
    let applied: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if applied > migrations.len() as i64 {
        return Err(DbError::SchemaTooNew(applied));
    }
    for (i, sql) in migrations.iter().enumerate().skip(applied as usize) {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", (i as i64) + 1)?;
        tx.commit()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn broken_migration_rolls_back_and_leaves_version_unchanged() {
        let conn = Connection::open_in_memory().unwrap();
        let migrations: &[&str] = &[
            "CREATE TABLE good (id TEXT);",
            "CREATE TABLE also_good (id TEXT); THIS IS NOT SQL;",
        ];

        let result = apply_migrations(&conn, migrations);
        assert!(result.is_err(), "expected broken migration to error");

        let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(version, 1, "user_version must not advance past the last good migration");

        let also_good_exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'also_good'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(also_good_exists, 0, "also_good must not exist after a rolled-back migration");
    }

    #[test]
    fn schema_too_new_errors() {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "user_version", 99i64).unwrap();

        let migrations: &[&str] = &["CREATE TABLE good (id TEXT);"];
        let result = apply_migrations(&conn, migrations);
        assert!(matches!(result, Err(DbError::SchemaTooNew(99))));
    }
}
