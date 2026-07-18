# OmniBus — Persistence (Phase 5)

**Date:** 2026-07-17
**Status:** Implemented (restructured for readability 2026-07-18; recording-modes note added)
**Scope:** `omnibus-db` crate (SQLite schema + typed API + migrations), a recorder wiring hub activity into it, dev-console preload of persisted history.
**Out of scope:** project/task UI (phase 6), auth enforcement, task capsules (phase 8), event replay/export, cloud sync.

Builds on the merged Architecture Foundation (phases 1–4). That spec's Principles, Coding standards, and Definition of Done apply unchanged. The vision doc's **Privacy Principles** bind everything stored here.

---

## Goal

**What:** Give OmniBus a persistent memory. After this phase: quit the app, relaunch, and the dev console shows recent activity from before the restart and previously-seen connectors as disconnected "known" entries. Projects, tasks, and task-resources tables exist with a tested Rust API but no UI.

**Why now:** phase 6 (project registration) and phase 8 (task capsules) both need somewhere durable to write. Landing the schema and storage discipline first makes those phases UI and semantics work, not storage work.

### Success criteria

1. Launch the app, run the fake connector (chatty), quit the app, relaunch — the activity log is pre-seeded with the last events from before the restart (visually marked as historical), and `fake-vscode` appears in the connectors panel as a known-but-disconnected entry before it reconnects.
2. The events table never exceeds the configured cap (default 10 000 rows) — enforced on insert, covered by a test.
3. `cargo test` includes `omnibus-db` unit tests (CRUD, constraints, cascade, cap, migration idempotence) and an integration test proving hub → recorder → rows with a real WebSocket client.
4. Projects/tasks/task-resources CRUD works through the `omnibus-db` API with tests; no UI.
5. Foundation DoD holds: warning-free builds, all tests green, READMEs/spec updated, criteria walked end-to-end.

## Non-goals

- No project/task UI or Tauri CRUD commands beyond `recent_events` / `known_connectors` (phase 6 owns registration UI).
- No auth enforcement — the `token` column is written by nobody and read by nobody in this phase.
- No capsule save/restore semantics.
- No event replay, export, or search.
- No ORM, no async database framework.
- No cross-machine or cloud anything.

---

## Why the Hub Doesn't Know About SQLite

The hub is responsible only for routing messages.

Persistence is implemented as a **recorder** that subscribes to the hub's event
broadcast — the same stream the UI uses — and writes what it sees to SQLite.

```
                OmniBus Desktop
        ┌──────────────────────────┐
        │         Hub              │
        └──────────┬───────────────┘
                   │ HubEvent (broadcast)
        ┌──────────┴──────────┐
        │                     │
   Dev Console            Recorder
                              │
                              ▼
                       SQLite Database
                        (omnibus.db)
```

This gives us several advantages:

- The hub has no database dependency (`omnibus-hub` gained zero new deps).
- Database failures cannot interrupt routing — a lagging or dead recorder is
  just a slow subscriber.
- Other persistence systems could subscribe to the same events in the future
  without touching the hub.

**Trade-off accepted:** the recorder sees events after the fact, so it can miss
events under extreme broadcast lag (it skips and continues, same policy as the
UI). For an activity log with a cap, that is the right trade.

`omnibus-hub` and `omnibus-db` are sibling crates composed only by the desktop app
(and the headless example behind a `--record` flag). The recorder consumes
*serialized* HubEvent JSON rather than hub types, which is what keeps the
crates fully decoupled.

## Key decisions

- **Stack: `rusqlite` + `spawn_blocking`.** Synchronous SQLite behind a small typed crate; async callers use provided `spawn_blocking` wrappers.
  *Why:* SQLite's C library is synchronous at heart; "async" wrappers just hide a thread. Rejected: sqlx (heavy deps, build-time metadata, async-over-blocking anyway) and diesel (ORM surface for five tables) — per the simplicity principles.
