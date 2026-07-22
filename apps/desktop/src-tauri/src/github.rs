//! GitHub reads via the user's `gh` CLI. Like `git.rs`, every call runs the
//! user's own authenticated binary with a fixed argv (never a shell) — OmniBus
//! never sees, stores, or transmits a GitHub credential.
use std::path::Path;
use std::process::Stdio;

use serde::{Deserialize, Serialize};
use tokio::process::Command;

use rabta_db::{Db, NewTask};

/// An open issue as shown in the UI.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Issue {
    pub number: u64,
    pub title: String,
    pub url: String,
    pub labels: Vec<String>,
}

/// Parses `owner`/`repo` from a GitHub remote URL (ssh, https, or
/// ssh://); returns `None` for non-GitHub hosts or unrecognized shapes.
pub fn owner_repo_from_remote(url: &str) -> Option<(String, String)> {
    let rest = url
        .strip_prefix("git@github.com:")
        .or_else(|| url.strip_prefix("https://github.com/"))
        .or_else(|| url.strip_prefix("ssh://git@github.com/"))
        .or_else(|| url.strip_prefix("http://github.com/"))?;
    let rest = rest.trim_end_matches('/');
    let rest = rest.strip_suffix(".git").unwrap_or(rest);
    let mut parts = rest.splitn(2, '/');
    let owner = parts.next().filter(|s| !s.is_empty())?;
    let repo = parts.next().filter(|s| !s.is_empty() && !s.contains('/'))?;
    Some((owner.to_string(), repo.to_string()))
}

/// The gh JSON shape for `--json number,title,url,labels`.
#[derive(Deserialize)]
struct GhIssue {
    number: u64,
    title: String,
    url: String,
    #[serde(default)]
    labels: Vec<GhLabel>,
}

#[derive(Deserialize)]
struct GhLabel {
    name: String,
}

/// Parses `gh issue list --json …` output into `Issue`s.
pub fn parse_issues(json: &str) -> Result<Vec<Issue>, String> {
    let raw: Vec<GhIssue> =
        serde_json::from_str(json).map_err(|e| format!("could not parse gh output: {e}"))?;
    Ok(raw
        .into_iter()
        .map(|i| Issue {
            number: i.number,
            title: i.title,
            url: i.url,
            labels: i.labels.into_iter().map(|l| l.name).collect(),
        })
        .collect())
}

/// A deterministic, ref-safe branch name for an issue: `issue-<n>-<slug>`,
/// where the slug is the lowercased title with non-alphanumeric runs collapsed
/// to single dashes, trimmed, and length-capped. Degenerate slugs fall back to
/// `issue-<n>`.
pub fn branch_name_for_issue(number: u64, title: &str) -> String {
    let mut slug = String::new();
    let mut prev_dash = false;
    for ch in title.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
            prev_dash = false;
        } else if !prev_dash && !slug.is_empty() {
            slug.push('-');
            prev_dash = true;
        }
    }
    let slug = slug.trim_matches('-');
    let slug: String = slug.chars().take(40).collect();
    let slug = slug.trim_end_matches('-');
    if slug.is_empty() {
        format!("issue-{number}")
    } else {
        format!("issue-{number}-{slug}")
    }
}

