//! The hub proper. One tokio task per connection owns both socket halves;
//! shared state (registry + pending requests) lives behind a single Mutex.
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};
use std::time::Duration;

use futures_util::stream::SplitSink;
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use serde_json::{json, Value};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{broadcast, mpsc, oneshot, Mutex};
use tokio_tungstenite::tungstenite::handshake::server::{ErrorResponse, Request, Response as HsResponse};
use tokio_tungstenite::tungstenite::Message as WsMessage;
use tokio_tungstenite::WebSocketStream;
use uuid::Uuid;

use crate::protocol::*;

/// Hub configuration. Timeouts are configurable so tests can shrink them;
/// production callers use `HubConfig::new` defaults (spec: 10 s / 5 s).
#[derive(Clone)]
pub struct HubConfig {
    pub data_dir: PathBuf,
    pub command_timeout: Duration,
    pub ping_interval: Duration,
    /// Live token map keyed "{name}/{kind}"; shared with the embedding app,
    /// which owns persistence. The hub only reads it.
    pub tokens: Arc<RwLock<HashMap<String, String>>>,
    /// How long a parked pairing request waits for the user.
    pub pairing_timeout: Duration,
    /// Preferred TCP port for discoverability by clients that can't read
    /// `hub.json` (browsers). `0` means OS-assigned (native default). If the
    /// preferred port is taken, the hub falls back to an OS-assigned one.
    pub preferred_port: u16,
}

impl HubConfig {
    pub fn new(data_dir: PathBuf) -> Self {
        Self {
            data_dir,
            command_timeout: Duration::from_secs(10),
            ping_interval: Duration::from_secs(5),
            tokens: Arc::new(RwLock::new(HashMap::new())),
            pairing_timeout: Duration::from_secs(120),
            preferred_port: 0,
        }
    }
}

/// A connector as shown to the UI.
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConnectorInfo {
    pub id: String,
    pub name: String,
    pub kind: ConnectorKind,
    pub capabilities: Vec<String>,
}

/// Everything observable about hub activity, broadcast to subscribers
/// (the UI activity log, the headless example, tests).
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum HubEvent {
    ConnectorConnected { connector: ConnectorInfo },
    ConnectorDisconnected { connector_id: String },
    CommandSent { connector_id: String, request_id: String, name: String, args: Value },
    ResponseReceived { connector_id: String, request_id: String, ok: bool, result: Value },
    EventReceived { connector_id: String, name: String, data: Value },
    PairingRequested { pairing_id: String, name: String, kind: String },
}

#[derive(Debug, thiserror::Error)]
pub enum CommandError {
    #[error("unknown connector: {0}")]
    UnknownConnector(String),
    #[error("timeout")]
    Timeout,
    #[error("connector disconnected")]
    Disconnected,
    #[error("connector error: {0}")]
    Connector(String),
}

struct Connected {
    info: ConnectorInfo,
    tx: mpsc::UnboundedSender<Envelope>,
}

type Waiter = oneshot::Sender<Result<Value, CommandError>>;

#[derive(Default)]
struct State {
    connectors: HashMap<String, Connected>,
    /// requestId -> (connectorId it was sent to, waiter)
    pending: HashMap<String, (String, Waiter)>,
    /// pairingId -> (name, kind, resolver). Removed on resolve or timeout.
    pairings: HashMap<String, (String, String, oneshot::Sender<Option<String>>)>,
}

type Shared = Arc<Mutex<State>>;

/// A running hub: owns the listening socket, connector registry, and event
/// broadcaster; `Hub::start` returns one already accepting connections.
pub struct Hub {
    port: u16,
    /// Per-start shared secret, written to `hub.json` for local (non-browser)
    /// connectors that read the discovery file directly.
    secret: Arc<String>,
    cfg: HubConfig,
    state: Shared,
    events: broadcast::Sender<HubEvent>,
    accept_task: tokio::task::JoinHandle<()>,
}

