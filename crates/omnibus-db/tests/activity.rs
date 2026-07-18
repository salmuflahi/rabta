use omnibus_db::{Db, DbConfig};
use serde_json::json;

fn db() -> Db {
    Db::open_in_memory(DbConfig::default()).unwrap()
}

#[test]
fn records_and_reads_back_events_in_order() {
    let db = db();
    db.record_event("eventReceived", Some("s-1"), &json!({"n": 1})).unwrap();
    db.record_event("commandSent", None, &json!({"n": 2})).unwrap();
    let events = db.recent_events(10).unwrap();
    assert_eq!(events.len(), 2);
    assert_eq!(events[0].event_type, "eventReceived");
    assert_eq!(events[0].session_connector_id.as_deref(), Some("s-1"));
    assert_eq!(events[0].payload, json!({"n": 1}));
    assert_eq!(events[1].event_type, "commandSent");
    assert!(events[0].seq < events[1].seq);
}

#[test]
fn recent_events_returns_newest_window_oldest_first() {
    let db = db();
    for i in 0..5 {
        db.record_event("e", None, &json!({ "i": i })).unwrap();
    }
    let events = db.recent_events(2).unwrap();
    assert_eq!(events.len(), 2);
    assert_eq!(events[0].payload, json!({"i": 3}));
    assert_eq!(events[1].payload, json!({"i": 4}));
}

#[test]
fn event_cap_prunes_oldest_rows() {
    let db = Db::open_in_memory(DbConfig { event_cap: 5 }).unwrap();
    for i in 0..8 {
        db.record_event("e", None, &json!({ "i": i })).unwrap();
    }
    let events = db.recent_events(100).unwrap();
    assert_eq!(events.len(), 5, "cap must bound the table");
    assert_eq!(events[0].payload, json!({"i": 3}), "oldest rows pruned first");
    assert_eq!(events[4].payload, json!({"i": 7}));
}

#[test]
fn upsert_connector_is_identity_by_name_and_kind() {
    let db = db();
    db.upsert_connector("fake-vscode", "fake", &["workspace".into()]).unwrap();
    db.upsert_connector("fake-vscode", "fake", &["workspace".into(), "editor".into()]).unwrap();
    let known = db.known_connectors().unwrap();
    assert_eq!(known.len(), 1, "same (name, kind) must not duplicate");
    assert_eq!(known[0].capabilities, vec!["workspace", "editor"], "capabilities refresh on upsert");
    assert!(known[0].first_seen <= known[0].last_seen);
}

#[test]
fn touch_connector_seen_updates_last_seen_only_for_known() {
    let db = db();
    db.upsert_connector("a", "fake", &[]).unwrap();
    let before = db.known_connectors().unwrap()[0].last_seen.clone();
    std::thread::sleep(std::time::Duration::from_millis(5));
    db.touch_connector_seen("a", "fake").unwrap();
    let after = db.known_connectors().unwrap()[0].last_seen.clone();
    assert!(after > before);
    // Unknown connector: no error, no row created.
    db.touch_connector_seen("ghost", "fake").unwrap();
    assert_eq!(db.known_connectors().unwrap().len(), 1);
}
