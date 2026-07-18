//! serde mirror of the Zod schemas in `packages/protocol`.
//! Field names on the wire are camelCase; keep both sides in lockstep —
//! the shared fixtures enforce it.
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Wire protocol version. Bump only with a spec change.
pub const PROTOCOL_VERSION: u8 = 1;

/// Every frame on the wire.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Envelope {
    pub v: u8,
    pub id: String,
    #[serde(flatten)]
    pub msg: Message,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(tag = "kind", content = "payload", rename_all = "lowercase")]
pub enum Message {
    Hello(Hello),
    Welcome(Welcome),
    Command(Command),
    Response(Response),
    Event(Event),
    Error(ErrorMsg),
    Ping(Value),
    Pong(Value),
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ConnectorKind {
    Fake,
    Vscode,
    Chrome,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Hello {
    pub name: String,
    pub kind: ConnectorKind,
    #[serde(rename = "protocolVersion")]
    pub protocol_version: u8,
    pub capabilities: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Welcome {
    #[serde(rename = "connectorId")]
    pub connector_id: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Command {
    pub target: String,
    pub name: String,
    pub args: Value,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Response {
    #[serde(rename = "requestId")]
    pub request_id: String,
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Event {
    pub name: String,
    pub data: Value,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct ErrorMsg {
    pub code: String,
    pub message: String,
}