impl Hub {
    /// Binds 127.0.0.1 on an OS-assigned port, writes `hub.json`, starts accepting.
    pub async fn start(cfg: HubConfig) -> std::io::Result<Hub> {
        let listener = match cfg.preferred_port {
            0 => TcpListener::bind("127.0.0.1:0").await?,
            p => match TcpListener::bind(("127.0.0.1", p)).await {
                Ok(l) => l,
                Err(_) => TcpListener::bind("127.0.0.1:0").await?,
            },
        };
        let port = listener.local_addr()?.port();
        std::fs::create_dir_all(&cfg.data_dir)?;
        let secret = Uuid::new_v4().to_string();
        let path = cfg.data_dir.join("hub.json");
        let contents = json!({ "port": port, "secret": secret }).to_string();
        // The secret in hub.json is the local trust boundary: any process
        // that can read this file can authenticate as a trusted connector.
        // Create it atomically at 0600 (create_new + mode, no separate
        // chmod) so there is never a window where another local user could
        // read the freshly-written secret before permissions land.
        #[cfg(unix)]
        {
            use std::io::Write;
            use std::os::unix::fs::OpenOptionsExt;
            let _ = std::fs::remove_file(&path); // fresh perms even if an old file exists
            let mut f = std::fs::OpenOptions::new()
                .create_new(true)
                .write(true)
                .mode(0o600)
                .open(&path)?;
            f.write_all(contents.as_bytes())?;
        }
        // Non-unix targets have no POSIX mode bits to set; write plainly so
        // a future non-unix build still compiles and starts. macOS/Linux are
        // unaffected — they take the `#[cfg(unix)]` branch above.
        #[cfg(not(unix))]
        {
            std::fs::write(&path, contents.as_bytes())?;
        }
        let secret = Arc::new(secret);
        let (events, _) = broadcast::channel(256);
        let state: Shared = Default::default();
        let accept_task = tokio::spawn(accept_loop(
            listener,
            state.clone(),
            events.clone(),
            cfg.clone(),
            secret.clone(),
        ));
        Ok(Hub { port, secret, cfg, state, events, accept_task })
    }

    /// The OS-assigned TCP port the hub is listening on.
    pub fn port(&self) -> u16 {
        self.port
    }

    /// The per-start shared secret (also written to `hub.json`).
    pub fn secret(&self) -> &str {
        &self.secret
    }

    /// A clone of the live token map handle, for callers (desktop layer,
    /// tests) that need to insert tokens issued via pairing.
    pub fn tokens_handle(&self) -> Arc<RwLock<HashMap<String, String>>> {
        self.cfg.tokens.clone()
    }

    /// Live stream of hub activity for the UI log.
    pub fn subscribe(&self) -> broadcast::Receiver<HubEvent> {
        self.events.subscribe()
    }

    /// Snapshot of currently connected connectors.
    pub async fn connectors(&self) -> Vec<ConnectorInfo> {
        self.state.lock().await.connectors.values().map(|c| c.info.clone()).collect()
    }

    /// Snapshot of pairing requests currently parked awaiting resolution:
    /// (pairing_id, name, kind).
    pub async fn pending_pairings(&self) -> Vec<(String, String, String)> {
        self.state
            .lock()
            .await
            .pairings
            .iter()
            .map(|(id, (name, kind, _))| (id.clone(), name.clone(), kind.clone()))
            .collect()
    }

    /// Resolves a parked pairing request: `Some(token)` approves and issues
    /// that token, `None` denies. Returns `false` if `pairing_id` is unknown
    /// (already resolved, timed out, or never existed).
    pub async fn resolve_pairing(&self, pairing_id: &str, token: Option<String>) -> bool {
        match self.state.lock().await.pairings.remove(pairing_id) {
            Some((_, _, tx)) => {
                let _ = tx.send(token);
                true
            }
            None => false,
        }
    }

    /// Routes a command to `target` and awaits its response (Task 5).
    pub async fn send_command(
        &self,
        target: &str,
        name: &str,
        args: Value,
    ) -> Result<Value, CommandError> {
        let request_id = Uuid::new_v4().to_string();
        let (done_tx, done_rx) = oneshot::channel();
        {
            let mut st = self.state.lock().await;
            let conn = st
                .connectors
                .get(target)
                .ok_or_else(|| CommandError::UnknownConnector(target.to_string()))?;
            let env = Envelope {
                v: PROTOCOL_VERSION,
                id: request_id.clone(),
                msg: Message::Command(Command {
                    target: target.to_string(),
                    name: name.to_string(),
                    args: args.clone(),
                }),
            };
            if conn.tx.send(env).is_err() {
                return Err(CommandError::Disconnected);
            }
            st.pending.insert(request_id.clone(), (target.to_string(), done_tx));
        }
        let _ = self.events.send(HubEvent::CommandSent {
            connector_id: target.to_string(),
            request_id: request_id.clone(),
            name: name.to_string(),
            args,
        });
        match tokio::time::timeout(self.cfg.command_timeout, done_rx).await {
            Ok(Ok(outcome)) => outcome,
            Ok(Err(_)) => Err(CommandError::Disconnected),
            Err(_) => {
                self.state.lock().await.pending.remove(&request_id);
                let _ = self.events.send(HubEvent::ResponseReceived {
                    connector_id: target.to_string(),
                    request_id,
                    ok: false,
                    result: json!("timeout"),
                });
                Err(CommandError::Timeout)
            }
        }
    }

