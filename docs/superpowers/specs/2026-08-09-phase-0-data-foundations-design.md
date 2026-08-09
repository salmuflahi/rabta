# Phase 0 — data foundations

Date: 2026-08-09
Status: approved design, ready for planning
Scope: `crates/omnibus-db` and its callers in `apps/desktop/src-tauri`
Blocks: Phase 3 (Migrate). Independent of Phases 1–2 (UI).

## Why this goes first

Rabta's UI was rebuilt end to end in a day. A data model cannot be. Schema
decisions are the part of this product that calcifies — every table added later
multiplies the cost of changing the ones already there — so the cheapest moment
to get them right is now, at one published release with a single author.

This is **not** sync. Nothing here uploads anything, adds an account, or
contacts a server. It is the narrower discipline of *not destroying information
you will need later*.

**It is also a prerequisite for a feature already designed.** The Migrate flow in
`design_handoff_rabta_console/README.md` promises a review step that reports
*"Already on this Mac — 2 name collisions"* with **Keep both / Replace / Skip**,
and warns *"The two here are overwritten. That cannot be undone."* Honouring that
requires knowing which machine a record came from, and distinguishing *deleted
here* from *never arrived*. Neither is possible today.

## What is already right

Credit where due — the expensive parts are done:

- **UUIDv4 string IDs.** `Db::new_id()` returns `uuid::Uuid::new_v4().to_string()`
  and every `id` column is `TEXT`. Two Macs can create records offline and never
  collide. Retrofitting this onto autoincrement integers is the migration nobody
  wants; it is not needed.
- **`created_at` and `updated_at`** exist on projects and tasks.
- **`archived_at` on projects** — the soft-delete shape already exists once.

## The three gaps

### 1. Hard deletes

Five tables issue `DELETE FROM`:

| Table | Verdict |
| --- | --- |
| `projects` | tombstone |
| `tasks` | tombstone |
| `task_resources` | tombstone |
| `task_pins` | tombstone |
| `events` | **leave alone** — see below |

A row that is simply gone is indistinguishable from a row that never arrived.
Delete a capsule on the laptop, transfer to the iMac, and the iMac has no way to
know it should not resurrect it.

**`events` is deliberately excluded.** Its delete is retention pruning —
`DELETE FROM events WHERE seq <= (SELECT MAX(seq) FROM events) - ?1` — and a
tombstone for a pruned log entry defeats the point of pruning. Activity is an
append-only log with a retention window, not synchronised state.

### 2. No device identity

Nothing records which Mac a row came from. Migrate's collision review cannot be
written without it, and any later merge would be guessing.

### 3. `updated_at` is not a reliable merge signal

The columns exist but are not guaranteed to move on every mutation, and wall
clocks drift between machines. A per-record change counter that only increases
gives a merge a signal it can trust without trusting the clock.

## What Phase 0 does

**1. Tombstones on four tables.** Add `deleted_at TEXT` (nullable, UTC ISO-8601).
Replace `DELETE FROM` with an update that sets it. Every read filters
`deleted_at IS NULL` unless it explicitly asks for deleted rows.

The risk to guard is a read path that forgets the filter and starts showing
deleted rows to the user. Every existing query is in scope for review, and the
tests must cover "deleted rows do not appear" per table, not just per query.

**2. A per-install identity.** One UUIDv4 generated on first run and stored in a
settings row, exposed as `Db::install_id()`. Stable across restarts, distinct per
Mac. New rows record the install that created them.

**3. `updated_at` discipline plus a change counter.** Every mutation touches
`updated_at`. Add `rev INTEGER NOT NULL DEFAULT 0`, incremented on every write to
a row. `rev` is a local monotonic counter, not a global clock — it says "this row
changed N times here", which is exactly what a later merge needs and what a
timestamp cannot promise.

**4. Deferred-delete undo keeps working.** The app already ships optimistic
delete with a 5-second undo window (`useDeferredDelete`). Tombstones make that
sturdier — undo becomes clearing `deleted_at` rather than racing a real delete —
but the existing behaviour and its tests must not change.

## Migrations

**Append-only.** This project's established rule: migrations are added, never
edited. An installed copy has already run every prior migration, so editing one
is a no-op there and a divergence everywhere else.

Every added column is nullable or carries a default, so existing rows migrate
without rewriting. `rev` defaults to 0. `deleted_at` defaults to NULL, which
correctly means "not deleted".

## Explicitly out of scope

- Sync of any kind — no server, no network, no upload
- Accounts, identity, or authentication
- Merge or conflict-resolution logic. Phase 0 records the *facts* a merge would
  need; it does not implement one.
- Any UI change. This phase is invisible to the user.
- The `events` table's retention pruning
- Changing the licence (see below — a decision, not a task)

## Testing

`crates/omnibus-db` currently has 39 tests and `rabta-desktop` has 85; both must
stay green, along with the 317 UI tests.

- Per table: a deleted row is absent from every read path that should hide it,
  and present when explicitly requested.
- `install_id` is stable across `Db` reopen, and distinct for a fresh database.
- `rev` increments on update and does not move on a no-op write.
- `updated_at` moves on every mutation.
- The existing deferred-delete undo tests pass unchanged.
- Migrations apply cleanly to a database created at the previous schema — test
  against a real pre-migration database, not a freshly built one, since that is
  the case that actually ships to users.

## A decision only you can make, and it is cheapest today

The repository is **MIT** (`LICENSE`, © 2026 Sammy Almuflahi). Under MIT anyone
may fork, strip a licence check, and redistribute.

You hold the copyright, so you can license **future** versions differently.
Everything already published stays MIT permanently — that cannot be withdrawn.
Right now the cost of changing course is at its minimum: **one published release
(`v0.1.0`) and a single author across all 357 commits.** Each additional release,
and especially each outside contributor whose copyright you would need to clear,
raises it.

This does not block Phase 0 or any later phase. It is recorded here because the
window is open now and narrows quietly.
