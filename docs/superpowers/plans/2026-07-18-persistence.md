# Persistence (Phase 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give OmniBus persistent memory: an `omnibus-db` SQLite crate, a recorder that persists hub activity, and dev-console preload of history and known connectors across restarts.

**Architecture:** `omnibus-db` is a sibling crate to `omnibus-hub` (which stays database-free). A `Recorder` in `omnibus-db` consumes serialized `HubEvent` JSON — the same shape the UI receives — so both the desktop app and the headless example can compose hub + db without coupling the crates. Synchronous rusqlite behind `Mutex<Connection>`; async callers use `spawn_blocking`; the desktop recorder runs on a dedicated thread fed by a channel.

**Tech Stack:** rusqlite (bundled), chrono, uuid, serde_json · existing: tokio, Tauri 2, React/Zustand.

**Spec:** `docs/superpowers/specs/2026-07-17-omnibus-persistence-design.md` — read before starting. Foundation spec's Principles / Coding standards / Definition of Done apply.

## Global Constraints

- DB file: `<app-data-dir>/omnibus.db` (next to `hub.json`), WAL mode, `foreign_keys=ON` per connection.
- Migrations: numbered embedded SQL applied via SQLite `user_version`; no framework.
- Event cap default **10 000** (`DbConfig.event_cap`), pruned on insert.
- Connector identity: `UNIQUE(name, kind)`; `token` column exists but is **never read or written** in this phase.
- `omnibus-hub` (the library) gains **zero** new dependencies. Recorder composition happens in the desktop app and the headless example only.
- Startup DB open/migration failure is **fatal**; post-startup write failures **log and continue**; recorder handles broadcast `Lagged` by skipping.
- Timestamps: ISO-8601 UTC text (`chrono::Utc::now().to_rfc3339()`); ids: UUID v4 strings.
- Warning-free builds; every public item documented; new crate gets a README.
- Environment: cargo is NOT on default PATH in subagent shells — `export PATH="$HOME/.cargo/bin:$PATH"` first; long cargo timeouts (rusqlite `bundled` compiles SQLite from source once).

---

### Task 1: `omnibus-db` crate — migrations runner + schema

**Files:**
- Create: `crates/omnibus-db/{Cargo.toml, README.md, migrations/001_init.sql, src/lib.rs}`
- Modify: `Cargo.toml` (root: add member `crates/omnibus-db`)
- Test: `crates/omnibus-db/tests/migrations.rs`

**Interfaces:**
- Produces: `Db::open(&Path, DbConfig) -> Result<Db>`, `Db::open_in_memory(DbConfig) -> Result<Db>`, `Db::schema_version() -> Result<i64>`, `DbConfig { event_cap: u64 }` (`Default` = 10 000), `DbError`, `Result<T>`. `Db: Clone + Send`. Internal helpers `now() -> String`, `new_id() -> String` used by later tasks.

- [ ] **Step 1: Scaffold + failing test**

Root `Cargo.toml` members become:
```toml
members = ["crates/omnibus-db", "crates/omnibus-hub", "apps/desktop/src-tauri"]
```

`crates/omnibus-db/Cargo.toml`:
```toml
[package]
name = "omnibus-db"
version = "0.1.0"
edition = "2021"

[dependencies]
rusqlite = { version = "0.32", features = ["bundled"] }
chrono = "0.4"
uuid = { version = "1", features = ["v4"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "2"

[dev-dependencies]
tempfile = "3"
omnibus-hub = { path = "../omnibus-hub" }
tokio = { version = "1", features = ["full"] }
tokio-tungstenite = "0.24"
futures-util = "0.3"
```
(dev-deps for Task 4's integration test; declaring now avoids a second manifest edit. `omnibus-hub`'s normal deps do not include `omnibus-db`, so no cycle.)

`crates/omnibus-db/README.md`: two sentences — persistent storage for OmniBus (SQLite, typed API, embedded migrations); `cargo test -p omnibus-db`.

`crates/omnibus-db/migrations/001_init.sql`:
```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  repo_path TEXT NOT NULL,
  dev_url TEXT,
  default_branch TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'done')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE task_resources (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  connector_kind TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE connectors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  capabilities TEXT NOT NULL,
  token TEXT,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  UNIQUE (name, kind)
);

CREATE TABLE events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  type TEXT NOT NULL,
  session_connector_id TEXT,
  payload TEXT NOT NULL
);
```

`crates/omnibus-db/tests/migrations.rs`:
```rust
use omnibus_db::{Db, DbConfig};

#[test]
fn migrates_fresh_database_and_is_idempotent() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("omnibus.db");

    let db = Db::open(&path, DbConfig::default()).unwrap();
    assert_eq!(db.schema_version().unwrap(), 1);
    drop(db);

    // Re-opening must not re-apply migrations or fail.
    let db = Db::open(&path, DbConfig::default()).unwrap();
    assert_eq!(db.schema_version().unwrap(), 1);
}

#[test]
fn in_memory_database_has_all_tables() {
    let db = Db::open_in_memory(DbConfig::default()).unwrap();
    for table in ["projects", "tasks", "task_resources", "connectors", "events"] {
        assert!(db.table_exists(table).unwrap(), "missing table {table}");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$HOME/.cargo/bin:$PATH" && cargo test -p omnibus-db`
Expected: compile error — crate `omnibus_db` has no `Db`.

- [ ] **Step 3: Implement `src/lib.rs`**

