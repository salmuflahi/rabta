# Project Registration (Phase 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** First product view: register/list/delete projects (name, repo path, optional dev URL, default branch) with Rust-side validation and a `.git/HEAD` branch prefill, over the existing `omnibus-db` CRUD.

**Architecture:** All validation lives in the desktop crate (`projects.rs` module: plain testable functions), exposed via four thin Tauri commands. The frontend gains a Projects/Debug view switcher; the debug console is unchanged and the hub is not involved anywhere.

**Tech Stack:** existing stack + `url` crate (URL parsing) + `tempfile` (dev-dep, fixtures).

**Spec:** `docs/superpowers/specs/2026-07-18-omnibus-project-registration-design.md` — read before starting. Foundation Principles / Coding standards / DoD and vision Privacy Principles bind every task.

## Global Constraints

- Validation rules (server-side, exact): `name` non-empty (trimmed); `repo_path` absolute + existing directory + contains `.git` as dir OR file; `default_branch` non-empty (trimmed); `dev_url` optional but must parse as `http`/`https` URL when present.
- Duplicate name maps to exactly: `a project with this name already exists`.
- `.git/HEAD` parsing: `ref: refs/heads/<branch>` → branch; detached/unreadable/`.git`-file repos → `None` (not an error).
- The `.git` peek is a plain file read — never execute git.
- Command names (frontend contract): `inspect_repo_path`, `create_project`, `list_projects`, `delete_project`. Tauri 2 camelCases JS arg keys: `{ path }`, `{ name, repoPath, devUrl, defaultBranch }`, `{}`, `{ id }`.
- Existing commands/events (`connectors`, `send_command`, `recent_events`, `known_connectors`, `hub-event`) unchanged; debug console behavior unchanged; hub untouched.
- Gray boxes only. Builds warning-free; public items documented.
- Environment: cargo NOT on default PATH — `export PATH="$HOME/.cargo/bin:$PATH"` first; generous timeouts.

---

### Task 1: Repo inspection + validation module with tests

**Files:**
- Create: `apps/desktop/src-tauri/src/projects.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs` (add `pub mod projects;` — one line only in this task)
- Modify: `apps/desktop/src-tauri/Cargo.toml` (add deps)
- Test: `apps/desktop/src-tauri/tests/projects.rs`

**Interfaces:**
- Consumes: `omnibus_db::{Db, DbConfig, DbError, NewProject, Project}` (phase 5).
- Produces (Task 2 wraps these exactly):
  - `projects::RepoInspection { exists: bool, is_git_repo: bool, default_branch: Option<String> }` (Serialize camelCase)
  - `projects::inspect_repo_path(path: &str) -> RepoInspection`
  - `projects::validate_and_create(db: &Db, name: &str, repo_path: &str, dev_url: Option<&str>, default_branch: &str) -> Result<Project, String>`

- [ ] **Step 1: Deps + failing tests**

`apps/desktop/src-tauri/Cargo.toml` — add:
```toml
url = "2"
```
to `[dependencies]`, and a new section:
```toml
[dev-dependencies]
tempfile = "3"
```

`apps/desktop/src-tauri/src/lib.rs` — add near the top:
```rust
pub mod projects;
```

