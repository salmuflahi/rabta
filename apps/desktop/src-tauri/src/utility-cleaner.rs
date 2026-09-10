//! Reviewed cleanup of regenerable files. Every category is a fixed folder
//! under the home directory; the scan lists what is there with sizes, and
//! removal accepts only paths that the scan could have produced. Nothing is
//! scheduled, nothing runs in the background, and nothing outside the listed
//! roots can be touched.
use serde::Serialize;
use std::path::{Path, PathBuf};

use super::apps::{directory_size, home};

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Mode { Children, Whole, Installers }
#[derive(Debug)]
pub struct Category { pub id: &'static str, pub label: &'static str, pub description: &'static str, pub relative: &'static str, pub mode: Mode, pub permanent_only: bool }
pub const CATEGORIES: &[Category] = &[
    Category { id: "caches", label: "App caches", description: "Files apps rebuild on demand. Removing them can make the next launch slower.", relative: "Library/Caches", mode: Mode::Children, permanent_only: false },
    Category { id: "logs", label: "Logs and diagnostic reports", description: "Text logs and crash reports. Keep any you still need for support.", relative: "Library/Logs", mode: Mode::Children, permanent_only: false },
    Category { id: "xcode-derived", label: "Xcode DerivedData", description: "Build products Xcode recreates on the next build.", relative: "Library/Developer/Xcode/DerivedData", mode: Mode::Children, permanent_only: false },
    Category { id: "simulator-caches", label: "Simulator caches", description: "Caches for iOS and other simulators.", relative: "Library/Developer/CoreSimulator/Caches", mode: Mode::Children, permanent_only: false },
    Category { id: "npm-cache", label: "npm cache", description: "Downloaded packages npm re-fetches when needed.", relative: ".npm/_cacache", mode: Mode::Whole, permanent_only: false },
    Category { id: "cargo-cache", label: "Cargo registry cache", description: "Downloaded crates Cargo re-fetches when needed.", relative: ".cargo/registry/cache", mode: Mode::Whole, permanent_only: false },
    Category { id: "gradle-cache", label: "Gradle caches", description: "Downloaded dependencies Gradle re-fetches when needed.", relative: ".gradle/caches", mode: Mode::Whole, permanent_only: false },
    Category { id: "installers", label: "Installers in Downloads", description: "Disk images and installer packages already in Downloads. Only these file types are listed.", relative: "Downloads", mode: Mode::Installers, permanent_only: false },
    Category { id: "trash", label: "Trash", description: "Items already in the Trash. Removing them here deletes them permanently.", relative: ".Trash", mode: Mode::Children, permanent_only: true },
];
const INSTALLER_EXTENSIONS: &[&str] = &["dmg", "pkg", "mpkg", "iso"];
const SCAN_BUDGET: usize = 600_000;
const MAX_ENTRIES: usize = 400;

