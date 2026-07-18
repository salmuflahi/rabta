use futures_util::{SinkExt, StreamExt};
use omnibus_hub::{Hub, HubConfig, HubEvent};
use serde_json::json;
use std::time::Duration;

async fn register(port: u16, name: &str) -> tokio_tungstenite::WebSocketStream<
    tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
> {
    let (mut ws, _) = tokio_tungstenite::connect_async(format!("ws://127.0.0.1:{port}")).await.unwrap();
    ws.send(
        json!({"v":1,"id":"h","kind":"hello","payload":{"name":name,"kind":"fake","protocolVersion":1,"capabilities":[]}})
            .to_string()
            .into(),
    )
    .await
    .unwrap();
    ws.next().await; // welcome
    ws
}

async fn next_event(rx: &mut tokio::sync::broadcast::Receiver<HubEvent>) -> HubEvent {
    tokio::time::timeout(Duration::from_secs(2), rx.recv()).await.unwrap().unwrap()
}

#[tokio::test]
async fn fans_out_connector_events_to_subscribers() {
    let dir = tempfile::tempdir().unwrap();
    let hub = Hub::start(HubConfig::new(dir.path().to_path_buf())).await.unwrap();
    let mut rx = hub.subscribe();
    let mut ws = register(hub.port(), "emitter").await;
    assert!(matches!(next_event(&mut rx).await, HubEvent::ConnectorConnected { .. }));

    ws.send(
        json!({"v":1,"id":"e","kind":"event","payload":{"name":"editor.fileOpened","data":{"path":"a.ts"}}})
            .to_string()
            .into(),
    )
    .await
    .unwrap();
    match next_event(&mut rx).await {
        HubEvent::EventReceived { name, data, .. } => {
            assert_eq!(name, "editor.fileOpened");
            assert_eq!(data, json!({"path": "a.ts"}));
        }
        other => panic!("expected EventReceived, got {other:?}"),
    }
}

#[tokio::test]
async fn detects_dead_connector_via_missed_pongs() {
    let dir = tempfile::tempdir().unwrap();
    let mut cfg = HubConfig::new(dir.path().to_path_buf());
    cfg.ping_interval = Duration::from_millis(100);
    let hub = Hub::start(cfg).await.unwrap();
    let mut rx = hub.subscribe();
    let _ws = register(hub.port(), "silent").await; // never answers pings
    assert!(matches!(next_event(&mut rx).await, HubEvent::ConnectorConnected { .. }));
    let deadline = std::time::Instant::now();
    loop {
        if let HubEvent::ConnectorDisconnected { .. } = next_event(&mut rx).await { break }
        assert!(deadline.elapsed() < Duration::from_secs(2), "no disconnect within 2s");
    }
    assert!(hub.connectors().await.is_empty());
}

#[tokio::test]
async fn closes_connection_after_three_bad_frames() {
    let dir = tempfile::tempdir().unwrap();
    let hub = Hub::start(HubConfig::new(dir.path().to_path_buf())).await.unwrap();
    let mut ws = register(hub.port(), "garbler").await;
    for _ in 0..3 {
        ws.send("not json".to_string().into()).await.unwrap();
    }
    // After 3 strikes the hub breaks the loop; we should observe the close
    // (three bad_message error frames may arrive first).
    let mut closed = false;
    for _ in 0..10 {
        match tokio::time::timeout(Duration::from_secs(2), ws.next()).await {
            Ok(None) | Ok(Some(Err(_))) | Err(_) => { closed = true; break; }
            Ok(Some(Ok(frame))) => {
                if frame.is_close() { closed = true; break; }
            }
        }
    }
    assert!(closed, "hub did not close after 3 bad frames");
}
