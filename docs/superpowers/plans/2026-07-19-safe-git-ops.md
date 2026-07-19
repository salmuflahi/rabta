# Safe Git Operations (Phase 9) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safe git status/branches/fetch/checkout/create for registered projects, branch state in capsules (applied before editor restore), git controls in the Projects view, plus the absorbed phase-6 follow-ups.

**Architecture:** `git.rs` module in the desktop crate shells out to the user's `git` with fixed argv arrays and owns the safety rails (validation, dirty-preflight, no forbidden verbs anywhere). Capsules treat `git` as a virtual kind. Tauri commands stay thin; UI adds a git line per project.

**Tech Stack:** existing; `tokio::process` (tokio `process` feature added to the desktop crate).

**Spec:** `docs/superpowers/specs/2026-07-19-omnibus-safe-git-ops-design.md` — read before starting. The safety contract is binding on every task.

## Global Constraints

- Forbidden verbs never appear in any argv: no `-f`/`--force`, `reset`, `stash`, `clean`, `branch -D`. Grep-enforceable.
- Every user-supplied branch name passes `validate_branch_name` (reject empty / `-`-prefixed before running `git check-ref-format --branch`) before ANY other use.
- Checkout preflight order: validate name → status dirty? refuse with exactly the message `working tree has uncommitted changes — OmniBus never discards or stashes your work; commit or stash manually first` → branch missing locally? refuse → `git switch <branch>`.
- Capsule git rows: `connector_kind: "git"`, `resource_type: "branch"`, payload `{"branch": <name>}`; restore processes git BEFORE connector kinds; refusals go to summary errors + skipped and never block editor restore; detached HEAD at save → skipped `git: detached HEAD`.
- All git ops via `tokio::process::Command("git").arg("-C").arg(repo)` + fixed args; never a shell.
- Environment: cargo NOT on default PATH (`export PATH="$HOME/.cargo/bin:$PATH"`); git CLI available; generous timeouts. Builds warning-free; public items documented.

---

### Task 1: `git.rs` + temp-repo integration tests

**Files:**
- Create: `apps/desktop/src-tauri/src/git.rs`, `apps/desktop/src-tauri/tests/common/mod.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs` (add `pub mod git;` only), `apps/desktop/src-tauri/Cargo.toml` (tokio `process` feature)
- Test: `apps/desktop/src-tauri/tests/git.rs`

**Interfaces:**
- Produces: `git::GitStatus { branch: Option<String>, dirty: bool, changed_count: u32, ahead: u32, behind: u32 }` (Serialize camelCase); `async status(&Path)`, `branches(&Path) -> Vec<String>`, `fetch(&Path) -> String`, `checkout(&Path, &str)`, `create_branch(&Path, &str)`, `validate_branch_name(&str)` — all `Result<_, String>`. Test helpers in `tests/common/mod.rs`: `async fn git(repo: &Path, args: &[&str])`, `async fn repo_with_commit() -> TempDir`.

- [ ] **Step 1: deps + helpers + failing tests**

`apps/desktop/src-tauri/Cargo.toml`: extend the tokio dependency features to `["sync", "macros", "rt-multi-thread", "time", "process"]`.

`apps/desktop/src-tauri/tests/common/mod.rs`:
```rust
//! Shared git test helpers: real temp repos driven by the git CLI.
use std::path::Path;

/// Runs a raw git command in a test repo, panicking on failure.
pub async fn git(repo: &Path, args: &[&str]) {
    let out = tokio::process::Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .output()
        .await
        .expect("git runs");
    assert!(out.status.success(), "git {args:?} failed: {}", String::from_utf8_lossy(&out.stderr));
}

/// A temp repo on branch `main` with one committed file `a.txt`.
pub async fn repo_with_commit() -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    let p = dir.path();
    git(p, &["init", "-b", "main"]).await;
    git(p, &["config", "user.email", "test@omnibus.dev"]).await;
    git(p, &["config", "user.name", "OmniBus Test"]).await;
    git(p, &["config", "commit.gpgsign", "false"]).await;
    std::fs::write(p.join("a.txt"), "one\n").unwrap();
    git(p, &["add", "."]).await;
    git(p, &["commit", "-m", "init"]).await;
    dir
}
```

