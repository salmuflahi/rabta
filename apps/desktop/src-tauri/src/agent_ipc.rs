//! Agent access: a local Unix socket through which an MCP server on this Mac
//! can capture and restore capsules and get back the same receipts the app
//! shows. Off by default; the switch is in Settings.
//!
//! Nothing here is a network socket. The listener is a file in the data
//! folder, created with owner-only permissions, and every connection has to
//! present the secret from the file beside it before it can do anything. The
//! app's "no network calls" guarantee stays literally true.
//!
//! Wire format: newline-delimited JSON, one request per line, one reply per
//! line, in order. A request is `{"id": <any>, "method": "...", "params": {}}`;
//! a reply is `{"id": <same>, "ok": true, "result": ...}` or
//! `{"id": <same>, "ok": false, "error": "..."}`. The first request on a
//! connection must be `auth` with the secret; a wrong secret closes the
//! connection after the reply.

use std::future::Future;
use std::io::Write as _;
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{UnixListener, UnixStream};

use crate::capsules::Capsules;

pub const SOCKET_FILE: &str = "agent.sock";
pub const SECRET_FILE: &str = "agent.secret";
/// The `db_meta` key that remembers the switch across launches.
pub const META_KEY: &str = "agent_access";

type BoxFuture<T> = Pin<Box<dyn Future<Output = T> + Send>>;

/// What an agent may ask the app to do. `Capsules` implements it for real;
/// tests hand in a fake so the socket can be exercised without a hub.
pub trait AgentOps: Send + Sync + 'static {
    fn capture(&self, task_id: String) -> BoxFuture<Result<Value, String>>;
    fn restore(&self, task_id: String, focus: bool) -> BoxFuture<Result<Value, String>>;
    fn active_task(&self) -> Option<String>;
}

impl AgentOps for Capsules {
    fn capture(&self, task_id: String) -> BoxFuture<Result<Value, String>> {
        let caps = self.clone();
        Box::pin(async move {
            let summary = caps.save_capsule(&task_id).await?;
            serde_json::to_value(summary).map_err(|e| e.to_string())
        })
    }

    fn restore(&self, task_id: String, focus: bool) -> BoxFuture<Result<Value, String>> {
        let caps = self.clone();
        Box::pin(async move {
            let summary = caps.activate_task(&task_id, focus).await?;
            serde_json::to_value(summary).map_err(|e| e.to_string())
        })
    }

    fn active_task(&self) -> Option<String> {
        Capsules::active_task(self)
    }
}

/// What Settings shows: whether the socket is listening, and where.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentAccessStatus {
    pub enabled: bool,
    pub socket_path: String,
}

#[derive(Clone)]
pub struct AgentIpc {
    data_dir: PathBuf,
    ops: Arc<dyn AgentOps>,
    running: Arc<Mutex<Option<tauri::async_runtime::JoinHandle<()>>>>,
}

impl AgentIpc {
    pub fn new(data_dir: PathBuf, ops: Arc<dyn AgentOps>) -> Self {
        AgentIpc {
            data_dir,
            ops,
            running: Arc::new(Mutex::new(None)),
        }
    }

    pub fn socket_path(&self) -> PathBuf {
        self.data_dir.join(SOCKET_FILE)
    }

    pub fn secret_path(&self) -> PathBuf {
        self.data_dir.join(SECRET_FILE)
    }

    pub fn is_running(&self) -> bool {
        self.running
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .is_some()
    }

    pub fn status(&self) -> AgentAccessStatus {
        AgentAccessStatus {
            enabled: self.is_running(),
            socket_path: self.socket_path().display().to_string(),
        }
    }

