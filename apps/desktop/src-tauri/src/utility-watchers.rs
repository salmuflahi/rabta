//! Background watchers with one explicit worker: auto-quit for apps whose
//! last window closed, and the Music block. The decision logic is a pure
//! step over an app snapshot so it can be tested without macOS; the worker
//! only fetches snapshots and forwards decisions to the native bridge.
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::State;

use super::apps::valid_bundle;
use super::UtilityState;

const MUSIC: &str = "com.apple.music";
const NEVER_QUIT: &[&str] = &["com.apple.finder", "com.apple.dock", "com.apple.systemuiserver", "com.apple.loginwindow", "com.apple.controlcenter", "com.apple.notificationcenterui", "com.omnibus.dev", "com.omnibus.dev.preview", "com.omnibus.dev.beta"];
const MAX_EVENTS: usize = 50;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct AutoQuit { pub enabled: bool, pub grace_seconds: u32, pub excluded_apps: Vec<String> }
impl Default for AutoQuit { fn default() -> Self { Self { enabled: false, grace_seconds: 20, excluded_apps: vec![] } } }
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct MusicBlock { pub enabled: bool, pub allow_until: Option<u64> }
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct WatcherSettings { pub auto_quit: AutoQuit, pub music_block: MusicBlock }
impl WatcherSettings { pub fn active(&self) -> bool { self.auto_quit.enabled || self.music_block.enabled } }

