mod common;

use omnibus_desktop_lib::github::{
    branch_name_for_issue, no_github_remote_message, owner_repo_from_remote, parse_issues,
    remote_display_host, remote_lookup_error_message,
};

#[test]
fn parses_owner_repo_from_remote_variants() {
    let cases = [
        ("git@github.com:sammy/omnibus.git", Some(("sammy", "omnibus"))),
        ("https://github.com/sammy/omnibus.git", Some(("sammy", "omnibus"))),
        ("https://github.com/sammy/omnibus", Some(("sammy", "omnibus"))),
        ("ssh://git@github.com/sammy/omnibus.git", Some(("sammy", "omnibus"))),
        ("https://gitlab.com/sammy/omnibus.git", None),
        ("/local/path/only", None),
        ("", None),
        // Regression: handles .git and trailing slash together
        ("https://github.com/sammy/omnibus.git/", Some(("sammy", "omnibus"))),
        ("https://github.com/sammy/omnibus/", Some(("sammy", "omnibus"))),
        ("git@github.com:sammy/omnibus.git/", Some(("sammy", "omnibus"))),
    ];
    for (url, want) in cases {
        let got = owner_repo_from_remote(url);
        assert_eq!(
            got.as_ref().map(|(o, r)| (o.as_str(), r.as_str())),
            want,
            "remote {url:?}"
        );
    }
}

#[test]
fn remote_lookup_error_distinguishes_missing_remote_from_real_errors() {
    // git's wording for a missing remote (git emits "error: No such remote…";
    // "fatal:" tested too), case-insensitively substring-matched.
    assert_eq!(
        remote_lookup_error_message("error: No such remote 'origin'"),
        "this project has no `origin` remote"
    );
    assert_eq!(
        remote_lookup_error_message("fatal: No such remote 'origin'"),
        "this project has no `origin` remote"
    );
    assert_eq!(
        remote_lookup_error_message("fatal: no such remote 'origin'"),
        "this project has no `origin` remote"
    );
    // Any other failure (deleted repo path, git missing, permissions, ...)
    // must surface the underlying stderr, not be papered over.
    let err = remote_lookup_error_message("fatal: not a git repository (or any of the parent directories): .git");
    assert!(err.starts_with("could not read git remote: "), "got: {err}");
    assert!(err.contains("not a git repository"), "got: {err}");
}

#[test]
fn remote_display_host_extracts_host_from_common_shapes() {
    let cases = [
        ("git@github.com:sammy/omnibus.git", Some("github.com")),
        ("https://github.com/sammy/omnibus.git", Some("github.com")),
        ("ssh://git@github.com/sammy/omnibus.git", Some("github.com")),
        ("https://ghe.example.com/sammy/omnibus.git", Some("ghe.example.com")),
        ("git@ghe.example.com:sammy/omnibus.git", Some("ghe.example.com")),
        ("https://gitlab.com/sammy/omnibus.git", Some("gitlab.com")),
        ("/local/path/only", None),
        ("", None),
    ];
    for (url, want) in cases {
        assert_eq!(remote_display_host(url).as_deref(), want, "remote {url:?}");
    }
}

#[test]
fn no_github_remote_message_names_the_host_when_there_is_one() {
    // Real, non-github.com remote: name the host, don't just say "no remote".
    let msg = no_github_remote_message("https://ghe.example.com/sammy/omnibus.git");
    assert!(msg.contains("only github.com remotes are supported"), "got: {msg}");
    assert!(msg.contains("ghe.example.com"), "got: {msg}");

    let msg = no_github_remote_message("https://gitlab.com/sammy/omnibus.git");
    assert!(msg.contains("gitlab.com"), "got: {msg}");

    // No usable host at all (local path): the plain message.
    assert_eq!(no_github_remote_message("/local/path/only"), "this project has no GitHub remote");

    // A genuine github.com remote that nonetheless failed owner/repo parsing
    // (e.g. malformed slug) must NOT be reported as an unsupported host — it
    // falls back to the plain message. Pins the negative branch.
    let msg = no_github_remote_message("https://github.com/only-owner-no-repo");
    assert!(!msg.contains("only github.com remotes are supported"), "got: {msg}");
}

#[test]
fn parses_issue_json() {
    let json = r#"[
      {"number": 42, "title": "Fix login", "url": "https://github.com/x/y/issues/42",
       "labels": [{"name": "bug"}, {"name": "p1"}]},
      {"number": 7, "title": "Docs", "url": "https://github.com/x/y/issues/7", "labels": []}
    ]"#;
    let issues = parse_issues(json).unwrap();
    assert_eq!(issues.len(), 2);
    assert_eq!(issues[0].number, 42);
    assert_eq!(issues[0].title, "Fix login");
    assert_eq!(issues[0].labels, vec!["bug", "p1"]);
    assert!(issues[1].labels.is_empty());

    assert_eq!(parse_issues("[]").unwrap().len(), 0);
    assert!(parse_issues("not json").is_err());
}

