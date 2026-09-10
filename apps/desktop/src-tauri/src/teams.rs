//! Step in: turn a teammate's capsule snapshot into a local task whose
//! resources point at this Mac's copy of the project. The snapshot carries
//! project-relative references only; every path is resolved here, under the
//! project folder the receiver chose, and nothing outside it is ever produced.
use rabta_db::{Db, NewTaskResource, Task};
use serde::Serialize;
use serde_json::{json, Value};
use std::path::{Component, Path, PathBuf};
use tauri::State;

use crate::DbHandle;

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ImportPlan {
    pub title: String,
    pub open_files: Vec<String>,
    pub active_file: Option<String>,
    pub terminals: Vec<String>,
    pub tabs: Vec<String>,
    pub branch: Option<String>,
    /// References that were left out, each with the reason.
    pub skipped: Vec<(String, String)>,
}

fn text(value: &Value, max: usize) -> Option<String> {
    value.as_str().map(str::trim).filter(|s| !s.is_empty() && s.len() <= max && !s.chars().any(char::is_control)).map(String::from)
}
/// Resolves one project-relative reference. `~/` means the receiver's home.
/// Absolute paths and parent segments are refused rather than adjusted.
pub fn resolve_reference(reference: &str, root: &Path, home: &Path) -> Result<PathBuf, String> {
    if reference.is_empty() || reference.len() > 1024 || reference.contains('\0') { return Err("empty or oversized reference".into()); }
    if reference.starts_with('/') || reference.starts_with('\\') || reference.get(1..3) == Some(":\\") || reference.get(1..3) == Some(":/") { return Err("absolute paths are not accepted".into()); }
    let relative = Path::new(reference);
    if relative.components().any(|c| matches!(c, Component::ParentDir | Component::RootDir | Component::Prefix(_))) { return Err("parent segments are not accepted".into()); }
    let (base, rest): (&Path, PathBuf) = match relative.strip_prefix("~") {
        Ok(rest) if !rest.as_os_str().is_empty() => (home, rest.to_path_buf()),
        Ok(_) => return Err("a home reference needs a path".into()),
        Err(_) => (root, relative.to_path_buf()),
    };
    let resolved = base.join(rest);
    if !resolved.starts_with(base) { return Err("reference escapes its folder".into()); }
    Ok(resolved)
}
fn as_list(value: &Value, limit: usize) -> Vec<String> {
    value.as_array().map(|items| items.iter().filter_map(|item| text(item, 1024)).take(limit).collect()).unwrap_or_default()
}
/// Maps a validated snapshot onto local paths. Pure, so it is tested without
/// a database or a hub.
pub fn plan_import(snapshot: &Value, root: &Path, home: &Path) -> Result<ImportPlan, String> {
    if !root.is_absolute() { return Err("The project folder must be an absolute path.".into()); }
    let title = text(&snapshot["title"], 160).ok_or("The snapshot has no title.")?;
    let mut plan = ImportPlan { title, open_files: vec![], active_file: None, terminals: vec![], tabs: vec![], branch: None, skipped: vec![] };
    for file in as_list(&snapshot["files"], 200) {
        match resolve_reference(&file, root, home) {
            Ok(path) => { let path = path.to_string_lossy().into_owned(); if !plan.open_files.contains(&path) { plan.open_files.push(path); } }
            Err(reason) => plan.skipped.push((file, reason)),
        }
    }
    if let Some(active) = text(&snapshot["activeFile"], 1024) {
        if let Ok(path) = resolve_reference(&active, root, home) { let path = path.to_string_lossy().into_owned(); if plan.open_files.contains(&path) { plan.active_file = Some(path); } }
    }
    for folder in as_list(&snapshot["folders"], 50) {
        match resolve_reference(&folder, root, home) {
            Ok(path) => { let path = path.to_string_lossy().into_owned(); if !plan.terminals.contains(&path) { plan.terminals.push(path); } }
            Err(reason) => plan.skipped.push((folder, reason)),
        }
    }
    for link in as_list(&snapshot["links"], 100) {
        match url::Url::parse(&link) {
            Ok(url) if matches!(url.scheme(), "http" | "https") && url.username().is_empty() && url.password().is_none() && url.query().is_none() && url.fragment().is_none() => { if !plan.tabs.contains(&link) { plan.tabs.push(link); } }
            _ => plan.skipped.push((link, "only plain http(s) links are opened".into())),
        }
    }
    if let Some(branch) = text(&snapshot["branch"], 200) {
        if branch.starts_with('-') || branch.contains("..") || branch.chars().any(|c| c.is_whitespace() || matches!(c, '~' | '^' | ':' | '?' | '*' | '[' | '\\')) { plan.skipped.push((branch, "not a valid branch name".into())); }
        else { plan.branch = Some(branch); }
    }
    if plan.open_files.is_empty() && plan.terminals.is_empty() && plan.tabs.is_empty() && plan.branch.is_none() { return Err("Nothing in this snapshot can be opened here. Check the project folder.".into()); }
    Ok(plan)
}
/// The capsule resources a plan becomes, in the shapes restore already reads.
pub fn resources_for(plan: &ImportPlan, root: &Path) -> Vec<(&'static str, &'static str, Value)> {
    let mut resources = Vec::new();
    if !plan.open_files.is_empty() || !plan.terminals.is_empty() {
        resources.push(("vscode", "workspace", json!({
            "workspaceFolder": root.to_string_lossy(),
            "openFiles": plan.open_files,
            "activeFile": plan.active_file,
            "terminals": plan.terminals.iter().map(|cwd| json!({ "name": "Rabta", "cwd": cwd })).collect::<Vec<_>>(),
        })));
    }
    if !plan.tabs.is_empty() {
        resources.push(("chrome", "workspace", json!({ "tabs": plan.tabs.iter().map(|url| json!({ "url": url, "title": "" })).collect::<Vec<_>>() })));
    }
    if let Some(branch) = &plan.branch { resources.push(("git", "branch", json!({ "branch": branch }))); }
    resources
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedTask { pub task: Task, pub plan: ImportPlan }
fn import(db: &Db, project_id: &str, snapshot: &Value) -> Result<ImportedTask, String> {
    let project = db.get_project(project_id).map_err(|e| e.to_string())?.ok_or("Choose one of your projects for this capsule.")?;
    let root = PathBuf::from(&project.repo_path);
    let home = std::env::var_os("HOME").map(PathBuf::from).ok_or("Home folder is unavailable.")?;
    let plan = plan_import(snapshot, &root, &home)?;
    let task = crate::projects::create_task(db, project_id, &plan.title)?;
    for (kind, resource_type, payload) in resources_for(&plan, &root) {
        db.add_task_resource(NewTaskResource { task_id: task.id.clone(), connector_kind: kind.into(), resource_type: resource_type.into(), payload }).map_err(|e| e.to_string())?;
    }
    Ok(ImportedTask { task, plan })
}
/// Creates a local task from a teammate's snapshot. Nothing opens until the
/// user activates the task through the normal restore, with its receipt.
#[tauri::command]
pub async fn import_task_snapshot(db: State<'_, DbHandle>, project_id: String, snapshot: Value) -> Result<ImportedTask, String> {
    let db = db.0.clone();
    tauri::async_runtime::spawn_blocking(move || import(&db, &project_id, &snapshot)).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn snapshot() -> Value {
        json!({
            "title": "Wire the reconnect", "project": {"id": "rabta", "name": "Rabta"},
            "files": ["packages/sdk/index.ts", "apps/App.tsx", "/etc/passwd", "../outside.ts", "~/notes.md"],
            "activeFile": "apps/App.tsx", "folders": ["packages/sdk", "~"], "links": ["https://example.com/docs", "https://u:p@example.com/x", "ftp://example.com"],
            "branch": "feat/reconnect"
        })
    }
    #[test] fn references_resolve_under_the_chosen_project_or_home_only() {
        let root = Path::new("/Users/sam/code/rabta"); let home = Path::new("/Users/sam");
        assert_eq!(resolve_reference("a/b.ts", root, home).unwrap(), PathBuf::from("/Users/sam/code/rabta/a/b.ts"));
        assert_eq!(resolve_reference("~/notes/todo.md", root, home).unwrap(), PathBuf::from("/Users/sam/notes/todo.md"));
        for bad in ["/etc/passwd", "a/../b", "~", "", "C:\\x", "\\\\server\\share"] { assert!(resolve_reference(bad, root, home).is_err(), "{bad}"); }
    }
    #[test] fn plans_keep_good_references_and_explain_the_rest() {
        let plan = plan_import(&snapshot(), Path::new("/Users/sam/code/rabta"), Path::new("/Users/sam")).unwrap();
        assert_eq!(plan.open_files, vec!["/Users/sam/code/rabta/packages/sdk/index.ts", "/Users/sam/code/rabta/apps/App.tsx", "/Users/sam/notes.md"]);
        assert_eq!(plan.active_file.as_deref(), Some("/Users/sam/code/rabta/apps/App.tsx"));
        assert_eq!(plan.terminals, vec!["/Users/sam/code/rabta/packages/sdk"]);
        assert_eq!(plan.tabs, vec!["https://example.com/docs"]);
        assert_eq!(plan.branch.as_deref(), Some("feat/reconnect"));
        assert_eq!(plan.skipped.len(), 5);
        assert!(plan.skipped.iter().any(|(item, _)| item == "/etc/passwd"));
        assert!(plan_import(&json!({"title": "x", "files": ["/abs"]}), Path::new("/p"), Path::new("/h")).is_err());
        assert!(plan_import(&snapshot(), Path::new("relative"), Path::new("/h")).is_err());
    }
    #[test] fn resources_match_the_shapes_restore_reads() {
        let plan = plan_import(&snapshot(), Path::new("/Users/sam/code/rabta"), Path::new("/Users/sam")).unwrap();
        let resources = resources_for(&plan, Path::new("/Users/sam/code/rabta"));
        assert_eq!(resources.iter().map(|(k, t, _)| format!("{k}/{t}")).collect::<Vec<_>>(), vec!["vscode/workspace", "chrome/workspace", "git/branch"]);
        assert_eq!(resources[0].2["workspaceFolder"], "/Users/sam/code/rabta");
        assert_eq!(resources[0].2["terminals"][0]["cwd"], "/Users/sam/code/rabta/packages/sdk");
        assert_eq!(resources[1].2["tabs"][0]["url"], "https://example.com/docs");
        assert_eq!(resources[2].2["branch"], "feat/reconnect");
    }
}
