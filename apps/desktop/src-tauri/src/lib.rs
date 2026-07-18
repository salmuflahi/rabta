use omnibus_hub::{ConnectorInfo, Hub, HubConfig};
use serde_json::Value;
use tauri::{Emitter, Manager, State};

struct HubHandle(Hub);

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

/// Builds and runs the OmniBus Tauri application: starts the hub on launch
/// and forwards its event stream to the frontend as `hub-event`.
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let hub = tauri::async_runtime::block_on(Hub::start(HubConfig::new(data_dir)))?;
            let mut events = hub.subscribe();
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                while let Ok(ev) = events.recv().await {
                    let _ = handle.emit("hub-event", &ev);
                }
            });
            app.manage(HubHandle(hub));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![connectors, send_command])
        .run(tauri::generate_context!())
        .expect("error while running OmniBus");
}