    /// Writes a fresh secret, binds the socket and serves until `stop`.
    /// Calling it while running is a no-op.
    pub fn start(&self) -> Result<(), String> {
        let mut running = self
            .running
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if running.is_some() {
            return Ok(());
        }
        let secret = write_secret(&self.secret_path())?;
        let sock = self.socket_path();
        // A stale file from a crash would make bind fail; the path is ours.
        let _ = std::fs::remove_file(&sock);
        let listener = std::os::unix::net::UnixListener::bind(&sock)
            .map_err(|e| format!("could not listen on {}: {e}", sock.display()))?;
        listener
            .set_nonblocking(true)
            .map_err(|e| format!("could not configure {}: {e}", sock.display()))?;
        std::fs::set_permissions(&sock, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| format!("could not protect {}: {e}", sock.display()))?;

        let ops = self.ops.clone();
        let handle = tauri::async_runtime::spawn(async move {
            let listener = match UnixListener::from_std(listener) {
                Ok(l) => l,
                Err(e) => {
                    log::warn!("agent access: listener failed: {e}");
                    return;
                }
            };
            loop {
                match listener.accept().await {
                    Ok((stream, _)) => {
                        let ops = ops.clone();
                        let secret = secret.clone();
                        tauri::async_runtime::spawn(async move {
                            serve(stream, ops, secret).await;
                        });
                    }
                    Err(e) => {
                        log::warn!("agent access: accept failed: {e}");
                        break;
                    }
                }
            }
        });
        *running = Some(handle);
        Ok(())
    }

    /// Stops listening and removes the socket and the secret. Connections in
    /// flight are dropped: an agent mid-call gets a closed socket, never a
    /// half-finished restore reported as done.
    pub fn stop(&self) {
        let handle = self
            .running
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .take();
        if let Some(handle) = handle {
            handle.abort();
        }
        let _ = std::fs::remove_file(self.socket_path());
        let _ = std::fs::remove_file(self.secret_path());
    }
}

/// Sixty-four hex characters from two UUIDv4s, written owner-only.
fn write_secret(path: &Path) -> Result<String, String> {
    let secret = format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple());
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(path)
        .map_err(|e| format!("could not write {}: {e}", path.display()))?;
    file.write_all(secret.as_bytes())
        .map_err(|e| format!("could not write {}: {e}", path.display()))?;
    // The mode above applies only on create; an existing file keeps its bits.
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
        .map_err(|e| format!("could not protect {}: {e}", path.display()))?;
    Ok(secret)
}

#[derive(Deserialize)]
struct Request {
    #[serde(default)]
    id: Value,
    method: String,
    #[serde(default)]
    params: Value,
}

fn ok(id: Value, result: Value) -> Value {
    json!({ "id": id, "ok": true, "result": result })
}

fn err(id: Value, error: impl Into<String>) -> Value {
    json!({ "id": id, "ok": false, "error": error.into() })
}

/// Constant-time equality, so a wrong secret does not leak how wrong.
fn secrets_match(given: &str, expected: &str) -> bool {
    if given.len() != expected.len() {
        return false;
    }
    given
        .bytes()
        .zip(expected.bytes())
        .fold(0u8, |acc, (a, b)| acc | (a ^ b))
        == 0
}

/// One request, one reply. `authed` flips to true on a good `auth`; a bad
/// one returns `Err` so the caller closes the connection after replying.
async fn dispatch(
    line: &str,
    authed: &mut bool,
    secret: &str,
    ops: &Arc<dyn AgentOps>,
) -> Result<Value, Value> {
    let req: Request = match serde_json::from_str(line) {
        Ok(r) => r,
        Err(e) => return Err(err(Value::Null, format!("bad request: {e}"))),
    };
    let id = req.id.clone();
    if !*authed {
        if req.method != "auth" {
            return Err(err(id, "unauthenticated: send auth first"));
        }
        let given = req.params.get("secret").and_then(Value::as_str).unwrap_or("");
        if !secrets_match(given, secret) {
            return Err(err(id, "auth failed"));
        }
        *authed = true;
        return Ok(ok(id, json!({ "authenticated": true })));
    }
    match req.method.as_str() {
        "auth" => Ok(ok(id, json!({ "authenticated": true }))),
        "ping" => Ok(ok(id, json!("pong"))),
        "active_task" => Ok(ok(id, json!(ops.active_task()))),
        "capture" => {
            let Some(task_id) = req.params.get("task_id").and_then(Value::as_str) else {
                return Ok(err(id, "capture needs params.task_id"));
            };
            match ops.capture(task_id.to_string()).await {
                Ok(v) => Ok(ok(id, v)),
                Err(e) => Ok(err(id, e)),
            }
        }
        "restore" => {
            let Some(task_id) = req.params.get("task_id").and_then(Value::as_str) else {
                return Ok(err(id, "restore needs params.task_id"));
            };
            let focus = req.params.get("focus").and_then(Value::as_bool).unwrap_or(false);
            match ops.restore(task_id.to_string(), focus).await {
                Ok(v) => Ok(ok(id, v)),
                Err(e) => Ok(err(id, e)),
            }
        }
        other => Ok(err(id, format!("unknown method: {other}"))),
    }
}

