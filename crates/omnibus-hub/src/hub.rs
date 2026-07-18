//! The hub proper. One tokio task per connection owns both socket halves;
//! shared state (registry + pending requests) lives behind a single Mutex.
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
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
}

impl HubConfig {
    pub fn new(data_dir: PathBuf) -> Self {
        Self {
            data_dir,
            command_timeout: Duration::from_secs(10),
            ping_interval: Duration::from_secs(5),
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
}

type Shared = Arc<Mutex<State>>;

pub struct Hub {
    port: u16,
    cfg: HubConfig,
    state: Shared,
    events: broadcast::Sender<HubEvent>,
    accept_task: tokio::task::JoinHandle<()>,
}

impl Hub {
    /// Binds 127.0.0.1 on an OS-assigned port, writes `hub.json`, starts accepting.
    pub async fn start(cfg: HubConfig) -> std::io::Result<Hub> {
        let listener = TcpListener::bind("127.0.0.1:0").await?;
        let port = listener.local_addr()?.port();
        std::fs::create_dir_all(&cfg.data_dir)?;
        std::fs::write(cfg.data_dir.join("hub.json"), json!({ "port": port }).to_string())?;
        let (events, _) = broadcast::channel(256);
        let state: Shared = Default::default();
        let accept_task =
            tokio::spawn(accept_loop(listener, state.clone(), events.clone(), cfg.clone()));
        Ok(Hub { port, cfg, state, events, accept_task })
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    /// Live stream of hub activity for the UI log.
    pub fn subscribe(&self) -> broadcast::Receiver<HubEvent> {
        self.events.subscribe()
    }

    /// Snapshot of currently connected connectors.
    pub async fn connectors(&self) -> Vec<ConnectorInfo> {
        self.state.lock().await.connectors.values().map(|c| c.info.clone()).collect()
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
) {
    while let Ok((stream, _)) = listener.accept().await {
        tokio::spawn(handle_connection(stream, state.clone(), events.clone(), cfg.clone()));
    }
}

/// Rejects browser connections until authentication exists (see spec,
/// "Deferred: authentication").
fn reject_origin(req: &Request, resp: HsResponse) -> Result<HsResponse, ErrorResponse> {
    if req.headers().contains_key("origin") {
        let mut denied = ErrorResponse::new(Some("browser connections not allowed".to_string()));
        *denied.status_mut() = tokio_tungstenite::tungstenite::http::StatusCode::FORBIDDEN;
        Err(denied)
    } else {
        Ok(resp)
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

async fn handle_connection(
    stream: TcpStream,
    state: Shared,
    events: broadcast::Sender<HubEvent>,
    cfg: HubConfig,
) {
    let Ok(ws) = tokio_tungstenite::accept_hdr_async(stream, reject_origin).await else { return };
    let (mut sink, mut source) = ws.split();

    // Handshake: first frame must be a valid hello within 5 s.
    let hello = match tokio::time::timeout(Duration::from_secs(5), source.next()).await {
        Ok(Some(Ok(WsMessage::Text(txt)))) => {
            match serde_json::from_str::<Envelope>(txt.as_ref()) {
                Ok(Envelope { msg: Message::Hello(h), .. }) => h,
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
