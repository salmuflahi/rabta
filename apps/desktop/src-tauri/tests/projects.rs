use rabta_db::{Db, DbConfig, NewTaskResource};
use rabta_desktop_lib::projects::{
    create_task, duplicate_task, inspect_repo_path, list_archived_projects, rename_project,
    rename_task, reorder_projects, set_project_icon, unarchive_project, validate_and_create,
};
use serde_json::json;
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

#[test]
fn project_services_validate_archive_icon_and_exact_order() {
    let db = db();
    let first_repo = git_fixture("ref: refs/heads/main\n");
    let second_repo = git_fixture("ref: refs/heads/main\n");
    let first = validate_and_create(
        &db,
        "First",
        first_repo.path().to_str().unwrap(),
        None,
        "main",
    )
    .unwrap();
    let second = validate_and_create(
        &db,
        "Second",
        second_repo.path().to_str().unwrap(),
        None,
        "main",
    )
    .unwrap();

    assert_eq!(
        rename_project(&db, &first.id, " ").unwrap_err(),
        "name must not be empty"
    );
    assert_eq!(
        set_project_icon(&db, &first.id, Some("emoji")).unwrap_err(),
        "icon unknown project icon: emoji"
    );
    assert_eq!(
        set_project_icon(&db, &first.id, Some("rocket"))
            .unwrap()
            .icon
            .as_deref(),
        Some("rocket")
    );
    assert_eq!(
        reorder_projects(&db, &[second.id.clone(), first.id.clone()])
            .unwrap()
            .into_iter()
            .map(|project| project.id)
            .collect::<Vec<_>>(),
        vec![second.id.clone(), first.id.clone()]
    );
    assert_eq!(
        reorder_projects(&db, std::slice::from_ref(&first.id)).unwrap_err(),
        "orderedIds must contain every active project exactly once"
    );

    let archived = db.archive_project(&first.id).unwrap();
    assert_eq!(list_archived_projects(&db).unwrap(), vec![archived]);
    assert_eq!(
        unarchive_project(&db, &first.id).unwrap().archived_at,
        None
    );
}

#[test]
fn task_services_reject_archived_projects_and_duplicate_resources() {
    let db = db();
    let repo = git_fixture("ref: refs/heads/main\n");
    let project =
        validate_and_create(&db, "Rabta", repo.path().to_str().unwrap(), None, "main").unwrap();
    let source = create_task(&db, &project.id, "Source").unwrap();
    db.add_task_resource(NewTaskResource {
        task_id: source.id.clone(),
        connector_kind: "git".into(),
        resource_type: "branch".into(),
        payload: json!({"branch": "main"}),
    })
    .unwrap();

    assert_eq!(
        rename_task(&db, &source.id, "  Renamed  ").unwrap().title,
        "Renamed"
    );
    let copy = duplicate_task(&db, &source.id).unwrap();
    assert_eq!(copy.title, "Copy of Renamed");
    assert_eq!(db.task_resources(&copy.id).unwrap().len(), 1);

    db.archive_project(&project.id).unwrap();
    assert_eq!(
        create_task(&db, &project.id, "Blocked").unwrap_err(),
        "project is archived — restore it before adding a capsule"
    );
}
