# OmniBus — GitHub Integration (Phase 11)

**Date:** 2026-07-19
**Status:** Draft for review
**Scope:** Read a project's open GitHub issues via the user's `gh` CLI; start a task from an issue (creating a safe `issue-N-slug` branch); GitHub controls in the Projects view.
**Out of scope:** writing to GitHub (no comments, no closing, no PRs), pull requests, GitHub auth *storage* (delegated to `gh`), issue bodies/comments, webhooks/notifications, non-GitHub forges, caching/background sync.

Builds on merged phases 1–10. This is the final roadmap item and the first that reaches beyond the local machine. It is integration on top of the completed spine, not a new connector.

---

## Goal

**What:** From a registered project whose repo has a GitHub remote, list its open issues and turn one into a task with a ready-to-work branch. "Start issue #42" → a task titled after the issue + a safe `issue-42-fix-login` branch, carrying the whole capsule machinery that already exists.

```
   Project (git remote → github.com/owner/repo)
        │  github_issues
        ▼
   github.rs ──► `gh issue list --repo owner/repo --json …`
        │           (the user's OWN authenticated gh — we store no token)
        ▼
   [ #42 fix login ] [ #43 flaky test ] …   in the Projects view
        │  start task
        ▼
   create task "#42 fix login"  +  git::create_branch("issue-42-fix-login")
        │                                    (phase-9 safe git op — carries changes)
        ▼
   a normal task: save/activate restores editor + tabs + THIS branch
```

### Success criteria

1. A project whose origin remote is a GitHub repo lists its open issues (number, title, labels) via `gh`; a non-GitHub or remoteless project shows a clear "no GitHub remote" message; a machine without `gh`/auth shows "install the GitHub CLI and run `gh auth login`".
2. "Start task" on an issue creates a task titled `#N <issue title>` under the project and creates+switches to a `issue-N-<slug>` branch (safe git: carries uncommitted changes, never discards). The task then behaves like any other (save/activate restores its branch + editor + tabs).
3. Branch naming is deterministic and safe: `issue-<number>-<slug>` where slug is the lowercased title with non-alphanumerics collapsed to single dashes, trimmed, length-capped; it always passes `git check-ref-format` (phase-9 validation).
4. If the branch already exists or creation fails, the task is still created and the branch outcome is reported — never fatal.
5. OmniBus stores **no GitHub credential** — issue reads go through the user's own `gh`. Only issue-derived task titles and branch names (user-initiated) are persisted.
6. Pure logic (owner/repo parsing, issue-JSON parsing, branch-name slugging) is unit-tested; the task+branch orchestration is integration-tested against a real temp git repo; the live `gh` path is walked through.
7. All suites/builds green, warning-free; DoD holds.

## Non-goals

- No writing to GitHub of any kind (read-only).
- No storing, prompting for, or handling of GitHub tokens — `gh` owns auth entirely (see Key decision).
- No PRs, comments, issue bodies, assignees, milestones, or labels-as-filters (labels are shown, not acted on).
- No polling/caching/background sync — issues are fetched on explicit click.
- No capsule schema change: an issue-started task is a normal task; its branch rides phase 9's git capsule dimension.

---

## Key decision: shell out to the user's `gh` CLI — store no credential

**What:** all GitHub reads run the user's `gh` binary via `tokio::process::Command` with fixed argv (`gh issue list --repo owner/repo --state open --json number,title,url,labels --limit 50`), never a shell. OmniBus never sees, stores, prompts for, or transmits a GitHub token.

**Why:** identical reasoning to phase 9's git-CLI decision. `gh` already holds the user's authenticated session (keyring/OAuth), respects their config and enterprise host, and is the tool they already trust. Delegating auth to `gh` means the single most sensitive thing this phase could touch — a credential granting repo access — is something OmniBus is *structurally incapable of mishandling*, because it never possesses it. This is the strongest possible extension of the vision's Privacy Principles.

**Alternatives rejected:**
- **A stored Personal Access Token (keychain + reqwest):** self-contained, but OmniBus would then hold a repo-scoped credential — a real liability, more code, a bigger dependency (reqwest/TLS), and a worse privacy story for zero user benefit over `gh`.
- **OAuth device flow:** needs a registered GitHub OAuth app shipped with the product and a polling flow; premature infrastructure for an MVP when `gh` already solves auth.

**Trade-off accepted:** requires `gh` installed and `gh auth login` done. That is a heavier ask than git (phase 9), so the absence path is a first-class, clearly-messaged outcome — not an error dialog, a helpful instruction. The MVP's audience (developers) overwhelmingly has or will install `gh`.

