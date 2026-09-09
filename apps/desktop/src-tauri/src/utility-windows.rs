//! On-demand macOS window controls. No observers, screen capture, or shell input.
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::{process::Stdio, time::Duration};

const SCRIPT: &str = include_str!("utility-window.js");
const LAYOUTS: &[&str] = &[
    "left", "right", "top-left", "top-right", "bottom-left", "bottom-right",
    "center", "maximize", "left-third", "center-third", "right-third",
    "top-left-sixth", "top-center-sixth", "top-right-sixth",
    "bottom-left-sixth", "bottom-center-sixth", "bottom-right-sixth",
];

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WindowTarget {
    pub pid: u32,
    pub app: String,
    pub index: u32,
    pub title: String,
    pub window_id: Option<u32>,
}
impl WindowTarget {
    fn validate(&self) -> Result<(), String> {
        if self.pid == 0 || self.pid > i32::MAX as u32 || self.index > 999
            || self.app.trim().is_empty() || self.app.len() > 300
            || self.title.len() > 16_384 || self.app.contains('\0')
            || self.title.contains('\0') || self.window_id == Some(0)
        {
            return Err("Refresh the window list and choose an available window.".into());
        }
        Ok(())
    }
    fn same_window(&self, other: &Self) -> bool {
        self.pid == other.pid && self.app == other.app && self.title == other.title
            && match (self.window_id, other.window_id) {
                (Some(a), Some(b)) => a == b,
                (None, None) => self.index == other.index,
                _ => false,
            }
    }
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowRect {
    pub x: f64, pub y: f64, pub width: f64, pub height: f64,
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowDisplay {
    pub id: String,
    pub name: String,
    pub primary: bool,
    pub frame: WindowRect,
    pub visible_frame: WindowRect,
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListedWindow {
    pub target: WindowTarget,
    pub x: f64, pub y: f64, pub width: f64, pub height: f64,
    pub minimized: bool,
    pub app_hidden: bool,
    pub can_close: bool,
    pub display_id: Option<String>,
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowInventory {
    pub windows: Vec<ListedWindow>,
    pub displays: Vec<WindowDisplay>,
    pub warnings: Vec<String>,
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeWindowPlacement {
    pub target: WindowTarget,
    pub app: String,
    pub title: String,
    pub x: f64, pub y: f64, pub width: f64, pub height: f64,
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowActionResult {
    pub action: String,
    pub app: String,
    pub title: String,
}

fn validate_layout(
    target: &WindowTarget,
    layout: &str,
    gap: u32,
    display_id: Option<&str>,
    restore: Option<&NativeWindowPlacement>,
) -> Result<(), String> {
    target.validate()?;
    if !LAYOUTS.contains(&layout) || gap > 64 {
        return Err("Choose a supported layout and a gap between 0 and 64 pixels.".into());
    }
    if let Some(id) = display_id {
        if id.is_empty() || id.len() > 12 || !id.bytes().all(|b| b.is_ascii_digit()) {
            return Err("Refresh the window list and choose a connected display.".into());
        }
    }
    if let Some(saved) = restore {
        saved.target.validate()?;
        if !target.same_window(&saved.target) || saved.app != target.app || saved.title != target.title
            || ![saved.x, saved.y, saved.width, saved.height].iter().all(|n| n.is_finite())
            || saved.width < 1.0 || saved.height < 1.0
            || saved.width > 20_000.0 || saved.height > 20_000.0
            || saved.x.abs() > 50_000.0 || saved.y.abs() > 50_000.0
        {
            return Err("The saved placement does not belong to this window or is invalid.".into());
        }
    }
    Ok(())
}

async fn invoke_script<T: DeserializeOwned>(request: serde_json::Value) -> Result<T, String> {
    if !cfg!(target_os = "macos") {
        return Err("Window controls require the installed Rabta macOS app.".into());
    }
    let json = request.to_string();
    let mut command = tokio::process::Command::new("/usr/bin/osascript");
    command.args(["-l", "JavaScript", "-e", SCRIPT, &json])
        .stdin(Stdio::null()).kill_on_drop(true);
    let output = tokio::time::timeout(Duration::from_secs(30), command.output())
        .await.map_err(|_| "macOS did not respond in time. Refresh the window list and try again.")?
        .map_err(|e| format!("Could not contact macOS: {e}"))?;
    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "macOS could not control this window. Check Rabta's Accessibility and Automation access in System Settings. {}",
            error.chars().take(600).collect::<String>()
        ));
    }
    if output.stdout.len() > 1_000_000 {
        return Err("macOS returned too many windows. Close some windows and try again.".into());
    }
    serde_json::from_slice(&output.stdout)
        .map_err(|_| "macOS returned an unreadable window response. Refresh the window list.".into())
}

/// Returns real AX windows including minimized/hidden apps and connected displays.
#[tauri::command]
pub async fn utility_list_windows() -> Result<WindowInventory, String> {
    invoke_script(serde_json::json!({"operation": "list"})).await
}

/// Explicit close sends the native close-button action; unsaved prompts stay open.
#[tauri::command]
pub async fn utility_window_action(
    target: WindowTarget,
    action: String,
) -> Result<WindowActionResult, String> {
    target.validate()?;
    if !["focus", "minimize", "close"].contains(&action.as_str()) {
        return Err("Choose focus, minimize, or close.".into());
    }
    invoke_script(serde_json::json!({"operation": "action", "target": target, "action": action})).await
}

/// Returns the exact pre-action placement for undo. Omitted display means primary.
#[tauri::command]
pub async fn utility_place_window(
    target: WindowTarget,
    layout: String,
    gap: u32,
    display_id: Option<String>,
    restore: Option<NativeWindowPlacement>,
) -> Result<NativeWindowPlacement, String> {
    validate_layout(&target, &layout, gap, display_id.as_deref(), restore.as_ref())?;
    invoke_script(serde_json::json!({
        "operation": "arrange", "target": target, "layout": layout, "gap": gap,
        "displayId": display_id, "restore": restore
    })).await
}

#[cfg(test)]
mod tests {
    use super::*;
    fn target() -> WindowTarget {
        WindowTarget { pid: 42, app: "TextEdit".into(), index: 0, title: "Draft".into(), window_id: Some(82) }
    }
    fn placement() -> NativeWindowPlacement {
        NativeWindowPlacement { target: target(), app: "TextEdit".into(), title: "Draft".into(),
            x: -1200.0, y: -300.0, width: 800.0, height: 600.0 }
    }
    #[test]
    fn layouts_accept_real_display_ids_and_negative_display_origins() {
        for layout in LAYOUTS {
            assert!(validate_layout(&target(), layout, 64, Some("4294967295"), Some(&placement())).is_ok());
        }
    }
    #[test]
    fn layout_rejects_unknown_actions_large_gaps_and_malformed_displays() {
        assert!(validate_layout(&target(), "constructor", 12, None, None).is_err());
        assert!(validate_layout(&target(), "left", 65, None, None).is_err());
        for id in ["", "../1", "Display 1", "1;rm", "9999999999999"] {
            assert!(validate_layout(&target(), "left", 12, Some(id), None).is_err());
        }
    }
    #[test]
    fn restore_rejects_another_window_or_invalid_geometry() {
        let mut saved = placement();
        saved.target.window_id = Some(83);
        assert!(validate_layout(&target(), "left", 12, None, Some(&saved)).is_err());
        saved = placement();
        saved.x = f64::NAN;
        assert!(validate_layout(&target(), "left", 12, None, Some(&saved)).is_err());
        saved = placement();
        saved.height = 0.0;
        assert!(validate_layout(&target(), "left", 12, None, Some(&saved)).is_err());
    }
    #[test]
    fn stable_window_id_survives_reordered_windows_but_index_fallback_does_not() {
        let mut other = target();
        other.index = 1;
        assert!(target().same_window(&other));
        let mut original = target();
        original.window_id = None;
        other.window_id = None;
        assert!(!original.same_window(&other));
    }
    #[test]
    fn target_validation_rejects_invalid_processes_and_oversized_titles() {
        let mut item = target();
        item.pid = 0;
        assert!(item.validate().is_err());
        item = target();
        item.title = "a".repeat(16_385);
        assert!(item.validate().is_err());
        item = target();
        item.app = "\0".into();
        assert!(item.validate().is_err());
    }
    #[test]
    fn frontend_targets_round_trip_camel_case_without_extra_inputs() {
        let json = serde_json::json!({"pid":42,"app":"TextEdit","index":0,"title":"Draft","windowId":82});
        let parsed: WindowTarget = serde_json::from_value(json.clone()).unwrap();
        assert!(target().same_window(&parsed));
        assert_eq!(serde_json::to_value(parsed).unwrap(), json);
        let invalid = serde_json::json!({"pid":42,"app":"TextEdit","index":0,"title":"Draft","windowId":82,"script":"arbitrary"});
        assert!(serde_json::from_value::<WindowTarget>(invalid).is_err());
    }
}
