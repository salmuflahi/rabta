//! Task capsules: capture connected connectors' state into task resources
//! and restore it on activation. App-level orchestration — the hub routes,
//! the db stores, this module decides.
use std::sync::{Arc, Mutex};
use std::time::Duration;

use rabta_db::{Db, Project, TaskPin};
use rabta_hub::protocol::ConnectorKind;
use rabta_hub::{ConnectorInfo, Hub, HubEvent};
use serde::Serialize;
use serde_json::{json, Value};

/// Connector kinds capsules know how to capture and restore.
const CAPTURABLE: &[&str] = &["vscode", "fake", "chrome"];
const MAX_SESSION_GAP: Duration = Duration::from_secs(30);

/// The lowest connector product version with focus mode's close/dispose
/// handlers. Both stores can keep serving older builds for a while after a
/// desktop release, so the common day-one state is a new desktop talking to
/// an old connector with no handler for `tabs.close`, `editor.closeFile`, or
/// `terminal.dispose` at all — every one of those would otherwise throw "no
/// handler for ...", turning a clean restore into a wall of per-item errors.
const MIN_RECONCILE_VERSION: (u32, u32, u32) = (0, 2, 0);

/// Whether a connector's self-reported product `version` is new enough to
/// have focus mode's close/dispose handlers. Absent or unparseable versions
/// (older connectors that never sent one, or a malformed string) are treated
/// as too old — the safe default when the answer is unknown is to skip
/// reconcile for that connector, never to guess that it can handle a
/// destructive command.
fn version_supports_reconcile(version: Option<&str>) -> bool {
    let Some(version) = version else {
        return false;
    };
    // Compare only the release core (major.minor.patch); a pre-release or
    // build-metadata suffix (`-beta`, `+build`) never lowers what the
    // version itself already promises.
    let core = version
        .split(['-', '+'])
        .next()
        .unwrap_or(version);
    let mut parts = core.split('.');
    let component = |p: Option<&str>| p.and_then(|p| p.parse::<u32>().ok()).unwrap_or(0);
    let actual = (
        component(parts.next()),
        component(parts.next()),
        component(parts.next()),
    );
    actual >= MIN_RECONCILE_VERSION
}

/// Time source for session persistence. Monotonic time measures elapsed work;
/// UTC time is used only for durable project metadata.
pub trait SessionClock: Send + Sync {
    fn monotonic_now(&self) -> std::time::Instant;
    fn utc_now(&self) -> String;
}

/// Test-oriented seam around the two durable session writes.
#[doc(hidden)]
pub trait SessionPersistence: Send + Sync {
    fn begin_project_session_for_task(&self, task_id: &str, opened_at: &str) -> Result<(), String>;
    fn add_active_seconds_for_task(&self, task_id: &str, seconds: u64) -> Result<(), String>;
}

impl SessionPersistence for Db {
    fn begin_project_session_for_task(&self, task_id: &str, opened_at: &str) -> Result<(), String> {
        Db::begin_project_session_for_task(self, task_id, opened_at)
            .map_err(|error| error.to_string())
    }

    fn add_active_seconds_for_task(&self, task_id: &str, seconds: u64) -> Result<(), String> {
        Db::add_active_seconds_for_task(self, task_id, seconds).map_err(|error| error.to_string())
    }
}

struct SystemSessionClock;

impl SessionClock for SystemSessionClock {
    fn monotonic_now(&self) -> std::time::Instant {
        std::time::Instant::now()
    }

    fn utc_now(&self) -> String {
        chrono::Utc::now().to_rfc3339()
    }
}

struct SessionState {
    focused: bool,
    idle: bool,
    last_tick: std::time::Instant,
    pending_eligible: Duration,
}

/// Result of an explicit or automatic capsule save.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SaveSummary {
    pub captured: Vec<String>,
    pub skipped: Vec<String>,
}

/// Result of a task activation (restore).
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ActivateSummary {
    pub applied: Vec<String>,
    pub pending: Vec<String>,
    pub skipped: Vec<String>,
    pub saved_previous: Option<String>,
    pub errors: Vec<String>,
    /// Items focus mode closed. Empty whenever focus mode is off.
    pub closed: Vec<String>,
    /// Items focus mode left alone, and why. A refusal is not an error — a
    /// browser-pinned tab or a terminal running a build is a correct outcome,
    /// and the receipt says so rather than burying it.
    pub kept: Vec<(String, String)>,
}

/// Durable project archive result plus best-effort capsule-save warnings.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveProjectResult {
    pub project: Project,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone)]
struct PendingRestore {
    kind: String,
    generation: u64,
    open_files: Vec<String>,
    terminals: Vec<(String, Option<String>)>, // (cwd, name)
}

/// Capsule orchestrator. Cheap to clone; one per app.
#[derive(Clone)]
pub struct Capsules {
    hub: Arc<Hub>,
    db: Db,
    settle: Duration,
    active_task: Arc<Mutex<Option<String>>>,
    session: Arc<Mutex<SessionState>>,
    clock: Arc<dyn SessionClock>,
    session_persistence: Arc<dyn SessionPersistence>,
    pending: Arc<Mutex<Option<PendingRestore>>>,
    transition_lock: Arc<tokio::sync::Mutex<()>>,
    activation_archive_lock: Arc<tokio::sync::Mutex<()>>,
    continuation_lock: Arc<tokio::sync::Mutex<()>>,
    /// Serializes `remove_captured_item`'s read-modify-write of a task's
    /// resource row so two concurrent removals can't both read the same
    /// pre-image and have one write silently undo the other.
    task_resources_lock: Arc<tokio::sync::Mutex<()>>,
    transition_boundary_signal: Arc<Mutex<Option<tokio::sync::oneshot::Sender<()>>>>,
    activation_continuation_boundary_signal: Arc<Mutex<Option<tokio::sync::oneshot::Sender<()>>>>,
    generation: Arc<std::sync::atomic::AtomicU64>,
}

