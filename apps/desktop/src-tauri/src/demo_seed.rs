//! Demo fixture for the real app — debug builds only.
//!
//! WHY THIS EXISTS: the capture rig (`apps/desktop/capture/`) can already show
//! a fully-populated Rabta, but it runs in a browser with the Tauri bridge
//! mocked. That is fine for the website's product shots and wrong for anything
//! that has to look like the actual Mac app: no traffic lights, no vibrancy, no
//! real window chrome, wrong corner radius. Screenshots for the App Store, the
//! README or a launch post need the genuine article.
//!
//! So this seeds the same shape of fixture into the real database, which the
//! app then renders through its real code paths.
//!
//! SAFETY, in three layers, because this writes to a user's database:
//!
//!   1. The whole module is `#[cfg(debug_assertions)]`. It is not compiled into
//!      a release build at all, so no shipped binary contains this code.
//!   2. Debug builds already use a separate data directory (`data_dir_for` in
//!      lib.rs appends `.debug`), so even in dev it cannot touch the database a
//!      released app uses.
//!   3. It refuses to run if the database already holds projects, so it cannot
//!      quietly duplicate itself or bury real data on a second click.
//!
//! The repositories are real. `projects::validate_and_create` requires a path
//! that exists and contains `.git` — correctly, since a registered project that
//! is not a repository would break Git features everywhere downstream. Rather
//! than bypass that check with the raw DB API, this creates genuine throwaway
//! repositories inside the debug data directory, so the seeded app behaves like
//! a real one: branches resolve, Git status reads, nothing renders an error
//! state that a screenshot would then immortalise.

use std::path::{Path, PathBuf};
use std::process::Command;

use rabta_db::{Db, NewTask, NewTaskResource};
use serde_json::json;

use crate::projects;

/// One demo project: a repository to create, and the branch it sits on.
struct DemoRepo {
    name: &'static str,
    branch: &'static str,
    dev_url: Option<&'static str>,
}

const REPOS: &[DemoRepo] = &[
    DemoRepo {
        name: "atlas-api",
        branch: "feat/connector-reconnect",
        dev_url: Some("http://localhost:8080"),
    },
    DemoRepo {
        name: "mercury-web",
        branch: "main",
        dev_url: Some("http://localhost:3000"),
    },
    DemoRepo {
        name: "ledger-cli",
        branch: "main",
        dev_url: None,
    },
];

/// Tasks per project, in display order. `(project, title, resources)`.
type Resource = (&'static str, &'static str, fn(&str, &str) -> serde_json::Value);

fn editor_payload(repo: &str, _branch: &str) -> serde_json::Value {
    json!({
        "folder": format!("~/code/{repo}"),
        "openFiles": [
            "src/hub.rs",
            "src/connector/session.rs",
            "src/connector/handshake.rs",
            "tests/reconnect.rs"
        ],
        "terminals": [
            { "cwd": format!("~/code/{repo}") },
            { "cwd": format!("~/code/{repo}") },
            { "cwd": format!("~/code/{repo}/crates") }
        ]
    })
}

fn tabs_payload(_repo: &str, _branch: &str) -> serde_json::Value {
    json!({
        "tabs": [
            { "url": "https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent", "title": "WebSocket close codes — MDN" },
            { "url": "https://docs.rs/tokio-tungstenite/latest/tokio_tungstenite/", "title": "tokio-tungstenite docs" },
            { "url": "https://en.wikipedia.org/wiki/Exponential_backoff", "title": "Exponential backoff and jitter" }
        ]
    })
}

/// The branch a capsule records has to be the branch its project is actually
/// on. Hardcoding one meant `mercury-web` and `ledger-cli` — both on `main` —
/// showed capsules claiming `feat/connector-reconnect`, which is wrong in the
/// Overview list and wrong in any screenshot taken of it.
fn branch_payload(repo: &str, branch: &str) -> serde_json::Value {
    json!({ "branch": branch, "repo": repo })
}

