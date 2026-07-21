//! Bridges serialized `HubEvent`s into the database. Deliberately consumes
//! JSON (the UI's wire shape) rather than `omnibus_hub` types, so this crate
//! never depends on the hub.
use std::collections::HashMap;

use serde_json::Value;

use crate::Db;

/// Consumes serialized hub events and persists them. Keeps an in-memory map
/// of session connector-ids to persistent `(name, kind)` identities so
/// disconnects can stamp `last_seen`.
pub struct Recorder {
    db: Db,
    sessions: HashMap<String, (String, String)>,
}

impl Recorder {
    /// A recorder writing into `db`. One per subscription.
    pub fn new(db: Db) -> Recorder {
        Recorder { db, sessions: HashMap::new() }
    }

    /// Handles one serialized `HubEvent`. Never fails: write errors are
    /// logged and skipped — persistence trouble must not break live routing.
    pub fn handle(&mut self, ev: &Value) {
        let event_type =
            ev.get("type").and_then(Value::as_str).unwrap_or("unknown").to_string();

        // Unauthenticated clients can spam `pair` frames freely (no secret
        // required to request pairing); persisting each one would let that
        // spam fill the events table. This is ephemeral UI signal only —
        // the live banner already gets it via the broadcast channel.
        if event_type == "pairingRequested" {
            return;
        }

        let session_id = ev
            .get("connectorId")
            .and_then(Value::as_str)
            .or_else(|| ev.pointer("/connector/id").and_then(Value::as_str))
            .map(String::from);

        if let Err(e) = self.db.record_event(&event_type, session_id.as_deref(), ev) {
            log::warn!("recorder: failed to persist event: {e}");
        }

        match event_type.as_str() {
            "connectorConnected" => {
                let name = ev.pointer("/connector/name").and_then(Value::as_str);
                let kind = ev.pointer("/connector/kind").and_then(Value::as_str);
                let caps: Vec<String> = match ev.pointer("/connector/capabilities") {
                    Some(v) => serde_json::from_value(v.clone()).unwrap_or_else(|e| {
                        log::warn!("recorder: corrupt connector capabilities: {e}");
                        Vec::new()
                    }),
                    None => Vec::new(),
                };
                if let (Some(name), Some(kind), Some(id)) = (name, kind, session_id.as_deref()) {
                    if let Err(e) = self.db.upsert_connector(name, kind, &caps) {
                        log::warn!("recorder: connector upsert failed: {e}");
                    }
                    self.sessions.insert(id.to_string(), (name.to_string(), kind.to_string()));
                }
            }
            "connectorDisconnected" => {
                match session_id.and_then(|id| self.sessions.remove(&id)) {
                    Some((name, kind)) => {
                        if let Err(e) = self.db.touch_connector_seen(&name, &kind) {
                            log::warn!("recorder: last_seen update failed: {e}");
                        }
                    }
                    // Recorder started mid-session: spec says log and skip.
                    None => log::debug!("recorder: disconnect for unknown session; skipped"),
                }
            }
            _ => {}
        }
    }
}