`apps/desktop/src-tauri/tests/git.rs`:
```rust
mod common;

use common::{git, repo_with_commit};
use omnibus_desktop_lib::git::{branches, checkout, create_branch, fetch, status, validate_branch_name};

#[tokio::test]
async fn status_reports_clean_branch() {
    let repo = repo_with_commit().await;
    let st = status(repo.path()).await.unwrap();
    assert_eq!(st.branch.as_deref(), Some("main"));
    assert!(!st.dirty);
    assert_eq!(st.changed_count, 0);
}

#[tokio::test]
async fn status_counts_dirty_and_untracked() {
    let repo = repo_with_commit().await;
    std::fs::write(repo.path().join("a.txt"), "changed\n").unwrap();
    std::fs::write(repo.path().join("new.txt"), "x\n").unwrap();
    let st = status(repo.path()).await.unwrap();
    assert!(st.dirty);
    assert_eq!(st.changed_count, 2);
}

#[tokio::test]
async fn status_detached_head_has_no_branch() {
    let repo = repo_with_commit().await;
    git(repo.path(), &["checkout", "--detach"]).await;
    let st = status(repo.path()).await.unwrap();
    assert_eq!(st.branch, None);
}

#[tokio::test]
async fn checkout_switches_clean_tree_and_lists_branches() {
    let repo = repo_with_commit().await;
    create_branch(repo.path(), "feature").await.unwrap();
    assert_eq!(status(repo.path()).await.unwrap().branch.as_deref(), Some("feature"));
    checkout(repo.path(), "main").await.unwrap();
    assert_eq!(status(repo.path()).await.unwrap().branch.as_deref(), Some("main"));
    let mut b = branches(repo.path()).await.unwrap();
    b.sort();
    assert_eq!(b, vec!["feature", "main"]);
}

#[tokio::test]
async fn checkout_refuses_dirty_tree_untouched() {
    let repo = repo_with_commit().await;
    create_branch(repo.path(), "feature").await.unwrap();
    checkout(repo.path(), "main").await.unwrap();
    std::fs::write(repo.path().join("a.txt"), "precious uncommitted work\n").unwrap();
    let err = checkout(repo.path(), "feature").await.unwrap_err();
    assert!(err.contains("never discards"), "got: {err}");
    assert_eq!(status(repo.path()).await.unwrap().branch.as_deref(), Some("main"));
    assert_eq!(
        std::fs::read_to_string(repo.path().join("a.txt")).unwrap(),
        "precious uncommitted work\n",
        "tree must be byte-identical after refusal"
    );
}

#[tokio::test]
async fn checkout_refuses_missing_branch() {
    let repo = repo_with_commit().await;
    let err = checkout(repo.path(), "ghost").await.unwrap_err();
    assert!(err.contains("does not exist locally"), "got: {err}");
}

#[tokio::test]
async fn create_branch_while_dirty_carries_changes() {
    let repo = repo_with_commit().await;
    std::fs::write(repo.path().join("a.txt"), "wip\n").unwrap();
    create_branch(repo.path(), "wip-branch").await.unwrap();
    let st = status(repo.path()).await.unwrap();
    assert_eq!(st.branch.as_deref(), Some("wip-branch"));
    assert!(st.dirty, "changes carried, not lost");
    assert_eq!(std::fs::read_to_string(repo.path().join("a.txt")).unwrap(), "wip\n");
}

#[tokio::test]
async fn hostile_branch_names_rejected() {
    let repo = repo_with_commit().await;
    for bad in ["-f", "--upload-pack=/bin/sh", "", "bad..name", "end.lock", "spa ce"] {
        assert!(validate_branch_name(bad).await.is_err(), "{bad:?} must be rejected");
        assert!(checkout(repo.path(), bad).await.is_err());
        assert!(create_branch(repo.path(), bad).await.is_err());
    }
    assert_eq!(status(repo.path()).await.unwrap().branch.as_deref(), Some("main"));
}

#[tokio::test]
async fn fetch_updates_ahead_behind_against_local_remote() {
    let bare = tempfile::tempdir().unwrap();
    git(bare.path(), &["init", "--bare", "-b", "main"]).await;
    let bare_url = bare.path().to_str().unwrap().to_string();

    let repo = repo_with_commit().await;
    git(repo.path(), &["remote", "add", "origin", &bare_url]).await;
    git(repo.path(), &["push", "-u", "origin", "main"]).await;
    let st = status(repo.path()).await.unwrap();
    assert_eq!((st.ahead, st.behind), (0, 0));

    // Local commit -> ahead 1.
    std::fs::write(repo.path().join("b.txt"), "b\n").unwrap();
    git(repo.path(), &["add", "."]).await;
    git(repo.path(), &["commit", "-m", "local"]).await;
    assert_eq!(status(repo.path()).await.unwrap().ahead, 1);

    // Commit from a second clone -> behind 1 after fetch.
    let clone = tempfile::tempdir().unwrap();
    git(clone.path(), &["clone", &bare_url, "."]).await;
    git(clone.path(), &["config", "user.email", "test@omnibus.dev"]).await;
    git(clone.path(), &["config", "user.name", "OmniBus Test"]).await;
    std::fs::write(clone.path().join("c.txt"), "c\n").unwrap();
    git(clone.path(), &["add", "."]).await;
    git(clone.path(), &["commit", "-m", "remote side"]).await;
    git(clone.path(), &["push"]).await;

    fetch(repo.path()).await.unwrap();
    let st = status(repo.path()).await.unwrap();
    assert_eq!((st.ahead, st.behind), (1, 1));
}
```

