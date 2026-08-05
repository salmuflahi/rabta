-- Defined workspaces, phase 1: an item a user marked as "always open this".
-- Deliberately NOT a flag inside task_resources.payload — that payload is a
-- faithful record of what a connector reported, and replace_task_resources
-- replaces it wholesale on every capture. Keeping pins in their own table is
-- what makes "pins survive auto-save" true by construction rather than by a
-- read-merge-write nobody would notice breaking.
CREATE TABLE task_pins (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  connector_kind TEXT NOT NULL,
  identity TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (task_id, connector_kind, identity)
);

CREATE INDEX idx_task_pins_task ON task_pins (task_id);
