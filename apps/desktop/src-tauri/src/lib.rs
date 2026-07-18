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
