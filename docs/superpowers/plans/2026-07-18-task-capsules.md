# Task Capsules (Phase 8) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tasks remember and restore working state: explicit save + auto-save-on-switch into `task_resources`, restore across connectors including the editor's cross-folder window reload, with task management UI under projects.

**Architecture:** `capsules.rs` in the desktop crate orchestrates (hub commands in, db rows out, active-task + pending-restore state, reconnect continuation); Tauri commands are thin; UI is a tasks section inside the Projects view. Hub/protocol/SDK/connectors unchanged.

**Tech Stack:** existing stack; desktop crate gains dev-deps `tokio-tungstenite`/`futures-util` for scripted-connector integration tests.

**Spec:** `docs/superpowers/specs/2026-07-18-omnibus-task-capsules-design.md` — read before starting. Foundation Principles / Coding standards / DoD + vision Privacy Principles bind every task.

## Global Constraints

- Capsule = one `task_resources` row per (task, connector kind), `resource_type: "workspace"`, payload = the connector's `workspace.state` reply. Save replaces rows per kind captured now; other kinds' rows untouched. Latest-only.
- Capturable kinds: exactly `["vscode", "fake"]`.
- Restore: best-effort per connector, never all-or-nothing; individual failures collected into summaries, not fatal.
- Cross-folder restore: send `workspace.open`, store ONE pending restore (new activation replaces it), complete on `ConnectorConnected` of the same kind after a settle delay (default **1500 ms**, constructor-configurable for tests).
- Active task is in-memory only. Auto-save of the outgoing task happens before restoring the incoming one; its failure is reported, never blocks activation.
- Saves happen ONLY via explicit save or task switch — no background capture.
- Hub, protocol, SDK, and connectors are NOT modified.
- Builds warning-free; public items documented. Environment: cargo NOT on default PATH (`export PATH="$HOME/.cargo/bin:$PATH"`); generous timeouts.

---

### Task 1: `omnibus-db::replace_task_resources`

**Files:**
- Modify: `crates/omnibus-db/src/records.rs`
- Test: `crates/omnibus-db/tests/records.rs` (append)

**Interfaces:**
- Consumes: existing `Db`, `task_resources` table, `now()`/`new_id()`.
- Produces (Task 2 relies on the exact signature): `Db::replace_task_resources(&self, task_id: &str, connector_kind: &str, resource_type: &str, payload: &serde_json::Value) -> Result<TaskResource>` — deletes that task's rows for `connector_kind`, inserts one new row, atomically (single transaction).

- [ ] **Step 1: Failing tests** — append to `crates/omnibus-db/tests/records.rs`:

```rust
#[test]
fn replace_task_resources_replaces_only_that_kind() {
    let db = db();
    let p = a_project(&db, "omnibus");
    let t = db.create_task(NewTask { project_id: p.id.clone(), title: "t".into() }).unwrap();
    db.add_task_resource(NewTaskResource {
        task_id: t.id.clone(),
        connector_kind: "chrome".into(),
        resource_type: "tabs".into(),
        payload: json!({"tabs": []}),
    })
    .unwrap();
    db.replace_task_resources(&t.id, "vscode", "workspace", &json!({"openFiles": ["a.ts"]})).unwrap();
    let replaced =
        db.replace_task_resources(&t.id, "vscode", "workspace", &json!({"openFiles": ["b.ts"]})).unwrap();
    assert_eq!(replaced.connector_kind, "vscode");
    assert_eq!(replaced.payload, json!({"openFiles": ["b.ts"]}));

    let all = db.task_resources(&t.id).unwrap();
    assert_eq!(all.len(), 2, "chrome row untouched, single vscode row");
    let kinds: Vec<&str> = all.iter().map(|r| r.connector_kind.as_str()).collect();
    assert!(kinds.contains(&"chrome") && kinds.contains(&"vscode"));
    let vs = all.iter().find(|r| r.connector_kind == "vscode").unwrap();
    assert_eq!(vs.payload, json!({"openFiles": ["b.ts"]}), "old vscode row replaced");
}
```

- [ ] **Step 2: RED** — `cargo test -p omnibus-db --test records` → compile error, no `replace_task_resources`.

- [ ] **Step 3: Implement** — append to the `impl Db` block in `crates/omnibus-db/src/records.rs`:

```rust
    /// Replaces a task's resources for one connector kind with a single new
    /// row (capsules are latest-only per kind). Atomic: delete + insert in
    /// one transaction; rows for other kinds are untouched.
    pub fn replace_task_resources(
        &self,
        task_id: &str,
        connector_kind: &str,
        resource_type: &str,
        payload: &Value,
    ) -> Result<TaskResource> {
        let r = TaskResource {
            id: new_id(),
            task_id: task_id.to_string(),
            connector_kind: connector_kind.to_string(),
            resource_type: resource_type.to_string(),
            payload: payload.clone(),
            created_at: now(),
        };
        let conn = self.conn.lock().unwrap();
        let tx = conn.unchecked_transaction()?;
        tx.execute(
            "DELETE FROM task_resources WHERE task_id = ?1 AND connector_kind = ?2",
            params![task_id, connector_kind],
        )?;
        tx.execute(
            "INSERT INTO task_resources (id, task_id, connector_kind, resource_type, payload, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![r.id, r.task_id, r.connector_kind, r.resource_type, r.payload.to_string(), r.created_at],
        )?;
        tx.commit()?;
        Ok(r)
    }
```

- [ ] **Step 4: GREEN** — `cargo test -p omnibus-db` all green, zero warnings.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: latest-only per-kind capsule replace in omnibus-db"`

---

### Task 2: `capsules.rs` orchestrator + integration tests

**Files:**
- Create: `apps/desktop/src-tauri/src/capsules.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs` (add `pub mod capsules;` — one line only in this task)
- Modify: `apps/desktop/src-tauri/Cargo.toml` (dev-deps)
- Test: `apps/desktop/src-tauri/tests/capsules.rs`

**Interfaces:**
- Consumes: `omnibus_hub::{Hub, HubConfig, HubEvent, ConnectorInfo}`, `omnibus_hub::protocol::ConnectorKind`, `omnibus_db::{Db, DbError}` + Task 1's `replace_task_resources`, `Db::task_resources`.
- Produces (Task 3 wraps exactly):
  - `Capsules::new(hub: Arc<Hub>, db: Db, settle: Duration) -> Capsules` (`Clone`)
  - `Capsules::spawn_continuation(&self)` — starts the reconnect-continuation subscriber (idempotent by convention: called once from setup)
  - `async Capsules::save_capsule(&self, task_id: &str) -> Result<SaveSummary, String>`
  - `async Capsules::activate_task(&self, task_id: &str) -> Result<ActivateSummary, String>`
  - `Capsules::active_task(&self) -> Option<String>`
  - `SaveSummary { captured: Vec<String>, skipped: Vec<String> }`, `ActivateSummary { applied: Vec<String>, pending: Vec<String>, skipped: Vec<String>, saved_previous: Option<String>, errors: Vec<String> }` — both Serialize camelCase.

- [ ] **Step 1: dev-deps + failing tests**

`apps/desktop/src-tauri/Cargo.toml` `[dev-dependencies]` becomes:
```toml
[dev-dependencies]
tempfile = "3"
tokio-tungstenite = "0.24"
futures-util = "0.3"
```
(`tokio` is already a direct dependency with the `sync` feature; tests need macros/rt — extend that line to `tokio = { version = "1", features = ["sync", "macros", "rt-multi-thread", "time"] }`.)

