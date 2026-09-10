//! Screen recording through macOS's own `screencapture -v`. One recording at
//! a time, saved to Movies/Rabta, stopped with an interrupt signal so the file
//! is finalized by the system tool. No region is captured without an explicit
//! start, and the recording ends when Rabta quits.
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::State;

use super::UtilityState;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Region { pub x: i64, pub y: i64, pub width: u32, pub height: u32 }
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct RecorderOptions { pub display: Option<u32>, pub region: Option<Region>, pub cursor: bool, pub clicks: bool, pub audio: bool, pub seconds: u32 }
impl Default for RecorderOptions { fn default() -> Self { Self { display: None, region: None, cursor: true, clicks: false, audio: false, seconds: 0 } } }
pub const MAX_SECONDS: u32 = 4 * 3600;

/// The exact `screencapture` arguments. Display and region are exclusive;
/// zero seconds means "until stopped".
pub(super) fn arguments(options: &RecorderOptions, path: &str) -> Result<Vec<String>, String> {
    if options.seconds > MAX_SECONDS { return Err("Limit a recording to four hours or less, or leave it at zero to stop it yourself.".into()); }
    if options.display.is_some() && options.region.is_some() { return Err("Choose a display or a region, not both.".into()); }
    let mut arguments = vec!["-v".to_string(), "-x".to_string()];
    if options.cursor { arguments.push("-C".into()); }
    if options.clicks { arguments.push("-k".into()); }
    if options.audio { arguments.push("-g".into()); }
    if options.seconds > 0 { arguments.push("-V".into()); arguments.push(options.seconds.to_string()); }
    if let Some(display) = options.display {
        if !(1..=16).contains(&display) { return Err("Choose a connected display.".into()); }
        arguments.push("-D".into());
        arguments.push(display.to_string());
    }
    if let Some(region) = &options.region {
        if region.width < 16 || region.height < 16 || region.width > 20_000 || region.height > 20_000 || region.x.abs() > 50_000 || region.y.abs() > 50_000 {
            return Err("Choose a region at least 16 pixels wide and tall.".into());
        }
        arguments.push("-R".into());
        arguments.push(format!("{},{},{},{}", region.x, region.y, region.width, region.height));
    }
    arguments.push(path.to_string());
    Ok(arguments)
}
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Finished { pub path: String, pub bytes: u64, pub seconds: u64, pub ok: bool, pub error: Option<String> }
#[derive(Default)]
pub struct Recorder { child: Option<Child>, path: Option<PathBuf>, started: Option<u64>, options: Option<RecorderOptions>, last: Option<Finished> }
pub type SharedRecorder = Arc<Mutex<Recorder>>;
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecorderStatus { pub recording: bool, pub path: Option<String>, pub started_at: Option<u64>, pub options: Option<RecorderOptions>, pub last: Option<Finished> }