- [ ] **Step 2: RED** — `cargo test -p omnibus-desktop --test git` → compile error, no `git` module.

- [ ] **Step 3: Implement `apps/desktop/src-tauri/src/git.rs`**

```rust
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
```

Add `pub mod git;` to `lib.rs`.

- [ ] **Step 4: GREEN** — `cargo test -p omnibus-desktop --test git` → 9 tests pass; full `cargo test` green, zero warnings. Safety grep: `grep -nE '"(reset|stash|clean)"|--force|"-f"|"-D"' apps/desktop/src-tauri/src/git.rs` → no hits.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: safe git operations module with temp-repo integration tests"`

---

### Task 2: DB getters + capsule git dimension

**Files:**
- Modify: `crates/omnibus-db/src/records.rs`, `crates/omnibus-db/tests/records.rs`, `apps/desktop/src-tauri/src/capsules.rs`
- Test: `apps/desktop/src-tauri/tests/capsules.rs` (append; add `mod common;`)

**Interfaces:**
- Produces: `Db::get_task(&self, id: &str) -> Result<Option<Task>>`, `Db::get_project(&self, id: &str) -> Result<Option<Project>>`; capsule capture/restore of the `git` virtual kind per Global Constraints.

- [ ] **Step 1: Failing tests**

Append to `crates/omnibus-db/tests/records.rs`:
```rust
#[test]
fn get_task_and_project_by_id() {
    let db = db();
    let p = a_project(&db, "omnibus");
    let t = db.create_task(NewTask { project_id: p.id.clone(), title: "t".into() }).unwrap();
    assert_eq!(db.get_project(&p.id).unwrap().unwrap().name, "omnibus");
    assert_eq!(db.get_task(&t.id).unwrap().unwrap().title, "t");
    assert!(db.get_project("nope").unwrap().is_none());
    assert!(db.get_task("nope").unwrap().is_none());
}
```

