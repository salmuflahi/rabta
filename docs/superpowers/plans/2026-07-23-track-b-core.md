# Rabta Track B Core (B1–B3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver durable project management, accessible persisted ordering, capsule rename/duplication, and honest focus/idle-aware session metadata for Rabta.

**Architecture:** SQLite remains the durable source of truth behind typed `rabta-db` methods and narrow Tauri commands. The existing Rust `Capsules` orchestrator remains the authority for the active task and gains an injected-clock session state machine; React reports focus/idle transitions but never supplies elapsed time. UI work is split into focused project components while preserving the existing Restore Experience as the only activation path.

**Tech Stack:** Rust 2021, rusqlite 0.32, Tauri 2, Tokio, React 18, TypeScript 5.6, Zustand 5, Tailwind/shadcn/Radix, Vitest, Testing Library, dnd-kit.

## Global Constraints

- Preserve every existing project, task, and task-resource row through migration 002.
- `list_projects` returns active projects only; archived projects have a separate command.
- Archive is reversible and primary; permanent Delete remains secondary and destructive.
- Project duplication is excluded. `duplicate_task` duplicates one capsule and its saved resources.
- Accepted icon keys are exactly `code`, `globe`, `database`, `terminal`, `blocks`, `rocket`, `wrench`, and `folder`; `null` means default.
- Project ordering is durable, pointer-accessible, keyboard-accessible, and recoverable through Move Up/Move Down actions.
- A new project session begins on each successful task activation, including another activation in the same project.
- Session input never accepts a frontend project ID, task ID, timestamp, or elapsed duration.
- Active time accrues only with an active task while Rabta is focused, visible, and not idle for 60 seconds.
- Heartbeats occur every 15 seconds; one credited interval is capped at 30 seconds.
- No B4 connector-version work and no B5 packaging/signing work in this plan.
- No analytics, charts, scores, streaks, arbitrary emoji, or per-project accent colors.
- Every mutation is tested at the database layer and through its owning Rust or React surface.
- Use TDD: write the named failing test, confirm the expected failure, add the smallest complete implementation, then rerun.

## File Structure

| File | Responsibility |
|---|---|
| `crates/omnibus-db/migrations/002_track_b_core.sql` | Backward-compatible Track B columns and indexes |
| `crates/omnibus-db/src/lib.rs` | Registers migration 002 and domain error variants |
| `crates/omnibus-db/src/records.rs` | Project/task reads, mutations, reorder, duplication, and session persistence |
| `crates/omnibus-db/tests/records.rs` | Database behavior and transaction coverage |
| `apps/desktop/src-tauri/src/projects.rs` | User-facing project validation and error mapping |
| `apps/desktop/src-tauri/src/capsules.rs` | Archive-safe active task lifecycle and session state machine |
| `apps/desktop/src-tauri/src/lib.rs` | Tauri commands, command registration, and shutdown flush |
| `apps/desktop/src-tauri/tests/projects.rs` | Project command/service behavior |
| `apps/desktop/src-tauri/tests/capsules.rs` | Activation and session-runtime behavior |
| `apps/desktop/src/store.ts` | Expanded TypeScript wire types |
| `apps/desktop/src/lib/project-icons.tsx` | Stable icon-key mapping and fallback |
| `apps/desktop/src/lib/project-order.ts` | Pure reorder helper shared by drag and menu actions |
| `apps/desktop/src/lib/humanize.ts` | Session-duration presentation |
| `apps/desktop/src/features/projects/ProjectCard.tsx` | One sortable project card and context actions |
| `apps/desktop/src/features/projects/ProjectDialogs.tsx` | Rename and icon dialogs |
| `apps/desktop/src/features/projects/ArchivedProjectsDialog.tsx` | Restore and permanent-delete management |
| `apps/desktop/src/pages/ProjectsPage.tsx` | Project collection state and mutations |
| `apps/desktop/src/pages/CapsulesPage.tsx` | Capsule rename/duplicate and session preview |
| `apps/desktop/src/pages/OverviewPage.tsx` | Continue Working cards |
| `apps/desktop/src/lib/useSessionTracking.ts` | Throttled focus/visibility/idle/heartbeat bridge |
| `apps/desktop/src/pages/ProjectsPage.test.tsx` | Project workflow regressions |
| `apps/desktop/src/pages/CapsulesPage.test.tsx` | Capsule workflow regressions |
| `apps/desktop/src/pages/OverviewPage.test.tsx` | Continue Working regressions |
| `apps/desktop/src/shell/CommandPalette.test.tsx` | Active-only search and Resume routing |
| `apps/desktop/src/App.test.tsx` | App-level lifecycle integration |

---

### Task 1: Migration 002 and expanded project records

**Files:**
- Create: `crates/omnibus-db/migrations/002_track_b_core.sql`
- Modify: `crates/omnibus-db/src/lib.rs`
- Modify: `crates/omnibus-db/src/records.rs`
- Modify: `crates/omnibus-db/tests/records.rs`

**Interfaces:**
- Consumes: existing `MIGRATIONS`, `Db::open*`, `NewProject`, and `Project`.
- Produces: schema version 2 and `Project { icon, archived_at, last_opened_at, last_task_id, active_seconds, sort_order }`.

- [ ] **Step 1: Add a migration-preservation test that fails at schema version 1**

Add an internal `src/lib.rs` test that applies only migration 001, inserts a project/task/resource, sets `user_version = 1`, then runs `apply_migrations(&conn, MIGRATIONS)`. Assert version 2, all three rows still exist, `sort_order == 0`, nullable fields are null, and `active_seconds == 0`.

```rust
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
    let version = db.schema_version().unwrap();
    let conn = db.conn.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
    let project: (Option<String>, Option<String>, i64, i64) = conn
        .query_row(
            "SELECT icon, archived_at, active_seconds, sort_order FROM projects WHERE id = 'p1'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .unwrap();
    assert_eq!(version, 2);
    assert_eq!(project, (None, None, 0, 0));
    assert_eq!(
        conn.query_row("SELECT COUNT(*) FROM tasks WHERE id = 't1'", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        1
    );
    assert_eq!(
        conn.query_row("SELECT COUNT(*) FROM task_resources WHERE id = 'r1'", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        1
    );
}
```

- [ ] **Step 2: Run the migration test and confirm the expected failure**

Run:

```bash
cargo test -p rabta-db migration_two_preserves_version_one_records
```

Expected: FAIL because `MIGRATIONS` still contains only migration 001 or the new columns do not exist.

- [ ] **Step 3: Add migration 002 and register it**

Create `002_track_b_core.sql` exactly as approved:

```sql
ALTER TABLE projects ADD COLUMN icon TEXT;
ALTER TABLE projects ADD COLUMN archived_at TEXT;
ALTER TABLE projects ADD COLUMN last_opened_at TEXT;
ALTER TABLE projects ADD COLUMN last_task_id TEXT;
ALTER TABLE projects
  ADD COLUMN active_seconds INTEGER NOT NULL DEFAULT 0
  CHECK (active_seconds >= 0);
ALTER TABLE projects
  ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0
  CHECK (sort_order >= 0);

UPDATE projects
SET sort_order = (
  SELECT COUNT(*)
  FROM projects AS preceding
  WHERE lower(preceding.name) < lower(projects.name)
     OR (
       lower(preceding.name) = lower(projects.name)
       AND preceding.id < projects.id
     )
);

CREATE INDEX idx_projects_active_order
  ON projects (archived_at, sort_order, name);
```