#[derive(Clone, Debug, Deserialize)]
pub struct AppSnapshot { pub pid: u32, #[serde(rename = "bundleId")] pub bundle_id: String, pub name: String, pub windows: u32, pub policy: String }
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Event { pub at: u64, pub message: String }
#[derive(Debug, PartialEq)]
pub enum Action { Quit { pid: u32, name: String, reason: String } }
struct Track { had_windows: bool, zero_since: Option<Instant>, requested: bool }
pub struct Watchers { settings: WatcherSettings, tracks: HashMap<u32, Track>, music_seen: Option<bool>, events: Vec<Event>, worker_started: bool, shutdown: bool, revision: u64, error: Option<String> }
impl Default for Watchers { fn default() -> Self { Self { settings: WatcherSettings::default(), tracks: HashMap::new(), music_seen: None, events: vec![], worker_started: false, shutdown: false, revision: 0, error: None } } }
pub type SharedWatchers = Arc<Mutex<Watchers>>;

pub(super) fn validate(settings: &WatcherSettings) -> Result<WatcherSettings, String> {
    if !(5..=600).contains(&settings.auto_quit.grace_seconds) { return Err("Wait between 5 and 600 seconds after the last window closes.".into()); }
    if settings.auto_quit.excluded_apps.len() > 100 { return Err("Enter up to 100 excluded application bundle IDs.".into()); }
    let mut normalized = settings.clone();
    normalized.auto_quit.excluded_apps = settings.auto_quit.excluded_apps.iter().map(|id| id.trim().to_ascii_lowercase()).collect();
    if normalized.auto_quit.excluded_apps.iter().any(|id| !valid_bundle(id)) { return Err("Enter application bundle IDs like com.apple.Safari, one per line.".into()); }
    normalized.auto_quit.excluded_apps.dedup();
    Ok(normalized)
}
/// One decision pass. An app is only quit after it has been seen with
/// windows and then without any for the grace period, once. Music is quit
/// when it appears after the block was enabled and no allowance is active.
pub(super) fn step(state: &mut Watchers, apps: &[AppSnapshot], now: Instant, unix_now: u64, own_pid: u32) -> Vec<Action> {
    let mut actions = Vec::new();
    let settings = state.settings.clone();
    if settings.auto_quit.enabled {
        state.tracks.retain(|pid, _| apps.iter().any(|app| app.pid == *pid));
        for app in apps {
            let bundle = app.bundle_id.to_ascii_lowercase();
            if app.policy != "regular" || app.pid == own_pid || bundle.is_empty() || NEVER_QUIT.contains(&bundle.as_str()) || settings.auto_quit.excluded_apps.contains(&bundle) { continue; }
            let track = state.tracks.entry(app.pid).or_insert(Track { had_windows: false, zero_since: None, requested: false });
            if app.windows > 0 { track.had_windows = true; track.zero_since = None; track.requested = false; continue; }
            if !track.had_windows { continue; }
            let since = *track.zero_since.get_or_insert(now);
            if !track.requested && now.duration_since(since) >= Duration::from_secs(u64::from(settings.auto_quit.grace_seconds)) {
                track.requested = true;
                actions.push(Action::Quit { pid: app.pid, name: app.name.clone(), reason: format!("no windows for {} seconds", settings.auto_quit.grace_seconds) });
            }
        }
    } else { state.tracks.clear(); }
    let music = apps.iter().find(|app| app.bundle_id.eq_ignore_ascii_case(MUSIC));
    if settings.music_block.enabled {
        let running = music.is_some();
        let allowed = settings.music_block.allow_until.is_some_and(|until| unix_now < until);
        if let (Some(false), Some(app)) = (state.music_seen, music) {
            if !allowed { actions.push(Action::Quit { pid: app.pid, name: app.name.clone(), reason: "Music opened while the block was on".into() }); }
        }
        state.music_seen = Some(running);
    } else { state.music_seen = None; }
    actions
}
fn push_event(state: &mut Watchers, message: String) {
    state.events.insert(0, Event { at: super::now(), message });
    state.events.truncate(MAX_EVENTS);
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatcherStatus { pub settings: WatcherSettings, pub events: Vec<Event>, pub active: bool, pub error: Option<String> }
fn snapshot(state: &Watchers) -> WatcherStatus { WatcherStatus { settings: state.settings.clone(), events: state.events.clone(), active: state.settings.active() && state.worker_started, error: state.error.clone() } }
pub(super) fn configure(shared: &SharedWatchers, settings: WatcherSettings) -> Result<WatcherStatus, String> {
    let settings = validate(&settings)?;
    if settings.active() { super::mac_only()?; }
    let mut state = shared.lock().map_err(|_| "Watcher state is unavailable.")?;
    if state.shutdown { return Err("Rabta is quitting.".into()); }
    state.revision = state.revision.wrapping_add(1);
    state.error = None;
    if !settings.auto_quit.enabled { state.tracks.clear(); }
    if !settings.music_block.enabled { state.music_seen = None; }
    state.settings = settings;
    if state.settings.active() && !state.worker_started {
        state.worker_started = true;
        let shared = Arc::clone(shared);
        thread::spawn(move || loop {
            thread::sleep(Duration::from_secs(2));
            let revision = {
                let Ok(mut state) = shared.lock() else { break };
                if state.shutdown || !state.settings.active() { state.worker_started = false; break; }
                state.revision
            };
            let value = super::native::call("runningApps", json!({"includeBackground": false}));
            let Ok(mut state) = shared.lock() else { break };
            if state.revision != revision || state.shutdown { continue; }
            let apps: Vec<AppSnapshot> = match value.and_then(|v| serde_json::from_value(v["apps"].clone()).map_err(|_| "Could not read running apps.".to_string())) {
                Ok(apps) => apps,
                Err(error) => { state.error = Some(error); continue; }
            };
            let actions = step(&mut state, &apps, Instant::now(), super::now(), std::process::id());
            for Action::Quit { pid, name, reason } in actions {
                match super::native::call("terminateApp", json!({"pid": pid, "force": false})) {
                    Ok(_) => push_event(&mut state, format!("Asked {name} to quit: {reason}.")),
                    Err(error) => push_event(&mut state, format!("{name} was not quit: {error}")),
                }
            }
        });
    }
    Ok(snapshot(&state))
}
pub(super) fn read(shared: &SharedWatchers) -> Result<WatcherStatus, String> { Ok(snapshot(&*shared.lock().map_err(|_| "Watcher state is unavailable.")?)) }
pub(super) fn stop(shared: &SharedWatchers) {
    if let Ok(mut state) = shared.lock() { state.shutdown = true; state.settings = WatcherSettings::default(); state.revision = state.revision.wrapping_add(1); }
}
#[tauri::command]
pub fn utility_watchers_status(state: State<'_, UtilityState>) -> Result<WatcherStatus, String> { read(&state.watchers) }
#[tauri::command]
pub fn utility_watchers_configure(state: State<'_, UtilityState>, settings: WatcherSettings) -> Result<WatcherStatus, String> { configure(&state.watchers, settings) }

#[cfg(test)]
mod tests {
    use super::*;
    fn app(pid: u32, bundle: &str, windows: u32) -> AppSnapshot { AppSnapshot { pid, bundle_id: bundle.into(), name: bundle.rsplit('.').next().unwrap().into(), windows, policy: "regular".into() } }
    fn watchers(auto_quit: bool, music: bool) -> Watchers {
        let mut state = Watchers::default();
        state.settings = WatcherSettings { auto_quit: AutoQuit { enabled: auto_quit, grace_seconds: 10, excluded_apps: vec!["com.example.keep".into()] }, music_block: MusicBlock { enabled: music, allow_until: None } };
        state
    }
    #[test] fn auto_quit_waits_for_the_grace_period_after_windows_close_and_asks_once() {
        let mut state = watchers(true, false);
        let start = Instant::now();
        assert!(step(&mut state, &[app(10, "com.example.editor", 2)], start, 0, 1).is_empty());
        assert!(step(&mut state, &[app(10, "com.example.editor", 0)], start + Duration::from_secs(1), 0, 1).is_empty());
        let actions = step(&mut state, &[app(10, "com.example.editor", 0)], start + Duration::from_secs(12), 0, 1);
        assert_eq!(actions, vec![Action::Quit { pid: 10, name: "editor".into(), reason: "no windows for 10 seconds".into() }]);
        assert!(step(&mut state, &[app(10, "com.example.editor", 0)], start + Duration::from_secs(30), 0, 1).is_empty());
        assert!(step(&mut state, &[app(10, "com.example.editor", 1)], start + Duration::from_secs(40), 0, 1).is_empty());
        // Windows came back, so the grace period starts over from the next empty reading.
        assert!(step(&mut state, &[app(10, "com.example.editor", 0)], start + Duration::from_secs(60), 0, 1).is_empty());
        assert!(!step(&mut state, &[app(10, "com.example.editor", 0)], start + Duration::from_secs(75), 0, 1).is_empty());
    }
    #[test] fn apps_that_never_showed_windows_excluded_apps_and_system_apps_are_left_alone() {
        let mut state = watchers(true, false);
        let start = Instant::now();
        let apps = [app(20, "com.example.menubar", 0), app(21, "com.example.keep", 0), app(22, "com.apple.finder", 0), app(1, "com.example.self", 0)];
        step(&mut state, &apps, start, 0, 1);
        assert!(step(&mut state, &apps, start + Duration::from_secs(100), 0, 1).is_empty());
        let mut keep = watchers(true, false);
        step(&mut keep, &[app(21, "com.example.keep", 3)], start, 0, 1);
        step(&mut keep, &[app(21, "com.example.keep", 0)], start + Duration::from_secs(1), 0, 1);
        assert!(step(&mut keep, &[app(21, "com.example.keep", 0)], start + Duration::from_secs(100), 0, 1).is_empty());
        let mut accessory = watchers(true, false);
        let mut helper = app(30, "com.example.helper", 1);
        helper.policy = "accessory".into();
        step(&mut accessory, &[helper.clone()], start, 0, 1);
        helper.windows = 0;
        step(&mut accessory, &[helper.clone()], start + Duration::from_secs(1), 0, 1);
        assert!(step(&mut accessory, &[helper], start + Duration::from_secs(100), 0, 1).is_empty());
    }
    #[test] fn music_block_quits_launches_after_enabling_but_not_an_existing_session_or_an_allowance() {
        let mut state = watchers(false, true);
        let now = Instant::now();
        assert!(step(&mut state, &[app(40, "com.apple.Music", 1)], now, 1000, 1).is_empty());
        assert!(step(&mut state, &[app(40, "com.apple.Music", 1)], now, 1001, 1).is_empty());
        assert!(step(&mut state, &[], now, 1002, 1).is_empty());
        assert_eq!(step(&mut state, &[app(41, "com.apple.Music", 1)], now, 1003, 1).len(), 1);
        state.settings.music_block.allow_until = Some(2000);
        assert!(step(&mut state, &[], now, 1004, 1).is_empty());
        assert!(step(&mut state, &[app(42, "com.apple.Music", 1)], now, 1005, 1).is_empty());
        assert!(step(&mut state, &[], now, 2001, 1).is_empty());
        assert_eq!(step(&mut state, &[app(43, "com.apple.Music", 1)], now, 2002, 1).len(), 1);
    }
    #[test] fn settings_are_validated_and_normalized_without_touching_the_bridge() {
        let bad = WatcherSettings { auto_quit: AutoQuit { enabled: false, grace_seconds: 2, excluded_apps: vec![] }, ..WatcherSettings::default() };
        assert!(validate(&bad).is_err());
        let good = validate(&WatcherSettings { auto_quit: AutoQuit { enabled: false, grace_seconds: 30, excluded_apps: vec![" COM.Apple.Safari ".into(), "com.apple.safari".into()] }, ..WatcherSettings::default() }).unwrap();
        assert_eq!(good.auto_quit.excluded_apps, vec!["com.apple.safari"]);
        let shared: SharedWatchers = Arc::new(Mutex::new(Watchers::default()));
        let status = configure(&shared, WatcherSettings::default()).unwrap();
        assert!(!status.active);
        stop(&shared);
        assert!(configure(&shared, WatcherSettings::default()).is_err());
    }
}