`apps/desktop/src-tauri/tests/projects.rs`:
```rust
use omnibus_db::{Db, DbConfig};
use omnibus_desktop_lib::projects::{inspect_repo_path, validate_and_create};
use std::fs;

/// Creates a directory that looks like a git clone: `.git/` with a HEAD file.
fn git_fixture(head_contents: &str) -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    fs::create_dir(dir.path().join(".git")).unwrap();
    fs::write(dir.path().join(".git").join("HEAD"), head_contents).unwrap();
    dir
}

fn db() -> Db {
    Db::open_in_memory(DbConfig::default()).unwrap()
}

#[test]
fn inspect_missing_path() {
    let ins = inspect_repo_path("/nonexistent/definitely/not/here");
    assert!(!ins.exists);
    assert!(!ins.is_git_repo);
    assert_eq!(ins.default_branch, None);
}

#[test]
fn inspect_directory_without_git() {
    let dir = tempfile::tempdir().unwrap();
    let ins = inspect_repo_path(dir.path().to_str().unwrap());
    assert!(ins.exists);
    assert!(!ins.is_git_repo);
}

#[test]
fn inspect_git_repo_prefills_branch_from_head() {
    let dir = git_fixture("ref: refs/heads/main\n");
    let ins = inspect_repo_path(dir.path().to_str().unwrap());
    assert!(ins.exists);
    assert!(ins.is_git_repo);
    assert_eq!(ins.default_branch.as_deref(), Some("main"));
}

#[test]
fn inspect_detached_head_gives_no_branch() {
    let dir = git_fixture("3f2a9c0d1e4b5a6f7890abcdef1234567890abcd\n");
    let ins = inspect_repo_path(dir.path().to_str().unwrap());
    assert!(ins.is_git_repo);
    assert_eq!(ins.default_branch, None);
}

#[test]
fn inspect_git_file_repo_counts_as_git_without_branch() {
    // Worktrees/submodules: `.git` is a pointer FILE, not a directory.
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join(".git"), "gitdir: /somewhere/else\n").unwrap();
    let ins = inspect_repo_path(dir.path().to_str().unwrap());
    assert!(ins.exists);
    assert!(ins.is_git_repo);
    assert_eq!(ins.default_branch, None);
}

#[test]
fn create_happy_path_stores_project() {
    let db = db();
    let dir = git_fixture("ref: refs/heads/main\n");
    let p = validate_and_create(
        &db,
        "omnibus",
        dir.path().to_str().unwrap(),
        Some("http://localhost:3000"),
        "main",
    )
    .unwrap();
    assert_eq!(p.name, "omnibus");
    assert_eq!(p.default_branch, "main");
    assert_eq!(db.list_projects().unwrap().len(), 1);
}

#[test]
fn create_rejects_duplicate_name_with_friendly_message() {
    let db = db();
    let dir = git_fixture("ref: refs/heads/main\n");
    let path = dir.path().to_str().unwrap();
    validate_and_create(&db, "omnibus", path, None, "main").unwrap();
    let err = validate_and_create(&db, "omnibus", path, None, "main").unwrap_err();
    assert_eq!(err, "a project with this name already exists");
}

#[test]
fn create_rejects_bad_inputs_without_storing() {
    let db = db();
    let dir = git_fixture("ref: refs/heads/main\n");
    let good = dir.path().to_str().unwrap();
    let non_git = tempfile::tempdir().unwrap();

    assert!(validate_and_create(&db, "  ", good, None, "main").is_err());
    assert!(validate_and_create(&db, "p", "relative/path", None, "main").is_err());
    assert!(validate_and_create(&db, "p", "/nonexistent/nope", None, "main").is_err());
    assert!(validate_and_create(&db, "p", non_git.path().to_str().unwrap(), None, "main").is_err());
    assert!(validate_and_create(&db, "p", good, None, "  ").is_err());
    assert!(validate_and_create(&db, "p", good, Some("ftp://x"), "main").is_err());
    assert!(validate_and_create(&db, "p", good, Some("not a url"), "main").is_err());
    assert!(db.list_projects().unwrap().is_empty(), "nothing may be stored on rejection");
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="$HOME/.cargo/bin:$PATH" && cargo test -p omnibus-desktop --test projects`
Expected: compile error — module `projects` is empty/missing.

- [ ] **Step 3: Implement `apps/desktop/src-tauri/src/projects.rs`**

