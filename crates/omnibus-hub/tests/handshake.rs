use futures_util::{SinkExt, StreamExt};
use omnibus_hub::{Hub, HubConfig};
use serde_json::{json, Value};

async fn start_hub() -> (Hub, tempfile::TempDir) {
    let dir = tempfile::tempdir().unwrap();
    let hub = Hub::start(HubConfig::new(dir.path().to_path_buf())).await.unwrap();
    (hub, dir)
}

fn hello(name: &str, version: u8, secret: &str) -> String {
    json!({"v": 1, "id": "t-hello", "kind": "hello", "payload": {
        "name": name, "kind": "fake", "protocolVersion": version, "capabilities": ["workspace"],
        "secret": secret
    }})
    .to_string()
}

#[tokio::test]
async fn writes_discovery_file_and_registers_connector() {
    let (hub, dir) = start_hub().await;
    let disco: Value =
        serde_json::from_str(&std::fs::read_to_string(dir.path().join("hub.json")).unwrap()).unwrap();
    assert_eq!(disco, json!({ "port": hub.port(), "secret": hub.secret() }));

    let (mut ws, _) =
        tokio_tungstenite::connect_async(format!("ws://127.0.0.1:{}", hub.port())).await.unwrap();
    ws.send(hello("test-conn", 1, hub.secret()).into()).await.unwrap();
    let reply: Value =
        serde_json::from_str(ws.next().await.unwrap().unwrap().to_text().unwrap()).unwrap();
    assert_eq!(reply["kind"], "welcome");
    assert!(reply["payload"]["connectorId"].is_string());

    let conns = hub.connectors().await;
    assert_eq!(conns.len(), 1);
    assert_eq!(conns[0].name, "test-conn");
    assert_eq!(conns[0].capabilities, vec!["workspace"]);
}

#[tokio::test]
async fn rejects_protocol_version_mismatch() {
    // Version check happens before the auth gate (see hub.rs), so a valid
    // secret is supplied here to prove that's the reason this is rejected.
    let (hub, _dir) = start_hub().await;
    let (mut ws, _) =
        tokio_tungstenite::connect_async(format!("ws://127.0.0.1:{}", hub.port())).await.unwrap();
    ws.send(hello("old-conn", 99, hub.secret()).into()).await.unwrap();
    let reply: Value =
        serde_json::from_str(ws.next().await.unwrap().unwrap().to_text().unwrap()).unwrap();
    assert_eq!(reply["kind"], "error");
    assert_eq!(reply["payload"]["code"], "version_mismatch");
    assert!(hub.connectors().await.is_empty());
}

#[tokio::test]
async fn rejects_browser_origin_header() {
    use tokio_tungstenite::tungstenite::{client::IntoClientRequest, http::HeaderValue};
    let (hub, _dir) = start_hub().await;
    let mut req = format!("ws://127.0.0.1:{}", hub.port()).into_client_request().unwrap();
    req.headers_mut().insert("Origin", HeaderValue::from_static("https://evil.example"));
    assert!(tokio_tungstenite::connect_async(req).await.is_err());
}
