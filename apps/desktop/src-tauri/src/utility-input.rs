//! Input service configuration. The event tap itself lives in the native
//! bridge; this module owns validation, the shortcut grammar, and the exact
//! JSON the bridge receives. Nothing here runs a shell or persists to disk.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const MAX_SNIPPETS: usize = 200;
const MAX_MAPPINGS: usize = 32;
const MAX_EXCLUSIONS: usize = 100;

// CGEventFlags modifier bits, as CoreGraphics defines them.
const FLAG_SHIFT: u64 = 1 << 17;
const FLAG_CONTROL: u64 = 1 << 18;
const FLAG_OPTION: u64 = 1 << 19;
const FLAG_COMMAND: u64 = 1 << 20;

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct Scroll { pub invert_vertical: bool, pub invert_horizontal: bool }
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct Debounce { pub enabled: bool, pub milliseconds: u32 }
impl Default for Debounce { fn default() -> Self { Self { enabled: false, milliseconds: 50 } } }
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct QuitProtection { pub enabled: bool, pub mode: String, pub hold_milliseconds: u32, pub include_close_window: bool, pub excluded_apps: Vec<String> }
impl Default for QuitProtection { fn default() -> Self { Self { enabled: false, mode: "hold".into(), hold_milliseconds: 1000, include_close_window: false, excluded_apps: vec![] } } }
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct Toggle { pub enabled: bool }
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct FocusFollowsMouse { pub enabled: bool, pub delay_milliseconds: u32 }
impl Default for FocusFollowsMouse { fn default() -> Self { Self { enabled: false, delay_milliseconds: 400 } } }
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ButtonMapping { pub button: u8, pub shortcut: String }
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Snippet { pub trigger: String, pub text: String }
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct InputConfig {
    pub scroll: Scroll,
    pub click_debounce: Debounce,
    pub key_debounce: Debounce,
    pub quit_protection: QuitProtection,
    pub paste_plain: Toggle,
    pub cleaning_mode: Toggle,
    pub focus_follows_mouse: FocusFollowsMouse,
    /// Extra mouse buttons (2 and up) mapped to keyboard shortcuts.
    pub mouse_buttons: Vec<ButtonMapping>,
    /// Buttons 3 and 4 become Back and Forward (Cmd+[ and Cmd+]).
    pub mouse_navigation: bool,
    pub snippets: Vec<Snippet>,
    /// Bundle IDs where the service passes every event through untouched.
    pub excluded_apps: Vec<String>,
}
impl InputConfig {
    pub fn is_active(&self) -> bool {
        self.scroll.invert_vertical || self.scroll.invert_horizontal || self.click_debounce.enabled || self.key_debounce.enabled
            || self.quit_protection.enabled || self.paste_plain.enabled || self.cleaning_mode.enabled || self.focus_follows_mouse.enabled
            || !self.mouse_buttons.is_empty() || self.mouse_navigation || !self.snippets.is_empty()
    }
}