Append to `apps/desktop/src-tauri/tests/capsules.rs` (add `mod common;` + `use common::{git, repo_with_commit};` at top; keep existing helpers):
```rust
async fn project_with_repo(db: &Db, repo: &std::path::Path) -> String {
    let p = db
        .create_project(omnibus_db::NewProject {
            name: format!("git-proj-{}", repo.display()),
            repo_path: repo.to_str().unwrap().to_string(),
            dev_url: None,
            default_branch: "main".into(),
        })
        .unwrap();
    db.create_task(omnibus_db::NewTask { project_id: p.id, title: "git task".into() }).unwrap().id
}

#[tokio::test]
async fn save_capsule_records_current_branch() {
    let (hub, db, capsules, _t, _dir) = setup().await;
    let _ = hub; // no connectors needed
    let repo = repo_with_commit().await;
    let task = project_with_repo(&db, repo.path()).await;

    let summary = capsules.save_capsule(&task).await.unwrap();
    assert!(summary.captured.contains(&"git".to_string()), "got {summary:?}");

    let rows = db.task_resources(&task).unwrap();
    let git_row = rows.iter().find(|r| r.connector_kind == "git").unwrap();
    assert_eq!(git_row.resource_type, "branch");
    assert_eq!(git_row.payload["branch"], serde_json::json!("main"));
}

#[tokio::test]
async fn activate_restores_branch_on_clean_tree() {
    let (_hub, db, capsules, _t, _dir) = setup().await;
    let repo = repo_with_commit().await;
    let task = project_with_repo(&db, repo.path()).await;
    db.replace_task_resources(&task, "git", "branch", &serde_json::json!({"branch": "main"}))
        .unwrap();
    // Move the repo off main; activation must bring it back.
    git(repo.path(), &["switch", "-c", "elsewhere"]).await;

    let summary = capsules.activate_task(&task).await.unwrap();
    assert!(summary.applied.contains(&"git".to_string()), "got {summary:?}");
    assert_eq!(
        omnibus_desktop_lib::git::status(repo.path()).await.unwrap().branch.as_deref(),
        Some("main")
    );
}

#[tokio::test]
async fn activate_refuses_branch_switch_on_dirty_tree() {
    let (_hub, db, capsules, _t, _dir) = setup().await;
    let repo = repo_with_commit().await;
    let task = project_with_repo(&db, repo.path()).await;
    db.replace_task_resources(&task, "git", "branch", &serde_json::json!({"branch": "main"}))
        .unwrap();
    git(repo.path(), &["switch", "-c", "elsewhere"]).await;
    std::fs::write(repo.path().join("a.txt"), "precious\n").unwrap();

    let summary = capsules.activate_task(&task).await.unwrap();
    assert!(summary.skipped.contains(&"git".to_string()), "got {summary:?}");
    assert!(summary.errors.iter().any(|e| e.contains("never discards")), "got {summary:?}");
    assert_eq!(
        omnibus_desktop_lib::git::status(repo.path()).await.unwrap().branch.as_deref(),
        Some("elsewhere"),
        "branch unchanged"
    );
    assert_eq!(std::fs::read_to_string(repo.path().join("a.txt")).unwrap(), "precious\n");
}
```
(`setup()` already creates an unrelated project+task; these tests create their own with a real repo path. `project_with_repo` uses a display-based unique name to dodge the UNIQUE constraint.)

- [ ] **Step 2: RED** — `cargo test -p omnibus-db --test records` (missing getters) and `cargo test -p omnibus-desktop --test capsules` (missing behavior) both fail to compile/pass.

- [ ] **Step 3: Implement**

`crates/omnibus-db/src/records.rs` — add to `impl Db` (plus `use rusqlite::OptionalExtension;` at the module top):
```rust
    /// One project by id.
    pub fn get_project(&self, id: &str) -> Result<Option<Project>> {
        let conn = self.conn.lock().unwrap();
        Ok(conn
            .query_row(
                "SELECT id, name, repo_path, dev_url, default_branch, created_at, updated_at \
                 FROM projects WHERE id = ?1",
                params![id],
                |r| {
                    Ok(Project {
                        id: r.get(0)?,
                        name: r.get(1)?,
                        repo_path: r.get(2)?,
                        dev_url: r.get(3)?,
                        default_branch: r.get(4)?,
                        created_at: r.get(5)?,
                        updated_at: r.get(6)?,
                    })
                },
            )
            .optional()?)
    }

    /// One task by id.
    pub fn get_task(&self, id: &str) -> Result<Option<Task>> {
        let conn = self.conn.lock().unwrap();
        Ok(conn
            .query_row(
                "SELECT id, project_id, title, status, created_at, updated_at \
                 FROM tasks WHERE id = ?1",
                params![id],
                |r| {
                    Ok(Task {
                        id: r.get(0)?,
                        project_id: r.get(1)?,
                        title: r.get(2)?,
                        status: TaskStatus::parse(&r.get::<_, String>(3)?),
                        created_at: r.get(4)?,
                        updated_at: r.get(5)?,
                    })
                },
            )
            .optional()?)
    }
```

`apps/desktop/src-tauri/src/capsules.rs` — three additions:

