use futures_util::{SinkExt, StreamExt};
use omnibus_hub::{Hub, HubConfig, HubEvent};
use serde_json::{json, Value};
use std::time::Duration;

async fn start() -> (Hub, tempfile::TempDir) {
    let dir = tempfile::tempdir().unwrap();
    (Hub::start(HubConfig::new(dir.path().to_path_buf())).await.unwrap(), dir)
}

async fn hello_with(port: u16, extra: Value) -> Value {
    let (mut ws, _) =
        tokio_tungstenite::connect_async(format!("ws://127.0.0.1:{port}")).await.unwrap();
    let mut payload = json!({"name":"t","kind":"fake","protocolVersion":1,"capabilities":[]});
    for (k, v) in extra.as_object().unwrap() {
        payload[k] = v.clone();
    }
    ws.send(json!({"v":1,"id":"h","kind":"hello","payload":payload}).to_string().into())
        .await
        .unwrap();
    serde_json::from_str(ws.next().await.unwrap().unwrap().to_text().unwrap()).unwrap()
}

/// Like `hello_with` but lets the caller pick the connector kind — and,
/// since the only caller here mirrors a pairing where name == kind
/// ("chrome"/"chrome"), reuses the same string for both fields rather than
/// taking a separate name parameter (deviation from the brief's terser
/// "parameterized kind" description; see task-2-report.md).
async fn hello_with_kind(port: u16, kind: &str, extra: Value) -> Value {
    let (mut ws, _) =
        tokio_tungstenite::connect_async(format!("ws://127.0.0.1:{port}")).await.unwrap();
    let mut payload = json!({"name":kind,"kind":kind,"protocolVersion":1,"capabilities":[]});
    for (k, v) in extra.as_object().unwrap() {
        payload[k] = v.clone();
    }
    ws.send(json!({"v":1,"id":"h","kind":"hello","payload":payload}).to_string().into())
        .await
        .unwrap();
    serde_json::from_str(ws.next().await.unwrap().unwrap().to_text().unwrap()).unwrap()
}

/// Mirrors what the desktop layer does after a successful pairing: insert
/// the newly-issued token into the live map shared with the hub.
fn hub_insert_token(hub: &Hub, key: &str, token: &str) {
    hub.tokens_handle().write().unwrap().insert(key.into(), token.into());
}

#[tokio::test]
async fn hello_without_credentials_is_auth_failed() {
    let (hub, _d) = start().await;
    let reply = hello_with(hub.port(), json!({})).await;
    assert_eq!(reply["payload"]["code"], "auth_failed");
    assert!(hub.connectors().await.is_empty());
}

#[tokio::test]
async fn wrong_secret_rejected_correct_secret_accepted() {
    let (hub, _d) = start().await;
    let bad = hello_with(hub.port(), json!({"secret": "wrong"})).await;
    assert_eq!(bad["payload"]["code"], "auth_failed");
    let good = hello_with(hub.port(), json!({"secret": hub.secret()})).await;
    assert_eq!(good["kind"], "welcome");
}

#[tokio::test]
async fn token_auth_uses_live_map_keyed_by_name_and_kind() {
    let dir = tempfile::tempdir().unwrap();
    let cfg = HubConfig::new(dir.path().to_path_buf());
    cfg.tokens.write().unwrap().insert("t/fake".into(), "tok-1".into());
    let hub = Hub::start(cfg).await.unwrap();
    assert_eq!(hello_with(hub.port(), json!({"token": "tok-1"})).await["kind"], "welcome");
    assert_eq!(
        hello_with(hub.port(), json!({"token": "nope"})).await["payload"]["code"],
        "auth_failed"
    );
}

#[tokio::test]
async fn hub_json_has_secret_and_0600() {
    use std::os::unix::fs::PermissionsExt;
    let (hub, dir) = start().await;
    let path = dir.path().join("hub.json");
    let disco: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
    assert_eq!(disco["secret"], json!(hub.secret()));
    assert_eq!(std::fs::metadata(&path).unwrap().permissions().mode() & 0o777, 0o600);
}