/// A key on the ANSI layout, as macOS virtual key codes number them.
fn key_code(name: &str) -> Option<u16> {
    Some(match name {
        "a" => 0, "s" => 1, "d" => 2, "f" => 3, "h" => 4, "g" => 5, "z" => 6, "x" => 7, "c" => 8, "v" => 9, "b" => 11, "q" => 12,
        "w" => 13, "e" => 14, "r" => 15, "y" => 16, "t" => 17, "1" => 18, "2" => 19, "3" => 20, "4" => 21, "6" => 22, "5" => 23,
        "=" | "equal" => 24, "9" => 25, "7" => 26, "-" | "minus" => 27, "8" => 28, "0" => 29, "]" => 30, "o" => 31, "u" => 32, "[" => 33,
        "i" => 34, "p" => 35, "return" | "enter" => 36, "l" => 37, "j" => 38, "'" | "quote" => 39, "k" => 40, ";" | "semicolon" => 41,
        "\\" | "backslash" => 42, "," | "comma" => 43, "/" | "slash" => 44, "n" => 45, "m" => 46, "." | "period" => 47, "tab" => 48,
        "space" => 49, "`" | "grave" => 50, "delete" | "backspace" => 51, "escape" | "esc" => 53, "f5" => 96, "f6" => 97, "f7" => 98,
        "f3" => 99, "f8" => 100, "f9" => 101, "f11" => 103, "f13" => 105, "f14" => 107, "f10" => 109, "f12" => 111, "f15" => 113,
        "home" => 115, "pageup" => 116, "forwarddelete" => 117, "f4" => 118, "end" => 119, "f2" => 120, "pagedown" => 121, "f1" => 122,
        "left" => 123, "right" => 124, "down" => 125, "up" => 126,
        _ => return None,
    })
}
/// Parses `cmd+shift+4`, `ctrl+left`, `option+space` into a key code and
/// CoreGraphics modifier flags. Modifiers may appear in any order; exactly
/// one non-modifier key is required.
pub fn parse_shortcut(text: &str) -> Result<(u16, u64), String> {
    let mut flags = 0u64;
    let mut key = None;
    let parts: Vec<&str> = text.split('+').map(str::trim).collect();
    if text.trim().is_empty() || parts.len() > 5 || text.len() > 60 { return Err("Write a shortcut like cmd+shift+4 or ctrl+left.".into()); }
    for part in parts {
        let lower = part.to_ascii_lowercase();
        match lower.as_str() {
            "cmd" | "command" | "⌘" => flags |= FLAG_COMMAND,
            "shift" | "⇧" => flags |= FLAG_SHIFT,
            "ctrl" | "control" | "⌃" => flags |= FLAG_CONTROL,
            "opt" | "option" | "alt" | "⌥" => flags |= FLAG_OPTION,
            "" => return Err("Write a shortcut like cmd+shift+4 or ctrl+left.".into()),
            name => {
                if key.replace(key_code(name).ok_or_else(|| format!("“{part}” is not a key this service can send."))?).is_some() {
                    return Err("A shortcut can hold modifiers and one key.".into());
                }
            }
        }
    }
    key.map(|code| (code, flags)).ok_or_else(|| "A shortcut needs a key, for example cmd+[.".into())
}
fn valid_bundle(id: &str) -> bool {
    !id.is_empty() && id.len() <= 255 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
}
fn normalize_bundles(items: &[String]) -> Result<Vec<String>, String> {
    if items.len() > MAX_EXCLUSIONS { return Err("Enter up to 100 application bundle IDs.".into()); }
    let mut result: Vec<String> = Vec::new();
    for item in items {
        let id = item.trim().to_ascii_lowercase();
        if !valid_bundle(&id) { return Err("Enter application bundle IDs like com.apple.Safari, one per line.".into()); }
        if !result.contains(&id) { result.push(id); }
    }
    Ok(result)
}
/// Validates a configuration and produces the exact request the bridge
/// accepts. Every number is clamped by the bridge again; here a value out of
/// range is an error the user can see rather than a silent change.
pub fn native_request(config: &InputConfig) -> Result<Value, String> {
    for (label, debounce) in [("Click", &config.click_debounce), ("Key", &config.key_debounce)] {
        if !(5..=500).contains(&debounce.milliseconds) { return Err(format!("{label} debounce needs a window between 5 and 500 milliseconds.")); }
    }
    if !["hold", "double"].contains(&config.quit_protection.mode.as_str()) { return Err("Quit protection mode must be hold or double.".into()); }
    if !(500..=5000).contains(&config.quit_protection.hold_milliseconds) { return Err("Hold Cmd+Q between 500 and 5000 milliseconds.".into()); }
    if !(100..=5000).contains(&config.focus_follows_mouse.delay_milliseconds) { return Err("Focus delay must be between 100 and 5000 milliseconds.".into()); }
    if config.mouse_buttons.len() > MAX_MAPPINGS { return Err("Map up to 32 mouse buttons.".into()); }
    if config.snippets.len() > MAX_SNIPPETS { return Err("Keep up to 200 expanding snippets.".into()); }
    let mut buttons: Vec<Value> = Vec::new();
    let mut used: Vec<u8> = Vec::new();
    if config.mouse_navigation {
        buttons.push(json!({"button": 3, "keyCode": 33, "flags": FLAG_COMMAND}));
        buttons.push(json!({"button": 4, "keyCode": 30, "flags": FLAG_COMMAND}));
        used.extend([3, 4]);
    }
    for mapping in &config.mouse_buttons {
        if !(2..32).contains(&mapping.button) { return Err("Mouse buttons 2 to 31 can be mapped; the primary and secondary buttons cannot.".into()); }
        if used.contains(&mapping.button) { return Err(format!("Mouse button {} is mapped twice.", mapping.button)); }
        let (key, flags) = parse_shortcut(&mapping.shortcut)?;
        used.push(mapping.button);
        buttons.push(json!({"button": mapping.button, "keyCode": key, "flags": flags}));
    }
    let mut snippets: Vec<Value> = Vec::new();
    let mut triggers: Vec<&str> = Vec::new();
    for snippet in &config.snippets {
        let trigger = snippet.trigger.trim();
        if trigger.chars().count() < 2 || trigger.chars().count() > 32 || trigger.chars().any(char::is_whitespace) || trigger.chars().any(char::is_control) {
            return Err("Each trigger needs 2 to 32 characters with no spaces, for example ;sig.".into());
        }
        if snippet.text.is_empty() || snippet.text.len() > 20_000 { return Err(format!("The expansion for {trigger} must hold 1 to 20,000 characters.")); }
        if triggers.iter().any(|existing| existing.ends_with(trigger) || trigger.ends_with(existing)) { return Err(format!("The trigger {trigger} overlaps another trigger.")); }
        triggers.push(trigger);
        snippets.push(json!({"trigger": trigger, "text": snippet.text}));
    }
    Ok(json!({
        "scroll": {"invertVertical": config.scroll.invert_vertical, "invertHorizontal": config.scroll.invert_horizontal},
        "clickDebounce": {"enabled": config.click_debounce.enabled, "milliseconds": config.click_debounce.milliseconds},
        "keyDebounce": {"enabled": config.key_debounce.enabled, "milliseconds": config.key_debounce.milliseconds},
        "quitProtection": {
            "enabled": config.quit_protection.enabled, "mode": config.quit_protection.mode, "holdMilliseconds": config.quit_protection.hold_milliseconds,
            "includeCloseWindow": config.quit_protection.include_close_window, "excludedApps": normalize_bundles(&config.quit_protection.excluded_apps)?,
        },
        "pastePlain": {"enabled": config.paste_plain.enabled},
        "cleaningMode": {"enabled": config.cleaning_mode.enabled},
        "focusFollowsMouse": {"enabled": config.focus_follows_mouse.enabled, "delayMilliseconds": config.focus_follows_mouse.delay_milliseconds},
        "mouseButtons": buttons,
        "snippets": snippets,
        "excludedApps": normalize_bundles(&config.excluded_apps)?,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn shortcuts_parse_modifiers_in_any_order_and_reject_nonsense() {
        assert_eq!(parse_shortcut("cmd+["), Ok((33, FLAG_COMMAND)));
        assert_eq!(parse_shortcut("Shift + Cmd + 4"), Ok((21, FLAG_COMMAND | FLAG_SHIFT)));
        assert_eq!(parse_shortcut("ctrl+left"), Ok((123, FLAG_CONTROL)));
        assert_eq!(parse_shortcut("option+space"), Ok((49, FLAG_OPTION)));
        assert!(parse_shortcut("cmd").is_err());
        assert!(parse_shortcut("a+b").is_err());
        assert!(parse_shortcut("cmd+f16").is_err());
        assert!(parse_shortcut("").is_err());
        assert!(parse_shortcut("cmd++a").is_err());
    }
    #[test] fn default_configuration_is_inactive_and_serializes_camel_case() {
        let config = InputConfig::default();
        assert!(!config.is_active());
        let value = serde_json::to_value(&config).unwrap();
        assert_eq!(value["quitProtection"]["holdMilliseconds"], 1000);
        assert_eq!(value["focusFollowsMouse"]["delayMilliseconds"], 400);
        let parsed: InputConfig = serde_json::from_value(json!({"scroll": {"invertVertical": true}})).unwrap();
        assert!(parsed.is_active());
        assert!(serde_json::from_value::<InputConfig>(json!({"scroll": {"invertVertical": true}, "script": "x"})).is_err());
    }
    #[test] fn native_request_applies_navigation_preset_and_rejects_conflicts() {
        let mut config = InputConfig { mouse_navigation: true, ..InputConfig::default() };
        let request = native_request(&config).unwrap();
        assert_eq!(request["mouseButtons"].as_array().unwrap().len(), 2);
        assert_eq!(request["mouseButtons"][0]["keyCode"], 33);
        config.mouse_buttons.push(ButtonMapping { button: 3, shortcut: "cmd+c".into() });
        assert!(native_request(&config).unwrap_err().contains("mapped twice"));
        config.mouse_buttons = vec![ButtonMapping { button: 1, shortcut: "cmd+c".into() }];
        assert!(native_request(&config).is_err());
        config.mouse_buttons = vec![ButtonMapping { button: 5, shortcut: "cmd+c".into() }];
        let request = native_request(&config).unwrap();
        assert_eq!(request["mouseButtons"][2]["button"], 5);
        assert_eq!(request["mouseButtons"][2]["keyCode"], 8);
    }
    #[test] fn snippets_need_distinct_non_overlapping_triggers() {
        let mut config = InputConfig::default();
        config.snippets = vec![Snippet { trigger: ";sig".into(), text: "Best,\nSam".into() }, Snippet { trigger: ";date".into(), text: "{date}".into() }];
        let request = native_request(&config).unwrap();
        assert_eq!(request["snippets"].as_array().unwrap().len(), 2);
        config.snippets.push(Snippet { trigger: "sig".into(), text: "x".into() });
        assert!(native_request(&config).unwrap_err().contains("overlaps"));
        config.snippets = vec![Snippet { trigger: "a".into(), text: "x".into() }];
        assert!(native_request(&config).is_err());
        config.snippets = vec![Snippet { trigger: "a b".into(), text: "x".into() }];
        assert!(native_request(&config).is_err());
        config.snippets = vec![Snippet { trigger: ";e".into(), text: String::new() }];
        assert!(native_request(&config).is_err());
    }
    #[test] fn ranges_and_bundle_ids_are_checked_before_the_bridge_sees_them() {
        let mut config = InputConfig::default();
        config.click_debounce.milliseconds = 4;
        assert!(native_request(&config).unwrap_err().contains("Click debounce"));
        config.click_debounce.milliseconds = 50;
        config.quit_protection.mode = "triple".into();
        assert!(native_request(&config).is_err());
        config.quit_protection.mode = "double".into();
        config.excluded_apps = vec!["com.apple.Safari".into(), " COM.APPLE.SAFARI ".into(), "com.example.app".into()];
        let request = native_request(&config).unwrap();
        assert_eq!(request["excludedApps"], json!(["com.apple.safari", "com.example.app"]));
        config.excluded_apps = vec!["not a bundle/id".into()];
        assert!(native_request(&config).is_err());
    }
}
