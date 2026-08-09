-- Phase 0 — data foundations.
--
-- Tombstones, a per-install identity and a per-row change counter. This is not
-- sync: nothing here uploads anything. It records the facts a later merge (or
-- the already-designed Migrate flow) would need, which a hard DELETE destroys.
--
-- events is deliberately excluded: its DELETE is retention pruning, and a
-- tombstone for a pruned log entry defeats the point of pruning.

-- created_by_install is nullable: it records which install (this Mac)
-- created the row, populated on INSERT going forward. Pre-existing rows
-- migrate as NULL ("unknown creator") rather than being falsely attributed
-- to whichever install happens to run this migration — that would be a
-- fabricated fact, not a recovered one. NULL is what Migrate's collision
-- review should read as "created before attribution existed", never as
-- "created by this Mac".
ALTER TABLE projects        ADD COLUMN deleted_at TEXT;
ALTER TABLE projects        ADD COLUMN rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects        ADD COLUMN created_by_install TEXT;

ALTER TABLE tasks           ADD COLUMN deleted_at TEXT;
ALTER TABLE tasks           ADD COLUMN rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks           ADD COLUMN created_by_install TEXT;

ALTER TABLE task_resources  ADD COLUMN deleted_at TEXT;
ALTER TABLE task_resources  ADD COLUMN rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE task_resources  ADD COLUMN created_by_install TEXT;

ALTER TABLE task_pins       ADD COLUMN deleted_at TEXT;
ALTER TABLE task_pins       ADD COLUMN rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE task_pins       ADD COLUMN created_by_install TEXT;

-- Reads filter deleted rows on every list, so index the live set.
-- projects has no equivalent index: deleted_at is NULL for essentially
-- every row (users archive far more than they delete), so an index on it
-- alone has near-zero selectivity — pure write cost for no read benefit.
-- The three indexes below are all (foreign key, deleted_at) composites,
-- where the leading column carries the real selectivity.
CREATE INDEX IF NOT EXISTS idx_tasks_live          ON tasks(project_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_task_resources_live ON task_resources(task_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_task_pins_live      ON task_pins(task_id, deleted_at);

-- Small key/value store for facts about this installation.
CREATE TABLE IF NOT EXISTS db_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