    /// Stops accepting connections. Existing connection tasks end when their
    /// sockets close; fine for app shutdown.
    pub fn shutdown(&self) {
        self.accept_task.abort();
    }
}

async fn accept_loop(
    listener: TcpListener,
    state: Shared,
    events: broadcast::Sender<HubEvent>,
    cfg: HubConfig,
    secret: Arc<String>,
) {
    while let Ok((stream, _)) = listener.accept().await {
        tokio::spawn(handle_connection(
            stream,
            state.clone(),
            events.clone(),
            cfg.clone(),
            secret.clone(),
        ));
    }
}

/// Absent origin (native processes) and browser-extension origins may
/// proceed to authentication; web origins are rejected outright. A present
/// but unparseable `Origin` header (e.g. non-ASCII bytes) must NOT be
/// treated the same as an absent one — that would fail open — so it is
/// distinguished from "no header at all" and rejected.
fn origin_allowed(req: &Request) -> bool {
    match req.headers().get("origin") {
        None => true,
        Some(v) => match v.to_str() {
            Ok(o) => o.starts_with("chrome-extension://") || o.starts_with("moz-extension://"),
            Err(_) => false,
        },
    }
}

fn check_origin(req: &Request, resp: HsResponse) -> Result<HsResponse, ErrorResponse> {
    if origin_allowed(req) {
        Ok(resp)
    } else {
        let mut denied = ErrorResponse::new(Some("origin not allowed".to_string()));
        *denied.status_mut() = tokio_tungstenite::tungstenite::http::StatusCode::FORBIDDEN;
        Err(denied)
    }
}

/// The lowercase wire tag for a `ConnectorKind` (matches its serde repr),
/// used to build the "{name}/{kind}" token-map key.
fn kind_tag(kind: ConnectorKind) -> &'static str {
    match kind {
        ConnectorKind::Fake => "fake",
        ConnectorKind::Vscode => "vscode",
        ConnectorKind::Chrome => "chrome",
    }
}

type Sink = SplitSink<WebSocketStream<TcpStream>, WsMessage>;

async fn send_env(sink: &mut Sink, env: &Envelope) -> Result<(), ()> {
    let txt = serde_json::to_string(env).map_err(|_| ())?;
    sink.send(WsMessage::Text(txt.into())).await.map_err(|_| ())
}

fn envelope(msg: Message) -> Envelope {
    Envelope { v: PROTOCOL_VERSION, id: Uuid::new_v4().to_string(), msg }
}

/// Constant-time equality (length-difference short-circuit is fine — our
/// secrets/tokens are fixed-length UUIDs). Avoids leaking match position via timing.
fn ct_eq(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b) {
        diff |= x ^ y;
    }
    diff == 0
}