`apps/desktop/src-tauri/tests/capsules.rs`:
```rust
use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use omnibus_db::{Db, DbConfig, NewProject, NewTask};
use omnibus_desktop_lib::capsules::Capsules;
use omnibus_hub::{Hub, HubConfig};
use serde_json::{json, Value};
use tokio::sync::mpsc;

type Ws = tokio_tungstenite::WebSocketStream<
    tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
>;

/// Connects a scripted `vscode`-kind connector. Every command it receives is
/// forwarded to `seen`; replies come from `respond`.
async fn scripted_connector(
    port: u16,
    seen: mpsc::UnboundedSender<(String, Value)>,
    respond: impl Fn(&str, &Value) -> Value + Send + 'static,
) -> tokio::task::JoinHandle<()> {
    let (mut ws, _) =
        tokio_tungstenite::connect_async(format!("ws://127.0.0.1:{port}")).await.unwrap();
    ws.send(
        json!({"v":1,"id":"h","kind":"hello","payload":{"name":"vscode","kind":"vscode","protocolVersion":1,"capabilities":["workspace","editor","terminal"]}})
            .to_string()
            .into(),
    )
    .await
    .unwrap();
    ws.next().await; // welcome
    tokio::spawn(async move { pump(ws, seen, respond).await })
}

async fn pump(
    mut ws: Ws,
    seen: mpsc::UnboundedSender<(String, Value)>,
    respond: impl Fn(&str, &Value) -> Value,
) {
    while let Some(Ok(frame)) = ws.next().await {
        let Ok(txt) = frame.to_text() else { continue };
        let Ok(env) = serde_json::from_str::<Value>(txt) else { continue };
        match env["kind"].as_str() {
            Some("ping") => {
                let _ = ws
                    .send(json!({"v":1,"id":"p","kind":"pong","payload":{}}).to_string().into())
                    .await;
            }
            Some("command") => {
                let name = env["payload"]["name"].as_str().unwrap_or("").to_string();
                let args = env["payload"]["args"].clone();
                let result = respond(&name, &args);
                let _ = seen.send((name, args));
                let resp = json!({"v":1,"id":"r","kind":"response","payload":{
                    "requestId": env["id"], "ok": true, "result": result
                }});
                let _ = ws.send(resp.to_string().into()).await;
            }
            _ => {}
        }
    }
}

fn state(folder: &str, files: &[&str]) -> Value {
    json!({
        "workspaceFolder": folder,
        "openFiles": files,
        "activeFile": files.first(),
        "terminals": [{"name": "zsh", "cwd": folder}]
    })
}

async fn setup() -> (Arc<Hub>, Db, Capsules, String, tempfile::TempDir) {
    let dir = tempfile::tempdir().unwrap();
    let hub = Arc::new(Hub::start(HubConfig::new(dir.path().to_path_buf())).await.unwrap());
    let db = Db::open_in_memory(DbConfig::default()).unwrap();
    let p = db
        .create_project(NewProject {
            name: "proj".into(),
            repo_path: "/tmp/proj".into(),
            dev_url: None,
            default_branch: "main".into(),
        })
        .unwrap();
    let t = db.create_task(NewTask { project_id: p.id, title: "task".into() }).unwrap();
    let capsules = Capsules::new(hub.clone(), db.clone(), Duration::from_millis(50));
    (hub, db, capsules, t.id, dir)
}

#[tokio::test]
async fn save_capsule_captures_workspace_state_into_rows() {
    let (hub, db, capsules, task_id, _dir) = setup().await;
    let (tx, _rx) = mpsc::unbounded_channel();
    let _conn = scripted_connector(hub.port(), tx, |name, _| match name {
        "workspace.state" => state("/repo/a", &["/repo/a/main.ts"]),
        _ => json!({}),
    })
    .await;
    tokio::time::sleep(Duration::from_millis(100)).await; // registration settles

    let summary = capsules.save_capsule(&task_id).await.unwrap();
    assert_eq!(summary.captured, vec!["vscode"]);

    let rows = db.task_resources(&task_id).unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].connector_kind, "vscode");
    assert_eq!(rows[0].resource_type, "workspace");
    assert_eq!(rows[0].payload["openFiles"], json!(["/repo/a/main.ts"]));
}

#[tokio::test]
async fn activate_same_folder_opens_files_and_terminals() {
    let (hub, db, capsules, task_id, _dir) = setup().await;
    db.replace_task_resources(&task_id, "vscode", "workspace", &state("/repo/a", &["/repo/a/x.ts", "/repo/a/y.ts"]))
        .unwrap();
    let (tx, mut rx) = mpsc::unbounded_channel();
    let _conn = scripted_connector(hub.port(), tx, |name, _| match name {
        "workspace.state" => state("/repo/a", &[]), // same folder, no files open
        _ => json!({}),
    })
    .await;
    tokio::time::sleep(Duration::from_millis(100)).await;

    let summary = capsules.activate_task(&task_id).await.unwrap();
    assert_eq!(summary.applied, vec!["vscode"]);
    assert!(summary.pending.is_empty());
    assert_eq!(capsules.active_task().as_deref(), Some(task_id.as_str()));

    let mut names = vec![];
    while let Ok((name, args)) = rx.try_recv() {
        names.push(format!("{name}:{}", args["path"].as_str().or(args["cwd"].as_str()).unwrap_or("")));
    }
    assert!(names.contains(&"workspace.state:".to_string()));
    assert!(names.contains(&"editor.openFile:/repo/a/x.ts".to_string()));
    assert!(names.contains(&"editor.openFile:/repo/a/y.ts".to_string()));
    assert!(names.contains(&"terminal.create:/repo/a".to_string()));
}

#[tokio::test]
async fn activate_cross_folder_defers_and_continues_on_reconnect() {
    let (hub, db, capsules, task_id, _dir) = setup().await;
    capsules.spawn_continuation_on(tokio::runtime::Handle::current());
    db.replace_task_resources(&task_id, "vscode", "workspace", &state("/repo/b", &["/repo/b/z.ts"]))
        .unwrap();
    let (tx, rx_ignored) = mpsc::unbounded_channel();
    drop(rx_ignored);
    let conn = scripted_connector(hub.port(), tx, |name, _| match name {
        "workspace.state" => state("/repo/a", &[]), // WRONG folder
        _ => json!({}),
    })
    .await;
    tokio::time::sleep(Duration::from_millis(100)).await;

    let summary = capsules.activate_task(&task_id).await.unwrap();
    assert_eq!(summary.pending, vec!["vscode"]);
    assert!(summary.applied.is_empty());

    // Simulate the window reload: drop the connection, reconnect.
    conn.abort();
    tokio::time::sleep(Duration::from_millis(100)).await;
    let (tx2, mut rx2) = mpsc::unbounded_channel();
    let _conn2 = scripted_connector(hub.port(), tx2, |_, _| json!({})).await;

    // settle (50ms in tests) + margin, then the continuation must have fired
    tokio::time::sleep(Duration::from_millis(700)).await;
    let mut names = vec![];
    while let Ok((name, args)) = rx2.try_recv() {
        names.push(format!("{name}:{}", args["path"].as_str().or(args["cwd"].as_str()).unwrap_or("")));
    }
    assert!(names.contains(&"editor.openFile:/repo/b/z.ts".to_string()), "got {names:?}");
    assert!(names.contains(&"terminal.create:/repo/b".to_string()), "got {names:?}");
}

#[tokio::test]
async fn activating_b_autosaves_active_a_first() {
    let (hub, db, capsules, task_a, _dir) = setup().await;
    let p2 = db.list_projects().unwrap().remove(0);
    let task_b = db.create_task(NewTask { project_id: p2.id, title: "b".into() }).unwrap().id;
    let (tx, _rx) = mpsc::unbounded_channel();
    let _conn = scripted_connector(hub.port(), tx, |name, _| match name {
        "workspace.state" => state("/repo/a", &["/repo/a/current.ts"]),
        _ => json!({}),
    })
    .await;
    tokio::time::sleep(Duration::from_millis(100)).await;

    capsules.activate_task(&task_a).await.unwrap(); // A active (no capsule; fine)
    let summary = capsules.activate_task(&task_b).await.unwrap();
    assert_eq!(summary.saved_previous.as_deref(), Some(task_a.as_str()));

    let rows = db.task_resources(&task_a).unwrap();
    assert_eq!(rows.len(), 1, "A got auto-saved on switch");
    assert_eq!(rows[0].payload["openFiles"], json!(["/repo/a/current.ts"]));
}
```

