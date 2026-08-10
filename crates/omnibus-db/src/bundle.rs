//! The `.rabta` bundle — what Migrate writes and reads.
//!
//! A bundle is one age-encrypted file containing a JSON document of this
//! database's rows. Two decisions worth stating up front:
//!
//! **The format is age, not something hand-rolled.** The handoff promises
//! the user "Without it the bundle is unreadable — Rabta cannot recover it
//! for you", which is a claim about cryptography, and this project does not
//! get to make that claim on the strength of an afternoon's work with a
//! cipher. age is a reviewed, specified format with a published CLI, so the
//! promise rests on something outside this repo — and a determined user can
//! verify it, or recover their own data, with `age -d` and no Rabta at all.
//!
//! **The plaintext is a plain JSON document, and encryption is a separate
//! step.** That keeps the interesting part — what actually crosses, and how
//! it lands on the other Mac — testable without a passphrase anywhere near
//! it, and it means the encryption layer has exactly one job.
//!
//! What is *not* here: anything that reaches the network. This crate reads
//! and writes a file on disk. See `docs/superpowers/plans/` for why the
//! handoff's "Nearby Mac" transport is deliberately not built.

use age::secrecy::SecretString;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::{Db, DbError, Result};

/// Bundles this build can read. Bumped when the shape changes in a way an
/// older build could not make sense of; `inspect` refuses anything higher
/// rather than guessing at fields it has never seen.
pub const BUNDLE_VERSION: u32 = 1;

/// Marker so a mis-named or truncated file fails with "this isn't a Rabta
/// bundle" instead of a JSON parse error.
pub const BUNDLE_FORMAT: &str = "rabta.bundle";

/// Which parts of this Mac the user chose to send. Every one defaults to
/// on in the UI; each is honoured here rather than being filtered later, so
/// a bundle never *contains* something the user unticked.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Include {
    pub capsules: bool,
    pub projects: bool,
    pub pairings: bool,
    pub preferences: bool,
    pub history: bool,
}

impl Default for Include {
    fn default() -> Self {
        Self {
            capsules: true,
            projects: true,
            pairings: true,
            preferences: true,
            history: true,
        }
    }
}

/// Real counts for the "What comes across" step. Every number the UI shows
/// comes from here — the handoff prints counts beside each checkbox, and a
/// fabricated one would be a lie the user only discovers on the other Mac.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Survey {
    pub capsules: u32,
    pub projects: u32,
    pub pairings: u32,
    pub history: u32,
}

