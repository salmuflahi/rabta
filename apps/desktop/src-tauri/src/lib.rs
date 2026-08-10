use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use rabta_db::{
    Db, DbConfig, EventRow, KnownConnector, Project, Recorder, Task, TaskPin, TaskResource,
    TaskStatus,
};
use rabta_hub::{ConnectorInfo, Hub, HubConfig};
use serde::Serialize;
use serde_json::Value;
use tauri::{Emitter, Manager, State};
use tokio::sync::broadcast::error::RecvError;

use crate::capsules::{ActivateSummary, ArchiveProjectResult, Capsules, SaveSummary};
use crate::git::GitStatus;
use crate::github::{Issue, StartedTask};
use crate::projects::RepoInspection;

pub mod capsules;
pub mod git;
pub mod github;
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
    state
        .0
        .send_command(&target, &name, args)
        .await
        .map_err(|e| e.to_string())
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

/// All active projects in their persisted order.
#[tauri::command]
async fn list_projects(db: State<'_, DbHandle>) -> Result<Vec<Project>, String> {
    let db = db.0.clone();
    tauri::async_runtime::spawn_blocking(move || db.list_projects().map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

/// Renames a registered project.
#[tauri::command]
async fn rename_project(
    db: State<'_, DbHandle>,
    id: String,
    name: String,
) -> Result<Project, String> {
    let db = db.0.clone();
    tauri::async_runtime::spawn_blocking(move || projects::rename_project(&db, &id, &name))
        .await
        .map_err(|e| e.to_string())?
}

/// Archived projects, newest archive first.
#[tauri::command]
async fn list_archived_projects(db: State<'_, DbHandle>) -> Result<Vec<Project>, String> {
    let db = db.0.clone();
    tauri::async_runtime::spawn_blocking(move || projects::list_archived_projects(&db))
        .await
        .map_err(|e| e.to_string())?
}

/// Archives a project and safely clears its active capsule when needed.
#[tauri::command]
async fn archive_project(
    caps: State<'_, CapsulesHandle>,
    id: String,
) -> Result<ArchiveProjectResult, String> {
    caps.0.archive_project(&id).await
}

/// Restores an archived project.
#[tauri::command]
async fn unarchive_project(db: State<'_, DbHandle>, id: String) -> Result<Project, String> {
    let db = db.0.clone();
    tauri::async_runtime::spawn_blocking(move || projects::unarchive_project(&db, &id))
        .await
        .map_err(|e| e.to_string())?
}

/// Assigns or clears one curated project icon.
#[tauri::command]
async fn set_project_icon(
    db: State<'_, DbHandle>,
    id: String,
    icon: Option<String>,
) -> Result<Project, String> {
    let db = db.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        projects::set_project_icon(&db, &id, icon.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Persists an exact active-project ordering.
#[tauri::command]
async fn reorder_projects(
    db: State<'_, DbHandle>,
    ordered_ids: Vec<String>,
) -> Result<Vec<Project>, String> {
    let db = db.0.clone();
    tauri::async_runtime::spawn_blocking(move || projects::reorder_projects(&db, &ordered_ids))
        .await
        .map_err(|e| e.to_string())?
}

/// Deletes a project; its tasks and resources cascade (phase 5 schema).
/// Goes through `Capsules` (not `DbHandle` directly) so a project holding
/// the active task clears the in-memory activation cache — otherwise the
/// next `activate_task` would auto-save against a tombstone.
#[tauri::command]
async fn delete_project(caps: State<'_, CapsulesHandle>, id: String) -> Result<(), String> {
    caps.0.delete_project(&id).await
}

/// Captures connected connectors' state into the task's capsule.
#[tauri::command]
async fn save_capsule(
    caps: State<'_, CapsulesHandle>,
    task_id: String,
) -> Result<SaveSummary, String> {
    caps.0.save_capsule(&task_id).await
}

/// Auto-saves the outgoing task, restores this task's capsule, marks it
/// active. With `focus_mode`, also closes what is open but not in the
/// capsule.
#[tauri::command]
async fn activate_task(
    caps: State<'_, CapsulesHandle>,
    task_id: String,
    focus_mode: bool,
) -> Result<ActivateSummary, String> {
    caps.0.activate_task(&task_id, focus_mode).await
}

/// The in-memory active task id, if any.
#[tauri::command]
fn active_task(caps: State<'_, CapsulesHandle>) -> Option<String> {
    caps.0.active_task()
}

/// Updates whether the app is focused and the user is idle.
#[tauri::command]
async fn session_update(
    caps: State<'_, CapsulesHandle>,
    focused: bool,
    idle: bool,
) -> Result<(), String> {
    caps.0.session_update(focused, idle).await
}

/// Flushes eligible elapsed time for the authoritative active task.
#[tauri::command]
async fn session_heartbeat(caps: State<'_, CapsulesHandle>) -> Result<(), String> {
    caps.0.session_heartbeat().await
}

/// Marks one item "always open this" for a task.
#[tauri::command]
async fn pin_task_item(
    task_id: String,
    connector_kind: String,
    payload: serde_json::Value,
    db: State<'_, DbHandle>,
) -> Result<(), String> {
    let identity = crate::capsules::identity_of(&connector_kind, &payload)
        .ok_or_else(|| format!("cannot identify a {connector_kind} item from {payload}"))?;
    let db = db.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        db.add_task_pin(&task_id, &connector_kind, &identity, &payload)
    })
    .await
    .map_err(|e| e.to_string())?
    .map(|_| ())
    .map_err(|e| e.to_string())
}

/// Removes a pin; returns whether one actually existed.
#[tauri::command]
async fn unpin_task_item(
    task_id: String,
    connector_kind: String,
    identity: String,
    db: State<'_, DbHandle>,
) -> Result<bool, String> {
    let db = db.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        db.remove_task_pin(&task_id, &connector_kind, &identity)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

/// Drops one item from a task's captured payload. Does not touch pins.
#[tauri::command]
async fn remove_task_item(
    task_id: String,
    connector_kind: String,
    identity: String,
    capsules: State<'_, CapsulesHandle>,
) -> Result<(), String> {
    capsules
        .0
        .remove_captured_item(&task_id, &connector_kind, &identity)
        .await
}

/// Read side for the curate UI: which items this task has pinned.
#[tauri::command]
async fn task_pins(task_id: String, db: State<'_, DbHandle>) -> Result<Vec<TaskPin>, String> {
    let db = db.0.clone();
    tauri::async_runtime::spawn_blocking(move || db.task_pins(&task_id))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

/// Creates a task under a project (status `open`).
#[tauri::command]
async fn create_task(
    db: State<'_, DbHandle>,
    project_id: String,
    title: String,
) -> Result<Task, String> {
    let db = db.0.clone();
    tauri::async_runtime::spawn_blocking(move || projects::create_task(&db, &project_id, &title))
        .await
        .map_err(|e| e.to_string())?
}

/// Tasks for one project, newest first.
#[tauri::command]
async fn list_tasks(db: State<'_, DbHandle>, project_id: String) -> Result<Vec<Task>, String> {
    let db = db.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        db.list_tasks(&project_id).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Sets a task's status; accepts "open" or "done".
#[tauri::command]
async fn set_task_status(
    db: State<'_, DbHandle>,
    id: String,
    status: String,
) -> Result<(), String> {
    let parsed = match status.as_str() {
        "open" => TaskStatus::Open,
        "done" => TaskStatus::Done,
        other => return Err(format!("unknown status: {other}")),
    };
    let db = db.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        db.set_task_status(&id, parsed).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Renames a task capsule.
#[tauri::command]
async fn rename_task(db: State<'_, DbHandle>, id: String, title: String) -> Result<Task, String> {
    let db = db.0.clone();
    tauri::async_runtime::spawn_blocking(move || projects::rename_task(&db, &id, &title))
        .await
        .map_err(|e| e.to_string())?
}

/// Duplicates a task capsule and all captured resources.
#[tauri::command]
async fn duplicate_task(db: State<'_, DbHandle>, id: String) -> Result<Task, String> {
    let db = db.0.clone();
    tauri::async_runtime::spawn_blocking(move || projects::duplicate_task(&db, &id))
        .await
        .map_err(|e| e.to_string())?
}

/// Deletes a task; its resources cascade. Goes through `Capsules` (not
/// `DbHandle` directly) so deleting the active task clears the in-memory
/// activation cache — otherwise the next `activate_task` would auto-save
/// against a tombstone.
#[tauri::command]
async fn delete_task(caps: State<'_, CapsulesHandle>, id: String) -> Result<(), String> {
    caps.0.delete_task(&id).await
}

/// A task's capsule rows (for the UI summary).
#[tauri::command]
async fn task_resources(
    db: State<'_, DbHandle>,
    task_id: String,
) -> Result<Vec<TaskResource>, String> {
    let db = db.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        db.task_resources(&task_id).map_err(|e| e.to_string())
    })
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
    project
        .map(|p| PathBuf::from(p.repo_path))
        .ok_or_else(|| "project not found".to_string())
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
async fn git_checkout(
    db: State<'_, DbHandle>,
    project_id: String,
    branch: String,
) -> Result<(), String> {
    git::checkout(&repo_of(&db, &project_id).await?, &branch).await
}

/// Creates and switches to a new branch (safe with uncommitted changes).
#[tauri::command]
async fn git_create_branch(
    db: State<'_, DbHandle>,
    project_id: String,
    name: String,
) -> Result<(), String> {
    git::create_branch(&repo_of(&db, &project_id).await?, &name).await
}

/// Whether the GitHub CLI is available for GitHub features.
#[tauri::command]
async fn github_available() -> bool {
    github::gh_available().await
}

/// Open GitHub issues for a project (via the user's `gh`).
#[tauri::command]
async fn github_issues(db: State<'_, DbHandle>, project_id: String) -> Result<Vec<Issue>, String> {
    let repo = repo_of(&db, &project_id).await?;
    github::issues(&repo).await
}

/// Starts a task from an issue: creates the task and a safe issue branch.
#[tauri::command]
async fn start_issue_task(
    db: State<'_, DbHandle>,
    project_id: String,
    number: u64,
    title: String,
) -> Result<StartedTask, String> {
    let repo = repo_of(&db, &project_id).await?;
    let db_inner = db.0.clone();
    github::start_issue_task(&db_inner, &repo, &project_id, number, &title).await
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
        .map(|(pairing_id, name, kind)| PendingPairing {
            pairing_id,
            name,
            kind,
        })
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
    hub.0
        .tokens_handle()
        .write()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .insert(format!("{name}/{kind}"), token.clone());
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

/// Validates that `path` exists. Split out from `reveal_in_finder` so the
/// check is unit-testable without spawning `open` (which would pop Finder).
fn reveal_path(path: &str) -> Result<(), String> {
    if !std::path::Path::new(path).exists() {
        return Err(format!("path does not exist: {path}"));
    }
    Ok(())
}

/// Reveals (selects) `path` in macOS Finder via `open -R`.
#[tauri::command]
fn reveal_in_finder(path: String) -> Result<(), String> {
    reveal_path(&path)?;
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path])
            .status()
            .map_err(|e| format!("failed to reveal in Finder: {e}"))?;
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("Reveal in Finder is only supported on macOS".to_string())
    }
}

/// Whether `url` is a plain http(s) URL. Split out so the scheme guard is
/// unit-testable without spawning `open`.
fn is_web_url(url: &str) -> bool {
    url.starts_with("http://") || url.starts_with("https://")
}

/// Opens an http(s) URL in the user's default browser via `open`. Scheme is
/// restricted to http/https so a stored dev URL can never be turned into an
/// `open` of an arbitrary file path, app, or custom scheme.
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if !is_web_url(&url) {
        return Err("Only http(s) URLs can be opened".to_string());
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .status()
            .map_err(|e| format!("failed to open URL: {e}"))?;
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("Opening URLs is only supported on macOS".to_string())
    }
}

/// Derives the on-disk data directory from the platform-provided app data
/// directory, isolating debug builds into a sibling `.debug` directory.
///
/// WHY THIS EXISTS: `app_data_dir()` is derived solely from the bundle
/// identifier (`com.omnibus.dev`), so without this a debug build launched via
/// `pnpm tauri dev` resolves to the *exact same* directory as the installed
/// release app. This bit the project once already: a dev run applied an
/// unreleased schema migration to the real, installed app's database,
/// bumping it past the schema version the shipped release build knows about.
/// `omnibus-db` correctly refuses to open a newer-than-known schema
/// (`DbError::SchemaTooNew`), so the installed app stopped launching until
/// someone intervened by hand. The data was never at risk, but the app was
/// unusable in the meantime.
///
/// Do not "simplify" this away — a debug build must never be able to read or
/// write the release app's database or hub state.
///
/// `with_extension` is deliberately NOT used here: it replaces text after the
/// last `.` in the file name, so calling it on `com.omnibus.dev` would yield
/// `com.omnibus.debug`, silently clobbering the "dev" segment of the bundle
/// identifier instead of appending a suffix. `set_file_name` with an
/// explicitly rebuilt name avoids that trap.
fn data_dir_for(base: PathBuf, debug: bool) -> PathBuf {
    if !debug {
        return base;
    }
    match base.file_name() {
        Some(name) => {
            let mut debug_name = name.to_os_string();
            debug_name.push(".debug");
            let mut dir = base.clone();
            dir.set_file_name(debug_name);
            dir
        }
        // Pathological base with no final component (e.g. "/" or ""): fall
        // back to the base unchanged rather than panicking.
        None => base,
    }
}

/// Builds and runs the OmniBus Tauri application: opens the database (fatal
/// on failure), starts the hub, records hub activity, and forwards the event
/// stream to the frontend as `hub-event`.
pub fn run() {
    let _ = env_logger::try_init();
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            let data_dir = data_dir_for(app.path().app_data_dir()?, cfg!(debug_assertions));
            std::fs::create_dir_all(&data_dir)?;
            // Spec: open/migration failure at startup is fatal.
            let db = Db::open(&data_dir.join("omnibus.db"), DbConfig::default())
                .map_err(|e| format!("failed to open omnibus.db: {e}"))?;

            let mut hub_cfg = HubConfig::new(data_dir);
            hub_cfg.preferred_port = 17872;
            for (name, kind, token) in db.connector_tokens().map_err(|e| e.to_string())? {
                hub_cfg
                    .tokens
                    .write()
                    .unwrap_or_else(std::sync::PoisonError::into_inner)
                    .insert(format!("{name}/{kind}"), token);
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
            rename_project,
            list_archived_projects,
            archive_project,
            unarchive_project,
            set_project_icon,
            reorder_projects,
            delete_project,
            save_capsule,
            activate_task,
            active_task,
            session_update,
            session_heartbeat,
            pin_task_item,
            unpin_task_item,
            remove_task_item,
            task_pins,
            create_task,
            list_tasks,
            set_task_status,
            rename_task,
            duplicate_task,
            delete_task,
            task_resources,
            git_status,
            git_branches,
            git_fetch,
            git_checkout,
            git_create_branch,
            github_available,
            github_issues,
            start_issue_task,
            pending_pairings,
            approve_pairing,
            deny_pairing,
            hub_port,
            reveal_in_finder,
            open_url
        ])
        .build(tauri::generate_context!())
        .expect("error while building Rabta");

    app.run(|handle, event| {
        if matches!(
            event,
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
        ) {
            let capsules = handle.state::<CapsulesHandle>().0.clone();
            if let Err(error) = tauri::async_runtime::block_on(capsules.flush_session()) {
                log::warn!("final session flush failed: {error}");
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reveal_path_rejects_nonexistent_path() {
        let err = reveal_path("/nonexistent/path/xyz").unwrap_err();
        assert!(err.contains("does not exist"), "unexpected error: {err}");
    }

    #[test]
    fn is_web_url_allows_http_and_https_only() {
        assert!(is_web_url("http://localhost:5173"));
        assert!(is_web_url("https://example.com/path"));
        // Anything that could redirect `open` at a file/app/scheme is rejected.
        assert!(!is_web_url("file:///etc/passwd"));
        assert!(!is_web_url("/Applications/Calculator.app"));
        assert!(!is_web_url("javascript:alert(1)"));
        assert!(!is_web_url("ftp://example.com"));
        assert!(!is_web_url(""));
    }

    #[test]
    fn data_dir_for_release_returns_base_unchanged() {
        let base = PathBuf::from("/Users/alice/Library/Application Support/com.omnibus.dev");
        assert_eq!(data_dir_for(base.clone(), false), base);
    }

    #[test]
    fn data_dir_for_debug_appends_debug_suffix_to_final_component() {
        let base = PathBuf::from("/Users/alice/Library/Application Support/com.omnibus.dev");
        let expected = PathBuf::from(
            "/Users/alice/Library/Application Support/com.omnibus.dev.debug",
        );
        assert_eq!(data_dir_for(base, true), expected);
    }

    #[test]
    fn data_dir_for_debug_does_not_truncate_dotted_bundle_identifier() {
        // Regression guard: `with_extension` would turn `com.omnibus.dev`
        // into `com.omnibus.debug`, dropping "dev" entirely. Confirm the
        // "dev" segment survives intact with the suffix appended after it.
        let base = PathBuf::from("/base/com.omnibus.dev");
        let result = data_dir_for(base, true);
        let name = result.file_name().unwrap().to_str().unwrap();
        assert_eq!(name, "com.omnibus.dev.debug");
        assert!(name.contains("dev"), "must not drop the 'dev' segment");
    }

    #[test]
    fn data_dir_for_debug_handles_missing_file_name_without_panicking() {
        // A pathological base with no final path component (root, or an
        // empty path) must fall back to the base unchanged rather than
        // panicking on `.unwrap()`.
        let root = PathBuf::from("/");
        assert_eq!(data_dir_for(root.clone(), true), root);

        let empty = PathBuf::new();
        assert_eq!(data_dir_for(empty.clone(), true), empty);
    }
}
