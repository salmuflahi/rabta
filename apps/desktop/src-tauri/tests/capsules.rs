use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

use futures_util::{SinkExt, StreamExt};
use rabta_db::{Db, DbConfig, NewProject, NewTask};
use rabta_desktop_lib::capsules::{Capsules, SessionClock, SessionPersistence};
use rabta_hub::{Hub, HubConfig};
use serde_json::{json, Value};
use tokio::sync::{mpsc, oneshot};

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

#[derive(Clone)]
struct FakeSessionClock {
    monotonic: Arc<Mutex<Instant>>,
    utc: Arc<Mutex<String>>,
}

impl FakeSessionClock {
    fn new() -> Self {
        Self {
            monotonic: Arc::new(Mutex::new(Instant::now())),
            utc: Arc::new(Mutex::new("2026-07-23T12:00:00Z".into())),
        }
    }

    fn advance(&self, duration: Duration) {
        *self.monotonic.lock().unwrap() += duration;
    }
}

impl SessionClock for FakeSessionClock {
    fn monotonic_now(&self) -> Instant {
        *self.monotonic.lock().unwrap()
    }

    fn utc_now(&self) -> String {
        self.utc.lock().unwrap().clone()
    }
}

struct BlockingPersistenceCall {
    entered: oneshot::Sender<()>,
    released: Arc<(Mutex<bool>, Condvar)>,
}

#[derive(Clone)]
struct PersistenceRelease {
    released: Arc<(Mutex<bool>, Condvar)>,
}

impl PersistenceRelease {
    fn release(&self) {
        let (released, wake) = &*self.released;
        *released.lock().unwrap() = true;
        wake.notify_all();
    }
}

impl Drop for PersistenceRelease {
    fn drop(&mut self) {
        self.release();
    }
}

struct TestSessionPersistence {
    db: Db,
    fail_next_add: AtomicBool,
    fail_next_begin: AtomicBool,
    block_next_add: Mutex<Option<BlockingPersistenceCall>>,
}

impl TestSessionPersistence {
    fn new(db: Db) -> Self {
        Self {
            db,
            fail_next_add: AtomicBool::new(false),
            fail_next_begin: AtomicBool::new(false),
            block_next_add: Mutex::new(None),
        }
    }

    fn fail_next_add(&self) {
        self.fail_next_add.store(true, Ordering::SeqCst);
    }

    fn fail_next_begin(&self) {
        self.fail_next_begin.store(true, Ordering::SeqCst);
    }

    fn block_next_add(&self) -> (oneshot::Receiver<()>, PersistenceRelease) {
        let (entered, wait_for_entry) = oneshot::channel();
        let released = Arc::new((Mutex::new(false), Condvar::new()));
        *self.block_next_add.lock().unwrap() = Some(BlockingPersistenceCall {
            entered,
            released: released.clone(),
        });
        (wait_for_entry, PersistenceRelease { released })
    }
}

impl SessionPersistence for TestSessionPersistence {
    fn begin_project_session_for_task(
        &self,
        task_id: &str,
        opened_at: &str,
    ) -> Result<(), String> {
        if self.fail_next_begin.swap(false, Ordering::SeqCst) {
            return Err("injected session begin failure".into());
        }
        self.db
            .begin_project_session_for_task(task_id, opened_at)
            .map_err(|error| error.to_string())
    }

    fn add_active_seconds_for_task(&self, task_id: &str, seconds: u64) -> Result<(), String> {
        let blocking = self.block_next_add.lock().unwrap().take();
        if let Some(blocking) = blocking {
            let _ = blocking.entered.send(());
            let (released, wake) = &*blocking.released;
            let mut released = released.lock().unwrap();
            while !*released {
                released = wake.wait(released).unwrap();
            }
        }
        if self.fail_next_add.swap(false, Ordering::SeqCst) {
            return Err("injected active-seconds failure".into());
        }
        self.db
            .add_active_seconds_for_task(task_id, seconds)
            .map_err(|error| error.to_string())
    }
}

struct SessionFixture {
    hub: Arc<Hub>,
    db: Db,
    capsules: Capsules,
    clock: FakeSessionClock,
    persistence: Arc<TestSessionPersistence>,
    project_id: String,
    task_id: String,
    _dir: tempfile::TempDir,
}