```rust
//! Project registration: repo-path inspection and validation.
//! Plain filesystem reads only — this module never executes git. Phase 9
//! (safe git ops) absorbs this helper when real git operations arrive.
use std::path::Path;

use omnibus_db::{Db, DbError, NewProject, Project};
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

/// Maps storage errors to user-facing messages.
fn friendly_db_error(e: DbError) -> String {
    let msg = e.to_string();
    if msg.contains("UNIQUE constraint failed: projects.name") {
        "a project with this name already exists".to_string()
    } else {
        format!("failed to save project: {msg}")
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test -p omnibus-desktop --test projects` — 8 tests PASS.
Run: `cargo test` — everything green, zero warnings.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: repo inspection and project validation in desktop crate"
```

---

### Task 2: Tauri commands

**Files:**
- Modify: `apps/desktop/src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `projects::{inspect_repo_path, validate_and_create, RepoInspection}` (Task 1), `DbHandle` (phase 5).
- Produces (Task 3's frontend contract): commands `inspect_repo_path{ path }`, `create_project{ name, repoPath, devUrl, defaultBranch }` → `Project` (camelCase) or error string, `list_projects{}` → `Project[]`, `delete_project{ id }`.

- [ ] **Step 1: Add the four commands to `lib.rs`**

Add after the existing `known_connectors` command (uses the existing `DbHandle`; imports to extend: `use omnibus_db::Project;` and `use crate::projects::RepoInspection;`):

```rust
/// Checks a candidate repository path and prefills the default branch.
#[tauri::command]
async fn inspect_repo_path(path: String) -> Result<RepoInspection, String> {
    tauri::async_runtime::spawn_blocking(move || projects::inspect_repo_path(&path))
        .await
        .map_err(|e| e.to_string())
}

/// Validates registration input and stores the project.
#[tauri::command]
async fn create_project(
    db: State<'_, DbHandle>,
    name: String,
    repo_path: String,
    dev_url: Option<String>,
    default_branch: String,
) -> Result<Project, String> {
    let db = db.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        projects::validate_and_create(&db, &name, &repo_path, dev_url.as_deref(), &default_branch)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// All registered projects.
#[tauri::command]
async fn list_projects(db: State<'_, DbHandle>) -> Result<Vec<Project>, String> {
    let db = db.0.clone();
    tauri::async_runtime::spawn_blocking(move || db.list_projects().map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

/// Deletes a project; its tasks and resources cascade (phase 5 schema).
#[tauri::command]
async fn delete_project(db: State<'_, DbHandle>, id: String) -> Result<(), String> {
    let db = db.0.clone();
    tauri::async_runtime::spawn_blocking(move || db.delete_project(&id).map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}
```

Extend the `invoke_handler` list to:
```rust
        .invoke_handler(tauri::generate_handler![
            connectors,
            send_command,
            recent_events,
            known_connectors,
            inspect_repo_path,
            create_project,
            list_projects,
            delete_project
        ])
```

- [ ] **Step 2: Verify**

Run: `cargo check` — zero warnings. Run: `cargo build -p omnibus-desktop` — succeeds. Run: `cargo test` — still green.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: project registration Tauri commands"
```

---

### Task 3: View switcher + Projects view

**Files:**
- Create: `apps/desktop/src/views/ProjectsView.tsx`
- Modify: `apps/desktop/src/store.ts`, `apps/desktop/src/App.tsx`

**Interfaces:**
- Consumes: Task 2's commands; existing store/panels.
- Produces: `view: "projects" | "debug"` in the store (default `"projects"`); the debug console preserved exactly as a branch of App.

- [ ] **Step 1: Store additions**

In `apps/desktop/src/store.ts`, add above the `Store` interface:
```ts
export interface Project {
  id: string;
  name: string;
  repoPath: string;
  devUrl: string | null;
  defaultBranch: string;
  createdAt: string;
  updatedAt: string;
}

export interface RepoInspection {
  exists: boolean;
  isGitRepo: boolean;
  defaultBranch: string | null;
}
```

Extend the `Store` interface with:
```ts
  view: "projects" | "debug";
  setView: (view: "projects" | "debug") => void;
  projects: Project[];
  setProjects: (projects: Project[]) => void;
```

and the store implementation with:
```ts
  view: "projects",
  setView: (view) => set({ view }),
  projects: [],
  setProjects: (projects) => set({ projects }),
```

- [ ] **Step 2: Projects view**

`apps/desktop/src/views/ProjectsView.tsx`:
```tsx
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useStore, type Project, type RepoInspection } from "../store";

