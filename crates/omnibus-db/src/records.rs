//! Projects, tasks, and task resources — the data model phases 6+ build on.
use std::collections::HashSet;

use rusqlite::OptionalExtension;
use rusqlite::{params, Connection};
use serde::Serialize;
use serde_json::Value;

use crate::{new_id, now, Db, DbError, Result};

/// Stable project icon keys accepted by storage and mapped by every client.
pub const PROJECT_ICONS: &[&str] = &[
    "code", "globe", "database", "terminal", "blocks", "rocket", "wrench", "folder",
];

/// Input for creating a project (fields match phase 6 registration).
pub struct NewProject {
    pub name: String,
    pub repo_path: String,
    pub dev_url: Option<String>,
    pub default_branch: String,
}

/// A registered project.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub repo_path: String,
    pub dev_url: Option<String>,
    pub default_branch: String,
    pub icon: Option<String>,
    pub archived_at: Option<String>,
    pub last_opened_at: Option<String>,
    pub last_task_id: Option<String>,
    pub active_seconds: u64,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
    pub rev: i64,
}

/// Input for creating a task under a project.
pub struct NewTask {
    pub project_id: String,
    pub title: String,
}

/// Task lifecycle state. Deliberately minimal until capsules (phase 8).
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    Open,
    Done,
}

impl TaskStatus {
    fn as_str(self) -> &'static str {
        match self {
            TaskStatus::Open => "open",
            TaskStatus::Done => "done",
        }
    }
    // Parse status from string; schema's CHECK (status IN ('open','done')) makes Open fallback unreachable.
    fn parse(s: &str) -> TaskStatus {
        if s == "done" {
            TaskStatus::Done
        } else {
            TaskStatus::Open
        }
    }
}

/// A task within a project.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub status: TaskStatus,
    pub created_at: String,
    pub updated_at: String,
    pub rev: i64,
}

/// Input for attaching a resource to a task.
pub struct NewTaskResource {
    pub task_id: String,
    pub connector_kind: String,
    pub resource_type: String,
    pub payload: Value,
}

/// A resource attached to a task (the bag capsules will fill).
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TaskResource {
    pub id: String,
    pub task_id: String,
    pub connector_kind: String,
    pub resource_type: String,
    pub payload: Value,
    pub created_at: String,
    pub rev: i64,
}

/// An item a user marked "always open this" for a task. Authored, never
/// captured — which is why it lives outside task_resources.payload.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskPin {
    pub id: String,
    pub task_id: String,
    pub connector_kind: String,
    pub identity: String,
    pub payload: Value,
    pub created_at: String,
    pub rev: i64,
}

fn project_from_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<Project> {
    Ok(Project {
        id: r.get(0)?,
        name: r.get(1)?,
        repo_path: r.get(2)?,
        dev_url: r.get(3)?,
        default_branch: r.get(4)?,
        icon: r.get(5)?,
        archived_at: r.get(6)?,
        last_opened_at: r.get(7)?,
        last_task_id: r.get(8)?,
        active_seconds: r.get(9)?,
        sort_order: r.get(10)?,
        created_at: r.get(11)?,
        updated_at: r.get(12)?,
        rev: r.get(13)?,
    })
}

fn project_by_id(conn: &Connection, id: &str) -> Result<Option<Project>> {
    Ok(conn
        .query_row(
            "SELECT id, name, repo_path, dev_url, default_branch, icon, archived_at,
                    last_opened_at, last_task_id, active_seconds, sort_order, created_at, updated_at, rev
             FROM projects WHERE id = ?1 AND deleted_at IS NULL",
            params![id],
            project_from_row,
        )
        .optional()?)
}

fn require_project(conn: &Connection, id: &str) -> Result<Project> {
    project_by_id(conn, id)?.ok_or_else(|| DbError::NotFound {
        entity: "project",
        id: id.to_string(),
    })
}

fn task_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Task> {
    Ok(Task {
        id: row.get(0)?,
        project_id: row.get(1)?,
        title: row.get(2)?,
        status: TaskStatus::parse(&row.get::<_, String>(3)?),
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
        rev: row.get(6)?,
    })
}

