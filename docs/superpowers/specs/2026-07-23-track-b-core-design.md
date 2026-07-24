# Rabta Track B Core (B1–B3) Design

**Date:** 2026-07-23
**Status:** Approved 2026-07-23
**Scope:** B1 data/backend, B2 product UI, B3 active-session runtime, including persisted project ordering

## Summary

Track B turns Rabta's presentation-first project and capsule surfaces into durable product workflows. It adds reversible project archiving, project and capsule renaming, capsule duplication, curated project icons, persisted project ordering, and honest last-opened/session-duration metadata.

The implementation remains local-first. SQLite is the source of truth, Rust owns validation and state transitions, and React presents those capabilities through the existing cards, context menus, dialogs, and Resume flow. Existing databases migrate in place without data loss.

B4 connector version reporting and B5 packaging/signing/hardening remain separate follow-up releases.

## Goals

- Rename projects and capsules with server-side validation.
- Archive and unarchive projects without deleting their tasks or capsule resources.
- Make archive the primary removal action and keep permanent delete secondary and destructive.
- Provide genuine archive Undo by calling `unarchive_project`.
- Duplicate a capsule transactionally, including its saved resources.
- Assign projects a restrained icon from a curated Lucide allowlist.
- Reorder active projects with an accessible UI and persist the order in SQLite.
- Record when a project was last opened and the duration of its current or most recent active session.
- Count active time only while the Rabta window is focused and the user is not idle.
- Preserve all existing project, task, and capsule data during migration.
- Keep every state-changing backend operation covered by Rust tests and every user workflow covered by React tests.

## Non-goals

- Connector-reported versions; that is B4.
- Packaging, notarization, signing, auto-update, or deployment work; that is B5.
- Analytics dashboards, charts, streaks, productivity scores, or historical reporting.
- Per-project accent colors or arbitrary emoji/icons.
- Duplicating a project registration. Two Rabta projects pointing at the same repository would create ambiguous branch, task, and session ownership.
- Archiving individual capsules. Capsules retain their existing Open/Done lifecycle.
- Cross-device synchronization or collaborative multi-user ordering.

## Approaches Considered

### 1. SQLite-backed domain operations with a backend session state machine — selected

SQLite stores all durable project metadata and ordering. Rust exposes narrow Tauri commands, performs validation, and applies multi-row changes transactionally. The existing `Capsules` orchestrator owns active-session timing because it already owns the authoritative active task.

This approach gives Rabta one durable source of truth, honest timing, reversible archive operations, and deterministic tests without introducing a second state system.

### 2. Frontend-owned metadata and timers

React/localStorage could hold ordering, icon choices, and session counters. This would be fast to build but would lose correctness across crashes, create conflicting sources of truth, and make archive Undo a UI illusion. It is rejected.

### 3. Full event-sourced project activity and session history

Every rename, reorder, archive, and active-time interval could become an append-only event. That would support auditing and analytics later, but it adds substantial schema, replay, compaction, and UI complexity that the current product does not need. It is rejected for B1–B3. The command boundaries below leave room for a later audit layer.

## Domain Model

### Migration `002_track_b_core.sql`

The second embedded migration alters `projects`:

```sql
ALTER TABLE projects ADD COLUMN icon TEXT;
ALTER TABLE projects ADD COLUMN archived_at TEXT;
ALTER TABLE projects ADD COLUMN last_opened_at TEXT;
ALTER TABLE projects ADD COLUMN last_task_id TEXT;
ALTER TABLE projects
  ADD COLUMN active_seconds INTEGER NOT NULL DEFAULT 0
  CHECK (active_seconds >= 0);
ALTER TABLE projects
  ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0
  CHECK (sort_order >= 0);

UPDATE projects
SET sort_order = (
  SELECT COUNT(*)
  FROM projects AS preceding
  WHERE lower(preceding.name) < lower(projects.name)
     OR (
       lower(preceding.name) = lower(projects.name)
       AND preceding.id < projects.id
     )
);

CREATE INDEX idx_projects_active_order
  ON projects (archived_at, sort_order, name);
```

`last_task_id` is intentionally nullable and treated as a soft reference. SQLite cannot safely add the desired foreign-key constraint to the existing table with a simple compatible `ALTER TABLE`; Rust clears or ignores a value whose task no longer exists.

Existing rows receive:

- `icon = NULL`
- `archived_at = NULL`
- `last_opened_at = NULL`
- `last_task_id = NULL`
- `active_seconds = 0`
- a deterministic `sort_order` preserving the existing alphabetical presentation

Migration application remains transactional through the existing `user_version` mechanism. A migration failure rolls back the entire migration and leaves the previous version usable.

### Project wire shape

`Project` adds:

```text
icon: Option<String>
archived_at: Option<String>
last_opened_at: Option<String>
last_task_id: Option<String>
active_seconds: u64
sort_order: i64
```

React receives the camel-case equivalents. Missing time values render no session claim rather than fabricated copy.

### Icon keys

The backend accepts only this stable key allowlist:

```text
code
globe
database
terminal
blocks
rocket
wrench
folder
```

