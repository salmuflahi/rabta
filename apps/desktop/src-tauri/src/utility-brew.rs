//! Homebrew, driven with explicit commands. The user always sees the exact
//! command that ran and its output. Names are validated before they reach
//! the shell-free `brew` invocation; only one action runs at a time.
use serde::Serialize;
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use tauri::State;

use super::{run_command, UtilityState};

const BREW_LOCATIONS: &[&str] = &["/opt/homebrew/bin/brew", "/usr/local/bin/brew"];
const BREW_ENV: &[(&str, &str)] = &[("HOMEBREW_NO_COLOR", "1"), ("HOMEBREW_NO_EMOJI", "1"), ("HOMEBREW_NO_ENV_HINTS", "1"), ("HOMEBREW_NO_ANALYTICS", "1")];

pub(super) fn brew_path() -> Option<PathBuf> {
    BREW_LOCATIONS.iter().map(PathBuf::from).find(|path| path.is_file())
}
/// Formula and cask names: `wget`, `node@20`, `homebrew/cask/firefox`.
pub(super) fn valid_name(name: &str) -> bool {
    let ok_segment = |segment: &str| !segment.is_empty() && segment.len() <= 100 && !segment.starts_with('-') && !segment.starts_with('.') && segment.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '@' | '.' | '_' | '+' | '-'));
    let segments: Vec<&str> = name.split('/').collect();
    !name.is_empty() && name.len() <= 200 && (1..=3).contains(&segments.len()) && segments.iter().all(|segment| ok_segment(segment))
}
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BrewPackage { pub name: String, pub versions: Vec<String>, pub kind: String }
/// Parses `brew list --versions`: one `name version version…` per line.
pub(super) fn parse_list(text: &str, kind: &str) -> Vec<BrewPackage> {
    text.lines().filter_map(|line| {
        let mut parts = line.split_whitespace();
        let name = parts.next()?;
        if !valid_name(name) { return None; }
        Some(BrewPackage { name: name.to_string(), versions: parts.map(String::from).collect(), kind: kind.to_string() })
    }).collect()
}
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BrewOutdated { pub name: String, pub installed: String, pub current: String, pub kind: String, pub pinned: bool }
/// Parses `brew outdated --json=v2`.
pub(super) fn parse_outdated(json: &str) -> Result<Vec<BrewOutdated>, String> {
    let value: serde_json::Value = serde_json::from_str(json).map_err(|_| "Homebrew returned an unreadable outdated list.")?;
    let mut items = Vec::new();
    for (key, kind) in [("formulae", "formula"), ("casks", "cask")] {
        for entry in value[key].as_array().cloned().unwrap_or_default() {
            let Some(name) = entry["name"].as_str() else { continue };
            if !valid_name(name) { continue; }
            items.push(BrewOutdated {
                name: name.to_string(),
                installed: entry["installed_versions"].as_array().map(|v| v.iter().filter_map(|x| x.as_str()).collect::<Vec<_>>().join(", ")).unwrap_or_default(),
                current: entry["current_version"].as_str().unwrap_or("").to_string(),
                kind: kind.to_string(),
                pinned: entry["pinned"].as_bool().unwrap_or(false),
            });
        }
    }
    Ok(items)
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrewStatus { pub installed: bool, pub path: Option<String>, pub version: Option<String>, pub busy: bool }
#[tauri::command]
pub async fn utility_brew_status(state: State<'_, UtilityState>) -> Result<BrewStatus, String> {
    super::mac_only()?;
    let busy = state.brew_busy.load(Ordering::SeqCst);
    let Some(path) = brew_path() else { return Ok(BrewStatus { installed: false, path: None, version: None, busy }) };
    let version = run_command(&path.to_string_lossy(), &["--version"], BREW_ENV, 30).await.ok().and_then(|c| c.stdout.lines().next().map(|l| l.trim().to_string()));
    Ok(BrewStatus { installed: true, path: Some(path.to_string_lossy().into_owned()), version, busy })
}
#[tauri::command]
pub async fn utility_brew_list(state: State<'_, UtilityState>) -> Result<Vec<BrewPackage>, String> {
    super::mac_only()?;
    if state.brew_busy.load(Ordering::SeqCst) { return Err("A Homebrew action is still running.".into()); }
    let path = brew_path().ok_or("Homebrew is not installed. See brew.sh to install it.")?;
    let brew = path.to_string_lossy().into_owned();
    let (formulae, casks) = tokio::join!(run_command(&brew, &["list", "--formula", "--versions"], BREW_ENV, 120), run_command(&brew, &["list", "--cask", "--versions"], BREW_ENV, 120));
    let mut packages = parse_list(&formulae?.stdout, "formula");
    packages.extend(parse_list(&casks?.stdout, "cask"));
    Ok(packages)
}
/// Outdated packages as update entries, or `None` when Homebrew is absent.
pub(super) async fn outdated_entries() -> Result<Option<Vec<super::apps::UpdateEntry>>, String> {
    let Some(path) = brew_path() else { return Ok(None) };
    let completed = run_command(&path.to_string_lossy(), &["outdated", "--json=v2"], BREW_ENV, 300).await.map_err(|e| format!("Homebrew updates could not be checked. {e}"))?;
    if !completed.success { return Err(format!("Homebrew updates could not be checked. {}", completed.stderr.trim())); }
    Ok(Some(parse_outdated(&completed.stdout)?.into_iter().map(|item| super::apps::UpdateEntry { source: "Homebrew".into(), name: item.name, detail: format!("{} → {}{}", item.installed, item.current, if item.pinned { " (pinned)" } else { "" }) }).collect()))
}
#[tauri::command]
pub async fn utility_brew_outdated(state: State<'_, UtilityState>) -> Result<Vec<BrewOutdated>, String> {
    super::mac_only()?;
    if state.brew_busy.load(Ordering::SeqCst) { return Err("A Homebrew action is still running.".into()); }
    let path = brew_path().ok_or("Homebrew is not installed. See brew.sh to install it.")?;
    let completed = run_command(&path.to_string_lossy(), &["outdated", "--json=v2"], BREW_ENV, 300).await?;
    if !completed.success { return Err(format!("Homebrew could not list outdated packages. {}", completed.stderr.trim())); }
    parse_outdated(&completed.stdout)
}
#[tauri::command]
pub async fn utility_brew_search(state: State<'_, UtilityState>, term: String) -> Result<Vec<BrewPackage>, String> {
    super::mac_only()?;
    if state.brew_busy.load(Ordering::SeqCst) { return Err("A Homebrew action is still running.".into()); }
    if !valid_name(&term) || term.len() > 80 { return Err("Search with a package name like wget or firefox.".into()); }
    let path = brew_path().ok_or("Homebrew is not installed. See brew.sh to install it.")?;
    let brew = path.to_string_lossy().into_owned();
    let formula_args = ["search", "--formula", term.as_str()];
    let cask_args = ["search", "--cask", term.as_str()];
    let (formulae, casks) = tokio::join!(run_command(&brew, &formula_args, BREW_ENV, 120), run_command(&brew, &cask_args, BREW_ENV, 120));
    let mut packages: Vec<BrewPackage> = formulae?.stdout.lines().filter(|l| valid_name(l.trim())).map(|l| BrewPackage { name: l.trim().to_string(), versions: vec![], kind: "formula".into() }).collect();
    packages.extend(casks?.stdout.lines().filter(|l| valid_name(l.trim())).map(|l| BrewPackage { name: l.trim().to_string(), versions: vec![], kind: "cask".into() }));
    packages.truncate(200);
    Ok(packages)
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrewActionResult { pub command: String, pub ok: bool, pub output: String }
/// Builds the exact argument list for an action, or refuses it.
pub(super) fn action_arguments(action: &str, name: Option<&str>, cask: bool) -> Result<Vec<String>, String> {
    let mut arguments: Vec<String> = Vec::new();
    let named = |arguments: &mut Vec<String>, verb: &str| -> Result<(), String> {
        let name = name.ok_or("Choose a package.")?;
        if !valid_name(name) { return Err("That package name is not valid.".into()); }
        arguments.push(verb.into());
        if cask { arguments.push("--cask".into()); }
        arguments.push(name.to_string());
        Ok(())
    };
    match action {
        "install" => named(&mut arguments, "install")?,
        "upgrade" => named(&mut arguments, "upgrade")?,
        "uninstall" => named(&mut arguments, "uninstall")?,
        "upgrade-all" => arguments.push("upgrade".into()),
        "update" => arguments.push("update".into()),
        "cleanup" => arguments.extend(["cleanup".to_string(), "--prune=all".to_string()]),
        _ => return Err("Choose install, upgrade, uninstall, upgrade-all, update or cleanup.".into()),
    }
    Ok(arguments)
}
#[tauri::command]
pub async fn utility_brew_action(state: State<'_, UtilityState>, action: String, name: Option<String>, cask: bool) -> Result<BrewActionResult, String> {
    super::mac_only()?;
    let arguments = action_arguments(&action, name.as_deref(), cask)?;
    let path = brew_path().ok_or("Homebrew is not installed. See brew.sh to install it.")?;
    if state.brew_busy.swap(true, Ordering::SeqCst) { return Err("A Homebrew action is still running. Wait for it to finish.".into()); }
    let brew = path.to_string_lossy().into_owned();
    let references: Vec<&str> = arguments.iter().map(String::as_str).collect();
    let result = run_command(&brew, &references, BREW_ENV, 1800).await;
    state.brew_busy.store(false, Ordering::SeqCst);
    let completed = result?;
    let mut output = format!("{}{}", completed.stdout, if completed.stderr.trim().is_empty() { String::new() } else { format!("\n{}", completed.stderr) });
    if output.len() > 60_000 { let cut = output.len() - 60_000; output = format!("…\n{}", &output[output.char_indices().find(|(i, _)| *i >= cut).map(|(i, _)| i).unwrap_or(0)..]); }
    Ok(BrewActionResult { command: format!("brew {}", arguments.join(" ")), ok: completed.success, output })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn names_follow_homebrew_rules_and_never_start_options() {
        for name in ["wget", "node@20", "homebrew/cask/firefox", "python-tk@3.12", "gcc+lib"] { assert!(valid_name(name), "{name}"); }
        for name in ["", "-rf", "--force", "a b", "a/b/c/d", "../x", ".hidden", "name;rm", "$(x)"] { assert!(!valid_name(name), "{name}"); }
    }
    #[test] fn action_arguments_are_fixed_shapes() {
        assert_eq!(action_arguments("install", Some("wget"), false).unwrap(), vec!["install", "wget"]);
        assert_eq!(action_arguments("uninstall", Some("firefox"), true).unwrap(), vec!["uninstall", "--cask", "firefox"]);
        assert_eq!(action_arguments("upgrade-all", None, false).unwrap(), vec!["upgrade"]);
        assert_eq!(action_arguments("cleanup", None, false).unwrap(), vec!["cleanup", "--prune=all"]);
        assert!(action_arguments("install", Some("--force"), false).is_err());
        assert!(action_arguments("install", None, false).is_err());
        assert!(action_arguments("shell", Some("x"), false).is_err());
    }
    #[test] fn list_and_outdated_output_parse() {
        let packages = parse_list("wget 1.21.4\nnode@20 20.11.0 20.12.0\n\n", "formula");
        assert_eq!(packages.len(), 2);
        assert_eq!(packages[1].versions, vec!["20.11.0", "20.12.0"]);
        let outdated = parse_outdated(r#"{"formulae":[{"name":"wget","installed_versions":["1.21.3"],"current_version":"1.21.4","pinned":false}],"casks":[{"name":"firefox","installed_versions":["120.0"],"current_version":"121.0"}]}"#).unwrap();
        assert_eq!(outdated.len(), 2);
        assert_eq!(outdated[0].installed, "1.21.3");
        assert_eq!(outdated[1].kind, "cask");
        assert!(parse_outdated("not json").is_err());
    }
}