```rust
//! Persistent storage for OmniBus: SQLite behind a small typed API.
//! Sibling to `omnibus-hub` — the hub never depends on this crate;
//! composition happens in the desktop app and the headless example.
use std::path::Path;
use std::sync::{Arc, Mutex};

use rusqlite::Connection;

/// Embedded migrations, applied in order via SQLite's `user_version`.
const MIGRATIONS: &[&str] = &[include_str!("../migrations/001_init.sql")];

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
    conn: Arc<Mutex<Connection>>,
    cfg: DbConfig,
}

/// Current UTC time as ISO-8601 text — the storage timestamp format.
fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

/// Fresh UUID v4 string — the storage id format.
fn new_id() -> String {
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
```
(`now`/`new_id` are `fn` not `pub fn` — later tasks in this crate use them; nothing outside does. If the compiler flags them unused in this task, add `#[allow(dead_code)]` — and REMOVE it in Task 2 when they gain callers.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test -p omnibus-db` — 2 tests green, zero warnings (first run compiles bundled SQLite; allow several minutes).
Run: `cargo test` — everything else still green.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: omnibus-db crate with schema and user_version migrations"
```

---

### Task 2: Events + connectors — recording, cap, known-connector identity

**Files:**
- Create: `crates/omnibus-db/src/activity.rs`
- Modify: `crates/omnibus-db/src/lib.rs` (add `mod activity; pub use activity::{EventRow, KnownConnector};`)
- Test: `crates/omnibus-db/tests/activity.rs`

**Interfaces:**
- Consumes: `Db`, `DbConfig`, `now()`, `new_id()` from Task 1.
- Produces (Tasks 4–5 rely on these exact signatures):
  - `Db::record_event(&self, event_type: &str, session_connector_id: Option<&str>, payload: &serde_json::Value) -> Result<()>`
  - `Db::recent_events(&self, limit: u32) -> Result<Vec<EventRow>>` (oldest→newest)
  - `Db::upsert_connector(&self, name: &str, kind: &str, capabilities: &[String]) -> Result<()>`
  - `Db::touch_connector_seen(&self, name: &str, kind: &str) -> Result<()>`
  - `Db::known_connectors(&self) -> Result<Vec<KnownConnector>>` (most recently seen first)
  - `EventRow { seq: i64, at: String, event_type: String, session_connector_id: Option<String>, payload: Value }` (Serialize camelCase, `event_type` renamed `type`)
  - `KnownConnector { name, kind, capabilities: Vec<String>, first_seen, last_seen }` (Serialize camelCase)

- [ ] **Step 1: Write the failing tests**

`crates/omnibus-db/tests/activity.rs`:
```rust
use omnibus_db::{Db, DbConfig};
use serde_json::json;

fn db() -> Db {
    Db::open_in_memory(DbConfig::default()).unwrap()
}

#[test]
fn records_and_reads_back_events_in_order() {
    let db = db();
    db.record_event("eventReceived", Some("s-1"), &json!({"n": 1})).unwrap();
    db.record_event("commandSent", None, &json!({"n": 2})).unwrap();
    let events = db.recent_events(10).unwrap();
    assert_eq!(events.len(), 2);
    assert_eq!(events[0].event_type, "eventReceived");
    assert_eq!(events[0].session_connector_id.as_deref(), Some("s-1"));
    assert_eq!(events[0].payload, json!({"n": 1}));
    assert_eq!(events[1].event_type, "commandSent");
    assert!(events[0].seq < events[1].seq);
}

#[test]
fn recent_events_returns_newest_window_oldest_first() {
    let db = db();
    for i in 0..5 {
        db.record_event("e", None, &json!({ "i": i })).unwrap();
    }
    let events = db.recent_events(2).unwrap();
    assert_eq!(events.len(), 2);
    assert_eq!(events[0].payload, json!({"i": 3}));
    assert_eq!(events[1].payload, json!({"i": 4}));
}

#[test]
fn event_cap_prunes_oldest_rows() {
    let db = Db::open_in_memory(DbConfig { event_cap: 5 }).unwrap();
    for i in 0..8 {
        db.record_event("e", None, &json!({ "i": i })).unwrap();
    }
    let events = db.recent_events(100).unwrap();
    assert_eq!(events.len(), 5, "cap must bound the table");
    assert_eq!(events[0].payload, json!({"i": 3}), "oldest rows pruned first");
    assert_eq!(events[4].payload, json!({"i": 7}));
}

#[test]
fn upsert_connector_is_identity_by_name_and_kind() {
    let db = db();
    db.upsert_connector("fake-vscode", "fake", &["workspace".into()]).unwrap();
    db.upsert_connector("fake-vscode", "fake", &["workspace".into(), "editor".into()]).unwrap();
    let known = db.known_connectors().unwrap();
    assert_eq!(known.len(), 1, "same (name, kind) must not duplicate");
    assert_eq!(known[0].capabilities, vec!["workspace", "editor"], "capabilities refresh on upsert");
    assert!(known[0].first_seen <= known[0].last_seen);
}

#[test]
fn touch_connector_seen_updates_last_seen_only_for_known() {
    let db = db();
    db.upsert_connector("a", "fake", &[]).unwrap();
    let before = db.known_connectors().unwrap()[0].last_seen.clone();
    std::thread::sleep(std::time::Duration::from_millis(5));
    db.touch_connector_seen("a", "fake").unwrap();
    let after = db.known_connectors().unwrap()[0].last_seen.clone();
    assert!(after > before);
    // Unknown connector: no error, no row created.
    db.touch_connector_seen("ghost", "fake").unwrap();
    assert_eq!(db.known_connectors().unwrap().len(), 1);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p omnibus-db --test activity`
Expected: compile error — no `record_event` on `Db`.

- [ ] **Step 3: Implement `src/activity.rs`**

```rust
//! Event log and connector-identity persistence (the recorder's write side).
use rusqlite::params;
use serde::Serialize;
use serde_json::Value;

use crate::{new_id, now, Db, Result};

/// A hub event as persisted, in the same JSON shape the UI receives.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EventRow {
    pub seq: i64,
    pub at: String,
    #[serde(rename = "type")]
    pub event_type: String,
    pub session_connector_id: Option<String>,
    pub payload: Value,
}

/// A connector this machine has seen; persistent identity is `(name, kind)`.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KnownConnector {
    pub name: String,
    pub kind: String,
    pub capabilities: Vec<String>,
    pub first_seen: String,
    pub last_seen: String,
}

impl Db {
    /// Persists one event and prunes rows beyond the configured cap.
    pub fn record_event(
        &self,
        event_type: &str,
        session_connector_id: Option<&str>,
        payload: &Value,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO events (at, type, session_connector_id, payload) VALUES (?1, ?2, ?3, ?4)",
            params![now(), event_type, session_connector_id, payload.to_string()],
        )?;
        conn.execute(
            "DELETE FROM events WHERE seq <= (SELECT MAX(seq) FROM events) - ?1",
            params![self.cfg.event_cap as i64],
        )?;
        Ok(())
    }

    /// The newest `limit` events, oldest first (ready for a log display).
    pub fn recent_events(&self, limit: u32) -> Result<Vec<EventRow>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT seq, at, type, session_connector_id, payload FROM \
             (SELECT * FROM events ORDER BY seq DESC LIMIT ?1) ORDER BY seq ASC",
        )?;
        let rows = stmt.query_map(params![limit], |r| {
            Ok(EventRow {
                seq: r.get(0)?,
                at: r.get(1)?,
                event_type: r.get(2)?,
                session_connector_id: r.get(3)?,
                payload: serde_json::from_str(&r.get::<_, String>(4)?).unwrap_or(Value::Null),
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// Registers a connector identity or refreshes its capabilities/last_seen.
    pub fn upsert_connector(&self, name: &str, kind: &str, capabilities: &[String]) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let caps = serde_json::to_string(capabilities).unwrap_or_else(|_| "[]".into());
        let ts = now();
        conn.execute(
            "INSERT INTO connectors (id, name, kind, capabilities, first_seen, last_seen) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?5) \
             ON CONFLICT(name, kind) DO UPDATE SET capabilities = ?4, last_seen = ?5",
            params![new_id(), name, kind, caps, ts],
        )?;
        Ok(())
    }

    /// Stamps `last_seen` for a known connector; silently no-ops for unknown.
    pub fn touch_connector_seen(&self, name: &str, kind: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE connectors SET last_seen = ?3 WHERE name = ?1 AND kind = ?2",
            params![name, kind, now()],
        )?;
        Ok(())
    }

    /// Every connector this machine has seen, most recently seen first.
    pub fn known_connectors(&self) -> Result<Vec<KnownConnector>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT name, kind, capabilities, first_seen, last_seen \
             FROM connectors ORDER BY last_seen DESC",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(KnownConnector {
                name: r.get(0)?,
                kind: r.get(1)?,
                capabilities: serde_json::from_str(&r.get::<_, String>(2)?).unwrap_or_default(),
                first_seen: r.get(3)?,
                last_seen: r.get(4)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }
}
```

In `src/lib.rs` add after the `MIGRATIONS` const block:
```rust
mod activity;
pub use activity::{EventRow, KnownConnector};
```
Also make `conn` and `cfg` visible to the module: change `struct Db` fields to `pub(crate) conn: ...` and `pub(crate) cfg: ...`, and `now`/`new_id` to `pub(crate) fn`. Remove any `#[allow(dead_code)]` added in Task 1.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test -p omnibus-db` — 7 tests green, zero warnings.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: event log with cap and known-connector identity in omnibus-db"
```

---

### Task 3: Projects / tasks / task-resources CRUD

**Files:**
- Create: `crates/omnibus-db/src/records.rs`
- Modify: `crates/omnibus-db/src/lib.rs` (add `mod records; pub use records::{NewProject, Project, NewTask, Task, TaskStatus, NewTaskResource, TaskResource};`)
- Test: `crates/omnibus-db/tests/records.rs`

**Interfaces:**
- Consumes: `Db`, `now()`, `new_id()`.
- Produces (phase 6+ will consume; nothing else in THIS plan uses them):
  - `Db::create_project(&self, NewProject) -> Result<Project>` / `list_projects() -> Result<Vec<Project>>` / `delete_project(&self, id: &str) -> Result<()>`
  - `Db::create_task(&self, NewTask) -> Result<Task>` / `list_tasks(&self, project_id: &str) -> Result<Vec<Task>>` / `set_task_status(&self, id: &str, TaskStatus) -> Result<()>` / `delete_task(&self, id: &str) -> Result<()>`
  - `Db::add_task_resource(&self, NewTaskResource) -> Result<TaskResource>` / `task_resources(&self, task_id: &str) -> Result<Vec<TaskResource>>` / `remove_task_resource(&self, id: &str) -> Result<()>`

- [ ] **Step 1: Write the failing tests**

`crates/omnibus-db/tests/records.rs`:
```rust
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p omnibus-db --test records`
Expected: compile error — no `NewProject` in `omnibus_db`.

- [ ] **Step 3: Implement `src/records.rs`**

```rust
//! Projects, tasks, and task resources — the data model phases 6+ build on.
use rusqlite::params;
use serde::Serialize;
use serde_json::Value;

use crate::{new_id, now, Db, Result};

/// Input for creating a project (fields match phase 6 registration).
pub struct NewProject {
    pub name: String,
    pub repo_path: String,
    pub dev_url: Option<String>,
    pub default_branch: String,
}

/// A registered project.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub repo_path: String,
    pub dev_url: Option<String>,
    pub default_branch: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Input for creating a task under a project.
pub struct NewTask {
    pub project_id: String,
    pub title: String,
}

/// Task lifecycle state. Deliberately minimal until capsules (phase 8).
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    Open,
    Done,
}

impl TaskStatus {
    fn as_str(self) -> &'static str {
        match self {
            TaskStatus::Open => "open",
            TaskStatus::Done => "done",
        }
    }
    fn parse(s: &str) -> TaskStatus {
        if s == "done" { TaskStatus::Done } else { TaskStatus::Open }
    }
}

/// A task within a project.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub status: TaskStatus,
    pub created_at: String,
    pub updated_at: String,
}

/// Input for attaching a resource to a task.
pub struct NewTaskResource {
    pub task_id: String,
    pub connector_kind: String,
    pub resource_type: String,
    pub payload: Value,
}

/// A resource attached to a task (the bag capsules will fill).
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TaskResource {
    pub id: String,
    pub task_id: String,
    pub connector_kind: String,
    pub resource_type: String,
    pub payload: Value,
    pub created_at: String,
}

impl Db {
    /// Creates a project; fails on duplicate name (UNIQUE constraint).
    pub fn create_project(&self, new: NewProject) -> Result<Project> {
        let p = Project {
            id: new_id(),
            name: new.name,
            repo_path: new.repo_path,
            dev_url: new.dev_url,
            default_branch: new.default_branch,
            created_at: now(),
            updated_at: now(),
        };
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO projects (id, name, repo_path, dev_url, default_branch, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![p.id, p.name, p.repo_path, p.dev_url, p.default_branch, p.created_at, p.updated_at],
        )?;
        Ok(p)
    }

    /// All projects, alphabetical by name.
    pub fn list_projects(&self) -> Result<Vec<Project>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, repo_path, dev_url, default_branch, created_at, updated_at \
             FROM projects ORDER BY name",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(Project {
                id: r.get(0)?,
                name: r.get(1)?,
                repo_path: r.get(2)?,
                dev_url: r.get(3)?,
                default_branch: r.get(4)?,
                created_at: r.get(5)?,
                updated_at: r.get(6)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// Deletes a project; tasks and resources cascade.
    pub fn delete_project(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM projects WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// Creates a task in status `open`.
    pub fn create_task(&self, new: NewTask) -> Result<Task> {
        let t = Task {
            id: new_id(),
            project_id: new.project_id,
            title: new.title,
            status: TaskStatus::Open,
            created_at: now(),
            updated_at: now(),
        };
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO tasks (id, project_id, title, status, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![t.id, t.project_id, t.title, t.status.as_str(), t.created_at, t.updated_at],
        )?;
        Ok(t)
    }

    /// Tasks for one project, newest first.
    pub fn list_tasks(&self, project_id: &str) -> Result<Vec<Task>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, project_id, title, status, created_at, updated_at \
             FROM tasks WHERE project_id = ?1 ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map(params![project_id], |r| {
            Ok(Task {
                id: r.get(0)?,
                project_id: r.get(1)?,
                title: r.get(2)?,
                status: TaskStatus::parse(&r.get::<_, String>(3)?),
                created_at: r.get(4)?,
                updated_at: r.get(5)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// Updates a task's status and `updated_at`.
    pub fn set_task_status(&self, id: &str, status: TaskStatus) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE tasks SET status = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, status.as_str(), now()],
        )?;
        Ok(())
    }

    /// Deletes a task; its resources cascade.
    pub fn delete_task(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM tasks WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// Attaches a resource to a task.
    pub fn add_task_resource(&self, new: NewTaskResource) -> Result<TaskResource> {
        let r = TaskResource {
            id: new_id(),
            task_id: new.task_id,
            connector_kind: new.connector_kind,
            resource_type: new.resource_type,
            payload: new.payload,
            created_at: now(),
        };
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO task_resources (id, task_id, connector_kind, resource_type, payload, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![r.id, r.task_id, r.connector_kind, r.resource_type, r.payload.to_string(), r.created_at],
        )?;
        Ok(r)
    }

    /// Resources for one task, in attachment order.
    pub fn task_resources(&self, task_id: &str) -> Result<Vec<TaskResource>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, task_id, connector_kind, resource_type, payload, created_at \
             FROM task_resources WHERE task_id = ?1 ORDER BY created_at",
        )?;
        let rows = stmt.query_map(params![task_id], |r| {
            Ok(TaskResource {
                id: r.get(0)?,
                task_id: r.get(1)?,
                connector_kind: r.get(2)?,
                resource_type: r.get(3)?,
                payload: serde_json::from_str(&r.get::<_, String>(4)?).unwrap_or(Value::Null),
                created_at: r.get(5)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// Detaches one resource.
    pub fn remove_task_resource(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM task_resources WHERE id = ?1", params![id])?;
        Ok(())
    }
}
```

In `src/lib.rs` add:
```rust
mod records;
pub use records::{NewProject, NewTask, NewTaskResource, Project, Task, TaskResource, TaskStatus};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test -p omnibus-db` — 12 tests green, zero warnings.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: projects, tasks, and task-resources CRUD in omnibus-db"
```

---

### Task 4: Recorder + headless `--record` + integration test

**Files:**
- Create: `crates/omnibus-db/src/recorder.rs`
- Modify: `crates/omnibus-db/src/lib.rs` (add `mod recorder; pub use recorder::Recorder;`)
- Modify: `crates/omnibus-hub/examples/headless.rs` (add `--record`)
- Modify: `crates/omnibus-hub/Cargo.toml` (add `omnibus-db = { path = "../omnibus-db" }` to `[dev-dependencies]` — examples resolve against dev-deps; the hub library itself stays db-free)
- Test: `crates/omnibus-db/tests/recorder.rs`

**Interfaces:**
- Consumes: `Db::record_event/upsert_connector/touch_connector_seen` (Task 2); `omnibus_hub::{Hub, HubConfig, HubEvent}` (dev-dep, existing).
- Produces: `Recorder::new(db: Db) -> Recorder`; `Recorder::handle(&mut self, ev: &serde_json::Value)` — takes one serialized `HubEvent` (the exact JSON the UI receives), never returns errors (logs and continues, per spec). Task 5's desktop wiring and the `--record` flag both call exactly this.

- [ ] **Step 1: Write the failing integration test**

`crates/omnibus-db/tests/recorder.rs`:
```rust
use futures_util::{SinkExt, StreamExt};
use omnibus_db::{Db, DbConfig, Recorder};
use omnibus_hub::{Hub, HubConfig};
use serde_json::{json, Value};
use std::time::Duration;

/// End-to-end: real hub, real WebSocket connector, recorder consuming the
/// same broadcast the UI would — events and connector identity must land in
/// the database.
#[tokio::test]
async fn recorder_persists_hub_activity() {
    let dir = tempfile::tempdir().unwrap();
    let hub = Hub::start(HubConfig::new(dir.path().to_path_buf())).await.unwrap();
    let db = Db::open_in_memory(DbConfig::default()).unwrap();
    let mut recorder = Recorder::new(db.clone());
    let mut events = hub.subscribe();

    // Connector: register, emit one event, disconnect.
    let (mut ws, _) =
        tokio_tungstenite::connect_async(format!("ws://127.0.0.1:{}", hub.port())).await.unwrap();
    ws.send(
        json!({"v":1,"id":"h","kind":"hello","payload":{"name":"rec-test","kind":"fake","protocolVersion":1,"capabilities":["workspace"]}})
            .to_string()
            .into(),
    )
    .await
    .unwrap();
    ws.next().await; // welcome
    ws.send(
        json!({"v":1,"id":"e","kind":"event","payload":{"name":"editor.fileOpened","data":{"path":"a.ts"}}})
            .to_string()
            .into(),
    )
    .await
    .unwrap();
    drop(ws); // disconnect

    // Drive the recorder from the broadcast until the disconnect arrives.
    let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    loop {
        let ev = tokio::time::timeout_at(deadline, events.recv()).await.expect("timed out").unwrap();
        let v: Value = serde_json::to_value(&ev).unwrap();
        let is_disconnect = v["type"] == "connectorDisconnected";
        recorder.handle(&v);
        if is_disconnect {
            break;
        }
    }

    let rows = db.recent_events(50).unwrap();
    let types: Vec<&str> = rows.iter().map(|r| r.event_type.as_str()).collect();
    assert!(types.contains(&"connectorConnected"), "got {types:?}");
    assert!(types.contains(&"eventReceived"), "got {types:?}");
    assert!(types.contains(&"connectorDisconnected"), "got {types:?}");

    let event_row = rows.iter().find(|r| r.event_type == "eventReceived").unwrap();
    assert_eq!(event_row.payload["name"], "editor.fileOpened");
    assert!(event_row.session_connector_id.is_some());

    let known = db.known_connectors().unwrap();
    assert_eq!(known.len(), 1);
    assert_eq!(known[0].name, "rec-test");
    assert_eq!(known[0].kind, "fake");
    assert_eq!(known[0].capabilities, vec!["workspace"]);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p omnibus-db --test recorder`
Expected: compile error — no `Recorder` in `omnibus_db`.

- [ ] **Step 3: Implement `src/recorder.rs`**

```rust
//! Bridges serialized `HubEvent`s into the database. Deliberately consumes
//! JSON (the UI's wire shape) rather than `omnibus_hub` types, so this crate
//! never depends on the hub.
use std::collections::HashMap;

use serde_json::Value;

use crate::Db;

/// Consumes serialized hub events and persists them. Keeps an in-memory map
/// of session connector-ids to persistent `(name, kind)` identities so
/// disconnects can stamp `last_seen`.
pub struct Recorder {
    db: Db,
    sessions: HashMap<String, (String, String)>,
}

impl Recorder {
    /// A recorder writing into `db`. One per subscription.
    pub fn new(db: Db) -> Recorder {
        Recorder { db, sessions: HashMap::new() }
    }

    /// Handles one serialized `HubEvent`. Never fails: write errors are
    /// logged and skipped — persistence trouble must not break live routing.
    pub fn handle(&mut self, ev: &Value) {
        let event_type =
            ev.get("type").and_then(Value::as_str).unwrap_or("unknown").to_string();
        let session_id = ev
            .get("connectorId")
            .and_then(Value::as_str)
            .or_else(|| ev.pointer("/connector/id").and_then(Value::as_str))
            .map(String::from);

        if let Err(e) = self.db.record_event(&event_type, session_id.as_deref(), ev) {
            eprintln!("recorder: failed to persist event: {e}");
        }

        match event_type.as_str() {
            "connectorConnected" => {
                let name = ev.pointer("/connector/name").and_then(Value::as_str);
                let kind = ev.pointer("/connector/kind").and_then(Value::as_str);
                let caps: Vec<String> = ev
                    .pointer("/connector/capabilities")
                    .and_then(|v| serde_json::from_value(v.clone()).ok())
                    .unwrap_or_default();
                if let (Some(name), Some(kind), Some(id)) = (name, kind, session_id.as_deref()) {
                    if let Err(e) = self.db.upsert_connector(name, kind, &caps) {
                        eprintln!("recorder: connector upsert failed: {e}");
                    }
                    self.sessions.insert(id.to_string(), (name.to_string(), kind.to_string()));
                }
            }
            "connectorDisconnected" => {
                match session_id.and_then(|id| self.sessions.remove(&id)) {
                    Some((name, kind)) => {
                        if let Err(e) = self.db.touch_connector_seen(&name, &kind) {
                            eprintln!("recorder: last_seen update failed: {e}");
                        }
                    }
                    // Recorder started mid-session: spec says log and skip.
                    None => eprintln!("recorder: disconnect for unknown session; skipped"),
                }
            }
            _ => {}
        }
    }
}
```

In `src/lib.rs` add:
```rust
mod recorder;
pub use recorder::Recorder;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p omnibus-db` — 13 tests green, zero warnings.

- [ ] **Step 5: Add `--record` to the headless example**

`crates/omnibus-hub/Cargo.toml` — add to `[dev-dependencies]`:
```toml
omnibus-db = { path = "../omnibus-db" }
```

`crates/omnibus-hub/examples/headless.rs` — replace the whole file:
```rust
//! Runs the hub without Tauri. Prints every HubEvent as one JSON line.
//! `--probe`: send `probe.echo {"n":1}` to each connector as it connects and
//! print the outcome — used by the connector-sdk integration test.
//! `--record`: persist events and connector identities to `omnibus.db` in the
//! data dir, exactly as the desktop app does.
use omnibus_db::{Db, DbConfig, Recorder};
use omnibus_hub::{Hub, HubConfig, HubEvent};
use serde_json::json;
use tokio::sync::broadcast::error::RecvError;

#[tokio::main]
async fn main() {
    let data_dir: std::path::PathBuf = match std::env::var("OMNIBUS_DATA_DIR") {
        Ok(dir) => dir.into(),
        Err(_) => dirs::data_dir().expect("no platform data dir").join("com.omnibus.dev"),
    };
    let probe = std::env::args().any(|a| a == "--probe");
    let record = std::env::args().any(|a| a == "--record");

    let hub = Hub::start(HubConfig::new(data_dir.clone())).await.expect("hub failed to start");
    eprintln!("hub listening on 127.0.0.1:{}", hub.port());

    let mut recorder = if record {
        let db = Db::open(&data_dir.join("omnibus.db"), DbConfig::default())
            .expect("failed to open database");
        Some(Recorder::new(db))
    } else {
        None
    };

    let mut events = hub.subscribe();
    loop {
        let ev = match events.recv().await {
            Ok(ev) => ev,
            Err(RecvError::Lagged(_)) => continue,
            Err(RecvError::Closed) => break,
        };
        println!("{}", serde_json::to_string(&ev).unwrap());
        if let (Some(rec), Ok(v)) = (recorder.as_mut(), serde_json::to_value(&ev)) {
            rec.handle(&v);
        }
        if probe {
            if let HubEvent::ConnectorConnected { connector } = &ev {
                let outcome = hub.send_command(&connector.id, "probe.echo", json!({"n": 1})).await;
                println!("{}", json!({"probe": {"ok": outcome.is_ok(), "result": outcome.ok()}}));
            }
        }
    }
}
```

Verify: `OMNIBUS_DATA_DIR=$(mktemp -d) timeout 5 cargo run -p omnibus-hub --example headless -- --record; true` — prints the listening line, exits via timeout (exit 124 is success).
Run: `cargo test` — everything green (the connector-sdk TS test also still passes: `export PATH="$HOME/.cargo/bin:$PATH" && pnpm test`).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: recorder bridging hub events into omnibus-db; headless --record"
```

---

### Task 5: Desktop wiring — open db, run recorder, preload UI

**Files:**
- Modify: `apps/desktop/src-tauri/Cargo.toml` (add `omnibus-db` dependency)
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src/store.ts`, `apps/desktop/src/App.tsx`, `apps/desktop/src/panels/LogPanel.tsx`

**Interfaces:**
- Consumes: `Db`, `DbConfig`, `Recorder`, `EventRow`, `KnownConnector` (Tasks 1–4); existing Tauri commands/events.
- Produces: Tauri commands `recent_events(limit: u32) -> EventRow[]` and `known_connectors() -> KnownConnector[]` (both camelCase JSON; `EventRow.payload` is the original HubEvent object). UI contract: log entries may carry `historical: true`; connector rows may be synthetic known-rows with id `known:<name>:<kind>`.

- [ ] **Step 1: Rust side**

`apps/desktop/src-tauri/Cargo.toml` — add dependency:
```toml
omnibus-db = { path = "../../../crates/omnibus-db" }
```

`apps/desktop/src-tauri/src/lib.rs` — replace the whole file:
```rust
use omnibus_db::{Db, DbConfig, EventRow, KnownConnector, Recorder};
use omnibus_hub::{ConnectorInfo, Hub, HubConfig};
use serde_json::Value;
use tauri::{Emitter, Manager, State};
use tokio::sync::broadcast::error::RecvError;

struct HubHandle(Hub);
struct DbHandle(Db);

/// Snapshot of connected connectors for the UI.
#[tauri::command]
async fn connectors(state: State<'_, HubHandle>) -> Result<Vec<ConnectorInfo>, String> {
    Ok(state.0.connectors().await)
}

/// Routes a command to a connector and returns its result (or an error string).
#[tauri::command]
async fn send_command(
    state: State<'_, HubHandle>,
    target: String,
    name: String,
    args: Value,
) -> Result<Value, String> {
    state.0.send_command(&target, &name, args).await.map_err(|e| e.to_string())
}

/// The newest persisted events (oldest first) for pre-seeding the activity log.
#[tauri::command]
async fn recent_events(db: State<'_, DbHandle>, limit: u32) -> Result<Vec<EventRow>, String> {
    let db = db.0.clone();
    tauri::async_runtime::spawn_blocking(move || db.recent_events(limit).map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

/// Connectors this machine has seen, for pre-seeding the connectors panel.
#[tauri::command]
async fn known_connectors(db: State<'_, DbHandle>) -> Result<Vec<KnownConnector>, String> {
    let db = db.0.clone();
    tauri::async_runtime::spawn_blocking(move || db.known_connectors().map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

/// Builds and runs the OmniBus Tauri application: opens the database (fatal
/// on failure), starts the hub, records hub activity, and forwards the event
/// stream to the frontend as `hub-event`.
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            // Spec: open/migration failure at startup is fatal.
            let db = Db::open(&data_dir.join("omnibus.db"), DbConfig::default())
                .map_err(|e| format!("failed to open omnibus.db: {e}"))?;

            let hub = tauri::async_runtime::block_on(Hub::start(HubConfig::new(data_dir)))?;

            // UI forwarder: broadcast -> Tauri event.
            let mut ui_events = hub.subscribe();
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    match ui_events.recv().await {
                        Ok(ev) => {
                            let _ = handle.emit("hub-event", &ev);
                        }
                        Err(RecvError::Lagged(_)) => continue,
                        Err(RecvError::Closed) => break,
                    }
                }
            });

            // Recorder: broadcast -> channel -> dedicated blocking thread.
            // SQLite writes are honest blocking work, so they get a real thread
            // instead of stalling the async runtime.
            let (tx, rx) = std::sync::mpsc::channel::<Value>();
            let mut rec_events = hub.subscribe();
            tauri::async_runtime::spawn(async move {
                loop {
                    match rec_events.recv().await {
                        Ok(ev) => {
                            if let Ok(v) = serde_json::to_value(&ev) {
                                if tx.send(v).is_err() {
                                    break; // recorder thread gone
                                }
                            }
                        }
                        Err(RecvError::Lagged(_)) => continue,
                        Err(RecvError::Closed) => break,
                    }
                }
            });
            let rec_db = db.clone();
            std::thread::spawn(move || {
                let mut recorder = Recorder::new(rec_db);
                while let Ok(v) = rx.recv() {
                    recorder.handle(&v);
                }
            });

            app.manage(HubHandle(hub));
            app.manage(DbHandle(db));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            connectors,
            send_command,
            recent_events,
            known_connectors
        ])
        .run(tauri::generate_context!())
        .expect("error while running OmniBus");
}
```

Verify: `cargo check` zero warnings; `cargo build -p omnibus-desktop` succeeds.

- [ ] **Step 2: Store — historical entries and known-connector seeding**

`apps/desktop/src/store.ts` — replace the whole file:
```ts
import { create } from "zustand";