Change the migration registry to:

```rust
const MIGRATIONS: &[&str] = &[
    include_str!("../migrations/001_init.sql"),
    include_str!("../migrations/002_track_b_core.sql"),
];
```

- [ ] **Step 4: Expand `Project`, its row mapper, creation, and reads**

Add these fields:

```rust
pub struct Project {
    pub id: String,
    pub name: String,
    pub repo_path: String,
    pub dev_url: Option<String>,
    pub default_branch: String,
    pub icon: Option<String>,
    pub archived_at: Option<String>,
    pub last_opened_at: Option<String>,
    pub last_task_id: Option<String>,
    pub active_seconds: u64,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}
```

Centralize all reads:

```rust
fn project_from_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<Project> {
    Ok(Project {
        id: r.get(0)?,
        name: r.get(1)?,
        repo_path: r.get(2)?,
        dev_url: r.get(3)?,
        default_branch: r.get(4)?,
        icon: r.get(5)?,
        archived_at: r.get(6)?,
        last_opened_at: r.get(7)?,
        last_task_id: r.get(8)?,
        active_seconds: r.get(9)?,
        sort_order: r.get(10)?,
        created_at: r.get(11)?,
        updated_at: r.get(12)?,
    })
}

const PROJECT_COLUMNS: &str =
    "id, name, repo_path, dev_url, default_branch, icon, archived_at,
     last_opened_at, last_task_id, active_seconds, sort_order, created_at, updated_at";
```

`create_project` must allocate `MAX(sort_order) + 1`, initialize nullable metadata to `None`, and insert all fields. `list_projects` must use:

```sql
SELECT id, name, repo_path, dev_url, default_branch, icon, archived_at,
       last_opened_at, last_task_id, active_seconds, sort_order, created_at, updated_at
FROM projects
WHERE archived_at IS NULL
ORDER BY sort_order, lower(name), id
```

`get_project` continues returning active or archived rows by ID.

- [ ] **Step 5: Update record fixtures and verify migration/read behavior**

Extend record assertions:

```rust
assert_eq!(p.icon, None);
assert_eq!(p.archived_at, None);
assert_eq!(p.last_opened_at, None);
assert_eq!(p.last_task_id, None);
assert_eq!(p.active_seconds, 0);
assert_eq!(p.sort_order, 0);
```

Run:

```bash
cargo test -p rabta-db
```

Expected: all `rabta-db` tests PASS, including schema version 2.

- [ ] **Step 6: Commit Task 1**

```bash
git add crates/omnibus-db/migrations/002_track_b_core.sql crates/omnibus-db/src/lib.rs crates/omnibus-db/src/records.rs crates/omnibus-db/tests/records.rs
git commit -m "feat(db): add Track B project metadata migration"
```

---

### Task 2: Transactional project domain operations

**Files:**
- Modify: `crates/omnibus-db/src/lib.rs`
- Modify: `crates/omnibus-db/src/records.rs`
- Modify: `crates/omnibus-db/tests/records.rs`

**Interfaces:**
- Consumes: expanded `Project` and `PROJECT_COLUMNS` from Task 1.
- Produces: `rename_project`, `archive_project`, `unarchive_project`, `set_project_icon`, `list_archived_projects`, and `reorder_projects`.

- [ ] **Step 1: Write failing domain-operation tests**

Add tests with these exact behaviors:

```rust
#[test]
fn rename_archive_icon_and_unarchive_round_trip() {
    let db = db();
    let p = a_project(&db, "Rabta");
    let renamed = db.rename_project(&p.id, "Rabta Desktop").unwrap();
    assert_eq!(renamed.name, "Rabta Desktop");

    let icon = db.set_project_icon(&p.id, Some("rocket")).unwrap();
    assert_eq!(icon.icon.as_deref(), Some("rocket"));
    assert!(db.set_project_icon(&p.id, Some("emoji")).is_err());

    let archived = db.archive_project(&p.id).unwrap();
    assert!(archived.archived_at.is_some());
    assert!(db.list_projects().unwrap().is_empty());
    assert_eq!(db.list_archived_projects().unwrap(), vec![archived]);

    let restored = db.unarchive_project(&p.id).unwrap();
    assert!(restored.archived_at.is_none());
    assert_eq!(db.list_projects().unwrap(), vec![restored]);
}

#[test]
fn reorder_requires_the_exact_active_project_set_and_rolls_back() {
    let db = db();
    let a = a_project(&db, "A");
    let b = a_project(&db, "B");
    let c = a_project(&db, "C");
    db.reorder_projects(&[c.id.clone(), a.id.clone(), b.id.clone()]).unwrap();
    assert_eq!(
        db.list_projects().unwrap().into_iter().map(|p| p.id).collect::<Vec<_>>(),
        vec![c.id.clone(), a.id.clone(), b.id.clone()]
    );
    assert!(db.reorder_projects(&[a.id.clone(), b.id.clone()]).is_err());
    assert_eq!(
        db.list_projects().unwrap().into_iter().map(|p| p.id).collect::<Vec<_>>(),
        vec![c.id, a.id, b.id]
    );
}
```

Also cover empty rename, missing ID, duplicate IDs, unknown IDs, archived IDs in reorder, repeated archive/unarchive, and name uniqueness.

- [ ] **Step 2: Run focused tests and confirm missing-method failures**

Run:

```bash
cargo test -p rabta-db --test records rename_archive_icon_and_unarchive_round_trip
cargo test -p rabta-db --test records reorder_requires_the_exact_active_project_set_and_rolls_back
```

Expected: compilation FAIL because the domain methods do not exist.

- [ ] **Step 3: Add typed domain errors and the icon allowlist**

Add:

```rust
#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("database schema version {0} is newer than this build supports")]
    SchemaTooNew(i64),
    #[error("{entity} not found: {id}")]
    NotFound { entity: &'static str, id: String },
    #[error("{field}: {message}")]
    Validation { field: &'static str, message: String },
}
```

In `records.rs`:

```rust
pub const PROJECT_ICONS: &[&str] =
    &["code", "globe", "database", "terminal", "blocks", "rocket", "wrench", "folder"];
```

Use `DbError::NotFound` whenever a required mutation affects zero rows, and `DbError::Validation` for empty names, unknown icons, and invalid reorder payloads.

- [ ] **Step 4: Implement project mutations and archived reads**

Implement each operation under the existing connection mutex. Required SQL:

```sql
UPDATE projects
SET name = ?2, updated_at = ?3
WHERE id = ?1
```

```sql
UPDATE projects
SET icon = ?2, updated_at = ?3
WHERE id = ?1
```

```sql
UPDATE projects
SET archived_at = COALESCE(archived_at, ?2), updated_at = ?2
WHERE id = ?1
```

For first-time unarchive, allocate one past the maximum active order:

```sql
UPDATE projects
SET archived_at = NULL, sort_order = ?2, updated_at = ?3
WHERE id = ?1 AND archived_at IS NOT NULL
```

If already unarchived, return the row unchanged. `list_archived_projects` uses:

```sql
SELECT id, name, repo_path, dev_url, default_branch, icon, archived_at,
       last_opened_at, last_task_id, active_seconds, sort_order, created_at, updated_at
FROM projects
WHERE archived_at IS NOT NULL
ORDER BY archived_at DESC, lower(name), id
```

