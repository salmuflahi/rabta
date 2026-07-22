//! Runs the hub without Tauri. Prints every HubEvent as one JSON line.
//! `--probe`: send `probe.echo {"n":1}` to each connector as it connects and
//! print the outcome — used by the connector-sdk integration test.
//! `--record`: persist events and connector identities to `omnibus.db` in the
//! data dir, exactly as the desktop app does.
use rabta_db::{Db, DbConfig, Recorder};
use rabta_hub::{Hub, HubConfig, HubEvent};
use serde_json::json;
use tokio::sync::broadcast::error::RecvError;

#[tokio::main]
async fn main() {
    let data_dir: std::path::PathBuf = match std::env::var("OMNIBUS_DATA_DIR") {
        Ok(dir) => dir.into(),
        Err(_) => dirs::data_dir().expect("no platform data dir").join("com.omnibus.dev"),
    };
    let probe = std::env::args().any(|a| a == "--probe");
    let record = std::env::args().any(|a| a == "--record");

    let hub = Hub::start(HubConfig::new(data_dir.clone())).await.expect("hub failed to start");
    eprintln!("hub listening on 127.0.0.1:{}", hub.port());

    let mut recorder = if record {
        let db = Db::open(&data_dir.join("omnibus.db"), DbConfig::default())
            .expect("failed to open database");
        Some(Recorder::new(db))
    } else {
        None
    };

    let mut events = hub.subscribe();
    loop {
        let ev = match events.recv().await {
            Ok(ev) => ev,
            Err(RecvError::Lagged(_)) => continue,
            Err(RecvError::Closed) => break,
        };
        println!("{}", serde_json::to_string(&ev).unwrap());
        if let (Some(rec), Ok(v)) = (recorder.as_mut(), serde_json::to_value(&ev)) {
            rec.handle(&v);
        }
        if probe {
            if let HubEvent::ConnectorConnected { connector } = &ev {
                let outcome = hub.send_command(&connector.id, "probe.echo", json!({"n": 1})).await;
                println!("{}", json!({"probe": {"ok": outcome.is_ok(), "result": outcome.ok()}}));
            }
        }
    }
}