async fn serve(stream: UnixStream, ops: Arc<dyn AgentOps>, secret: String) {
    let (rd, mut wr) = stream.into_split();
    let mut lines = BufReader::new(rd).lines();
    let mut authed = false;
    while let Ok(Some(line)) = lines.next_line().await {
        if line.trim().is_empty() {
            continue;
        }
        let (reply, close) = match dispatch(&line, &mut authed, &secret, &ops).await {
            Ok(v) => (v, false),
            Err(v) => (v, true),
        };
        let mut out = serde_json::to_string(&reply).unwrap_or_default();
        out.push('\n');
        if wr.write_all(out.as_bytes()).await.is_err() {
            break;
        }
        if close {
            break;
        }
    }
    let _ = wr.shutdown().await;
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    struct Fake {
        captures: AtomicUsize,
        restores: Mutex<Vec<(String, bool)>>,
    }

    impl AgentOps for Fake {
        fn capture(&self, task_id: String) -> BoxFuture<Result<Value, String>> {
            self.captures.fetch_add(1, Ordering::SeqCst);
            Box::pin(async move {
                if task_id == "missing" {
                    Err("task not found: missing".into())
                } else {
                    Ok(json!({ "captured": ["vscode", "git"], "skipped": [] }))
                }
            })
        }
        fn restore(&self, task_id: String, focus: bool) -> BoxFuture<Result<Value, String>> {
            self.restores.lock().unwrap().push((task_id.clone(), focus));
            Box::pin(async move {
                Ok(json!({ "applied": ["git", "vscode"], "pending": [], "skipped": ["chrome: not running"],
                           "savedPrevious": null, "errors": [], "closed": [], "kept": [] }))
            })
        }
        fn active_task(&self) -> Option<String> {
            Some("task_reconnect".into())
        }
    }

    fn fake() -> Arc<Fake> {
        Arc::new(Fake { captures: AtomicUsize::new(0), restores: Mutex::new(Vec::new()) })
    }

    async fn talk(stream: &mut UnixStream, line: &str) -> Value {
        stream.write_all(format!("{line}\n").as_bytes()).await.unwrap();
        let mut reader = BufReader::new(stream);
        let mut reply = String::new();
        reader.read_line(&mut reply).await.unwrap();
        serde_json::from_str(&reply).unwrap()
    }

    fn secret_of(ipc: &AgentIpc) -> String {
        std::fs::read_to_string(ipc.secret_path()).unwrap()
    }

    #[test]
    fn secrets_compare_in_constant_time_shape() {
        assert!(secrets_match("abc", "abc"));
        assert!(!secrets_match("abc", "abd"));
        assert!(!secrets_match("ab", "abc"));
    }

    #[tokio::test]
    async fn start_writes_an_owner_only_secret_and_socket_and_stop_removes_them() {
        let dir = tempfile::tempdir().unwrap();
        let ipc = AgentIpc::new(dir.path().to_path_buf(), fake());
        assert!(!ipc.status().enabled);
        ipc.start().unwrap();
        assert!(ipc.status().enabled);
        let mode = |p: PathBuf| std::fs::metadata(p).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode(ipc.secret_path()), 0o600);
        assert_eq!(mode(ipc.socket_path()), 0o600);
        assert_eq!(secret_of(&ipc).len(), 64);
        ipc.stop();
        assert!(!ipc.status().enabled);
        assert!(!ipc.socket_path().exists());
        assert!(!ipc.secret_path().exists());
    }

    #[tokio::test]
    async fn a_wrong_secret_is_refused_and_the_connection_closed() {
        let dir = tempfile::tempdir().unwrap();
        let ipc = AgentIpc::new(dir.path().to_path_buf(), fake());
        ipc.start().unwrap();
        let mut s = UnixStream::connect(ipc.socket_path()).await.unwrap();
        let reply = talk(&mut s, r#"{"id":1,"method":"auth","params":{"secret":"nope"}}"#).await;
        assert_eq!(reply["ok"], false);
        assert_eq!(reply["error"], "auth failed");
        // The server hangs up: the next read sees end of stream.
        let mut rest = String::new();
        let n = BufReader::new(&mut s).read_line(&mut rest).await.unwrap();
        assert_eq!(n, 0);
        ipc.stop();
    }

    #[tokio::test]
    async fn anything_before_auth_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let ipc = AgentIpc::new(dir.path().to_path_buf(), fake());
        ipc.start().unwrap();
        let mut s = UnixStream::connect(ipc.socket_path()).await.unwrap();
        let reply = talk(&mut s, r#"{"id":"x","method":"capture","params":{"task_id":"t"}}"#).await;
        assert_eq!(reply["ok"], false);
        assert_eq!(reply["id"], "x");
        ipc.stop();
    }

    #[tokio::test]
    async fn capture_and_restore_round_trip_with_receipts() {
        let dir = tempfile::tempdir().unwrap();
        let ops = fake();
        let ipc = AgentIpc::new(dir.path().to_path_buf(), ops.clone());
        ipc.start().unwrap();
        let secret = secret_of(&ipc);
        let mut s = UnixStream::connect(ipc.socket_path()).await.unwrap();
        let auth = talk(&mut s, &format!(r#"{{"id":1,"method":"auth","params":{{"secret":"{secret}"}}}}"#)).await;
        assert_eq!(auth["ok"], true);
        let pong = talk(&mut s, r#"{"id":2,"method":"ping"}"#).await;
        assert_eq!(pong["result"], "pong");
        let active = talk(&mut s, r#"{"id":3,"method":"active_task"}"#).await;
        assert_eq!(active["result"], "task_reconnect");
        let cap = talk(&mut s, r#"{"id":4,"method":"capture","params":{"task_id":"task_reconnect"}}"#).await;
        assert_eq!(cap["ok"], true);
        assert_eq!(cap["result"]["captured"][0], "vscode");
        let missing = talk(&mut s, r#"{"id":5,"method":"capture","params":{"task_id":"missing"}}"#).await;
        assert_eq!(missing["ok"], false);
        assert_eq!(missing["error"], "task not found: missing");
        let res = talk(&mut s, r#"{"id":6,"method":"restore","params":{"task_id":"task_reconnect","focus":true}}"#).await;
        assert_eq!(res["ok"], true);
        assert_eq!(res["result"]["skipped"][0], "chrome: not running");
        assert_eq!(ops.captures.load(Ordering::SeqCst), 2);
        assert_eq!(ops.restores.lock().unwrap().as_slice(), &[("task_reconnect".to_string(), true)]);
        let unknown = talk(&mut s, r#"{"id":7,"method":"dance"}"#).await;
        assert_eq!(unknown["error"], "unknown method: dance");
        ipc.stop();
    }

    #[tokio::test]
    async fn stopping_refuses_new_connections_and_start_is_idempotent() {
        let dir = tempfile::tempdir().unwrap();
        let ipc = AgentIpc::new(dir.path().to_path_buf(), fake());
        ipc.start().unwrap();
        ipc.start().unwrap();
        let path = ipc.socket_path();
        ipc.stop();
        assert!(UnixStream::connect(&path).await.is_err());
    }
}
