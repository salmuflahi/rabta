//! Applications and processes: inventory, launch, quit, uninstall, disk
//! images and update checks. Every path is validated against a fixed set of
//! roots, every subprocess is an absolute allowlisted binary, and nothing
//! removes files except through Finder's Trash.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use tauri::State;

use super::{native, run_command, UtilityState};

pub(super) fn home() -> Result<PathBuf, String> {
    std::env::var_os("HOME").map(PathBuf::from).filter(|p| p.is_absolute()).ok_or_else(|| "Home folder is unavailable.".into())
}
pub(super) fn valid_bundle(id: &str) -> bool {
    !id.is_empty() && id.len() <= 255 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
}
fn own_pid() -> u32 { std::process::id() }

// ----------------------------------------------------------------------------
// Processes
// ----------------------------------------------------------------------------

/// Never ended from Rabta: the session, the window server, Finder, the Dock
/// and the daemons that keep a login usable. Anything under the system's own
/// executable folders is treated the same way.
const PROTECTED_NAMES: &[&str] = &[
    "kernel_task", "launchd", "windowserver", "loginwindow", "finder", "dock", "systemuiserver", "controlcenter", "notificationcenter",
    "coreaudiod", "securityd", "opendirectoryd", "mds", "mds_stores", "mdnsresponder", "configd", "syslogd", "notifyd", "powerd", "hidd",
    "cfprefsd", "distnoted", "launchservicesd", "logd", "diskarbitrationd", "fseventsd", "kernelmanagerd", "trustd", "tccd", "runningboardd",
    "usereventagent", "universalaccessd", "windowmanager", "spotlight", "bluetoothd", "airportd", "locationd", "apsd", "backupd", "rabta",
];
const PROTECTED_PREFIXES: &[&str] = &["/System/", "/usr/libexec/", "/usr/sbin/", "/sbin/"];

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProcessEntry {
    pub pid: u32,
    pub parent: u32,
    pub cpu: f64,
    pub memory_bytes: u64,
    pub user: String,
    pub command: String,
    pub name: String,
    pub protected: bool,
    pub app: bool,
}
pub(super) fn is_protected(pid: u32, command: &str, own: u32) -> bool {
    let name = Path::new(command).file_name().and_then(|n| n.to_str()).unwrap_or(command).to_ascii_lowercase();
    pid <= 1 || pid == own || PROTECTED_NAMES.contains(&name.as_str()) || PROTECTED_PREFIXES.iter().any(|prefix| command.starts_with(prefix))
}
/// Parses `ps -axo pid=,ppid=,pcpu=,pmem=,rss=,user=,comm=`. The command is
/// the remainder of the line because application paths contain spaces.
pub(super) fn parse_ps(text: &str, own: u32) -> Vec<ProcessEntry> {
    let mut entries = Vec::new();
    for line in text.lines() {
        let mut parts = line.split_whitespace();
        let (Some(pid), Some(parent), Some(cpu), Some(_pmem), Some(rss), Some(user)) = (parts.next(), parts.next(), parts.next(), parts.next(), parts.next(), parts.next()) else { continue };
        let command = parts.collect::<Vec<_>>().join(" ");
        let (Ok(pid), Ok(parent)) = (pid.parse::<u32>(), parent.parse::<u32>()) else { continue };
        if command.is_empty() { continue; }
        let name = Path::new(&command).file_name().and_then(|n| n.to_str()).unwrap_or(&command).to_string();
        entries.push(ProcessEntry {
            pid, parent,
            cpu: cpu.parse().unwrap_or(0.0),
            memory_bytes: rss.parse::<u64>().unwrap_or(0) * 1024,
            user: user.to_string(),
            protected: is_protected(pid, &command, own),
            command, name, app: false,
        });
    }
    entries
}
#[derive(Clone, Debug, Deserialize)]
struct RunningApp { pid: u32, #[serde(rename = "bundleId")] bundle_id: String, name: String, policy: String }
async fn running_apps() -> Result<Vec<RunningApp>, String> {
    let value = tauri::async_runtime::spawn_blocking(|| native::call("runningApps", json!({"includeBackground": false}))).await.map_err(|_| "Could not read running apps.")??;
    serde_json::from_value(value["apps"].clone()).map_err(|_| "Could not read running apps.".into())
}
#[tauri::command]
pub async fn utility_processes() -> Result<Vec<ProcessEntry>, String> {
    let text = super::output("/bin/ps", &["-axo", "pid=,ppid=,pcpu=,pmem=,rss=,user=,comm="], 20).await?;
    let mut entries = parse_ps(&text, own_pid());
    if let Ok(apps) = running_apps().await {
        for entry in &mut entries {
            if let Some(app) = apps.iter().find(|app| app.pid == entry.pid) {
                entry.app = app.policy != "background";
                if !app.name.is_empty() { entry.name = app.name.clone(); }
            }
        }
    }
    entries.sort_by(|a, b| b.cpu.partial_cmp(&a.cpu).unwrap_or(std::cmp::Ordering::Equal).then(b.memory_bytes.cmp(&a.memory_bytes)));
    entries.truncate(600);
    Ok(entries)
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EndedProcess { pub name: String, pub method: String, pub requested: bool }
/// Quits an app through its own Quit path, or sends a signal to another
/// process. Force is a separate, explicit request. The process is re-read
/// before anything is sent, so a recycled pid is never ended by mistake.
#[tauri::command]
pub async fn utility_end_process(pid: u32, force: bool) -> Result<EndedProcess, String> {
    if pid <= 1 { return Err("Choose a process to end.".into()); }
    if pid == own_pid() { return Err("Quit Rabta from its own menu instead.".into()); }
    let text = super::output("/bin/ps", &["-p", &pid.to_string(), "-o", "comm="], 10).await.map_err(|_| "That process already ended. Refresh the list.".to_string())?;
    let command = text.trim().to_string();
    if command.is_empty() { return Err("That process already ended. Refresh the list.".into()); }
    if is_protected(pid, &command, own_pid()) { return Err("That is part of macOS and stays running.".into()); }
    if let Ok(apps) = running_apps().await {
        if let Some(app) = apps.iter().find(|app| app.pid == pid && app.policy != "background") {
            let name = app.name.clone();
            let value = tauri::async_runtime::spawn_blocking(move || native::call("terminateApp", json!({"pid": pid, "force": force}))).await.map_err(|_| "Could not end this app.")??;
            return Ok(EndedProcess { name, method: if force { "forceQuit".into() } else { "quit".into() }, requested: value["requested"].as_bool().unwrap_or(false) });
        }
    }
    let signal = if force { "-KILL" } else { "-TERM" };
    super::output("/bin/kill", &[signal, &pid.to_string()], 10).await?;
    let name = Path::new(&command).file_name().and_then(|n| n.to_str()).unwrap_or(&command).to_string();
    Ok(EndedProcess { name, method: if force { "kill".into() } else { "signal".into() }, requested: true })
}

// ----------------------------------------------------------------------------
// Installed applications and the quick launcher
// ----------------------------------------------------------------------------

pub(super) fn application_roots(home: &Path, include_system: bool) -> Vec<PathBuf> {
    let mut roots = vec![PathBuf::from("/Applications"), home.join("Applications")];
    if include_system { roots.push(PathBuf::from("/System/Applications")); }
    roots
}
/// An application path is absolute, ends in `.app`, contains no parent
/// segments, and sits at most two levels (a Utilities folder) under a root.
pub(super) fn validate_app_path(path: &str, roots: &[PathBuf]) -> Result<PathBuf, String> {
    let candidate = PathBuf::from(path);
    if !candidate.is_absolute() || candidate.extension().and_then(|e| e.to_str()) != Some("app") || path.len() > 4096 || path.contains('\0')
        || candidate.components().any(|c| matches!(c, Component::ParentDir | Component::CurDir)) {
        return Err("Choose an application from your Applications folders.".into());
    }
    let inside = roots.iter().any(|root| candidate.strip_prefix(root).map(|rest| (1..=2).contains(&rest.components().count())).unwrap_or(false));
    if !inside { return Err("Choose an application from your Applications folders.".into()); }
    Ok(candidate)
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledApp { pub path: String, pub name: String, pub bundle_id: String, pub version: String, #[serde(default)] pub system: bool }
#[tauri::command]
pub async fn utility_installed_apps(include_system: bool) -> Result<Vec<InstalledApp>, String> {
    let home = home()?;
    let roots = application_roots(&home, include_system);
    let directories: Vec<String> = roots.iter().map(|p| p.to_string_lossy().into_owned()).collect();
    let value = tauri::async_runtime::spawn_blocking(move || native::call("installedApps", json!({"directories": directories}))).await.map_err(|_| "Could not read installed apps.")??;
    let mut apps: Vec<InstalledApp> = serde_json::from_value(value["apps"].clone()).map_err(|_| "Could not read installed apps.")?;
    apps.retain(|app| validate_app_path(&app.path, &roots).is_ok());
    for app in &mut apps { app.system = app.path.starts_with("/System/"); }
    Ok(apps)
}
#[tauri::command]
pub async fn utility_launch_app(path: String) -> Result<Value, String> {
    let home = home()?;
    let candidate = validate_app_path(&path, &application_roots(&home, true))?;
    if !candidate.is_dir() { return Err("That app is no longer installed. Refresh the list.".into()); }
    tauri::async_runtime::spawn_blocking(move || native::call("launchApp", json!({"path": candidate}))).await.map_err(|_| "Could not open this app.")?
}

// ----------------------------------------------------------------------------
// Uninstaller
// ----------------------------------------------------------------------------

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RelatedFile { pub label: String, pub path: String, pub bytes: u64, pub directory: bool }
fn valid_app_name(name: &str) -> bool {
    !name.trim().is_empty() && name.len() <= 200 && !name.contains('/') && !name.contains('\0') && name != "." && name != ".."
}
/// The places macOS apps keep data, named by bundle ID or by app name. Only
/// exact matches are offered; nothing is guessed from partial names.
pub(super) fn related_candidates(home: &Path, bundle_id: &str, name: &str) -> Vec<(String, PathBuf)> {
    let library = home.join("Library");
    let mut items = vec![
        ("Application Support".to_string(), library.join("Application Support").join(bundle_id)),
        ("Application Support".to_string(), library.join("Application Support").join(name)),
        ("Caches".to_string(), library.join("Caches").join(bundle_id)),
        ("Preferences".to_string(), library.join("Preferences").join(format!("{bundle_id}.plist"))),
        ("Container".to_string(), library.join("Containers").join(bundle_id)),
        ("Saved window state".to_string(), library.join("Saved Application State").join(format!("{bundle_id}.savedState"))),
        ("Logs".to_string(), library.join("Logs").join(bundle_id)),
        ("Logs".to_string(), library.join("Logs").join(name)),
        ("HTTP storage".to_string(), library.join("HTTPStorages").join(bundle_id)),
        ("HTTP storage".to_string(), library.join("HTTPStorages").join(format!("{bundle_id}.binarycookies"))),
        ("WebKit data".to_string(), library.join("WebKit").join(bundle_id)),
        ("Cookies".to_string(), library.join("Cookies").join(format!("{bundle_id}.binarycookies"))),
        ("Login item".to_string(), library.join("LaunchAgents").join(format!("{bundle_id}.plist"))),
        ("Application scripts".to_string(), library.join("Application Scripts").join(bundle_id)),
    ];
    items.dedup_by(|a, b| a.1 == b.1);
    items
}
pub(super) fn directory_size(path: &Path, budget: &mut usize) -> u64 {
    let Ok(metadata) = std::fs::symlink_metadata(path) else { return 0 };
    if !metadata.is_dir() { return metadata.len(); }
    let mut total = 0;
    let mut stack = vec![path.to_path_buf()];
    while let Some(directory) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&directory) else { continue };
        for entry in entries.flatten() {
            if *budget == 0 { return total; }
            *budget -= 1;
            let Ok(metadata) = entry.metadata() else { continue };
            if metadata.file_type().is_symlink() { continue; }
            if metadata.is_dir() { stack.push(entry.path()); } else { total += metadata.len(); }
        }
    }
    total
}
#[tauri::command]
pub async fn utility_app_related_files(bundle_id: String, name: String) -> Result<Vec<RelatedFile>, String> {
    if !valid_bundle(&bundle_id) || !valid_app_name(&name) { return Err("Choose an installed application.".into()); }
    let home = home()?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut budget = 400_000usize;
        Ok(related_candidates(&home, &bundle_id, &name).into_iter().filter(|(_, path)| std::fs::symlink_metadata(path).is_ok()).map(|(label, path)| {
            let directory = path.is_dir();
            RelatedFile { label, bytes: directory_size(&path, &mut budget), path: path.to_string_lossy().into_owned(), directory }
        }).collect())
    }).await.map_err(|_| "Could not inspect related files.")?
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashResult { pub path: String, pub ok: bool, pub error: Option<String> }
async fn trash(paths: Vec<String>) -> Result<Vec<TrashResult>, String> {
    let value = tauri::async_runtime::spawn_blocking(move || native::call("trashItems", json!({"paths": paths}))).await.map_err(|_| "Could not move items to the Trash.")??;
    serde_json::from_value(value["results"].clone()).map_err(|_| "Could not read the Trash result.".into())
}
/// Moves the app and only the explicitly selected related files to the
/// Trash. The bundle ID is re-read from the app before anything moves; a
/// running app, a system app, or Rabta itself is refused.
#[tauri::command]
pub async fn utility_uninstall_app(path: String, bundle_id: String, name: String, related: Vec<String>) -> Result<Vec<TrashResult>, String> {
    let home = home()?;
    let app = validate_app_path(&path, &application_roots(&home, false))?;
    if !valid_bundle(&bundle_id) || !valid_app_name(&name) { return Err("Choose an installed application.".into()); }
    if !app.is_dir() { return Err("That app is no longer installed. Refresh the list.".into()); }
    if bundle_id.to_ascii_lowercase().starts_with("com.omnibus.") || name.eq_ignore_ascii_case("rabta") { return Err("Rabta cannot uninstall itself.".into()); }
    let info = app.join("Contents").join("Info");
    let actual = super::output("/usr/bin/defaults", &["read", &info.to_string_lossy(), "CFBundleIdentifier"], 15).await.map_err(|_| "This app's identity could not be read, so nothing was removed.".to_string())?;
    if !actual.trim().eq_ignore_ascii_case(&bundle_id) { return Err("This app's identity changed. Refresh the list and try again.".into()); }
    if let Some(running) = running_apps().await?.into_iter().find(|running| running.bundle_id.eq_ignore_ascii_case(&bundle_id)) {
        return Err(format!("Quit {} before uninstalling it.", if running.name.is_empty() { name } else { running.name }));
    }
    let allowed: Vec<String> = related_candidates(&home, &bundle_id, &name).into_iter().map(|(_, p)| p.to_string_lossy().into_owned()).collect();
    if related.len() > allowed.len() || related.iter().any(|item| !allowed.contains(item)) { return Err("Only this app's own related files can be removed with it. Refresh the list.".into()); }
    let mut paths = vec![app.to_string_lossy().into_owned()];
    paths.extend(related.into_iter().filter(|item| Path::new(item).exists()));
    trash(paths).await
}

// ----------------------------------------------------------------------------
// Disk images
// ----------------------------------------------------------------------------

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MountedImage { pub image: String, pub mount_point: String, pub device: String }
#[derive(Default)]
pub struct Mounts { pub current: Option<MountedImage> }
pub type SharedMounts = Mutex<Mounts>;

/// Reads the mount point and device from `hdiutil attach -plist`. Keys inside
/// a plist dictionary are sorted, so `dev-entry` precedes `mount-point`.
pub(super) fn parse_attach_plist(xml: &str) -> Result<(String, String), String> {
    fn value_after(chunk: &str, key: &str) -> Option<String> {
        let start = chunk.find(&format!("<key>{key}</key>"))?;
        let rest = &chunk[start..];
        let open = rest.find("<string>")? + "<string>".len();
        let close = rest[open..].find("</string>")? + open;
        Some(rest[open..close].replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">"))
    }
    for chunk in xml.split("<dict>") {
        if let (Some(mount), Some(device)) = (value_after(chunk, "mount-point"), value_after(chunk, "dev-entry")) {
            if mount.starts_with("/Volumes/") && device.starts_with("/dev/disk") { return Ok((mount, device)); }
        }
    }
    Err("The disk image mounted without a usable volume, or needs a license agreement accepted in Finder first.".into())
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageApp { pub name: String, pub path: String, pub installed_at: Option<String> }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedImage { pub image: String, pub mount_point: String, pub apps: Vec<ImageApp>, pub packages: Vec<String> }
pub(super) fn scan_volume(mount: &Path, applications: &[PathBuf]) -> (Vec<ImageApp>, Vec<String>) {
    let mut apps = Vec::new();
    let mut packages = Vec::new();
    if let Ok(entries) = std::fs::read_dir(mount) {
        for entry in entries.flatten() {
            let path = entry.path();
            let Some(name) = path.file_name().and_then(|n| n.to_str()).map(String::from) else { continue };
            if name.starts_with('.') { continue; }
            match path.extension().and_then(|e| e.to_str()) {
                Some("app") if path.is_dir() => {
                    let installed_at = applications.iter().map(|root| root.join(&name)).find(|target| target.exists()).map(|p| p.to_string_lossy().into_owned());
                    apps.push(ImageApp { name, path: path.to_string_lossy().into_owned(), installed_at });
                }
                Some("pkg") | Some("mpkg") => packages.push(name),
                _ => {}
            }
        }
    }
    apps.sort_by(|a, b| a.name.cmp(&b.name));
    (apps, packages)
}
async fn detach(mount_point: &str) -> Result<(), String> {
    match super::output("/usr/bin/hdiutil", &["detach", mount_point], 60).await {
        Ok(_) => Ok(()),
        Err(_) => {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            super::output("/usr/bin/hdiutil", &["detach", mount_point], 60).await.map(|_| ()).map_err(|e| format!("The disk image is still in use and could not be ejected. Eject it from Finder. {e}"))
        }
    }
}
/// Opens an explicit Finder chooser. The chosen path is returned for the
/// caller to validate; nothing is read or mounted here.
#[tauri::command]
pub async fn utility_choose_file(kind: String) -> Result<Value, String> {
    if !["dmg", "app", "folder"].contains(&kind.as_str()) { return Err("Choose a supported file kind.".into()); }
    let title = match kind.as_str() { "dmg" => "Choose a disk image", "app" => "Choose an application", _ => "Choose a folder" };
    tauri::async_runtime::spawn_blocking(move || native::call("openPanel", json!({"kind": kind, "title": title}))).await.map_err(|_| "The chooser stopped unexpectedly.")?
}
#[tauri::command]
pub async fn utility_disk_image_open(state: State<'_, UtilityState>, path: String) -> Result<OpenedImage, String> {
    let image = PathBuf::from(&path);
    if !image.is_absolute() || image.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("dmg")) != Some(true) || !image.is_file() || path.contains('\0') {
        return Err("Choose a .dmg disk image.".into());
    }
    let previous = state.mounts.lock().map_err(|_| "Disk image state is unavailable.")?.current.clone();
    if let Some(previous) = previous { detach(&previous.mount_point).await?; state.mounts.lock().map_err(|_| "Disk image state is unavailable.")?.current = None; }
    let completed = run_command("/usr/bin/hdiutil", &["attach", "-nobrowse", "-readonly", "-noautoopen", "-plist", &path], &[], 240).await?;
    if !completed.success {
        return Err(format!("macOS could not open this disk image. {}", if completed.stderr.contains("Authorization") || completed.stderr.contains("EULA") || completed.stderr.contains("license") { "It needs a license agreement accepted by opening it in Finder first." } else { completed.stderr.trim() }));
    }
    let (mount_point, device) = parse_attach_plist(&completed.stdout)?;
    let home = home()?;
    let (apps, packages) = scan_volume(Path::new(&mount_point), &application_roots(&home, false));
    state.mounts.lock().map_err(|_| "Disk image state is unavailable.")?.current = Some(MountedImage { image: path.clone(), mount_point: mount_point.clone(), device });
    Ok(OpenedImage { image: path, mount_point, apps, packages })
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledFromImage { pub installed_path: String, pub ejected: bool, pub image_trashed: bool, pub warnings: Vec<String> }
/// Copies one app from the mounted image into Applications. An existing copy
/// is only replaced when asked, and then by moving it to the Trash first.
#[tauri::command]
pub async fn utility_disk_image_install(state: State<'_, UtilityState>, app: String, destination: String, replace: bool, eject: bool, trash_image: bool) -> Result<InstalledFromImage, String> {
    let mounted = state.mounts.lock().map_err(|_| "Disk image state is unavailable.")?.current.clone().ok_or("Open a disk image first.")?;
    let source = PathBuf::from(&app);
    let name = source.file_name().and_then(|n| n.to_str()).map(String::from).ok_or("Choose an app from the disk image.")?;
    if !source.starts_with(&mounted.mount_point) || source.extension().and_then(|e| e.to_str()) != Some("app") || source.components().count() != Path::new(&mounted.mount_point).components().count() + 1 || !source.is_dir() {
        return Err("Choose an app from the opened disk image.".into());
    }
    let home = home()?;
    let folder = match destination.as_str() { "applications" => PathBuf::from("/Applications"), "user" => home.join("Applications"), _ => return Err("Choose Applications or your user Applications folder.".into()) };
    std::fs::create_dir_all(&folder).map_err(|e| format!("Could not prepare {}: {e}", folder.display()))?;
    let target = folder.join(&name);
    let mut warnings = Vec::new();
    if target.exists() {
        if !replace { return Err(format!("{name} is already installed in {}. Choose Replace to move the existing copy to the Trash first.", folder.display())); }
        if let Some(running) = running_apps().await?.into_iter().find(|running| Path::new(&running.name).file_name().is_some() && target.to_string_lossy().ends_with(&format!("{}.app", running.name))) {
            return Err(format!("Quit {} before replacing it.", running.name));
        }
        let results = trash(vec![target.to_string_lossy().into_owned()]).await?;
        if let Some(failed) = results.iter().find(|r| !r.ok) { return Err(format!("The existing copy could not be moved to the Trash: {}", failed.error.clone().unwrap_or_default())); }
    }
    super::output("/usr/bin/ditto", &[&source.to_string_lossy(), &target.to_string_lossy()], 900).await.map_err(|e| format!("Copying failed. {e}"))?;
    if !target.is_dir() { return Err("The copy finished but the app is missing from the destination.".into()); }
    let mut ejected = false;
    if eject {
        match detach(&mounted.mount_point).await { Ok(()) => { ejected = true; state.mounts.lock().map_err(|_| "Disk image state is unavailable.")?.current = None; } Err(error) => warnings.push(error) }
    }
    let mut image_trashed = false;
    if trash_image && ejected {
        match trash(vec![mounted.image.clone()]).await { Ok(results) if results.iter().all(|r| r.ok) => image_trashed = true, Ok(results) => warnings.push(results.into_iter().find_map(|r| r.error).unwrap_or_else(|| "The disk image could not be moved to the Trash.".into())), Err(error) => warnings.push(error) }
    } else if trash_image { warnings.push("The disk image stays until it is ejected.".into()); }
    Ok(InstalledFromImage { installed_path: target.to_string_lossy().into_owned(), ejected, image_trashed, warnings })
}
#[tauri::command]
pub async fn utility_disk_image_eject(state: State<'_, UtilityState>) -> Result<(), String> {
    let mounted = state.mounts.lock().map_err(|_| "Disk image state is unavailable.")?.current.clone();
    if let Some(mounted) = mounted { detach(&mounted.mount_point).await?; state.mounts.lock().map_err(|_| "Disk image state is unavailable.")?.current = None; }
    Ok(())
}
pub(super) fn eject_on_exit(mounts: &SharedMounts) {
    if let Ok(mut guard) = mounts.lock() {
        if let Some(mounted) = guard.current.take() {
            let _ = std::process::Command::new("/usr/bin/hdiutil").args(["detach", &mounted.mount_point]).stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).status();
        }
    }
}

