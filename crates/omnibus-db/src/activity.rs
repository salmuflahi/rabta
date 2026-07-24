//! Event log and connector-identity persistence (the recorder's write side).
use rusqlite::params;
use serde::Serialize;
use serde_json::Value;

use crate::{new_id, now, Db, Result};

/// A hub event as persisted, in the same JSON shape the UI receives.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EventRow {
    pub seq: i64,
    pub at: String,
    #[serde(rename = "type")]
    pub event_type: String,
    pub session_connector_id: Option<String>,
    pub payload: Value,
}

/// A connector this machine has seen; persistent identity is `(name, kind)`.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KnownConnector {
    pub name: String,
    pub kind: String,
    pub capabilities: Vec<String>,
    pub first_seen: String,
    pub last_seen: String,
}

impl Db {
    /// Persists one event and prunes rows beyond the configured cap.
    pub fn record_event(
        &self,
        event_type: &str,
        session_connector_id: Option<&str>,
        payload: &Value,
    ) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        conn.execute(
            "INSERT INTO events (at, type, session_connector_id, payload) VALUES (?1, ?2, ?3, ?4)",
            params![now(), event_type, session_connector_id, payload.to_string()],
        )?;
        conn.execute(
            "DELETE FROM events WHERE seq <= (SELECT MAX(seq) FROM events) - ?1",
            params![self.cfg.event_cap as i64],
        )?;
        Ok(())
    }

    /// The newest `limit` events, oldest first (ready for a log display).
    pub fn recent_events(&self, limit: u32) -> Result<Vec<EventRow>> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let mut stmt = conn.prepare(
            "SELECT seq, at, type, session_connector_id, payload FROM \
             (SELECT * FROM events ORDER BY seq DESC LIMIT ?1) ORDER BY seq ASC",
        )?;
        let rows = stmt.query_map(params![limit], |r| {
            Ok(EventRow {
                seq: r.get(0)?,
                at: r.get(1)?,
                event_type: r.get(2)?,
                session_connector_id: r.get(3)?,
                payload: serde_json::from_str(&r.get::<_, String>(4)?).unwrap_or_else(|e| {
                    log::warn!("recent_events: corrupt events.payload: {e}");
                    Value::Null
                }),
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// Registers a connector identity or refreshes its capabilities/last_seen.
    pub fn upsert_connector(&self, name: &str, kind: &str, capabilities: &[String]) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let caps = serde_json::to_string(capabilities).unwrap_or_else(|_| "[]".into());
        let ts = now();
        conn.execute(
            "INSERT INTO connectors (id, name, kind, capabilities, first_seen, last_seen) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?5) \
             ON CONFLICT(name, kind) DO UPDATE SET capabilities = ?4, last_seen = ?5",
            params![new_id(), name, kind, caps, ts],
        )?;
        Ok(())
    }

    /// Stamps `last_seen` for a known connector; silently no-ops for unknown.
    pub fn touch_connector_seen(&self, name: &str, kind: &str) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        conn.execute(
            "UPDATE connectors SET last_seen = ?3 WHERE name = ?1 AND kind = ?2",
            params![name, kind, now()],
        )?;
        Ok(())
    }

    /// Stores/replaces the persistent pairing token for a connector identity,
    /// creating the row if the connector has never connected.
    pub fn set_connector_token(&self, name: &str, kind: &str, token: &str) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let ts = now();
        conn.execute(
            "INSERT INTO connectors (id, name, kind, capabilities, token, first_seen, last_seen) \
             VALUES (?1, ?2, ?3, '[]', ?4, ?5, ?5) \
             ON CONFLICT(name, kind) DO UPDATE SET token = ?4",
            params![new_id(), name, kind, token, ts],
        )?;
        Ok(())
    }

    /// All persisted pairing tokens as (name, kind, token).
    pub fn connector_tokens(&self) -> Result<Vec<(String, String, String)>> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let mut stmt =
            conn.prepare("SELECT name, kind, token FROM connectors WHERE token IS NOT NULL")?;
        let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// Every connector this machine has seen, most recently seen first.
    pub fn known_connectors(&self) -> Result<Vec<KnownConnector>> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let mut stmt = conn.prepare(
            "SELECT name, kind, capabilities, first_seen, last_seen \
             FROM connectors ORDER BY last_seen DESC",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(KnownConnector {
                name: r.get(0)?,
                kind: r.get(1)?,
                capabilities: serde_json::from_str(&r.get::<_, String>(2)?).unwrap_or_else(|e| {
                    log::warn!("known_connectors: corrupt connectors.capabilities: {e}");
                    Vec::new()
                }),
                first_seen: r.get(3)?,
                last_seen: r.get(4)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }
}
