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
