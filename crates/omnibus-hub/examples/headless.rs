//! Runs the hub without Tauri. Prints every HubEvent as one JSON line.
//! `--probe`: send `probe.echo {"n":1}` to each connector as it connects and
//! print the outcome — used by the connector-sdk integration test.
use omnibus_hub::{Hub, HubConfig, HubEvent};
use serde_json::json;

#[tokio::main]
async fn main() {
    let data_dir = match std::env::var("OMNIBUS_DATA_DIR") {
        Ok(dir) => dir.into(),
        Err(_) => dirs::data_dir().expect("no platform data dir").join("com.omnibus.dev"),
    };
    let probe = std::env::args().any(|a| a == "--probe");
    let hub = Hub::start(HubConfig::new(data_dir)).await.expect("hub failed to start");
    eprintln!("hub listening on 127.0.0.1:{}", hub.port());
    let mut events = hub.subscribe();
    loop {
        let ev = match events.recv().await {
            Ok(ev) => ev,
            Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
            Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
        };
        println!("{}", serde_json::to_string(&ev).unwrap());
        if probe {
            if let HubEvent::ConnectorConnected { connector } = &ev {
                let outcome = hub.send_command(&connector.id, "probe.echo", json!({"n": 1})).await;
                println!(
                    "{}",
                    json!({"probe": {"ok": outcome.is_ok(), "result": outcome.ok()}})
                );
            }
        }
    }
}