`reorder_projects` must:

1. open `unchecked_transaction`;
2. query active IDs in current order;
3. compare lengths and `HashSet<&str>` equality;
4. reject duplicates before any update;
5. update each ID to its dense index;
6. commit;
7. return `list_projects`.

- [ ] **Step 5: Run all database tests**

```bash
cargo test -p rabta-db
```

Expected: all tests PASS; the reorder rollback test proves invalid input leaves the previous order intact.

- [ ] **Step 6: Commit Task 2**

```bash
git add crates/omnibus-db/src/lib.rs crates/omnibus-db/src/records.rs crates/omnibus-db/tests/records.rs
git commit -m "feat(db): add project archive icon and ordering operations"
```

---

### Task 3: Capsule rename and transactional duplication

**Files:**
- Modify: `crates/omnibus-db/src/records.rs`
- Modify: `crates/omnibus-db/tests/records.rs`

**Interfaces:**
- Consumes: `Task`, `TaskStatus`, `TaskResource`, `DbError`, `new_id`, and `now`.
- Produces: `rename_task(id, title) -> Task` and `duplicate_task(id) -> Task`.

- [ ] **Step 1: Write failing task rename/duplicate tests**

```rust
#[test]
fn duplicate_task_copies_resources_with_fresh_ids_and_an_open_status() {
    let db = db();
    let p = a_project(&db, "Rabta");
    let source = db.create_task(NewTask { project_id: p.id, title: "Ship".into() }).unwrap();
    let source_resource = db
        .add_task_resource(NewTaskResource {
            task_id: source.id.clone(),
            connector_kind: "git".into(),
            resource_type: "branch".into(),
            payload: json!({"branch": "main"}),
        })
        .unwrap();
    db.set_task_status(&source.id, TaskStatus::Done).unwrap();

    let copy = db.duplicate_task(&source.id).unwrap();
    let copied_resources = db.task_resources(&copy.id).unwrap();
    assert_eq!(copy.title, "Copy of Ship");
    assert_eq!(copy.status, TaskStatus::Open);
    assert_ne!(copy.id, source.id);
    assert_eq!(copied_resources.len(), 1);
    assert_ne!(copied_resources[0].id, source_resource.id);
    assert_eq!(copied_resources[0].payload, source_resource.payload);
}
```

Also test `Copy of Ship (2)`, rename trimming, empty-title rejection, missing task, and transaction rollback by violating a test-only constraint before copy completion. Extend the existing delete test so deleting the last-opened task clears `projects.last_task_id`.

- [ ] **Step 2: Run focused tests and confirm missing-method failures**

```bash
cargo test -p rabta-db --test records duplicate_task_copies_resources_with_fresh_ids_and_an_open_status
```

Expected: compilation FAIL because `duplicate_task` does not exist.

- [ ] **Step 3: Implement `rename_task`**

Trim once, reject empty input, update title and timestamp, check affected rows, then return `get_task(id)`:

```rust
pub fn rename_task(&self, id: &str, title: &str) -> Result<Task> {
    let title = title.trim();
    if title.is_empty() {
        return Err(DbError::Validation {
            field: "title",
            message: "must not be empty".into(),
        });
    }
    let conn = self.conn.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
    let changed = conn.execute(
        "UPDATE tasks SET title = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, title, now()],
    )?;
    if changed == 0 {
        return Err(DbError::NotFound { entity: "task", id: id.into() });
    }
    drop(conn);
    self.get_task(id)?.ok_or_else(|| DbError::NotFound { entity: "task", id: id.into() })
}
```

- [ ] **Step 4: Implement `duplicate_task` as one transaction**

Inside one transaction:

1. read the source task;
2. generate the first unused title from `Copy of <title>`, `Copy of <title> (2)`, …;
3. insert a new Open task with fresh ID and one timestamp;
4. read source resources ordered by `created_at, id`;
5. insert each with a fresh ID, copied payload fields, and copied `created_at`;
6. commit and return the new `Task`.

Never call `create_task` or `add_task_resource` while holding the connection mutex; doing so would lock recursively.

Update `delete_task` to prevent a stale soft reference:

```rust
pub fn delete_task(&self, id: &str) -> Result<()> {
    let mut conn = self.conn.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "UPDATE projects SET last_task_id = NULL WHERE last_task_id = ?1",
        params![id],
    )?;
    tx.execute("DELETE FROM tasks WHERE id = ?1", params![id])?;
    tx.commit()?;
    Ok(())
}
```

- [ ] **Step 5: Verify all database tests**

```bash
cargo test -p rabta-db
```

Expected: all tests PASS, including fresh IDs and rollback coverage.

- [ ] **Step 6: Commit Task 3**

```bash
git add crates/omnibus-db/src/records.rs crates/omnibus-db/tests/records.rs
git commit -m "feat(db): add capsule rename and duplication"
```

---

### Task 4: Tauri commands and archive-safe activation

**Files:**
- Modify: `apps/desktop/src-tauri/src/projects.rs`
- Modify: `apps/desktop/src-tauri/src/capsules.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/tests/projects.rs`
- Modify: `apps/desktop/src-tauri/tests/capsules.rs`

**Interfaces:**
- Consumes: Task 2 project methods and Task 3 task methods.
- Produces: Tauri commands `rename_project`, `archive_project`, `unarchive_project`, `set_project_icon`, `reorder_projects`, `list_archived_projects`, `rename_task`, and `duplicate_task`; archived-project guards.

- [ ] **Step 1: Write failing service and activation tests**

Add tests proving:

```rust
#[tokio::test]
async fn activation_refuses_a_task_whose_project_is_archived() {
    let (capsules, db, task_id, project_id) = fixture().await;
    db.archive_project(&project_id).unwrap();
    let error = capsules.activate_task(&task_id).await.unwrap_err();
    assert_eq!(error, "project is archived — restore it before resuming this capsule");
    assert_eq!(capsules.active_task(), None);
}
```