Note the test uses `spawn_continuation_on(handle)` — provide both `spawn_continuation(&self)` (uses `tauri::async_runtime::spawn`, for the app) and `spawn_continuation_on(&self, handle: tokio::runtime::Handle)` (plain tokio spawn, for tests). Same loop body, factored into a private async fn.

- [ ] **Step 2: RED** — `cargo test -p omnibus-desktop --test capsules` → compile error, no `capsules` module.

- [ ] **Step 3: Implement `apps/desktop/src-tauri/src/capsules.rs`**

```rust
//! Task capsules: capture connected connectors' state into task resources
//! and restore it on activation. App-level orchestration — the hub routes,
//! the db stores, this module decides.
use std::sync::{Arc, Mutex};
use std::time::Duration;

use omnibus_db::Db;
use omnibus_hub::protocol::ConnectorKind;
use omnibus_hub::{ConnectorInfo, Hub, HubEvent};
use serde::Serialize;
use serde_json::{json, Value};

/// Connector kinds capsules know how to capture and restore.
const CAPTURABLE: &[&str] = &["vscode", "fake"];

/// Result of an explicit or automatic capsule save.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SaveSummary {
    pub captured: Vec<String>,
    pub skipped: Vec<String>,
}

/// Result of a task activation (restore).
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ActivateSummary {
    pub applied: Vec<String>,
    pub pending: Vec<String>,
    pub skipped: Vec<String>,
    pub saved_previous: Option<String>,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone)]
struct PendingRestore {
    kind: String,
    open_files: Vec<String>,
    terminals: Vec<(String, Option<String>)>, // (cwd, name)
}

/// Capsule orchestrator. Cheap to clone; one per app.
#[derive(Clone)]
pub struct Capsules {
    hub: Arc<Hub>,
    db: Db,
    settle: Duration,
    active_task: Arc<Mutex<Option<String>>>,
    pending: Arc<Mutex<Option<PendingRestore>>>,
}

fn kind_str(kind: ConnectorKind) -> &'static str {
    match kind {
        ConnectorKind::Fake => "fake",
        ConnectorKind::Vscode => "vscode",
        ConnectorKind::Chrome => "chrome",
    }
}

impl Capsules {
    /// `settle` is the wait between a connector re-registering and the
    /// pending restore being applied (spec default 1500 ms; short in tests).
    pub fn new(hub: Arc<Hub>, db: Db, settle: Duration) -> Capsules {
        Capsules {
            hub,
            db,
            settle,
            active_task: Arc::new(Mutex::new(None)),
            pending: Arc::new(Mutex::new(None)),
        }
    }

    /// The task currently considered active (in-memory, this phase).
    pub fn active_task(&self) -> Option<String> {
        self.active_task.lock().unwrap().clone()
    }

    /// Captures `workspace.state` from every connected capturable connector
    /// into the task's capsule (latest-only per kind).
    pub async fn save_capsule(&self, task_id: &str) -> Result<SaveSummary, String> {
        let mut captured = vec![];
        let mut skipped = vec![];
        for c in self.hub.connectors().await {
            let kind = kind_str(c.kind);
            if !CAPTURABLE.contains(&kind) {
                continue;
            }
            match self.hub.send_command(&c.id, "workspace.state", json!({})).await {
                Ok(state) => {
                    let db = self.db.clone();
                    let (tid, k) = (task_id.to_string(), kind.to_string());
                    tokio::task::spawn_blocking(move || {
                        db.replace_task_resources(&tid, &k, "workspace", &state)
                    })
                    .await
                    .map_err(|e| e.to_string())?
                    .map_err(|e| e.to_string())?;
                    captured.push(kind.to_string());
                }
                Err(e) => skipped.push(format!("{kind}: {e}")),
            }
        }
        Ok(SaveSummary { captured, skipped })
    }

    /// Auto-saves the outgoing active task (if any), then restores `task_id`'s
    /// capsule best-effort per connector, and marks it active.
    pub async fn activate_task(&self, task_id: &str) -> Result<ActivateSummary, String> {
        let mut errors = vec![];
        let previous = self.active_task();
        let mut saved_previous = None;
        if let Some(prev) = previous.filter(|p| p != task_id) {
            match self.save_capsule(&prev).await {
                Ok(_) => saved_previous = Some(prev),
                Err(e) => errors.push(format!("auto-save of previous task failed: {e}")),
            }
        }

        let resources = {
            let db = self.db.clone();
            let tid = task_id.to_string();
            tokio::task::spawn_blocking(move || db.task_resources(&tid))
                .await
                .map_err(|e| e.to_string())?
                .map_err(|e| e.to_string())?
        };

        let connectors = self.hub.connectors().await;
        let mut applied = vec![];
        let mut pending = vec![];
        let mut skipped = vec![];
        for r in resources.iter().filter(|r| r.resource_type == "workspace") {
            let Some(conn) = connectors.iter().find(|c| kind_str(c.kind) == r.connector_kind)
            else {
                skipped.push(r.connector_kind.clone());
                continue;
            };
            match r.connector_kind.as_str() {
                "vscode" => {
                    match self.restore_vscode(conn, &r.payload, &mut errors).await {
                        RestoreOutcome::Applied => applied.push("vscode".into()),
                        RestoreOutcome::Pending => pending.push("vscode".into()),
                    }
                }
                "fake" => {
                    if let Some(folder) = r.payload["workspaceFolder"].as_str() {
                        if let Err(e) = self
                            .hub
                            .send_command(&conn.id, "workspace.open", json!({ "path": folder }))
                            .await
                        {
                            errors.push(format!("fake workspace.open: {e}"));
                        } else {
                            applied.push("fake".into());
                        }
                    }
                }
                _ => skipped.push(r.connector_kind.clone()),
            }
        }

        *self.active_task.lock().unwrap() = Some(task_id.to_string());
        Ok(ActivateSummary { applied, pending, skipped, saved_previous, errors })
    }

    async fn restore_vscode(
        &self,
        conn: &ConnectorInfo,
        payload: &Value,
        errors: &mut Vec<String>,
    ) -> RestoreOutcome {
        let target_folder = payload["workspaceFolder"].as_str();
        let open_files: Vec<String> = payload["openFiles"]
            .as_array()
            .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
            .unwrap_or_default();
        let terminals: Vec<(String, Option<String>)> = payload["terminals"]
            .as_array()
            .map(|a| {
                a.iter()
                    .filter_map(|t| {
                        t["cwd"].as_str().map(|cwd| {
                            (cwd.to_string(), t["name"].as_str().map(String::from))
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();

        let current = self.hub.send_command(&conn.id, "workspace.state", json!({})).await;
        let current_folder =
            current.as_ref().ok().and_then(|s| s["workspaceFolder"].as_str().map(String::from));

        match target_folder {
            Some(target) if current_folder.as_deref() != Some(target) => {
                *self.pending.lock().unwrap() = Some(PendingRestore {
                    kind: "vscode".into(),
                    open_files,
                    terminals,
                });
                if let Err(e) = self
                    .hub
                    .send_command(&conn.id, "workspace.open", json!({ "path": target }))
                    .await
                {
                    errors.push(format!("workspace.open: {e}"));
                }
                RestoreOutcome::Pending
            }
            _ => {
                self.apply_editor_state(&conn.id, &open_files, &terminals, errors).await;
                RestoreOutcome::Applied
            }
        }
    }

    async fn apply_editor_state(
        &self,
        connector_id: &str,
        open_files: &[String],
        terminals: &[(String, Option<String>)],
        errors: &mut Vec<String>,
    ) {
        for path in open_files {
            if let Err(e) =
                self.hub.send_command(connector_id, "editor.openFile", json!({ "path": path })).await
            {
                errors.push(format!("openFile {path}: {e}"));
            }
        }
        for (cwd, name) in terminals {
            if let Err(e) = self
                .hub
                .send_command(connector_id, "terminal.create", json!({ "cwd": cwd, "name": name }))
                .await
            {
                errors.push(format!("terminal.create {cwd}: {e}"));
            }
        }
    }

    /// Starts the reconnect continuation on Tauri's runtime (app path).
    pub fn spawn_continuation(&self) {
        let me = self.clone();
        tauri::async_runtime::spawn(async move { me.continuation_loop().await });
    }

    /// Starts the reconnect continuation on an explicit runtime (test path).
    pub fn spawn_continuation_on(&self, handle: tokio::runtime::Handle) {
        let me = self.clone();
        handle.spawn(async move { me.continuation_loop().await });
    }

    /// Completes a pending cross-folder restore when a connector of the
    /// pending kind re-registers after its window reload.
    async fn continuation_loop(&self) {
        use tokio::sync::broadcast::error::RecvError;
        let mut events = self.hub.subscribe();
        loop {
            match events.recv().await {
                Ok(HubEvent::ConnectorConnected { connector }) => {
                    let taken = {
                        let mut slot = self.pending.lock().unwrap();
                        if slot.as_ref().map(|p| p.kind == kind_str(connector.kind)).unwrap_or(false)
                        {
                            slot.take()
                        } else {
                            None
                        }
                    };
                    if let Some(p) = taken {
                        tokio::time::sleep(self.settle).await;
                        let mut errors = vec![];
                        self.apply_editor_state(&connector.id, &p.open_files, &p.terminals, &mut errors)
                            .await;
                        for e in errors {
                            eprintln!("capsule continuation: {e}");
                        }
                    }
                }
                Ok(_) => {}
                Err(RecvError::Lagged(_)) => continue,
                Err(RecvError::Closed) => break,
            }
        }
    }
}

enum RestoreOutcome {
    Applied,
    Pending,
}
```