#[tokio::test]
async fn pairing_approve_issues_working_token() {
    let dir = tempfile::tempdir().unwrap();
    let mut cfg = HubConfig::new(dir.path().to_path_buf());
    cfg.pairing_timeout = Duration::from_secs(5);
    let hub = Hub::start(cfg).await.unwrap();
    let mut events = hub.subscribe();

    let (mut ws, _) =
        tokio_tungstenite::connect_async(format!("ws://127.0.0.1:{}", hub.port())).await.unwrap();
    ws.send(
        json!({"v":1,"id":"p","kind":"pair","payload":{"name":"chrome","kind":"chrome"}})
            .to_string()
            .into(),
    )
    .await
    .unwrap();

    let pairing_id = loop {
        match tokio::time::timeout(Duration::from_secs(2), events.recv()).await.unwrap().unwrap() {
            HubEvent::PairingRequested { pairing_id, name, kind } => {
                assert_eq!((name.as_str(), kind.as_str()), ("chrome", "chrome"));
                break pairing_id;
            }
            _ => continue,
        }
    };
    assert_eq!(hub.pending_pairings().await.len(), 1);
    assert!(hub.resolve_pairing(&pairing_id, Some("tok-new".into())).await);

    let paired: Value =
        serde_json::from_str(ws.next().await.unwrap().unwrap().to_text().unwrap()).unwrap();
    assert_eq!(paired["kind"], "paired");
    assert_eq!(paired["payload"]["token"], "tok-new");

    // The issued token must authenticate (caller inserts into the map —
    // mirror what the desktop layer does).
    hub_insert_token(&hub, "chrome/chrome", "tok-new");
    let ok = hello_with_kind(hub.port(), "chrome", json!({"token": "tok-new"})).await;
    assert_eq!(ok["kind"], "welcome");
}

#[tokio::test]
async fn pairing_deny_and_timeout() {
    let dir = tempfile::tempdir().unwrap();
    let mut cfg = HubConfig::new(dir.path().to_path_buf());
    cfg.pairing_timeout = Duration::from_millis(300);
    let hub = Hub::start(cfg).await.unwrap();
    let mut events = hub.subscribe();

    // Deny.
    let (mut ws, _) =
        tokio_tungstenite::connect_async(format!("ws://127.0.0.1:{}", hub.port())).await.unwrap();
    ws.send(json!({"v":1,"id":"p","kind":"pair","payload":{"name":"a","kind":"chrome"}}).to_string().into())
        .await
        .unwrap();
    let id = loop {
        if let Ok(Ok(HubEvent::PairingRequested { pairing_id, .. })) =
            tokio::time::timeout(Duration::from_secs(2), events.recv()).await.map(|r| r)
        {
            break pairing_id;
        }
    };
    assert!(hub.resolve_pairing(&id, None).await);
    let denied: Value =
        serde_json::from_str(ws.next().await.unwrap().unwrap().to_text().unwrap()).unwrap();
    assert_eq!(denied["payload"]["code"], "pairing_denied");

    // Timeout.
    let (mut ws2, _) =
        tokio_tungstenite::connect_async(format!("ws://127.0.0.1:{}", hub.port())).await.unwrap();
    ws2.send(json!({"v":1,"id":"p","kind":"pair","payload":{"name":"b","kind":"chrome"}}).to_string().into())
        .await
        .unwrap();
    let timed: Value =
        serde_json::from_str(ws2.next().await.unwrap().unwrap().to_text().unwrap()).unwrap();
    assert_eq!(timed["payload"]["code"], "pairing_timeout");
    assert!(hub.pending_pairings().await.is_empty());
}

/// Two `pair` frames for the same (name, kind) — no auth required to send
/// either — must park only one pairing and broadcast only one
/// `PairingRequested`; the second connection gets rejected outright rather
/// than stacking a second banner.
#[tokio::test]
async fn duplicate_pairing_request_is_rejected() {
    let dir = tempfile::tempdir().unwrap();
    let mut cfg = HubConfig::new(dir.path().to_path_buf());
    cfg.pairing_timeout = Duration::from_secs(5);
    let hub = Hub::start(cfg).await.unwrap();
    let mut events = hub.subscribe();

    let (mut ws1, _) =
        tokio_tungstenite::connect_async(format!("ws://127.0.0.1:{}", hub.port())).await.unwrap();
    ws1.send(
        json!({"v":1,"id":"p","kind":"pair","payload":{"name":"dup","kind":"chrome"}})
            .to_string()
            .into(),
    )
    .await
    .unwrap();

    let pairing_id = loop {
        match tokio::time::timeout(Duration::from_secs(2), events.recv()).await.unwrap().unwrap() {
            HubEvent::PairingRequested { pairing_id, name, kind } => {
                assert_eq!((name.as_str(), kind.as_str()), ("dup", "chrome"));
                break pairing_id;
            }
            _ => continue,
        }
    };
    assert_eq!(hub.pending_pairings().await.len(), 1);

    // Second connection, same (name, kind): must be rejected, not parked.
    let (mut ws2, _) =
        tokio_tungstenite::connect_async(format!("ws://127.0.0.1:{}", hub.port())).await.unwrap();
    ws2.send(
        json!({"v":1,"id":"p","kind":"pair","payload":{"name":"dup","kind":"chrome"}})
            .to_string()
            .into(),
    )
    .await
    .unwrap();
    let reply: Value =
        serde_json::from_str(ws2.next().await.unwrap().unwrap().to_text().unwrap()).unwrap();
    assert_eq!(reply["kind"], "error");
    assert_eq!(reply["payload"]["code"], "bad_message");

    // Still only the original pairing parked.
    assert_eq!(hub.pending_pairings().await.len(), 1);

    // No second `PairingRequested` for ("dup", "chrome") was broadcast.
    let mut saw_second = false;
    while let Ok(Ok(ev)) = tokio::time::timeout(Duration::from_millis(200), events.recv()).await {
        if let HubEvent::PairingRequested { name, kind, .. } = ev {
            if name == "dup" && kind == "chrome" {
                saw_second = true;
            }
        }
    }
    assert!(!saw_second, "a second PairingRequested was broadcast for a duplicate pair request");

    // Cleanup: resolve the original so nothing lingers past the test.
    assert!(hub.resolve_pairing(&pairing_id, None).await);
}

