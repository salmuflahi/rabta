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
        let conn = self.conn.lock().unwrap();
        Ok(conn.query_row("PRAGMA user_version", [], |r| r.get(0))?)
    }

    /// Whether a table exists — used by tests and sanity checks.
    pub fn table_exists(&self, name: &str) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
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
    let applied: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    for (i, sql) in MIGRATIONS.iter().enumerate().skip(applied as usize) {
        conn.execute_batch(sql)?;
        conn.pragma_update(None, "user_version", (i as i64) + 1)?;
    }
    Ok(())
}
