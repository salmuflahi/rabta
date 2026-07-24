//! Project registration: repo-path inspection and validation.
//! Plain filesystem reads only — this module never executes git. Phase 9
//! (safe git ops) absorbs this helper when real git operations arrive.
use std::path::Path;

use rabta_db::{Db, DbError, NewProject, NewTask, Project, Task};
use serde::Serialize;

/// What a candidate repository path looks like on disk.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RepoInspection {
    pub exists: bool,
    pub is_git_repo: bool,
    pub default_branch: Option<String>,
}

/// Inspects a candidate repository path.
///
/// `.git` may be a directory (normal clone) or a file (worktree/submodule
/// pointer); both count as a git repo. The branch comes from parsing
/// `.git/HEAD` and is `None` for detached HEAD, unreadable files, or
/// `.git`-file repos.
pub fn inspect_repo_path(path: &str) -> RepoInspection {
    let p = Path::new(path);
    let exists = p.is_dir();
    let git = p.join(".git");
    let is_git_repo = exists && (git.is_dir() || git.is_file());
    let default_branch =
        if git.is_dir() { read_head_branch(&git.join("HEAD")) } else { None };
    RepoInspection { exists, is_git_repo, default_branch }
}

/// Parses `ref: refs/heads/<branch>` from a HEAD file.
fn read_head_branch(head: &Path) -> Option<String> {
    let contents = std::fs::read_to_string(head).ok()?;
    let branch = contents.trim().strip_prefix("ref: refs/heads/")?;
    if branch.is_empty() { None } else { Some(branch.to_string()) }
}

/// Validates registration input and creates the project.
///
/// Factored out of the Tauri command so `cargo test` covers every rule
/// without a GUI. Error strings are user-facing.
pub fn validate_and_create(
    db: &Db,
    name: &str,
    repo_path: &str,
    dev_url: Option<&str>,
    default_branch: &str,
) -> Result<Project, String> {
    let repo_path = repo_path.trim();
    let dev_url = dev_url.map(str::trim).filter(|s| !s.is_empty());

    if name.trim().is_empty() {
        return Err("project name must not be empty".to_string());
    }
    if !Path::new(repo_path).is_absolute() {
        return Err(format!("repository path must be absolute: {repo_path}"));
    }
    let inspection = inspect_repo_path(repo_path);
    if !inspection.exists {
        return Err(format!("path does not exist or is not a directory: {repo_path}"));
    }
    if !inspection.is_git_repo {
        return Err(format!("not a git repository (no .git): {repo_path}"));
    }
    if default_branch.trim().is_empty() {
        return Err("default branch must not be empty".to_string());
    }
    if let Some(raw) = dev_url {
        match url::Url::parse(raw) {
            Ok(u) if u.scheme() == "http" || u.scheme() == "https" => {}
            _ => return Err(format!("dev URL must be a valid http(s) URL: {raw}")),
        }
    }
    db.create_project(NewProject {
        name: name.trim().to_string(),
        repo_path: repo_path.to_string(),
        dev_url: dev_url.map(str::to_string),
        default_branch: default_branch.trim().to_string(),
    })
    .map_err(friendly_db_error)
}

/// Renames a project and maps storage errors to stable UI copy.
pub fn rename_project(db: &Db, id: &str, name: &str) -> Result<Project, String> {
    db.rename_project(id, name).map_err(friendly_db_error)
}

/// Archived projects ordered by their archive timestamp.
pub fn list_archived_projects(db: &Db) -> Result<Vec<Project>, String> {
    db.list_archived_projects().map_err(friendly_db_error)
}

/// Restores an archived project at the end of active ordering.
pub fn unarchive_project(db: &Db, id: &str) -> Result<Project, String> {
    db.unarchive_project(id).map_err(friendly_db_error)
}

/// Assigns or clears one curated project icon.
pub fn set_project_icon(
    db: &Db,
    id: &str,
    icon: Option<&str>,
) -> Result<Project, String> {
    db.set_project_icon(id, icon).map_err(friendly_db_error)
}

/// Persists an exact active-project ordering.
pub fn reorder_projects(db: &Db, ordered_ids: &[String]) -> Result<Vec<Project>, String> {
    db.reorder_projects(ordered_ids).map_err(friendly_db_error)
}

/// Creates a capsule only when its owning project is active.
pub fn create_task(db: &Db, project_id: &str, title: &str) -> Result<Task, String> {
    let project = db
        .get_project(project_id)
        .map_err(friendly_db_error)?
        .ok_or_else(|| "project not found".to_string())?;
    if project.archived_at.is_some() {
        return Err(
            "project is archived — restore it before adding a capsule".to_string()
        );
    }
    db.create_task(NewTask {
        project_id: project_id.to_string(),
        title: title.to_string(),
    })
    .map_err(friendly_db_error)
}

/// Renames a capsule and maps validation failures to stable UI copy.
pub fn rename_task(db: &Db, id: &str, title: &str) -> Result<Task, String> {
    db.rename_task(id, title).map_err(friendly_db_error)
}

/// Duplicates a capsule and its resources transactionally.
pub fn duplicate_task(db: &Db, id: &str) -> Result<Task, String> {
    db.duplicate_task(id).map_err(friendly_db_error)
}

/// Maps storage errors to user-facing messages.
pub(crate) fn friendly_db_error(e: DbError) -> String {
    match e {
        DbError::NotFound { entity, .. } => format!("{entity} not found"),
        DbError::Validation { field, message } => format!("{field} {message}"),
        other => {
            let msg = other.to_string();
            if msg.contains("UNIQUE constraint failed: projects.name") {
                "a project with this name already exists".to_string()
            } else {
                log::error!("project operation failed: {msg}");
                "project operation failed — see the app log for details".to_string()
            }
        }
    }
}
