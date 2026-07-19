# OmniBus — Safe Git Operations (Phase 9)

**Date:** 2026-07-19
**Status:** Draft for review
**Scope:** Git status/branches/fetch/checkout/create-branch for registered projects; branch state in capsules; git controls in the Projects view; absorbed phase-6 follow-ups (CSP, input trimming, storage-error wording).
**Out of scope:** pull/merge/rebase, commit/push, stash management, remote management, credential handling beyond the user's own git config, submodules, GitHub API (phase 11).

Builds on merged phases 1–8. Foundation Principles / Coding standards / DoD + vision Privacy Principles bind. The vision's development principle 4 — *never sacrifice user safety for convenience* — is this phase's organizing rule.

---

## Goal

**What:** OmniBus can see and safely change a project's git position. Project rows show live status (branch, dirty count, ahead/behind); the UI can fetch, switch to an existing local branch, and create a branch. Capsules gain a git dimension: saving records the branch, activating restores it — and refuses, loudly and harmlessly, when the working tree is dirty.

**The safety contract (non-negotiable):**

```
OmniBus will NEVER run:            OmniBus WILL refuse when:
  git checkout -f / --force          switching branches with a dirty tree
  git reset   (any form)             a branch name fails validation
  git stash   (any form)             the target branch doesn't exist locally
  git clean   (any form)
  git branch -D
A refusal is a normal, reported outcome — never a fallback to force.
```

### Success criteria

1. Registered project rows show git status: current branch (or detached), dirty-change count, ahead/behind counts; a fetch button updates ahead/behind.
2. Switching to an existing local branch from the UI works on a clean tree; on a dirty tree it is refused with a message naming the rule ("OmniBus never discards or stashes your work") and the tree is untouched.
3. Creating a branch works even with a dirty tree (carrying changes to a new branch loses nothing).
4. Saving a capsule records the project's current branch as a `git` resource row; the task summary shows it.
5. Activating a task restores the branch **before** editor state (clean tree → checkout; dirty tree → refusal reported in the activation summary; missing local branch → reported); editor restore proceeds regardless.
6. Safety is test-enforced: dirty-checkout refusal, branch-name injection rejection (e.g. a name starting with `-`), create-while-dirty, fetch against a local `file://` remote with ahead/behind assertions — all against real temp repos.
7. Absorbed follow-ups land: a real CSP in `tauri.conf.json`, `repo_path`/`dev_url` trimmed before validation/storage, storage-error fallback no longer leaks raw SQLite text.
8. All suites/builds green, warning-free; DoD holds.

## Non-goals

- No pull/merge/rebase — fetch only updates remote-tracking refs; integrating them is the human's call.
- No commit, push, stash, or history operations of any kind.
- No creating local branches from remote ones during restore (a missing local branch is a report, not an auto-create).
- No credential/auth handling: fetch runs with the user's own git configuration; its failures surface as messages.
- No submodule special-casing (git -C handles worktree-style checkouts already).
- The registration form's `.git/HEAD` file-peek stays as-is — it works without git installed and is fully tested; "phase 9 absorbs git" means `git.rs` owns real *operations*, not that working code gets churned.

---

## Key decision: shell out to the git CLI

**What:** all operations run the user's `git` binary via `tokio::process::Command` with **fixed argument arrays** (`git -C <repo> <subcommand> <args…>`), never a shell.

**Why:** the CLI respects everything the user has configured — credential helpers, ssh agents, includes, hooks — which is exactly where libgit2 (`git2` crate) diverges most painfully, especially for `fetch`. A dev tool that behaves differently from the user's own `git` invites distrust. No shell means no injection surface beyond argv, and argv is guarded by branch-name validation.

**Alternatives rejected:** `git2`/libgit2 (credential and config divergence, native build weight); `gitoxide` (fetch/auth maturity not worth the bet for five subcommands).

**Trade-off accepted:** requires git on PATH — true of every target user of a git-workflow tool; a missing binary surfaces as a clear error.

## Key decision: `git.rs` module, not a crate

Same reasoning as `capsules.rs` in phase 8: the desktop app is the only consumer; a crate is extraction-ready the day a second consumer exists. The module owns the safety rails so no caller can express a forbidden operation.

## `git.rs` surface

```rust
GitStatus { branch: Option<String>,   // None = detached HEAD
            dirty: bool, changed_count: u32,
            ahead: u32, behind: u32 }              // Serialize camelCase

status(repo)                -> Result<GitStatus, String>   // git status --porcelain=v2 --branch
branches(repo)              -> Result<Vec<String>, String> // local branches
fetch(repo)                 -> Result<String, String>      // git fetch --all; returns summary
checkout(repo, branch)      -> Result<(), String>          // SAFE: see preflight below
create_branch(repo, name)   -> Result<(), String>          // git switch -c; allowed dirty
```