impl SessionFixture {
    fn project(&self) -> rabta_db::Project {
        self.db.get_project(&self.project_id).unwrap().unwrap()
    }
}

async fn session_fixture() -> SessionFixture {
    let dir = tempfile::tempdir().unwrap();
    let hub = Arc::new(Hub::start(HubConfig::new(dir.path().to_path_buf())).await.unwrap());
    let db = Db::open_in_memory(DbConfig::default()).unwrap();
    let project = db
        .create_project(NewProject {
            name: "session project".into(),
            repo_path: "/tmp/session-project".into(),
            dev_url: None,
            default_branch: "main".into(),
        })
        .unwrap();
    let task = db
        .create_task(NewTask {
            project_id: project.id.clone(),
            title: "session task".into(),
        })
        .unwrap();
    let clock = FakeSessionClock::new();
    let persistence = Arc::new(TestSessionPersistence::new(db.clone()));
    let capsules = Capsules::new_with_clock_and_persistence(
        hub.clone(),
        db.clone(),
        Duration::from_millis(50),
        Arc::new(clock.clone()),
        persistence.clone(),
    );
    SessionFixture {
        hub,
        db,
        capsules,
        clock,
        persistence,
        project_id: project.id,
        task_id: task.id,
        _dir: dir,
    }
}

#[tokio::test]
async fn session_credits_only_focused_non_idle_time_and_caps_sleep_gaps() {
    let fixture = session_fixture().await;
    fixture.capsules.activate_task(&fixture.task_id).await.unwrap();
    assert_eq!(
        fixture.project().last_opened_at.as_deref(),
        Some("2026-07-23T12:00:00Z")
    );
    fixture.capsules.session_update(true, false).await.unwrap();
    fixture.clock.advance(Duration::from_secs(15));
    fixture.capsules.session_update(false, false).await.unwrap();
    assert_eq!(fixture.project().active_seconds, 15);

    fixture.clock.advance(Duration::from_secs(15));
    fixture.capsules.session_heartbeat().await.unwrap();
    assert_eq!(fixture.project().active_seconds, 15);

    fixture.capsules.session_update(true, true).await.unwrap();
    fixture.clock.advance(Duration::from_secs(15));
    fixture.capsules.session_heartbeat().await.unwrap();
    assert_eq!(fixture.project().active_seconds, 15);

    fixture.capsules.session_update(true, false).await.unwrap();
    fixture.clock.advance(Duration::from_secs(3_600));
    fixture.capsules.session_heartbeat().await.unwrap();
    assert_eq!(fixture.project().active_seconds, 45);
}

#[tokio::test]
async fn session_switch_flushes_the_previous_task_before_starting_the_next() {
    let fixture = session_fixture().await;
    let next_project = fixture
        .db
        .create_project(NewProject {
            name: "next project".into(),
            repo_path: "/tmp/next-project".into(),
            dev_url: None,
            default_branch: "main".into(),
        })
        .unwrap();
    let next_task = fixture
        .db
        .create_task(NewTask {
            project_id: next_project.id.clone(),
            title: "next task".into(),
        })
        .unwrap();
    fixture.capsules.activate_task(&fixture.task_id).await.unwrap();
    fixture.capsules.session_update(true, false).await.unwrap();
    fixture.clock.advance(Duration::from_secs(12));

    fixture.capsules.activate_task(&next_task.id).await.unwrap();

    assert_eq!(fixture.project().active_seconds, 12);
    let next = fixture.db.get_project(&next_project.id).unwrap().unwrap();
    assert_eq!(next.active_seconds, 0);
    assert_eq!(next.last_task_id.as_deref(), Some(next_task.id.as_str()));
    assert_eq!(fixture.capsules.active_task().as_deref(), Some(next_task.id.as_str()));
}

#[tokio::test]
async fn session_reactivation_within_the_same_project_resets_duration() {
    let fixture = session_fixture().await;
    let next_task = fixture
        .db
        .create_task(NewTask {
            project_id: fixture.project_id.clone(),
            title: "next task".into(),
        })
        .unwrap();
    fixture.capsules.activate_task(&fixture.task_id).await.unwrap();
    fixture.capsules.session_update(true, false).await.unwrap();
    fixture.clock.advance(Duration::from_secs(12));
    fixture.capsules.session_heartbeat().await.unwrap();
    assert_eq!(fixture.project().active_seconds, 12);

    fixture.capsules.activate_task(&next_task.id).await.unwrap();

    let project = fixture.project();
    assert_eq!(project.active_seconds, 0);
    assert_eq!(project.last_task_id.as_deref(), Some(next_task.id.as_str()));
}