Add to `apps/desktop/src-tauri/src/lib.rs`: `pub mod capsules;`

- [ ] **Step 4: GREEN** — `cargo test -p omnibus-desktop --test capsules` → 4 tests pass; full `cargo test` green, zero warnings.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: capsule orchestrator with cross-folder continuation, integration-tested"`

---

### Task 3: Tauri commands + setup wiring

**Files:**
- Modify: `apps/desktop/src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `Capsules` (Task 2), existing `HubHandle`/`DbHandle`.
- Produces (Task 4 frontend contract): commands `save_capsule{taskId}` → SaveSummary, `activate_task{taskId}` → ActivateSummary, `active_task{}` → string|null, `create_task{projectId,title}` → Task, `list_tasks{projectId}` → Task[], `set_task_status{id,status}` ("open"|"done"), `delete_task{id}`, `task_resources{taskId}` → TaskResource[]. `HubHandle` now wraps `Arc<Hub>`.

- [ ] **Step 1: Wire it**

In `apps/desktop/src-tauri/src/lib.rs`:

1. Imports: add `use std::sync::Arc; use std::time::Duration; use omnibus_db::{NewTask, Task, TaskResource, TaskStatus}; use crate::capsules::{ActivateSummary, Capsules, SaveSummary};`
2. Change `struct HubHandle(Hub);` → `struct HubHandle(Arc<Hub>);` and add `struct CapsulesHandle(Capsules);` (existing command bodies keep working — `state.0.connectors()` etc. auto-deref through Arc).
3. In `setup`, after `app.manage(DbHandle(db))` (adjust ordering as needed):
```rust
            let hub = Arc::new(hub);
            let capsules = Capsules::new(hub.clone(), db.clone(), Duration::from_millis(1500));
            capsules.spawn_continuation();
            app.manage(HubHandle(hub));
            app.manage(CapsulesHandle(capsules));
