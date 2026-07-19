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

/// The payload half of an `Envelope`, tagged on the wire by `kind`.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(tag = "kind", content = "payload", rename_all = "lowercase")]
pub enum Message {
    Hello(Hello),
    Welcome(Welcome),
    Command(Command),
    Response(Response),
    Event(Event),
    Error(ErrorMsg),
    Pair(Pair),
    Paired(Paired),
    Ping(Value),
    Pong(Value),
}

/// The kind of process a connector identifies itself as during `hello`.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ConnectorKind {
    Fake,
    Vscode,
    Chrome,
}

/// First frame a connector sends; identifies it and negotiates protocol version.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Hello {
    pub name: String,
    pub kind: ConnectorKind,
    #[serde(rename = "protocolVersion")]
    pub protocol_version: u8,
    pub capabilities: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub secret: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
}

/// Pairing request: sent instead of `hello` by connectors with no credentials.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Pair {
    pub name: String,
    pub kind: ConnectorKind,
}

/// Pairing approval carrying the newly issued persistent token.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Paired {
    pub token: String,
}

/// The hub's reply to a valid `hello`, assigning the connector its id.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Welcome {
    #[serde(rename = "connectorId")]
    pub connector_id: String,
}

/// A request routed from the hub to a connector, awaiting a `Response`.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Command {
    pub target: String,
    pub name: String,
    pub args: Value,
}

/// A connector's reply to a `Command`, matched by `request_id`.
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

/// An unsolicited notification a connector emits, not tied to any request.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Event {
    pub name: String,
    pub data: Value,
}

/// An error frame the hub sends in response to a bad or rejected message.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct ErrorMsg {
    pub code: String,
    pub message: String,
}
