# Phase 0 — Data Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop destroying information the product will need — add tombstones, a per-install identity, and a per-row change counter to `omnibus-db`, without adding sync, a server, or any UI change.

**Architecture:** One append-only SQLite migration adds the columns and a settings table. `Db` gains `install_id()`. Every mutation maintains `updated_at` and increments `rev`. Four tables replace `DELETE` with a tombstone write, and every read path filters tombstoned rows. The UI is untouched and must keep passing unchanged.

**Tech Stack:** Rust, `rusqlite`, SQLite with `user_version` migrations, `uuid` v4. Tests are `cargo test`.

**Spec:** `docs/superpowers/specs/2026-08-09-phase-0-data-foundations-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **Working directory:** `/Users/sammy/rabta`. Rust tests: `cargo test -p rabta-db` and `cargo test -p rabta-desktop`. UI tests: `cd apps/desktop && pnpm test`.
- **Branch:** work on `design/app-ui-mac-native-redesign`'s successor — create `feat/phase-0-data-foundations` off the current HEAD. Never commit to `main`.
- **Migrations are append-only.** Add `005_*.sql`; never edit `001`–`004`. An installed copy has already run them, so an edit is a no-op there and a divergence everywhere else.
- **Every added column must be nullable or have a default**, so existing rows migrate without a rewrite.
- **This phase is invisible to the user.** No UI change, no new user-facing string. The 317 UI tests must pass **unchanged** — if one fails, that is a real regression, not a contract change.
- **Not in scope, at all:** sync, networking, uploads, accounts, merge/conflict resolution. Phase 0 records the facts a merge would need; it does not implement one.
- **Do not touch** the `events` table's retention pruning (`record_event`, `activity.rs`). It is an append-only log with a window, not synchronised state.
- **Crate naming is counterintuitive:** directory `crates/omnibus-db` is package `rabta-db`; tests import `rabta_desktop_lib`.

---

## File Structure

**Create**
- `crates/omnibus-db/migrations/005_data_foundations.sql` — the only schema change.

**Modify**
- `crates/omnibus-db/src/lib.rs` — register migration 005; add `install_id()`.
- `crates/omnibus-db/src/records.rs` — tombstone writes, read filters, `rev`/`updated_at` discipline.
- `crates/omnibus-db/src/records.rs` record structs — new fields where they are read back.

**Deliberately unmodified**
- `crates/omnibus-db/src/activity.rs` — the events log keeps hard pruning.
- Everything under `apps/desktop/src` — the UI is untouched.

---

### Task 1: Migration 005 and the install identity

**Files:**
- Create: `crates/omnibus-db/migrations/005_data_foundations.sql`
- Modify: `crates/omnibus-db/src/lib.rs:10-15` (the `MIGRATIONS` array), plus a new `install_id` method
- Test: `crates/omnibus-db/src/lib.rs` (the existing `#[cfg(test)] mod tests`)

**Interfaces:**
- Consumes: the existing `apply_migrations` / `user_version` mechanism.
- Produces: columns `deleted_at TEXT` and `rev INTEGER NOT NULL DEFAULT 0` on `projects`, `tasks`, `task_resources`, `task_pins`; a `db_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL)` table; and `Db::install_id(&self) -> Result<String>`.

- [ ] **Step 1: Write the failing test**

Add to the tests module in `crates/omnibus-db/src/lib.rs`:

```rust
#[test]
fn install_id_is_stable_across_reopen_and_unique_per_database() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("t.sqlite3");

    let first = { Db::open(&path).unwrap().install_id().unwrap() };
    let again = { Db::open(&path).unwrap().install_id().unwrap() };
    // Same database must keep its identity across restarts, or every launch
    // would look like a different Mac.
    assert_eq!(first, again);

    let other_dir = tempfile::tempdir().unwrap();
    let other = Db::open(other_dir.path().join("t.sqlite3")).unwrap().install_id().unwrap();
    assert_ne!(first, other, "a different database must be a different install");
    assert_eq!(first.len(), 36, "expected a UUIDv4 string");
}

#[test]
fn migration_005_applies_to_a_database_created_at_the_previous_schema() {
    // The case that actually ships: an existing install, not a fresh build.
    let conn = Connection::open_in_memory().unwrap();
    let older: Vec<&str> = MIGRATIONS[..MIGRATIONS.len() - 1].to_vec();
    apply_migrations(&conn, &older).unwrap();
    conn.execute(
        "INSERT INTO projects (id, name, repo_path, dev_url, default_branch, created_at, updated_at)
         VALUES ('p1','Legacy','/tmp/p','', 'main', '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')",
        [],
    )
    .unwrap();

    apply_migrations(&conn, MIGRATIONS).unwrap();

    let (deleted, rev): (Option<String>, i64) = conn
        .query_row("SELECT deleted_at, rev FROM projects WHERE id='p1'", [], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })
        .unwrap();
    assert_eq!(deleted, None, "an existing row must migrate as not-deleted");
    assert_eq!(rev, 0, "an existing row must start at rev 0");
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cargo test -p rabta-db install_id_is_stable migration_005_applies
```

