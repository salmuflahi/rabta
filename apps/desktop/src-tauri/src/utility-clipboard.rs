use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{collections::HashSet, sync::{Arc, Mutex}, thread, time::{Duration, Instant}};

const DEFAULT_EXCLUSIONS: &[&str] = &[
    "com.1password.1password", "com.agilebits.onepassword7", "com.bitwarden.desktop",
    "com.apple.keychainaccess", "com.lastpass.LastPass", "com.dashlane.Dashlane",
];
const MAX_ENTRIES: usize = 100;
const MAX_TEXT_BYTES: usize = 32_768;
const MAX_TOTAL_BYTES: usize = 2_000_000;
const MAX_CUSTOM_EXCLUSIONS: usize = 100;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry { pub id: String, pub text: String, pub frontmost_app: String, pub captured_at: u64, pub pinned: bool }
struct Stored { entry: Entry, captured: Instant }
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings { pub enabled: bool, pub paused: bool, pub retention_hours: u32, pub excluded_apps: Vec<String> }
impl Default for Settings {
    fn default() -> Self { Self { enabled: false, paused: false, retention_hours: 1, excluded_apps: DEFAULT_EXCLUSIONS.iter().map(|s| s.to_string()).collect() } }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot { pub settings: Settings, pub entries: Vec<Entry>, pub error: Option<String> }
pub struct History { settings: Settings, entries: Vec<Stored>, last_change: i64, revision: u64, worker_started: bool, shutdown: bool, error: Option<String> }
impl Default for History {
    fn default() -> Self { Self { settings: Settings::default(), entries: vec![], last_change: -1, revision: 0, worker_started: false, shutdown: false, error: None } }
}
pub type SharedHistory = Arc<Mutex<History>>;

fn validate(settings: &Settings) -> Result<(), String> {
    if ![1, 8, 24].contains(&settings.retention_hours) { return Err("Choose retention of 1, 8, or 24 hours.".into()); }
    let custom_count = settings.excluded_apps.iter().filter(|id| !DEFAULT_EXCLUSIONS.iter().any(|default| default.eq_ignore_ascii_case(id))).count();
    if custom_count > MAX_CUSTOM_EXCLUSIONS || settings.excluded_apps.len() > MAX_CUSTOM_EXCLUSIONS + DEFAULT_EXCLUSIONS.len() || settings.excluded_apps.iter().any(|s| s.len() > 255 || s.is_empty() || !s.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')) {
        return Err("Enter up to 100 custom application bundle IDs, one per line (for example com.apple.Safari). Protected password-manager exclusions are added separately.".into());
    }
    Ok(())
}
fn normalize(mut settings: Settings) -> Result<Settings, String> {
    // Bound work before deduplicating; saved 100-custom-plus-default settings
    // remain valid when sent back unchanged by pause/resume or later edits.
    if settings.excluded_apps.len() > 400 { return Err("Enter up to 100 custom application bundle IDs.".into()); }
    let mut seen = HashSet::new();
    settings.excluded_apps = settings.excluded_apps.into_iter().chain(DEFAULT_EXCLUSIONS.iter().map(|id| (*id).to_string()))
        .map(|id| id.trim().to_ascii_lowercase()).filter(|id| seen.insert(id.clone())).collect();
    validate(&settings)?;
    Ok(settings)
}
fn prune(history: &mut History) {
    let retention = Duration::from_secs(u64::from(history.settings.retention_hours) * 3600);
    history.entries.retain(|entry| entry.captured.elapsed() < retention);
    while history.entries.len() > MAX_ENTRIES || history.entries.iter().map(|e| e.entry.text.len()).sum::<usize>() > MAX_TOTAL_BYTES {
        let index = history.entries.iter().rposition(|e| !e.entry.pinned).unwrap_or(history.entries.len() - 1);
        history.entries.remove(index);
    }
}
fn snapshot(history: &mut History) -> Snapshot {
    prune(history);
    let mut entries: Vec<_> = history.entries.iter().map(|s| s.entry.clone()).collect();
    entries.sort_by_key(|entry| !entry.pinned);
    Snapshot { settings: history.settings.clone(), entries, error: history.error.clone() }
}
fn record(history: &mut History, text: String, app: String) {
    if text.trim().is_empty() || text.len() > MAX_TEXT_BYTES || app.is_empty() { return; }
    if history.settings.excluded_apps.iter().any(|excluded| excluded.eq_ignore_ascii_case(&app)) { return; }
    if history.entries.first().is_some_and(|e| e.entry.text == text) { return; }
    history.entries.insert(0, Stored { entry: Entry { id: uuid::Uuid::new_v4().to_string(), text, frontmost_app: app, captured_at: super::now(), pinned: false }, captured: Instant::now() });
    prune(history);
}
pub fn read(shared: &SharedHistory) -> Result<Snapshot, String> {
    let mut history = shared.lock().map_err(|_| "Clipboard history is unavailable.")?;
    Ok(snapshot(&mut history))
}
pub fn configure(shared: &SharedHistory, settings: Settings, update_preferences: bool) -> Result<Snapshot, String> {
    // Revoking collection must never depend on valid unrelated preferences or
    // a working native API. Preserve the last valid preferences for later use.
    if !settings.enabled || settings.paused {
        let mut history = shared.lock().map_err(|_| "Clipboard history is unavailable.")?;
        history.revision = history.revision.wrapping_add(1);
        history.error = None;
        if !settings.enabled { history.settings.enabled = false; history.settings.paused = false; history.entries.clear(); }
        else {
            if history.settings.enabled { history.settings.paused = true; }
            // A settings save is distinct from the unconditional safety toggle.
            // Apply valid preferences without reading any clipboard content or
            // counters. An invalid save reports failure but keeps collection paused.
            if update_preferences {
                match normalize(settings) {
                    Ok(mut normalized) => {
                        normalized.enabled = history.settings.enabled;
                        normalized.paused = history.settings.enabled;
                        history.settings = normalized;
                    }
                    Err(error) => {
                        history.error = Some("History is paused. The changed preferences were not saved.".into());
                        return Err(format!("History is paused. Preferences were not saved: {error}"));
                    }
                }
            }
        }
        return Ok(snapshot(&mut history));
    }
    super::mac_only()?;
    let settings = normalize(settings)?;
    let revision = { let history = shared.lock().map_err(|_| "Clipboard history is unavailable.")?; if history.shutdown { return Err("The clipboard service is shutting down.".into()); } history.revision };
    // Inspect the counter only: do not import the clipboard that predates consent.
    let baseline = super::native::call("clipboardSnapshot", json!({"baselineOnly": true}))?;
    let mut history = shared.lock().map_err(|_| "Clipboard history is unavailable.")?;
    if history.revision != revision || history.shutdown { return Err("History settings changed while the action was running. Review the current state and try again.".into()); }
    history.revision = history.revision.wrapping_add(1);
    history.last_change = baseline["changeCount"].as_i64().ok_or("Could not establish a clipboard baseline. History was not enabled.")?;
    history.settings = settings;
    history.error = None;
    if !history.settings.enabled { history.entries.clear(); }
    if history.settings.enabled && !history.worker_started {
        history.worker_started = true;
        let shared = Arc::clone(shared);
        // One worker belongs to UtilityState. Pause skips clipboard reads, and
        // shutdown clears entries and terminates the worker within one interval.
        thread::spawn(move || loop {
            thread::sleep(Duration::from_millis(500));
            let (settings, last_change, revision) = {
                let Ok(mut history) = shared.lock() else { break };
                if history.shutdown || !history.settings.enabled { history.worker_started = false; break; }
                prune(&mut history);
                if history.settings.paused { continue; }
                (history.settings.clone(), history.last_change, history.revision)
            };
            let value = super::native::call("clipboardSnapshot", json!({"lastChange": last_change, "excludedApps": settings.excluded_apps}));
            let Ok(mut history) = shared.lock() else { break };
            // Ignore an in-flight read after pause, disable, clear, or settings changes.
            if revision != history.revision || !history.settings.enabled || history.settings.paused || history.shutdown { continue; }
            match value {
                Ok(value) => {
                    history.error = None;
                    if let Some(count) = value["changeCount"].as_i64() { history.last_change = count; }
                    if let (Some(text), Some(app)) = (value["text"].as_str(), value["frontmostApp"].as_str()) { record(&mut history, text.into(), app.into()); }
                }
                Err(error) => { history.error = Some(error); history.settings.paused = true; }
            }
        });
    }
    Ok(snapshot(&mut history))
}
pub fn change(shared: &SharedHistory, action: &str, id: Option<&str>) -> Result<Snapshot, String> {
    let mut history = shared.lock().map_err(|_| "Clipboard history is unavailable.")?;
    prune(&mut history);
    match action {
        "clear" => {
            history.entries.clear(); history.revision = history.revision.wrapping_add(1);
            if history.settings.enabled {
                match super::native::call("clipboardSnapshot", json!({"baselineOnly":true})) {
                    Ok(value) if value["changeCount"].as_i64().is_some() => history.last_change = value["changeCount"].as_i64().unwrap(),
                    _ => { history.settings.paused = true; history.error = Some("History was cleared and paused because its clipboard baseline could not be refreshed.".into()); }
                }
            }
        }
        "pin" | "delete" | "copy" => {
            let index = history.entries.iter().position(|entry| Some(entry.entry.id.as_str()) == id).ok_or("This entry expired or was removed. Refresh the history.")?;
            match action {
                "pin" => history.entries[index].entry.pinned = !history.entries[index].entry.pinned,
                "delete" => { history.entries.remove(index); },
                "copy" => {
                    let result = super::native::call("clipboardWrite", json!({"text": history.entries[index].entry.text}))?;
                    history.last_change = result["changeCount"].as_i64().unwrap_or(history.last_change);
                    history.revision = history.revision.wrapping_add(1);
                }
                _ => unreachable!(),
            }
        }
        _ => return Err("Unknown clipboard action.".into()),
    }
    Ok(snapshot(&mut history))
}
pub fn stop(shared: &SharedHistory) {
    if let Ok(mut history) = shared.lock() { history.shutdown = true; history.entries.clear(); history.settings.enabled = false; history.revision = history.revision.wrapping_add(1); }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn history_is_opt_in_and_bounded() {
        let mut h = History::default();
        assert!(!h.settings.enabled);
        for n in 0..110 { record(&mut h, format!("Entry {n}"), "com.example.Editor".into()); }
        assert_eq!(h.entries.len(), 100);
        record(&mut h, "secret".into(), "com.1password.1password".into());
        record(&mut h, "x".repeat(MAX_TEXT_BYTES + 1), "com.example.Editor".into());
        assert_eq!(h.entries[0].entry.text, "Entry 109");
    }
    #[test] fn retention_applies_to_pinned_entries_and_clear_invalidates_reads() {
        let shared = Arc::new(Mutex::new(History::default()));
        { let mut h = shared.lock().unwrap(); record(&mut h, "Pinned".into(), "com.example.Editor".into()); h.entries[0].entry.pinned = true; h.entries[0].captured = Instant::now() - Duration::from_secs(3601); }
        assert!(read(&shared).unwrap().entries.is_empty());
        change(&shared, "clear", None).unwrap();
        assert_eq!(shared.lock().unwrap().revision, 1);
    }
    #[test] fn malformed_settings_do_not_enable_history() {
        let mut settings = Settings::default(); settings.retention_hours = 0; assert!(validate(&settings).is_err());
        settings.retention_hours = 1; settings.excluded_apps = vec!["$(bad)".into()]; assert!(validate(&settings).is_err());
    }
    #[test] fn maximum_custom_exclusions_round_trip_with_protected_defaults() {
        let mut settings = Settings::default();
        settings.excluded_apps = (0..MAX_CUSTOM_EXCLUSIONS).map(|n| format!("com.example.app{n}")).collect();
        let saved = normalize(settings).unwrap();
        assert_eq!(saved.excluded_apps.len(), MAX_CUSTOM_EXCLUSIONS + DEFAULT_EXCLUSIONS.len());
        let again = normalize(saved.clone()).unwrap();
        assert_eq!(saved.excluded_apps, again.excluded_apps);
        let mut duplicate = again; duplicate.excluded_apps.push("COM.1PASSWORD.1PASSWORD".into());
        assert_eq!(normalize(duplicate).unwrap().excluded_apps.len(), MAX_CUSTOM_EXCLUSIONS + DEFAULT_EXCLUSIONS.len());
    }
    #[test] fn pause_and_disable_ignore_invalid_preferences_and_need_no_native_api() {
        let shared = Arc::new(Mutex::new(History::default()));
        { let mut history = shared.lock().unwrap(); history.settings.enabled = true; record(&mut history, "Remembered text".into(), "com.example.Editor".into()); }
        let invalid = Settings { enabled: true, paused: true, retention_hours: 0, excluded_apps: vec!["invalid/path".into(); 500] };
        let paused = configure(&shared, invalid.clone(), false).unwrap();
        assert!(paused.settings.enabled && paused.settings.paused);
        assert_eq!(paused.settings.retention_hours, 1);
        assert_eq!(paused.entries.len(), 1);
        let disabled = configure(&shared, Settings { enabled: false, ..invalid }, false).unwrap();
        assert!(!disabled.settings.enabled);
        assert!(disabled.entries.is_empty());
        stop(&shared);
        assert!(shared.lock().unwrap().shutdown);
    }
    #[test] fn paused_preference_saves_apply_valid_changes_and_report_invalid_changes() {
        let shared = Arc::new(Mutex::new(History::default()));
        { let mut history = shared.lock().unwrap(); history.settings.enabled = true; history.settings.paused = true; }
        let settings = Settings { enabled: true, paused: true, retention_hours: 8, excluded_apps: vec!["com.example.Editor".into()] };
        let saved = configure(&shared, settings.clone(), true).unwrap();
        assert!(saved.settings.enabled && saved.settings.paused);
        assert_eq!(saved.settings.retention_hours, 8);
        assert!(saved.settings.excluded_apps.iter().any(|id| id == "com.example.editor"));
        assert_eq!(shared.lock().unwrap().last_change, -1); // No native counter read.
        let error = configure(&shared, Settings { retention_hours: 0, ..settings }, true).err().unwrap();
        assert!(error.contains("not saved"));
        let unchanged = read(&shared).unwrap();
        assert!(unchanged.settings.paused);
        assert_eq!(unchanged.settings.retention_hours, 8);
    }
}