async fn handle_connection(
    stream: TcpStream,
    state: Shared,
    events: broadcast::Sender<HubEvent>,
    cfg: HubConfig,
    secret: Arc<String>,
) {
    let Ok(ws) = tokio_tungstenite::accept_hdr_async(stream, check_origin).await else { return };
    let (mut sink, mut source) = ws.split();

    // Handshake: first frame must be a valid hello or pair within 5 s.
    let hello = match tokio::time::timeout(Duration::from_secs(5), source.next()).await {
        Ok(Some(Ok(WsMessage::Text(txt)))) => {
            match serde_json::from_str::<Envelope>(txt.as_ref()) {
                // Envelope-level version check applies to the very first
                // frame regardless of which message it carries — hello
                // additionally checks its payload's protocolVersion below,
                // but pair frames have no such payload field, so without
                // this check a stale-protocol pair frame would sail through
                // to `handle_pairing` unchecked.
                Ok(env) if env.v != PROTOCOL_VERSION => {
                    let _ = send_env(
                        &mut sink,
                        &envelope(Message::Error(ErrorMsg {
                            code: "version_mismatch".into(),
                            message: "unsupported envelope version".into(),
                        })),
                    )
                    .await;
                    return;
                }
                Ok(Envelope { msg: Message::Hello(h), .. }) => h,
                Ok(Envelope { msg: Message::Pair(p), .. }) => {
                    handle_pairing(p, &mut sink, &state, &events, &cfg).await;
                    return;
                }
                _ => {
                    let _ = send_env(
                        &mut sink,
                        &envelope(Message::Error(ErrorMsg {
                            code: "bad_message".into(),
                            message: "expected a valid hello".into(),
                        })),
                    )
                    .await;
                    return;
                }
            }
        }
        _ => return,
    };
    // Binding order: protocol-version check FIRST, then auth. This preserves
    // the pre-existing version-mismatch behavior/test (a stale client should
    // learn it's on the wrong version even without credentials) and gives a
    // more specific error before we bother validating secrets/tokens.
    if hello.protocol_version != PROTOCOL_VERSION {
        let _ = send_env(
            &mut sink,
            &envelope(Message::Error(ErrorMsg {
                code: "version_mismatch".into(),
                message: "unsupported protocol version".into(),
            })),
        )
        .await;
        return;
    }

    let token_key = format!("{}/{}", hello.name, kind_tag(hello.kind));
    let authed = hello.secret.as_deref().is_some_and(|s| ct_eq(s, secret.as_str()))
        || hello.token.as_deref().is_some_and(|t| {
            cfg.tokens
                .read()
                .unwrap()
                .get(&token_key)
                .is_some_and(|expected| ct_eq(expected, t))
        });
    if !authed {
        let _ = send_env(
            &mut sink,
            &envelope(Message::Error(ErrorMsg {
                code: "auth_failed".into(),
                message: "invalid credentials".into(),
            })),
        )
        .await;
        return;
    }

    let id = Uuid::new_v4().to_string();
    let info = ConnectorInfo {
        id: id.clone(),
        name: hello.name,
        kind: hello.kind,
        capabilities: hello.capabilities,
    };
    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<Envelope>();
    state.lock().await.connectors.insert(id.clone(), Connected { info: info.clone(), tx: out_tx });
    let _ = events.send(HubEvent::ConnectorConnected { connector: info });
    if send_env(&mut sink, &envelope(Message::Welcome(Welcome { connector_id: id.clone() })))
        .await
        .is_err()
    {
        cleanup(&state, &events, &id).await;
        return;
    }

    // Main loop: one task owns both halves. Ping every interval; two pings
    // without a pong in between → dead (spec: liveness).
    let mut tick = tokio::time::interval(cfg.ping_interval);
    tick.tick().await; // consume the immediate first tick
    let mut unanswered_pings: u32 = 0;
    let mut strikes: u32 = 0;
    loop {
        tokio::select! {
            incoming = source.next() => match incoming {
                Some(Ok(WsMessage::Text(txt))) => match serde_json::from_str::<Envelope>(txt.as_ref()) {
                    Ok(env) if env.v != PROTOCOL_VERSION => {
                        strikes += 1;
                        let _ = send_env(&mut sink, &envelope(Message::Error(ErrorMsg {
                            code: "bad_message".into(),
                            message: "unsupported envelope version".into(),
                        }))).await;
                        if strikes >= 3 { break; }
                    }
                    Ok(env) => match env.msg {
                        Message::Pong(_) => unanswered_pings = 0,
                        Message::Response(r) => {
                            let waiter = state.lock().await.pending.remove(&r.request_id);
                            match waiter {
                                Some((_, done_tx)) => {
                                    let ok = r.ok;
                                    let result = r.result.unwrap_or(Value::Null);
                                    let outcome = if ok {
                                        Ok(result.clone())
                                    } else {
                                        Err(CommandError::Connector(r.error.unwrap_or_default()))
                                    };
                                    let _ = done_tx.send(outcome);
                                    let _ = events.send(HubEvent::ResponseReceived {
                                        connector_id: id.clone(),
                                        request_id: r.request_id,
                                        ok,
                                        result,
                                    });
                                }
                                // Late reply after timeout: spec says drop and log.
                                None => eprintln!("dropped late response {} from {}", r.request_id, id),
                            }
                        }
                        Message::Event(e) => {
                            let _ = events.send(HubEvent::EventReceived {
                                connector_id: id.clone(),
                                name: e.name,
                                data: e.data,
                            });
                        }
                        // Late/duplicate hello or pair after registration:
                        // not a protocol-version or parse failure, but still
                        // an unexpected frame — strike it the same way.
                        Message::Hello(_) | Message::Pair(_) => {
                            strikes += 1;
                            let _ = send_env(&mut sink, &envelope(Message::Error(ErrorMsg {
                                code: "bad_message".into(),
                                message: "unexpected frame".into(),
                            }))).await;
                            if strikes >= 3 { break; }
                        }
                        _ => {}
                    },
                    Err(_) => {
                        strikes += 1;
                        let _ = send_env(&mut sink, &envelope(Message::Error(ErrorMsg {
                            code: "bad_message".into(),
                            message: "frame failed validation".into(),
                        }))).await;
                        if strikes >= 3 { break; }
                    }
                },
                Some(Ok(_)) => {}   // ignore non-text frames
                _ => break,          // closed or socket error
            },
            outgoing = out_rx.recv() => {
                let Some(env) = outgoing else { break };
                if send_env(&mut sink, &env).await.is_err() { break; }
            }
            _ = tick.tick() => {
                if unanswered_pings >= 2 { break; }
                unanswered_pings += 1;
                if send_env(&mut sink, &envelope(Message::Ping(json!({})))).await.is_err() { break; }
            }
        }
    }
    cleanup(&state, &events, &id).await;
}

