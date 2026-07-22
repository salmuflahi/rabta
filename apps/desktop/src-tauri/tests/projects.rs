use rabta_db::{Db, DbConfig};
use rabta_desktop_lib::projects::{inspect_repo_path, validate_and_create};
use std::fs;

/// Creates a directory that looks like a git clone: `.git/` with a HEAD file.
fn git_fixture(head_contents: &str) -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    fs::create_dir(dir.path().join(".git")).unwrap();
    fs::write(dir.path().join(".git").join("HEAD"), head_contents).unwrap();
    dir
}

fn db() -> Db {
    Db::open_in_memory(DbConfig::default()).unwrap()
}

#[test]
fn inspect_missing_path() {
    let ins = inspect_repo_path("/nonexistent/definitely/not/here");
    assert!(!ins.exists);
    assert!(!ins.is_git_repo);
    assert_eq!(ins.default_branch, None);
}

#[test]
fn inspect_directory_without_git() {
    let dir = tempfile::tempdir().unwrap();
    let ins = inspect_repo_path(dir.path().to_str().unwrap());
    assert!(ins.exists);
    assert!(!ins.is_git_repo);
}

#[test]
fn inspect_git_repo_prefills_branch_from_head() {
    let dir = git_fixture("ref: refs/heads/main\n");
    let ins = inspect_repo_path(dir.path().to_str().unwrap());
    assert!(ins.exists);
    assert!(ins.is_git_repo);
    assert_eq!(ins.default_branch.as_deref(), Some("main"));
}

#[test]
fn inspect_detached_head_gives_no_branch() {
    let dir = git_fixture("3f2a9c0d1e4b5a6f7890abcdef1234567890abcd\n");
    let ins = inspect_repo_path(dir.path().to_str().unwrap());
    assert!(ins.is_git_repo);
    assert_eq!(ins.default_branch, None);
}

#[test]
fn inspect_git_file_repo_counts_as_git_without_branch() {
    // Worktrees/submodules: `.git` is a pointer FILE, not a directory.
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join(".git"), "gitdir: /somewhere/else\n").unwrap();
    let ins = inspect_repo_path(dir.path().to_str().unwrap());
    assert!(ins.exists);
    assert!(ins.is_git_repo);
    assert_eq!(ins.default_branch, None);
}

#[test]
fn create_happy_path_stores_project() {
    let db = db();
    let dir = git_fixture("ref: refs/heads/main\n");
    let p = validate_and_create(
        &db,
        "omnibus",
        dir.path().to_str().unwrap(),
        Some("http://localhost:3000"),
        "main",
    )
    .unwrap();
    assert_eq!(p.name, "omnibus");
    assert_eq!(p.default_branch, "main");
    assert_eq!(db.list_projects().unwrap().len(), 1);
}

#[test]
fn create_rejects_duplicate_name_with_friendly_message() {
    let db = db();
    let dir = git_fixture("ref: refs/heads/main\n");
    let path = dir.path().to_str().unwrap();
    validate_and_create(&db, "omnibus", path, None, "main").unwrap();
    let err = validate_and_create(&db, "omnibus", path, None, "main").unwrap_err();
    assert_eq!(err, "a project with this name already exists");
}

#[test]
fn create_rejects_bad_inputs_without_storing() {
    let db = db();
    let dir = git_fixture("ref: refs/heads/main\n");
    let good = dir.path().to_str().unwrap();
    let non_git = tempfile::tempdir().unwrap();

    assert!(validate_and_create(&db, "  ", good, None, "main").is_err());
    assert!(validate_and_create(&db, "p", "relative/path", None, "main").is_err());
    assert!(validate_and_create(&db, "p", "/nonexistent/nope", None, "main").is_err());
    assert!(validate_and_create(&db, "p", non_git.path().to_str().unwrap(), None, "main").is_err());
    assert!(validate_and_create(&db, "p", good, None, "  ").is_err());
    assert!(validate_and_create(&db, "p", good, Some("ftp://x"), "main").is_err());
    assert!(validate_and_create(&db, "p", good, Some("not a url"), "main").is_err());
    assert!(db.list_projects().unwrap().is_empty(), "nothing may be stored on rejection");
}

#[test]
fn create_trims_repo_path_and_dev_url() {
    let db = db();
    let dir = git_fixture("ref: refs/heads/main\n");
    let padded = format!("  {}  ", dir.path().to_str().unwrap());
    let p = validate_and_create(&db, "trimmed", &padded, Some("  http://localhost:3000  "), "main")
        .unwrap();
    assert_eq!(p.repo_path, dir.path().to_str().unwrap());
    assert_eq!(p.dev_url.as_deref(), Some("http://localhost:3000"));
}