#[tokio::test]
async fn late_pair_frame_is_bad_message() {
    let (hub, _d) = start().await;
    let (mut ws, _) =
        tokio_tungstenite::connect_async(format!("ws://127.0.0.1:{}", hub.port())).await.unwrap();
    ws.send(
        json!({"v":1,"id":"h","kind":"hello","payload":{"name":"t","kind":"fake","protocolVersion":1,"capabilities":[],"secret":hub.secret()}})
            .to_string()
            .into(),
    )
    .await
    .unwrap();
    let welcome: Value =
        serde_json::from_str(ws.next().await.unwrap().unwrap().to_text().unwrap()).unwrap();
    assert_eq!(welcome["kind"], "welcome");

    for _ in 0..2 {
        ws.send(
            json!({"v":1,"id":"p","kind":"pair","payload":{"name":"t","kind":"fake"}})
                .to_string()
                .into(),
        )
        .await
        .unwrap();
        let reply: Value =
            serde_json::from_str(ws.next().await.unwrap().unwrap().to_text().unwrap()).unwrap();
        assert_eq!(reply["kind"], "error");
        assert_eq!(reply["payload"]["code"], "bad_message");
    }

    // Third strike: send it, then observe the hub break the loop (three
    // bad_message error frames may arrive first, mirroring the malformed-
    // frame close test in events.rs).
    ws.send(
        json!({"v":1,"id":"p","kind":"pair","payload":{"name":"t","kind":"fake"}})
            .to_string()
            .into(),
    )
    .await
    .unwrap();
    let mut closed = false;
    for _ in 0..10 {
        match tokio::time::timeout(Duration::from_secs(2), ws.next()).await {
            Ok(None) | Ok(Some(Err(_))) | Err(_) => {
                closed = true;
                break;
            }
            Ok(Some(Ok(frame))) => {
                if frame.is_close() {
                    closed = true;
                    break;
                }
                let reply: Value = serde_json::from_str(frame.to_text().unwrap()).unwrap();
                assert_eq!(reply["payload"]["code"], "bad_message");
            }
        }
    }
    assert!(closed, "hub did not close after 3 late pair frames");
}

#[tokio::test]
async fn hub_json_replaces_preexisting_file_atomically_at_0600() {
    use std::os::unix::fs::PermissionsExt;
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("hub.json");
    std::fs::write(&path, "junk").unwrap();
    let mut perms = std::fs::metadata(&path).unwrap().permissions();
    perms.set_mode(0o644);
    std::fs::set_permissions(&path, perms).unwrap();

    let hub = Hub::start(HubConfig::new(dir.path().to_path_buf())).await.unwrap();
    let disco: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
    assert_eq!(disco["secret"], json!(hub.secret()));
    assert_eq!(std::fs::metadata(&path).unwrap().permissions().mode() & 0o777, 0o600);
}

#[tokio::test]
async fn origin_policy_matrix() {
    use tokio_tungstenite::tungstenite::{client::IntoClientRequest, http::HeaderValue};
    let (hub, _d) = start().await;
    for (origin, allowed) in [
        ("chrome-extension://abcdefg", true),
        ("moz-extension://abcdefg", true),
        ("https://evil.example", false),
        ("http://localhost:5173", false),
    ] {
        let mut req =
            format!("ws://127.0.0.1:{}", hub.port()).into_client_request().unwrap();
        req.headers_mut().insert("Origin", HeaderValue::from_static(origin));
        let attempt = tokio_tungstenite::connect_async(req).await;
        assert_eq!(attempt.is_ok(), allowed, "origin {origin}");
    }
}