/// Handles a `pair` first frame in place of `hello`: parks the request,
/// announces it via `HubEvent::PairingRequested`, then waits for
/// `Hub::resolve_pairing` (approval, denial) or `cfg.pairing_timeout` to
/// elapse. Always ends the connection — an approved connector must
/// reconnect with `hello { token }` to actually register.
async fn handle_pairing(
    p: Pair,
    sink: &mut Sink,
    state: &Shared,
    events: &broadcast::Sender<HubEvent>,
    cfg: &HubConfig,
) {
    let pairing_id = Uuid::new_v4().to_string();
    let name = p.name;
    let kind = kind_tag(p.kind).to_string();

    // Unauthenticated clients can send `pair` frames freely; without this
    // check, spamming the same (name, kind) would park a fresh pairing (and
    // broadcast a fresh `PairingRequested`, stacking banners in the UI) for
    // every connection. Reject the duplicate outright instead. The check and
    // the insert MUST happen under a single lock acquisition — two
    // simultaneous `pair` frames for the same (name, kind) that each took
    // the lock separately for the check and the insert could both observe
    // "not pending" and both park (TOCTOU).
    let (tx, rx) = oneshot::channel::<Option<String>>();
    {
        let mut st = state.lock().await;
        let already_pending = st.pairings.values().any(|(n, k, _)| n == &name && k == &kind);
        if already_pending {
            drop(st);
            let _ = send_env(
                sink,
                &envelope(Message::Error(ErrorMsg {
                    code: "bad_message".into(),
                    message: "pairing already pending".into(),
                })),
            )
            .await;
            return;
        }
        st.pairings.insert(pairing_id.clone(), (name.clone(), kind.clone(), tx));
    }
    let _ = events.send(HubEvent::PairingRequested {
        pairing_id: pairing_id.clone(),
        name,
        kind,
    });

    let outcome = tokio::time::timeout(cfg.pairing_timeout, rx).await;
    // No-op if `resolve_pairing` already removed the entry when it fired.
    state.lock().await.pairings.remove(&pairing_id);
    match outcome {
        Ok(Ok(Some(token))) => {
            let _ = send_env(sink, &envelope(Message::Paired(Paired { token }))).await;
        }
        Ok(Ok(None)) | Ok(Err(_)) => {
            let _ = send_env(
                sink,
                &envelope(Message::Error(ErrorMsg {
                    code: "pairing_denied".into(),
                    message: "pairing request denied".into(),
                })),
            )
            .await;
        }
        Err(_) => {
            let _ = send_env(
                sink,
                &envelope(Message::Error(ErrorMsg {
                    code: "pairing_timeout".into(),
                    message: "pairing request timed out".into(),
                })),
            )
            .await;
        }
    }
}

/// Removes the connector from the registry, fails its pending requests fast,
/// and announces the disconnect.
async fn cleanup(state: &Shared, events: &broadcast::Sender<HubEvent>, id: &str) {
    let mut st = state.lock().await;
    st.connectors.remove(id);
    let stale: Vec<String> = st
        .pending
        .iter()
        .filter(|(_, (cid, _))| cid == id)
        .map(|(rid, _)| rid.clone())
        .collect();
    for rid in stale {
        if let Some((_, done_tx)) = st.pending.remove(&rid) {
            let _ = done_tx.send(Err(CommandError::Disconnected));
        }
    }
    drop(st);
    let _ = events.send(HubEvent::ConnectorDisconnected { connector_id: id.to_string() });
}
