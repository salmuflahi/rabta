//! Persistent storage for OmniBus: SQLite behind a small typed API.
//! Sibling to `omnibus-hub` — the hub never depends on this crate;
//! composition happens in the desktop app and the headless example.
use std::path::Path;
use std::sync::{Arc, Mutex};

use rusqlite::{params, Connection, OptionalExtension};

/// Embedded migrations, applied in order via SQLite's `user_version`.
const MIGRATIONS: &[&str] = &[
    include_str!("../migrations/001_init.sql"),
    include_str!("../migrations/002_track_b_core.sql"),
    include_str!("../migrations/003_connector_version.sql"),
    include_str!("../migrations/004_task_pins.sql"),
    include_str!("../migrations/005_data_foundations.sql"),
];

mod activity;
pub use activity::{EventRow, KnownConnector};

mod records;
pub use records::{
    NewProject, NewTask, NewTaskResource, Project, Task, TaskPin, TaskResource, TaskStatus,
    PROJECT_ICONS,
};

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
    #[error("{entity} not found: {id}")]
    NotFound { entity: &'static str, id: String },
    #[error("{field}: {message}")]
    Validation {
        field: &'static str,
        message: String,
    },
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
        Ok(Db {
            conn: Arc::new(Mutex::new(conn)),
            cfg,
        })
    }

    /// Number of applied migrations (SQLite `user_version`).
    pub fn schema_version(&self) -> Result<i64> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        Ok(conn.query_row("PRAGMA user_version", [], |r| r.get(0))?)
    }

    /// A UUIDv4 identifying this installation, generated on first use and
    /// stable thereafter.
    ///
    /// This is a per-database fact, not a per-user one — it says "this Mac",
    /// never "this person". Nothing transmits it; it exists so that a record
    /// can later be attributed to the machine that created it, which is what
    /// the Migrate flow's collision review needs in order to tell you what
    /// came from where.
    pub fn install_id(&self) -> Result<String> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if let Some(existing) = conn
            .query_row(
                "SELECT value FROM db_meta WHERE key = 'install_id'",
                [],
                |r| r.get::<_, String>(0),
            )
            .optional()?
        {
            return Ok(existing);
        }
        let fresh = new_id();
        // INSERT OR IGNORE, then re-read: two threads racing first use must
        // agree on one value rather than each returning its own.
        conn.execute(
            "INSERT OR IGNORE INTO db_meta (key, value) VALUES ('install_id', ?1)",
            params![fresh],
        )?;
        Ok(conn.query_row(
            "SELECT value FROM db_meta WHERE key = 'install_id'",
            [],
            |r| r.get(0),
        )?)
    }

    /// Whether a table exists — used by tests and sanity checks.
    pub fn table_exists(&self, name: &str) -> Result<bool> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
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

        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(
            version, 1,
            "user_version must not advance past the last good migration"
        );

        let also_good_exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'also_good'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            also_good_exists, 0,
            "also_good must not exist after a rolled-back migration"
        );
    }

    #[test]
    fn schema_too_new_errors() {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "user_version", 99i64).unwrap();

        let migrations: &[&str] = &["CREATE TABLE good (id TEXT);"];
        let result = apply_migrations(&conn, migrations);
        assert!(matches!(result, Err(DbError::SchemaTooNew(99))));
    }

    #[test]
    fn migration_two_preserves_version_one_records() {
        let file = tempfile::NamedTempFile::new().unwrap();
        let path = file.path().to_path_buf();
        let conn = Connection::open(&path).unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        apply_migrations(&conn, &MIGRATIONS[..1]).unwrap();
        conn.execute(
            "INSERT INTO projects
             (id, name, repo_path, dev_url, default_branch, created_at, updated_at)
             VALUES ('p1', 'Rabta', '/tmp/rabta', NULL, 'main', '2026-01-01', '2026-01-01')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO tasks (id, project_id, title, status, created_at, updated_at)
             VALUES ('t1', 'p1', 'Ship', 'open', '2026-01-01', '2026-01-01')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO task_resources
             (id, task_id, connector_kind, resource_type, payload, created_at)
             VALUES ('r1', 't1', 'git', 'branch', '{\"branch\":\"main\"}', '2026-01-01')",
            [],
        )
        .unwrap();

        drop(conn);
        let db = Db::open(&path, DbConfig::default()).unwrap();
        assert_eq!(db.schema_version().unwrap(), MIGRATIONS.len() as i64);

        let conn = db
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let project: (Option<String>, Option<String>, i64, i64) = conn
            .query_row(
                "SELECT icon, archived_at, active_seconds, sort_order
                 FROM projects WHERE id = 'p1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .unwrap();
        assert_eq!(project, (None, None, 0, 0));
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM tasks WHERE id = 't1'", [], |r| {
                r.get::<_, i64>(0)
            })
            .unwrap(),
            1
        );
        assert_eq!(
            conn.query_row(
                "SELECT COUNT(*) FROM task_resources WHERE id = 'r1'",
                [],
                |r| { r.get::<_, i64>(0) }
            )
            .unwrap(),
            1
        );
    }

    #[test]
    fn install_id_is_stable_across_reopen_and_unique_per_database() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("t.sqlite3");

        let first = {
            Db::open(&path, DbConfig::default())
                .unwrap()
                .install_id()
                .unwrap()
        };
        let again = {
            Db::open(&path, DbConfig::default())
                .unwrap()
                .install_id()
                .unwrap()
        };
        // Same database must keep its identity across restarts, or every launch
        // would look like a different Mac.
        assert_eq!(first, again);

        let other_dir = tempfile::tempdir().unwrap();
        let other = Db::open(&other_dir.path().join("t.sqlite3"), DbConfig::default())
            .unwrap()
            .install_id()
            .unwrap();
        assert_ne!(first, other, "a different database must be a different install");
        assert_eq!(first.len(), 36, "expected a UUIDv4 string");
    }

    #[test]
    fn migration_005_applies_to_a_database_created_at_the_previous_schema() {
        // The case that actually ships: an existing install, not a fresh build.
        let conn = Connection::open_in_memory().unwrap();
        let older: Vec<&str> = MIGRATIONS[..MIGRATIONS.len() - 1].to_vec();
        apply_migrations(&conn, &older).unwrap();
        conn.execute(
            "INSERT INTO projects (id, name, repo_path, dev_url, default_branch, created_at, updated_at)
             VALUES ('p1','Legacy','/tmp/p','', 'main', '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')",
            [],
        )
        .unwrap();

        apply_migrations(&conn, MIGRATIONS).unwrap();

        let (deleted, rev): (Option<String>, i64) = conn
            .query_row("SELECT deleted_at, rev FROM projects WHERE id='p1'", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .unwrap();
        assert_eq!(deleted, None, "an existing row must migrate as not-deleted");
        assert_eq!(rev, 0, "an existing row must start at rev 0");
    }
}