Expected: FAIL — `install_id` does not exist, and `005` is not in `MIGRATIONS`.

- [ ] **Step 3: Write the migration**

Create `crates/omnibus-db/migrations/005_data_foundations.sql`:

```sql
-- Phase 0 — data foundations.
--
-- Tombstones, a per-install identity and a per-row change counter. This is not
-- sync: nothing here uploads anything. It records the facts a later merge (or
-- the already-designed Migrate flow) would need, which a hard DELETE destroys.
--
-- events is deliberately excluded: its DELETE is retention pruning, and a
-- tombstone for a pruned log entry defeats the point of pruning.

ALTER TABLE projects        ADD COLUMN deleted_at TEXT;
ALTER TABLE projects        ADD COLUMN rev INTEGER NOT NULL DEFAULT 0;

ALTER TABLE tasks           ADD COLUMN deleted_at TEXT;
ALTER TABLE tasks           ADD COLUMN rev INTEGER NOT NULL DEFAULT 0;

ALTER TABLE task_resources  ADD COLUMN deleted_at TEXT;
ALTER TABLE task_resources  ADD COLUMN rev INTEGER NOT NULL DEFAULT 0;

ALTER TABLE task_pins       ADD COLUMN deleted_at TEXT;
ALTER TABLE task_pins       ADD COLUMN rev INTEGER NOT NULL DEFAULT 0;

-- Reads filter deleted rows on every list, so index the live set.
CREATE INDEX IF NOT EXISTS idx_projects_live       ON projects(deleted_at);
CREATE INDEX IF NOT EXISTS idx_tasks_live          ON tasks(project_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_task_resources_live ON task_resources(task_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_task_pins_live      ON task_pins(task_id, deleted_at);

-- Small key/value store for facts about this installation.
CREATE TABLE IF NOT EXISTS db_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

- [ ] **Step 4: Register it and add `install_id`**

In `crates/omnibus-db/src/lib.rs`, append to `MIGRATIONS`:

```rust
    include_str!("../migrations/005_data_foundations.sql"),
```

Then add to `impl Db`:

```rust
    /// A UUIDv4 identifying this installation, generated on first use and
    /// stable thereafter.
    ///
    /// This is a per-database fact, not a per-user one — it says "this Mac",
    /// never "this person". Nothing transmits it; it exists so that a record
    /// can later be attributed to the machine that created it, which is what
    /// the Migrate flow's collision review needs in order to tell you what
    /// came from where.
    pub fn install_id(&self) -> Result<String> {
        let conn = self.conn.lock().unwrap();
        if let Some(existing) = conn
            .query_row(
                "SELECT value FROM db_meta WHERE key = 'install_id'",
                [],
                |r| r.get::<_, String>(0),
            )
            .optional()?
        {
            return Ok(existing);
        }
        let fresh = Self::new_id();
        // INSERT OR IGNORE, then re-read: two threads racing first use must
        // agree on one value rather than each returning its own.
        conn.execute(
            "INSERT OR IGNORE INTO db_meta (key, value) VALUES ('install_id', ?1)",
            params![fresh],
        )?;
        Ok(conn.query_row(
            "SELECT value FROM db_meta WHERE key = 'install_id'",
            [],
            |r| r.get(0),
        )?)
    }
