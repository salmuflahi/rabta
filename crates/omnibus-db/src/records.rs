//! Projects, tasks, and task resources — the data model phases 6+ build on.
use std::collections::HashSet;

use rusqlite::{params, Connection};
use rusqlite::OptionalExtension;
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
        if s == "done" { TaskStatus::Done } else { TaskStatus::Open }
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
    })
}

fn project_by_id(conn: &Connection, id: &str) -> Result<Option<Project>> {
    Ok(conn
        .query_row(
            "SELECT id, name, repo_path, dev_url, default_branch, icon, archived_at,
                    last_opened_at, last_task_id, active_seconds, sort_order, created_at, updated_at
             FROM projects WHERE id = ?1",
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
    })
}

fn task_by_id(conn: &Connection, id: &str) -> Result<Option<Task>> {
    Ok(conn
        .query_row(
            "SELECT id, project_id, title, status, created_at, updated_at
             FROM tasks WHERE id = ?1",
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
        let conn = self.conn.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        let sort_order = conn.query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1
             FROM projects",
            [],
            |r| r.get(0),
        )?;
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
        };
        conn.execute(
            "INSERT INTO projects (
                id, name, repo_path, dev_url, default_branch, icon, archived_at,
                last_opened_at, last_task_id, active_seconds, sort_order, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
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
                p.updated_at
            ],
        )?;
        Ok(p)
    }

    /// All active projects in their persisted order.
    pub fn list_projects(&self) -> Result<Vec<Project>> {
        let conn = self.conn.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        let mut stmt = conn.prepare(
            "SELECT id, name, repo_path, dev_url, default_branch, icon, archived_at,
                    last_opened_at, last_task_id, active_seconds, sort_order, created_at, updated_at
             FROM projects
             WHERE archived_at IS NULL
             ORDER BY sort_order, lower(name), id",
        )?;
        let rows = stmt.query_map([], project_from_row)?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// One project by id.
    pub fn get_project(&self, id: &str) -> Result<Option<Project>> {
        let conn = self.conn.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
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
        let conn = self.conn.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        let changed = conn.execute(
            "UPDATE projects SET name = ?2, updated_at = ?3 WHERE id = ?1",
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
        let conn = self.conn.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        let changed = conn.execute(
            "UPDATE projects SET icon = ?2, updated_at = ?3 WHERE id = ?1",
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
        let conn = self.conn.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        require_project(&conn, id)?;
        let timestamp = now();
        let changed = conn.execute(
            "UPDATE projects
             SET archived_at = COALESCE(archived_at, ?2), updated_at = ?2
             WHERE id = ?1",
            params![id, timestamp],
        )?;
        if changed == 0 {
            return require_project(&conn, id);
        }
        require_project(&conn, id)
    }

    /// Restores an archived project at the end of the active project order.
    pub fn unarchive_project(&self, id: &str) -> Result<Project> {
        let conn = self.conn.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
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
             SET archived_at = NULL, sort_order = ?2, updated_at = ?3
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
        let conn = self.conn.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        let mut stmt = conn.prepare(
            "SELECT id, name, repo_path, dev_url, default_branch, icon, archived_at,
                    last_opened_at, last_task_id, active_seconds, sort_order, created_at, updated_at
             FROM projects
             WHERE archived_at IS NOT NULL
             ORDER BY archived_at DESC, lower(name), id",
        )?;
        let rows = stmt.query_map([], project_from_row)?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// Replaces active project order atomically with a dense exact ordering.
    pub fn reorder_projects(&self, ordered_ids: &[String]) -> Result<Vec<Project>> {
        let conn = self.conn.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        let tx = conn.unchecked_transaction()?;
        let active_ids = {
            let mut stmt = tx.prepare(
                "SELECT id FROM projects
                 WHERE archived_at IS NULL
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
        for (position, id) in ordered_ids.iter().enumerate() {
            tx.execute(
                "UPDATE projects SET sort_order = ?2 WHERE id = ?1",
                params![id, position as i64],
            )?;
        }
        tx.commit()?;
        drop(conn);
        self.list_projects()
    }

    /// Deletes a project; tasks and resources cascade.
    pub fn delete_project(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        conn.execute("DELETE FROM projects WHERE id = ?1", params![id])?;
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
        };
        let conn = self.conn.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        conn.execute(
            "INSERT INTO tasks (id, project_id, title, status, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![t.id, t.project_id, t.title, t.status.as_str(), t.created_at, t.updated_at],
        )?;
        Ok(t)
    }

    /// Tasks for one project, newest first.
    pub fn list_tasks(&self, project_id: &str) -> Result<Vec<Task>> {
        let conn = self.conn.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        let mut stmt = conn.prepare(
            "SELECT id, project_id, title, status, created_at, updated_at \
             FROM tasks WHERE project_id = ?1 ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map(params![project_id], task_from_row)?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// One task by id.
    pub fn get_task(&self, id: &str) -> Result<Option<Task>> {
        let conn = self.conn.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        task_by_id(&conn, id)
    }

    /// Starts a fresh session for the active project that owns `task_id`.
    pub fn begin_project_session_for_task(&self, task_id: &str, opened_at: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        let changed = conn.execute(
            "UPDATE projects
             SET last_opened_at = ?2,
                 last_task_id = ?1,
                 active_seconds = 0,
                 updated_at = ?2
             WHERE id = (
               SELECT project_id FROM tasks WHERE id = ?1
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

    /// Adds focused, non-idle whole seconds to the active project owning `task_id`.
    pub fn add_active_seconds_for_task(&self, task_id: &str, seconds: u64) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        if seconds == 0 {
            let active: bool = conn.query_row(
                "SELECT EXISTS(
                   SELECT 1
                   FROM tasks
                   JOIN projects ON projects.id = tasks.project_id
                   WHERE tasks.id = ?1 AND projects.archived_at IS NULL
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
             SET active_seconds = active_seconds + ?2,
                 updated_at = ?3
             WHERE id = (
               SELECT project_id FROM tasks WHERE id = ?1
             )
             AND archived_at IS NULL",
            params![task_id, seconds, now()],
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
        let conn = self.conn.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        let changed = conn.execute(
            "UPDATE tasks SET title = ?2, updated_at = ?3 WHERE id = ?1",
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
        let conn = self.conn.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        let tx = conn.unchecked_transaction()?;
        let source = require_task(&tx, id)?;

        let base_title = format!("Copy of {}", source.title);
        let mut copy_title = base_title.clone();
        let mut suffix = 2;
        while tx.query_row(
            "SELECT EXISTS(
                SELECT 1 FROM tasks WHERE project_id = ?1 AND title = ?2
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
        };
        tx.execute(
            "INSERT INTO tasks (id, project_id, title, status, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                copy.id,
                copy.project_id,
                copy.title,
                copy.status.as_str(),
                copy.created_at,
                copy.updated_at
            ],
        )?;

        let resources = {
            let mut stmt = tx.prepare(
                "SELECT connector_kind, resource_type, payload, created_at
                 FROM task_resources
                 WHERE task_id = ?1
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
                 (id, task_id, connector_kind, resource_type, payload, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    new_id(),
                    copy.id,
                    connector_kind,
                    resource_type,
                    payload,
                    created_at
                ],
            )?;
        }
        tx.commit()?;
        Ok(copy)
    }

    /// Updates a task's status and `updated_at`.
    pub fn set_task_status(&self, id: &str, status: TaskStatus) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        conn.execute(
            "UPDATE tasks SET status = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, status.as_str(), now()],
        )?;
        Ok(())
    }

    /// Deletes a task; its resources cascade.
    pub fn delete_task(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        let tx = conn.unchecked_transaction()?;
        tx.execute(
            "UPDATE projects SET last_task_id = NULL WHERE last_task_id = ?1",
            params![id],
        )?;
        tx.execute("DELETE FROM tasks WHERE id = ?1", params![id])?;
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
        };
        let conn = self.conn.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        conn.execute(
            "INSERT INTO task_resources (id, task_id, connector_kind, resource_type, payload, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![r.id, r.task_id, r.connector_kind, r.resource_type, r.payload.to_string(), r.created_at],
        )?;
        Ok(r)
    }

    /// Resources for one task, in attachment order.
    pub fn task_resources(&self, task_id: &str) -> Result<Vec<TaskResource>> {
        let conn = self.conn.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        let mut stmt = conn.prepare(
            "SELECT id, task_id, connector_kind, resource_type, payload, created_at \
             FROM task_resources WHERE task_id = ?1 ORDER BY created_at",
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
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// Detaches one resource.
    pub fn remove_task_resource(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        conn.execute("DELETE FROM task_resources WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// Replaces a task's resources for one connector kind with a single new
    /// row (capsules are latest-only per kind). Atomic: delete + insert in
    /// one transaction; rows for other kinds are untouched.
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
        };
        let conn = self.conn.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        let tx = conn.unchecked_transaction()?;
        tx.execute(
            "DELETE FROM task_resources WHERE task_id = ?1 AND connector_kind = ?2",
            params![task_id, connector_kind],
        )?;
        tx.execute(
            "INSERT INTO task_resources (id, task_id, connector_kind, resource_type, payload, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![r.id, r.task_id, r.connector_kind, r.resource_type, r.payload.to_string(), r.created_at],
        )?;
        tx.commit()?;
        Ok(r)
    }
}