pub(super) fn category(id: &str) -> Option<&'static Category> { CATEGORIES.iter().find(|c| c.id == id) }
pub(super) fn root(home: &Path, category: &Category) -> PathBuf { home.join(category.relative) }

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CleanerEntry { pub category: String, pub name: String, pub path: String, pub bytes: u64, pub directory: bool, pub modified: Option<u64> }
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CleanerCategory { pub id: String, pub label: String, pub description: String, pub root: String, pub present: bool, pub permanent_only: bool, pub entries: Vec<CleanerEntry>, pub total_bytes: u64, pub truncated: bool }
fn modified(metadata: &std::fs::Metadata) -> Option<u64> {
    metadata.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs())
}
/// Lists what a category holds. Symlinks are reported by their own size and
/// never followed; hidden entries are skipped except inside the Trash.
pub(super) fn scan_category(home: &Path, category: &Category) -> CleanerCategory {
    let root_path = root(home, category);
    let mut result = CleanerCategory { id: category.id.into(), label: category.label.into(), description: category.description.into(), root: root_path.to_string_lossy().into_owned(), present: root_path.is_dir(), permanent_only: category.permanent_only, entries: vec![], total_bytes: 0, truncated: false };
    if !result.present { return result; }
    let mut budget = SCAN_BUDGET;
    match category.mode {
        Mode::Whole => {
            let bytes = directory_size(&root_path, &mut budget);
            result.entries.push(CleanerEntry { category: category.id.into(), name: category.relative.into(), path: result.root.clone(), bytes, directory: true, modified: std::fs::metadata(&root_path).ok().as_ref().and_then(modified) });
        }
        Mode::Children | Mode::Installers => {
            let Ok(entries) = std::fs::read_dir(&root_path) else { return result };
            for entry in entries.flatten() {
                let path = entry.path();
                let Some(name) = path.file_name().and_then(|n| n.to_str()).map(String::from) else { continue };
                if name.starts_with('.') && category.id != "trash" { continue; }
                let Ok(metadata) = std::fs::symlink_metadata(&path) else { continue };
                if category.mode == Mode::Installers && (!metadata.is_file() || !path.extension().and_then(|e| e.to_str()).map(|e| INSTALLER_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str())).unwrap_or(false)) { continue; }
                let bytes = if metadata.file_type().is_symlink() { metadata.len() } else { directory_size(&path, &mut budget) };
                result.entries.push(CleanerEntry { category: category.id.into(), name, path: path.to_string_lossy().into_owned(), bytes, directory: metadata.is_dir(), modified: modified(&metadata) });
                if budget == 0 { result.truncated = true; break; }
            }
        }
    }
    result.entries.sort_by(|a, b| b.bytes.cmp(&a.bytes).then(a.name.cmp(&b.name)));
    if result.entries.len() > MAX_ENTRIES { result.entries.truncate(MAX_ENTRIES); result.truncated = true; }
    result.total_bytes = result.entries.iter().map(|e| e.bytes).sum();
    result
}
/// A removable path is an existing, non-symlink entry that a scan of some
/// category would list: a direct child of a Children/Installers root, or a
/// Whole root itself. The canonical path must still sit under the root.
pub(super) fn validate_removal(home: &Path, path: &str) -> Result<(PathBuf, &'static Category), String> {
    let candidate = PathBuf::from(path);
    if !candidate.is_absolute() || path.contains('\0') || candidate.components().any(|c| matches!(c, std::path::Component::ParentDir | std::path::Component::CurDir)) {
        return Err(format!("{path} is not a path the cleaner listed."));
    }
    let metadata = std::fs::symlink_metadata(&candidate).map_err(|_| format!("{path} no longer exists. Rescan."))?;
    if metadata.file_type().is_symlink() { return Err(format!("{path} is a link and is never removed.")); }
    for category in CATEGORIES {
        let root_path = root(home, category);
        let Ok(rest) = candidate.strip_prefix(&root_path) else { continue };
        let depth = rest.components().count();
        let listed = match category.mode { Mode::Whole => depth == 0, Mode::Children => depth == 1, Mode::Installers => depth == 1 && metadata.is_file() && candidate.extension().and_then(|e| e.to_str()).map(|e| INSTALLER_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str())).unwrap_or(false) };
        if !listed { continue; }
        let (Ok(canonical), Ok(canonical_root)) = (candidate.canonicalize(), root_path.canonicalize()) else { return Err(format!("{path} could not be resolved.")); };
        if !canonical.starts_with(&canonical_root) { return Err(format!("{path} points outside its folder and is never removed.")); }
        return Ok((candidate, category));
    }
    Err(format!("{path} is not a path the cleaner listed."))
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemovalResult { pub path: String, pub ok: bool, pub error: Option<String>, pub bytes: u64 }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemovalReport { pub results: Vec<RemovalResult>, pub freed_bytes: u64, pub method: String }
#[tauri::command]
pub async fn utility_cleaner_scan(categories: Vec<String>) -> Result<Vec<CleanerCategory>, String> {
    if categories.is_empty() || categories.len() > CATEGORIES.len() { return Err("Choose at least one category.".into()); }
    let selected: Vec<&'static Category> = categories.iter().map(|id| category(id).ok_or_else(|| format!("Unknown cleanup category {id}."))).collect::<Result<_, _>>()?;
    let home = home()?;
    tauri::async_runtime::spawn_blocking(move || Ok(selected.into_iter().map(|c| scan_category(&home, c)).collect())).await.map_err(|_| "The scan stopped unexpectedly.")?
}
/// Validates every path first; one bad path means nothing is removed.
/// Permanent removal is used for the Trash and when explicitly chosen;
/// otherwise items move to the Trash through Finder.
#[tauri::command]
pub async fn utility_cleaner_remove(paths: Vec<String>, permanent: bool) -> Result<RemovalReport, String> {
    if paths.is_empty() || paths.len() > 500 { return Err("Choose between 1 and 500 items.".into()); }
    let home = home()?;
    let mut validated = Vec::new();
    for path in &paths {
        let (candidate, category) = validate_removal(&home, path)?;
        if category.permanent_only && !permanent { return Err(format!("{} items are deleted permanently. Choose permanent removal to continue.", category.label)); }
        validated.push(candidate);
    }
    if permanent {
        return tauri::async_runtime::spawn_blocking(move || {
            let mut results = Vec::new();
            let mut freed = 0u64;
            for path in validated {
                let mut budget = SCAN_BUDGET;
                let bytes = directory_size(&path, &mut budget);
                let outcome = if path.is_dir() { std::fs::remove_dir_all(&path) } else { std::fs::remove_file(&path) };
                match outcome {
                    Ok(()) => { freed += bytes; results.push(RemovalResult { path: path.to_string_lossy().into_owned(), ok: true, error: None, bytes }); }
                    Err(error) => results.push(RemovalResult { path: path.to_string_lossy().into_owned(), ok: false, error: Some(error.to_string()), bytes: 0 }),
                }
            }
            Ok(RemovalReport { results, freed_bytes: freed, method: "permanent".into() })
        }).await.map_err(|_| "Removal stopped unexpectedly.")?;
    }
    super::mac_only()?;
    let sizes: Vec<u64> = validated.iter().map(|p| { let mut budget = SCAN_BUDGET; directory_size(p, &mut budget) }).collect();
    let strings: Vec<String> = validated.iter().map(|p| p.to_string_lossy().into_owned()).collect();
    let value = tauri::async_runtime::spawn_blocking(move || super::native::call("trashItems", serde_json::json!({"paths": strings}))).await.map_err(|_| "Could not move items to the Trash.")??;
    let mut results = Vec::new();
    let mut freed = 0u64;
    for (index, item) in value["results"].as_array().cloned().unwrap_or_default().iter().enumerate() {
        let ok = item["ok"].as_bool().unwrap_or(false);
        let bytes = sizes.get(index).copied().unwrap_or(0);
        if ok { freed += bytes; }
        results.push(RemovalResult { path: item["path"].as_str().unwrap_or("").to_string(), ok, error: item["error"].as_str().map(String::from), bytes: if ok { bytes } else { 0 } });
    }
    Ok(RemovalReport { results, freed_bytes: freed, method: "trash".into() })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fake_home() -> tempfile::TempDir {
        let home = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(home.path().join("Library/Caches/com.example.app")).unwrap();
        std::fs::write(home.path().join("Library/Caches/com.example.app/blob"), vec![0u8; 2048]).unwrap();
        std::fs::write(home.path().join("Library/Caches/.hidden"), b"x").unwrap();
        std::fs::create_dir_all(home.path().join(".npm/_cacache/index")).unwrap();
        std::fs::write(home.path().join(".npm/_cacache/index/a"), vec![0u8; 512]).unwrap();
        std::fs::create_dir_all(home.path().join("Downloads")).unwrap();
        std::fs::write(home.path().join("Downloads/Tool.dmg"), vec![0u8; 100]).unwrap();
        std::fs::write(home.path().join("Downloads/notes.txt"), b"keep").unwrap();
        home
    }
    #[test] fn scans_list_children_installers_and_whole_roots_with_sizes() {
        let home = fake_home();
        let caches = scan_category(home.path(), category("caches").unwrap());
        assert!(caches.present);
        assert_eq!(caches.entries.len(), 1);
        assert_eq!(caches.entries[0].bytes, 2048);
        assert!(caches.entries[0].directory);
        let npm = scan_category(home.path(), category("npm-cache").unwrap());
        assert_eq!(npm.entries.len(), 1);
        assert_eq!(npm.total_bytes, 512);
        let installers = scan_category(home.path(), category("installers").unwrap());
        assert_eq!(installers.entries.iter().map(|e| e.name.as_str()).collect::<Vec<_>>(), vec!["Tool.dmg"]);
        assert!(!scan_category(home.path(), category("gradle-cache").unwrap()).present);
    }
    #[test] fn removal_accepts_only_listed_shapes_and_refuses_escapes() {
        let home = fake_home();
        let cache = home.path().join("Library/Caches/com.example.app");
        assert!(validate_removal(home.path(), &cache.to_string_lossy()).is_ok());
        assert!(validate_removal(home.path(), &home.path().join(".npm/_cacache").to_string_lossy()).is_ok());
        assert!(validate_removal(home.path(), &home.path().join("Downloads/Tool.dmg").to_string_lossy()).is_ok());
        assert!(validate_removal(home.path(), &home.path().join("Downloads/notes.txt").to_string_lossy()).is_err());
        assert!(validate_removal(home.path(), &home.path().join("Library/Caches").to_string_lossy()).is_err());
        assert!(validate_removal(home.path(), &cache.join("blob").to_string_lossy()).is_err());
        assert!(validate_removal(home.path(), &home.path().join("Library/Caches/../Preferences").to_string_lossy()).is_err());
        assert!(validate_removal(home.path(), "/etc/passwd").is_err());
        #[cfg(unix)] {
            std::os::unix::fs::symlink(home.path().join("Downloads"), home.path().join("Library/Caches/escape")).unwrap();
            assert!(validate_removal(home.path(), &home.path().join("Library/Caches/escape").to_string_lossy()).unwrap_err().contains("link"));
        }
    }
    #[test] fn trash_category_is_permanent_only_and_ids_are_unique() {
        assert!(category("trash").unwrap().permanent_only);
        let mut ids: Vec<&str> = CATEGORIES.iter().map(|c| c.id).collect();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), CATEGORIES.len());
        assert!(CATEGORIES.iter().all(|c| !c.relative.starts_with('/') && !c.relative.contains("..")));
    }
}