**Checkout preflight, in order:** validate the name (below) → `status()`: dirty → `Err("working tree has uncommitted changes — OmniBus never discards or stashes your work; commit or stash manually first")` → `git show-ref --verify refs/heads/<branch>` missing → `Err("branch '<b>' does not exist locally")` → `git switch <branch>` (plain, no flags).

**Branch-name validation:** every user-supplied name passes `git check-ref-format --branch <name>` before any other use; names beginning with `-` are rejected before even that (argv-flag injection). Enforced in `git.rs` so no caller can skip it.

## Capsules gain a git dimension

- **Capture (in `save_capsule`):** resolve task → project → `repo_path` (new `Db::get_task`/`get_project` getters); `status(repo)`; a non-detached branch is stored via `replace_task_resources(task, "git", "branch", {"branch": name})`. `git` joins the save summary's captured/skipped like any connector kind. (`connector_kind` is already a free string in the schema — no migration; `git` is a *virtual* kind handled by the orchestrator, not the hub.)
- **Restore (in `activate_task`):** the git row is processed **first** — branch switches change files on disk, so the editor must reopen files after, not before. Same branch → applied; different + clean → `checkout` → applied; different + dirty → refusal message into the summary's errors, kind skipped, **editor restore still proceeds**; branch missing locally → reported likewise. Best-effort per kind, exactly like connectors.

## UI

Project rows (gray boxes): a git line — `⎇ main · 3 changed · ↑1 ↓2` (dirty count and arrows only when nonzero, red-ish text when dirty) — plus `fetch`, a local-branch `<select>` with a `switch` button (disabled while dirty, with the refusal text as the tooltip/inline note when attempted), and a new-branch input + `create` button. Task capsule summaries append `git: <branch>`. Activation results already render errors/skips inline — git refusals appear there.

## Absorbed phase-6 follow-ups

- **CSP:** `tauri.conf.json` gets `"csp": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'"` (Tauri injects script nonces; inline styles required by common tooling).
- **Trimming:** `validate_and_create` trims `repo_path` and `dev_url` before validation and storage.
- **Error wording:** `friendly_db_error`'s fallback becomes `"failed to save project — see the app log for details"`, with the raw error `eprintln!`-ed instead of shown.

## What gets stored (privacy)

One new datum: the current **branch name** per saved capsule. No commit contents, no diffs, no history, no remotes. Fetch writes nothing to OmniBus storage (it only updates the repo's own remote-tracking refs, as the user's own `git fetch` would).

## Error handling

| Failure | Behavior |
|---|---|
| git binary missing | Every op returns a clear error; UI shows it; nothing crashes |
| Not a git repo anymore (moved/deleted) | Op errors surface in UI / activation summary |
| Checkout with dirty tree | Refused with the never-discard message; tree untouched (test-enforced) |
| Branch doesn't exist locally | Refused with message; no auto-create, no fetch side effects |
| Invalid/hostile branch name | Rejected by validation before any git invocation (test-enforced) |
| Fetch fails (offline, auth) | Error string surfaces; no retry loops |
| Capsule git restore refused | Reported in activation summary; editor restore proceeds |
| Detached HEAD at save | No branch row stored; reported as skipped ("detached HEAD") |

## Testing

- **`git.rs` integration tests (real temp repos, git CLI):** status clean/dirty/detached; ahead/behind via a local bare `file://` remote (clone, diverge, fetch, assert counts); checkout happy path; **dirty-checkout refusal leaves the tree byte-identical**; missing-branch refusal; create-while-dirty carries changes; injection attempt (`--upload-pack=…`-style and `-`-prefixed names) rejected without any git child process for the name-validation path.
- **Capsule tests (extend `tests/capsules.rs`):** save records the branch row for a real temp repo; activate switches a clean repo's branch before editor commands; dirty repo → refusal in errors + editor restore still applied.
- **`omnibus-db`:** `get_task`/`get_project` getter tests.
- **UI:** walkthrough per criteria 1–4 (clicks manual as usual).

## Build order

1. `git.rs` (+ safety validation) with temp-repo integration tests.
2. `Db::get_task`/`get_project` + capsule git capture/restore + tests.
3. Tauri commands (`git_status`, `git_branches`, `git_fetch`, `git_checkout`, `git_create_branch`) + absorbed follow-ups (CSP, trim, error wording).
4. Projects-view git line + controls; task summary `git:` entry.
5. Walkthrough + docs.