export interface ConnectorInfo {
  id: string;
  name: string;
  kind: string;
  capabilities: string[];
}

export interface ConnectorRow extends ConnectorInfo {
  connected: boolean;
  connectedSince: string;
}

export interface LogEntry {
  seq: number;
  at: string;
  type: string;
  historical?: boolean;
  [key: string]: unknown;
}

export interface PersistedEvent {
  seq: number;
  at: string;
  type: string;
  sessionConnectorId: string | null;
  payload: Record<string, unknown>;
}

export interface KnownConnector {
  name: string;
  kind: string;
  capabilities: string[];
  firstSeen: string;
  lastSeen: string;
}

const MAX_LOG = 500;
let seq = 0;

const knownId = (c: { name: string; kind: string }) => `known:${c.name}:${c.kind}`;

interface Store {
  connectors: ConnectorRow[];
  log: LogEntry[];
  paused: boolean;
  setConnectors: (live: ConnectorInfo[]) => void;
  append: (event: { type: string; [key: string]: unknown }) => void;
  /** Pre-seed the log with persisted events and the panel with known connectors. */
  preload: (events: PersistedEvent[], known: KnownConnector[]) => void;
  togglePause: () => void;
}

export const useStore = create<Store>((set) => ({
  connectors: [],
  log: [],
  paused: false,
  // Live list from the hub; previously-seen-but-absent rows stay, shown
  // disconnected. Synthetic known-rows are dropped once a live row with the
  // same (name, kind) exists.
  setConnectors: (live) =>
    set((s) => {
      const rows: ConnectorRow[] = live.map((c) => {
        const prev = s.connectors.find((p) => p.id === c.id);
        return {
          ...c,
          connected: true,
          connectedSince: prev?.connectedSince ?? new Date().toLocaleTimeString(),
        };
      });
      const gone = s.connectors
        .filter((p) => !live.some((c) => c.id === p.id))
        .filter(
          (p) =>
            !(p.id.startsWith("known:") && live.some((c) => c.name === p.name && c.kind === p.kind))
        )
        .map((p) => ({ ...p, connected: false }));
      return { connectors: [...rows, ...gone] };
    }),
  append: (event) =>
    set((s) => ({
      log: [
        ...s.log.slice(-(MAX_LOG - 1)),
        { seq: seq++, at: new Date().toLocaleTimeString(), ...event },
      ],
    })),
  preload: (events, known) =>
    set((s) => {
      const historical: LogEntry[] = events.map((e) => ({
        ...e.payload,
        seq: seq++,
        at: new Date(e.at).toLocaleTimeString(),
        type: e.type,
        historical: true,
      }));
      const seeded: ConnectorRow[] = known
        .filter(
          (k) => !s.connectors.some((p) => p.name === k.name && p.kind === k.kind)
        )
        .map((k) => ({
          id: knownId(k),
          name: k.name,
          kind: k.kind,
          capabilities: k.capabilities,
          connected: false,
          connectedSince: new Date(k.lastSeen).toLocaleTimeString(),
        }));
      return {
        log: [...historical, ...s.log].slice(-MAX_LOG),
        connectors: [...s.connectors, ...seeded],
      };
    }),
  togglePause: () => set((s) => ({ paused: !s.paused })),
}));
```

- [ ] **Step 3: App preload + historical rendering**

`apps/desktop/src/App.tsx` — replace the whole file:
```tsx
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { CommandSender } from "./panels/CommandSender";
import { ConnectorsPanel } from "./panels/ConnectorsPanel";
import { LogPanel } from "./panels/LogPanel";
import {
  useStore,
  type ConnectorInfo,
  type KnownConnector,
  type PersistedEvent,
} from "./store";