- **Migrations: numbered embedded SQL via `user_version`.** `migrations/001_init.sql`, … applied in order when SQLite's `user_version` is behind; ~30 lines of code, no framework. Each migration and its version bump run in one transaction, so a failed future migration rolls back cleanly instead of wedging the database. Idempotence tested by opening the same database twice.
- **Connector identity: `(name, kind)` unique.** The hub's per-session `connectorId` stays ephemeral; the `connectors` table records "tools this machine has seen" with first/last-seen timestamps.
  *Why:* the question the UI answers is "what tools do I know about," not "what sessions have existed." Per-connector tokens get a **reserved, unread** nullable column now (per the foundation spec's auth deferral) so enforcement later is a code change, not a schema change.

## Schema

Database file: `<app-data-dir>/omnibus.db` (next to `hub.json`), WAL mode. All ids are UUID strings unless noted; timestamps are ISO-8601 UTC text.

```sql
projects        id PK, name UNIQUE NOT NULL, repo_path NOT NULL, dev_url,
                default_branch NOT NULL, created_at, updated_at
tasks           id PK, project_id FK→projects ON DELETE CASCADE, title NOT NULL,
                status NOT NULL ('open'|'done'), created_at, updated_at
task_resources  id PK, task_id FK→tasks ON DELETE CASCADE, connector_kind NOT NULL,
                resource_type NOT NULL, payload JSON NOT NULL, created_at
connectors      id PK, name NOT NULL, kind NOT NULL, capabilities JSON NOT NULL,
                token,            -- reserved for auth phase; never read here
                first_seen, last_seen, UNIQUE(name, kind)
events          seq INTEGER PK AUTOINCREMENT, at NOT NULL, type NOT NULL,
                session_connector_id, payload JSON NOT NULL
```

Why these shapes:

- `projects` columns match phase 6's registration fields exactly, so that phase is UI-only.
- `tasks` is deliberately minimal — phase 8 (capsules) extends it.
- `task_resources.payload` is the flexible JSON bag capsules will fill; typed columns exist only for what we query by.

**Event cap:** after each insert, delete rows with `seq <= max(seq) - event_cap`. `event_cap` is a `DbConfig` field, default 10 000.

## What gets stored (privacy)

The events table stores hub traffic: connector lifecycle, command/response
metadata, and event payloads that connectors explicitly emit (e.g. a file *path*
from the fake connector's `editor.fileOpened`). Consistent with the vision doc's
Privacy Principles, nothing here contains file contents, keystrokes, clipboard
data, or anything a connector did not deliberately put on the bus — and the
database never leaves the machine.

## Recording modes (decision deferred, direction recorded)

**What we ship in this phase:** the recorder stores *every* hub event, capped at
10 000 rows. This is debug-phase behavior — it is what makes the dev console's
history useful while the architecture is young.

**What the final product should do differently:** store-everything is not the
end state. Before v0.1 ships, recording should split into two modes:

- **Debug mode** — today's behavior: every event, for development and troubleshooting.
- **Normal mode** — only durable state. A `workspace.open` event doesn't need to
  be kept forever; the latest workspace state is enough. Instead of an
  append-only event log, most activity should simply update the current Task
  Capsule.

The natural time to implement normal mode is phase 8, when Task Capsules define
what "durable state" means. Recording the intent here so the event log is not
mistaken for the long-term design.

## `omnibus-db` crate

```rust
let db = Db::open(path)?;            // runs pending migrations; Db: Clone + Send
Db::open_in_memory()?                // tests
// per-table typed methods (sync core + async spawn_blocking wrappers):
db.record_event(NewEvent) / db.recent_events(limit)
db.upsert_connector(name, kind, capabilities) / db.touch_connector_seen(...) / db.known_connectors()
db.create_project(NewProject) / db.list_projects() / db.delete_project(id)
db.create_task(NewTask) / db.list_tasks(project_id) / db.set_task_status(...) / db.delete_task(id)
db.add_task_resource(NewTaskResource) / db.task_resources(task_id) / db.remove_task_resource(id)
```

Internally `Mutex<rusqlite::Connection>` — one writer, which is exactly SQLite's model. Every public item documented; crate README explains what it is and how to run its tests.

## Desktop integration

**What:** on setup the app opens the db (before hub start), spawns the recorder, and exposes two new Tauri commands: `recent_events(limit)` and `known_connectors()`.

**How the recorder maps sessions to identities:** disconnect events carry only the ephemeral session `connectorId`, so the recorder keeps an in-memory map session-id → `(name, kind)` populated from the corresponding `connectorConnected`; a disconnect for an unknown session id (recorder started mid-session) is logged and skipped.

```
connectorConnected ────► upsert_connector + remember session→(name,kind)
any event          ────► record_event (capped)
connectorDisconnected ─► look up session → touch last_seen
                         (unknown session → log, skip)
```

**UI:** on startup the store preloads the last 200 events, rendered dimmed with a `historical: true` flag, and seeds the connectors panel with known connectors as disconnected rows (they flip to live rows on `connectorConnected`). No other UI changes — still gray boxes.

**Headless example:** `--record` flag composes the same recorder, making persistence testable without Tauri.

## Error handling

| Failure | Behavior |
|---|---|
| DB open or migration fails at startup | Fatal, clear error — a silently half-migrated store is worse than not starting |
| Individual write fails after startup | Log and continue — persistence trouble must never break live routing |
| Recorder receives broadcast `Lagged` | Skip and continue (same policy as the UI forwarder) |
| Event cap pruning fails | Same as any write failure: log, continue |
| DB file deleted while running | Writes fail and are logged; next launch recreates via migrations |

## Testing

- **`omnibus-db` unit tests** (in-memory): CRUD round-trips per table, `UNIQUE(name, kind)` and `projects.name` constraints, cascade deletes, event-cap enforcement, migration idempotence (`open` twice; `user_version` advances once), migration atomicity (a failing migration rolls back and leaves `user_version` untouched), schema-too-new guard.
- **Recorder integration test**: drive the `Recorder` in-process against a real hub and a real WebSocket connector (not by spawning `--record`), register + emit events, assert event rows and the connector upsert landed. `--record` itself is covered by the manual walkthrough.
- **UI**: walkthrough per success criterion 1; no UI test framework (unchanged from foundation).

## Build order

1. `crates/omnibus-db`: migrations runner + `001_init.sql` + `Db::open`/`open_in_memory` + migration tests.
2. Events + connectors methods with cap enforcement + tests.
3. Projects/tasks/task-resources CRUD + constraint/cascade tests.
4. Recorder (in desktop app) + `--record` in the headless example + integration test.
5. Tauri commands `recent_events`/`known_connectors` + UI preload (historical dimming, known-connector seeding).
6. Walk success criteria end-to-end; update READMEs.
