//! GitHub reads via the user's `gh` CLI. Like `git.rs`, every call runs the
//! user's own authenticated binary with a fixed argv (never a shell) — OmniBus
//! never sees, stores, or transmits a GitHub credential.
use std::path::Path;
use std::process::Stdio;

use serde::{Deserialize, Serialize};
use tokio::process::Command;

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

async fn run(cmd: &str, args: &[&str]) -> Result<String, String> {
    let out = Command::new(cmd)
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

/// Open issues for the project at `repo_path`, via the user's authenticated
/// `gh`. Errors are user-facing messages (gh missing, not authed, no GitHub
/// remote, rate limited).
pub async fn issues(repo_path: &Path) -> Result<Vec<Issue>, String> {
    if !gh_available().await {
        return Err("install the GitHub CLI (gh) and run `gh auth login` to use GitHub features".into());
    }
    let remote = run_in(repo_path, "git", &["remote", "get-url", "origin"])
        .await
        .map_err(|_| "this project has no `origin` remote".to_string())?;
    let (owner, repo) = owner_repo_from_remote(remote.trim())
        .ok_or_else(|| "this project has no GitHub remote".to_string())?;
    let slug = format!("{owner}/{repo}");
    let json = run(
        "gh",
        &["issue", "list", "--repo", &slug, "--state", "open", "--json", "number,title,url,labels", "--limit", "50"],
    )
    .await?;
    parse_issues(&json)
}

/// Runs a command with its working directory set to `repo` (for `git`/`gh`
/// invocations that read the local repo).
async fn run_in(repo: &Path, cmd: &str, args: &[&str]) -> Result<String, String> {
    let out = Command::new(cmd)
        .current_dir(repo)
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
