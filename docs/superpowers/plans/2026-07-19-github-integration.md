# GitHub Integration (Phase 11) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read a project's open GitHub issues via the user's `gh` CLI and start a task from an issue with a safe `issue-N-slug` branch; no credential ever stored.

**Architecture:** A `github.rs` module in the desktop crate shells out to `gh` (fixed argv, like phase-9's `git.rs`), with pure helpers for owner/repo parsing, issue-JSON parsing, and branch-name slugging. `start_issue_task` composes `omnibus-db` (create task) + `git.rs` (safe branch). Thin Tauri commands; a GitHub section in the Projects view.

**Spec:** `docs/superpowers/specs/2026-07-19-omnibus-github-integration-design.md`.

## Global Constraints

- OmniBus stores/handles NO GitHub token — auth is entirely the user's `gh`. No token in db, logs, events, or command args.
- All `gh`/`git` calls use `tokio::process::Command` with fixed argv, never a shell.
- Branch name = `issue-<number>-<slug>`; slug = lowercase title, non-alphanumeric runs → single `-`, trimmed, capped (e.g. 40 chars); empty/degenerate slug → `issue-<number>`. Must always pass phase-9's `git::validate_branch_name`.
- `start_issue_task`: task creation always succeeds independent of the branch; branch is best-effort, its outcome reported, never fatal; reuses `git::create_branch` (safe — carries dirty changes, never discards).
- `gh` absent/unauthed and no-GitHub-remote are normal reported outcomes, not crashes.
- `Issue` serializes camelCase. No protocol/hub/capsule-schema changes.
- Environment: cargo NOT on default PATH (`export PATH="$HOME/.cargo/bin:$PATH"`); `gh` is installed + authed on this machine; generous timeouts; nothing under `.superpowers/` committed. Warning-free; docs on public items.

---

### Task 1: `github.rs` pure helpers + `gh` reads

**Files:**
- Create: `apps/desktop/src-tauri/src/github.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs` (add `pub mod github;` only)
- Test: `apps/desktop/src-tauri/tests/github.rs`

**Interfaces:** `Issue { number:u64, title, url, labels:Vec<String> }` (Serialize camelCase); `owner_repo_from_remote(&str) -> Option<(String,String)>`; `parse_issues(&str) -> Result<Vec<Issue>,String>`; `branch_name_for_issue(u64,&str) -> String`; `async gh_available() -> bool`; `async issues(&Path) -> Result<Vec<Issue>,String>`.

- [ ] **Step 1: Failing tests** — `apps/desktop/src-tauri/tests/github.rs`:
```rust
use omnibus_desktop_lib::github::{branch_name_for_issue, owner_repo_from_remote, parse_issues};

#[test]
fn parses_owner_repo_from_remote_variants() {
    let cases = [
        ("git@github.com:sammy/omnibus.git", Some(("sammy", "omnibus"))),
        ("https://github.com/sammy/omnibus.git", Some(("sammy", "omnibus"))),
        ("https://github.com/sammy/omnibus", Some(("sammy", "omnibus"))),
        ("ssh://git@github.com/sammy/omnibus.git", Some(("sammy", "omnibus"))),
        ("https://gitlab.com/sammy/omnibus.git", None),
        ("/local/path/only", None),
        ("", None),
    ];
    for (url, want) in cases {
        let got = owner_repo_from_remote(url);
        assert_eq!(
            got.as_ref().map(|(o, r)| (o.as_str(), r.as_str())),
            want,
            "remote {url:?}"
        );
    }
}

#[test]
fn parses_issue_json() {
    let json = r#"[
      {"number": 42, "title": "Fix login", "url": "https://github.com/x/y/issues/42",
       "labels": [{"name": "bug"}, {"name": "p1"}]},
      {"number": 7, "title": "Docs", "url": "https://github.com/x/y/issues/7", "labels": []}
    ]"#;
    let issues = parse_issues(json).unwrap();
    assert_eq!(issues.len(), 2);
    assert_eq!(issues[0].number, 42);
    assert_eq!(issues[0].title, "Fix login");
    assert_eq!(issues[0].labels, vec!["bug", "p1"]);
    assert!(issues[1].labels.is_empty());

    assert_eq!(parse_issues("[]").unwrap().len(), 0);
    assert!(parse_issues("not json").is_err());
}

#[test]
fn slugs_branch_names_safely() {
    assert_eq!(branch_name_for_issue(42, "Fix login bug!"), "issue-42-fix-login-bug");
    assert_eq!(branch_name_for_issue(7, "  Spaces   & symbols @#$ "), "issue-7-spaces-symbols");
    assert_eq!(branch_name_for_issue(1, ""), "issue-1");
    assert_eq!(branch_name_for_issue(2, "!!!"), "issue-2");
    // long titles are capped; result stays a single clean segment
    let long = branch_name_for_issue(3, &"word ".repeat(50));
    assert!(long.starts_with("issue-3-word"));
    assert!(long.len() <= 55, "capped, got {}", long.len());
    // never ends with a dash, never doubles dashes
    for b in [
        branch_name_for_issue(42, "Fix login bug!"),
        branch_name_for_issue(7, "  Spaces   & symbols @#$ "),
        branch_name_for_issue(3, &"word ".repeat(50)),
    ] {
        assert!(!b.ends_with('-') && !b.contains("--"), "dirty slug: {b}");
    }
}

// Validation parity: every generated name must pass git's ref-format check
// (phase-9 rule). Uses the same binary the app uses.
#[tokio::test]
async fn generated_branch_names_pass_git_ref_format() {
    for (n, title) in [(42u64, "Fix login bug!"), (7, "!!!"), (1, ""), (99, "über cool ✨ feature")] {
        let name = branch_name_for_issue(n, title);
        let ok = tokio::process::Command::new("git")
            .args(["check-ref-format", "--branch", &name])
            .output()
            .await
            .unwrap()
            .status
            .success();
        assert!(ok, "git rejected generated branch {name:?}");
    }
}
```

- [ ] **Step 2: RED** — `cargo test -p omnibus-desktop --test github` → no module `github`.

- [ ] **Step 3: Implement `apps/desktop/src-tauri/src/github.rs`**
```rust
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
    let rest = rest.strip_suffix(".git").unwrap_or(rest).trim_end_matches('/');
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
```
Add `pub mod github;` to `lib.rs`. (`Cargo.toml` already has the tokio `process` feature from phase 9 — verify; if not, it's already present because `git.rs` needs it.)

- [ ] **Step 4: GREEN** — `cargo test -p omnibus-desktop --test github` → 4 tests pass; full `cargo test` green, zero warnings. Safety grep: `grep -nE '"(reset|stash|clean|delete|close)"' apps/desktop/src-tauri/src/github.rs` → no destructive/write verbs (gh is read-only here).
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: github.rs — gh-backed issue reads with pure, tested parsing"`

---

### Task 2: `start_issue_task` orchestration

**Files:**
- Modify: `apps/desktop/src-tauri/src/github.rs`
- Test: `apps/desktop/src-tauri/tests/github.rs` (append; reuse phase-9 `tests/common/mod.rs` git helpers)

**Interfaces:** `StartedTask { task: omnibus_db::Task, branch: String, branch_note: String }` (Serialize camelCase); `async start_issue_task(db: &Db, repo_path: &Path, project_id: &str, number: u64, title: &str) -> Result<StartedTask, String>`.

- [ ] **Step 1: Failing tests** — add `mod common;` at the top of `tests/github.rs` and append:
```rust
use common::repo_with_commit;
use omnibus_db::{Db, DbConfig, NewProject};
use omnibus_desktop_lib::github::start_issue_task;

async fn project_at(db: &Db, repo: &std::path::Path) -> String {
    db.create_project(NewProject {
        name: format!("p-{}", repo.display()),
        repo_path: repo.to_str().unwrap().to_string(),
        dev_url: None,
        default_branch: "main".into(),
    })
    .unwrap()
    .id
}

#[tokio::test]
async fn start_issue_task_creates_task_and_branch() {
    let repo = repo_with_commit().await;
    let db = Db::open_in_memory(DbConfig::default()).unwrap();
    let project_id = project_at(&db, repo.path()).await;

    let started = start_issue_task(&db, repo.path(), &project_id, 42, "Fix login bug!").await.unwrap();
    assert_eq!(started.task.title, "#42 Fix login bug!");
    assert_eq!(started.branch, "issue-42-fix-login-bug");
    // task persisted
    let tasks = db.list_tasks(&project_id).unwrap();
    assert_eq!(tasks.len(), 1);
    // branch switched
    assert_eq!(
        omnibus_desktop_lib::git::status(repo.path()).await.unwrap().branch.as_deref(),
        Some("issue-42-fix-login-bug")
    );
}

#[tokio::test]
async fn start_issue_task_carries_dirty_changes() {
    let repo = repo_with_commit().await;
    std::fs::write(repo.path().join("wip.txt"), "uncommitted\n").unwrap();
    let db = Db::open_in_memory(DbConfig::default()).unwrap();
    let project_id = project_at(&db, repo.path()).await;

    let started = start_issue_task(&db, repo.path(), &project_id, 5, "wip").await.unwrap();
    assert_eq!(started.branch, "issue-5-wip");
    // dirty file carried to the new branch, not discarded
    assert_eq!(std::fs::read_to_string(repo.path().join("wip.txt")).unwrap(), "uncommitted\n");
}

#[tokio::test]
async fn start_issue_task_reports_existing_branch_without_failing() {
    let repo = repo_with_commit().await;
    let db = Db::open_in_memory(DbConfig::default()).unwrap();
    let project_id = project_at(&db, repo.path()).await;

    start_issue_task(&db, repo.path(), &project_id, 9, "dup").await.unwrap();
    // second start of the same issue: branch already exists → still creates a task,
    // reports the branch outcome, does not error.
    let again = start_issue_task(&db, repo.path(), &project_id, 9, "dup").await.unwrap();
    assert_eq!(db.list_tasks(&project_id).unwrap().len(), 2);
    assert!(!again.branch_note.is_empty());
}
```

- [ ] **Step 2: RED** — `cargo test -p omnibus-desktop --test github` → no `start_issue_task`.

- [ ] **Step 3: Implement** — append to `github.rs`:
```rust
use omnibus_db::{Db, NewTask};

/// Outcome of starting work on an issue: the created task, the branch name,
/// and a human note about whether the branch was created or already existed.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartedTask {
    pub task: omnibus_db::Task,
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
```
(`create_task` is synchronous on `Db`; call it directly — the caller is already async and the DB lock is uncontended here. If the surrounding Tauri command needs `spawn_blocking`, that wrapping happens in Task 3, not here.)

- [ ] **Step 4: GREEN** — `cargo test -p omnibus-desktop --test github` → 7 tests; full `cargo test` green, zero warnings; run the github test 2x.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: start_issue_task creates a task and safe issue branch"`

---

### Task 3: Tauri commands + Projects-view GitHub section

**Files:**
- Modify: `apps/desktop/src-tauri/src/lib.rs`, `apps/desktop/src/views/ProjectsView.tsx`; Create: `apps/desktop/src/views/GitHubSection.tsx`

**Interfaces (frontend contract):** `github_available() -> bool`; `github_issues(projectId) -> Issue[]`; `start_issue_task(projectId, number, title) -> StartedTask` (camelCase).

- [ ] **Step 1: Commands** — in `lib.rs` add (extend imports with `use crate::github::{self, Issue, StartedTask};`, resolve the repo path via the existing `repo_of` helper from phase 9):
```rust
/// Whether the GitHub CLI is available for GitHub features.
#[tauri::command]
async fn github_available() -> bool {
    github::gh_available().await
}

/// Open GitHub issues for a project (via the user's `gh`).
#[tauri::command]
async fn github_issues(db: State<'_, DbHandle>, project_id: String) -> Result<Vec<Issue>, String> {
    let repo = repo_of(&db, &project_id).await?;
    github::issues(&repo).await
}

/// Starts a task from an issue: creates the task and a safe issue branch.
#[tauri::command]
async fn start_issue_task(
    db: State<'_, DbHandle>,
    project_id: String,
    number: u64,
    title: String,
) -> Result<StartedTask, String> {
    let repo = repo_of(&db, &project_id).await?;
    let db_inner = db.0.clone();
    github::start_issue_task(&db_inner, &repo, &project_id, number, &title).await
}
```
Register the three commands (28 total).

- [ ] **Step 2: `apps/desktop/src/views/GitHubSection.tsx`**
```tsx
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

interface Issue {
  number: number;
  title: string;
  url: string;
  labels: string[];
}

interface StartedTask {
  branch: string;
  branchNote: string;
}

export function GitHubSection({ projectId, onStarted }: { projectId: string; onStarted: () => void }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    invoke<boolean>("github_available").then(setAvailable).catch(() => setAvailable(false));
  }, []);

  async function fetchIssues() {
    setBusy(true);
    setNote("");
    try {
      setIssues(await invoke<Issue[]>("github_issues", { projectId }));
    } catch (e) {
      setNote(String(e));
      setIssues(null);
    } finally {
      setBusy(false);
    }
  }

  async function start(issue: Issue) {
    setBusy(true);
    setNote("");
    try {
      const s = await invoke<StartedTask>("start_issue_task", {
        projectId,
        number: issue.number,
        title: issue.title,
      });
      setNote(s.branchNote);
      onStarted();
    } catch (e) {
      setNote(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (available === false) {
    return (
      <div className="mt-1 text-xs text-neutral-600">
        GitHub: install the <code>gh</code> CLI and run <code>gh auth login</code> to fetch issues
      </div>
    );
  }

  return (
    <div className="mt-1 text-xs">
      <button onClick={fetchIssues} disabled={busy} className="bg-neutral-800 px-2 disabled:opacity-40">
        fetch issues
      </button>
      {note && <span className="ml-2 text-neutral-400 break-all">{note}</span>}
      {issues?.length === 0 && <div className="text-neutral-600 mt-1">no open issues</div>}
      {issues?.map((i) => (
        <div key={i.number} className="flex items-center gap-2 mt-1">
          <span className="flex-1">
            #{i.number} {i.title}
            {i.labels.length > 0 && <span className="text-neutral-500"> · {i.labels.join(", ")}</span>}
          </span>
          <button onClick={() => start(i)} disabled={busy} className="bg-neutral-700 px-2 disabled:opacity-40">
            start task
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Mount** — in `ProjectsView.tsx`, import `GitHubSection` and render `<GitHubSection projectId={p.id} onStarted={() => { /* nudge the tasks section to refresh */ }} />` between the `GitLine` and `TasksSection` for each project. TasksSection loads its own tasks on mount and after mutations; to make a newly-started task appear, give `TasksSection` a `refreshKey` prop or (simplest) remount it by keying it — pass a shared `startedNonce` state incremented in `onStarted` and used in `<TasksSection key={`${p.id}-${startedNonce}`} …/>`. Keep it minimal.

- [ ] **Step 4: Verify** — `pnpm --filter desktop build` green; `cargo check` zero warnings; full `cargo test` + `pnpm test` green.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: GitHub issues and start-task in the Projects view"`

---

### Task 4: Walkthrough + docs (controller-run)

- [ ] Full sweep; safety grep across `github.rs` (no write/destructive `gh` verbs). `gh` is authed on this machine, so the live path is real.
- [ ] Live: register a project whose repo has a GitHub `origin` remote (clone a small public repo with open issues, or use an existing one); `fetch issues` lists them; `start task` on one creates a task `#N …` and switches the git line to `issue-N-slug`; screenshot. Also confirm a non-GitHub project shows the "no GitHub remote" message.
- [ ] Docs: root README "Try it" GitHub step; spec Status → Implemented; and — this being the final phase — a short "Roadmap complete" note in the README pointing at all eleven phases. Commit: `docs: github integration walkthrough; phase 11 complete`.

---

## Self-review notes

- Coverage: gh-backed issues + absent/no-remote messages (T1 `issues`/`gh_available`), pure owner/repo + parse + slug incl. ref-format parity (T1 tests), task+safe-branch orchestration incl. dirty-carry + existing-branch (T2 tests), commands + UI (T3), walkthrough (T4). Privacy: no credential path anywhere — grep confirms no token handling.
- Cross-task: `Issue`/`StartedTask` camelCase ↔ TS interfaces; command arg keys `projectId`/`number`/`title`; `branch_name_for_issue` output consumed by `git::create_branch` which re-validates via `validate_branch_name` (defense in depth — the slug is already ref-safe, and the ref-format-parity test proves it).
- Reuses phase-9 `git::{create_branch, status, validate_branch_name}` and `tests/common` helpers, and phase-6's `repo_of` — no new git logic.
- `gh` invocation stays thin; the JSON contract is pinned by `parse_issues` fixtures, so a `gh` version drift in field names fails a unit test, not silently at runtime.