fn finish(recorder: &mut Recorder, error: Option<String>) -> Option<Finished> {
    let path = recorder.path.take()?;
    let started = recorder.started.take().unwrap_or_else(super::now);
    recorder.options = None;
    let bytes = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    let finished = Finished { path: path.to_string_lossy().into_owned(), bytes, seconds: super::now().saturating_sub(started), ok: error.is_none() && bytes > 0, error: error.or_else(|| if bytes == 0 { Some("No recording was saved. Check Screen Recording access for Rabta in System Settings → Privacy & Security.".into()) } else { None }) };
    recorder.last = Some(finished.clone());
    Some(finished)
}
fn status(recorder: &mut Recorder) -> RecorderStatus {
    if let Some(child) = recorder.child.as_mut() {
        if let Ok(Some(exit)) = child.try_wait() {
            recorder.child = None;
            finish(recorder, if exit.success() { None } else { Some("The recording ended early.".into()) });
        }
    }
    RecorderStatus { recording: recorder.child.is_some(), path: recorder.path.as_ref().map(|p| p.to_string_lossy().into_owned()), started_at: recorder.started, options: recorder.options.clone(), last: recorder.last.clone() }
}
pub(super) fn stop_recorder(recorder: &SharedRecorder) {
    if let Ok(mut guard) = recorder.lock() {
        if let Some(mut child) = guard.child.take() {
            let _ = Command::new("/bin/kill").args(["-INT", &child.id().to_string()]).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).status();
            for _ in 0..25 { if child.try_wait().ok().flatten().is_some() { break; } std::thread::sleep(std::time::Duration::from_millis(200)); }
            let _ = child.kill();
            let _ = child.wait();
            finish(&mut guard, None);
        }
    }
}
#[tauri::command]
pub fn utility_recorder_status(state: State<'_, UtilityState>) -> Result<RecorderStatus, String> {
    Ok(status(&mut *state.recorder.lock().map_err(|_| "Recorder state is unavailable.")?))
}
#[tauri::command]
pub fn utility_recorder_start(state: State<'_, UtilityState>, options: RecorderOptions) -> Result<RecorderStatus, String> {
    super::mac_only()?;
    let home = super::apps::home()?;
    let directory = home.join("Movies").join("Rabta");
    std::fs::create_dir_all(&directory).map_err(|e| format!("Could not create Movies/Rabta: {e}"))?;
    let path = directory.join(format!("Rabta-{}.mov", chrono::Local::now().format("%Y-%m-%d %H.%M.%S")));
    let path_text = path.to_str().ok_or("Recording path is not valid UTF-8.")?.to_string();
    let arguments = arguments(&options, &path_text)?;
    let mut recorder = state.recorder.lock().map_err(|_| "Recorder state is unavailable.")?;
    if recorder.child.as_mut().and_then(|c| c.try_wait().ok()).flatten().is_none() && recorder.child.is_some() { return Err("A recording is already running. Stop it first.".into()); }
    let child = Command::new("/usr/sbin/screencapture").args(&arguments).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().map_err(|e| format!("Could not start the recording: {e}"))?;
    recorder.child = Some(child);
    recorder.path = Some(path);
    recorder.started = Some(super::now());
    recorder.options = Some(options);
    Ok(status(&mut recorder))
}
#[tauri::command]
pub async fn utility_recorder_stop(state: State<'_, UtilityState>) -> Result<RecorderStatus, String> {
    let running = state.recorder.lock().map_err(|_| "Recorder state is unavailable.")?.child.is_some();
    if !running { return Err("No recording is running.".into()); }
    let handle = Arc::clone(&state.recorder);
    tauri::async_runtime::spawn_blocking(move || stop_recorder(&handle)).await.map_err(|_| "Stopping the recording failed unexpectedly.")?;
    Ok(status(&mut *state.recorder.lock().map_err(|_| "Recorder state is unavailable.")?))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn arguments_follow_screencapture_flags() {
        let options = RecorderOptions { display: Some(2), region: None, cursor: true, clicks: true, audio: true, seconds: 90 };
        assert_eq!(arguments(&options, "/tmp/out.mov").unwrap(), vec!["-v", "-x", "-C", "-k", "-g", "-V", "90", "-D", "2", "/tmp/out.mov"]);
        let region = RecorderOptions { region: Some(Region { x: -10, y: 20, width: 640, height: 480 }), cursor: false, ..RecorderOptions::default() };
        assert_eq!(arguments(&region, "/tmp/r.mov").unwrap(), vec!["-v", "-x", "-R", "-10,20,640,480", "/tmp/r.mov"]);
    }
    #[test] fn arguments_reject_conflicts_and_bad_geometry() {
        assert!(arguments(&RecorderOptions { display: Some(1), region: Some(Region { x: 0, y: 0, width: 100, height: 100 }), ..RecorderOptions::default() }, "/tmp/x").is_err());
        assert!(arguments(&RecorderOptions { display: Some(0), ..RecorderOptions::default() }, "/tmp/x").is_err());
        assert!(arguments(&RecorderOptions { region: Some(Region { x: 0, y: 0, width: 8, height: 100 }), ..RecorderOptions::default() }, "/tmp/x").is_err());
        assert!(arguments(&RecorderOptions { seconds: MAX_SECONDS + 1, ..RecorderOptions::default() }, "/tmp/x").is_err());
        assert!(serde_json::from_value::<RecorderOptions>(serde_json::json!({"seconds": 5, "shell": "x"})).is_err());
    }
    #[test] fn finishing_without_a_file_reports_a_permission_hint() {
        let mut recorder = Recorder { path: Some(PathBuf::from("/nonexistent/rabta-test.mov")), started: Some(super::super::now() - 5), ..Recorder::default() };
        let finished = finish(&mut recorder, None).unwrap();
        assert!(!finished.ok);
        assert!(finished.error.unwrap().contains("Screen Recording"));
        assert!(finished.seconds >= 5);
        assert!(recorder.path.is_none() && recorder.last.is_some());
    }
}
