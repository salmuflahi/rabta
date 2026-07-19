use futures_util::{SinkExt, StreamExt};
use omnibus_hub::{CommandError, Hub, HubConfig};
use serde_json::{json, Value};
use std::time::Duration;

/// Starts a hub and a raw scripted connector that answers every command
/// with `{ "echo": <args> }` (and answers pings). Returns the connector id.
async fn hub_with_echo_connector(cfg: HubConfig) -> (Hub, String, tempfile::TempDir) {
    let dir = tempfile::tempdir().unwrap();
    let hub = Hub::start(HubConfig { data_dir: dir.path().to_path_buf(), ..cfg }).await.unwrap();
    let (mut ws, _) =
        tokio_tungstenite::connect_async(format!("ws://127.0.0.1:{}", hub.port())).await.unwrap();
    ws.send(
        json!({"v":1,"id":"h","kind":"hello","payload":{"name":"echo","kind":"fake","protocolVersion":1,"capabilities":["workspace"],"secret":hub.secret()}})
            .to_string()
            .into(),
    )
    .await
    .unwrap();
    let welcome: Value =
        serde_json::from_str(ws.next().await.unwrap().unwrap().to_text().unwrap()).unwrap();
    let id = welcome["payload"]["connectorId"].as_str().unwrap().to_string();
    tokio::spawn(async move {
        while let Some(Ok(frame)) = ws.next().await {
            let Ok(txt) = frame.to_text() else { continue };
            let Ok(env) = serde_json::from_str::<Value>(txt) else { continue };
            match env["kind"].as_str() {
                Some("ping") => {
                    let pong = json!({"v":1,"id":"p","kind":"pong","payload":{}});
                    let _ = ws.send(pong.to_string().into()).await;
                }
                Some("command") => {
                    let resp = json!({"v":1,"id":"r","kind":"response","payload":{
                        "requestId": env["id"], "ok": true, "result": {"echo": env["payload"]["args"]}
                    }});
                    let _ = ws.send(resp.to_string().into()).await;
                }
                _ => {}
            }
        }
    });
    (hub, id, dir)
}

#[tokio::test]
async fn routes_command_and_correlates_response() {
    let dir = tempfile::tempdir().unwrap();
    let (hub, id, _dir) =
        hub_with_echo_connector(HubConfig::new(dir.path().to_path_buf())).await;
    let result = hub.send_command(&id, "workspace.open", json!({"path": "/tmp/x"})).await.unwrap();
    assert_eq!(result, json!({"echo": {"path": "/tmp/x"}}));
}

#[tokio::test]
async fn unknown_connector_fails_fast() {
    let dir = tempfile::tempdir().unwrap();
    let hub = Hub::start(HubConfig::new(dir.path().to_path_buf())).await.unwrap();
    let err = hub.send_command("nope", "x", json!({})).await.unwrap_err();
    assert!(matches!(err, CommandError::UnknownConnector(_)));
}

#[tokio::test]
async fn command_times_out_when_connector_never_answers() {
    // Deaf connector: registers, then reads nothing and answers nothing.
    let dir = tempfile::tempdir().unwrap();
    let mut cfg = HubConfig::new(dir.path().to_path_buf());
    cfg.command_timeout = Duration::from_millis(200);
    let hub = Hub::start(cfg).await.unwrap();
    let (mut ws, _) =
        tokio_tungstenite::connect_async(format!("ws://127.0.0.1:{}", hub.port())).await.unwrap();
    ws.send(
        json!({"v":1,"id":"h","kind":"hello","payload":{"name":"deaf","kind":"fake","protocolVersion":1,"capabilities":[],"secret":hub.secret()}})
            .to_string()
            .into(),
    )
    .await
    .unwrap();
    let welcome: Value =
        serde_json::from_str(ws.next().await.unwrap().unwrap().to_text().unwrap()).unwrap();
    let id = welcome["payload"]["connectorId"].as_str().unwrap().to_string();

    let started = std::time::Instant::now();
    let err = hub.send_command(&id, "workspace.open", json!({})).await.unwrap_err();
    assert!(matches!(err, CommandError::Timeout));
    assert!(started.elapsed() < Duration::from_secs(2), "timeout must respect config");
}