1. Private helper:
```rust
    /// The repo path of the project owning `task_id`, if both still exist.
    async fn repo_for_task(&self, task_id: &str) -> Result<Option<String>, String> {
        let db = self.db.clone();
        let tid = task_id.to_string();
        tokio::task::spawn_blocking(move || -> Result<Option<String>, String> {
            let Some(task) = db.get_task(&tid).map_err(|e| e.to_string())? else {
                return Ok(None);
            };
            Ok(db
                .get_project(&task.project_id)
                .map_err(|e| e.to_string())?
                .map(|p| p.repo_path))
        })
        .await
        .map_err(|e| e.to_string())?
    }
```

2. In `save_capsule`, after the connector loop (before `Ok(...)`):
```rust
        // The "git" virtual kind: capture the project's current branch.
        match self.repo_for_task(task_id).await {
            Ok(Some(repo)) => match crate::git::status(std::path::Path::new(&repo)).await {
                Ok(st) => match st.branch {
                    Some(branch) => {
                        let db = self.db.clone();
                        let tid = task_id.to_string();
                        let payload = serde_json::json!({ "branch": branch });
                        tokio::task::spawn_blocking(move || {
                            db.replace_task_resources(&tid, "git", "branch", &payload)
                        })
                        .await
                        .map_err(|e| e.to_string())?
                        .map_err(|e| e.to_string())?;
                        captured.push("git".to_string());
                    }
                    None => skipped.push("git: detached HEAD".to_string()),
                },
                Err(e) => skipped.push(format!("git: {e}")),
            },
            Ok(None) => skipped.push("git: task or project not found".to_string()),
            Err(e) => skipped.push(format!("git: {e}")),
        }
```

3. In `activate_task`, immediately AFTER reading `resources` and BEFORE the connector loop (branch switches change files on disk; the editor must restore after):
```rust
        // Git first: a branch switch changes files on disk, so editor
        // restore must come after. Refusals are reported, never forced.
        if let Some(git_row) = resources
            .iter()
            .find(|r| r.connector_kind == "git" && r.resource_type == "branch")
        {
            match (git_row.payload["branch"].as_str(), self.repo_for_task(task_id).await) {
                (Some(target), Ok(Some(repo))) => {
                    let repo = std::path::Path::new(&repo);
                    match crate::git::status(repo).await {
                        Ok(st) if st.branch.as_deref() == Some(target) => {
                            applied.push("git".to_string());
                        }
                        Ok(_) => match crate::git::checkout(repo, target).await {
                            Ok(()) => applied.push("git".to_string()),
                            Err(e) => {
                                errors.push(format!("git: {e}"));
                                skipped.push("git".to_string());
                            }
                        },
                        Err(e) => {
                            errors.push(format!("git: {e}"));
                            skipped.push("git".to_string());
                        }
                    }
                }
                (None, _) => skipped.push("git".to_string()),
                (_, Ok(None)) => {
                    errors.push("git: task or project not found".to_string());
                    skipped.push("git".to_string());
                }
                (_, Err(e)) => {
                    errors.push(format!("git: {e}"));
                    skipped.push("git".to_string());
                }
            }
        }
```
(The existing connector loop already filters `resource_type == "workspace"`, so the git row never reaches it. Declare `applied`/`pending`/`skipped`/`errors` before this block if the current code declares them later.)

- [ ] **Step 4: GREEN** — `cargo test -p omnibus-db` and `cargo test -p omnibus-desktop` all green (capsules now 10 tests), zero warnings; run capsules 2x for stability.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: capsules capture and restore git branch state safely"`

---

### Task 3: Tauri commands + absorbed phase-6 follow-ups

**Files:**
- Modify: `apps/desktop/src-tauri/src/lib.rs`, `apps/desktop/src-tauri/src/projects.rs`, `apps/desktop/src-tauri/tauri.conf.json`
- Test: `apps/desktop/src-tauri/tests/projects.rs` (append)

**Interfaces:**
- Produces (Task 4 contract): commands `git_status{projectId}` → GitStatus, `git_branches{projectId}` → string[], `git_fetch{projectId}` → string, `git_checkout{projectId, branch}`, `git_create_branch{projectId, name}` — all `Result<_, String>`.