export default function App() {
  const append = useStore((s) => s.append);
  const setConnectors = useStore((s) => s.setConnectors);
  const preload = useStore((s) => s.preload);

  useEffect(() => {
    const refresh = () =>
      invoke<ConnectorInfo[]>("connectors")
        .then(setConnectors)
        .catch((e) => console.error("connectors refresh failed:", e));

    Promise.all([
      invoke<PersistedEvent[]>("recent_events", { limit: 200 }),
      invoke<KnownConnector[]>("known_connectors"),
    ])
      .then(([events, known]) => preload(events, known))
      .catch((e) => console.error("history preload failed:", e))
      .then(refresh);

    const unlisten = listen<{ type: string; [k: string]: unknown }>("hub-event", (e) => {
      append(e.payload);
      if (e.payload.type === "connectorConnected" || e.payload.type === "connectorDisconnected") {
        refresh();
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [append, setConnectors, preload]);

  return (
    <div className="h-screen bg-neutral-900 text-neutral-200 grid grid-cols-[300px_1fr] grid-rows-[1fr_200px] font-mono text-sm">
      <ConnectorsPanel />
      <LogPanel />
      <CommandSender />
    </div>
  );
}
```

`apps/desktop/src/panels/LogPanel.tsx` — change ONLY the entry-rendering div inside the `shown.map` (rest of the file unchanged):
```tsx
        {shown.map((e) => (
          <div
            key={e.seq}
            className={`whitespace-pre-wrap break-all ${e.historical ? "text-neutral-600" : ""}`}
          >
            <span className="text-neutral-500">{e.at}</span>{" "}
            {e.historical && <span className="text-neutral-600">[hist]</span>}{" "}
            <span className="text-neutral-400">{e.type}</span> {JSON.stringify(e)}
          </div>
        ))}
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter desktop build` — tsc strict + vite green.
Run: `cargo check` and `export PATH="$HOME/.cargo/bin:$PATH" && pnpm test` — green, warning-free.
(The live GUI check is Task 6.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: persist hub activity and preload history in the dev console"
```

---

### Task 6: Walk success criteria + docs

**Files:**
- Modify: `README.md` (persistence paragraph in "Try it"), `crates/omnibus-db/README.md` (confirm accuracy), spec status line.

- [ ] **Step 1: Full sweep**

`cargo test` and `pnpm test` all green; `cargo build` + `pnpm build` warning-free; `grep -rn "TODO" --include="*.rs" --include="*.ts" --include="*.tsx" crates packages apps connectors` — explained TODOs only.

- [ ] **Step 2: Live walkthrough (spec criterion 1)**

1. `pnpm --filter desktop tauri dev`; run `pnpm --filter fake-connector start -- --chatty` for ~30 s.
2. Quit the app (and connector). Relaunch the app only.
3. Expect: activity log pre-seeded with dimmed `[hist]` entries from the previous run; `fake-vscode` listed as a known, disconnected (red-dot) connector.
4. Start the connector again — the known row is replaced by a live green row.
5. `sqlite3 ~/Library/Application\ Support/com.omnibus.dev/omnibus.db "SELECT COUNT(*) FROM events"` — a sane, capped number.

- [ ] **Step 3: Docs + commit**

README "Try it" gains one line: quit and relaunch the app to see history and known connectors restored from `omnibus.db`. Update the persistence spec's **Status:** line to `Implemented`. Commit:
```bash
git add -A && git commit -m "docs: persistence walkthrough; phase 5 success criteria verified"
```

---

## Self-review notes

- Spec coverage: schema + migrations (T1), event cap + connector identity (T2), CRUD (T3), recorder + session map + log-and-skip + `--record` (T4), fatal-on-open + Tauri commands + UI preload/dimming/known-seeding + Lagged-skip in recorder bridge (T5), walkthrough + README/spec status (T6). Reserved `token` column: written in T1's SQL, touched nowhere else — matching "never read or written".
- Type consistency: `EventRow`/`KnownConnector` camelCase serialization (T2) matches the TS `PersistedEvent`/`KnownConnector` interfaces (T5); `Recorder::handle(&Value)` (T4) is what both the example (T4) and desktop bridge (T5) call; `DbConfig { event_cap }` used in T1/T2/T4/T5 consistently.
- Deliberate deviation from pure TDD in T5 (UI wiring verified by build + T6 walkthrough, no UI test framework) — consistent with the foundation's approach.
- rusqlite 0.32 `pragma_update` with `&str`/i64 values and `ON CONFLICT ... DO UPDATE` syntax are exercised by T1/T2 tests; if the pinned version's API differs slightly (e.g. `pragma_update` signature), the implementer fixes minimally and reports the deviation.