```

Adjust the lock/accessor style to match how neighbouring methods in this file reach the connection — read one first and follow it rather than assuming `self.conn.lock()`.

- [ ] **Step 5: Run tests to verify they pass**

```bash
cargo test -p rabta-db
```

Expected: PASS, including the pre-existing 39.

- [ ] **Step 6: Commit**

```bash
git add crates/omnibus-db/migrations/005_data_foundations.sql crates/omnibus-db/src/lib.rs
git commit -m "feat(db): migration 005 — tombstone columns, rev, and an install identity"
```

---

### Task 2: `rev` and `updated_at` discipline on every write

**Files:**
- Modify: `crates/omnibus-db/src/records.rs` — every `UPDATE` statement
- Test: `crates/omnibus-db/src/records.rs` tests

**Interfaces:**
- Consumes: the `rev` column from Task 1.
- Produces: the invariant that any mutation to a row bumps `rev` by exactly 1 and sets `updated_at` to now.

- [ ] **Step 1: Write the failing test**

```rust
#[test]
fn every_update_bumps_rev_and_touches_updated_at() {
    let db = Db::open_in_memory().unwrap();
    let p = db.create_project("Atlas", "/tmp/atlas", None, "main").unwrap();
    let before = db.get_project(&p.id).unwrap().unwrap();
    assert_eq!(before.rev, 0);

    db.rename_project(&p.id, "Atlas API").unwrap();

    let after = db.get_project(&p.id).unwrap().unwrap();
    // rev is a local monotonic counter, not a clock — it is what a later merge
    // can trust when wall clocks between two Macs disagree.
    assert_eq!(after.rev, 1, "an update must advance rev by exactly one");
    assert!(after.updated_at >= before.updated_at);
}
```

Use whichever mutating method this crate actually exposes for projects — read `records.rs` and pick a real one; do not invent `rename_project` if it is named something else.

- [ ] **Step 2: Run test to verify it fails**

```bash
cargo test -p rabta-db every_update_bumps_rev
```

Expected: FAIL — `Project` has no `rev` field yet, or it stays 0.

- [ ] **Step 3: Implement**

Add `rev: i64` to the record structs that are read back (`Project`, `Task`, and the resource/pin records), map it in each row-mapper, and widen each `SELECT` to include it.

Then, in **every** `UPDATE` statement in `records.rs`, add `rev = rev + 1` alongside the existing `updated_at = ?`. Enumerate them rather than fixing the ones the test happens to cover:

```bash
grep -n "UPDATE " crates/omnibus-db/src/records.rs
```

Every hit is in scope. If a statement legitimately should not bump `rev` (a pure no-op write), leave it and say why in your report.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cargo test -p rabta-db && cargo test -p rabta-desktop
```

Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add crates/omnibus-db/src/records.rs
git commit -m "feat(db): every mutation bumps rev and touches updated_at"
```

---

### Task 3: Tombstone projects and tasks

**Files:**
- Modify: `crates/omnibus-db/src/records.rs:433` (`delete_project`), `:697` (`delete_task`), and the read paths at `:239` `list_projects`, `:256` `get_project`, `:370` `list_archived_projects`, `:468` `list_tasks`, `:482` `get_task`
- Test: `crates/omnibus-db/src/records.rs` tests

**Interfaces:**
- Consumes: `deleted_at` from Task 1, `rev` discipline from Task 2.
- Produces: `delete_project` / `delete_task` set `deleted_at` instead of removing the row; all listed read paths exclude tombstoned rows.

**The risk on this task is a missed read path**, which would start showing deleted rows to users. Enumerate every query against these tables — including any in `apps/desktop/src-tauri/src/*.rs` — rather than only the ones named above.

- [ ] **Step 1: Write the failing tests**

```rust
#[test]
fn a_deleted_project_disappears_from_every_read_path() {
    let db = Db::open_in_memory().unwrap();
    let p = db.create_project("Atlas", "/tmp/atlas", None, "main").unwrap();
    db.delete_project(&p.id).unwrap();

    assert!(db.list_projects().unwrap().iter().all(|x| x.id != p.id));
    assert!(db.get_project(&p.id).unwrap().is_none());
    assert!(db.list_archived_projects().unwrap().iter().all(|x| x.id != p.id));
}

#[test]
fn deleting_a_project_keeps_the_row_as_a_tombstone() {
    let db = Db::open_in_memory().unwrap();
    let p = db.create_project("Atlas", "/tmp/atlas", None, "main").unwrap();
    db.delete_project(&p.id).unwrap();

    // The whole point: "deleted here" must stay distinguishable from "never
    // arrived", or a later transfer cheerfully resurrects it.
    let (count, deleted_at): (i64, Option<String>) = db
        .with_conn(|c| {
            c.query_row(
                "SELECT COUNT(*), MAX(deleted_at) FROM projects WHERE id = ?1",
                params![p.id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
        })
        .unwrap();
    assert_eq!(count, 1, "the row must survive as a tombstone");
    assert!(deleted_at.is_some());
}

#[test]
fn a_deleted_task_disappears_from_every_read_path() {
    let db = Db::open_in_memory().unwrap();
    let p = db.create_project("Atlas", "/tmp/atlas", None, "main").unwrap();
    let t = db.create_task(&p.id, "Wire the reconnect").unwrap();
    db.delete_task(&t.id).unwrap();

    assert!(db.list_tasks(&p.id).unwrap().iter().all(|x| x.id != t.id));
    assert!(db.get_task(&t.id).unwrap().is_none());
}
```

If `with_conn` does not exist, use whatever escape hatch this crate already provides for a raw query in tests; if none exists, assert via a method rather than adding one.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cargo test -p rabta-db a_deleted_project deleting_a_project_keeps a_deleted_task
```

Expected: the tombstone tests FAIL (the row is gone); the disappear tests may already pass for the wrong reason — because the row was hard-deleted. That is exactly why both halves exist.

- [ ] **Step 3: Implement**

Replace the two deletes:

```rust
        conn.execute(
            "UPDATE projects SET deleted_at = ?2, rev = rev + 1, updated_at = ?2
             WHERE id = ?1 AND deleted_at IS NULL",
            params![id, now_iso()],
        )?;
```

and the same shape for `tasks`. Use whatever this crate already calls its timestamp helper.

Then add `AND deleted_at IS NULL` to every read path listed above. Note `list_archived_projects` filters on `archived_at IS NOT NULL` — archived and deleted are different states and must both be respected.

`delete_task` currently runs in a transaction that also touches children. Preserve that transaction; tombstone the children rather than hard-deleting them.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cargo test -p rabta-db && cargo test -p rabta-desktop && cd apps/desktop && pnpm test
```

Expected: all three PASS. The UI suite must pass **unchanged** — deferred-delete undo already exists and must keep behaving identically.

- [ ] **Step 5: Commit**

```bash
git add crates/omnibus-db/src/records.rs
git commit -m "feat(db): tombstone projects and tasks instead of deleting them"
```

---

### Task 4: Tombstone task_resources, with bounded growth

**Files:**
- Modify: `crates/omnibus-db/src/records.rs:756` (`remove_task_resource`), `:784` (`replace_task_resources`), and the resource read paths
- Test: `crates/omnibus-db/src/records.rs` tests

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: `remove_task_resource` tombstones; `replace_task_resources` purges tombstones for that `(task_id, connector_kind)` as part of the replace.

**Read this before implementing.** These two call sites mean different things and must not be treated alike:

- `remove_task_resource` is **user intent** — you removed an item from a capsule. That must survive as a tombstone.
- `replace_task_resources` is a **fresh capture superseding the previous set**. Its rows have no independent lifecycle; they are the contents of a snapshot. Tombstoning them would grow this table without bound on every single capture.

So `replace_task_resources` **hard-purges** prior rows for that `(task_id, connector_kind)` — both live and tombstoned — and inserts the new set, bumping the parent task's `rev`. The parent task's `rev` is what tells a later merge that the capsule's contents changed; individual resource rows are the wrong granularity to track.

- [ ] **Step 1: Write the failing tests**

```rust
#[test]
fn removing_one_resource_leaves_a_tombstone() {
    // User intent — "I do not want this file in this capsule" must survive.
    // (build a task with resources using this file's existing helpers)
}

#[test]
fn recapturing_does_not_accumulate_rows() {
    // A snapshot replaced 50 times must not leave 50 generations behind.
    let db = Db::open_in_memory().unwrap();
    // ... create a task, then call replace_task_resources 50 times ...
    let total: i64 = /* SELECT COUNT(*) FROM task_resources WHERE task_id = ?1 */;
    assert!(total <= 10, "replace must supersede, not accumulate: found {total}");
}