const RESOURCES: &[Resource] = &[
    ("vscode", "workspace", editor_payload),
    ("chrome", "tabs", tabs_payload),
    ("git", "branch", branch_payload),
];

/// Titles per project. The first is the one a screenshot should land on, so it
/// carries the fullest set of resources.
const TASKS: &[(&str, &[&str])] = &[
    (
        "atlas-api",
        &[
            "Wire the connector SDK reconnect",
            "Fix token refresh race in auth",
            "Track down the flaky restore test",
        ],
    ),
    (
        "mercury-web",
        &["Ship the settings redesign", "Audit focus states across dialogs"],
    ),
    ("ledger-cli", &["Port the CSV importer"]),
];

/// Create a real git repository at `path` sitting on `branch`.
fn init_repo(path: &Path, branch: &str) -> Result<(), String> {
    std::fs::create_dir_all(path).map_err(|e| format!("create {}: {e}", path.display()))?;
    std::fs::write(path.join("README.md"), "# demo\n\nRabta demo fixture.\n")
        .map_err(|e| format!("write README: {e}"))?;

    let git = |args: &[&str]| -> Result<(), String> {
        let out = Command::new("git")
            .args(args)
            .current_dir(path)
            .output()
            .map_err(|e| format!("git {args:?}: {e}"))?;
        if !out.status.success() {
            return Err(format!(
                "git {args:?}: {}",
                String::from_utf8_lossy(&out.stderr).trim()
            ));
        }
        Ok(())
    };

    // `-b` sets the initial branch directly, so this does not depend on the
    // machine's `init.defaultBranch` and produces the same result everywhere.
    git(&["init", "-b", branch])?;
    // Identity is set locally so seeding never depends on — or touches — the
    // user's global git config.
    git(&["config", "user.email", "demo@rabta.build"])?;
    git(&["config", "user.name", "Rabta Demo"])?;
    git(&["add", "README.md"])?;
    git(&["commit", "-m", "demo fixture"])?;
    Ok(())
}

/// Populate an empty database with the demo fixture. Returns a summary.
pub fn seed(db: &Db, data_dir: &Path) -> Result<String, String> {
    if !db.list_projects().map_err(|e| e.to_string())?.is_empty() {
        return Err(
            "database already has projects — seeding would duplicate or bury them. \
             Delete the debug data directory first if you want a clean fixture."
                .to_string(),
        );
    }

    let root: PathBuf = data_dir.join("demo-repos");
    let mut projects_made = 0usize;
    let mut tasks_made = 0usize;

    for repo in REPOS {
        let path = root.join(repo.name);
        init_repo(&path, repo.branch)?;

        let project = projects::validate_and_create(
            db,
            repo.name,
            &path.to_string_lossy(),
            repo.dev_url,
            repo.branch,
        )?;
        projects_made += 1;

        let titles = TASKS
            .iter()
            .find(|(name, _)| *name == repo.name)
            .map(|(_, t)| *t)
            .unwrap_or(&[]);

        for (index, title) in titles.iter().enumerate() {
            let task = db
                .create_task(NewTask {
                    project_id: project.id.clone(),
                    title: (*title).to_string(),
                })
                .map_err(|e| e.to_string())?;
            tasks_made += 1;

            // Only the first task of each project gets a full resource set —
            // a fixture where every capsule is identically full reads as
            // generated, and the empty ones exercise the empty states.
            if index == 0 {
                for (kind, resource_type, payload) in RESOURCES {
                    db.add_task_resource(NewTaskResource {
                        task_id: task.id.clone(),
                        connector_kind: (*kind).to_string(),
                        resource_type: (*resource_type).to_string(),
                        payload: payload(repo.name, repo.branch),
                    })
                    .map_err(|e| e.to_string())?;
                }
            }
        }
    }

    Ok(format!(
        "Seeded {projects_made} projects and {tasks_made} capsules. \
         Repositories are in {}.",
        root.display()
    ))
}
