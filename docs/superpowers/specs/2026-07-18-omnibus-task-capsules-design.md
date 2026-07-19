# OmniBus — Task Capsules (Phase 8)

**Date:** 2026-07-18
**Status:** Draft for review
**Scope:** Capsule save/restore across connected connectors (VS Code + fake), task UI under projects, restore continuation across editor window reloads.
**Out of scope:** git/branch state (phase 9), Chrome tabs (phase 10), cursor/scroll positions, capsule history/versioning, persistent active-task tracking, cross-machine anything.

Builds on merged phases 1–7. Foundation Principles / Coding standards / DoD and the vision's Privacy Principles bind this phase. This is the product's primary object: the thing every earlier phase existed to make possible.

---

## Goal

**What:** A task can remember and restore working state. Create a task under a project, work in the editor, save — the task holds a capsule. Later (files closed, different folder open), activate the task — the editor returns to that state: right folder, files reopened, terminals recreated. Switching tasks saves the outgoing task's capsule automatically.

**Why this shape:** the vision's MVP is "perfect task switching, nothing else." With one real connector (VS Code) shipped, capsules can prove the full save→restore loop on real state; phases 9–10 then *extend* capsules (branch, tabs) rather than invent them.

```
   Activate task B (while task A is active)
        │
        ▼
   ┌──────────── capsules.rs (desktop app) ────────────┐
   │ 1. capture connected connectors ──► save into A   │
   │ 2. read B's resources from omnibus-db             │
   │ 3. per connector kind:                            │
   │      folder matches → open files, make terminals  │
   │      folder differs → workspace.open ──► editor   │
   │                        reloads; PENDING restore   │
   │ 4. on connectorConnected(kind) with a PENDING     │
   │    restore → finish: open files, make terminals   │
   └───────────────────────────────────────────────────┘
        commands flow through the hub as always —
        every step is visible in the Debug activity log
```

### Success criteria

1. Tasks are manageable in the Projects view: create under a project, list, mark done/reopen, delete (confirm).
2. **Save:** with the editor connected, "save state" on a task stores its capsule; the UI shows a per-kind summary (e.g. `vscode: 3 files, 1 terminal`) with a timestamp; saving again replaces it.
3. **Same-folder restore:** activate a task whose capsule folder matches the editor's current folder — capsule files reopen and terminals are recreated in place.
4. **Cross-folder restore:** activate a task pointing at a different folder — the editor switches folders (window reload), the connector re-registers, and the continuation then opens the capsule's files and terminals without further clicks.
5. **Auto-save on switch:** activating task B while A is active first captures current state into A; A's summary updates.
6. The full orchestration (capture→rows, same-folder apply, cross-folder pending + reconnect continuation, auto-save-on-switch) is proven by integration tests against a real hub and a scripted `vscode`-kind connector — no GUI needed.
7. All suites/builds green and warning-free; DoD holds.

## Non-goals