## Key decision: derive owner/repo from the git remote

**What:** owner/repo comes from the project's `origin` remote (reusing phase 9's git shell-out: `git -C <repo> remote get-url origin`), parsed by a pure function that handles `git@github.com:owner/repo.git`, `https://github.com/owner/repo(.git)`, and `ssh://git@github.com/owner/repo`. Non-GitHub hosts → `None` → the "no GitHub remote" outcome.

**Why:** projects already store `repo_path`; the remote is the authoritative source of the GitHub identity, and reading it needs no new field, no migration, and no guessing. The parse is pure and fully tested.

## `github.rs` surface

```rust
Issue { number: u64, title: String, url: String, labels: Vec<String> }   // Serialize camelCase

gh_available() -> bool                                  // `gh --version` succeeds
issues(repo_path) -> Result<Vec<Issue>, String>         // derive owner/repo → gh issue list → parse
start_issue_task(db, repo_path, project_id, number, title)
    -> Result<StartedTask, String>                      // create task + safe branch

// pure, unit-tested:
owner_repo_from_remote(url) -> Option<(String, String)>
parse_issues(json) -> Result<Vec<Issue>, String>
branch_name_for_issue(number, title) -> String          // "issue-<n>-<slug>", check-ref-format-safe
```

`start_issue_task`: creates the task (`#N <title>`), then attempts `git::create_branch(repo, branch_name_for_issue(...))`; the branch is best-effort — its success/failure is reported in `StartedTask { task, branch, branch_note }`, never blocking task creation. `branch_name_for_issue` guarantees a valid ref name (empty/degenerate slugs fall back to `issue-<n>`), so it always survives phase-9 validation.

## Error handling

| Failure | Behavior |
|---|---|
| `gh` not installed | `issues` returns a clear "install the GitHub CLI (gh) and run `gh auth login`" message; UI shows it, no crash |
| `gh` not authenticated | gh's own stderr surfaced ("run `gh auth login`") |
| No `origin` remote / non-GitHub host | "this project has no GitHub remote" — not an error state, a normal message |
| Rate limited / network error | gh's stderr surfaced; no retry loop |
| Branch already exists / creation refused | Task still created; branch outcome reported in `branch_note` |
| Malformed gh JSON | `parse_issues` returns a clear error rather than panicking |

## UI

In the Projects view, per project (gray boxes): a **GitHub** line — a `fetch issues` button (only when `gh_available`; otherwise a muted "install gh + `gh auth login`" note). Fetched issues render as rows: `#42 fix login` + labels, each with a `start task` button. Starting one calls `start_issue_task`, refreshes the tasks section (the new task appears, active branch updated via the git line), and shows the branch note inline. No new view; it slots beside the existing git line and tasks section.

## What gets stored (privacy)

**No GitHub credential, ever** — auth lives entirely in the user's `gh`. Issue titles/numbers/urls/labels are fetched on demand and shown; they are not persisted. The only durable writes are user-initiated: a task title (`#N <title>`) and a branch name — both user-authored metadata already covered by the task/git capsule dimensions. No issue bodies, no comments, no assignee data; nothing auto-synced; the only network traffic is the user's own `gh` reaching GitHub, exactly as their own `gh issue list` would.

## Testing

- **Pure (Rust unit tests):** `owner_repo_from_remote` (ssh/https/`.git`/trailing-slash variants, non-GitHub → None); `parse_issues` (fixture JSON with labels, empty list, malformed → Err); `branch_name_for_issue` (slug of `"Fix login bug!"` → `issue-42-fix-login-bug`, unicode/whitespace/very-long/empty-title fallbacks, and the result passing a `check-ref-format`-shaped assertion).
- **Orchestration (Rust integration, real temp repo):** `start_issue_task` against a `repo_with_commit` temp repo creates the task (assert in db) and switches to `issue-N-slug` (assert via `git::status`); a dirty tree still gets the branch (changes carried); a second start of the same issue reports the existing-branch note without failing.
- **`gh` invocation:** `gh_available` and `issues` are thin; the pure parse covers the JSON, and the live walkthrough exercises the real authenticated `gh` against a real repo.
- **UI:** walkthrough per criteria 1–2 (fetch issues on a real GitHub-remote project, start a task, see the branch switch).

## Build order

1. `github.rs` pure helpers (owner/repo, parse, slug) + `gh_available`/`issues` + unit tests.
2. `start_issue_task` orchestration (task + safe branch via git.rs) + temp-repo integration tests.
3. Tauri commands (`github_available`, `github_issues`, `start_issue_task`) + Projects-view GitHub section.
4. Walkthrough (real `gh`) + docs.
