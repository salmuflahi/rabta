//! Reading a `.rabta` bundle *against this Mac* — the review step — and
//! applying it.
//!
//! The handoff calls the review "the substance of the feature", and the
//! reason is that a migration is not a copy. The other Mac has a different
//! home directory, different apps installed, different repositories on
//! disk, and may already have a project called `atlas-api` that has nothing
//! to do with the one in the bundle. Everything in `InspectReport` exists so
//! the user is told which of those is true *before* anything is written.
//!
//! Division of labour: this crate answers everything the database can
//! answer (what the bundle contains, what paths it carries, what already
//! exists here under the same name). Questions about the machine — is
//! Cursor installed, does this folder exist — belong to the desktop layer,
//! which can look at `/Applications` and the filesystem. This module hands
//! it the list of things to check rather than guessing.

use std::collections::{BTreeMap, HashSet};

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::{Bundle, Db, Result};

/// What to do about a name that already exists on this Mac.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Merge {
    /// Bring the incoming one in under a suffixed name. Nothing is lost.
    KeepBoth,
    /// The local one is overwritten. This is the only destructive choice,
    /// and the UI says so in those words.
    Replace,
    /// Leave this Mac's version alone; the incoming one is not applied.
    Skip,
}

/// A name that exists on both Macs.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Collision {
    /// What kind of thing collided. A `String`, not a `&'static str`: this
    /// crosses the Tauri boundary as JSON and so has to round-trip through
    /// Deserialize.
    pub kind: String,
    pub name: String,
}

/// One tool the bundle's capsules actually captured with, and how much of
/// the bundle depends on it. Whether it is *installed here* is the desktop
/// layer's question — this only says what the bundle needs.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppNeed {
    pub kind: String,
    pub capsules: u32,
}

/// A repository the bundle refers to, at its remapped path.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RepoNeed {
    pub name: String,
    /// Where it would live here, after the folder remap.
    pub path: String,
    pub branch: String,
}

/// Everything the review step shows, computed from the bundle and this
/// database together.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InspectReport {
    pub capsules: u32,
    pub projects: u32,
    pub pairings: u32,
    pub history: u32,
    pub has_preferences: bool,
    /// The sending Mac's home, if it recorded one.
    pub source_home: Option<String>,
    /// How much the folder remap would touch — the handoff prints exactly
    /// this: "Applies to 3 projects and 14 saved file paths."
    pub remap_projects: u32,
    pub remap_paths: u32,
    pub apps: Vec<AppNeed>,
    pub repos: Vec<RepoNeed>,
    pub collisions: Vec<Collision>,
}

/// The user's answers from the review step.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyPlan {
    /// Replaces `source_home` wherever it appears in a path. `None` leaves
    /// every path exactly as it arrived.
    pub new_home: Option<String>,
    pub merge: Merge,
}

/// What actually happened, so Done can report it rather than assert it.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ApplyOutcome {
    pub projects_added: u32,
    pub projects_replaced: u32,
    pub projects_skipped: u32,
    pub capsules_added: u32,
    pub pairings_added: u32,
    pub events_added: u32,
    pub paths_remapped: u32,
}

/// Rewrites a path that lived under the sending Mac's home so it lives
/// under this one's. Anything outside that home — an external volume, a
/// shared drive — is returned untouched, because a prefix that doesn't
/// match is not a path we know how to move.
fn remap(path: &str, from: Option<&str>, to: Option<&str>) -> (String, bool) {
    let (Some(from), Some(to)) = (from, to) else {
        return (path.to_string(), false);
    };
    if from == to || from.is_empty() {
        return (path.to_string(), false);
    }
    if let Some(rest) = path.strip_prefix(from) {
        // Only at a segment boundary: `/Users/sam` must not rewrite the
        // start of `/Users/samantha/code`.
        if rest.is_empty() || rest.starts_with('/') {
            return (format!("{to}{rest}"), true);
        }
    }
    (path.to_string(), false)
}

/// Every absolute path a captured payload carries, so the remap can be
/// counted honestly before it runs and applied faithfully when it does.
///
/// Walks the payload as generic JSON rather than per-connector structs: the
/// payload is whatever a connector reported, this crate does not own those
/// shapes, and a connector that starts sending a new path field should have
/// it remapped without a change here.
fn rewrite_paths_in_json(
    value: &mut serde_json::Value,
    from: Option<&str>,
    to: Option<&str>,
    count: &mut u32,
) {
    match value {
        serde_json::Value::String(s) => {
            if s.starts_with('/') {
                let (next, changed) = remap(s, from, to);
                if changed {
                    *s = next;
                    *count += 1;
                }
            }
        }
        serde_json::Value::Array(items) => {
            for item in items {
                rewrite_paths_in_json(item, from, to, count);
            }
        }
        serde_json::Value::Object(map) => {
            for (_, v) in map.iter_mut() {
                rewrite_paths_in_json(v, from, to, count);
            }
        }
        _ => {}
    }
}