#[tokio::test]
async fn session_archive_flushes_before_clearing_and_archiving() {
    let fixture = session_fixture().await;
    fixture.capsules.activate_task(&fixture.task_id).await.unwrap();
    fixture.capsules.session_update(true, false).await.unwrap();
    fixture.clock.advance(Duration::from_secs(9));

    let result = fixture.capsules.archive_project(&fixture.project_id).await.unwrap();

    assert_eq!(result.project.active_seconds, 9);
    assert!(result.project.archived_at.is_some());
    assert_eq!(fixture.capsules.active_task(), None);
}

#[tokio::test]
async fn session_flush_persists_whole_seconds_and_repeated_flush_is_idempotent() {
    let fixture = session_fixture().await;
    fixture.capsules.activate_task(&fixture.task_id).await.unwrap();
    fixture.capsules.session_update(true, false).await.unwrap();
    fixture.clock.advance(Duration::from_millis(1_900));

    fixture.capsules.session_heartbeat().await.unwrap();
    assert_eq!(fixture.project().active_seconds, 1);

    fixture.capsules.session_heartbeat().await.unwrap();
    assert_eq!(fixture.project().active_seconds, 1);
}

#[tokio::test]
async fn session_carries_fractional_eligible_time_across_successful_flushes() {
    let fixture = session_fixture().await;
    fixture.capsules.activate_task(&fixture.task_id).await.unwrap();
    fixture.capsules.session_update(true, false).await.unwrap();

    fixture.clock.advance(Duration::from_millis(900));
    fixture.capsules.session_heartbeat().await.unwrap();
    assert_eq!(fixture.project().active_seconds, 0);

    fixture.clock.advance(Duration::from_millis(900));
    fixture.capsules.session_heartbeat().await.unwrap();
    assert_eq!(fixture.project().active_seconds, 1);
}

#[tokio::test]
async fn session_discards_ineligible_fractional_time() {
    let fixture = session_fixture().await;
    fixture.capsules.activate_task(&fixture.task_id).await.unwrap();

    fixture.clock.advance(Duration::from_millis(900));
    fixture.capsules.session_heartbeat().await.unwrap();
    fixture.capsules.session_update(true, false).await.unwrap();
    fixture.clock.advance(Duration::from_millis(200));
    fixture.capsules.session_heartbeat().await.unwrap();
    assert_eq!(fixture.project().active_seconds, 0);

    fixture.clock.advance(Duration::from_millis(800));
    fixture.capsules.session_heartbeat().await.unwrap();
    assert_eq!(fixture.project().active_seconds, 1);
}

#[tokio::test]
async fn session_cap_discards_excess_but_keeps_new_fractional_time() {
    let fixture = session_fixture().await;
    fixture.capsules.activate_task(&fixture.task_id).await.unwrap();
    fixture.capsules.session_update(true, false).await.unwrap();

    fixture.clock.advance(Duration::from_secs(3_600));
    fixture.capsules.session_heartbeat().await.unwrap();
    assert_eq!(fixture.project().active_seconds, 30);

    fixture.clock.advance(Duration::from_millis(900));
    fixture.capsules.session_heartbeat().await.unwrap();
    assert_eq!(fixture.project().active_seconds, 30);

    fixture.clock.advance(Duration::from_millis(100));
    fixture.capsules.session_heartbeat().await.unwrap();
    assert_eq!(fixture.project().active_seconds, 31);
}

#[tokio::test]
async fn session_failed_accrual_retries_all_eligible_time_without_clock_advance() {
    let fixture = session_fixture().await;
    fixture.capsules.activate_task(&fixture.task_id).await.unwrap();
    fixture.capsules.session_update(true, false).await.unwrap();
    fixture.clock.advance(Duration::from_millis(1_900));
    fixture.persistence.fail_next_add();

    let error = fixture.capsules.session_heartbeat().await.unwrap_err();
    assert_eq!(error, "injected active-seconds failure");
    assert_eq!(fixture.project().active_seconds, 0);

    fixture.capsules.session_heartbeat().await.unwrap();
    assert_eq!(fixture.project().active_seconds, 1);
}