fn kind_str(kind: ConnectorKind) -> &'static str {
    match kind {
        ConnectorKind::Fake => "fake",
        ConnectorKind::Vscode => "vscode",
        ConnectorKind::Chrome => "chrome",
    }
}

impl Capsules {
    /// `settle` is the wait between a connector re-registering and the
    /// pending restore being applied (spec default 1500 ms; short in tests).
    pub fn new(hub: Arc<Hub>, db: Db, settle: Duration) -> Capsules {
        Self::new_with_clock(hub, db, settle, Arc::new(SystemSessionClock))
    }

    /// Clock-injected constructor for deterministic session tests.
    #[doc(hidden)]
    pub fn new_with_clock(
        hub: Arc<Hub>,
        db: Db,
        settle: Duration,
        clock: Arc<dyn SessionClock>,
    ) -> Capsules {
        let session_persistence = Arc::new(db.clone());
        Self::new_with_clock_and_persistence(hub, db, settle, clock, session_persistence)
    }

    /// Clock and persistence-injected constructor for deterministic tests.
    #[doc(hidden)]
    pub fn new_with_clock_and_persistence(
        hub: Arc<Hub>,
        db: Db,
        settle: Duration,
        clock: Arc<dyn SessionClock>,
        session_persistence: Arc<dyn SessionPersistence>,
    ) -> Capsules {
        let last_tick = clock.monotonic_now();
        Capsules {
            hub,
            db,
            settle,
            active_task: Arc::new(Mutex::new(None)),
            session: Arc::new(Mutex::new(SessionState {
                focused: false,
                idle: false,
                last_tick,
                pending_eligible: Duration::ZERO,
            })),
            clock,
            session_persistence,
            pending: Arc::new(Mutex::new(None)),
            transition_lock: Arc::new(tokio::sync::Mutex::new(())),
            activation_archive_lock: Arc::new(tokio::sync::Mutex::new(())),
            continuation_lock: Arc::new(tokio::sync::Mutex::new(())),
            task_resources_lock: Arc::new(tokio::sync::Mutex::new(())),
            transition_boundary_signal: Arc::new(Mutex::new(None)),
            activation_continuation_boundary_signal: Arc::new(Mutex::new(None)),
            generation: Arc::new(std::sync::atomic::AtomicU64::new(0)),
        }
    }

    /// The task currently considered active (in-memory, this phase).
    pub fn active_task(&self) -> Option<String> {
        self.active_task
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    /// Snapshot of continuation metadata for failure-neutrality tests.
    #[doc(hidden)]
    pub fn continuation_state_for_test(&self) -> (u64, Option<(String, u64)>) {
        let generation = self.generation.load(std::sync::atomic::Ordering::SeqCst);
        let pending = self
            .pending
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .as_ref()
            .map(|pending| (pending.kind.clone(), pending.generation));
        (generation, pending)
    }

    /// Whether a transition currently holds the shared serialization lock.
    #[doc(hidden)]
    pub fn transition_lock_is_held_for_test(&self) -> bool {
        self.transition_lock.try_lock().is_err()
    }

    /// Signals when the next state-changing command is about to wait for
    /// transition serialization.
    #[doc(hidden)]
    pub fn set_next_transition_boundary_signal_for_test(
        &self,
        signal: tokio::sync::oneshot::Sender<()>,
    ) {
        *self
            .transition_boundary_signal
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = Some(signal);
    }

    /// Signals after the next activation has polled the continuation gate.
    #[doc(hidden)]
    pub fn set_next_activation_continuation_boundary_signal_for_test(
        &self,
        signal: tokio::sync::oneshot::Sender<()>,
    ) {
        *self
            .activation_continuation_boundary_signal
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = Some(signal);
    }

    async fn lock_after_first_poll<'a>(
        lock: &'a tokio::sync::Mutex<()>,
        mut signal: Option<tokio::sync::oneshot::Sender<()>>,
    ) -> tokio::sync::MutexGuard<'a, ()> {
        use std::future::Future;