`NULL` means the default project icon. The UI maps keys to Lucide components. Unknown values from a future build render the default icon and never break project loading.

## Backend Operations

All mutating database methods check affected-row counts where absence matters. User-facing commands return concise errors; detailed storage errors are logged.

### Project operations

- `rename_project(id, name) -> Project`
  - Trims the name.
  - Rejects an empty name.
  - Preserves the existing unique-name rule and maps conflicts to a friendly error.
  - Updates `updated_at`.

- `archive_project(id) -> ArchiveProjectResult`
  - Sets `archived_at` when not already archived.
  - Preserves tasks and resources.
  - Removes the project from active lists.
  - If the project's task is active, the capsule orchestrator first flushes earned session time, saves the capsule best-effort, and clears the active task.
  - Returns `{ project, warnings }`. Archive still succeeds if connector capture is unavailable; `warnings` describes any best-effort save failure without misreporting the durable archive result.

- `unarchive_project(id) -> Project`
  - Clears `archived_at`.
  - Moves the restored project to the end of the active project order.
  - Is idempotent so a repeated Undo cannot corrupt state.

- `set_project_icon(id, icon) -> Project`
  - Accepts `NULL` or an allowlisted key.
  - Rejects unknown values.
  - Updates `updated_at`.

- `reorder_projects(ordered_ids) -> Vec<Project>`
  - Runs in one transaction.
  - Requires each currently active project exactly once and rejects unknown, archived, missing, or duplicate IDs.
  - Writes dense positions `0..n-1`.
  - Returns the authoritative active order.

- `list_projects() -> Vec<Project>`
  - Returns only non-archived projects ordered by `sort_order`, then case-folded name and ID for deterministic ties.

- `list_archived_projects() -> Vec<Project>`
  - Returns archived projects newest-archived first.

Permanent `delete_project` remains available. The UI places it behind the archived-management surface or a secondary destructive action; it is never the primary project-removal affordance.

### Capsule operations

- `rename_task(id, title) -> Task`
  - Trims and rejects an empty title.
  - Updates `updated_at`.

- `duplicate_task(id) -> Task`
  - Creates one new Open task in the same project.
  - Names it `Copy of <original title>`, adding ` (2)`, ` (3)`, and so on when needed within that project.
  - Copies every current `task_resources` row with new IDs in the same transaction.
  - Preserves connector kind, resource type, payload, and resource ordering.
  - Does not create or switch a git branch and never activates the copy automatically.

This is capsule duplication, not project duplication. It gives users a safe workspace-state template without creating two owners for one repository.

## Archive and Ordering Behavior

Archived projects disappear from:

- Projects active cards
- Capsules project groups
- Overview active counts and Continue Working
- command-palette project and capsule results
- new-task targets

They appear in an **Archived Projects** dialog or sheet opened from the Projects page. Each archived row offers Restore and permanent Delete. Restore calls `unarchive_project`; permanent Delete retains the existing deferred-delete safety window.

The immediate Archive toast contains Undo. Archive is committed before the toast appears, and Undo performs a real `unarchive_project` call. If Undo fails, the UI refreshes from SQLite and shows the backend error rather than pretending the project was restored.

Active project cards include a drag handle. Reordering supports:

- pointer dragging;
- keyboard lift/move/drop behavior;
- context-menu Move Up and Move Down fallbacks.

The UI optimistically reorders while a request is in flight, permits only one reorder mutation at a time, and replaces local state with the authoritative list returned by Rust. On failure it rolls back to the previous order and shows an error.

## Session Semantics

A **project session** begins whenever a task is successfully selected for activation, including activation of another task in the same project.

At session start, Rabta atomically:

1. flushes any earned time for the previous active task;
2. sets the target project's `last_opened_at` to the current UTC timestamp;
3. sets `last_task_id` to the activated task;
4. resets that project's `active_seconds` to `0`;
5. establishes a fresh monotonic timing baseline.

`active_seconds` therefore means the duration of the project's current session, or its most recently completed session when another project/task becomes active. It is not an all-time total.

### Accrual state machine

The Rust `Capsules` orchestrator owns:

```text
active task
window focused?
user idle?
last monotonic tick
```

React reports state, not elapsed seconds:

- window focus/blur;
- document visibility;
- user activity and transition to idle after 60 seconds;
- a heartbeat every 15 seconds while the app is mounted.

On each state transition and heartbeat, Rust:

1. calculates elapsed time from a monotonic clock;
2. credits only the interval for which an active task existed, the window was focused, and the user was not idle;
3. caps a single credited interval at 30 seconds so system sleep or a throttled timer cannot add hours;
4. persists whole seconds against the active task's project;
5. advances the monotonic baseline even when no time is credited.

Activation flushes the old interval before changing tasks. Archive flushes before clearing an active task. App shutdown attempts a final flush; an abnormal process kill can lose at most one heartbeat interval, approximately 15 seconds.

User-activity listeners are throttled and never invoke Rust for every pointer event. They only report transitions out of idle; the heartbeat performs normal accrual.

