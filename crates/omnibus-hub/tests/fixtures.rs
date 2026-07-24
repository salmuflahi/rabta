use rabta_hub::protocol::Envelope;
use serde_json::Value;

/// Every shared fixture must deserialize into our types and serialize back
/// to the identical JSON — this is what keeps the TS and Rust protocol
/// definitions from drifting.
#[test]
fn fixtures_round_trip() {
    let dir = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../packages/protocol/fixtures"
    );
    let mut checked = 0;
    for entry in std::fs::read_dir(dir).unwrap() {
        let path = entry.unwrap().path();
        let raw: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        let parsed: Envelope = serde_json::from_value(raw.clone())
            .unwrap_or_else(|e| panic!("{path:?} failed to deserialize: {e}"));
        let back = serde_json::to_value(&parsed).unwrap();
        assert_eq!(back, raw, "{path:?} did not round-trip");
        checked += 1;
    }
    assert_eq!(checked, 12, "expected all 12 fixtures");
}