        if signal.is_none() {
            return lock.lock().await;
        }
        let mut lock = Box::pin(lock.lock());
        std::future::poll_fn(move |context| {
            let result = lock.as_mut().poll(context);
            if let Some(signal) = signal.take() {
                let _ = signal.send(());
            }
            result
        })
        .await
    }

    async fn lock_transition(&self) -> tokio::sync::MutexGuard<'_, ()> {
        let signal = self
            .transition_boundary_signal
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .take();
        Self::lock_after_first_poll(&self.transition_lock, signal).await
    }

    async fn lock_activation_continuation(&self) -> tokio::sync::MutexGuard<'_, ()> {
        let signal = self
            .activation_continuation_boundary_signal
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .take();
        Self::lock_after_first_poll(&self.continuation_lock, signal).await
    }

    /// Flushes elapsed time under session-transition serialization.
    pub(crate) async fn flush_session(&self) -> Result<(), String> {
        let _serialized = self.lock_transition().await;
        self.flush_session_locked().await
    }

    /// Flushes elapsed time while the caller holds `transition_lock`.
    async fn flush_session_locked(&self) -> Result<(), String> {
        let active_task = self.active_task();
        let seconds = {
            let now = self.clock.monotonic_now();
            let mut session = self
                .session
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            let elapsed = now.saturating_duration_since(session.last_tick);
            session.last_tick = now;
            if session.focused && !session.idle && active_task.is_some() {
                session.pending_eligible = session
                    .pending_eligible
                    .checked_add(elapsed.min(MAX_SESSION_GAP))
                    .unwrap_or(Duration::MAX);
            }
            session.pending_eligible.as_secs()
        };

        if seconds == 0 {
            return Ok(());
        }
        let Some(task_id) = active_task else {
            return Ok(());
        };
        let persistence = self.session_persistence.clone();
        tokio::task::spawn_blocking(move || {
            persistence.add_active_seconds_for_task(&task_id, seconds)
        })
        .await
        .map_err(|e| e.to_string())??;

        let mut session = self
            .session
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        session.pending_eligible = session
            .pending_eligible
            .saturating_sub(Duration::from_secs(seconds));
        Ok(())
    }

    /// Updates focus/idle state after flushing time under the previous state.
    pub async fn session_update(&self, focused: bool, idle: bool) -> Result<(), String> {
        let _serialized = self.lock_transition().await;
        let flush_result = self.flush_session_locked().await;
        {
            let mut session = self
                .session
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            session.focused = focused;
            session.idle = idle;
            session.last_tick = self.clock.monotonic_now();
        }
        flush_result
    }

    /// Persists one heartbeat's eligible whole seconds.
    pub async fn session_heartbeat(&self) -> Result<(), String> {
        self.flush_session().await
    }

    /// The repo path of the project owning `task_id`, if both still exist.
    async fn repo_for_task(&self, task_id: &str) -> Result<Option<String>, String> {
        let db = self.db.clone();
        let tid = task_id.to_string();
        tokio::task::spawn_blocking(move || -> Result<Option<String>, String> {
            let Some(task) = db.get_task(&tid).map_err(|e| e.to_string())? else {
                return Ok(None);
            };
            Ok(db
                .get_project(&task.project_id)
                .map_err(|e| e.to_string())?
                .map(|p| p.repo_path))
        })
        .await
        .map_err(|e| e.to_string())?
    }

    /// Captures `workspace.state` from every connected capturable connector
    /// into the task's capsule (latest-only per kind).
    pub async fn save_capsule(&self, task_id: &str) -> Result<SaveSummary, String> {
        let mut captured = vec![];
        let mut skipped = vec![];
        for c in self.hub.connectors().await {
            let kind = kind_str(c.kind);
            if !CAPTURABLE.contains(&kind) {
                continue;
            }
            match self
                .hub
                .send_command(&c.id, "workspace.state", json!({}))
                .await
            {
                Ok(state) => {
                    let db = self.db.clone();
                    let (tid, k) = (task_id.to_string(), kind.to_string());
                    tokio::task::spawn_blocking(move || {
                        db.replace_task_resources(&tid, &k, "workspace", &state)
                    })
                    .await
                    .map_err(|e| e.to_string())?
                    .map_err(|e| e.to_string())?;
                    captured.push(kind.to_string());
                }
                Err(e) => skipped.push(format!("{kind}: {e}")),
            }
        }

        // The "git" virtual kind: capture the project's current branch.
        match self.repo_for_task(task_id).await {
            Ok(Some(repo)) => match crate::git::status(std::path::Path::new(&repo)).await {
                Ok(st) => match st.branch {
                    Some(branch) => {
                        let db = self.db.clone();
                        let tid = task_id.to_string();
                        let payload = serde_json::json!({ "branch": branch });
                        tokio::task::spawn_blocking(move || {
                            db.replace_task_resources(&tid, "git", "branch", &payload)
                        })
                        .await
                        .map_err(|e| e.to_string())?
                        .map_err(|e| e.to_string())?;
                        captured.push("git".to_string());
                    }
                    None => skipped.push("git: detached HEAD".to_string()),
                },
                Err(e) => skipped.push(format!("git: {e}")),
            },
            Ok(None) => skipped.push("git: task or project not found".to_string()),
            Err(e) => skipped.push(format!("git: {e}")),
        }

        Ok(SaveSummary { captured, skipped })
    }

    /// Archives a project, saving and clearing its active capsule first.
    pub async fn archive_project(&self, project_id: &str) -> Result<ArchiveProjectResult, String> {
        let _operation = self.activation_archive_lock.lock().await;
        let (active_task, active_belongs_to_project) = {
            let _transition = self.lock_transition().await;
            let active_task = self.active_task();
            let active_belongs_to_project = if let Some(task_id) = active_task.as_deref() {
                let db = self.db.clone();
                let task_id = task_id.to_string();
                let project_id = project_id.to_string();
                tokio::task::spawn_blocking(move || {
                    db.get_task(&task_id)
                        .map(|task| task.is_some_and(|task| task.project_id == project_id))
                })
                .await
                .map_err(|e| e.to_string())?
                .map_err(|e| e.to_string())?
            } else {
                false
            };
            if active_belongs_to_project {
                self.flush_session_locked().await?;
            }
            (active_task, active_belongs_to_project)
        };

        let mut warnings = vec![];
        if active_belongs_to_project {
            if let Some(task_id) = active_task.as_deref() {
                match self.save_capsule(task_id).await {
                    Ok(summary) => warnings.extend(
                        summary
                            .skipped
                            .into_iter()
                            .map(|warning| format!("capsule save: {warning}")),
                    ),
                    Err(error) => {
                        warnings.push(format!("capsule save failed: {error}"));
                    }
                }
            }
        }

        let _transition = self.transition_lock.lock().await;
        if active_belongs_to_project {
            self.flush_session_locked().await?;
        }
        let db = self.db.clone();
        let project_id = project_id.to_string();
        let project = tokio::task::spawn_blocking(move || db.archive_project(&project_id))
            .await
            .map_err(|e| e.to_string())?
            .map_err(crate::projects::friendly_db_error)?;

        if active_belongs_to_project {
            *self
                .active_task
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner) = None;
            *self
                .pending
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner) = None;
            self.generation
                .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            let mut session = self
                .session
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            session.pending_eligible = Duration::ZERO;
            session.last_tick = self.clock.monotonic_now();
        }

        Ok(ArchiveProjectResult { project, warnings })
    }

    /// Auto-saves the outgoing active task (if any), then restores `task_id`'s
    /// capsule best-effort per connector, and marks it active. With
    /// `focus_mode`, also closes whatever is open but not in the capsule —
    /// `false` reproduces today's purely-additive restore exactly.
    pub async fn activate_task(
        &self,
        task_id: &str,
        focus_mode: bool,
    ) -> Result<ActivateSummary, String> {
        let _operation = self.activation_archive_lock.lock().await;
        let target = {
            let db = self.db.clone();
            let task_id = task_id.to_string();
            tokio::task::spawn_blocking(move || {
                let task = db
                    .get_task(&task_id)?
                    .ok_or_else(|| rabta_db::DbError::NotFound {
                        entity: "task",
                        id: task_id.clone(),
                    })?;
                let project = db.get_project(&task.project_id)?.ok_or_else(|| {
                    rabta_db::DbError::NotFound {
                        entity: "project",
                        id: task.project_id.clone(),
                    }
                })?;
                let resources = db.task_resources(&task_id)?;
                Ok::<_, rabta_db::DbError>((project, resources))
            })
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())?
        };
        if target.0.archived_at.is_some() {
            return Err(
                "project is archived — restore it before resuming this capsule".to_string(),
            );
        }

        let previous = {
            let _transition = self.lock_transition().await;
            self.flush_session_locked().await?;
            self.active_task()
        };

        // Queue behind any in-flight continuation command before connector
        // auto-save. This prevents the continuation from checking the old
        // generation again until this activation either durably commits or
        // fails without changing continuation state.
        let continuation = self.lock_activation_continuation().await;
        let mut errors = vec![];
        let mut saved_previous = None;
        if let Some(prev) = previous.filter(|p| p != task_id) {
            match self.save_capsule(&prev).await {
                Ok(summary) if !summary.captured.is_empty() => saved_previous = Some(prev),
                Ok(_) => {}
                Err(e) => errors.push(format!("auto-save of previous task failed: {e}")),
            }
        }

        let generation = {
            let _transition = self.transition_lock.lock().await;
            // Heartbeats and focus changes can continue while connector
            // auto-save is in flight. Flush that interval before switching.
            self.flush_session_locked().await?;
            let tid = task_id.to_string();
            let opened_at = self.clock.utc_now();
            let persistence = self.session_persistence.clone();
            tokio::task::spawn_blocking(move || {
                persistence.begin_project_session_for_task(&tid, &opened_at)
            })
            .await
            .map_err(|e| e.to_string())??;

            let generation = self
                .generation
                .fetch_add(1, std::sync::atomic::Ordering::SeqCst)
                + 1;
            // One pending restore slot, replaced only after the new session
            // is durable so a failed activation leaves continuation state
            // untouched.
            *self
                .pending
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner) = None;
            *self
                .active_task
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner) = Some(task_id.to_string());
            {
                let mut session = self
                    .session
                    .lock()
                    .unwrap_or_else(std::sync::PoisonError::into_inner);
                session.pending_eligible = Duration::ZERO;
                session.last_tick = self.clock.monotonic_now();
            }
            generation
        };
        drop(continuation);

        let resources = target.1;
        // Pins are authored, not captured, so they live outside the rows
        // above and are merged into each kind's payload just before restore
        // — a pin survives even a save that happened after it was closed.
        let pins = {
            let db = self.db.clone();
            let tid = task_id.to_string();
            tokio::task::spawn_blocking(move || db.task_pins(&tid))
                .await
                .map_err(|e| e.to_string())?
                .map_err(|e| e.to_string())?
        };
        let mut applied = vec![];
        let mut pending = vec![];
        let mut skipped = vec![];

        // Git first: a branch switch changes files on disk, so editor
        // restore must come after. Refusals are reported, never forced.
        if let Some(git_row) = resources
            .iter()
            .find(|r| r.connector_kind == "git" && r.resource_type == "branch")
        {
            match (
                git_row.payload["branch"].as_str(),
                self.repo_for_task(task_id).await,
            ) {
                (Some(target), Ok(Some(repo))) => {
                    let repo = std::path::Path::new(&repo);
                    match crate::git::status(repo).await {
                        Ok(st) if st.branch.as_deref() == Some(target) => {
                            applied.push("git".to_string());
                        }
                        Ok(_) => match crate::git::checkout(repo, target).await {
                            Ok(()) => applied.push("git".to_string()),
                            Err(e) => {
                                errors.push(format!("git: {e}"));
                                skipped.push("git".to_string());
                            }
                        },
                        Err(e) => {
                            errors.push(format!("git: {e}"));
                            skipped.push("git".to_string());
                        }
                    }
                }
                (None, _) => skipped.push("git".to_string()),
                (_, Ok(None)) => {
                    errors.push("git: task or project not found".to_string());
                    skipped.push("git".to_string());
                }
                (_, Err(e)) => {
                    errors.push(format!("git: {e}"));
                    skipped.push("git".to_string());
                }
            }
        }

        let connectors = self.hub.connectors().await;
        // The exact connector each kind's restore actually used, so reconcile
        // can target that SAME connector rather than re-deriving its own pick
        // — see `reconcile`'s doc comment for why re-deriving is unsafe.
        let mut restored_connectors: std::collections::HashMap<String, ConnectorInfo> =
            std::collections::HashMap::new();
        // Every url this activation's restore issued `tabs.open` for, so
        // reconcile can exclude them from close targets outright — see
        // `reconcile`'s doc comment for why a fresh live-vs-wanted diff alone
        // is not enough.
        let mut chrome_opened_urls: Vec<String> = vec![];
        for r in resources.iter().filter(|r| r.resource_type == "workspace") {
            let Some(conn) = connectors
                .iter()
                .find(|c| kind_str(c.kind) == r.connector_kind)
            else {
                skipped.push(r.connector_kind.clone());
                continue;
            };
            match r.connector_kind.as_str() {
                "vscode" => {
                    restored_connectors.insert("vscode".to_string(), conn.clone());
                    let payload = merge_pins(&r.connector_kind, &r.payload, &pins);
                    match self
                        .restore_vscode(conn, &payload, generation, &mut errors)
                        .await
                    {
                        RestoreOutcome::Applied => applied.push("vscode".into()),
                        RestoreOutcome::Pending => pending.push("vscode".into()),
                    }
                }
                "fake" => {
                    let folder = r.payload["workspaceFolder"]
                        .as_str()
                        .or_else(|| r.payload["root"].as_str());
                    if let Some(folder) = folder {
                        if let Err(e) = self
                            .hub
                            .send_command(&conn.id, "workspace.open", json!({ "path": folder }))
                            .await
                        {
                            errors.push(format!("fake workspace.open: {e}"));
                        } else {
                            applied.push("fake".into());
                        }
                    } else {
                        skipped.push(r.connector_kind.clone());
                    }
                }
                "chrome" => {
                    restored_connectors.insert("chrome".to_string(), conn.clone());
                    let payload = merge_pins(&r.connector_kind, &r.payload, &pins);
                    if self
                        .restore_chrome(conn, &payload, &mut chrome_opened_urls, &mut errors)
                        .await
                    {
                        applied.push("chrome".to_string());
                    } else {
                        skipped.push("chrome".to_string());
                    }
                }
                _ => skipped.push(r.connector_kind.clone()),
            }
        }

        let mut closed = vec![];
        let mut kept = vec![];
        if focus_mode {
            // Reconcile diffs LIVE state against the task's WANTED state, so
            // it must only run once the open phase has actually finished:
            // skip it on any error, exactly as before, and skip it the same
            // way when a restore (e.g. a cross-folder vscode open) is still
            // pending a reconnect continuation — the window still shows the
            // OLD context then, and diffing that against the new task's
            // capsule would be diffing the wrong live state entirely.
            if errors.is_empty() && pending.is_empty() {
                self.reconcile(
                    task_id,
                    &restored_connectors,
                    &chrome_opened_urls,
                    &mut closed,
                    &mut kept,
                    &mut errors,
                )
                .await;
            } else {
                kept.push((
                    "focus".to_string(),
                    "skipped — the restore did not finish cleanly".to_string(),
                ));
            }
        }

        Ok(ActivateSummary {
            applied,
            pending,
            skipped,
            saved_previous,
            errors,
            closed,
            kept,
        })
    }

    /// Closes what the incoming capsule does not contain, one item at a time.
    ///
    /// Runs only after a clean open phase: the destructive half must never
    /// run on a restore that is already going wrong. Diffing *after* the
    /// opens means everything the restore just placed is, in the common
    /// case, already in the capsule it was read from — but that is not a
    /// guarantee for chrome: a tab can settle on a different url than the
    /// one it was opened with (a redirect, or client-side navigation), and a
    /// freshly re-read capsule can legitimately differ from the one restore
    /// used if something else touched it mid-activation. So chrome closes
    /// are additionally guarded by `chrome_opened_urls` below — the literal
    /// urls this activation issued `tabs.open` for are never close targets,
    /// independent of what a fresh diff would say.
    ///
    /// That guard covers the second case, not the first. A tab that redirects
    /// is still reachable: the capsule wants `/dashboard`, the session has
    /// expired, the tab settles on `/login`, and `/login` matches neither
    /// `wanted` nor the opened url — so focus mode closes a tab this
    /// activation opened seconds earlier. Closing it correctly is not
    /// possible while identity is the url, because the url is the only thing
    /// tying the two observations together and it is exactly what changed.
    /// The fix is a tab id the connector remembers for the activation; until
    /// then this is a known hole, not a covered case.
    ///
    /// Targets exactly the connector `restored_connectors` recorded for each
    /// kind — the same one restore itself used — never any live connector of
    /// that kind found some other way. Two windows of the same editor are two
    /// connectors of the same kind; fanning out to "every connector of this
    /// kind" would diff a completely unrelated window's live state against
    /// this capsule and close whatever it has open that isn't in it. If a
    /// kind has no entry (restore could not identify a connector for it),
    /// that kind is skipped and recorded in `kept` — never guessed at from
    /// the live connector list.
    ///
    /// The desktop decides only what is not in the capsule. Whether an item
    /// is safe to close is the connector's call — it holds the facts
    /// (pinned, incognito, dirty, busy, last in window) and answers in the
    /// same call that closes, leaving no gap. A refusal comes back as `kept`.
    ///
    /// Before sending anything destructive, each connector's self-reported
    /// `version` is checked against `MIN_RECONCILE_VERSION` — an old
    /// connector with no close/dispose handlers gets one clear `kept` entry
    /// instead of a "no handler for ..." error per stray item.
    async fn reconcile(
        &self,
        task_id: &str,
        restored_connectors: &std::collections::HashMap<String, ConnectorInfo>,
        chrome_opened_urls: &[String],
        closed: &mut Vec<String>,
        kept: &mut Vec<(String, String)>,
        errors: &mut Vec<String>,
    ) {
        let resources = {
            let db = self.db.clone();
            let tid = task_id.to_string();
            match tokio::task::spawn_blocking(move || db.task_resources(&tid)).await {
                Ok(Ok(r)) => r,
                // Either the blocking task panicked or the query failed. Both
                // mean reconcile has nothing to diff against, and closing on
                // a guess is exactly what this must never do — so record and
                // stop.
                Ok(Err(e)) => {
                    errors.push(format!("reconcile: {e}"));
                    return;
                }
                Err(e) => {
                    errors.push(format!("reconcile: {e}"));
                    return;
                }
            }
        };
        let pins = {
            let db = self.db.clone();
            let tid = task_id.to_string();
            tokio::task::spawn_blocking(move || db.task_pins(&tid))
                .await
                .ok()
                .and_then(Result::ok)
                .unwrap_or_default()
        };

        for kind in ["chrome", "vscode"] {
            let Some(resource) = resources.iter().find(|r| r.connector_kind == kind) else {
                continue;
            };
            let Some(conn) = restored_connectors.get(kind) else {
                kept.push((kind.to_string(), "no connector to reconcile against".to_string()));
                continue;
            };
            if !version_supports_reconcile(conn.version.as_deref()) {
                kept.push((
                    kind.to_string(),
                    "connector needs updating to support focus mode".to_string(),
                ));
                continue;
            }
            let wanted = merge_pins(kind, &resource.payload, &pins);
            let live = match self
                .hub
                .send_command(&conn.id, "workspace.state", json!({}))
                .await
            {
                Ok(v) => v,
                Err(e) => {
                    errors.push(format!("reconcile: could not check {kind}'s current state: {e}"));
                    continue;
                }
            };

            for (command, args, label) in close_targets(kind, &wanted, &live) {
                // Never close a url this activation itself just opened,
                // regardless of what a freshly re-read capsule now says —
                // see the doc comment above.
                if kind == "chrome" && chrome_opened_urls.iter().any(|u| u == &label) {
                    continue;
                }
                match self.hub.send_command(&conn.id, &command, args).await {
                    Ok(v) => {
                        if let Some(reason) = v.get("reason").and_then(Value::as_str) {
                            kept.push((label, reason.to_string()));
                        } else {
                            closed.push(label);
                        }
                    }
                    Err(e) => errors.push(format!("{command} {label}: {e}")),
                }
            }
        }
    }

    async fn restore_vscode(
        &self,
        conn: &ConnectorInfo,
        payload: &Value,
        generation: u64,
        errors: &mut Vec<String>,
    ) -> RestoreOutcome {
        let target_folder = payload["workspaceFolder"].as_str();
        let mut open_files: Vec<String> = payload["openFiles"]
            .as_array()
            .map(|a| {
                a.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default();
        // Open the active file last so editor focus lands on it.
        if let Some(active) = payload["activeFile"].as_str() {
            if let Some(pos) = open_files.iter().position(|f| f == active) {
                let f = open_files.remove(pos);
                open_files.push(f);
            }
        }
        let terminals: Vec<(String, Option<String>)> = payload["terminals"]
            .as_array()
            .map(|a| {
                a.iter()
                    .filter_map(|t| {
                        t["cwd"]
                            .as_str()
                            .map(|cwd| (cwd.to_string(), t["name"].as_str().map(String::from)))
                    })
                    .collect()
            })
            .unwrap_or_default();

        let current = self
            .hub
            .send_command(&conn.id, "workspace.state", json!({}))
            .await;
        let current_folder = current
            .as_ref()
            .ok()
            .and_then(|s| s["workspaceFolder"].as_str().map(String::from));

        match target_folder {
            Some(target) if current_folder.as_deref() != Some(target) => {
                *self
                    .pending
                    .lock()
                    .unwrap_or_else(std::sync::PoisonError::into_inner) = Some(PendingRestore {
                    kind: "vscode".into(),
                    generation,
                    open_files,
                    terminals,
                });
                if let Err(e) = self
                    .hub
                    .send_command(&conn.id, "workspace.open", json!({ "path": target }))
                    .await
                {
                    errors.push(format!("workspace.open: {e}"));
                }
                RestoreOutcome::Pending
            }
            _ => {
                self.apply_editor_state(&conn.id, &open_files, &terminals, errors)
                    .await;
                RestoreOutcome::Applied
            }
        }
    }

    async fn apply_editor_state(
        &self,
        connector_id: &str,
        open_files: &[String],
        terminals: &[(String, Option<String>)],
        errors: &mut Vec<String>,
    ) {
        for path in open_files {
            if let Err(e) = self
                .hub
                .send_command(connector_id, "editor.openFile", json!({ "path": path }))
                .await
            {
                errors.push(format!("openFile {path}: {e}"));
            }
        }
        for (cwd, name) in terminals {
            let mut args = json!({ "cwd": cwd });
            if let Some(n) = name {
                args["name"] = json!(n);
            }
            if let Err(e) = self
                .hub
                .send_command(connector_id, "terminal.create", args)
                .await
            {
                errors.push(format!("terminal.create {cwd}: {e}"));
            }
        }
    }

    /// Same as `apply_editor_state`, but for the reconnect continuation.
    /// The continuation gate keeps each generation check/send pair ordered
    /// with activation commit without holding session-transition
    /// serialization across connector I/O.
    async fn apply_editor_state_checked(
        &self,
        connector_id: &str,
        open_files: &[String],
        terminals: &[(String, Option<String>)],
        expected_generation: u64,
        errors: &mut Vec<String>,
    ) {
        use std::sync::atomic::Ordering::SeqCst;
        for path in open_files {
            let _continuation = self.continuation_lock.lock().await;
            if self.generation.load(SeqCst) != expected_generation {
                log::debug!(
                    "capsule continuation: superseded mid-apply before openFile {path}; stopped"
                );
                return;
            }
            if let Err(e) = self
                .hub
                .send_command(connector_id, "editor.openFile", json!({ "path": path }))
                .await
            {
                errors.push(format!("openFile {path}: {e}"));
            }
        }
        for (cwd, name) in terminals {
            let _continuation = self.continuation_lock.lock().await;
            if self.generation.load(SeqCst) != expected_generation {
                log::debug!(
                    "capsule continuation: superseded mid-apply before terminal.create {cwd}; stopped"
                );
                return;
            }
            let mut args = json!({ "cwd": cwd });
            if let Some(n) = name {
                args["name"] = json!(n);
            }
            if let Err(e) = self
                .hub
                .send_command(connector_id, "terminal.create", args)
                .await
            {
                errors.push(format!("terminal.create {cwd}: {e}"));
            }
        }
    }

    /// Restores browser tabs additively: opens each captured url. Non-
    /// destructive (never closes the user's current tabs), so — unlike
    /// vscode's workspace.open — there is no window reload and no pending
    /// continuation. Individual failures are collected, never fatal.
    ///
    /// Returns whether the caller should count this as applied: true if
    /// there were no urls to restore (nothing to fail), or at least one
    /// `tabs.open` succeeded. False only when there were urls and every
    /// single one of them failed — the caller reports `skipped` in that
    /// case instead of claiming a restore that didn't actually happen.
    async fn restore_chrome(
        &self,
        conn: &ConnectorInfo,
        payload: &Value,
        opened_urls: &mut Vec<String>,
        errors: &mut Vec<String>,
    ) -> bool {
        let urls: Vec<String> = payload["tabs"]
            .as_array()
            .map(|a| {
                a.iter()
                    .filter_map(|t| t["url"].as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default();
        if urls.is_empty() {
            return true;
        }
        let mut any_succeeded = false;
        for url in urls {
            match self
                .hub
                .send_command(&conn.id, "tabs.open", json!({ "url": url }))
                .await
            {
                Ok(_) => {
                    any_succeeded = true;
                    opened_urls.push(url);
                }
                Err(e) => errors.push(format!("tabs.open {url}: {e}")),
            }
        }
        any_succeeded
    }

    /// Drops one item from a task's captured payload. Deliberately does not
    /// touch pins: deleting the record of a thing and saying "never open this"
    /// are different requests, and only the first one exists in phase 1.
    ///
    /// This is a read-modify-write across two independent db lock
    /// acquisitions (`task_resources` then `replace_task_resources`), so it
    /// serializes under `task_resources_lock`: without that, two concurrent
    /// removals for the same task and kind could both read the same
    /// pre-image and the second write would silently undo the first
    /// removal. The lock is held across the `spawn_blocking` await below,
    /// which is safe here — `spawn_blocking` runs on a separate thread pool
    /// and this function never calls back into anything that takes another
    /// `Capsules` lock, so there is no cycle for it to deadlock with.
    pub async fn remove_captured_item(
        &self,
        task_id: &str,
        kind: &str,
        identity: &str,
    ) -> Result<(), String> {
        let _serialized = self.task_resources_lock.lock().await;
        let db = self.db.clone();
        let (tid, k, id) = (task_id.to_string(), kind.to_string(), identity.to_string());
        tokio::task::spawn_blocking(move || -> Result<(), String> {
            let resources = db.task_resources(&tid).map_err(|e| e.to_string())?;
            let Some(r) = resources.iter().find(|r| r.connector_kind == k) else {
                return Ok(());
            };
            let mut payload = r.payload.clone();
            let mut removed = false;
            for field in ["tabs", "openFiles", "terminals"] {
                if let Some(arr) = payload.get_mut(field).and_then(Value::as_array_mut) {
                    let before = arr.len();
                    arr.retain(|item| identity_of(&k, item).as_deref() != Some(id.as_str()));
                    removed |= arr.len() != before;
                }
            }
            if !removed {
                // Stale id or already removed: nothing changed, so nothing
                // to write back. Also avoids re-deriving `resource_type`
                // from a row we didn't actually touch.
                return Ok(());
            }
            db.replace_task_resources(&tid, &k, &r.resource_type, &payload)
                .map_err(|e| e.to_string())?;
            Ok(())
        })
        .await
        .map_err(|e| e.to_string())?
    }

    /// Starts the reconnect continuation on Tauri's runtime (app path).
    pub fn spawn_continuation(&self) {
        let me = self.clone();
        tauri::async_runtime::spawn(async move { me.continuation_loop().await });
    }

    /// Starts the reconnect continuation on an explicit runtime (test path).
    pub fn spawn_continuation_on(&self, handle: tokio::runtime::Handle) {
        let me = self.clone();
        handle.spawn(async move { me.continuation_loop().await });
    }

    /// Completes a pending cross-folder restore when a connector of the
    /// pending kind re-registers after its window reload.
    async fn continuation_loop(&self) {
        use tokio::sync::broadcast::error::RecvError;
        let mut events = self.hub.subscribe();
        loop {
            match events.recv().await {
                Ok(HubEvent::ConnectorConnected { connector }) => {
                    let taken = self.take_pending_for(kind_str(connector.kind));
                    if let Some(p) = taken {
                        self.run_pending_restore(&connector.id, p).await;
                    }
                }
                Ok(_) => {}
                Err(RecvError::Lagged(_)) => {
                    // A `ConnectorConnected` may have been dropped while we
                    // were lagging behind the broadcast channel, stranding a
                    // pending restore whose connector already reconnected.
                    // Re-query the current connectors and, if one of the
                    // pending kind is present now, run the continuation for
                    // it directly. `take_pending_for`'s `.take()` under the
                    // lock guarantees single consumption, so this can never
                    // double-apply alongside the normal event path.
                    let kind = self
                        .pending
                        .lock()
                        .unwrap_or_else(std::sync::PoisonError::into_inner)
                        .as_ref()
                        .map(|p| p.kind.clone());
                    if let Some(kind) = kind {
                        if let Some(conn) = self
                            .hub
                            .connectors()
                            .await
                            .into_iter()
                            .find(|c| kind_str(c.kind) == kind)
                        {
                            if let Some(p) = self.take_pending_for(&kind) {
                                log::debug!(
                                    "capsule continuation: recovered pending restore after lag"
                                );
                                self.run_pending_restore(&conn.id, p).await;
                            }
                        }
                    }
                    continue;
                }
                Err(RecvError::Closed) => break,
            }
        }
    }

    /// Takes the pending restore slot iff it matches `kind`, under the lock.
    fn take_pending_for(&self, kind: &str) -> Option<PendingRestore> {
        let mut slot = self
            .pending
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if slot.as_ref().map(|p| p.kind == kind).unwrap_or(false) {
            slot.take()
        } else {
            None
        }
    }

    /// Waits out the settle window, then applies a taken pending restore to
    /// `connector_id` if no newer activation has superseded it in the
    /// meantime. Shared by the normal reconnect path and the post-lag
    /// recovery path.
    async fn run_pending_restore(&self, connector_id: &str, p: PendingRestore) {
        tokio::time::sleep(self.settle).await;
        if self.generation.load(std::sync::atomic::Ordering::SeqCst) != p.generation {
            log::warn!("capsule continuation: superseded by newer activation; skipped");
            return;
        }
        let mut errors = vec![];
        self.apply_editor_state_checked(
            connector_id,
            &p.open_files,
            &p.terminals,
            p.generation,
            &mut errors,
        )
        .await;
        for e in errors {
            log::warn!("capsule continuation: {e}");
        }
    }
}

enum RestoreOutcome {
    Applied,
    Pending,
}

/// What makes an item the same item across two captures. A tab is its URL, a
/// file is its path, and a terminal is its name and directory together —
/// two shells both called "zsh" in different folders are different terminals.
/// NUL is the separator because it cannot occur in either field.
pub fn identity_of(kind: &str, item: &Value) -> Option<String> {
    match kind {
        "chrome" => item.get("url")?.as_str().map(str::to_string),
        "vscode" => {
            if let Some(path) = item.as_str() {
                return Some(path.to_string());
            }
            let name = item.get("name")?.as_str()?;
            let cwd = item.get("cwd").and_then(Value::as_str).unwrap_or("");
            Some(format!("{name}\0{cwd}"))
        }
        _ => None,
    }
}

/// The captured payload plus any pinned item that is not already in it.
/// Captured order is preserved and pins are appended, so restore opens what
/// was open first and the always-there items after.
pub fn merge_pins(kind: &str, captured: &Value, pins: &[TaskPin]) -> Value {
    let field = match kind {
        "chrome" => "tabs",
        "vscode" => "openFiles",
        _ => return captured.clone(),
    };
    // `captured` is a connector's `workspace.state` reply — arbitrary,
    // untrusted shape. Before this function existed, the payload was only
    // ever *read*-indexed (`payload["field"]`), which returns `&Value::Null`
    // harmlessly for anything unexpected. The *write*-indexing below
    // (`out[field] = ...`) uses serde_json's `IndexMut`, which panics for a
    // string key on any non-object Value (array, string, number, bool) — it
    // only auto-vivifies `Null`. A misbehaving connector replying with, say,
    // `[]` would otherwise be stored verbatim and then panic the next time
    // this task activates. Bail out before that ever runs.
    if !captured.is_object() {
        return captured.clone();
    }
    let mut out = captured.clone();
    let mut items = captured
        .get(field)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut seen: std::collections::HashSet<String> = items
        .iter()
        .filter_map(|i| identity_of(kind, i))
        .collect();

    for p in pins.iter().filter(|p| p.connector_kind == kind) {
        // A vscode terminal pin belongs to `terminals`, not `openFiles`.
        let is_terminal = kind == "vscode" && p.payload.get("name").is_some();
        if is_terminal {
            continue;
        }
        if seen.insert(p.identity.clone()) {
            items.push(p.payload.clone());
        }
    }
    out[field] = Value::Array(items);

    if kind == "vscode" {
        let mut terms = captured
            .get("terminals")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let mut tseen: std::collections::HashSet<String> = terms
            .iter()
            .filter_map(|i| identity_of(kind, i))
            .collect();
        for p in pins
            .iter()
            .filter(|p| p.connector_kind == kind && p.payload.get("name").is_some())
        {
            if tseen.insert(p.identity.clone()) {
                terms.push(p.payload.clone());
            }
        }
        out["terminals"] = Value::Array(terms);
    }
    out
}

/// Everything live that the capsule does not want, as ready-to-send commands.
/// Pure, so the diff can be tested without a hub.
///
/// A field the capsule captured *nothing* for (missing, or an empty array —
/// `merge_pins` leaves it that way when there is nothing captured and no pin
/// fills the gap) reads as "nothing to put away", never as "close
/// everything live in this field". This mirrors `restore_chrome`'s own
/// no-op when it has no urls to open: an empty capture means focus mode
/// never touched this field, not that it wants a live browser or editor
/// emptied out. Reachable with no corruption — e.g. a task saved while only
/// `chrome://` pages were open captures `{tabs: []}`, since `snapshotTabs`
/// filters them all.
pub fn close_targets(kind: &str, wanted: &Value, live: &Value) -> Vec<(String, Value, String)> {
    let ids = |v: &Value, field: &str| -> std::collections::HashSet<String> {
        v.get(field)
            .and_then(Value::as_array)
            .map(|a| a.iter().filter_map(|i| identity_of(kind, i)).collect())
            .unwrap_or_default()
    };
    let captured_nothing = |field: &str| -> bool {
        wanted
            .get(field)
            .and_then(Value::as_array)
            .map(Vec::is_empty)
            .unwrap_or(true)
    };
    let mut out = vec![];
    match kind {
        "chrome" => {
            if captured_nothing("tabs") {
                return out;
            }
            let keep = ids(wanted, "tabs");
            for t in live.get("tabs").and_then(Value::as_array).into_iter().flatten() {
                let Some(id) = identity_of(kind, t) else { continue };
                if !keep.contains(&id) {
                    out.push(("tabs.close".into(), json!({ "url": id }), id));
                }
            }
        }
        "vscode" => {
            // A file with unsaved changes is never a close candidate. The
            // connector refuses it too; not asking is simply quieter.
            let dirty: std::collections::HashSet<String> = live
                .get("dirtyFiles")
                .and_then(Value::as_array)
                .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                .unwrap_or_default();
            if !captured_nothing("openFiles") {
                let keep_files = ids(wanted, "openFiles");
                for f in live.get("openFiles").and_then(Value::as_array).into_iter().flatten() {
                    let Some(id) = identity_of(kind, f) else { continue };
                    if !keep_files.contains(&id) && !dirty.contains(&id) {
                        out.push(("editor.closeFile".into(), json!({ "path": id }), id));
                    }
                }
            }
            if !captured_nothing("terminals") {
                let keep_terms = ids(wanted, "terminals");
                for t in live.get("terminals").and_then(Value::as_array).into_iter().flatten() {
                    let Some(id) = identity_of(kind, t) else { continue };
                    if keep_terms.contains(&id) || t.get("busy").and_then(Value::as_bool) == Some(true) {
                        continue;
                    }
                    let name = t.get("name").and_then(Value::as_str).unwrap_or_default();
                    out.push((
                        "terminal.dispose".into(),
                        json!({ "name": name, "cwd": t.get("cwd").cloned().unwrap_or(Value::Null) }),
                        name.to_string(),
                    ));
                }
            }
        }
        _ => {}
    }
    out
}