#[test]
fn recapturing_bumps_the_parent_task_rev() {
    // The capsule's contents changed; the task is the thing that changed.
}
```

Fill these in against the crate's real helpers — read the neighbouring tests first and reuse their construction rather than inventing fixtures.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cargo test -p rabta-db removing_one_resource recapturing_does_not recapturing_bumps
```

Expected: FAIL.

- [ ] **Step 3: Implement**

`remove_task_resource` → `UPDATE ... SET deleted_at = ?, rev = rev + 1`.

`replace_task_resources` → keep the `DELETE` (now purging tombstones too), then insert, then bump the parent task's `rev` and `updated_at` inside the same transaction.

Add `AND deleted_at IS NULL` to resource reads.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cargo test -p rabta-db && cargo test -p rabta-desktop && cd apps/desktop && pnpm test
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add crates/omnibus-db/src/records.rs
git commit -m "feat(db): tombstone resource removals, purge on recapture"
```

---

### Task 5: Tombstone task_pins

**Files:**
- Modify: `crates/omnibus-db/src/records.rs:852` (`remove_task_pin`) and the pin read paths
- Test: `crates/omnibus-db/src/records.rs` tests

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: `remove_task_pin` tombstones; `task_pins` reads exclude tombstoned rows.

Pins are the workspace *definition* layer — the strongest user intent in the product. A pin that was deliberately removed must never come back from a transfer.

**Watch the re-pin path.** A previous arc found that re-pinning an item uses `RETURNING` to get the real id and timestamp. Re-pinning something previously tombstoned must revive that row (clear `deleted_at`, bump `rev`) rather than insert a duplicate — the table has a uniqueness expectation on `(task_id, connector_kind, identity)`.

- [ ] **Step 1: Write the failing tests**

```rust
#[test]
fn an_unpinned_item_stays_unpinned() {
    // Remove a pin, then confirm it is absent from task_pins reads and that
    // the row survives with deleted_at set.
}