fn count_paths_in_payload(payload: &str, from: Option<&str>) -> u32 {
    let Ok(mut value) = serde_json::from_str::<serde_json::Value>(payload) else {
        return 0;
    };
    let mut n = 0;
    // Counting is the same walk as rewriting, against a target that always
    // differs — one implementation, so the number shown can't disagree with
    // the number performed.
    rewrite_paths_in_json(&mut value, from, Some("\u{0}probe"), &mut n);
    n
}

impl Db {
    /// Reads a bundle against this Mac and reports everything the review
    /// step needs. Writes nothing.
    pub fn inspect_bundle(&self, bundle: &Bundle, new_home: Option<&str>) -> Result<InspectReport> {
        bundle.check_readable()?;
        let conn = self.conn.lock().expect("db mutex");

        let from = bundle.source_home.as_deref();

        let remap_projects = bundle
            .projects
            .iter()
            .filter(|p| remap(&p.repo_path, from, Some("\u{0}probe")).1)
            .count() as u32;

        let remap_paths: u32 = bundle
            .task_resources
            .iter()
            .map(|r| count_paths_in_payload(&r.payload, from))
            .sum();

        // Which tools the capsules actually captured with, and how many
        // capsules lean on each. Counted over distinct capsules, not
        // resources: two Chrome captures on one capsule is one capsule that
        // needs Chrome.
        let mut by_kind: BTreeMap<String, HashSet<&str>> = BTreeMap::new();
        for r in &bundle.task_resources {
            by_kind
                .entry(r.connector_kind.to_lowercase())
                .or_default()
                .insert(r.task_id.as_str());
        }
        let apps = by_kind
            .into_iter()
            .map(|(kind, tasks)| AppNeed {
                kind,
                capsules: tasks.len() as u32,
            })
            .collect();

        let repos = bundle
            .projects
            .iter()
            .map(|p| RepoNeed {
                name: p.name.clone(),
                path: remap(&p.repo_path, from, new_home).0,
                branch: p.default_branch.clone(),
            })
            .collect();

        // Collisions are by name, because a name is what the user
        // recognises and what the schema makes unique. Ids never collide —
        // they're UUIDs — so matching on them would report "no conflicts"
        // for two projects both called atlas-api.
        let mut collisions = Vec::new();
        for p in &bundle.projects {
            let exists: bool = conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM projects WHERE name = ?1 AND deleted_at IS NULL)",
                params![p.name],
                |r| r.get(0),
            )?;
            if exists {
                collisions.push(Collision {
                    kind: "project".into(),
                    name: p.name.clone(),
                });
            }
        }

        Ok(InspectReport {
            capsules: bundle.tasks.len() as u32,
            projects: bundle.projects.len() as u32,
            pairings: bundle.connectors.len() as u32,
            history: bundle.events.len() as u32,
            has_preferences: bundle.preferences.is_some(),
            source_home: bundle.source_home.clone(),
            remap_projects,
            remap_paths,
            apps,
            repos,
            collisions,
        })
    }

    /// Applies a reviewed bundle. All-or-nothing: one transaction, so a
    /// failure part-way leaves this Mac exactly as it was rather than half
    /// migrated.
    pub fn apply_bundle(&self, bundle: &Bundle, plan: &ApplyPlan) -> Result<ApplyOutcome> {
        bundle.check_readable()?;
        let mut conn = self.conn.lock().expect("db mutex");
        let tx = conn.transaction()?;
        let install = crate::install_id_with_conn(&tx)?;
        let from = bundle.source_home.as_deref();
        let to = plan.new_home.as_deref();
        let mut out = ApplyOutcome::default();

        // Incoming project id -> the id it ended up under here. Skipped and
        // renamed projects both change what their capsules must point at,
        // so every task is re-pointed through this map rather than trusting
        // the id it arrived with.
        let mut project_id_map: BTreeMap<String, Option<String>> = BTreeMap::new();

        for p in &bundle.projects {
            let existing: Option<String> = tx
                .query_row(
                    "SELECT id FROM projects WHERE name = ?1 AND deleted_at IS NULL",
                    params![p.name],
                    |r| r.get(0),
                )
                .ok();

            let (path, changed) = remap(&p.repo_path, from, to);
            if changed {
                out.paths_remapped += 1;
            }

            match (existing, plan.merge) {
                (Some(_), Merge::Skip) => {
                    project_id_map.insert(p.id.clone(), None);
                    out.projects_skipped += 1;
                    continue;
                }
                (Some(local_id), Merge::Replace) => {
                    // Replace means the local one is overwritten, which the
                    // UI states in those words. Its capsules go with it —
                    // ON DELETE CASCADE — because a half-replaced project
                    // holding the old project's capsules is neither.
                    tx.execute("DELETE FROM projects WHERE id = ?1", params![local_id])?;
                    insert_project(&tx, p, &path, &p.name, &install)?;
                    project_id_map.insert(p.id.clone(), Some(p.id.clone()));
                    out.projects_replaced += 1;
                }
                (Some(_), Merge::KeepBoth) => {
                    let name = unique_name(&tx, &p.name)?;
                    insert_project(&tx, p, &path, &name, &install)?;
                    project_id_map.insert(p.id.clone(), Some(p.id.clone()));
                    out.projects_added += 1;
                }
                (None, _) => {
                    insert_project(&tx, p, &path, &p.name, &install)?;
                    project_id_map.insert(p.id.clone(), Some(p.id.clone()));
                    out.projects_added += 1;
                }
            }
        }

        for t in &bundle.tasks {
            let Some(Some(project_id)) = project_id_map.get(&t.project_id) else {
                // Its project was skipped, or never came. A capsule with no
                // project is unreachable in the UI, so it isn't written.
                continue;
            };
            tx.execute(
                "INSERT OR REPLACE INTO tasks
                   (id, project_id, title, status, created_at, updated_at, created_by_install)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    t.id,
                    project_id,
                    t.title,
                    t.status,
                    t.created_at,
                    t.updated_at,
                    install
                ],
            )?;
            out.capsules_added += 1;
        }

        let live_tasks: HashSet<&str> = bundle
            .tasks
            .iter()
            .filter(|t| matches!(project_id_map.get(&t.project_id), Some(Some(_))))
            .map(|t| t.id.as_str())
            .collect();

        for r in &bundle.task_resources {
            if !live_tasks.contains(r.task_id.as_str()) {
                continue;
            }
            let payload = rewrite_payload(&r.payload, from, to, &mut out.paths_remapped);
            tx.execute(
                "INSERT OR REPLACE INTO task_resources
                   (id, task_id, connector_kind, resource_type, payload, created_at, created_by_install)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![r.id, r.task_id, r.connector_kind, r.resource_type, payload, r.created_at, install],
            )?;
        }

        for p in &bundle.task_pins {
            if !live_tasks.contains(p.task_id.as_str()) {
                continue;
            }
            let payload = rewrite_payload(&p.payload, from, to, &mut out.paths_remapped);
            let (identity, _) = remap(&p.identity, from, to);
            tx.execute(
                "INSERT OR REPLACE INTO task_pins
                   (id, task_id, connector_kind, identity, payload, created_at, created_by_install)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![p.id, p.task_id, p.connector_kind, identity, payload, p.created_at, install],
            )?;
        }

        for c in &bundle.connectors {
            // No token column: the bundle never carried one, and the user
            // re-approves on this Mac. `ON CONFLICT DO NOTHING` so an
            // incoming record can never clear a pairing that already works
            // here.
            tx.execute(
                "INSERT INTO connectors (id, name, kind, capabilities, version, first_seen, last_seen)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(name, kind) DO NOTHING",
                params![
                    crate::new_id(),
                    c.name,
                    c.kind,
                    c.capabilities,
                    c.version,
                    c.first_seen,
                    c.last_seen
                ],
            )?;
            out.pairings_added += 1;
        }

        for e in &bundle.events {
            // `seq` is omitted so SQLite assigns one from this Mac's own
            // sequence — the sender's numbering means nothing here.
            tx.execute(
                "INSERT INTO events (at, type, session_connector_id, payload)
                 VALUES (?1, ?2, ?3, ?4)",
                params![e.at, e.kind, e.session_connector_id, e.payload],
            )?;
            out.events_added += 1;
        }

        tx.commit()?;
        Ok(out)
    }
}