- No branch capture/restore — capsules get a git dimension in phase 9; the schema already accommodates it (a new `connector_kind`/`resource_type` row, no migration).
- No Chrome tabs (phase 10), no cursor/scroll positions, no window layout.
- No capsule history: latest-only per (task, connector kind). Versioning is a future decision, not a schema accident.
- No continuous/background capture — capsules change **only** on explicit save or task switch. The event log (phase 5) remains debug-only and is not a capsule source.
- No persistent active-task memory across app restarts (in-memory this phase; follow-up noted).
- No hub or protocol changes; no SDK changes; connector changes limited to none (phase 7's surface is sufficient).

---

## Key decision: capsules live in `task_resources`, latest-only

**What:** a capsule is the set of `task_resources` rows for a task: one row per connector kind, `resource_type: "workspace"`, `payload` = that connector's captured `workspace.state` result. Saving replaces the rows for the kinds captured now (kinds not currently connected keep their old rows).

**Why:** phase 5 built this table for exactly this; one row per kind keeps replace semantics trivial and restore reads whole. Latest-only matches the product promise (resume where I left off), avoids unbounded growth, and postpones versioning as a *decision* instead of sliding into it.

**Trade-off accepted:** a bad save overwrites a good capsule. Acceptable while saves are explicit; capsule history is the future answer if it bites.

## Key decision: orchestration in Rust, in the desktop app

**What:** a `capsules.rs` module in the desktop crate owns capture and restore: it calls `hub.send_command`, reads/writes `omnibus-db`, tracks the active task and any pending restore, exposed to the UI as thin Tauri commands (`save_capsule`, `activate_task`, `active_task`, plus task CRUD wrappers).

**Why:** ownership — the hub routes, the db stores, the *app* orchestrates. Rust-side orchestration is integration-testable headless (real `Hub::start`, in-memory `Db`, scripted WebSocket connector), which is what makes success criterion 6 possible; UI-side orchestration would be click-verified only.

**Alternatives rejected:** frontend orchestration (untestable, splits app logic across layers); a new crate (two consumers don't exist yet — "architect for one fake connector" applies).

## Key decision: cross-folder restore is a two-phase continuation

**What:** if the capsule's `workspaceFolder` differs from the editor's current one, restore sends `workspace.open` (which reloads the editor window, killing the connector), records a **pending restore** (files + terminals), and finishes when a connector of that kind re-registers: on `ConnectorConnected`, wait a short settle delay (default 1500 ms, configurable for tests), then apply.

**Why:** phase 7 established `workspace.open` as fire-and-confirm-by-reconnect; a capsule restore that stopped at the folder switch would restore half a task and hand the rest back to the human — the exact context-rebuilding the product exists to kill.

**Semantics pinned:** one pending restore at most (a new activation replaces it); a pending restore survives until the matching kind reconnects or is replaced; it is in-memory (an app restart mid-reload drops it — re-activating the task recovers).

## Capture and restore mapping

Capturable kinds this phase: `vscode`, `fake` (the fake keeps orchestration testable and CI-friendly).

- **Capture (both kinds):** `workspace.state` → store the whole reply as the payload. Connectors that fail or aren't connected are skipped and reported in the save summary.
- **Restore `vscode`:** read current `workspace.state`; folder matches → `editor.openFile` per capsule file + `terminal.create` per capsule terminal with a known cwd; folder differs → `workspace.open` + pending continuation. Individual file/terminal failures are collected, not fatal.
- **Restore `fake`:** `workspace.open` with the capsule folder (the fake's surface is read-mostly; it exists here as the test vehicle).
- Kinds in the capsule with no connected connector are reported as skipped — restore is best-effort per connector, never all-or-nothing.

## Task UI

Inside the Projects view (gray boxes): each project row gains an expandable **tasks** section — a new-task input, and per task: title, status (open/done toggle), **activate**, **save state**, delete (inline confirm), the per-kind capsule summary with saved-at time, and a highlight on the active task. Activation results (applied / pending reload / skipped kinds, auto-saved previous task) render inline.

## What gets stored (privacy)

A capsule stores exactly what its connectors' `workspace.state` returns: workspace folder path, open file paths, active file path, terminal names/cwds. Restore metadata only — no file contents, no terminal output, nothing the connector didn't already put on the bus, nothing leaving the machine. Saves happen only on explicit user action (button or task switch); the UI's capsule summary is the visibility surface.

## Error handling

| Failure | Behavior |
|---|---|
| Save with no capturable connector connected | Save summary reports nothing captured; existing capsule untouched |
| A connector fails/timeouts during capture | That kind skipped (reported); other kinds still captured |
| Activate a task with no capsule | Summary says so; task still becomes active |
| Capsule kind has no connected connector | Reported skipped; rest of the capsule still applies |
| Individual `editor.openFile`/`terminal.create` fails | Collected into the summary; restore continues |
| App restarts with a pending restore | Pending is lost (in-memory); re-activating the task redoes the restore |
| Auto-save of previous task fails | Logged in the summary; activation of the new task proceeds |

## Testing

- **`omnibus-db`:** `replace_task_resources` (per-kind replace, other kinds untouched) unit tests.
- **Orchestration integration tests (desktop crate):** real `Hub::start` + in-memory `Db` + scripted `vscode`-kind WebSocket connector: capture writes the right rows; same-folder activate sends `editor.openFile`/`terminal.create`; cross-folder activate sends `workspace.open`, then reconnect triggers the continuation (short settle delay in tests); activate-B-while-A-active captures into A first.
- **UI:** walkthrough per success criteria 1–5 (activation clicks are manual; everything beneath them is the tested orchestration).

## Build order

1. `omnibus-db::replace_task_resources` + tests.
2. `capsules.rs` (Capsules struct, save/activate/continuation, summaries) + integration tests.
3. Tauri commands (capsule ops + task CRUD wrappers) + setup wiring (Arc<Hub>, continuation subscriber).
4. Task UI in the Projects view.
5. Walkthrough + docs.
