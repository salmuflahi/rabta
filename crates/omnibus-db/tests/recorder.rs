use futures_util::{SinkExt, StreamExt};
use rabta_db::{Db, DbConfig, Recorder};
use rabta_hub::{Hub, HubConfig};
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
        json!({"v":1,"id":"h","kind":"hello","payload":{"name":"rec-test","kind":"fake","protocolVersion":1,"capabilities":["workspace"],"secret":hub.secret()}})
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

/// `pairingRequested` fires with no authentication at all, so an attacker
/// spamming `pair` frames must not be able to fill the events table.
#[test]
fn pairing_requested_is_not_persisted() {
    let db = Db::open_in_memory(DbConfig::default()).unwrap();
    let mut recorder = Recorder::new(db.clone());

    let ev = json!({"type":"pairingRequested","pairingId":"p1","name":"spammer","kind":"fake"});
    recorder.handle(&ev);

    let rows = db.recent_events(50).unwrap();
    assert!(rows.is_empty(), "pairingRequested must not be persisted, got {rows:?}");
}