fn rewrite_payload(payload: &str, from: Option<&str>, to: Option<&str>, count: &mut u32) -> String {
    match serde_json::from_str::<serde_json::Value>(payload) {
        Ok(mut value) => {
            rewrite_paths_in_json(&mut value, from, to, count);
            serde_json::to_string(&value).unwrap_or_else(|_| payload.to_string())
        }
        // A payload this build can't parse is carried across verbatim
        // rather than dropped: it is a faithful record of what some
        // connector reported, and losing it would be worse than not
        // remapping it.
        Err(_) => payload.to_string(),
    }
}

/// "atlas-api" -> "atlas-api (from the other Mac)" -> "… 2", "… 3".
/// `name` is UNIQUE in the schema, so Keep both has to produce something
/// free rather than let the insert fail.
fn unique_name(conn: &Connection, base: &str) -> Result<String> {
    let candidate = format!("{base} (from the other Mac)");
    let taken = |n: &str| -> Result<bool> {
        Ok(conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM projects WHERE name = ?1)",
            params![n],
            |r| r.get(0),
        )?)
    };
    if !taken(&candidate)? {
        return Ok(candidate);
    }
    for i in 2..1000 {
        let next = format!("{candidate} {i}");
        if !taken(&next)? {
            return Ok(next);
        }
    }
    Ok(format!("{candidate} {}", crate::new_id()))
}

fn insert_project(
    conn: &Connection,
    p: &crate::ProjectRow,
    repo_path: &str,
    name: &str,
    install: &str,
) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO projects
           (id, name, repo_path, dev_url, default_branch, icon, archived_at, last_opened_at,
            last_task_id, active_seconds, sort_order, created_at, updated_at, created_by_install)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        params![
            p.id,
            name,
            repo_path,
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
            install
        ],
    )?;
    Ok(())
}
