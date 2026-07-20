use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use omnibus_db::{Db, DbConfig, EventRow, KnownConnector, NewTask, Project, Recorder, Task, TaskResource, TaskStatus};
use omnibus_hub::{ConnectorInfo, Hub, HubConfig};
use serde::Serialize;
use serde_json::Value;
use tauri::{Emitter, Manager, State};
use tokio::sync::broadcast::error::RecvError;

use crate::capsules::{ActivateSummary, Capsules, SaveSummary};
use crate::git::GitStatus;
use crate::projects::RepoInspection;

pub mod capsules;
pub mod git;
pub mod projects;

struct HubHandle(Arc<Hub>);
struct DbHandle(Db);
struct CapsulesHandle(Capsules);

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

/// Checks a candidate repository path and prefills the default branch.
#[tauri::command]
async fn inspect_repo_path(path: String) -> Result<RepoInspection, String> {
    tauri::async_runtime::spawn_blocking(move || projects::inspect_repo_path(&path))
        .await
        .map_err(|e| e.to_string())
}

/// Validates registration input and stores the project.
#[tauri::command]
async fn create_project(
    db: State<'_, DbHandle>,
    name: String,
    repo_path: String,
    dev_url: Option<String>,
    default_branch: String,
) -> Result<Project, String> {
    let db = db.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        projects::validate_and_create(&db, &name, &repo_path, dev_url.as_deref(), &default_branch)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// All registered projects.
#[tauri::command]
async fn list_projects(db: State<'_, DbHandle>) -> Result<Vec<Project>, String> {
    let db = db.0.clone();
    tauri::async_runtime::spawn_blocking(move || db.list_projects().map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

/// Deletes a project; its tasks and resources cascade (phase 5 schema).
#[tauri::command]
async fn delete_project(db: State<'_, DbHandle>, id: String) -> Result<(), String> {
    let db = db.0.clone();
    tauri::async_runtime::spawn_blocking(move || db.delete_project(&id).map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

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

/// Resolves a registered project's repo path or a clear error.
async fn repo_of(db: &DbHandle, project_id: &str) -> Result<PathBuf, String> {
    let db = db.0.clone();
    let id = project_id.to_string();
    let project = tauri::async_runtime::spawn_blocking(move || db.get_project(&id))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    project.map(|p| PathBuf::from(p.repo_path)).ok_or_else(|| "project not found".to_string())
}

/// Current git status of a registered project.
#[tauri::command]
async fn git_status(db: State<'_, DbHandle>, project_id: String) -> Result<GitStatus, String> {
    git::status(&repo_of(&db, &project_id).await?).await
}

/// Local branches of a registered project.
#[tauri::command]
async fn git_branches(db: State<'_, DbHandle>, project_id: String) -> Result<Vec<String>, String> {
    git::branches(&repo_of(&db, &project_id).await?).await
}

/// `git fetch --all` — updates remote-tracking refs, never merges.
#[tauri::command]
async fn git_fetch(db: State<'_, DbHandle>, project_id: String) -> Result<String, String> {
    git::fetch(&repo_of(&db, &project_id).await?).await
}

/// Safe branch switch: refuses on a dirty tree, never forces.
#[tauri::command]
async fn git_checkout(db: State<'_, DbHandle>, project_id: String, branch: String) -> Result<(), String> {
    git::checkout(&repo_of(&db, &project_id).await?, &branch).await
}

/// Creates and switches to a new branch (safe with uncommitted changes).
#[tauri::command]
async fn git_create_branch(db: State<'_, DbHandle>, project_id: String, name: String) -> Result<(), String> {
    git::create_branch(&repo_of(&db, &project_id).await?, &name).await
}

/// A pairing request awaiting a decision, as shown to the UI.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PendingPairing {
    pairing_id: String,
    name: String,
    kind: String,
}

/// Pairing requests currently awaiting a decision.
#[tauri::command]
async fn pending_pairings(hub: State<'_, HubHandle>) -> Result<Vec<PendingPairing>, String> {
    Ok(hub
        .0
        .pending_pairings()
        .await
        .into_iter()
        .map(|(pairing_id, name, kind)| PendingPairing { pairing_id, name, kind })
        .collect())
}

/// Issues a persistent token for a pairing request and approves it.
#[tauri::command]
async fn approve_pairing(
    hub: State<'_, HubHandle>,
    db: State<'_, DbHandle>,
    pairing_id: String,
) -> Result<(), String> {
    let pending = hub.0.pending_pairings().await;
    let (_, name, kind) = pending
        .into_iter()
        .find(|(id, _, _)| *id == pairing_id)
        .ok_or("pairing expired or already resolved")?;
    let token = uuid::Uuid::new_v4().to_string();
    {
        let db = db.0.clone();
        let (n, k, t) = (name.clone(), kind.clone(), token.clone());
        tauri::async_runtime::spawn_blocking(move || db.set_connector_token(&n, &k, &t))
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())?;
    }
    hub.0.tokens_handle().write().unwrap().insert(format!("{name}/{kind}"), token.clone());
    if hub.0.resolve_pairing(&pairing_id, Some(token)).await {
        Ok(())
    } else {
        Err("pairing expired before approval".to_string())
    }
}

/// Denies a pairing request.
#[tauri::command]
async fn deny_pairing(hub: State<'_, HubHandle>, pairing_id: String) -> Result<(), String> {
    if hub.0.resolve_pairing(&pairing_id, None).await {
        Ok(())
    } else {
        Err("pairing expired or already resolved".to_string())
    }
}

/// The port the hub actually bound (browser extensions may need it if the
/// preferred port was taken).
#[tauri::command]
fn hub_port(hub: State<'_, HubHandle>) -> u16 {
    hub.0.port()
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

            let mut hub_cfg = HubConfig::new(data_dir);
            hub_cfg.preferred_port = 17872;
            for (name, kind, token) in db.connector_tokens().map_err(|e| e.to_string())? {
                hub_cfg.tokens.write().unwrap().insert(format!("{name}/{kind}"), token);
            }
            let hub = tauri::async_runtime::block_on(Hub::start(hub_cfg))?;

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
            // Deliberate trade-off: the channel is unbounded and this thread is
            // never joined on quit, so events still queued at shutdown can be
            // lost. Acceptable for a debug event log.
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

            let hub = Arc::new(hub);
            let capsules = Capsules::new(hub.clone(), db.clone(), Duration::from_millis(1500));
            capsules.spawn_continuation();
            app.manage(HubHandle(hub));
            app.manage(CapsulesHandle(capsules));
            app.manage(DbHandle(db));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            connectors,
            send_command,
            recent_events,
            known_connectors,
            inspect_repo_path,
            create_project,
            list_projects,
            delete_project,
            save_capsule,
            activate_task,
            active_task,
            create_task,
            list_tasks,
            set_task_status,
            delete_task,
            task_resources,
            git_status,
            git_branches,
            git_fetch,
            git_checkout,
            git_create_branch,
            pending_pairings,
            approve_pairing,
            deny_pairing,
            hub_port
        ])
        .run(tauri::generate_context!())
        .expect("error while running OmniBus");
}
