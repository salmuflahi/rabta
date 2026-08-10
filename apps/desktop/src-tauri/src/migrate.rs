//! Migrate — the desktop half.
//!
//! `rabta-db` owns the bundle format and every question the database can
//! answer. This module owns the two things it can't: the filesystem (where
//! the bundle is written, whether a repository folder is actually here) and
//! the machine (whether the app a capsule was captured with is installed).
//!
//! **Only the encrypted-file transport exists.** The handoff also draws a
//! "Nearby Mac" transport — a six-digit code over Wi-Fi. It is deliberately
//! not built: it would be the first thing in this app that sends your data
//! over a network, and the product's own positioning line is "Talks to
//! Rabta on this Mac only — nothing leaves it". That is a product decision,
//! not a design one, and it is recorded in the Phase 3 plan rather than
//! quietly made here. The UI shows the card disabled with the reason.

use std::path::{Path, PathBuf};

use rabta_db::{
    seal, unseal, ApplyOutcome, ApplyPlan, Bundle, Include, InspectReport, Survey,
};
use serde::Serialize;
use tauri::State;

use crate::DbHandle;

/// Where a written bundle ended up, and how big it is — the File step shows
/// both, and "≈ 1.2 MB" has to be the real number.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub path: String,
    pub bytes: u64,
}

