//! Projects, tasks, and task resources — the data model phases 6+ build on.
use rusqlite::params;
use serde::Serialize;
use serde_json::Value;

use crate::{new_id, now, Db, Result};

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

impl Db {
    /// Creates a project; fails on duplicate name (UNIQUE constraint).
    pub fn create_project(&self, new: NewProject) -> Result<Project> {
        let ts = now();
        let p = Project {
            id: new_id(),
            name: new.name,
            repo_path: new.repo_path,
            dev_url: new.dev_url,
            default_branch: new.default_branch,
            created_at: ts.clone(),
            updated_at: ts,
        };
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO projects (id, name, repo_path, dev_url, default_branch, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![p.id, p.name, p.repo_path, p.dev_url, p.default_branch, p.created_at, p.updated_at],
        )?;
        Ok(p)
    }

    /// All projects, alphabetical by name.
    pub fn list_projects(&self) -> Result<Vec<Project>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, repo_path, dev_url, default_branch, created_at, updated_at \
             FROM projects ORDER BY name",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(Project {
                id: r.get(0)?,
                name: r.get(1)?,
                repo_path: r.get(2)?,
                dev_url: r.get(3)?,
                default_branch: r.get(4)?,
                created_at: r.get(5)?,
                updated_at: r.get(6)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// Deletes a project; tasks and resources cascade.
    pub fn delete_project(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
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
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO tasks (id, project_id, title, status, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![t.id, t.project_id, t.title, t.status.as_str(), t.created_at, t.updated_at],
        )?;
        Ok(t)
    }

    /// Tasks for one project, newest first.
    pub fn list_tasks(&self, project_id: &str) -> Result<Vec<Task>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, project_id, title, status, created_at, updated_at \
             FROM tasks WHERE project_id = ?1 ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map(params![project_id], |r| {
            Ok(Task {
                id: r.get(0)?,
                project_id: r.get(1)?,
                title: r.get(2)?,
                status: TaskStatus::parse(&r.get::<_, String>(3)?),
                created_at: r.get(4)?,
                updated_at: r.get(5)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// Updates a task's status and `updated_at`.
    pub fn set_task_status(&self, id: &str, status: TaskStatus) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE tasks SET status = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, status.as_str(), now()],
        )?;
        Ok(())
    }

    /// Deletes a task; its resources cascade.
    pub fn delete_task(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM tasks WHERE id = ?1", params![id])?;
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
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO task_resources (id, task_id, connector_kind, resource_type, payload, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![r.id, r.task_id, r.connector_kind, r.resource_type, r.payload.to_string(), r.created_at],
        )?;
        Ok(r)
    }

    /// Resources for one task, in attachment order.
    pub fn task_resources(&self, task_id: &str) -> Result<Vec<TaskResource>> {
        let conn = self.conn.lock().unwrap();
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
                payload: serde_json::from_str(&r.get::<_, String>(4)?).unwrap_or(Value::Null),
                created_at: r.get(5)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// Detaches one resource.
    pub fn remove_task_resource(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM task_resources WHERE id = ?1", params![id])?;
        Ok(())
    }
}