// ----------------------------------------------------------------------------
// Update checks
// ----------------------------------------------------------------------------

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateEntry { pub source: String, pub name: String, pub detail: String }
/// Parses `softwareupdate -l`. Modern output pairs `* Label:` with an indented
/// `Title:` line; older output lists `* Name` lines.
pub(super) fn parse_softwareupdate(text: &str) -> Vec<UpdateEntry> {
    let mut entries: Vec<UpdateEntry> = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim();
        if let Some(label) = trimmed.strip_prefix("* Label:") {
            entries.push(UpdateEntry { source: "macOS".into(), name: label.trim().to_string(), detail: String::new() });
        } else if let Some(title) = trimmed.strip_prefix("Title:") {
            if let Some(last) = entries.last_mut() { if last.detail.is_empty() { last.detail = title.trim().trim_end_matches(',').to_string(); } }
        } else if let Some(name) = trimmed.strip_prefix("* ") {
            if !name.starts_with("Label") { entries.push(UpdateEntry { source: "macOS".into(), name: name.trim().to_string(), detail: String::new() }); }
        }
    }
    entries
}
/// Parses `mas outdated`: `497799835 Xcode (14.2 -> 14.3)`.
pub(super) fn parse_mas(text: &str) -> Vec<UpdateEntry> {
    text.lines().filter_map(|line| {
        let mut parts = line.trim().splitn(2, ' ');
        let id = parts.next()?;
        let rest = parts.next()?.trim();
        if id.is_empty() || !id.chars().all(|c| c.is_ascii_digit()) || rest.is_empty() { return None; }
        let (name, detail) = match rest.rfind('(') { Some(index) => (rest[..index].trim().to_string(), rest[index..].trim_matches(|c| c == '(' || c == ')').to_string()), None => (rest.to_string(), String::new()) };
        Some(UpdateEntry { source: "App Store".into(), name, detail })
    }).collect()
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateReport { pub updates: Vec<UpdateEntry>, pub errors: Vec<String>, pub sources: Vec<String> }
#[tauri::command]
pub async fn utility_check_updates() -> Result<UpdateReport, String> {
    super::mac_only()?;
    let mut report = UpdateReport { updates: vec![], errors: vec![], sources: vec!["macOS".into()] };
    let (system, brew, mas) = tokio::join!(
        run_command("/usr/sbin/softwareupdate", &["-l"], &[], 180),
        super::brew::outdated_entries(),
        async {
            let path = ["/opt/homebrew/bin/mas", "/usr/local/bin/mas"].into_iter().find(|p| Path::new(p).is_file());
            match path { Some(path) => Some(run_command(path, &["outdated"], &[], 120).await), None => None }
        }
    );
    match system {
        Ok(completed) => { let text = format!("{}\n{}", completed.stdout, completed.stderr); report.updates.extend(parse_softwareupdate(&text)); }
        Err(error) => report.errors.push(format!("macOS updates could not be checked. {error}")),
    }
    match brew {
        Ok(Some(entries)) => { report.sources.push("Homebrew".into()); report.updates.extend(entries); }
        Ok(None) => {}
        Err(error) => report.errors.push(error),
    }
    match mas {
        Some(Ok(completed)) => { report.sources.push("App Store".into()); report.updates.extend(parse_mas(&completed.stdout)); }
        Some(Err(error)) => report.errors.push(format!("App Store updates could not be checked. {error}")),
        None => {}
    }
    Ok(report)
}
/// Opens the Software Update pane. Installing macOS updates stays with the
/// system, where it can ask for administrator approval and a restart.
#[tauri::command]
pub async fn utility_open_software_update() -> Result<(), String> {
    super::output("/usr/bin/open", &["x-apple.systempreferences:com.apple.Software-Update-Settings.extension"], 15).await.map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn ps_output_keeps_spaced_commands_and_marks_protected_processes() {
        let text = "  1     0   0.0  0.1  12345 root /sbin/launchd\n  502   1   3.5  1.2  204800 sam /Applications/Google Chrome.app/Contents/MacOS/Google Chrome\n  777  502  0.0  0.0  100 sam /usr/libexec/trustd\n  999 1 0.0 0.0 50 sam /opt/homebrew/bin/node\nbroken line\n";
        let entries = parse_ps(text, 999);
        assert_eq!(entries.len(), 4);
        assert_eq!(entries[1].name, "Google Chrome");
        assert_eq!(entries[1].memory_bytes, 204800 * 1024);
        assert!(entries[0].protected && entries[2].protected && entries[3].protected);
        assert!(!entries[1].protected);
        assert!(is_protected(4000, "/Applications/Utilities/Terminal.app/Contents/MacOS/Finder", 1) );
        assert!(!is_protected(4000, "/usr/bin/ssh", 1));
    }
    #[test] fn app_paths_stay_inside_application_folders() {
        let roots = application_roots(Path::new("/Users/sam"), true);
        assert!(validate_app_path("/Applications/Safari.app", &roots).is_ok());
        assert!(validate_app_path("/Applications/Utilities/Terminal.app", &roots).is_ok());
        assert!(validate_app_path("/Users/sam/Applications/Tool.app", &roots).is_ok());
        assert!(validate_app_path("/System/Applications/Calculator.app", &roots).is_ok());
        assert!(validate_app_path("/System/Applications/Calculator.app", &application_roots(Path::new("/Users/sam"), false)).is_err());
        assert!(validate_app_path("/Applications/../etc/passwd.app", &roots).is_err());
        assert!(validate_app_path("/Applications/Deep/Deeper/Tool.app", &roots).is_err());
        assert!(validate_app_path("/tmp/Evil.app", &roots).is_err());
        assert!(validate_app_path("/Applications/Safari", &roots).is_err());
    }
    #[test] fn related_files_are_exact_bundle_or_name_matches_only() {
        let items = related_candidates(Path::new("/Users/sam"), "com.example.tool", "Tool");
        assert!(items.iter().any(|(_, p)| p == Path::new("/Users/sam/Library/Preferences/com.example.tool.plist")));
        assert!(items.iter().any(|(_, p)| p == Path::new("/Users/sam/Library/Application Support/Tool")));
        assert!(items.iter().all(|(_, p)| p.starts_with("/Users/sam/Library")));
        assert!(!valid_app_name("../Tool") && !valid_app_name("a/b") && valid_app_name("Tool"));
    }
    #[test] fn attach_plist_yields_the_mounted_volume() {
        let xml = r#"<plist><dict><key>system-entities</key><array>
        <dict><key>content-hint</key><string>GUID_partition_scheme</string><key>dev-entry</key><string>/dev/disk4</string></dict>
        <dict><key>content-hint</key><string>Apple_HFS</string><key>dev-entry</key><string>/dev/disk4s2</string><key>mount-point</key><string>/Volumes/Tool &amp; Co</string></dict>
        </array></dict></plist>"#;
        assert_eq!(parse_attach_plist(xml).unwrap(), ("/Volumes/Tool & Co".to_string(), "/dev/disk4s2".to_string()));
        assert!(parse_attach_plist("<plist><dict><key>dev-entry</key><string>/dev/disk4</string></dict></plist>").is_err());
    }
    #[test] fn volume_scan_lists_apps_and_flags_installed_copies() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("Tool.app")).unwrap();
        std::fs::write(dir.path().join("Extra.pkg"), b"").unwrap();
        std::fs::create_dir(dir.path().join(".background")).unwrap();
        let apps_root = tempfile::tempdir().unwrap();
        std::fs::create_dir(apps_root.path().join("Tool.app")).unwrap();
        let (apps, packages) = scan_volume(dir.path(), &[apps_root.path().to_path_buf()]);
        assert_eq!(apps.len(), 1);
        assert_eq!(apps[0].name, "Tool.app");
        assert!(apps[0].installed_at.is_some());
        assert_eq!(packages, vec!["Extra.pkg".to_string()]);
    }
    #[test] fn update_output_parses_modern_and_legacy_formats() {
        let modern = "Software Update Tool\n\nFinding available software\nSoftware Update found the following new or updated software:\n* Label: macOS Sonoma 14.6.1-23G93\n\tTitle: macOS Sonoma 14.6.1, Version: 14.6.1, Size: 1500000KiB, Recommended: YES, Action: restart,\n";
        let entries = parse_softwareupdate(modern);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "macOS Sonoma 14.6.1-23G93");
        assert!(entries[0].detail.starts_with("macOS Sonoma 14.6.1"));
        assert_eq!(parse_softwareupdate("No new software available.").len(), 0);
        assert_eq!(parse_softwareupdate("* Safari 15\n").len(), 1);
        let mas = parse_mas("497799835 Xcode (14.2 -> 14.3)\nnot an entry\n");
        assert_eq!(mas.len(), 1);
        assert_eq!(mas[0].name, "Xcode");
        assert_eq!(mas[0].detail, "14.2 -> 14.3");
    }
    #[test] fn directory_size_ignores_symlinks_and_respects_budget() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a"), vec![0u8; 100]).unwrap();
        std::fs::create_dir(dir.path().join("sub")).unwrap();
        std::fs::write(dir.path().join("sub/b"), vec![0u8; 50]).unwrap();
        #[cfg(unix)] std::os::unix::fs::symlink(dir.path().join("a"), dir.path().join("link")).unwrap();
        let mut budget = 1000;
        assert_eq!(directory_size(dir.path(), &mut budget), 150);
        let mut tiny = 1;
        assert!(directory_size(dir.path(), &mut tiny) <= 150);
    }
}