/// `InspectReport` plus the answers only this machine can give.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectResult {
    #[serde(flatten)]
    pub report: InspectReport,
    /// Per app kind: is it installed on this Mac? The review step's amber
    /// case — "Capsules that used Cursor will restore everything else and
    /// leave that part alone."
    pub apps_installed: Vec<AppInstalled>,
    /// Per repository: is that folder actually here, at the remapped path?
    pub repos_present: Vec<RepoPresent>,
    /// This Mac's home, offered as the remap target.
    pub this_home: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInstalled {
    pub kind: String,
    pub capsules: u32,
    pub label: String,
    /// `None` when this build has no way to check for that kind, which is
    /// not the same as "not installed" and must not be rendered as absent.
    pub installed: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoPresent {
    pub name: String,
    pub path: String,
    pub branch: String,
    pub present: bool,
}

/// Where each connector kind's app lives when installed. Git and terminal
/// are absent on purpose: git is not an app bundle, and Terminal is part of
/// macOS — reporting either as "not installed" would be wrong.
fn app_bundles(kind: &str) -> Option<(&'static str, &'static [&'static str])> {
    match kind {
        "vscode" => Some(("VS Code", &["/Applications/Visual Studio Code.app"])),
        "cursor" => Some(("Cursor", &["/Applications/Cursor.app"])),
        "chrome" => Some((
            "Chrome",
            &["/Applications/Google Chrome.app", "/Applications/Chromium.app"],
        )),
        _ => None,
    }
}

fn friendly_kind(kind: &str) -> String {
    match kind {
        "vscode" => "VS Code".into(),
        "cursor" => "Cursor".into(),
        "chrome" => "Chrome".into(),
        "git" => "Git".into(),
        "terminal" => "Terminal".into(),
        other => {
            let mut c = other.chars();
            match c.next() {
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                None => other.into(),
            }
        }
    }
}

fn this_home() -> Option<String> {
    std::env::var("HOME").ok().filter(|h| !h.is_empty())
}

/// Real counts for the "What comes across" step.
#[tauri::command]
pub async fn migrate_survey(db: State<'_, DbHandle>) -> Result<Survey, String> {
    let db = db.0.clone();
    tauri::async_runtime::spawn_blocking(move || db.migrate_survey().map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

/// This Mac's home directory, offered as the remap target on Receive and
/// recorded on Send so the other Mac knows what to remap *from*.
#[tauri::command]
pub fn migrate_home() -> Option<String> {
    this_home()
}

/// Writes an encrypted bundle. Returns where it landed and how big it is.
#[tauri::command]
pub async fn migrate_export(
    db: State<'_, DbHandle>,
    path: String,
    passphrase: String,
    include: Include,
    preferences: Option<String>,
) -> Result<ExportResult, String> {
    if passphrase.trim().is_empty() {
        // The whole promise of the File step is that the bundle is
        // unreadable without a passphrase. An empty one would make that
        // sentence false while still printing it.
        return Err("Choose a passphrase — without one the bundle isn't protected.".into());
    }
    let db = db.0.clone();
    let home = this_home();
    tauri::async_runtime::spawn_blocking(move || {
        let bundle = db
            .export_bundle(include, home, preferences)
            .map_err(|e| e.to_string())?;
        let json = serde_json::to_vec(&bundle).map_err(|e| e.to_string())?;
        let sealed = seal(&json, &passphrase).map_err(|e| e.to_string())?;

        let path = with_extension(&path);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::write(&path, &sealed).map_err(|e| e.to_string())?;
        Ok(ExportResult {
            path: path.to_string_lossy().into_owned(),
            bytes: sealed.len() as u64,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

fn with_extension(path: &str) -> PathBuf {
    let p = PathBuf::from(path);
    if p.extension().and_then(|e| e.to_str()) == Some("rabta") {
        p
    } else {
        p.with_extension("rabta")
    }
}

fn read_bundle(path: &str, passphrase: &str) -> Result<Bundle, String> {
    let sealed = std::fs::read(path).map_err(|e| format!("could not read that file: {e}"))?;
    let json = unseal(&sealed, passphrase).map_err(|e| e.to_string())?;
    let bundle: Bundle = serde_json::from_slice(&json)
        .map_err(|_| "that file opened, but it is not a Rabta bundle".to_string())?;
    bundle.check_readable().map_err(|e| e.to_string())?;
    Ok(bundle)
}

/// Opens a bundle and reports everything the review step shows. Writes
/// nothing to the database and nothing to disk.
#[tauri::command]
pub async fn migrate_inspect(
    db: State<'_, DbHandle>,
    path: String,
    passphrase: String,
    new_home: Option<String>,
) -> Result<InspectResult, String> {
    let db = db.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let bundle = read_bundle(&path, &passphrase)?;
        let home = new_home.or_else(this_home);
        let report = db
            .inspect_bundle(&bundle, home.as_deref())
            .map_err(|e| e.to_string())?;

        let apps_installed = report
            .apps
            .iter()
            .map(|a| {
                let (label, installed) = match app_bundles(&a.kind) {
                    Some((label, paths)) => (
                        label.to_string(),
                        Some(paths.iter().any(|p| Path::new(p).exists())),
                    ),
                    // No way to check — Git isn't an app bundle, Terminal
                    // ships with macOS, and an unknown kind is unknown.
                    // `None` renders as "can't tell", never as absent.
                    None => (friendly_kind(&a.kind), None),
                };
                AppInstalled {
                    kind: a.kind.clone(),
                    capsules: a.capsules,
                    label,
                    installed,
                }
            })
            .collect();

        let repos_present = report
            .repos
            .iter()
            .map(|r| RepoPresent {
                name: r.name.clone(),
                path: r.path.clone(),
                branch: r.branch.clone(),
                present: Path::new(&r.path).is_dir(),
            })
            .collect();

        Ok(InspectResult {
            report,
            apps_installed,
            repos_present,
            this_home: this_home(),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Applies a reviewed bundle. Returns what actually happened, so Done can
/// report it rather than assert it.
#[tauri::command]
pub async fn migrate_apply(
    db: State<'_, DbHandle>,
    path: String,
    passphrase: String,
    plan: ApplyPlan,
) -> Result<ApplyOutcome, String> {
    let db = db.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let bundle = read_bundle(&path, &passphrase)?;
        db.apply_bundle(&bundle, &plan).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// The preference blob a received bundle carried, if it had one. Returned
/// separately from `migrate_apply` because preferences live in the
/// frontend's localStorage — the Rust side has no business writing them,
/// it just hands the string back for the frontend to install.
#[tauri::command]
pub async fn migrate_preferences(path: String, passphrase: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let bundle = read_bundle(&path, &passphrase)?;
        Ok(bundle.preferences)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds_the_extension_without_doubling_it() {
        assert_eq!(with_extension("/tmp/mine"), PathBuf::from("/tmp/mine.rabta"));
        assert_eq!(
            with_extension("/tmp/mine.rabta"),
            PathBuf::from("/tmp/mine.rabta")
        );
    }

    // Git is not an app bundle and Terminal ships with macOS. Reporting
    // either as "not installed" would send the user hunting for a download
    // that doesn't exist.
    #[test]
    fn does_not_claim_git_or_terminal_are_missing() {
        assert!(app_bundles("git").is_none());
        assert!(app_bundles("terminal").is_none());
        assert!(app_bundles("vscode").is_some());
    }

    #[test]
    fn names_unknown_kinds_readably() {
        assert_eq!(friendly_kind("vscode"), "VS Code");
        assert_eq!(friendly_kind("zed"), "Zed");
    }
}