Add project-service tests for empty rename, unknown icon, list archived, exact-order reorder, and task duplicate command results.

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
cargo test -p rabta-desktop --test capsules activation_refuses_a_task_whose_project_is_archived
cargo test -p rabta-desktop --test projects
```

Expected: FAIL because archive commands and activation guards are absent.

- [ ] **Step 3: Add user-facing validation helpers**

In `projects.rs`, make `friendly_db_error` visible within the crate:

```rust
pub(crate) fn friendly_db_error(e: DbError) -> String {
    match e {
        DbError::NotFound { entity, .. } => format!("{entity} not found"),
        DbError::Validation { field, message } => format!("{field} {message}"),
        other => {
            let msg = other.to_string();
            if msg.contains("UNIQUE constraint failed: projects.name") {
                "a project with this name already exists".into()
            } else {
                log::error!("project operation failed: {msg}");
                "project operation failed — see the app log for details".into()
            }
        }
    }
}
```

Keep registration path validation unchanged.

- [ ] **Step 4: Add and register the commands**

Use `spawn_blocking` for every SQLite command. The command signatures are:

```rust
#[tauri::command]
async fn rename_project(db: State<'_, DbHandle>, id: String, name: String) -> Result<Project, String>;

#[tauri::command]
async fn list_archived_projects(db: State<'_, DbHandle>) -> Result<Vec<Project>, String>;

#[tauri::command]
async fn unarchive_project(db: State<'_, DbHandle>, id: String) -> Result<Project, String>;

#[tauri::command]
async fn set_project_icon(
    db: State<'_, DbHandle>,
    id: String,
    icon: Option<String>,
) -> Result<Project, String>;

#[tauri::command]
async fn reorder_projects(
    db: State<'_, DbHandle>,
    ordered_ids: Vec<String>,
) -> Result<Vec<Project>, String>;

#[tauri::command]
async fn rename_task(db: State<'_, DbHandle>, id: String, title: String) -> Result<Task, String>;

#[tauri::command]
async fn duplicate_task(db: State<'_, DbHandle>, id: String) -> Result<Task, String>;
```

Register all eight commands in `tauri::generate_handler!`.

- [ ] **Step 5: Guard archived project task creation and activation**

Before `create_task`, load the project and reject `archived_at.is_some()` with:

```text
project is archived — restore it before adding a capsule
```

At the beginning of `Capsules::activate_task`, before saving the previous task or mutating pending restore state:

```rust
let target = {
    let db = self.db.clone();
    let task_id = task_id.to_string();
    tokio::task::spawn_blocking(move || {
        let task = db
            .get_task(&task_id)?
            .ok_or_else(|| rabta_db::DbError::NotFound { entity: "task", id: task_id.clone() })?;
        let project = db
            .get_project(&task.project_id)?
            .ok_or_else(|| rabta_db::DbError::NotFound {
                entity: "project",
                id: task.project_id.clone(),
            })?;
        Ok::<_, rabta_db::DbError>((task, project))
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?
};
if target.1.archived_at.is_some() {
    return Err("project is archived — restore it before resuming this capsule".into());
}
```

- [ ] **Step 6: Implement active-project archive orchestration**

Add:

```rust
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveProjectResult {
    pub project: Project,
    pub warnings: Vec<String>,
}
```

Add `Capsules::archive_project(id)` that holds the activation lock, checks whether the current active task belongs to the project, saves it best-effort, clears `active_task`, clears pending restore, then calls `db.archive_project`. Return save failures in `warnings`; do not roll back a successful durable archive because a connector was unavailable.

The Tauri `archive_project` command receives `State<CapsulesHandle>` and delegates to that method.

- [ ] **Step 7: Run Rust verification**

```bash
cargo test -p rabta-desktop
cargo test -p rabta-db
cargo build
```

Expected: all tests and build PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add apps/desktop/src-tauri/src/projects.rs apps/desktop/src-tauri/src/capsules.rs apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/tests/projects.rs apps/desktop/src-tauri/tests/capsules.rs
git commit -m "feat(app): expose Track B project and capsule commands"
```

---

### Task 5: Shared project types, icons, and duration presentation

**Files:**
- Modify: `apps/desktop/src/store.ts`
- Create: `apps/desktop/src/lib/project-icons.tsx`
- Create: `apps/desktop/src/lib/project-icons.test.tsx`
- Modify: `apps/desktop/src/lib/humanize.ts`
- Modify: `apps/desktop/src/lib/humanize.test.ts`
- Modify: existing project fixtures in `apps/desktop/src/**/*.test.tsx`

**Interfaces:**
- Consumes: the expanded Rust `Project` wire shape.
- Produces: `ProjectIconKey`, `PROJECT_ICON_OPTIONS`, `ProjectIcon`, and `formatDuration(seconds)`.

- [ ] **Step 1: Write failing helper tests**

```tsx
it("falls back to FolderGit2 for a null or unknown project icon", () => {
  const { rerender } = render(<ProjectIcon icon={null} aria-label="project icon" />);
  expect(screen.getByLabelText("project icon")).toBeInTheDocument();
  rerender(<ProjectIcon icon={"future-icon" as ProjectIconKey} aria-label="project icon" />);
  expect(screen.getByLabelText("project icon")).toBeInTheDocument();
});

it("formats honest compact durations", () => {
  expect(formatDuration(0)).toBe("0m");
  expect(formatDuration(59)).toBe("<1m");
  expect(formatDuration(60)).toBe("1m");
  expect(formatDuration(2 * 3600 + 17 * 60)).toBe("2h 17m");
});
```

- [ ] **Step 2: Run the helper tests and confirm missing exports**

```bash
cd apps/desktop
pnpm exec vitest run src/lib/project-icons.test.tsx src/lib/humanize.test.ts
```

Expected: FAIL because the modules/exports do not exist.

- [ ] **Step 3: Expand the TypeScript wire type**

```ts
export type ProjectIconKey =
  | "code"
  | "globe"
  | "database"
  | "terminal"
  | "blocks"
  | "rocket"
  | "wrench"
  | "folder";

export interface Project {
  id: string;
  name: string;
  repoPath: string;
  devUrl: string | null;
  defaultBranch: string;
  icon: ProjectIconKey | null;
  archivedAt: string | null;
  lastOpenedAt: string | null;
  lastTaskId: string | null;
  activeSeconds: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
```

Update the hard-coded `Project` fixtures in exactly:

- `apps/desktop/src/pages/ProjectsPage.test.tsx`
- `apps/desktop/src/pages/CapsulesPage.test.tsx`
- `apps/desktop/src/shell/CommandPalette.test.tsx`

Use null/zero defaults. Do not use `as Project` to bypass missing fields.

- [ ] **Step 4: Create the icon mapping**

```tsx
import {
  Blocks,
  Code2,
  Database,
  Folder,
  FolderGit2,
  Globe2,
  Rocket,
  Terminal,
  Wrench,
  type LucideProps,
} from "lucide-react";
import type { ComponentType } from "react";
import type { ProjectIconKey } from "@/store";

export const PROJECT_ICON_OPTIONS: ReadonlyArray<{ key: ProjectIconKey; label: string }> = [
  { key: "code", label: "Code" },
  { key: "globe", label: "Web" },
  { key: "database", label: "Database" },
  { key: "terminal", label: "Terminal" },
  { key: "blocks", label: "Modules" },
  { key: "rocket", label: "Launch" },
  { key: "wrench", label: "Tools" },
  { key: "folder", label: "Folder" },
];

const ICONS = { code: Code2, globe: Globe2, database: Database, terminal: Terminal,
  blocks: Blocks, rocket: Rocket, wrench: Wrench, folder: Folder } satisfies
  Record<ProjectIconKey, ComponentType<LucideProps>>;

export function ProjectIcon({ icon, ...props }: { icon: ProjectIconKey | null } & LucideProps) {
  const Icon = (icon && ICONS[icon]) || FolderGit2;
  return <Icon {...props} />;
}
```

- [ ] **Step 5: Add `formatDuration`**

```ts
export function formatDuration(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  if (safe === 0) return "0m";
  if (safe < 60) return "<1m";
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}
```

- [ ] **Step 6: Run desktop tests and commit**

```bash
cd apps/desktop
pnpm test
```

Expected: all desktop tests PASS.

```bash
git add apps/desktop/src/store.ts apps/desktop/src/lib/project-icons.tsx apps/desktop/src/lib/project-icons.test.tsx apps/desktop/src/lib/humanize.ts apps/desktop/src/lib/humanize.test.ts apps/desktop/src/pages/ProjectsPage.test.tsx apps/desktop/src/pages/CapsulesPage.test.tsx apps/desktop/src/shell/CommandPalette.test.tsx
git commit -m "feat(ui): add project metadata presentation primitives"
```

---

### Task 6: Project rename, icons, archive/restore, and genuine Undo

**Files:**
- Create: `apps/desktop/src/features/projects/ProjectCard.tsx`
- Create: `apps/desktop/src/features/projects/ProjectDialogs.tsx`
- Create: `apps/desktop/src/features/projects/ArchivedProjectsDialog.tsx`
- Modify: `apps/desktop/src/pages/ProjectsPage.tsx`
- Modify: `apps/desktop/src/pages/ProjectsPage.test.tsx`

**Interfaces:**
- Consumes: Task 4 Tauri commands, Task 5 types/icons/duration, existing `UnsavedChangesDot`, `GitLine`, `GitHubSection`, and Sonner.
- Produces: project management UI and `onMove(projectId, direction)` hook consumed by Task 7.

- [ ] **Step 1: Write failing project workflow tests**

Add deterministic tests for:

```tsx
it("archives immediately and Undo calls real unarchive_project", async () => {
  // list_projects -> [project], archive_project -> { project: archived, warnings: [] }
  // after menu Archive: row absent and toast action exists
  // invoke toast action and assert:
  expect(mockInvoke).toHaveBeenCalledWith("unarchive_project", { id: FAKE_PROJECT.id });
});

it("renames from the context menu and refreshes authoritative data", async () => {
  // open Rename, type "Rabta Core", submit
  expect(mockInvoke).toHaveBeenCalledWith("rename_project", {
    id: FAKE_PROJECT.id,
    name: "Rabta Core",
  });
});

it("sets an allowlisted icon and archived management restores a project", async () => {
  expect(mockInvoke).toHaveBeenCalledWith("set_project_icon", {
    id: FAKE_PROJECT.id,
    icon: "rocket",
  });
  expect(mockInvoke).toHaveBeenCalledWith("unarchive_project", { id: "archived-1" });
});
```

Also assert archive warnings are shown, empty rename cannot submit, Delete remains destructive, and archived rows are fetched only when the Archived dialog opens.

- [ ] **Step 2: Run the project page tests and confirm failure**

```bash
cd apps/desktop
pnpm exec vitest run src/pages/ProjectsPage.test.tsx
```

Expected: FAIL because the new actions/dialogs do not exist.

- [ ] **Step 3: Extract `ProjectCard` without changing behavior**

Move one card's visual tree, dirty dot, `GitLine`, `GitHubSection`, and context menu into `ProjectCard`. Its complete props contract is:

```ts
interface ProjectCardProps {
  project: Project;
  actionsDisabled: boolean;
  gitRefreshKey: number;
  startedNonce: number;
  onGitChanged: () => void;
  onIssueStarted: () => void;
  onRename: (project: Project) => void;
  onChangeIcon: (project: Project) => void;
  onMove: (project: Project, direction: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onArchive: (project: Project) => void;
  onDelete: (project: Project) => void;
}
```

Keep Reveal in Finder and the existing `onGitChanged`/`onIssueStarted` refresh paths wired to their current invokes. Render `Opened ${relativeTime(project.lastOpenedAt)}` and `Last session ${formatDuration(project.activeSeconds)}` only when their persisted values exist. Make Archive the visible card-level removal action; keep permanent Delete in the context menu and Archived dialog as a separated destructive action.

- [ ] **Step 4: Implement rename and icon dialogs**

`ProjectDialogs` receives:

```ts
interface ProjectDialogsProps {
  renameProject: Project | null;
  iconProject: Project | null;
  busy: boolean;
  onClose: () => void;
  onRename: (id: string, name: string) => Promise<void>;
  onSetIcon: (id: string, icon: ProjectIconKey | null) => Promise<void>;
}
```

The rename dialog selects the current name on open, trims on submit, and disables submission for an empty/unchanged name. The icon dialog renders `PROJECT_ICON_OPTIONS` plus Default as a keyboard-accessible button grid with `aria-pressed`.

- [ ] **Step 5: Implement durable archive and Undo**

Use this sequence in `ProjectsPage`:

```ts
async function archiveProject(project: Project) {
  setBusy(true);
  try {
    const result = await invoke<ArchiveProjectResult>("archive_project", { id: project.id });
    await refresh();
    result.warnings.forEach((warning) => toastErr(warning));
    toast(`${project.name} archived`, {
      action: {
        label: "Undo",
        onClick: () =>
          invoke<Project>("unarchive_project", { id: project.id })
            .then(refresh)
            .catch((error) => {
              refresh();
              toastErr(error);
            }),
      },
    });
  } catch (error) {
    toastErr(error);
  } finally {
    setBusy(false);
  }
}
```

Archive is not deferred. Undo is a real backend reversal.

Define the response type beside the page:

```ts
interface ArchiveProjectResult {
  project: Project;
  warnings: string[];
}
```

- [ ] **Step 6: Implement archived management**

`ArchivedProjectsDialog` fetches `list_archived_projects` only when opened. Each row renders icon/name/archive time, Restore, and Delete. Restore calls `unarchive_project`; Delete reuses `useDeferredDelete<Project>` with `delete_project`. After either committed mutation, refresh both archived and active lists.

- [ ] **Step 7: Verify project workflows**

```bash
cd apps/desktop
pnpm exec vitest run src/pages/ProjectsPage.test.tsx
pnpm test
```

Expected: all tests PASS.

- [ ] **Step 8: Commit Task 6**

```bash
git add apps/desktop/src/features/projects apps/desktop/src/pages/ProjectsPage.tsx apps/desktop/src/pages/ProjectsPage.test.tsx
git commit -m "feat(ui): add durable project management workflows"
```

---

### Task 7: Accessible persisted project ordering

**Files:**
- Modify: `apps/desktop/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/desktop/src/lib/project-order.ts`
- Create: `apps/desktop/src/lib/project-order.test.ts`
- Modify: `apps/desktop/src/features/projects/ProjectCard.tsx`
- Modify: `apps/desktop/src/pages/ProjectsPage.tsx`
- Modify: `apps/desktop/src/pages/ProjectsPage.test.tsx`

**Interfaces:**
- Consumes: `reorder_projects(orderedIds) -> Project[]` and Task 6 `ProjectCard`.
- Produces: pointer/keyboard sortable active projects plus Move Up/Down fallbacks.

- [ ] **Step 1: Add dependency and failing pure reorder tests**

Run:

```bash
cd apps/desktop
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Add:

```ts
export function moveProject(projects: Project[], activeId: string, overId: string): Project[];
export function moveProjectBy(projects: Project[], id: string, direction: -1 | 1): Project[];
```

Tests:

```ts
expect(moveProject([a, b, c], "a", "c").map((p) => p.id)).toEqual(["b", "c", "a"]);
expect(moveProjectBy([a, b, c], "b", -1).map((p) => p.id)).toEqual(["b", "a", "c"]);
expect(moveProjectBy([a, b, c], "a", -1)).toEqual([a, b, c]);
```

- [ ] **Step 2: Run the helper test and confirm failure**

```bash
pnpm exec vitest run src/lib/project-order.test.ts
```

Expected: FAIL because the helpers are not implemented.

- [ ] **Step 3: Implement pure reorder helpers**

Use `arrayMove` after resolving indices. Return the original array for missing IDs, equal IDs, or out-of-range menu movement.

- [ ] **Step 4: Make `ProjectCard` sortable**

Use the documented dnd-kit contract:

```tsx
const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
  useSortable({ id: project.id, disabled: actionsDisabled });
const style = { transform: CSS.Transform.toString(transform), transition };
```

Apply `setNodeRef` and `style` to the outer card wrapper. Put `attributes` and `listeners` only on a labeled GripVertical button:

```tsx
<button type="button" aria-label={`Reorder ${project.name}`} {...attributes} {...listeners}>
  <GripVertical className="size-4" />
</button>
```

This preserves card buttons and context-menu interactions.

- [ ] **Step 5: Add collection sensors and authoritative persistence**

In `ProjectsPage`:

```tsx
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
);
```

Wrap cards with `DndContext` using `closestCenter` and `SortableContext` using `verticalListSortingStrategy`.

On drop or Move Up/Down:

1. snapshot current projects;
2. compute the next list;
3. set optimistic store order;
4. set `reorderBusy`;
5. invoke `reorder_projects` with every active ID exactly once;
6. replace store state with returned projects;
7. on error restore the snapshot and toast;
8. clear `reorderBusy`.

Ignore additional reorder input while one request is active.

- [ ] **Step 6: Test menu fallback and backend rollback**

In happy-dom, drive Move Down through the context menu and assert:

```ts
expect(mockInvoke).toHaveBeenCalledWith("reorder_projects", {
  orderedIds: ["proj-2", "proj-1"],
});
```

Make the invoke reject and assert the original visual order returns. Assert the drag handle has an accessible label and Move Up/Down disabled states are correct.

- [ ] **Step 7: Run desktop verification**

```bash
cd apps/desktop
pnpm exec vitest run src/lib/project-order.test.ts src/pages/ProjectsPage.test.tsx
pnpm test
pnpm build
```

Expected: tests and production build PASS.

- [ ] **Step 8: Commit Task 7**

```bash
git add apps/desktop/package.json pnpm-lock.yaml apps/desktop/src/lib/project-order.ts apps/desktop/src/lib/project-order.test.ts apps/desktop/src/features/projects/ProjectCard.tsx apps/desktop/src/pages/ProjectsPage.tsx apps/desktop/src/pages/ProjectsPage.test.tsx
git commit -m "feat(ui): persist accessible project ordering"
```

---

### Task 8: Capsule rename, duplication, and session preview

**Files:**
- Modify: `apps/desktop/src/pages/CapsulesPage.tsx`
- Modify: `apps/desktop/src/pages/CapsulesPage.test.tsx`

**Interfaces:**
- Consumes: `rename_task`, `duplicate_task`, expanded `Project.activeSeconds`, and `formatDuration`.
- Produces: capsule context actions and truthful Resume-preview session copy.

- [ ] **Step 1: Write failing capsule workflow tests**

```tsx
it("renames a capsule through rename_task", async () => {
  // open task menu -> Rename -> submit
  expect(mockInvoke).toHaveBeenCalledWith("rename_task", {
    id: FAKE_TASK.id,
    title: "Enterprise launch",
  });
});

it("duplicates a capsule without activating it", async () => {
  // open task menu -> Duplicate
  expect(mockInvoke).toHaveBeenCalledWith("duplicate_task", { id: FAKE_TASK.id });
  expect(mockInvoke).not.toHaveBeenCalledWith("activate_task", expect.anything());
});

it("shows persisted last-session duration only when available", async () => {
  // project activeSeconds = 8220
  expect(await screen.findByText("Last session 2h 17m")).toBeInTheDocument();
});
```

Add a zero-seconds case asserting no “Last session” claim.

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
cd apps/desktop
pnpm exec vitest run src/pages/CapsulesPage.test.tsx
```

Expected: FAIL because Rename/Duplicate/session preview do not exist.

- [ ] **Step 3: Extend `CapsuleSummary`**

Change its props to:

```ts
function CapsuleSummary({
  resources,
  lastSessionSeconds,
}: {
  resources: TaskResource[];
  lastSessionSeconds?: number;
})
```

Inside the popover, after the saved-resource list:

```tsx
{typeof lastSessionSeconds === "number" && lastSessionSeconds > 0 ? (
  <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
    Last session {formatDuration(lastSessionSeconds)}
  </p>
) : null}
```

Pass `p.activeSeconds` from the owning project group.

- [ ] **Step 4: Add rename and duplicate actions**

Add Rename and Duplicate before Done/Reopen in each task context menu. Rename uses one controlled dialog outside the map. Mutation handlers:

```ts
async function renameTask(id: string, title: string) {
  setBusy(true);
  try {
    await invoke<Task>("rename_task", { id, title: title.trim() });
    await refresh();
    toastOk("Capsule renamed");
  } catch (error) {
    toastErr(error);
  } finally {
    setBusy(false);
  }
}

async function duplicateTask(task: Task) {
  setBusy(true);
  try {
    const copy = await invoke<Task>("duplicate_task", { id: task.id });
    await refresh();
    toastOk("Capsule duplicated", copy.title);
  } catch (error) {
    toastErr(error);
  } finally {
    setBusy(false);
  }
}
```

- [ ] **Step 5: Run capsule and full desktop tests**

```bash
cd apps/desktop
pnpm exec vitest run src/pages/CapsulesPage.test.tsx
pnpm test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit Task 8**

```bash
git add apps/desktop/src/pages/CapsulesPage.tsx apps/desktop/src/pages/CapsulesPage.test.tsx
git commit -m "feat(ui): add capsule rename duplication and session preview"
```

---

### Task 9: Continue Working integration

**Files:**
- Modify: `apps/desktop/src/pages/OverviewPage.tsx`
- Modify: `apps/desktop/src/pages/OverviewPage.test.tsx`
- Modify: `apps/desktop/src/shell/CommandPalette.tsx`
- Modify: `apps/desktop/src/shell/CommandPalette.test.tsx`

**Interfaces:**
- Consumes: `Project.lastOpenedAt`, `lastTaskId`, `activeSeconds`, icon/duration helpers, and store `requestResume`.
- Produces: newest-first Continue Working cards routed through the existing CapsulesPage Resume signal.

- [ ] **Step 1: Write failing Overview and palette tests**

Assert:

```tsx
expect(screen.getByText("Continue Working")).toBeInTheDocument();
expect(screen.getByText("Last session 2h 17m")).toBeInTheDocument();
fireEvent.click(screen.getByRole("button", { name: "Resume Ship" }));
expect(useStore.getState().pendingResumeTaskId).toBe("task-ship");
expect(useStore.getState().view).toBe("capsules");
expect(mockInvoke).not.toHaveBeenCalledWith("activate_task", expect.anything());
```

Also assert projects with null `lastOpenedAt` are omitted and archived projects cannot appear because `list_projects` is the only source.

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
cd apps/desktop
pnpm exec vitest run src/pages/OverviewPage.test.tsx src/shell/CommandPalette.test.tsx
```

Expected: FAIL because Continue Working is absent and fixtures lack metadata.

- [ ] **Step 3: Implement Continue Working**

Derive:

```ts
const continueProjects = projects
  .filter((project) => project.lastOpenedAt)
  .sort((a, b) => Date.parse(b.lastOpenedAt!) - Date.parse(a.lastOpenedAt!))
  .slice(0, 5);
```

Resolve `lastTaskId` against already-loaded `tasks`. Render icon, project name, `Opened ${relativeTime(...)}`, optional `Last session ${formatDuration(...)}`, and the task title. Resume:

```ts
function resumeTask(taskId: string) {
  requestResume(taskId);
  setView("capsules");
}
```

If `lastTaskId` is stale, render project metadata with a View Capsules button instead of Resume.

- [ ] **Step 4: Keep palette data authoritative**

No new activation path is added. Update project icon rendering in palette and ensure every palette project/task comes only from active `projects`. Existing `requestResume` remains the sole Resume action.

- [ ] **Step 5: Run tests and commit**

```bash
cd apps/desktop
pnpm exec vitest run src/pages/OverviewPage.test.tsx src/shell/CommandPalette.test.tsx
pnpm test
```

Expected: all tests PASS.

```bash
git add apps/desktop/src/pages/OverviewPage.tsx apps/desktop/src/pages/OverviewPage.test.tsx apps/desktop/src/shell/CommandPalette.tsx apps/desktop/src/shell/CommandPalette.test.tsx
git commit -m "feat(ui): add persisted Continue Working context"
```

---

### Task 10: Backend session state machine with an injected clock

**Files:**
- Modify: `crates/omnibus-db/src/records.rs`
- Modify: `crates/omnibus-db/tests/records.rs`
- Modify: `apps/desktop/src-tauri/src/capsules.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/tests/capsules.rs`

**Interfaces:**
- Consumes: authoritative active task in `Capsules` and project session columns.
- Produces: `begin_project_session_for_task`, `add_active_seconds_for_task`, `session_update`, `session_heartbeat`, and final flush.

- [ ] **Step 1: Write failing database session tests**

```rust
#[test]
fn session_begin_resets_duration_and_accrual_credits_the_tasks_project() {
    let db = db();
    let p = a_project(&db, "Rabta");
    let t = db.create_task(NewTask { project_id: p.id.clone(), title: "Ship".into() }).unwrap();
    db.begin_project_session_for_task(&t.id, "2026-07-23T12:00:00Z").unwrap();
    db.add_active_seconds_for_task(&t.id, 17).unwrap();
    let current = db.get_project(&p.id).unwrap().unwrap();
    assert_eq!(current.last_task_id.as_deref(), Some(t.id.as_str()));
    assert_eq!(current.last_opened_at.as_deref(), Some("2026-07-23T12:00:00Z"));
    assert_eq!(current.active_seconds, 17);
    db.begin_project_session_for_task(&t.id, "2026-07-23T13:00:00Z").unwrap();
    assert_eq!(db.get_project(&p.id).unwrap().unwrap().active_seconds, 0);
}
```

Also test archived-project rejection, missing task, zero-second no-op, and checked/saturating conversion into SQLite `INTEGER`.

- [ ] **Step 2: Implement database session operations**

`begin_project_session_for_task` performs one update through the task relationship:

```sql
UPDATE projects
SET last_opened_at = ?2,
    last_task_id = ?1,
    active_seconds = 0,
    updated_at = ?2
WHERE id = (
  SELECT project_id FROM tasks WHERE id = ?1
)
AND archived_at IS NULL
```

`add_active_seconds_for_task` uses:

```sql
UPDATE projects
SET active_seconds = active_seconds + ?2,
    updated_at = ?3
WHERE id = (
  SELECT project_id FROM tasks WHERE id = ?1
)
AND archived_at IS NULL
```

Reject zero affected rows as missing/archived. Treat `seconds == 0` as a successful no-op only after verifying the task belongs to an active project.

- [ ] **Step 3: Write failing clock-driven capsule tests**

Introduce a fake monotonic/UTC clock and assert without sleeping:

```rust
#[tokio::test]
async fn session_credits_only_focused_non_idle_time_and_caps_sleep_gaps() {
    let fixture = session_fixture().await;
    fixture.capsules.activate_task(&fixture.task_id).await.unwrap();
    fixture.capsules.session_update(true, false).await.unwrap();
    fixture.clock.advance(Duration::from_secs(15));
    fixture.capsules.session_heartbeat().await.unwrap();
    assert_eq!(fixture.project().active_seconds, 15);

    fixture.capsules.session_update(false, false).await.unwrap();
    fixture.clock.advance(Duration::from_secs(15));
    fixture.capsules.session_heartbeat().await.unwrap();
    assert_eq!(fixture.project().active_seconds, 15);

    fixture.capsules.session_update(true, true).await.unwrap();
    fixture.clock.advance(Duration::from_secs(15));
    fixture.capsules.session_heartbeat().await.unwrap();
    assert_eq!(fixture.project().active_seconds, 15);

    fixture.capsules.session_update(true, false).await.unwrap();
    fixture.clock.advance(Duration::from_secs(3_600));
    fixture.capsules.session_heartbeat().await.unwrap();
    assert_eq!(fixture.project().active_seconds, 45);
}
```

Add switching-task, same-project reset, archive flush, and repeated-flush idempotency tests.

- [ ] **Step 4: Add the clock and session state**

```rust
pub trait SessionClock: Send + Sync {
    fn monotonic_now(&self) -> std::time::Instant;
    fn utc_now(&self) -> String;
}

struct SystemSessionClock;

impl SessionClock for SystemSessionClock {
    fn monotonic_now(&self) -> std::time::Instant { std::time::Instant::now() }
    fn utc_now(&self) -> String { chrono::Utc::now().to_rfc3339() }
}

struct SessionState {
    focused: bool,
    idle: bool,
    last_tick: std::time::Instant,
}
```

Add `chrono = "0.4"` to `apps/desktop/src-tauri/Cargo.toml`. `Capsules::new` uses `SystemSessionClock`; a `new_with_clock` constructor is `pub(crate)` or test-only.

- [ ] **Step 5: Implement session accrual in `Capsules`**

`flush_session`:

1. lock session state;
2. compute elapsed from the injected monotonic clock;
3. update `last_tick` immediately;
4. credit `min(elapsed, 30s).as_secs()` only when focused, not idle, and an active task exists;
5. drop locks before `spawn_blocking`;
6. persist with `add_active_seconds_for_task`.

`session_update(focused, idle)` flushes the previous state first, then stores the new state and baseline. `session_heartbeat()` only flushes.

In `activate_task`:

1. validate the target task/project and load its resources before changing active state;
2. flush the previous session;
3. run the existing best-effort save of the previous task;
4. call `begin_project_session_for_task(task_id, clock.utc_now())`;
5. set the new active task and reset the monotonic baseline;
6. restore the already-loaded target resources and return connector problems through the existing `ActivateSummary`.

If session-begin persistence fails, return before changing the active task or restoring the target workspace. This avoids a visually switched workspace with missing session metadata.

- [ ] **Step 6: Add and register session commands**

```rust
#[tauri::command]
async fn session_update(
    caps: State<'_, CapsulesHandle>,
    focused: bool,
    idle: bool,
) -> Result<(), String> {
    caps.0.session_update(focused, idle).await
}

#[tauri::command]
async fn session_heartbeat(caps: State<'_, CapsulesHandle>) -> Result<(), String> {
    caps.0.session_heartbeat().await
}
```

Register both commands.

- [ ] **Step 7: Run backend verification**

```bash
cargo test -p rabta-db
cargo test -p rabta-desktop
cargo build
```

Expected: all tests and build PASS with no wall-clock sleeps in session tests.

- [ ] **Step 8: Commit Task 10**

```bash
git add crates/omnibus-db/src/records.rs crates/omnibus-db/tests/records.rs apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/src/capsules.rs apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/tests/capsules.rs Cargo.lock
git commit -m "feat(app): persist focused active-session duration"
```

---

### Task 11: Frontend focus/idle bridge and shutdown flush

**Files:**
- Create: `apps/desktop/src/lib/useSessionTracking.ts`
- Create: `apps/desktop/src/lib/useSessionTracking.test.tsx`
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/App.test.tsx`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/tests/capsules.rs`

**Interfaces:**
- Consumes: `session_update`, `session_heartbeat`, and `Capsules::flush_session`.
- Produces: lifecycle-complete session signaling and best-effort final persistence.

- [ ] **Step 1: Write failing hook tests with fake timers**

Cover:

```tsx
it("reports initial focus, idles at 60s, resumes on activity, and heartbeats at 15s", async () => {
  vi.useFakeTimers();
  renderHook(() => useSessionTracking());
  expect(mockInvoke).toHaveBeenCalledWith("session_update", {
    focused: document.hasFocus() && !document.hidden,
    idle: false,
  });
  await vi.advanceTimersByTimeAsync(15_000);
  expect(mockInvoke).toHaveBeenCalledWith("session_heartbeat");
  await vi.advanceTimersByTimeAsync(45_000);
  expect(mockInvoke).toHaveBeenCalledWith("session_update", {
    focused: document.hasFocus() && !document.hidden,
    idle: true,
  });
  fireEvent.keyDown(window, { key: "a" });
  expect(mockInvoke).toHaveBeenCalledWith("session_update", {
    focused: document.hasFocus() && !document.hidden,
    idle: false,
  });
});
```

Also test blur, focus, `visibilitychange`, pointer activity throttling, listener cleanup, and invoke rejection logging without an unhandled promise.

- [ ] **Step 2: Run the hook test and confirm failure**

```bash
cd apps/desktop
pnpm exec vitest run src/lib/useSessionTracking.test.tsx
```

Expected: FAIL because the hook does not exist.

- [ ] **Step 3: Implement the hook**

Use constants:

```ts
const IDLE_MS = 60_000;
const HEARTBEAT_MS = 15_000;
```

Maintain `focusedRef`, `idleRef`, and one idle timeout. `report()` invokes:

```ts
invoke("session_update", {
  focused: focusedRef.current && !document.hidden,
  idle: idleRef.current,
}).catch((error) => console.error("session update failed:", error));
```

Activity events are `keydown`, `pointerdown`, `pointermove`, and `scroll`. Pointer movement only triggers a backend call when transitioning from idle to active; while active it only resets the local idle timeout. Focus/blur/visibility always report a transition. One interval invokes `session_heartbeat` every 15 seconds. Cleanup removes every listener and timer.

- [ ] **Step 4: Mount once in `App`**

Call:

```ts
useSessionTracking();
```

at the top of `App`, after store hooks and before other effects. Do not mount per page.

- [ ] **Step 5: Convert Tauri builder to `build` + `App::run` and flush**

Prefix the existing builder expression with `let app =`, preserve its plugin, setup closure, and complete Task-4/Task-10 handler list, and replace only the terminal `.run(...).expect(...)` call with:

```rust
    .build(tauri::generate_context!())
    .expect("error while building Rabta");

app.run(|handle, event| {
    if matches!(event, tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit) {
        let capsules = handle.state::<CapsulesHandle>().0.clone();
        if let Err(error) = tauri::async_runtime::block_on(capsules.flush_session()) {
            log::warn!("final session flush failed: {error}");
        }
    }
});
```

Do not prevent exit. Repeated exit events are safe because every flush advances the monotonic baseline.

- [ ] **Step 6: Run frontend and backend verification**

```bash
cd apps/desktop
pnpm exec vitest run src/lib/useSessionTracking.test.tsx src/App.test.tsx
pnpm test
pnpm build
cd ../..
cargo test -p rabta-desktop
cargo build
```

Expected: all tests and builds PASS.

- [ ] **Step 7: Commit Task 11**

```bash
git add apps/desktop/src/lib/useSessionTracking.ts apps/desktop/src/lib/useSessionTracking.test.tsx apps/desktop/src/App.tsx apps/desktop/src/App.test.tsx apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/tests/capsules.rs
git commit -m "feat(app): track focus idle and session lifecycle"
```

---

### Task 12: Whole-feature hardening, documentation, and acceptance verification

**Files:**
- Modify: `docs/superpowers/STATUS.md`
- Test-only fixes, if a verification command fails, stay in the exact file and test pair owned by Tasks 1–11 and receive their own focused commit before this documentation task.

**Interfaces:**
- Consumes: complete B1–B3 implementation.
- Produces: verified Track B core and an accurate handoff for B4–B5.

- [ ] **Step 1: Run formatting and static checks**

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cd apps/desktop
pnpm build
```

Expected: all commands exit 0 with no warnings promoted by Clippy.

- [ ] **Step 2: Run the complete automated suite**

```bash
cd /Users/sammy/omnibus
cargo test --workspace
cd apps/desktop
pnpm test
```

Expected: every Rust and Vitest test passes.

- [ ] **Step 3: Verify a real schema-v1 file upgrades in place**

Run the tempfile-backed migration test created in Task 1:

```bash
cargo test -p rabta-db migration_two_preserves_version_one_records
```

Expected: PASS. The test creates a real temporary schema-v1 SQLite file, reopens it through `Db::open`, observes schema version 2, and proves the original project, task, and resource IDs remain. It never touches the user's real `omnibus.db`.

- [ ] **Step 4: Run manual GUI acceptance**

Launch:

```bash
cd apps/desktop
pnpm tauri dev
```

Record results for:

1. Rename project and capsule.
2. Choose/default a project icon.
3. Drag reorder and keyboard reorder; relaunch and confirm order.
4. Archive, Undo, Archived Restore, and permanent Delete safety.
5. Duplicate a capsule and confirm resources but no automatic activation/branch switch.
6. Resume and confirm last-open/session copy.
7. Keep focused for at least 20 seconds, blur, idle for 60 seconds, refocus, and confirm only eligible time accrues.
8. Sidebar collapse and `⌘\`.
9. Move/resize, quit, relaunch, and confirm window state.

Expected: every item matches the approved spec. GUI-only failures become focused tests before fixes.

- [ ] **Step 5: Update the status handoff**

Change `docs/superpowers/STATUS.md` to:

- mark B1–B3 complete with the final commit range;
- list B4 connector version reporting as next;
- list B5 packaging/signing/hardening after B4;
- retain any unresolved manual-only result explicitly;
- replace the old desktop test count with the actual final Vitest count printed in Step 2.

- [ ] **Step 6: Commit final hardening and status**

```bash
git add docs/superpowers/STATUS.md
git commit -m "docs: complete Track B core handoff"
```

- [ ] **Step 7: Final evidence check**

```bash
git status --short
git log --oneline -15
```

Expected: clean working tree and a reviewable Task 1–12 commit sequence. Do not claim complete unless the automated suite is green and manual-only items are either verified or explicitly recorded as pending.
