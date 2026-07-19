# OmniBus — Project Registration (Phase 6)

**Date:** 2026-07-18
**Status:** Draft for review
**Scope:** First product view (Projects), Tauri commands for project CRUD + repo-path validation, view switcher over the existing dev console.
**Out of scope:** task UI (phase 8), real git operations (phase 9), project editing, repo auto-discovery, owner field (dropped — see Non-goals).

Builds on merged phases 1–5. Foundation Principles / Coding standards / Definition of Done and the vision's Privacy Principles apply unchanged.

---

## Goal

**What:** Let a user register the projects OmniBus will organize work around — name, repository path, optional dev URL, default branch — stored in the existing `projects` table, managed from the app's first real product view.

**Why now:** every later phase hangs off a registered project: tasks (phase 8) belong to projects, the VS Code connector (phase 7) opens project workspaces, git ops (phase 9) run in project repos. Phase 5 shipped the schema and CRUD; this phase is deliberately UI-and-validation only.

```
        ┌──────────────────────────────────┐
        │  [ Projects ]  [ Debug ]         │   view switcher
        ├──────────────────────────────────┤
        │ Projects view      Debug view    │
        │ ┌──────────────┐   (existing     │
        │ │ project list │    3-panel      │
        │ │ + form       │    console,     │
        │ └──────┬───────┘    untouched)   │
        └────────┼─────────────────────────┘
                 │ Tauri commands
                 ▼
           omnibus-db (projects CRUD, phase 5)

        The hub is not involved anywhere in this phase.
```

### Success criteria

1. The app opens with a Projects/Debug switcher; the Debug view is the unchanged dev console.
2. Registering a real repository works end-to-end: typing its path prefills the default branch from `.git/HEAD`; saving shows the project in the list; the project survives an app restart.
3. Invalid input is rejected with a visible, specific message: nonexistent path, directory that isn't a git repo, duplicate project name, malformed dev URL.
4. Deleting a project requires an inline confirm (which states that its tasks/resources cascade) and removes it from the list.
5. `cargo test` covers repo inspection (tempdir fixtures incl. `.git`-as-file and detached HEAD) and create-validation (in-memory `Db`); all suites and builds stay green and warning-free.
6. Foundation DoD holds.

## Non-goals

- No task UI or task CRUD commands (phase 8).
- No project **editing** — create/list/delete only. Edit is cheap to add when a feature needs it; nothing does yet.
- No repo auto-discovery or directory scanning.
- No git operations beyond a read-only peek at `.git/HEAD` (phase 9 owns git and absorbs this helper).
- No **owner** field. The vision listed it, but OmniBus is single-user and local-first; owner is meaningless until team features, which are explicitly future roadmap. The vision's phase 6 line is updated accordingly.
- No styling beyond gray boxes; no hub involvement of any kind.

---

## Key decision: validation lives in the Rust/Tauri layer

**What:** all validation — path checks, git detection, branch prefill, URL parsing, duplicate mapping — happens in Tauri commands. The form mirrors the rules for immediate feedback but is never the source of truth.

**Why:** one place to be right. The frontend can't be trusted (any UI bug becomes stored garbage that phases 7–8 debug later), and doing filesystem checks from TS would require widening the app's fs capabilities just to peek at directories — a worse trust posture for zero gain.

**Alternatives rejected:**

- **Frontend validation via the fs plugin** — spreads rules across layers, broadens permissions.
- **A new `omnibus-git` crate now** — premature structure for ~30 lines of file reading; "architect for one fake connector" applies to crates too.

**Trade-off accepted:** the desktop crate temporarily hosts a small git-peek helper that phase 9 will relocate. A helper moving later beats a crate existing early.

## Commands

Four Tauri commands; the three CRUD ones are thin wrappers over phase 5's `omnibus-db` API (via `spawn_blocking`, matching the existing `recent_events` pattern).

```rust
inspect_repo_path(path: String) -> RepoInspection
  // { exists: bool, isGitRepo: bool, defaultBranch: Option<String> }

create_project(name: String, repoPath: String, devUrl: Option<String>,
               defaultBranch: String) -> Result<Project, String>

list_projects() -> Vec<Project>

delete_project(id: String) -> Result<(), String>
```

How `inspect_repo_path` works — and why it is not a git operation:

- `exists`: the path is a directory.
- `isGitRepo`: the directory contains `.git` — **either** a subdirectory (normal clone) **or** a file (worktrees and submodules store a `gitdir:` pointer file).
- `defaultBranch`: parse `.git/HEAD`; `ref: refs/heads/<branch>` yields the branch. Detached HEAD, an unreadable file, or a `.git`-file repo whose HEAD isn't trivially reachable all yield `None` — the user types the branch instead. This is a plain file read; nothing executes git.

## Validation rules

Enforced server-side on `create_project` (the form pre-checks the same rules via `inspect_repo_path` for inline feedback):

- `name` — non-empty; uniqueness enforced by the DB's `UNIQUE` constraint, mapped to "a project with this name already exists."
- `repo_path` — absolute, exists, is a directory, is a git repo per the rule above.
- `default_branch` — non-empty (prefilled when possible, always editable).
- `dev_url` — optional; when present must parse as an `http`/`https` URL.

## Projects view

Gray boxes, same visual language as the console:

- **List** — one row per project: name, repo path, default branch, dev URL (if any), created date; a delete button per row that flips to an inline "really delete? tasks and resources go with it — confirm/cancel" state.
- **Form** — name, repo path, dev URL, default branch inputs; path blur triggers `inspect_repo_path` (prefills branch, shows path errors inline); save calls `create_project` and either clears the form and refreshes the list or shows the returned error.

State: the existing Zustand store gains `view: "projects" | "debug"`, a `projects` array, and load/refresh actions. The Debug view's store slices are untouched.

## What gets stored (privacy)

Exactly four user-entered fields per project: name, repository path, optional dev URL, default branch — restore metadata per the vision's Privacy Principles. No repository contents are read beyond the `.git/HEAD` reference line, nothing is stored from it except the branch name the user confirms, and nothing leaves the machine.

## Error handling

| Failure | Behavior |
|---|---|
| Path doesn't exist / isn't a directory / isn't a git repo | `create_project` returns a specific error string; form shows it inline; nothing stored |
| Duplicate name | DB unique violation mapped to a friendly message; nothing stored |
| `.git/HEAD` unreadable or detached | Not an error — branch simply isn't prefilled |
| Malformed dev URL | Specific error string; nothing stored |
| Delete | Inline confirm first (cascade stated); cascade behavior itself is phase 5's tested `ON DELETE CASCADE` |
| DB write fails | Error string surfaces in the form; Debug view and hub routing unaffected |

## Testing

- **Repo inspection (Rust unit tests, tempdir fixtures):** missing dir; dir without `.git`; real `.git` directory with a `ref:` HEAD; `.git` pointer file; detached-HEAD file → `defaultBranch: None`.
- **Create validation (Rust, in-memory `Db`):** happy path returns the stored `Project`; duplicate name maps to the friendly error; malformed URL rejected; non-git path rejected. Validation is factored into plain functions so `cargo test -p omnibus-desktop` covers it without a GUI.
- **UI:** walkthrough per the success criteria (register real repo, restart survival, each rejection message, delete confirm). No UI test framework (unchanged policy).

## Build order

1. Repo inspection helper + validation functions in the desktop crate + unit tests.
2. The four Tauri commands wired to `omnibus-db` + validation tests against in-memory `Db`.
3. View switcher + Projects view (list, form, delete confirm) in the frontend.
4. Vision doc phase-6 line updated (drop owner); walk success criteria; READMEs.