#[test]
fn re_pinning_revives_the_tombstone_rather_than_duplicating() {
    // pin -> unpin -> pin again. Exactly one row for that identity, live.
    let count: i64 = /* SELECT COUNT(*) FROM task_pins WHERE task_id=?1 AND identity=?2 */;
    assert_eq!(count, 1, "re-pinning must revive, not duplicate");
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cargo test -p rabta-db an_unpinned_item re_pinning_revives
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Tombstone in `remove_task_pin`; add `AND deleted_at IS NULL` to pin reads; make the pin-insert path an upsert that clears `deleted_at` and bumps `rev` when reviving.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cargo test -p rabta-db && cargo test -p rabta-desktop && cd apps/desktop && pnpm test
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add crates/omnibus-db/src/records.rs
git commit -m "feat(db): tombstone pin removals, revive on re-pin"
```

---

### Task 6: Read-path audit and full verification

**Files:**
- Audit: `crates/omnibus-db/src/`, `apps/desktop/src-tauri/src/`
- Test: wherever a gap is found

**Interfaces:**
- Consumes: everything above.
- Produces: proof that no read path anywhere returns a tombstoned row.

This task exists because the failure mode of Tasks 3–5 is silent: a missed filter shows deleted data to the user, and no test written *for that task* would catch it.

- [ ] **Step 1: Enumerate every query against the four tables**

```bash
grep -rnE "FROM (projects|tasks|task_resources|task_pins)" crates/ apps/desktop/src-tauri/src/
```

For each hit, record in your report: the file and line, whether it filters `deleted_at IS NULL`, and if not, why that is correct (a tombstone-aware query, or a COUNT used for diagnostics).

- [ ] **Step 2: Write a test for each unfiltered read you cannot justify**

Follow the shape from Task 3: delete the row, assert it is absent.

- [ ] **Step 3: Fix them**

- [ ] **Step 4: Full verification**

```bash
cargo test -p rabta-db
cargo test -p rabta-desktop
cd apps/desktop && pnpm test && pnpm exec tsc -b --noEmit && pnpm build
```

Expected: all clean. The 317 UI tests must pass **unchanged** — this phase is invisible to the user.

- [ ] **Step 5: Verify the migration against a real pre-migration database**

Build a database at migration 004, populate every table, then open it with the new binary and confirm every row survives with `deleted_at IS NULL` and `rev = 0`. This is the case that ships to existing users; a fresh build does not exercise it.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test(db): audit every read path for tombstone filtering"
```

---

## Self-Review

**Spec coverage.** Tombstones → Tasks 3–5; install identity → Task 1; `rev` and `updated_at` → Task 2; migration append-only and nullable/defaulted columns → Task 1; `events` excluded → stated in Task 1's migration comment and the global constraints; read-path risk → Task 6; deferred-delete undo unchanged → asserted in Tasks 3–5 via the unchanged UI suite.

**Placeholders.** Tasks 4 and 5 deliberately leave test bodies to be filled against the crate's real helpers rather than inventing fixture APIs — a previous arc lost a review round on this exact crate by inventing names that were self-consistent in the test and matched nothing real. The assertions and their reasons are specified; only the construction is delegated, and each step names the file to read first.

**Type consistency.** `deleted_at` is `Option<String>` everywhere; `rev` is `i64` everywhere; `install_id()` returns `Result<String>`. `replace_task_resources` is the one path that still hard-deletes, and Task 4 states why.

**Ordering hazard.** Task 2 adds `rev` to the record structs, which every later task's reads depend on. Running Tasks 3–5 before 2 would compile but leave `rev` unbumped on tombstone writes.