- [ ] **Step 1: Commands** — in `lib.rs` add a helper + five commands (extend imports with `use crate::git::GitStatus; use std::path::PathBuf;`):
```rust
/// Resolves a registered project's repo path or a clear error.
async fn repo_of(db: &DbHandle, project_id: &str) -> Result<PathBuf, String> {
    let db = db.0.clone();
    let id = project_id.to_string();
    let project = tauri::async_runtime::spawn_blocking(move || db.get_project(&id))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    project.map(|p| PathBuf::from(p.repo_path)).ok_or_else(|| "project not found".to_string())
}

/// Current git status of a registered project.
#[tauri::command]
async fn git_status(db: State<'_, DbHandle>, project_id: String) -> Result<GitStatus, String> {
    git::status(&repo_of(&db, &project_id).await?).await
}

/// Local branches of a registered project.
#[tauri::command]
async fn git_branches(db: State<'_, DbHandle>, project_id: String) -> Result<Vec<String>, String> {
    git::branches(&repo_of(&db, &project_id).await?).await
}

/// `git fetch --all` — updates remote-tracking refs, never merges.
#[tauri::command]
async fn git_fetch(db: State<'_, DbHandle>, project_id: String) -> Result<String, String> {
    git::fetch(&repo_of(&db, &project_id).await?).await
}

/// Safe branch switch: refuses on a dirty tree, never forces.
#[tauri::command]
async fn git_checkout(db: State<'_, DbHandle>, project_id: String, branch: String) -> Result<(), String> {
    git::checkout(&repo_of(&db, &project_id).await?, &branch).await
}

/// Creates and switches to a new branch (safe with uncommitted changes).
#[tauri::command]
async fn git_create_branch(db: State<'_, DbHandle>, project_id: String, name: String) -> Result<(), String> {
    git::create_branch(&repo_of(&db, &project_id).await?, &name).await
}
```
Extend `invoke_handler` with the five commands (21 total).

- [ ] **Step 2: Absorbed follow-ups**
1. `tauri.conf.json`: `"security": { "csp": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'" }`.
2. `projects.rs` `validate_and_create`: first lines become
```rust
    let repo_path = repo_path.trim();
    let dev_url = dev_url.map(str::trim).filter(|s| !s.is_empty());
```
(shadowing the parameters; the rest of the body unchanged — it already stores `repo_path.to_string()` / `dev_url.map(...)` from the shadowed values).
3. `projects.rs` `friendly_db_error` fallback branch:
```rust
    } else {
        eprintln!("project save failed: {msg}");
        "failed to save project — see the app log for details".to_string()
    }
```
4. Append to `tests/projects.rs`:
```rust
#[test]
fn create_trims_repo_path_and_dev_url() {
    let db = db();
    let dir = git_fixture("ref: refs/heads/main\n");
    let padded = format!("  {}  ", dir.path().to_str().unwrap());
    let p = validate_and_create(&db, "trimmed", &padded, Some("  http://localhost:3000  "), "main")
        .unwrap();
    assert_eq!(p.repo_path, dir.path().to_str().unwrap());
    assert_eq!(p.dev_url.as_deref(), Some("http://localhost:3000"));
}
```

- [ ] **Step 3: Verify** — `cargo check` zero warnings; `cargo build -p omnibus-desktop`; full `cargo test` green (projects now 9); `pnpm --filter desktop build` still green (CSP is config-only).
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: git Tauri commands; absorb CSP, trimming, and error-wording follow-ups"`

---

### Task 4: Projects-view git line + task git summary

**Files:**
- Create: `apps/desktop/src/views/GitLine.tsx`
- Modify: `apps/desktop/src/views/ProjectsView.tsx`, `apps/desktop/src/views/TasksSection.tsx`

**Interfaces:**
- Consumes: Task 3's five commands (`{projectId}`, `{projectId, branch}`, `{projectId, name}`); `GitStatus` camelCase wire shape.