#[test]
fn slugs_branch_names_safely() {
    assert_eq!(branch_name_for_issue(42, "Fix login bug!"), "issue-42-fix-login-bug");
    assert_eq!(branch_name_for_issue(7, "  Spaces   & symbols @#$ "), "issue-7-spaces-symbols");
    assert_eq!(branch_name_for_issue(1, ""), "issue-1");
    assert_eq!(branch_name_for_issue(2, "!!!"), "issue-2");
    // long titles are capped; result stays a single clean segment
    let long = branch_name_for_issue(3, &"word ".repeat(50));
    assert!(long.starts_with("issue-3-word"));
    assert!(long.len() <= 55, "capped, got {}", long.len());
    // never ends with a dash, never doubles dashes
    for b in [
        branch_name_for_issue(42, "Fix login bug!"),
        branch_name_for_issue(7, "  Spaces   & symbols @#$ "),
        branch_name_for_issue(3, &"word ".repeat(50)),
    ] {
        assert!(!b.ends_with('-') && !b.contains("--"), "dirty slug: {b}");
    }
}

// Validation parity: every generated name must pass git's ref-format check
// (phase-9 rule). Uses the same binary the app uses.
#[tokio::test]
async fn generated_branch_names_pass_git_ref_format() {
    for (n, title) in [(42u64, "Fix login bug!"), (7, "!!!"), (1, ""), (99, "über cool ✨ feature")] {
        let name = branch_name_for_issue(n, title);
        let ok = tokio::process::Command::new("git")
            .args(["check-ref-format", "--branch", &name])
            .output()
            .await
            .unwrap()
            .status
            .success();
        assert!(ok, "git rejected generated branch {name:?}");
    }
}

use common::repo_with_commit;
use omnibus_db::{Db, DbConfig, NewProject};
use omnibus_desktop_lib::github::start_issue_task;

async fn project_at(db: &Db, repo: &std::path::Path) -> String {
    db.create_project(NewProject {
        name: format!("p-{}", repo.display()),
        repo_path: repo.to_str().unwrap().to_string(),
        dev_url: None,
        default_branch: "main".into(),
    })
    .unwrap()
    .id
}

#[tokio::test]
async fn start_issue_task_creates_task_and_branch() {
    let repo = repo_with_commit().await;
    let db = Db::open_in_memory(DbConfig::default()).unwrap();
    let project_id = project_at(&db, repo.path()).await;

    let started = start_issue_task(&db, repo.path(), &project_id, 42, "Fix login bug!").await.unwrap();
    assert_eq!(started.task.title, "#42 Fix login bug!");
    assert_eq!(started.branch, "issue-42-fix-login-bug");
    // task persisted
    let tasks = db.list_tasks(&project_id).unwrap();
    assert_eq!(tasks.len(), 1);
    // branch switched
    assert_eq!(
        omnibus_desktop_lib::git::status(repo.path()).await.unwrap().branch.as_deref(),
        Some("issue-42-fix-login-bug")
    );
}

#[tokio::test]
async fn start_issue_task_carries_dirty_changes() {
    let repo = repo_with_commit().await;
    std::fs::write(repo.path().join("wip.txt"), "uncommitted\n").unwrap();
    let db = Db::open_in_memory(DbConfig::default()).unwrap();
    let project_id = project_at(&db, repo.path()).await;

    let started = start_issue_task(&db, repo.path(), &project_id, 5, "wip").await.unwrap();
    assert_eq!(started.branch, "issue-5-wip");
    // dirty file carried to the new branch, not discarded
    assert_eq!(std::fs::read_to_string(repo.path().join("wip.txt")).unwrap(), "uncommitted\n");
}

#[tokio::test]
async fn start_issue_task_reports_existing_branch_without_failing() {
    let repo = repo_with_commit().await;
    let db = Db::open_in_memory(DbConfig::default()).unwrap();
    let project_id = project_at(&db, repo.path()).await;

    start_issue_task(&db, repo.path(), &project_id, 9, "dup").await.unwrap();
    // second start of the same issue: branch already exists → still creates a task,
    // reports the branch outcome, does not error.
    let again = start_issue_task(&db, repo.path(), &project_id, 9, "dup").await.unwrap();
    assert_eq!(db.list_tasks(&project_id).unwrap().len(), 2);
    assert!(!again.branch_note.is_empty());
}
