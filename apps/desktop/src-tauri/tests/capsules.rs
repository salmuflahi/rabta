use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use omnibus_db::{Db, DbConfig, NewProject, NewTask};
use omnibus_desktop_lib::capsules::Capsules;
use omnibus_hub::{Hub, HubConfig};
use serde_json::{json, Value};
use tokio::sync::mpsc;

type Ws = tokio_tungstenite::WebSocketStream<
    tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
>;

/// Connects a scripted `vscode`-kind connector. Every command it receives is
/// forwarded to `seen`; replies come from `respond`.
async fn scripted_connector(
    port: u16,
    seen: mpsc::UnboundedSender<(String, Value)>,
    respond: impl Fn(&str, &Value) -> Value + Send + 'static,
) -> tokio::task::JoinHandle<()> {
    let (mut ws, _) =
        tokio_tungstenite::connect_async(format!("ws://127.0.0.1:{port}")).await.unwrap();
    ws.send(
        json!({"v":1,"id":"h","kind":"hello","payload":{"name":"vscode","kind":"vscode","protocolVersion":1,"capabilities":["workspace","editor","terminal"]}})
            .to_string()
            .into(),
    )
    .await
    .unwrap();
    ws.next().await; // welcome
    tokio::spawn(async move { pump(ws, seen, respond).await })
}

async fn pump(
    mut ws: Ws,
    seen: mpsc::UnboundedSender<(String, Value)>,
    respond: impl Fn(&str, &Value) -> Value,
) {
    while let Some(Ok(frame)) = ws.next().await {
        let Ok(txt) = frame.to_text() else { continue };
        let Ok(env) = serde_json::from_str::<Value>(txt) else { continue };
        match env["kind"].as_str() {
            Some("ping") => {
                let _ = ws
                    .send(json!({"v":1,"id":"p","kind":"pong","payload":{}}).to_string().into())
                    .await;
            }
            Some("command") => {
                let name = env["payload"]["name"].as_str().unwrap_or("").to_string();
                let args = env["payload"]["args"].clone();
                let result = respond(&name, &args);
                let _ = seen.send((name, args));
                let resp = json!({"v":1,"id":"r","kind":"response","payload":{
                    "requestId": env["id"], "ok": true, "result": result
                }});
                let _ = ws.send(resp.to_string().into()).await;
            }
            _ => {}
        }
    }
}

fn state(folder: &str, files: &[&str]) -> Value {
    json!({
        "workspaceFolder": folder,
        "openFiles": files,
        "activeFile": files.first(),
        "terminals": [{"name": "zsh", "cwd": folder}]
    })
}

async fn setup() -> (Arc<Hub>, Db, Capsules, String, tempfile::TempDir) {
    let dir = tempfile::tempdir().unwrap();
    let hub = Arc::new(Hub::start(HubConfig::new(dir.path().to_path_buf())).await.unwrap());
    let db = Db::open_in_memory(DbConfig::default()).unwrap();
    let p = db
        .create_project(NewProject {
            name: "proj".into(),
            repo_path: "/tmp/proj".into(),
            dev_url: None,
            default_branch: "main".into(),
        })
        .unwrap();
    let t = db.create_task(NewTask { project_id: p.id, title: "task".into() }).unwrap();
    let capsules = Capsules::new(hub.clone(), db.clone(), Duration::from_millis(50));
    (hub, db, capsules, t.id, dir)
}

#[tokio::test]
async fn save_capsule_captures_workspace_state_into_rows() {
    let (hub, db, capsules, task_id, _dir) = setup().await;
    let (tx, _rx) = mpsc::unbounded_channel();
    let _conn = scripted_connector(hub.port(), tx, |name, _| match name {
        "workspace.state" => state("/repo/a", &["/repo/a/main.ts"]),
        _ => json!({}),
    })
    .await;
    tokio::time::sleep(Duration::from_millis(100)).await; // registration settles

    let summary = capsules.save_capsule(&task_id).await.unwrap();
    assert_eq!(summary.captured, vec!["vscode"]);

    let rows = db.task_resources(&task_id).unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].connector_kind, "vscode");
    assert_eq!(rows[0].resource_type, "workspace");
    assert_eq!(rows[0].payload["openFiles"], json!(["/repo/a/main.ts"]));
}

#[tokio::test]
async fn activate_same_folder_opens_files_and_terminals() {
    let (hub, db, capsules, task_id, _dir) = setup().await;
    db.replace_task_resources(&task_id, "vscode", "workspace", &state("/repo/a", &["/repo/a/x.ts", "/repo/a/y.ts"]))
        .unwrap();
    let (tx, mut rx) = mpsc::unbounded_channel();
    let _conn = scripted_connector(hub.port(), tx, |name, _| match name {
        "workspace.state" => state("/repo/a", &[]), // same folder, no files open
        _ => json!({}),
    })
    .await;
    tokio::time::sleep(Duration::from_millis(100)).await;

    let summary = capsules.activate_task(&task_id).await.unwrap();
    assert_eq!(summary.applied, vec!["vscode"]);
    assert!(summary.pending.is_empty());
    assert_eq!(capsules.active_task().as_deref(), Some(task_id.as_str()));

    let mut names = vec![];
    while let Ok((name, args)) = rx.try_recv() {
        names.push(format!("{name}:{}", args["path"].as_str().or(args["cwd"].as_str()).unwrap_or("")));
    }
    assert!(names.contains(&"workspace.state:".to_string()));
    assert!(names.contains(&"editor.openFile:/repo/a/x.ts".to_string()));
    assert!(names.contains(&"editor.openFile:/repo/a/y.ts".to_string()));
    assert!(names.contains(&"terminal.create:/repo/a".to_string()));
}