- [ ] **Step 1: `apps/desktop/src/views/GitLine.tsx`**
```tsx
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

interface GitStatus {
  branch: string | null;
  dirty: boolean;
  changedCount: number;
  ahead: number;
  behind: number;
}

export function GitLine({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [target, setTarget] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      setStatus(await invoke<GitStatus>("git_status", { projectId }));
      setBranches(await invoke<string[]>("git_branches", { projectId }));
    } catch (e) {
      setNote(String(e));
    }
  };

  useEffect(() => {
    refresh();
  }, [projectId]);

  async function run(command: string, args: Record<string, unknown>, okNote: string) {
    setBusy(true);
    setNote("");
    try {
      await invoke(command, { projectId, ...args });
      setNote(okNote);
      await refresh();
    } catch (e) {
      setNote(String(e));
    } finally {
      setBusy(false);
    }
  }

  const s = status;
  return (
    <div className="mt-1 flex items-center gap-2 text-xs flex-wrap">
      {s ? (
        <span className={s.dirty ? "text-amber-400" : "text-neutral-400"}>
          ⎇ {s.branch ?? "detached"}
          {s.changedCount > 0 && ` · ${s.changedCount} changed`}
          {s.ahead > 0 && ` ↑${s.ahead}`}
          {s.behind > 0 && ` ↓${s.behind}`}
        </span>
      ) : (
        <span className="text-neutral-600">git…</span>
      )}
      <button onClick={() => run("git_fetch", {}, "fetched")} disabled={busy} className="bg-neutral-800 px-2 disabled:opacity-40">
        fetch
      </button>
      <select value={target} onChange={(e) => setTarget(e.target.value)} className="bg-neutral-800 p-0.5">
        <option value="">branch…</option>
        {branches.map((b) => (
          <option key={b} value={b}>{b}</option>
        ))}
      </select>
      <button
        onClick={() => run("git_checkout", { branch: target }, `switched to ${target}`)}
        disabled={busy || !target || target === s?.branch}
        className="bg-neutral-700 px-2 disabled:opacity-40"
      >
        switch
      </button>
      <input
        value={newBranch}
        onChange={(e) => setNewBranch(e.target.value)}
        placeholder="new branch"
        className="bg-neutral-800 p-0.5 w-28"
      />
      <button
        onClick={() => run("git_create_branch", { name: newBranch }, `created ${newBranch}`).then(() => setNewBranch(""))}
        disabled={busy || !newBranch}
        className="bg-neutral-800 px-2 disabled:opacity-40"
      >
        create
      </button>
      {note && <span className="text-neutral-400 break-all">{note}</span>}
    </div>
  );
}
```

- [ ] **Step 2: Mount + task summary**
- `ProjectsView.tsx`: import `GitLine`; render `<GitLine projectId={p.id} />` between the project header row and `<TasksSection …/>`.
- `TasksSection.tsx` `summarize()`: prepend
```ts
  if (r.connectorKind === "git") {
    return `git: ${typeof r.payload.branch === "string" ? r.payload.branch : "?"}`;
  }
```

- [ ] **Step 3: Verify** — `pnpm --filter desktop build` green; full `pnpm test` + `cargo test` green.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: git status and safe branch controls in the Projects view"`

---

### Task 5: Walkthrough + docs (controller-run)

- [ ] Full sweep; safety grep across the branch (`grep -rnE '"(reset|stash|clean)"|--force' apps/desktop/src-tauri/src/` → only allowed contexts, expect none).
- [ ] Live: app up; project row shows real branch/dirty state for `/Users/sammy/omnibus`; screenshots. Click-driven switch/create/fetch left to the user; all paths test-covered.
- [ ] Docs: README "Try it" git step; spec Status → Implemented. Commit: `docs: safe git ops walkthrough; phase 9 success criteria verified`.

---

## Self-review notes

- Spec coverage: safety contract (T1 validation/preflight + tests incl. byte-identical refusal), status/branches/fetch/checkout/create (T1), getters + capsule capture/restore ordering git-first (T2), five commands + CSP + trim + error wording (T3), UI line + summaries (T4), sweep/walkthrough (T5).
- Type consistency: `GitStatus` camelCase ↔ TS interface; command arg keys `{projectId, branch, name}`; capsule git row shape `{"branch"}` shared by T2 capture/restore/tests and T4 summary.
- `tests/common/mod.rs` is shared by `tests/git.rs` and `tests/capsules.rs` via `mod common;` — each integration-test binary compiles it independently (standard Rust pattern); if the compiler warns about unused helpers in one binary, mark helpers `#[allow(dead_code)]` is NOT allowed — instead both binaries use both helpers (git.rs uses both; capsules uses both) so no warning arises.
- Restore ordering places git before connector work inside the SAME activation lock, so serialized-activation guarantees from phase 8 extend to git automatically.