// --- Row mirrors -----------------------------------------------------------
//
// Deliberately separate from `records.rs`'s types. Those are the app's
// working shapes and are free to change with the UI; these are a wire
// format that a future build has to be able to read. Coupling them would
// mean a rename in the UI layer silently breaking every bundle ever
// written.

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRow {
    pub id: String,
    pub name: String,
    pub repo_path: String,
    pub dev_url: Option<String>,
    pub default_branch: String,
    pub icon: Option<String>,
    pub archived_at: Option<String>,
    pub last_opened_at: Option<String>,
    pub last_task_id: Option<String>,
    pub active_seconds: i64,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskRow {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskResourceRow {
    pub id: String,
    pub task_id: String,
    pub connector_kind: String,
    pub resource_type: String,
    pub payload: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskPinRow {
    pub id: String,
    pub task_id: String,
    pub connector_kind: String,
    pub identity: String,
    pub payload: String,
    pub created_at: String,
}

/// A paired connector. **The token is deliberately not a field.**
///
/// The handoff's own note on this checkbox is "You re-approve them on the
/// new Mac", and that is the whole design: what crosses is the fact that
/// you once approved Chrome, not the credential that lets something act as
/// Chrome. A bundle is a file that will sit in Downloads, get AirDropped,
/// and be forgotten about on a USB stick; a live pairing token in it is a
/// key on a keyring left in a taxi.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectorRow {
    pub name: String,
    pub kind: String,
    pub capabilities: String,
    pub version: Option<String>,
    pub first_seen: String,
    pub last_seen: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventRowOut {
    pub at: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub session_connector_id: Option<String>,
    pub payload: String,
}

/// The decrypted contents of a `.rabta` file.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bundle {
    pub format: String,
    pub version: u32,
    pub created_at: String,
    /// The install id of the Mac that wrote it. Lets the receiving Mac tell
    /// "this came from somewhere else" from "this is my own backup".
    pub source_install_id: String,
    /// The sending Mac's home directory, so the review step can offer a
    /// remap. Captured rather than inferred from paths: a user whose
    /// projects all live on an external volume has no `/Users/...` prefix
    /// to infer from, and guessing would silently remap nothing.
    pub source_home: Option<String>,
    pub include: Include,
    #[serde(default)]
    pub projects: Vec<ProjectRow>,
    #[serde(default)]
    pub tasks: Vec<TaskRow>,
    #[serde(default)]
    pub task_resources: Vec<TaskResourceRow>,
    #[serde(default)]
    pub task_pins: Vec<TaskPinRow>,
    #[serde(default)]
    pub connectors: Vec<ConnectorRow>,
    #[serde(default)]
    pub events: Vec<EventRowOut>,
    /// The app's preference blob, verbatim, or None when unticked. Opaque
    /// to this crate: preferences live in the frontend's localStorage, so
    /// the desktop layer hands the string down rather than this crate
    /// inventing a schema for something it does not own.
    #[serde(default)]
    pub preferences: Option<String>,
}

impl Bundle {
    /// Rejects anything that isn't a bundle this build understands, before
    /// any caller reads a single row out of it.
    pub fn check_readable(&self) -> Result<()> {
        if self.format != BUNDLE_FORMAT {
            return Err(DbError::Validation {
                field: "format",
                message: "this file is not a Rabta bundle".into(),
            });
        }
        if self.version > BUNDLE_VERSION {
            return Err(DbError::Validation {
                field: "version",
                message: format!(
                    "this bundle was written by a newer version of Rabta (format {}, this build reads {})",
                    self.version, BUNDLE_VERSION
                ),
            });
        }
        Ok(())
    }
}

// --- Encryption ------------------------------------------------------------

/// Encrypts bundle JSON to a passphrase. Binary age, not armored: the file
/// is carried, not pasted.
pub fn seal(plaintext: &[u8], passphrase: &str) -> Result<Vec<u8>> {
    let recipient = age::scrypt::Recipient::new(SecretString::from(passphrase.to_owned()));
    age::encrypt(&recipient, plaintext).map_err(|e| DbError::Validation {
        field: "passphrase",
        message: format!("could not encrypt the bundle: {e}"),
    })
}

/// Decrypts a bundle. A wrong passphrase is by far the likeliest failure
/// here, so it gets its own sentence rather than an age error dump — the
/// user needs to know to try another passphrase, not to read a stack.
pub fn unseal(ciphertext: &[u8], passphrase: &str) -> Result<Vec<u8>> {
    let identity = age::scrypt::Identity::new(SecretString::from(passphrase.to_owned()));
    age::decrypt(&identity, ciphertext).map_err(|_| DbError::Validation {
        field: "passphrase",
        message: "that passphrase does not open this bundle".into(),
    })
}

// --- Export ----------------------------------------------------------------

fn text_or_null(row: &rusqlite::Row<'_>, idx: usize) -> rusqlite::Result<Option<String>> {
    row.get::<_, Option<String>>(idx)
}

impl Db {
    /// Real counts for the "What comes across" step.
    ///
    /// Counts live rows only — a soft-deleted capsule is not something the
    /// user still has, and offering to send six when two are in the bin
    /// would overstate what crosses.
    pub fn migrate_survey(&self) -> Result<Survey> {
        let conn = self.conn.lock().expect("db mutex");
        let one = |sql: &str| -> Result<u32> {
            Ok(conn.query_row(sql, [], |r| r.get::<_, i64>(0))? as u32)
        };
        Ok(Survey {
            capsules: one("SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL")?,
            projects: one(
                "SELECT COUNT(*) FROM projects WHERE deleted_at IS NULL AND archived_at IS NULL",
            )?,
            pairings: one("SELECT COUNT(*) FROM connectors")?,
            history: one("SELECT COUNT(*) FROM events")?,
        })
    }

    /// Builds the bundle document. Encryption is the caller's next step —
    /// see `seal`.
    ///
    /// `source_home` is passed in rather than read from the environment so
    /// this is a pure function of (database, choices) and the remap tests
    /// don't depend on whose machine they run on.
    pub fn export_bundle(
        &self,
        include: Include,
        source_home: Option<String>,
        preferences: Option<String>,
    ) -> Result<Bundle> {
        let conn = self.conn.lock().expect("db mutex");
        let source_install_id = crate::install_id_with_conn(&conn)?;

        // Capsules imply their projects: a task whose project didn't cross
        // is a row with a dangling foreign key and no name to show. The UI
        // reflects this by disabling the Projects checkbox while Capsules
        // is ticked, but the invariant is enforced here too — a bundle
        // written by any other caller still has to be loadable.
        let want_projects = include.projects || include.capsules;

        let projects = if want_projects {
            read_projects(&conn)?
        } else {
            Vec::new()
        };
        let (tasks, task_resources, task_pins) = if include.capsules {
            (
                read_tasks(&conn)?,
                read_task_resources(&conn)?,
                read_task_pins(&conn)?,
            )
        } else {
            (Vec::new(), Vec::new(), Vec::new())
        };
        let connectors = if include.pairings {
            read_connectors(&conn)?
        } else {
            Vec::new()
        };
        let events = if include.history {
            read_events(&conn)?
        } else {
            Vec::new()
        };

        Ok(Bundle {
            format: BUNDLE_FORMAT.to_string(),
            version: BUNDLE_VERSION,
            created_at: crate::now(),
            source_install_id,
            source_home,
            include,
            projects,
            tasks,
            task_resources,
            task_pins,
            connectors,
            events,
            preferences: if include.preferences { preferences } else { None },
        })
    }
}

fn read_projects(conn: &Connection) -> Result<Vec<ProjectRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, repo_path, dev_url, default_branch, icon, archived_at,
                last_opened_at, last_task_id, active_seconds, sort_order, created_at, updated_at
         FROM projects WHERE deleted_at IS NULL ORDER BY sort_order, name",
    )?;
    let rows = stmt
        .query_map([], |r| {
            Ok(ProjectRow {
                id: r.get(0)?,
                name: r.get(1)?,
                repo_path: r.get(2)?,
                dev_url: text_or_null(r, 3)?,
                default_branch: r.get(4)?,
                icon: text_or_null(r, 5)?,
                archived_at: text_or_null(r, 6)?,
                last_opened_at: text_or_null(r, 7)?,
                last_task_id: text_or_null(r, 8)?,
                active_seconds: r.get(9)?,
                sort_order: r.get(10)?,
                created_at: r.get(11)?,
                updated_at: r.get(12)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

fn read_tasks(conn: &Connection) -> Result<Vec<TaskRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, title, status, created_at, updated_at
         FROM tasks WHERE deleted_at IS NULL ORDER BY created_at",
    )?;
    let rows = stmt
        .query_map([], |r| {
            Ok(TaskRow {
                id: r.get(0)?,
                project_id: r.get(1)?,
                title: r.get(2)?,
                status: r.get(3)?,
                created_at: r.get(4)?,
                updated_at: r.get(5)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

fn read_task_resources(conn: &Connection) -> Result<Vec<TaskResourceRow>> {
    let mut stmt = conn.prepare(
        "SELECT r.id, r.task_id, r.connector_kind, r.resource_type, r.payload, r.created_at
         FROM task_resources r
         JOIN tasks t ON t.id = r.task_id AND t.deleted_at IS NULL
         WHERE r.deleted_at IS NULL ORDER BY r.created_at",
    )?;
    let rows = stmt
        .query_map([], |r| {
            Ok(TaskResourceRow {
                id: r.get(0)?,
                task_id: r.get(1)?,
                connector_kind: r.get(2)?,
                resource_type: r.get(3)?,
                payload: r.get(4)?,
                created_at: r.get(5)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

fn read_task_pins(conn: &Connection) -> Result<Vec<TaskPinRow>> {
    let mut stmt = conn.prepare(
        "SELECT p.id, p.task_id, p.connector_kind, p.identity, p.payload, p.created_at
         FROM task_pins p
         JOIN tasks t ON t.id = p.task_id AND t.deleted_at IS NULL
         WHERE p.deleted_at IS NULL ORDER BY p.created_at",
    )?;
    let rows = stmt
        .query_map([], |r| {
            Ok(TaskPinRow {
                id: r.get(0)?,
                task_id: r.get(1)?,
                connector_kind: r.get(2)?,
                identity: r.get(3)?,
                payload: r.get(4)?,
                created_at: r.get(5)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

fn read_connectors(conn: &Connection) -> Result<Vec<ConnectorRow>> {
    // `token` is not selected. See ConnectorRow's doc comment: what crosses
    // is that you approved Chrome, never the credential.
    let mut stmt = conn.prepare(
        "SELECT name, kind, capabilities, version, first_seen, last_seen
         FROM connectors ORDER BY first_seen",
    )?;
    let rows = stmt
        .query_map([], |r| {
            Ok(ConnectorRow {
                name: r.get(0)?,
                kind: r.get(1)?,
                capabilities: r.get(2)?,
                version: text_or_null(r, 3)?,
                first_seen: r.get(4)?,
                last_seen: r.get(5)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

fn read_events(conn: &Connection) -> Result<Vec<EventRowOut>> {
    // `seq` is not carried: it is AUTOINCREMENT and local to one database.
    // Reusing the sender's numbering on the receiving Mac would collide
    // with its own log; the receiver re-numbers on insert.
    let mut stmt =
        conn.prepare("SELECT at, type, session_connector_id, payload FROM events ORDER BY seq")?;
    let rows = stmt
        .query_map([], |r| {
            Ok(EventRowOut {
                at: r.get(0)?,
                kind: r.get(1)?,
                session_connector_id: text_or_null(r, 2)?,
                payload: r.get(3)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}