## Product UI

### Projects

Project cards gain:

- the selected icon;
- quiet “Opened …” and “Last session …” metadata when available;
- a drag handle;
- context-menu actions: Rename, Change Icon, Move Up/Down, Reveal in Finder, Archive, and Delete.

Rename uses a focused dialog with the current name selected. Change Icon uses a compact, keyboard-accessible grid. Archive is visually separated from permanent Delete. Delete remains available but is secondary and destructive.

The Projects page header gains **Archived Projects** when archived rows exist.

### Capsules

Capsule context menus gain Rename and Duplicate ahead of Done/Reopen and Delete. Duplicate refreshes the task list and confirms the new title. Rename updates the rendered title without disturbing saved resources or active-task identity.

The Resume preview shows `Last session <duration>` when the owning project has session data. No text is shown when the value is unavailable.

### Overview / Continue Working

Overview gains a compact Continue Working section using active projects with `last_opened_at`, newest first. Each row shows:

- project icon and name;
- last-opened relative time;
- most recent session duration;
- the last activated task title when `last_task_id` still resolves;
- a Resume action routed through CapsulesPage's existing Restore Experience.

The palette and Overview continue to route activation through the existing single Resume path; they do not invoke `activate_task` independently.

## Error Handling and Consistency

- Migration changes are atomic and backward-compatible.
- Multi-row reorder and capsule duplication are transactions.
- Archive/unarchive are idempotent.
- Unknown icon keys are rejected on write and tolerated on read.
- React refreshes from Rust after every mutation; optimistic ordering is the only temporary local projection.
- Stale `last_task_id` values are ignored and may be cleared opportunistically.
- Archived projects cannot receive new tasks or be activated through normal commands.
- `activate_task` verifies that the target task and project exist and that the project is not archived before changing active state.
- Session input never trusts a frontend-provided project, task, timestamp, or duration.
- Time uses UTC wall-clock strings for display metadata and a monotonic clock for elapsed-time calculation.
- Existing permanent delete continues to cascade through SQLite foreign keys.

## Testing Strategy

### Database tests

- migration 001 → 002 preserves projects, tasks, and resources;
- new project defaults and deterministic backfill order;
- active and archived list filtering/order;
- rename validation, missing IDs, and name conflicts;
- archive/unarchive idempotency and data preservation;
- icon allowlist and unknown-key rejection;
- reorder exact-set validation, rollback, and stable persistence;
- task rename validation;
- capsule duplication copies resources atomically with fresh IDs and a unique copy title;
- session start/reset and second accrual.

### Rust/Tauri tests

- every new command maps arguments and errors correctly;
- activation refuses archived projects;
- activation updates last-opened/task and resets the new session;
- switching tasks flushes the previous interval;
- focus, idle, heartbeat, sleep-gap cap, archive, and shutdown transitions credit the correct project;
- archive of an active project clears active state while preserving the capsule even when connectors are unavailable.

Time-sensitive tests use an injected clock rather than sleeping.

### React tests

- project metadata and icon rendering with graceful null/unknown fallbacks;
- Rename, Change Icon, Archive, real Undo, Archived Restore, and permanent Delete flows;
- pointer/keyboard/context-menu reorder behavior and rollback on failure;
- capsule Rename and Duplicate workflows;
- archived projects excluded from Projects, Capsules, Overview, and command-palette results;
- Continue Working routes Resume through the existing store signal;
- focus/blur, activity/idle, visibility, and heartbeat signals are throttled correctly;
- session copy appears only with real persisted values.

### Final verification

- full desktop Vitest suite;
- full Rust workspace tests;
- `cargo build`;
- desktop production build;
- migration test against a fixture database created at schema version 1;
- manual GUI pass for drag/keyboard reorder, archive/Undo, icon picker, idle timing, sidebar collapse, and window-state persistence.

## Delivery Sequence

1. B1a — migration and expanded project/task records.
2. B1b — validated project commands, task rename, transactional capsule duplication.
3. B1c — archive-safe activation and persisted ordering.
4. B2a — shared project icon/metadata UI and mutation dialogs.
5. B2b — archive management, genuine Undo, and accessible reorder UI.
6. B2c — capsule rename/duplicate and Continue Working integration.
7. B3a — injected-clock backend session state machine.
8. B3b — frontend focus/idle/heartbeat bridge.
9. B3c — whole-feature consistency, migration, accessibility, and manual QA.

Each step lands with focused tests and an independently reviewable commit.

## Acceptance Criteria

- An existing schema-v1 database opens as schema v2 with no lost records.
- Rename, archive/unarchive, icons, ordering, capsule rename, and capsule duplication survive relaunch.
- Archive Undo restores the exact project and its tasks/resources.
- Active lists never include archived projects.
- Project ordering is stable across every active-project surface and relaunch.
- Session duration never grows while Rabta is blurred, hidden, idle for 60 seconds, or asleep.
- Session duration is derived by Rust from monotonic time and never accepted from the frontend.
- All automated verification is green, and all GUI-only behaviors have a recorded manual result.
