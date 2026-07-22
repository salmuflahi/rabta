use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use rabta_db::{Db, DbConfig, NewProject, NewTask};
use rabta_desktop_lib::capsules::Capsules;
use rabta_hub::{Hub, HubConfig};
use serde_json::{json, Value};
use tokio::sync::mpsc;

mod common;
use common::{git, repo_with_commit};

type Ws = tokio_tungstenite::WebSocketStream<
    tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
>;

/// Connects a scripted `vscode`-kind connector. Every command it receives is
/// forwarded to `seen`; replies come from `respond`.
async fn scripted_connector(
    hub: &Hub,
    seen: mpsc::UnboundedSender<(String, Value)>,
    respond: impl Fn(&str, &Value) -> Value + Send + 'static,
) -> tokio::task::JoinHandle<()> {
    scripted_connector_kind(hub, "vscode", seen, respond).await
}

/// Connects a scripted connector of the given `kind`. Every command it
/// receives is forwarded to `seen`; replies come from `respond`.
async fn scripted_connector_kind(
    hub: &Hub,
    kind: &str,
    seen: mpsc::UnboundedSender<(String, Value)>,
    respond: impl Fn(&str, &Value) -> Value + Send + 'static,
) -> tokio::task::JoinHandle<()> {
    let (mut ws, _) =
        tokio_tungstenite::connect_async(format!("ws://127.0.0.1:{}", hub.port())).await.unwrap();
    ws.send(
        json!({"v":1,"id":"h","kind":"hello","payload":{"name":kind,"kind":kind,"protocolVersion":1,"capabilities":["workspace","editor","terminal"],"secret":hub.secret()}})
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

fn fake_state(root: &str, files: &[&str]) -> Value {
    json!({ "root": root, "openFiles": files })
}

fn tabs_state(urls: &[&str]) -> Value {
    json!({ "tabs": urls.iter().map(|u| json!({"url": u, "title": u})).collect::<Vec<_>>() })
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
    let _conn = scripted_connector(&hub, tx, |name, _| match name {
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
    let _conn = scripted_connector(&hub, tx, |name, _| match name {
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
    let conn = scripted_connector(&hub, tx, |name, _| match name {
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
    let _conn2 = scripted_connector(&hub, tx2, |_, _| json!({})).await;

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
    let _conn = scripted_connector(&hub, tx, |name, _| match name {
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
    let conn = scripted_connector(&hub, tx, |name, _| match name {
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
    let _conn2 = scripted_connector(&hub, tx2, |_, _| json!({})).await;
    tokio::time::sleep(Duration::from_millis(700)).await;
    while let Ok((name, args)) = rx2.try_recv() {
        assert_ne!(
            (name.as_str(), args["path"].as_str()),
            ("editor.openFile", Some("/repo/other/old.ts")),
            "stale pending from task A must not apply after B's activation"
        );
    }
}

#[tokio::test]
async fn activate_fake_capsule_opens_root_workspace() {
    let (hub, db, capsules, task_id, _dir) = setup().await;
    db.replace_task_resources(&task_id, "fake", "workspace", &fake_state("/repo/f", &["a"]))
        .unwrap();
    let (tx, mut rx) = mpsc::unbounded_channel();
    let _conn = scripted_connector_kind(&hub, "fake", tx, |_, _| json!({})).await;
    tokio::time::sleep(Duration::from_millis(100)).await;

    let summary = capsules.activate_task(&task_id).await.unwrap();
    assert_eq!(summary.applied, vec!["fake"]);

    let mut names = vec![];
    while let Ok((name, args)) = rx.try_recv() {
        names.push((name, args));
    }
    let opened = names.iter().find(|(n, _)| n == "workspace.open");
    assert!(opened.is_some(), "connector should have received workspace.open, got {names:?}");
    assert_eq!(opened.unwrap().1["path"].as_str(), Some("/repo/f"));
}

#[tokio::test]
async fn mid_settle_activation_supersedes_pending() {
    // A dedicated Capsules with a longer settle window so we can land an
    // activation squarely inside it.
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
    let task_a = db.create_task(NewTask { project_id: p.id.clone(), title: "a".into() }).unwrap().id;
    let task_b = db.create_task(NewTask { project_id: p.id, title: "b".into() }).unwrap().id;
    let capsules = Capsules::new(hub.clone(), db.clone(), Duration::from_millis(300));
    capsules.spawn_continuation_on(tokio::runtime::Handle::current());

    // A's capsule points at a DIFFERENT folder -> activation defers to pending.
    db.replace_task_resources(
        &task_a,
        "vscode",
        "workspace",
        &state("/repo/other", &["/repo/other/old.ts"]),
    )
    .unwrap();
    // B's capsule matches the current folder -> plain apply, no pending.
    db.replace_task_resources(&task_b, "vscode", "workspace", &state("/repo/a", &[])).unwrap();

    let (tx, _rx) = mpsc::unbounded_channel();
    let conn = scripted_connector(&hub, tx, |name, _| match name {
        "workspace.state" => state("/repo/a", &[]),
        _ => json!({}),
    })
    .await;
    tokio::time::sleep(Duration::from_millis(100)).await;

    let a = capsules.activate_task(&task_a).await.unwrap();
    assert_eq!(a.pending, vec!["vscode"], "A defers cross-folder");

    // Simulate the window reload: drop the connection, reconnect.
    conn.abort();
    tokio::time::sleep(Duration::from_millis(100)).await;
    let (tx2, mut rx2) = mpsc::unbounded_channel();
    let _conn2 = scripted_connector(&hub, tx2, |name, _| match name {
        "workspace.state" => state("/repo/a", &[]),
        _ => json!({}),
    })
    .await;

    // The reconnect starts the continuation's 300ms settle sleep. ~100ms
    // into that window, activate B: same-folder, so it applies immediately
    // and bumps the generation past A's pending.
    tokio::time::sleep(Duration::from_millis(100)).await;
    let b = capsules.activate_task(&task_b).await.unwrap();
    assert!(b.pending.is_empty(), "B is same-folder");

    // Total wait since reconnect is well past the 300ms settle window.
    tokio::time::sleep(Duration::from_millis(400)).await;
    let mut names = vec![];
    while let Ok((name, args)) = rx2.try_recv() {
        names.push((name, args));
    }
    assert!(
        !names
            .iter()
            .any(|(n, a)| n == "editor.openFile" && a["path"].as_str() == Some("/repo/other/old.ts")),
        "stale pending from task A must not apply after B's mid-settle activation: {names:?}"
    );
}

async fn project_with_repo(db: &Db, repo: &std::path::Path) -> String {
    let p = db
        .create_project(rabta_db::NewProject {
            name: format!("git-proj-{}", repo.display()),
            repo_path: repo.to_str().unwrap().to_string(),
            dev_url: None,
            default_branch: "main".into(),
        })
        .unwrap();
    db.create_task(rabta_db::NewTask { project_id: p.id, title: "git task".into() }).unwrap().id
}

#[tokio::test]
async fn save_capsule_records_current_branch() {
    let (hub, db, capsules, _t, _dir) = setup().await;
    let _ = hub; // no connectors needed
    let repo = repo_with_commit().await;
    let task = project_with_repo(&db, repo.path()).await;

    let summary = capsules.save_capsule(&task).await.unwrap();
    assert!(summary.captured.contains(&"git".to_string()), "got {summary:?}");

    let rows = db.task_resources(&task).unwrap();
    let git_row = rows.iter().find(|r| r.connector_kind == "git").unwrap();
    assert_eq!(git_row.resource_type, "branch");
    assert_eq!(git_row.payload["branch"], serde_json::json!("main"));
}

#[tokio::test]
async fn activate_restores_branch_on_clean_tree() {
    let (_hub, db, capsules, _t, _dir) = setup().await;
    let repo = repo_with_commit().await;
    let task = project_with_repo(&db, repo.path()).await;
    db.replace_task_resources(&task, "git", "branch", &serde_json::json!({"branch": "main"}))
        .unwrap();
    // Move the repo off main; activation must bring it back.
    git(repo.path(), &["switch", "-c", "elsewhere"]).await;

    let summary = capsules.activate_task(&task).await.unwrap();
    assert!(summary.applied.contains(&"git".to_string()), "got {summary:?}");
    assert_eq!(
        rabta_desktop_lib::git::status(repo.path()).await.unwrap().branch.as_deref(),
        Some("main")
    );
}

#[tokio::test]
async fn activate_refuses_branch_switch_on_dirty_tree() {
    let (hub, db, capsules, _t, _dir) = setup().await;
    let repo = repo_with_commit().await;
    let task = project_with_repo(&db, repo.path()).await;
    db.replace_task_resources(&task, "git", "branch", &serde_json::json!({"branch": "main"}))
        .unwrap();
    db.replace_task_resources(&task, "vscode", "workspace", &state("/repo/a", &[])).unwrap();
    git(repo.path(), &["switch", "-c", "elsewhere"]).await;
    std::fs::write(repo.path().join("a.txt"), "precious\n").unwrap();

    let (tx, _rx) = mpsc::unbounded_channel();
    let _conn = scripted_connector(&hub, tx, |name, _| match name {
        "workspace.state" => state("/repo/a", &[]), // same folder, editor restore proceeds
        _ => json!({}),
    })
    .await;
    tokio::time::sleep(Duration::from_millis(100)).await;

    let summary = capsules.activate_task(&task).await.unwrap();
    assert!(summary.skipped.contains(&"git".to_string()), "got {summary:?}");
    assert!(summary.errors.iter().any(|e| e.contains("never discards")), "got {summary:?}");
    assert!(
        summary.applied.contains(&"vscode".to_string()),
        "editor restore must proceed despite git refusal: got {summary:?}"
    );
    assert_eq!(
        rabta_desktop_lib::git::status(repo.path()).await.unwrap().branch.as_deref(),
        Some("elsewhere"),
        "branch unchanged"
    );
    assert_eq!(std::fs::read_to_string(repo.path().join("a.txt")).unwrap(), "precious\n");
}

#[tokio::test]
async fn save_capsule_captures_chrome_tabs() {
    let (hub, db, capsules, task_id, _dir) = setup().await;
    let (tx, _rx) = mpsc::unbounded_channel();
    // Scripted chrome-kind connector answering workspace.state with tabs.
    let _c = scripted_connector_kind(&hub, "chrome", tx, |name, _| match name {
        "workspace.state" => tabs_state(&["https://a.test", "https://b.test"]),
        _ => json!({}),
    })
    .await;
    tokio::time::sleep(Duration::from_millis(100)).await;

    let summary = capsules.save_capsule(&task_id).await.unwrap();
    assert!(summary.captured.contains(&"chrome".to_string()), "got {summary:?}");
    let rows = db.task_resources(&task_id).unwrap();
    let chrome = rows.iter().find(|r| r.connector_kind == "chrome").unwrap();
    assert_eq!(chrome.payload["tabs"][0]["url"], "https://a.test");
}

#[tokio::test]
async fn activate_opens_chrome_tabs_additively() {
    let (hub, db, capsules, task_id, _dir) = setup().await;
    db.replace_task_resources(&task_id, "chrome", "workspace", &tabs_state(&["https://x.test", "https://y.test"]))
        .unwrap();
    let (tx, mut rx) = mpsc::unbounded_channel();
    let _c = scripted_connector_kind(&hub, "chrome", tx, |_, _| json!({})).await;
    tokio::time::sleep(Duration::from_millis(100)).await;

    let summary = capsules.activate_task(&task_id).await.unwrap();
    assert!(summary.applied.contains(&"chrome".to_string()), "got {summary:?}");
    assert!(summary.pending.is_empty(), "chrome restore is not deferred");

    let mut opened = vec![];
    while let Ok((name, args)) = rx.try_recv() {
        if name == "tabs.open" {
            opened.push(args["url"].as_str().unwrap().to_string());
        }
    }
    assert!(opened.contains(&"https://x.test".to_string()), "got {opened:?}");
    assert!(opened.contains(&"https://y.test".to_string()), "got {opened:?}");
}

#[tokio::test]
async fn activate_chrome_without_browser_is_skipped() {
    let (_hub, db, capsules, task_id, _dir) = setup().await;
    db.replace_task_resources(&task_id, "chrome", "workspace", &tabs_state(&["https://z.test"]))
        .unwrap();
    let summary = capsules.activate_task(&task_id).await.unwrap();
    assert!(summary.skipped.contains(&"chrome".to_string()), "got {summary:?}");
}

/// Proves the continuation's per-command generation recheck: a newer
/// activation landing WHILE the continuation is mid-way through sending
/// several commands to the same connector must stop the remaining sends,
/// not just be caught by the single check before the loop starts (that
/// narrower case is `mid_settle_activation_supersedes_pending` above).
///
/// The reconnected connector's mock blocks synchronously (via a std
/// channel) while handling the first `editor.openFile`, which lets the
/// test deterministically land a second, generation-bumping `activate_task`
/// call in the gap between command #1 completing and command #2 being
/// sent — without racing on wall-clock timing. Requires a multi-thread
/// runtime so the one blocked mock doesn't stall the whole test.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn continuation_recheck_stops_mid_apply_on_newer_activation() {
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
    let task_a = db.create_task(NewTask { project_id: p.id.clone(), title: "a".into() }).unwrap().id;
    let task_b = db.create_task(NewTask { project_id: p.id, title: "b".into() }).unwrap().id;
    let capsules = Capsules::new(hub.clone(), db.clone(), Duration::from_millis(50));
    capsules.spawn_continuation_on(tokio::runtime::Handle::current());

    // A's capsule points at a different folder (defers to pending) and has
    // two files + a terminal to restore, giving the continuation multiple
    // commands to send. No `activeFile` set, so `restore_vscode` won't
    // reorder `openFiles` — they're sent in the given order, a.ts then b.ts.
    db.replace_task_resources(
        &task_a,
        "vscode",
        "workspace",
        &json!({
            "workspaceFolder": "/repo/other",
            "openFiles": ["/repo/other/a.ts", "/repo/other/b.ts"],
            "terminals": [{"name": "zsh", "cwd": "/repo/other"}]
        }),
    )
    .unwrap();

    let (tx, _rx) = mpsc::unbounded_channel();
    let conn = scripted_connector(&hub, tx, |name, _| match name {
        "workspace.state" => state("/repo/a", &[]), // WRONG folder vs. "/repo/other"
        _ => json!({}),
    })
    .await;
    tokio::time::sleep(Duration::from_millis(100)).await;

    let a = capsules.activate_task(&task_a).await.unwrap();
    assert_eq!(a.pending, vec!["vscode"], "A defers cross-folder");

    // Simulate the window reload: drop the connection, reconnect with a
    // mock that blocks (synchronously, off the async executor) the instant
    // it sees the first openFile, and reports every command back on rx2.
    conn.abort();
    tokio::time::sleep(Duration::from_millis(100)).await;

    let (signal_tx, mut signal_rx) = mpsc::unbounded_channel::<()>();
    let (release_tx, release_rx) = std::sync::mpsc::channel::<()>();
    let release_rx = std::sync::Mutex::new(Some(release_rx));
    let (tx2, mut rx2) = mpsc::unbounded_channel();
    let _conn2 = scripted_connector(&hub, tx2, move |name, args| {
        if name == "editor.openFile" && args["path"].as_str() == Some("/repo/other/a.ts") {
            let _ = signal_tx.send(());
            // Block this connection's handling thread until the test says
            // go. Safe under the multi-thread runtime: only one worker is
            // tied up, and nothing else needed to make progress depends on
            // this specific thread.
            if let Some(rx) = release_rx.lock().unwrap().take() {
                let _ = rx.recv();
            }
        }
        json!({})
    })
    .await;

    // Wait for the continuation to be mid-way through sending a.ts before
    // doing anything else — no sleeps/guessing involved.
    signal_rx.recv().await.expect("a.ts command should have been sent");

    // Bump the generation via a second activation while a.ts's response is
    // still withheld. `activate_task` increments the generation counter
    // synchronously right after acquiring the activation lock, before it
    // ever touches the hub (the hub round-trip — auto-saving the previous
    // task's capsule — only happens afterwards, and will itself then block
    // on the same withheld connector until we release it below). A short
    // sleep gives the spawned task ample time to reach and clear that
    // point — the preceding work is a handful of uncontended lock
    // acquisitions and an atomic increment, not I/O.
    let capsules2 = capsules.clone();
    let task_b2 = task_b.clone();
    let second_activation = tokio::spawn(async move {
        let _ = capsules2.activate_task(&task_b2).await;
    });
    tokio::time::sleep(Duration::from_millis(150)).await;

    // Now let a.ts's response (and everything queued behind it) through.
    release_tx.send(()).unwrap();
    let _ = tokio::time::timeout(Duration::from_secs(5), second_activation).await;
    tokio::time::sleep(Duration::from_millis(200)).await;

    let mut names = vec![];
    while let Ok((name, args)) = rx2.try_recv() {
        names.push((name, args));
    }
    assert!(
        names.iter().any(|(n, a)| n == "editor.openFile" && a["path"].as_str() == Some("/repo/other/a.ts")),
        "a.ts (already in flight when the newer activation landed) must still have applied: {names:?}"
    );
    assert!(
        !names.iter().any(|(n, a)| n == "editor.openFile" && a["path"].as_str() == Some("/repo/other/b.ts")),
        "b.ts must not have been sent once superseded: {names:?}"
    );
    assert!(
        !names.iter().any(|(n, _)| n == "terminal.create"),
        "terminal.create must not have been sent once superseded: {names:?}"
    );
}