```
(Replace the previous `app.manage(HubHandle(hub))`; the two `hub.subscribe()` calls in setup must run on the `Arc<Hub>` — subscribe before or after wrapping, both fine.)
4. New commands:
```rust
/// Captures connected connectors' state into the task's capsule.
#[tauri::command]
async fn save_capsule(caps: State<'_, CapsulesHandle>, task_id: String) -> Result<SaveSummary, String> {
    caps.0.save_capsule(&task_id).await
}

/// Auto-saves the outgoing task, restores this task's capsule, marks it active.
#[tauri::command]
async fn activate_task(caps: State<'_, CapsulesHandle>, task_id: String) -> Result<ActivateSummary, String> {
    caps.0.activate_task(&task_id).await
}

/// The in-memory active task id, if any.
#[tauri::command]
fn active_task(caps: State<'_, CapsulesHandle>) -> Option<String> {
    caps.0.active_task()
}

/// Creates a task under a project (status `open`).
#[tauri::command]
async fn create_task(db: State<'_, DbHandle>, project_id: String, title: String) -> Result<Task, String> {
    let db = db.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        db.create_task(NewTask { project_id, title }).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Tasks for one project, newest first.
#[tauri::command]
async fn list_tasks(db: State<'_, DbHandle>, project_id: String) -> Result<Vec<Task>, String> {
    let db = db.0.clone();
    tauri::async_runtime::spawn_blocking(move || db.list_tasks(&project_id).map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

/// Sets a task's status; accepts "open" or "done".
#[tauri::command]
async fn set_task_status(db: State<'_, DbHandle>, id: String, status: String) -> Result<(), String> {
    let parsed = match status.as_str() {
        "open" => TaskStatus::Open,
        "done" => TaskStatus::Done,
        other => return Err(format!("unknown status: {other}")),
    };
    let db = db.0.clone();
    tauri::async_runtime::spawn_blocking(move || db.set_task_status(&id, parsed).map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

/// Deletes a task; its resources cascade.
#[tauri::command]
async fn delete_task(db: State<'_, DbHandle>, id: String) -> Result<(), String> {
    let db = db.0.clone();
    tauri::async_runtime::spawn_blocking(move || db.delete_task(&id).map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

/// A task's capsule rows (for the UI summary).
#[tauri::command]
async fn task_resources(db: State<'_, DbHandle>, task_id: String) -> Result<Vec<TaskResource>, String> {
    let db = db.0.clone();
    tauri::async_runtime::spawn_blocking(move || db.task_resources(&task_id).map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}
```
5. Extend `invoke_handler` with the eight new commands.

- [ ] **Step 2: Verify** — `cargo check` zero warnings; `cargo build -p omnibus-desktop`; full `cargo test` green.
- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat: capsule and task Tauri commands; continuation wired at startup"`

---

### Task 4: Task UI in the Projects view

**Files:**
- Create: `apps/desktop/src/views/TasksSection.tsx`
- Modify: `apps/desktop/src/store.ts`, `apps/desktop/src/views/ProjectsView.tsx`

**Interfaces:**
- Consumes: Task 3's commands (camelCase args `{taskId}`, `{projectId, title}`, `{id, status}`, `{id}`).
- Produces: tasks section per project with activate/save/status/delete + capsule summary + active highlight.

- [ ] **Step 1: Store additions** — in `apps/desktop/src/store.ts` add interfaces:
```ts
export interface Task {
  id: string;
  projectId: string;
  title: string;
  status: "open" | "done";
  createdAt: string;
  updatedAt: string;
}

export interface TaskResource {
  id: string;
  taskId: string;
  connectorKind: string;
  resourceType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}
```
and store fields (with implementations mirroring the existing style):
```ts
  activeTaskId: string | null;
  setActiveTaskId: (id: string | null) => void;
```
```ts
  activeTaskId: null,
  setActiveTaskId: (activeTaskId) => set({ activeTaskId }),
```

- [ ] **Step 2: `apps/desktop/src/views/TasksSection.tsx`**
```tsx
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useStore, type Task, type TaskResource } from "../store";

interface ActivateSummary {
  applied: string[];
  pending: string[];
  skipped: string[];
  savedPrevious: string | null;
  errors: string[];
}

interface SaveSummary {
  captured: string[];
  skipped: string[];
}

function summarize(r: TaskResource): string {
  const files = Array.isArray(r.payload.openFiles) ? r.payload.openFiles.length : 0;
  const terms = Array.isArray(r.payload.terminals) ? r.payload.terminals.length : 0;
  return `${r.connectorKind}: ${files} files, ${terms} terminals · ${new Date(r.createdAt).toLocaleTimeString()}`;
}

export function TasksSection({ projectId }: { projectId: string }) {
  const activeTaskId = useStore((s) => s.activeTaskId);
  const setActiveTaskId = useStore((s) => s.setActiveTaskId);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [resources, setResources] = useState<Record<string, TaskResource[]>>({});
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const list = await invoke<Task[]>("list_tasks", { projectId });
      setTasks(list);
      const entries = await Promise.all(
        list.map(async (t) => [t.id, await invoke<TaskResource[]>("task_resources", { taskId: t.id })] as const)
      );
      setResources(Object.fromEntries(entries));
    } catch (e) {
      console.error("tasks refresh failed:", e);
    }
  };

  useEffect(() => {
    refresh();
  }, [projectId]);

  async function addTask() {
    try {
      await invoke("create_task", { projectId, title });
      setTitle("");
      refresh();
    } catch (e) {
      setNote(String(e));
    }
  }

  async function activate(id: string) {
    setNote("activating…");
    try {
      const s = await invoke<ActivateSummary>("activate_task", { taskId: id });
      setActiveTaskId(id);
      const parts = [
        s.applied.length ? `applied: ${s.applied.join(", ")}` : "",
        s.pending.length ? `pending editor reload: ${s.pending.join(", ")}` : "",
        s.skipped.length ? `not connected: ${s.skipped.join(", ")}` : "",
        s.savedPrevious ? "previous task saved" : "",
        ...s.errors,
      ].filter(Boolean);
      setNote(parts.join(" · ") || "activated (no capsule yet)");
      refresh();
    } catch (e) {
      setNote(String(e));
    }
  }

  async function save(id: string) {
    setNote("saving…");
    try {
      const s = await invoke<SaveSummary>("save_capsule", { taskId: id });
      setNote(s.captured.length ? `saved: ${s.captured.join(", ")}` : "nothing connected to save");
      refresh();
    } catch (e) {
      setNote(String(e));
    }
  }

  async function toggleStatus(t: Task) {
    try {
      await invoke("set_task_status", { id: t.id, status: t.status === "open" ? "done" : "open" });
      refresh();
    } catch (e) {
      setNote(String(e));
    }
  }

  async function remove(id: string) {
    try {
      await invoke("delete_task", { id });
      setConfirming(null);
      refresh();
    } catch (e) {
      setNote(String(e));
    }
  }

  return (
    <div className="mt-2 border-t border-neutral-800 pt-2 flex flex-col gap-1">
      {tasks.map((t) => (
        <div
          key={t.id}
          className={`p-1 flex items-center gap-2 text-xs ${t.id === activeTaskId ? "bg-neutral-800 border-l-2 border-green-600" : ""}`}
        >
          <span className={`flex-1 ${t.status === "done" ? "line-through text-neutral-600" : ""}`}>
            {t.title}
          </span>
          <span className="text-neutral-500">
            {(resources[t.id] ?? []).map(summarize).join(" | ") || "no capsule"}
          </span>
          <button onClick={() => activate(t.id)} className="bg-neutral-700 px-2">
            activate
          </button>
          <button onClick={() => save(t.id)} className="bg-neutral-800 px-2">
            save state
          </button>
          <button onClick={() => toggleStatus(t)} className="bg-neutral-800 px-2">
            {t.status === "open" ? "done" : "reopen"}
          </button>
          {confirming === t.id ? (
            <>
              <button onClick={() => remove(t.id)} className="bg-red-900 px-2">
                confirm
              </button>
              <button onClick={() => setConfirming(null)} className="bg-neutral-800 px-2">
                cancel
              </button>
            </>
          ) : (
            <button onClick={() => setConfirming(t.id)} className="bg-neutral-800 px-2">
              delete
            </button>
          )}
        </div>
      ))}
      <div className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="new task title"
          className="bg-neutral-800 p-1 flex-1 text-xs"
        />
        <button onClick={addTask} disabled={!title} className="bg-neutral-700 px-2 text-xs disabled:opacity-40">
          add task
        </button>
      </div>
      {note && <div className="text-neutral-400 text-xs">{note}</div>}
    </div>
  );
}
```

- [ ] **Step 3: Mount it** — in `apps/desktop/src/views/ProjectsView.tsx`: import `TasksSection`, and inside each project row's outer `<div>` (below the existing row content), render `<TasksSection projectId={p.id} />`. On mount of `ProjectsView`, also load the active task once:
```ts
  const setActiveTaskId = useStore((s) => s.setActiveTaskId);
  useEffect(() => {
    invoke<string | null>("active_task").then(setActiveTaskId).catch(() => {});
  }, []);
```
(Adjust the project row container from `flex items-center` to a column layout wrapping the existing header row plus the tasks section — keep classes minimal/gray.)

- [ ] **Step 4: Verify** — `pnpm --filter desktop build` green; full `pnpm test` + `cargo test` green.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: task management and capsule actions in the Projects view"`

---

### Task 5: Walkthrough + docs (controller-run)

- [ ] Full sweep (all suites/builds, TODO scan).
- [ ] Live: app + Cursor with the extension; create a task; save (summary appears); the orchestration paths themselves are covered by the Task 2 integration tests; screenshot UI evidence. Note the click-driven steps left for the user.
- [ ] Docs: root README "Try it" gains the task-switching step; spec Status → Implemented. Commit: `docs: task capsules walkthrough; phase 8 success criteria verified`.

---

## Self-review notes

- Spec coverage: replace-per-kind (T1), capture/restore/pending/continuation/auto-save + all four integration scenarios (T2), commands + Arc wiring + 1500 ms settle (T3), UI incl. summary/highlight/inline results (T4), walkthrough/docs (T5).
- Type consistency: `SaveSummary`/`ActivateSummary` camelCase ↔ TS interfaces; command arg keys `taskId`/`projectId`/`id`/`status`/`title` match Tauri camelCasing of the Rust args; `TaskResource`/`Task` shapes match phase 5's serialized structs.
- The scripted-connector test helper deliberately mirrors the P5 recorder test pattern (real hub, real WS) — no mocks anywhere in the orchestration tests.
- `fake` restore only re-opens the workspace (its surface is read-mostly); that asymmetry is spec'd.
