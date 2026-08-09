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