/// Runs `cmd` (git or gh) with a fixed argv, optionally with its working
/// directory set to `cwd` (for invocations that read a specific local repo).
async fn run_git_or_gh(cmd: &str, args: &[&str], cwd: Option<&Path>) -> Result<String, String> {
    let mut command = Command::new(cmd);
    if let Some(dir) = cwd {
        command.current_dir(dir);
    }
    let out = command
        .args(args)
        .stdin(Stdio::null())
        .output()
        .await
        .map_err(|e| format!("failed to run {cmd}: {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

/// Whether the `gh` CLI is available.
pub async fn gh_available() -> bool {
    Command::new("gh")
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Turns a failed `git remote get-url origin` stderr into a user-facing
/// message: the friendly "no origin" message when that's specifically what
/// went wrong, otherwise the underlying git error so real failures (deleted
/// repo path, git missing, permissions) aren't hidden.
pub fn remote_lookup_error_message(stderr: &str) -> String {
    if stderr.to_lowercase().contains("no such remote") {
        "this project has no `origin` remote".to_string()
    } else {
        format!("could not read git remote: {stderr}")
    }
}

/// Extracts a display host from a git remote URL, for error messages only
/// (not a strict parser): `scheme://host/...`, `user@host:path` (scp-like),
/// and `ssh://[user@]host/path` shapes. `None` when no host-like segment is
/// found (e.g. a local filesystem path).
pub fn remote_display_host(url: &str) -> Option<String> {
    let url = url.trim();
    let host = if let Some(rest) = url
        .strip_prefix("ssh://")
        .or_else(|| url.strip_prefix("git://"))
        .or_else(|| url.strip_prefix("https://"))
        .or_else(|| url.strip_prefix("http://"))
    {
        let after_at = rest.rsplit('@').next().unwrap_or(rest);
        after_at.split(['/', ':']).next()?
    } else if let Some(idx) = url.find('@') {
        // scp-like: git@host:owner/repo
        url[idx + 1..].split(':').next()?
    } else {
        return None;
    };
    if host.is_empty() { None } else { Some(host.to_string()) }
}

/// Chooses the "no usable GitHub remote" message: a genuinely missing/local
/// remote gets the plain message, while a remote that resolves to a real,
/// non-github.com host gets a message naming the limitation and the host.
pub fn no_github_remote_message(remote: &str) -> String {
    match remote_display_host(remote) {
        Some(host) if !host.eq_ignore_ascii_case("github.com") => {
            format!("only github.com remotes are supported (found: {host})")
        }
        _ => "this project has no GitHub remote".to_string(),
    }
}

/// Open issues for the project at `repo_path`, via the user's authenticated
/// `gh`. Errors are user-facing messages (gh missing, not authed, no GitHub
/// remote, rate limited).
pub async fn issues(repo_path: &Path) -> Result<Vec<Issue>, String> {
    if !gh_available().await {
        return Err("install the GitHub CLI (gh) and run `gh auth login` to use GitHub features".into());
    }
    let remote = run_git_or_gh("git", &["remote", "get-url", "origin"], Some(repo_path))
        .await
        .map_err(|e| remote_lookup_error_message(&e))?;
    let (owner, repo) = owner_repo_from_remote(remote.trim())
        .ok_or_else(|| no_github_remote_message(remote.trim()))?;
    let slug = format!("{owner}/{repo}");
    let json = run_git_or_gh(
        "gh",
        &["issue", "list", "--repo", &slug, "--state", "open", "--json", "number,title,url,labels", "--limit", "50"],
        None,
    )
    .await?;
    parse_issues(&json)
}

/// Outcome of starting work on an issue: the created task, the branch name,
/// and a human note about whether the branch was created or already existed.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartedTask {
    pub task: rabta_db::Task,
    pub branch: String,
    pub branch_note: String,
}

/// Creates a task for an issue (`#N <title>`) and best-effort creates+switches
/// a safe `issue-N-slug` branch. Task creation is independent of the branch;
/// the branch uses phase-9's safe `create_branch` (carries changes, never
/// discards) and its outcome is reported, never fatal.
pub async fn start_issue_task(
    db: &Db,
    repo_path: &Path,
    project_id: &str,
    number: u64,
    title: &str,
) -> Result<StartedTask, String> {
    let task = db
        .create_task(NewTask {
            project_id: project_id.to_string(),
            title: format!("#{number} {title}"),
        })
        .map_err(|e| e.to_string())?;
    let branch = branch_name_for_issue(number, title);
    let branch_note = match crate::git::create_branch(repo_path, &branch).await {
        Ok(()) => format!("created and switched to {branch}"),
        Err(e) => format!("branch {branch} not created: {e}"),
    };
    Ok(StartedTask { task, branch, branch_note })
}