#[tokio::test]
async fn session_same_task_reactivation_resets_duration_and_fractional_carry() {
    let fixture = session_fixture().await;
    fixture.capsules.activate_task(&fixture.task_id).await.unwrap();
    fixture.capsules.session_update(true, false).await.unwrap();
    fixture.clock.advance(Duration::from_millis(2_900));
    fixture.capsules.session_heartbeat().await.unwrap();
    assert_eq!(fixture.project().active_seconds, 2);

    fixture.capsules.activate_task(&fixture.task_id).await.unwrap();
    assert_eq!(fixture.project().active_seconds, 0);

    fixture.clock.advance(Duration::from_millis(100));
    fixture.capsules.session_heartbeat().await.unwrap();
    assert_eq!(fixture.project().active_seconds, 0);
    fixture.clock.advance(Duration::from_millis(900));
    fixture.capsules.session_heartbeat().await.unwrap();
    assert_eq!(fixture.project().active_seconds, 1);
}

#[tokio::test]
async fn session_failed_begin_after_preload_preserves_active_and_continuation_state() {
    let fixture = session_fixture().await;
    fixture
        .db
        .replace_task_resources(
            &fixture.task_id,
            "vscode",
            "workspace",
            &state("/repo/pending", &["/repo/pending/old.ts"]),
        )
        .unwrap();
    let (seen, mut commands) = mpsc::unbounded_channel();
    let _connector = scripted_connector(&fixture.hub, seen, |name, _| match name {
        "workspace.state" => state("/repo/current", &[]),
        _ => json!({}),
    })
    .await;
    assert_eq!(fixture.hub.connectors().await.len(), 1);
    fixture.capsules.activate_task(&fixture.task_id).await.unwrap();
    while commands.try_recv().is_ok() {}

    let before = fixture.capsules.continuation_state_for_test();
    assert!(before.1.is_some(), "fixture must have a pending continuation");

    let target_project = fixture
        .db
        .create_project(NewProject {
            name: "failed target".into(),
            repo_path: "/tmp/failed-target".into(),
            dev_url: None,
            default_branch: "main".into(),
        })
        .unwrap();
    let target_task = fixture
        .db
        .create_task(NewTask {
            project_id: target_project.id.clone(),
            title: "failed target task".into(),
        })
        .unwrap();
    fixture
        .db
        .replace_task_resources(
            &target_task.id,
            "vscode",
            "workspace",
            &state("/repo/current", &["/repo/current/new.ts"]),
        )
        .unwrap();
    fixture.persistence.fail_next_begin();

    let error = fixture
        .capsules
        .activate_task(&target_task.id)
        .await
        .unwrap_err();

    assert_eq!(error, "injected session begin failure");
    assert_eq!(
        fixture.capsules.active_task().as_deref(),
        Some(fixture.task_id.as_str())
    );
    assert_eq!(fixture.capsules.continuation_state_for_test(), before);
    assert_eq!(
        fixture
            .db
            .get_project(&target_project.id)
            .unwrap()
            .unwrap()
            .last_task_id,
        None
    );
    while let Ok((name, args)) = commands.try_recv() {
        assert!(
            name != "editor.openFile"
                || args["path"].as_str() != Some("/repo/current/new.ts"),
            "failed activation restored preloaded target resources"
        );
        assert_ne!(name, "workspace.open", "failed activation switched workspace");
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn session_heartbeat_serializes_with_activation() {
    let fixture = session_fixture().await;
    let target_project = fixture
        .db
        .create_project(NewProject {
            name: "activation target".into(),
            repo_path: "/tmp/activation-target".into(),
            dev_url: None,
            default_branch: "main".into(),
        })
        .unwrap();
    let target_task = fixture
        .db
        .create_task(NewTask {
            project_id: target_project.id.clone(),
            title: "activation target task".into(),
        })
        .unwrap();
    fixture.capsules.activate_task(&fixture.task_id).await.unwrap();
    fixture.capsules.session_update(true, false).await.unwrap();
    fixture.clock.advance(Duration::from_secs(2));
    let (entered, release) = fixture.persistence.block_next_add();

    let heartbeat_capsules = fixture.capsules.clone();
    let heartbeat = tokio::spawn(async move { heartbeat_capsules.session_heartbeat().await });
    entered.await.unwrap();
    assert!(fixture.capsules.transition_lock_is_held_for_test());

    let activation_capsules = fixture.capsules.clone();
    let target_task_id = target_task.id.clone();
    let activation =
        tokio::spawn(async move { activation_capsules.activate_task(&target_task_id).await });
    assert_eq!(
        fixture.capsules.active_task().as_deref(),
        Some(fixture.task_id.as_str())
    );
    assert_eq!(
        fixture
            .db
            .get_project(&target_project.id)
            .unwrap()
            .unwrap()
            .last_task_id,
        None
    );

    release.release();
    heartbeat.await.unwrap().unwrap();
    activation.await.unwrap().unwrap();
    assert_eq!(fixture.project().active_seconds, 2);
    assert_eq!(
        fixture.capsules.active_task().as_deref(),
        Some(target_task.id.as_str())
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn session_update_serializes_with_archive() {
    let fixture = session_fixture().await;
    fixture.capsules.activate_task(&fixture.task_id).await.unwrap();
    fixture.capsules.session_update(true, false).await.unwrap();
    fixture.clock.advance(Duration::from_secs(2));
    let (entered, release) = fixture.persistence.block_next_add();

    let update_capsules = fixture.capsules.clone();
    let update = tokio::spawn(async move { update_capsules.session_update(false, false).await });
    entered.await.unwrap();
    assert!(fixture.capsules.transition_lock_is_held_for_test());

    let archive_capsules = fixture.capsules.clone();
    let project_id = fixture.project_id.clone();
    let archive = tokio::spawn(async move { archive_capsules.archive_project(&project_id).await });
    assert!(fixture.project().archived_at.is_none());
    assert_eq!(
        fixture.capsules.active_task().as_deref(),
        Some(fixture.task_id.as_str())
    );

    release.release();
    update.await.unwrap().unwrap();
    let archived = archive.await.unwrap().unwrap();
    assert_eq!(archived.project.active_seconds, 2);
    assert!(archived.project.archived_at.is_some());
    assert_eq!(fixture.capsules.active_task(), None);
}

#[tokio::test]
async fn activation_refuses_a_task_whose_project_is_archived() {
    let (_hub, db, capsules, task_id, _dir) = setup().await;
    let project_id = db.get_task(&task_id).unwrap().unwrap().project_id;
    db.archive_project(&project_id).unwrap();

    let error = capsules.activate_task(&task_id).await.unwrap_err();

    assert_eq!(
        error,
        "project is archived — restore it before resuming this capsule"
    );
    assert_eq!(capsules.active_task(), None);
}

#[tokio::test]
async fn archiving_the_active_project_clears_activation_and_preserves_data() {
    let (_hub, db, capsules, task_id, _dir) = setup().await;
    let project_id = db.get_task(&task_id).unwrap().unwrap().project_id;
    capsules.activate_task(&task_id).await.unwrap();
    assert_eq!(capsules.active_task().as_deref(), Some(task_id.as_str()));

    let result = capsules.archive_project(&project_id).await.unwrap();

    assert_eq!(result.project.id, project_id);
    assert!(result.project.archived_at.is_some());
    assert!(db.list_projects().unwrap().is_empty());
    assert_eq!(db.list_tasks(&project_id).unwrap().len(), 1);
    assert_eq!(capsules.active_task(), None);
}

#[tokio::test]
async fn archiving_an_inactive_project_keeps_the_current_capsule_active() {
    let (_hub, db, capsules, active_task_id, _dir) = setup().await;
    let inactive_project = db
        .create_project(NewProject {
            name: "inactive".into(),
            repo_path: "/tmp/inactive".into(),
            dev_url: None,
            default_branch: "main".into(),
        })
        .unwrap();
    capsules.activate_task(&active_task_id).await.unwrap();

    capsules.archive_project(&inactive_project.id).await.unwrap();

    assert_eq!(
        capsules.active_task().as_deref(),
        Some(active_task_id.as_str())
    );
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
