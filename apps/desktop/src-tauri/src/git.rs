//! Safe git operations for registered projects. Every command runs the
//! user's own `git` binary with a fixed argv (never a shell). This module
//! owns the safety rails: no force, no reset, no stash, no clean — a
//! refusal is a normal, reported outcome, never a fallback to force.
use std::path::Path;
use std::process::Stdio;

use serde::Serialize;
use tokio::process::Command;

/// A project's git position as shown in the UI and stored in capsules.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    /// `None` means detached HEAD.
    pub branch: Option<String>,
    pub dirty: bool,
    pub changed_count: u32,
    pub ahead: u32,
    pub behind: u32,
}

async fn run_git(repo: &Path, args: &[&str]) -> Result<String, String> {
    let out = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .stdin(Stdio::null())
        .output()
        .await
        .map_err(|e| format!("failed to run git: {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

/// Rejects empty or `-`-prefixed names outright (argv-flag injection), then
/// defers to git's authoritative `check-ref-format --branch`. Runs before
/// any other use of a user-supplied branch name.
pub async fn validate_branch_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.starts_with('-') {
        return Err(format!("invalid branch name: {name:?}"));
    }
    let out = Command::new("git")
        .args(["check-ref-format", "--branch", name])
        .stdin(Stdio::null())
        .output()
        .await
        .map_err(|e| format!("failed to run git: {e}"))?;
    if out.status.success() {
        Ok(())
    } else {
        Err(format!("invalid branch name: {name:?}"))
    }
}

/// Current branch (None when detached), dirtiness, and ahead/behind counts
/// relative to the upstream, via `git status --porcelain=v2 --branch`.
pub async fn status(repo: &Path) -> Result<GitStatus, String> {
    let raw = run_git(repo, &["status", "--porcelain=v2", "--branch"]).await?;
    let mut branch = None;
    let (mut ahead, mut behind) = (0u32, 0u32);
    let mut changed_count = 0u32;
    for line in raw.lines() {
        if let Some(rest) = line.strip_prefix("# branch.head ") {
            if rest != "(detached)" {
                branch = Some(rest.to_string());
            }
        } else if let Some(rest) = line.strip_prefix("# branch.ab ") {
            for part in rest.split_whitespace() {
                if let Some(n) = part.strip_prefix('+') {
                    ahead = n.parse().unwrap_or(0);
                } else if let Some(n) = part.strip_prefix('-') {
                    behind = n.parse().unwrap_or(0);
                }
            }
        } else if !line.starts_with('#') && !line.is_empty() {
            changed_count += 1;
        }
    }
    Ok(GitStatus { branch, dirty: changed_count > 0, changed_count, ahead, behind })
}

/// Local branch names.
pub async fn branches(repo: &Path) -> Result<Vec<String>, String> {
    let raw = run_git(repo, &["for-each-ref", "--format=%(refname:short)", "refs/heads"]).await?;
    Ok(raw.lines().filter(|l| !l.is_empty()).map(str::to_string).collect())
}

/// `git fetch --all`: updates remote-tracking refs only; never merges.
pub async fn fetch(repo: &Path) -> Result<String, String> {
    run_git(repo, &["fetch", "--all"]).await.map(|_| "fetched".to_string())
}

/// Switches to an existing local branch — refusing, never forcing.
///
/// Preflight order (spec): name validation → dirty-tree refusal →
/// missing-branch refusal → plain `git switch`.
pub async fn checkout(repo: &Path, branch: &str) -> Result<(), String> {
    validate_branch_name(branch).await?;
    let st = status(repo).await?;
    if st.dirty {
        return Err(
            "working tree has uncommitted changes — OmniBus never discards or stashes your work; commit or stash manually first"
                .to_string(),
        );
    }
    let exists = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(["show-ref", "--verify", "--quiet"])
        .arg(format!("refs/heads/{branch}"))
        .stdin(Stdio::null())
        .status()
        .await
        .map_err(|e| format!("failed to run git: {e}"))?;
    if !exists.success() {
        return Err(format!("branch '{branch}' does not exist locally"));
    }
    run_git(repo, &["switch", branch]).await.map(|_| ())
}

/// Creates and switches to a new branch. Safe with a dirty tree: changes
/// are carried, never dropped.
pub async fn create_branch(repo: &Path, name: &str) -> Result<(), String> {
    validate_branch_name(name).await?;
    run_git(repo, &["switch", "-c", name]).await.map(|_| ())
}