fn task_by_id(conn: &Connection, id: &str) -> Result<Option<Task>> {
    Ok(conn
        .query_row(
            "SELECT id, project_id, title, status, created_at, updated_at, rev
             FROM tasks WHERE id = ?1 AND deleted_at IS NULL",
            params![id],
            task_from_row,
        )
        .optional()?)
}

fn require_task(conn: &Connection, id: &str) -> Result<Task> {
    task_by_id(conn, id)?.ok_or_else(|| DbError::NotFound {
        entity: "task",
        id: id.to_string(),
    })
}

impl Db {
    /// Creates a project; fails on duplicate name (UNIQUE constraint).
    pub fn create_project(&self, new: NewProject) -> Result<Project> {
        let ts = now();
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let sort_order = conn.query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1
             FROM projects",
            [],
            |r| r.get(0),
        )?;
        // I6: stamp which install created this row, so a later Migrate
        // collision review can tell where it came from.
        let created_by_install = crate::install_id_with_conn(&conn)?;
        let p = Project {
            id: new_id(),
            name: new.name,
            repo_path: new.repo_path,
            dev_url: new.dev_url,
            default_branch: new.default_branch,
            icon: None,
            archived_at: None,
            last_opened_at: None,
            last_task_id: None,
            active_seconds: 0,
            sort_order,
            created_at: ts.clone(),
            updated_at: ts,
            rev: 0,
        };
        conn.execute(
            "INSERT INTO projects (
                id, name, repo_path, dev_url, default_branch, icon, archived_at,
                last_opened_at, last_task_id, active_seconds, sort_order, created_at, updated_at,
                created_by_install
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                p.id,
                p.name,
                p.repo_path,
                p.dev_url,
                p.default_branch,
                p.icon,
                p.archived_at,
                p.last_opened_at,
                p.last_task_id,
                p.active_seconds,
                p.sort_order,
                p.created_at,
                p.updated_at,
                created_by_install
            ],
        )?;
        Ok(p)
    }

    /// All active projects in their persisted order.
    pub fn list_projects(&self) -> Result<Vec<Project>> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let mut stmt = conn.prepare(
            "SELECT id, name, repo_path, dev_url, default_branch, icon, archived_at,
                    last_opened_at, last_task_id, active_seconds, sort_order, created_at, updated_at, rev
             FROM projects
             WHERE archived_at IS NULL AND deleted_at IS NULL
             ORDER BY sort_order, lower(name), id",
        )?;
        let rows = stmt.query_map([], project_from_row)?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// One project by id.
    pub fn get_project(&self, id: &str) -> Result<Option<Project>> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        project_by_id(&conn, id)
    }

    /// Renames a project after trimming its user-facing name.
    pub fn rename_project(&self, id: &str, name: &str) -> Result<Project> {
        let name = name.trim();
        if name.is_empty() {
            return Err(DbError::Validation {
                field: "name",
                message: "must not be empty".into(),
            });
        }
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let changed = conn.execute(
            "UPDATE projects SET name = ?2, updated_at = ?3, rev = rev + 1
             WHERE id = ?1 AND deleted_at IS NULL",
            params![id, name, now()],
        )?;
        if changed == 0 {
            return Err(DbError::NotFound {
                entity: "project",
                id: id.to_string(),
            });
        }
        require_project(&conn, id)
    }

    /// Assigns an allowlisted icon key, or clears the custom icon.
    pub fn set_project_icon(&self, id: &str, icon: Option<&str>) -> Result<Project> {
        if let Some(icon) = icon {
            if !PROJECT_ICONS.contains(&icon) {
                return Err(DbError::Validation {
                    field: "icon",
                    message: format!("unknown project icon: {icon}"),
                });
            }
        }
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let changed = conn.execute(
            "UPDATE projects SET icon = ?2, updated_at = ?3, rev = rev + 1
             WHERE id = ?1 AND deleted_at IS NULL",
            params![id, icon, now()],
        )?;
        if changed == 0 {
            return Err(DbError::NotFound {
                entity: "project",
                id: id.to_string(),
            });
        }
        require_project(&conn, id)
    }

    /// Reversibly archives a project without deleting its tasks or resources.
    pub fn archive_project(&self, id: &str) -> Result<Project> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        require_project(&conn, id)?;
        let timestamp = now();
        // M6: archived_at is deliberately idempotent (COALESCE), and
        // updated_at keeps moving on every call (matching the existing
        // round-trip test, which pins updated_at advancing even on a
        // repeat archive) — but rev must only advance on the call that
        // actually transitions the project into the archived state. A
        // repeat archive of an already-archived project changed nothing
        // about *what* is archived, so it must be a no-op for the
        // merge-trusted counter even though the timestamp still refreshes.
        conn.execute(
            "UPDATE projects
             SET archived_at = COALESCE(archived_at, ?2),
                 updated_at = ?2,
                 rev = CASE WHEN archived_at IS NULL THEN rev + 1 ELSE rev END
             WHERE id = ?1",
            params![id, timestamp],
        )?;
        require_project(&conn, id)
    }

    /// Restores an archived project at the end of the active project order.
    pub fn unarchive_project(&self, id: &str) -> Result<Project> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let project = require_project(&conn, id)?;
        if project.archived_at.is_none() {
            return Ok(project);
        }

        let tx = conn.unchecked_transaction()?;
        let sort_order: i64 = tx.query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1
             FROM projects WHERE archived_at IS NULL",
            [],
            |row| row.get(0),
        )?;
        let changed = tx.execute(
            "UPDATE projects
             SET archived_at = NULL, sort_order = ?2, updated_at = ?3, rev = rev + 1
             WHERE id = ?1 AND archived_at IS NOT NULL",
            params![id, sort_order, now()],
        )?;
        if changed == 0 {
            return require_project(&tx, id);
        }
        let restored = require_project(&tx, id)?;
        tx.commit()?;
        Ok(restored)
    }

    /// Archived projects, newest archive first.
    pub fn list_archived_projects(&self) -> Result<Vec<Project>> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let mut stmt = conn.prepare(
            "SELECT id, name, repo_path, dev_url, default_branch, icon, archived_at,
                    last_opened_at, last_task_id, active_seconds, sort_order, created_at, updated_at, rev
             FROM projects
             WHERE archived_at IS NOT NULL AND deleted_at IS NULL
             ORDER BY archived_at DESC, lower(name), id",
        )?;
        let rows = stmt.query_map([], project_from_row)?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// Replaces active project order atomically with a dense exact ordering.
    pub fn reorder_projects(&self, ordered_ids: &[String]) -> Result<Vec<Project>> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let tx = conn.unchecked_transaction()?;
        let active_ids = {
            let mut stmt = tx.prepare(
                "SELECT id FROM projects
                 WHERE archived_at IS NULL AND deleted_at IS NULL
                 ORDER BY sort_order, lower(name), id",
            )?;
            let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
            rows.collect::<std::result::Result<Vec<_>, _>>()?
        };
        let ordered_set: HashSet<&str> = ordered_ids.iter().map(String::as_str).collect();
        if ordered_set.len() != ordered_ids.len() {
            return Err(DbError::Validation {
                field: "orderedIds",
                message: "must not contain duplicate project IDs".into(),
            });
        }
        let active_set: HashSet<&str> = active_ids.iter().map(String::as_str).collect();
        if ordered_ids.len() != active_ids.len() || ordered_set != active_set {
            return Err(DbError::Validation {
                field: "orderedIds",
                message: "must contain every active project exactly once".into(),
            });
        }
        // M6: writing every id unconditionally meant a drag-and-drop that
        // lands back on the same order bumped rev on every project. Gate
        // both updated_at and rev on the position actually changing for
        // that row, so dropping something back where it started is a true
        // no-op, not just a no-op for sort_order.
        for (position, id) in ordered_ids.iter().enumerate() {
            tx.execute(
                "UPDATE projects
                 SET sort_order = ?2,
                     updated_at = CASE WHEN sort_order != ?2 THEN ?3 ELSE updated_at END,
                     rev = CASE WHEN sort_order != ?2 THEN rev + 1 ELSE rev END
                 WHERE id = ?1",
                params![id, position as i64, now()],
            )?;
        }
        tx.commit()?;
        drop(conn);
        self.list_projects()
    }

    /// Tombstones a project; its tasks (and their resources and pins)
    /// tombstone with it rather than being hard-deleted, so a later Migrate
    /// can still tell "deleted here" from "never arrived".
    pub fn delete_project(&self, id: &str) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let tx = conn.unchecked_transaction()?;
        let ts = now();
        tx.execute(
            "UPDATE task_resources SET deleted_at = ?2, rev = rev + 1
             WHERE deleted_at IS NULL AND task_id IN (
                 SELECT id FROM tasks WHERE project_id = ?1 AND deleted_at IS NULL
             )",
            params![id, ts],
        )?;
        tx.execute(
            "UPDATE task_pins SET deleted_at = ?2, rev = rev + 1
             WHERE deleted_at IS NULL AND task_id IN (
                 SELECT id FROM tasks WHERE project_id = ?1 AND deleted_at IS NULL
             )",
            params![id, ts],
        )?;
        tx.execute(
            "UPDATE tasks SET deleted_at = ?2, rev = rev + 1, updated_at = ?2
             WHERE project_id = ?1 AND deleted_at IS NULL",
            params![id, ts],
        )?;
        // M5: also clears last_task_id — otherwise a tombstoned project is
        // left pointing at a task this same call just tombstoned too.
        // M5: also clears last_task_id — otherwise a tombstoned project is
        // left pointing at a task this same call just tombstoned too.
        tx.execute(
            "UPDATE projects SET deleted_at = ?2, rev = rev + 1, updated_at = ?2, last_task_id = NULL
             WHERE id = ?1 AND deleted_at IS NULL",
            params![id, ts],
        )?;
        tx.commit()?;
        Ok(())
    }

    /// Creates a task in status `open`.
    pub fn create_task(&self, new: NewTask) -> Result<Task> {
        let ts = now();
        let t = Task {
            id: new_id(),
            project_id: new.project_id,
            title: new.title,
            status: TaskStatus::Open,
            created_at: ts.clone(),
            updated_at: ts,
            rev: 0,
        };
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let created_by_install = crate::install_id_with_conn(&conn)?;
        conn.execute(
            "INSERT INTO tasks (id, project_id, title, status, created_at, updated_at, created_by_install) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                t.id,
                t.project_id,
                t.title,
                t.status.as_str(),
                t.created_at,
                t.updated_at,
                created_by_install
            ],
        )?;
        Ok(t)
    }

    /// Tasks for one project, newest first.
    pub fn list_tasks(&self, project_id: &str) -> Result<Vec<Task>> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let mut stmt = conn.prepare(
            "SELECT id, project_id, title, status, created_at, updated_at, rev \
             FROM tasks WHERE project_id = ?1 AND deleted_at IS NULL ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map(params![project_id], task_from_row)?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// One task by id.
    pub fn get_task(&self, id: &str) -> Result<Option<Task>> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        task_by_id(&conn, id)
    }

    /// Starts a fresh session for the active project that owns `task_id`.
    pub fn begin_project_session_for_task(&self, task_id: &str, opened_at: &str) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let changed = conn.execute(
            "UPDATE projects
             SET last_opened_at = ?2,
                 last_task_id = ?1,
                 active_seconds = 0,
                 updated_at = ?2,
                 rev = rev + 1
             WHERE id = (
               SELECT project_id FROM tasks WHERE id = ?1 AND deleted_at IS NULL
             )
             AND archived_at IS NULL",
            params![task_id, opened_at],
        )?;
        if changed == 0 {
            return Err(DbError::NotFound {
                entity: "active project for task",
                id: task_id.to_string(),
            });
        }
        Ok(())
    }

    /// Adds focused, non-idle whole seconds to the active project owning
    /// `task_id`.
    ///
    /// I3: this deliberately does NOT bump `rev`. The UI heartbeats every
    /// ~15s (`useSessionTracking`), so treating each accrual as a rev-worthy
    /// mutation made `projects.rev` answer "how long was this Mac open"
    /// (~240 bumps/focused hour) while every sibling table's `rev` only
    /// moves on genuine content change — two different units a later merge
    /// could not meaningfully compare. `rev` is reserved for edits; session
    /// accrual is metering, not an edit. `updated_at` still moves: the row's
    /// `active_seconds` genuinely changed, and `updated_at`'s job is to say
    /// "this row was last touched at this wall-clock time" — it was never
    /// promised as a trustworthy merge counter the way `rev` is.
    pub fn add_active_seconds_for_task(&self, task_id: &str, seconds: u64) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if seconds == 0 {
            let active: bool = conn.query_row(
                "SELECT EXISTS(
                   SELECT 1
                   FROM tasks
                   JOIN projects ON projects.id = tasks.project_id
                   WHERE tasks.id = ?1 AND tasks.deleted_at IS NULL AND projects.archived_at IS NULL
                 )",
                params![task_id],
                |row| row.get(0),
            )?;
            if !active {
                return Err(DbError::NotFound {
                    entity: "active project for task",
                    id: task_id.to_string(),
                });
            }
            return Ok(());
        }

        let seconds = i64::try_from(seconds).unwrap_or(i64::MAX);
        let changed = conn.execute(
            "UPDATE projects
             SET active_seconds = CASE
                   WHEN active_seconds >= ?4 - ?2 THEN ?4
                   ELSE active_seconds + ?2
                 END,
                 updated_at = ?3
             WHERE id = (
               SELECT project_id FROM tasks WHERE id = ?1 AND deleted_at IS NULL
             )
             AND archived_at IS NULL",
            params![task_id, seconds, now(), i64::MAX],
        )?;
        if changed == 0 {
            return Err(DbError::NotFound {
                entity: "active project for task",
                id: task_id.to_string(),
            });
        }
        Ok(())
    }

    /// Renames a task after trimming its user-facing title.
    pub fn rename_task(&self, id: &str, title: &str) -> Result<Task> {
        let title = title.trim();
        if title.is_empty() {
            return Err(DbError::Validation {
                field: "title",
                message: "must not be empty".into(),
            });
        }
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let changed = conn.execute(
            "UPDATE tasks SET title = ?2, updated_at = ?3, rev = rev + 1
             WHERE id = ?1 AND deleted_at IS NULL",
            params![id, title, now()],
        )?;
        if changed == 0 {
            return Err(DbError::NotFound {
                entity: "task",
                id: id.to_string(),
            });
        }
        require_task(&conn, id)
    }

    /// Creates an open copy of a task and all of its captured resources.
    pub fn duplicate_task(&self, id: &str) -> Result<Task> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let tx = conn.unchecked_transaction()?;
        let source = require_task(&tx, id)?;
        let created_by_install = crate::install_id_with_conn(&tx)?;

        let base_title = format!("Copy of {}", source.title);
        let mut copy_title = base_title.clone();
        let mut suffix = 2;
        while tx.query_row(
            "SELECT EXISTS(
                SELECT 1 FROM tasks WHERE project_id = ?1 AND title = ?2 AND deleted_at IS NULL
             )",
            params![source.project_id, copy_title],
            |row| row.get::<_, bool>(0),
        )? {
            copy_title = format!("{base_title} ({suffix})");
            suffix += 1;
        }

        let timestamp = now();
        let copy = Task {
            id: new_id(),
            project_id: source.project_id,
            title: copy_title,
            status: TaskStatus::Open,
            created_at: timestamp.clone(),
            updated_at: timestamp,
            rev: 0,
        };
        tx.execute(
            "INSERT INTO tasks (id, project_id, title, status, created_at, updated_at, created_by_install)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                copy.id,
                copy.project_id,
                copy.title,
                copy.status.as_str(),
                copy.created_at,
                copy.updated_at,
                created_by_install
            ],
        )?;

        let resources = {
            let mut stmt = tx.prepare(
                "SELECT connector_kind, resource_type, payload, created_at
                 FROM task_resources
                 WHERE task_id = ?1 AND deleted_at IS NULL
                 ORDER BY created_at, id",
            )?;
            let rows = stmt.query_map(params![id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })?;
            rows.collect::<std::result::Result<Vec<_>, _>>()?
        };
        for (connector_kind, resource_type, payload, created_at) in resources {
            tx.execute(
                "INSERT INTO task_resources
                 (id, task_id, connector_kind, resource_type, payload, created_at, created_by_install)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    new_id(),
                    copy.id,
                    connector_kind,
                    resource_type,
                    payload,
                    created_at,
                    created_by_install
                ],
            )?;
        }
        tx.commit()?;
        Ok(copy)
    }

    /// Updates a task's status and `updated_at`. Rejects a missing or
    /// tombstoned task, matching every sibling mutation in this file — I2
    /// previously left this the one mutation with no `deleted_at IS NULL`
    /// filter and no `changed == 0` check, so it bumped `rev` and moved
    /// `updated_at` on a tombstone and reported success for a write that
    /// changed nothing.
    pub fn set_task_status(&self, id: &str, status: TaskStatus) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let changed = conn.execute(
            "UPDATE tasks SET status = ?2, updated_at = ?3, rev = rev + 1
             WHERE id = ?1 AND deleted_at IS NULL",
            params![id, status.as_str(), now()],
        )?;
        if changed == 0 {
            return Err(DbError::NotFound {
                entity: "task",
                id: id.to_string(),
            });
        }
        Ok(())
    }

    /// Tombstones a task; its resources and pins tombstone with it rather
    /// than being hard-deleted, so a later Migrate can still tell "deleted
    /// here" from "never arrived".
    pub fn delete_task(&self, id: &str) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let tx = conn.unchecked_transaction()?;
        let ts = now();
        // M5: guarded on deleted_at IS NULL — an already-tombstoned project
        // is invisible to every read path, so bumping its rev/updated_at
        // here would be pure noise, not a real edit.
        tx.execute(
            "UPDATE projects SET last_task_id = NULL, updated_at = ?2, rev = rev + 1
             WHERE last_task_id = ?1 AND deleted_at IS NULL",
            params![id, ts],
        )?;
        tx.execute(
            "UPDATE task_resources SET deleted_at = ?2, rev = rev + 1
             WHERE task_id = ?1 AND deleted_at IS NULL",
            params![id, ts],
        )?;
        tx.execute(
            "UPDATE task_pins SET deleted_at = ?2, rev = rev + 1
             WHERE task_id = ?1 AND deleted_at IS NULL",
            params![id, ts],
        )?;
        tx.execute(
            "UPDATE tasks SET deleted_at = ?2, rev = rev + 1, updated_at = ?2
             WHERE id = ?1 AND deleted_at IS NULL",
            params![id, ts],
        )?;
        tx.commit()?;
        Ok(())
    }

    /// Attaches a resource to a task.
    pub fn add_task_resource(&self, new: NewTaskResource) -> Result<TaskResource> {
        let r = TaskResource {
            id: new_id(),
            task_id: new.task_id,
            connector_kind: new.connector_kind,
            resource_type: new.resource_type,
            payload: new.payload,
            created_at: now(),
            rev: 0,
        };
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let created_by_install = crate::install_id_with_conn(&conn)?;
        conn.execute(
            "INSERT INTO task_resources (id, task_id, connector_kind, resource_type, payload, created_at, created_by_install) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![r.id, r.task_id, r.connector_kind, r.resource_type, r.payload.to_string(), r.created_at, created_by_install],
        )?;
        Ok(r)
    }

    /// Resources for one task, in attachment order.
    pub fn task_resources(&self, task_id: &str) -> Result<Vec<TaskResource>> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let mut stmt = conn.prepare(
            "SELECT id, task_id, connector_kind, resource_type, payload, created_at, rev \
             FROM task_resources WHERE task_id = ?1 AND deleted_at IS NULL ORDER BY created_at",
        )?;
        let rows = stmt.query_map(params![task_id], |r| {
            Ok(TaskResource {
                id: r.get(0)?,
                task_id: r.get(1)?,
                connector_kind: r.get(2)?,
                resource_type: r.get(3)?,
                payload: serde_json::from_str(&r.get::<_, String>(4)?).unwrap_or_else(|e| {
                    log::warn!("task_resources: corrupt task_resources.payload: {e}");
                    Value::Null
                }),
                created_at: r.get(5)?,
                rev: r.get(6)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// Detaches one resource by tombstoning its row (`deleted_at` set, not
    /// hard-deleted) — the same shape `delete_task`/`delete_project` use, so
    /// that *if* something called this to record "the user removed this
    /// item", a later merge could tell removed-here from never-arrived.
    ///
    /// I4: that "if" does not hold today. This method has no production
    /// caller — only tests exercise it. The desktop app's actual per-item
    /// removal gesture is `Capsules::remove_captured_item`
    /// (`apps/desktop/src-tauri/src/capsules.rs`), which reads a task's
    /// resource row, drops the item from its JSON payload, and writes the
    /// result back through `replace_task_resources` — the hard-purge path
    /// that treats the whole row as a fresh capture, not this tombstoning
    /// one. So a user removing a single captured tab or file today leaves no
    /// record of that removal at all, and the very next automatic capture
    /// can (and does) bring the item straight back. `remove_task_resource`
    /// is also the wrong granularity to fix that as-is: a `task_resources`
    /// row holds a whole connector kind's JSON array per task, so a
    /// row-level `deleted_at` can never express "the user removed this one
    /// tab out of several" — only "the user removed this entire kind's
    /// capture". Changing the removal gesture to actually record intent is a
    /// product change and is out of scope here; this comment exists so that
    /// scope decision is not lost the next time someone reads "tombstone,
    /// not hard-delete" and assumes it is already load-bearing.
    pub fn remove_task_resource(&self, id: &str) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        conn.execute(
            "UPDATE task_resources SET deleted_at = ?2, rev = rev + 1
             WHERE id = ?1 AND deleted_at IS NULL",
            params![id, now()],
        )?;
        Ok(())
    }

    /// Replaces a task's resources for one connector kind with a single new
    /// row (capsules are latest-only per kind). Atomic: purge + insert +
    /// parent-task rev bump in one transaction; rows for other kinds are
    /// untouched.
    ///
    /// Unlike `remove_task_resource`, this is a fresh capture superseding the
    /// previous snapshot, not a user removal — the old rows have no
    /// independent lifecycle worth remembering, so they are hard-purged
    /// (including any already-tombstoned rows for this kind) rather than
    /// tombstoned. Tombstoning here would grow this table without bound: every
    /// capture would leave a full generation behind, forever. The new rows
    /// are genuinely new rows (fresh id, rev 0), so what a later merge needs
    /// to see is not "this row changed" but "this capsule's contents
    /// changed" — that signal lives on the parent task's `rev`, which this
    /// bumps in the same transaction.
    pub fn replace_task_resources(
        &self,
        task_id: &str,
        connector_kind: &str,
        resource_type: &str,
        payload: &Value,
    ) -> Result<TaskResource> {
        let r = TaskResource {
            id: new_id(),
            task_id: task_id.to_string(),
            connector_kind: connector_kind.to_string(),
            resource_type: resource_type.to_string(),
            payload: payload.clone(),
            created_at: now(),
            rev: 0,
        };
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let tx = conn.unchecked_transaction()?;
        // C1: a tombstoned task must never gain a live child row — otherwise
        // a caller-supplied task_id (e.g. save_capsule) can resurrect capsule
        // contents under a task delete_task just tombstoned. Checked inside
        // this same transaction so a concurrent delete_task cannot race
        // between this check and the insert below.
        let parent_live: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM tasks WHERE id = ?1 AND deleted_at IS NULL)",
            params![task_id],
            |row| row.get(0),
        )?;
        if !parent_live {
            return Err(DbError::NotFound {
                entity: "task",
                id: task_id.to_string(),
            });
        }
        let created_by_install = crate::install_id_with_conn(&tx)?;
        // No deleted_at filter here on purpose: this purges both live and
        // already-tombstoned rows for this (task_id, connector_kind), which
        // is what keeps recapture bounded.
        tx.execute(
            "DELETE FROM task_resources WHERE task_id = ?1 AND connector_kind = ?2",
            params![task_id, connector_kind],
        )?;
        tx.execute(
            "INSERT INTO task_resources (id, task_id, connector_kind, resource_type, payload, created_at, created_by_install) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![r.id, r.task_id, r.connector_kind, r.resource_type, r.payload.to_string(), r.created_at, created_by_install],
        )?;
        let ts = now();
        tx.execute(
            "UPDATE tasks SET updated_at = ?2, rev = rev + 1
             WHERE id = ?1 AND deleted_at IS NULL",
            params![task_id, ts],
        )?;
        tx.commit()?;
        Ok(r)
    }

    /// Upsert: re-pinning an identity refreshes its payload and keeps one row,
    /// so a title change does not accumulate duplicates. `id` and `created_at`
    /// are proposed here only for the insert path — on conflict the existing
    /// row keeps its own, so the values returned always come from `RETURNING`
    /// rather than from what this call happened to propose.
    ///
    /// The uniqueness expectation on `(task_id, connector_kind, identity)` is
    /// table-wide, not filtered by `deleted_at`, so re-pinning something a
    /// prior `remove_task_pin` tombstoned also lands on this same conflict
    /// path. That is deliberate: the `DO UPDATE` clears `deleted_at` and
    /// bumps `rev`, reviving the existing row instead of either failing the
    /// unique constraint or leaving the tombstone dead underneath a payload
    /// update that looks like it worked.
    pub fn add_task_pin(
        &self,
        task_id: &str,
        connector_kind: &str,
        identity: &str,
        payload: &Value,
    ) -> Result<TaskPin> {
        let candidate_id = new_id();
        let candidate_created_at = now();
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let tx = conn.unchecked_transaction()?;
        // C1: same guard as replace_task_resources — without it, the
        // ON CONFLICT DO UPDATE below clears deleted_at unconditionally,
        // reviving a pin (or inserting a fresh one) under a task delete_task
        // already tombstoned.
        let parent_live: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM tasks WHERE id = ?1 AND deleted_at IS NULL)",
            params![task_id],
            |row| row.get(0),
        )?;
        if !parent_live {
            return Err(DbError::NotFound {
                entity: "task",
                id: task_id.to_string(),
            });
        }
        // I6: only the insert branch stamps created_by_install — the
        // ON CONFLICT DO UPDATE deliberately does not touch it, since it
        // records who created the row, not who most recently edited it.
        let created_by_install = crate::install_id_with_conn(&tx)?;
        let (id, created_at, rev) = tx.query_row(
            "INSERT INTO task_pins (id, task_id, connector_kind, identity, payload, created_at, created_by_install) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) \
             ON CONFLICT (task_id, connector_kind, identity) \
             DO UPDATE SET payload = excluded.payload, deleted_at = NULL, rev = rev + 1 \
             RETURNING id, created_at, rev",
            params![
                candidate_id,
                task_id,
                connector_kind,
                identity,
                payload.to_string(),
                candidate_created_at,
                created_by_install
            ],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            },
        )?;
        tx.commit()?;
        Ok(TaskPin {
            id,
            task_id: task_id.to_string(),
            connector_kind: connector_kind.to_string(),
            identity: identity.to_string(),
            payload: payload.clone(),
            created_at,
            rev,
        })
    }

    /// Tombstones a pin; true when a live pin was actually removed, false
    /// when there was none. Pins are the workspace *definition* layer — the
    /// strongest expression of user intent this app records, since a pinned
    /// item opens on every restore whether or not it was captured. A hard
    /// delete here would make a deliberately-removed pin indistinguishable
    /// from one that simply never arrived, so a later transfer could
    /// resurrect exactly what the user removed. Tombstoning keeps that fact
    /// on the row instead.
    pub fn remove_task_pin(
        &self,
        task_id: &str,
        connector_kind: &str,
        identity: &str,
    ) -> Result<bool> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let n = conn.execute(
            "UPDATE task_pins SET deleted_at = ?4, rev = rev + 1 \
             WHERE task_id = ?1 AND connector_kind = ?2 AND identity = ?3 AND deleted_at IS NULL",
            params![task_id, connector_kind, identity, now()],
        )?;
        Ok(n > 0)
    }

    /// Live pins for one task, in pin order.
    pub fn task_pins(&self, task_id: &str) -> Result<Vec<TaskPin>> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let mut stmt = conn.prepare(
            "SELECT id, task_id, connector_kind, identity, payload, created_at, rev \
             FROM task_pins WHERE task_id = ?1 AND deleted_at IS NULL ORDER BY created_at",
        )?;
        let rows = stmt.query_map(params![task_id], |row| {
            let raw: String = row.get(4)?;
            Ok(TaskPin {
                id: row.get(0)?,
                task_id: row.get(1)?,
                connector_kind: row.get(2)?,
                identity: row.get(3)?,
                payload: serde_json::from_str(&raw).unwrap_or_else(|e| {
                    log::warn!("task_pins: corrupt task_pins.payload: {e}");
                    Value::Null
                }),
                created_at: row.get(5)?,
                rev: row.get(6)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }
}
