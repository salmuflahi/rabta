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
const CAPTURABLE: &[&str] = &["vscode", "fake", "chrome"];

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
    generation: u64,
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
    activation_lock: Arc<tokio::sync::Mutex<()>>,
    generation: Arc<std::sync::atomic::AtomicU64>,
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
            activation_lock: Arc::new(tokio::sync::Mutex::new(())),
            generation: Arc::new(std::sync::atomic::AtomicU64::new(0)),
        }
    }

    /// The task currently considered active (in-memory, this phase).
    pub fn active_task(&self) -> Option<String> {
        self.active_task.lock().unwrap().clone()
    }

    /// The repo path of the project owning `task_id`, if both still exist.
    async fn repo_for_task(&self, task_id: &str) -> Result<Option<String>, String> {
        let db = self.db.clone();
        let tid = task_id.to_string();
        tokio::task::spawn_blocking(move || -> Result<Option<String>, String> {
            let Some(task) = db.get_task(&tid).map_err(|e| e.to_string())? else {
                return Ok(None);
            };
            Ok(db
                .get_project(&task.project_id)
                .map_err(|e| e.to_string())?
                .map(|p| p.repo_path))
        })
        .await
        .map_err(|e| e.to_string())?
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

        // The "git" virtual kind: capture the project's current branch.
        match self.repo_for_task(task_id).await {
            Ok(Some(repo)) => match crate::git::status(std::path::Path::new(&repo)).await {
                Ok(st) => match st.branch {
                    Some(branch) => {
                        let db = self.db.clone();
                        let tid = task_id.to_string();
                        let payload = serde_json::json!({ "branch": branch });
                        tokio::task::spawn_blocking(move || {
                            db.replace_task_resources(&tid, "git", "branch", &payload)
                        })
                        .await
                        .map_err(|e| e.to_string())?
                        .map_err(|e| e.to_string())?;
                        captured.push("git".to_string());
                    }
                    None => skipped.push("git: detached HEAD".to_string()),
                },
                Err(e) => skipped.push(format!("git: {e}")),
            },
            Ok(None) => skipped.push("git: task or project not found".to_string()),
            Err(e) => skipped.push(format!("git: {e}")),
        }

        Ok(SaveSummary { captured, skipped })
    }

    /// Auto-saves the outgoing active task (if any), then restores `task_id`'s
    /// capsule best-effort per connector, and marks it active.
    pub async fn activate_task(&self, task_id: &str) -> Result<ActivateSummary, String> {
        let _serialized = self.activation_lock.lock().await;
        let generation =
            self.generation.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
        // Spec: one pending restore slot, replaced by the newer activation —
        // every activation must reset it, not just cross-folder vscode ones.
        *self.pending.lock().unwrap() = None;

        let mut errors = vec![];
        let previous = self.active_task();
        let mut saved_previous = None;
        if let Some(prev) = previous.filter(|p| p != task_id) {
            match self.save_capsule(&prev).await {
                Ok(summary) if !summary.captured.is_empty() => saved_previous = Some(prev),
                Ok(_) => {}
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

        let mut applied = vec![];
        let mut pending = vec![];
        let mut skipped = vec![];

        // Git first: a branch switch changes files on disk, so editor
        // restore must come after. Refusals are reported, never forced.
        if let Some(git_row) = resources
            .iter()
            .find(|r| r.connector_kind == "git" && r.resource_type == "branch")
        {
            match (git_row.payload["branch"].as_str(), self.repo_for_task(task_id).await) {
                (Some(target), Ok(Some(repo))) => {
                    let repo = std::path::Path::new(&repo);
                    match crate::git::status(repo).await {
                        Ok(st) if st.branch.as_deref() == Some(target) => {
                            applied.push("git".to_string());
                        }
                        Ok(_) => match crate::git::checkout(repo, target).await {
                            Ok(()) => applied.push("git".to_string()),
                            Err(e) => {
                                errors.push(format!("git: {e}"));
                                skipped.push("git".to_string());
                            }
                        },
                        Err(e) => {
                            errors.push(format!("git: {e}"));
                            skipped.push("git".to_string());
                        }
                    }
                }
                (None, _) => skipped.push("git".to_string()),
                (_, Ok(None)) => {
                    errors.push("git: task or project not found".to_string());
                    skipped.push("git".to_string());
                }
                (_, Err(e)) => {
                    errors.push(format!("git: {e}"));
                    skipped.push("git".to_string());
                }
            }
        }

        let connectors = self.hub.connectors().await;
        for r in resources.iter().filter(|r| r.resource_type == "workspace") {
            let Some(conn) = connectors.iter().find(|c| kind_str(c.kind) == r.connector_kind)
            else {
                skipped.push(r.connector_kind.clone());
                continue;
            };
            match r.connector_kind.as_str() {
                "vscode" => {
                    match self.restore_vscode(conn, &r.payload, generation, &mut errors).await {
                        RestoreOutcome::Applied => applied.push("vscode".into()),
                        RestoreOutcome::Pending => pending.push("vscode".into()),
                    }
                }
                "fake" => {
                    let folder = r.payload["workspaceFolder"]
                        .as_str()
                        .or_else(|| r.payload["root"].as_str());
                    if let Some(folder) = folder {
                        if let Err(e) = self
                            .hub
                            .send_command(&conn.id, "workspace.open", json!({ "path": folder }))
                            .await
                        {
                            errors.push(format!("fake workspace.open: {e}"));
                        } else {
                            applied.push("fake".into());
                        }
                    } else {
                        skipped.push(r.connector_kind.clone());
                    }
                }
                "chrome" => {
                    if self.restore_chrome(conn, &r.payload, &mut errors).await {
                        applied.push("chrome".to_string());
                    } else {
                        skipped.push("chrome".to_string());
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
        generation: u64,
        errors: &mut Vec<String>,
    ) -> RestoreOutcome {
        let target_folder = payload["workspaceFolder"].as_str();
        let mut open_files: Vec<String> = payload["openFiles"]
            .as_array()
            .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
            .unwrap_or_default();
        // Open the active file last so editor focus lands on it.
        if let Some(active) = payload["activeFile"].as_str() {
            if let Some(pos) = open_files.iter().position(|f| f == active) {
                let f = open_files.remove(pos);
                open_files.push(f);
            }
        }
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
                    generation,
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
            let mut args = json!({ "cwd": cwd });
            if let Some(n) = name {
                args["name"] = json!(n);
            }
            if let Err(e) =
                self.hub.send_command(connector_id, "terminal.create", args).await
            {
                errors.push(format!("terminal.create {cwd}: {e}"));
            }
        }
    }

    /// Restores browser tabs additively: opens each captured url. Non-
    /// destructive (never closes the user's current tabs), so — unlike
    /// vscode's workspace.open — there is no window reload and no pending
    /// continuation. Individual failures are collected, never fatal.
    ///
    /// Returns whether the caller should count this as applied: true if
    /// there were no urls to restore (nothing to fail), or at least one
    /// `tabs.open` succeeded. False only when there were urls and every
    /// single one of them failed — the caller reports `skipped` in that
    /// case instead of claiming a restore that didn't actually happen.
    async fn restore_chrome(&self, conn: &ConnectorInfo, payload: &Value, errors: &mut Vec<String>) -> bool {
        let urls: Vec<String> = payload["tabs"]
            .as_array()
            .map(|a| a.iter().filter_map(|t| t["url"].as_str().map(String::from)).collect())
            .unwrap_or_default();
        if urls.is_empty() {
            return true;
        }
        let mut any_succeeded = false;
        for url in urls {
            match self.hub.send_command(&conn.id, "tabs.open", json!({ "url": url })).await {
                Ok(_) => any_succeeded = true,
                Err(e) => errors.push(format!("tabs.open {url}: {e}")),
            }
        }
        any_succeeded
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
                        if self.generation.load(std::sync::atomic::Ordering::SeqCst) != p.generation
                        {
                            log::warn!(
                                "capsule continuation: superseded by newer activation; skipped"
                            );
                        } else {
                            let mut errors = vec![];
                            self.apply_editor_state(
                                &connector.id,
                                &p.open_files,
                                &p.terminals,
                                &mut errors,
                            )
                            .await;
                            for e in errors {
                                log::warn!("capsule continuation: {e}");
                            }
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
