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

mod bundle_apply;
pub use bundle_apply::{
    ApplyOutcome, ApplyPlan, AppNeed, Collision, InspectReport, Merge, RepoNeed,
};

mod bundle;
pub use bundle::{
    seal, unseal, Bundle, ConnectorRow, EventRowOut, Include, ProjectRow, Survey, TaskPinRow,
    TaskResourceRow, TaskRow, BUNDLE_FORMAT, BUNDLE_VERSION,
};

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

/// Looks up (creating if needed) this database's install id using an
/// already-held connection or transaction. Shared by `Db::install_id` and
/// every `records.rs` INSERT that stamps `created_by_install`, which must
/// reuse the caller's already-locked connection rather than each acquiring
/// its own — `Db::conn`'s mutex is not reentrant, so a nested `self
/// .conn.lock()` from inside a function that already holds the lock would
/// deadlock.
pub(crate) fn install_id_with_conn(conn: &Connection) -> Result<String> {
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
        install_id_with_conn(&conn)
    }

    /// A `db_meta` value, or `None` when the key was never set. Small
    /// per-database facts live here: the install id, and switches that must
    /// survive a relaunch without being preferences of the UI.
    pub fn get_meta(&self, key: &str) -> Result<Option<String>> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        match conn.query_row(
            "SELECT value FROM db_meta WHERE key = ?1",
            [key],
            |r| r.get::<_, String>(0),
        ) {
            Ok(value) => Ok(Some(value)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// Sets a `db_meta` value, replacing any earlier one.
    pub fn set_meta(&self, key: &str, value: &str) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        conn.execute(
            "INSERT INTO db_meta (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [key, value],
        )?;
        Ok(())
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

    #[test]
    fn migration_005_preserves_every_table_from_a_real_pre_migration_database() {
        // Task 6's most valuable check: the case that actually ships to
        // existing users is a database that already has rows in *all four*
        // tombstoned tables under the migration-004 schema (no deleted_at, no
        // rev columns yet) — not a freshly built database that never
        // exercises the in-place ALTERs. Build exactly that database, then
        // open it with the current binary and confirm every row survives
        // with deleted_at IS NULL and rev = 0, and that the app's normal
        // read paths (list_projects, get_project, list_tasks, get_task,
        // task_resources, task_pins) return them.
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("rabta.db");

        // Build at the schema before 005 (001..004 inclusive: init, track-b
        // core, connector version, task_pins) — before deleted_at/rev exist.
        // M2: MIGRATIONS[..MIGRATIONS.len() - 1] rather than a hardcoded
        // [..4], so this keeps covering "the schema right before the newest
        // migration" once 006 lands instead of silently freezing at 004.
        let conn = Connection::open(&path).unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        let pre_005 = &MIGRATIONS[..MIGRATIONS.len() - 1];
        apply_migrations(&conn, pre_005).unwrap();

        conn.execute(
            "INSERT INTO projects
             (id, name, repo_path, dev_url, default_branch, created_at, updated_at)
             VALUES ('p1', 'Legacy', '/tmp/legacy', NULL, 'main',
                     '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO tasks (id, project_id, title, status, created_at, updated_at)
             VALUES ('t1', 'p1', 'Ship it', 'open',
                     '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO task_resources
             (id, task_id, connector_kind, resource_type, payload, created_at)
             VALUES ('r1', 't1', 'git', 'branch', '{\"branch\":\"main\"}',
                     '2026-01-01T00:00:00Z')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO task_pins
             (id, task_id, connector_kind, identity, payload, created_at)
             VALUES ('pin1', 't1', 'chrome', 'https://example.test/', '{}',
                     '2026-01-01T00:00:00Z')",
            [],
        )
        .unwrap();
        drop(conn);

        // Open with the current binary: migration 005 applies in place.
        let db = Db::open(&path, DbConfig::default()).unwrap();
        assert_eq!(db.schema_version().unwrap(), MIGRATIONS.len() as i64);

        // Raw check: every row survived with deleted_at IS NULL and rev = 0.
        {
            let conn = db
                .conn
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            let (deleted_at, rev): (Option<String>, i64) = conn
                .query_row(
                    "SELECT deleted_at, rev FROM projects WHERE id = 'p1'",
                    [],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .unwrap();
            assert_eq!(deleted_at, None, "projects row must migrate as not-deleted");
            assert_eq!(rev, 0, "projects row must start at rev 0");

            let (deleted_at, rev): (Option<String>, i64) = conn
                .query_row(
                    "SELECT deleted_at, rev FROM tasks WHERE id = 't1'",
                    [],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .unwrap();
            assert_eq!(deleted_at, None, "tasks row must migrate as not-deleted");
            assert_eq!(rev, 0, "tasks row must start at rev 0");

            let (deleted_at, rev): (Option<String>, i64) = conn
                .query_row(
                    "SELECT deleted_at, rev FROM task_resources WHERE id = 'r1'",
                    [],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .unwrap();
            assert_eq!(
                deleted_at, None,
                "task_resources row must migrate as not-deleted"
            );
            assert_eq!(rev, 0, "task_resources row must start at rev 0");

            let (deleted_at, rev): (Option<String>, i64) = conn
                .query_row(
                    "SELECT deleted_at, rev FROM task_pins WHERE id = 'pin1'",
                    [],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .unwrap();
            assert_eq!(
                deleted_at, None,
                "task_pins row must migrate as not-deleted"
            );
            assert_eq!(rev, 0, "task_pins row must start at rev 0");
        }

        // The app's normal read paths must return every row.
        let projects = db.list_projects().unwrap();
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].id, "p1");
        assert!(db.get_project("p1").unwrap().is_some());

        let tasks = db.list_tasks("p1").unwrap();
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].id, "t1");
        assert!(db.get_task("t1").unwrap().is_some());

        let resources = db.task_resources("t1").unwrap();
        assert_eq!(resources.len(), 1);
        assert_eq!(resources[0].id, "r1");

        let pins = db.task_pins("t1").unwrap();
        assert_eq!(pins.len(), 1);
        assert_eq!(pins[0].id, "pin1");
    }

    #[test]
    fn migration_005_leaves_created_by_install_null_for_pre_existing_rows() {
        // I6: created_by_install is nullable specifically so a row that
        // existed before attribution was added migrates as "unknown
        // creator", never as falsely attributed to whichever install
        // happens to run this migration. Same shape as Task 6's
        // pre-migration test above, focused on the one column that test
        // predates.
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("rabta.db");

        let conn = Connection::open(&path).unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        let pre_005 = &MIGRATIONS[..MIGRATIONS.len() - 1];
        apply_migrations(&conn, pre_005).unwrap();

        conn.execute(
            "INSERT INTO projects
             (id, name, repo_path, dev_url, default_branch, created_at, updated_at)
             VALUES ('p1', 'Legacy', '/tmp/legacy', NULL, 'main',
                     '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO tasks (id, project_id, title, status, created_at, updated_at)
             VALUES ('t1', 'p1', 'Ship it', 'open',
                     '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO task_resources
             (id, task_id, connector_kind, resource_type, payload, created_at)
             VALUES ('r1', 't1', 'git', 'branch', '{\"branch\":\"main\"}',
                     '2026-01-01T00:00:00Z')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO task_pins
             (id, task_id, connector_kind, identity, payload, created_at)
             VALUES ('pin1', 't1', 'chrome', 'https://example.test/', '{}',
                     '2026-01-01T00:00:00Z')",
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
        for (table, id) in [
            ("projects", "p1"),
            ("tasks", "t1"),
            ("task_resources", "r1"),
            ("task_pins", "pin1"),
        ] {
            let created_by_install: Option<String> = conn
                .query_row(
                    &format!("SELECT created_by_install FROM {table} WHERE id = ?1"),
                    [id],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(
                created_by_install, None,
                "{table} row migrated from before 005 must have created_by_install = NULL, not attributed to whichever install runs the migration"
            );
        }
    }
}