export function ProjectsView() {
  const projects = useStore((s) => s.projects);
  const setProjects = useStore((s) => s.setProjects);
  const [name, setName] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [devUrl, setDevUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [pathNote, setPathNote] = useState("");
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);

  const refresh = () =>
    invoke<Project[]>("list_projects")
      .then(setProjects)
      .catch((e) => console.error("list_projects failed:", e));

  useEffect(() => {
    refresh();
  }, []);

  async function onPathBlur() {
    if (!repoPath) return;
    try {
      const ins = await invoke<RepoInspection>("inspect_repo_path", { path: repoPath });
      if (!ins.exists) setPathNote("path does not exist");
      else if (!ins.isGitRepo) setPathNote("not a git repository");
      else {
        setPathNote("");
        if (ins.defaultBranch && !branch) setBranch(ins.defaultBranch);
      }
    } catch (e) {
      setPathNote(String(e));
    }
  }

  async function save() {
    setError("");
    try {
      await invoke("create_project", {
        name,
        repoPath,
        devUrl: devUrl || null,
        defaultBranch: branch,
      });
      setName("");
      setRepoPath("");
      setDevUrl("");
      setBranch("");
      setPathNote("");
      refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  async function remove(id: string) {
    try {
      await invoke("delete_project", { id });
      setConfirming(null);
      refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
      <div>
        <h2 className="text-neutral-400 uppercase text-xs mb-2">Projects</h2>
        {projects.length === 0 && <div className="text-neutral-500">none registered</div>}
        {projects.map((p) => (
          <div key={p.id} className="border border-neutral-700 p-2 mb-2 flex items-center gap-3">
            <div className="flex-1">
              <div>
                {p.name} <span className="text-neutral-500">({p.defaultBranch})</span>
              </div>
              <div className="text-neutral-500 text-xs break-all">{p.repoPath}</div>
              {p.devUrl && <div className="text-neutral-400 text-xs">{p.devUrl}</div>}
              <div className="text-neutral-600 text-xs">created {p.createdAt}</div>
            </div>
            {confirming === p.id ? (
              <span className="text-xs flex items-center gap-2">
                <span className="text-red-400">delete? tasks and resources go with it</span>
                <button onClick={() => remove(p.id)} className="bg-red-900 px-2 py-1">
                  confirm
                </button>
                <button onClick={() => setConfirming(null)} className="bg-neutral-800 px-2 py-1">
                  cancel
                </button>
              </span>
            ) : (
              <button onClick={() => setConfirming(p.id)} className="bg-neutral-800 px-2 py-1">
                delete
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="border border-neutral-700 p-3 max-w-xl">
        <h2 className="text-neutral-400 uppercase text-xs mb-2">Register project</h2>
        <div className="flex flex-col gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="name"
            className="bg-neutral-800 p-1"
          />
          <input
            value={repoPath}
            onChange={(e) => setRepoPath(e.target.value)}
            onBlur={onPathBlur}
            placeholder="/absolute/path/to/repo"
            className="bg-neutral-800 p-1"
          />
          {pathNote && <div className="text-red-400 text-xs">{pathNote}</div>}
          <input
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="default branch"
            className="bg-neutral-800 p-1"
          />
          <input
            value={devUrl}
            onChange={(e) => setDevUrl(e.target.value)}
            placeholder="dev URL (optional)"
            className="bg-neutral-800 p-1"
          />
          <button
            onClick={save}
            disabled={!name || !repoPath || !branch}
            className="bg-neutral-700 py-1 disabled:opacity-40"
          >
            register
          </button>
          {error && <div className="text-red-400 text-xs">{error}</div>}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: App switcher**

`apps/desktop/src/App.tsx` — keep the existing `useEffect` (preload + hub-event listener) exactly as is, so the log keeps accumulating while on the Projects view. Replace only the returned JSX with:

```tsx
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);

  const tab = (v: "projects" | "debug", label: string) => (
    <button
      onClick={() => setView(v)}
      className={`px-3 py-1 ${view === v ? "bg-neutral-700" : "bg-neutral-800"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="h-screen bg-neutral-900 text-neutral-200 font-mono text-sm flex flex-col">
      <header className="flex gap-2 p-2 border-b border-neutral-700">
        {tab("projects", "Projects")}
        {tab("debug", "Debug")}
      </header>
      {view === "projects" ? (
        <ProjectsView />
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-[300px_1fr] grid-rows-[1fr_200px]">
          <ConnectorsPanel />
          <LogPanel />
          <CommandSender />
        </div>
      )}
    </div>
  );
```

Add the import: `import { ProjectsView } from "./views/ProjectsView";` and the two store selectors shown above.

- [ ] **Step 4: Verify**

Run: `pnpm --filter desktop build` — tsc strict + vite green. Run: `export PATH="$HOME/.cargo/bin:$PATH" && cargo test && pnpm test` — all green.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Projects/Debug view switcher and project registration UI"
```

---

### Task 4: Walk success criteria + docs

**Files:**
- Modify: `README.md` ("Try it" gains a registration step), spec status line.
(The vision's phase-6 line was already updated when the spec landed.)

- [ ] **Step 1: Full sweep** — `cargo test`, `pnpm test`, `cargo build`, `pnpm build` all green/warning-free; TODO scan clean.
- [ ] **Step 2: Live walkthrough** — launch the app: Projects view by default with the switcher; Debug view is the unchanged console. Register a real repo (e.g. `/Users/sammy/omnibus`): path blur prefills `main`; save; project listed. Restart the app — project still there. Try a nonexistent path, a non-git directory, a duplicate name, a bad URL — each shows its specific message. Delete with confirm.
- [ ] **Step 3: Docs + commit** — README "Try it" step for registering a project; spec **Status:** → `Implemented`. Commit: `docs: project registration walkthrough; phase 6 success criteria verified`.

---

## Self-review notes

- Spec coverage: inspection incl. `.git`-file and detached HEAD (T1), all validation rules + friendly duplicate message (T1), four commands with exact names/args (T2), switcher + list/form/delete-confirm UI with debug console untouched (T3), walkthrough + docs (T4). Privacy: only the four entered fields are stored; `inspect_repo_path` reads one reference line.
- Type consistency: `RepoInspection` camelCase (T1) ↔ TS interface (T3); `Project` camelCase from phase 5 ↔ TS `Project` (T3); command arg keys (T2) ↔ invoke calls (T3).
- `validate_and_create` returns `Result<_, String>` rather than a typed error: these strings are the UI's display text (spec: "error strings are user-facing"), and no caller branches on variants — a typed enum would be ceremony. Reviewers may flag it; this is the intended design.