#[tokio::test]
async fn activate_cross_folder_defers_and_continues_on_reconnect() {
    let (hub, db, capsules, task_id, _dir) = setup().await;
    capsules.spawn_continuation_on(tokio::runtime::Handle::current());
    db.replace_task_resources(&task_id, "vscode", "workspace", &state("/repo/b", &["/repo/b/z.ts"]))
        .unwrap();
    let (tx, rx_ignored) = mpsc::unbounded_channel();
    drop(rx_ignored);
    let conn = scripted_connector(hub.port(), tx, |name, _| match name {
        "workspace.state" => state("/repo/a", &[]), // WRONG folder
        _ => json!({}),
    })
    .await;
    tokio::time::sleep(Duration::from_millis(100)).await;

    let summary = capsules.activate_task(&task_id).await.unwrap();
    assert_eq!(summary.pending, vec!["vscode"]);
    assert!(summary.applied.is_empty());

    // Simulate the window reload: drop the connection, reconnect.
    conn.abort();
    tokio::time::sleep(Duration::from_millis(100)).await;
    let (tx2, mut rx2) = mpsc::unbounded_channel();
    let _conn2 = scripted_connector(hub.port(), tx2, |_, _| json!({})).await;

    // settle (50ms in tests) + margin, then the continuation must have fired
    tokio::time::sleep(Duration::from_millis(700)).await;
    let mut names = vec![];
    while let Ok((name, args)) = rx2.try_recv() {
        names.push(format!("{name}:{}", args["path"].as_str().or(args["cwd"].as_str()).unwrap_or("")));
    }
    assert!(names.contains(&"editor.openFile:/repo/b/z.ts".to_string()), "got {names:?}");
    assert!(names.contains(&"terminal.create:/repo/b".to_string()), "got {names:?}");
}

#[tokio::test]
async fn activating_b_autosaves_active_a_first() {
    let (hub, db, capsules, task_a, _dir) = setup().await;
    let p2 = db.list_projects().unwrap().remove(0);
    let task_b = db.create_task(NewTask { project_id: p2.id, title: "b".into() }).unwrap().id;
    let (tx, _rx) = mpsc::unbounded_channel();
    let _conn = scripted_connector(hub.port(), tx, |name, _| match name {
        "workspace.state" => state("/repo/a", &["/repo/a/current.ts"]),
        _ => json!({}),
    })
    .await;
    tokio::time::sleep(Duration::from_millis(100)).await;

    capsules.activate_task(&task_a).await.unwrap(); // A active (no capsule; fine)
    let summary = capsules.activate_task(&task_b).await.unwrap();
    assert_eq!(summary.saved_previous.as_deref(), Some(task_a.as_str()));

    let rows = db.task_resources(&task_a).unwrap();
    assert_eq!(rows.len(), 1, "A got auto-saved on switch");
    assert_eq!(rows[0].payload["openFiles"], json!(["/repo/a/current.ts"]));
}

#[tokio::test]
async fn newer_activation_clears_stale_pending_restore() {
    let (hub, db, capsules, task_a, _dir) = setup().await;
    capsules.spawn_continuation_on(tokio::runtime::Handle::current());
    let p = db.list_projects().unwrap().remove(0);
    let task_b = db.create_task(NewTask { project_id: p.id, title: "b".into() }).unwrap().id;
    // A's capsule points at a DIFFERENT folder -> activation defers to pending.
    db.replace_task_resources(&task_a, "vscode", "workspace", &state("/repo/other", &["/repo/other/old.ts"]))
        .unwrap();
    // B's capsule matches the current folder -> plain apply, no pending.
    db.replace_task_resources(&task_b, "vscode", "workspace", &state("/repo/a", &[]))
        .unwrap();
    let (tx, _rx) = mpsc::unbounded_channel();
    let conn = scripted_connector(hub.port(), tx, |name, _| match name {
        "workspace.state" => state("/repo/a", &[]),
        _ => json!({}),
    })
    .await;
    tokio::time::sleep(Duration::from_millis(100)).await;

    let a = capsules.activate_task(&task_a).await.unwrap();
    assert_eq!(a.pending, vec!["vscode"], "A defers cross-folder");
    let b = capsules.activate_task(&task_b).await.unwrap();
    assert!(b.pending.is_empty(), "B is same-folder");

    // Reconnect: the stale pending from A must NOT fire.
    conn.abort();
    tokio::time::sleep(Duration::from_millis(100)).await;
    let (tx2, mut rx2) = mpsc::unbounded_channel();
    let _conn2 = scripted_connector(hub.port(), tx2, |_, _| json!({})).await;
    tokio::time::sleep(Duration::from_millis(700)).await;
    while let Ok((name, args)) = rx2.try_recv() {
        assert_ne!(
            (name.as_str(), args["path"].as_str()),
            ("editor.openFile", Some("/repo/other/old.ts")),
            "stale pending from task A must not apply after B's activation"
        );
    }
}
