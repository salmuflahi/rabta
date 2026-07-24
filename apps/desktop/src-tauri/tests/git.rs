mod common;

use common::{git, repo_with_commit};
use rabta_desktop_lib::git::{
    branches, checkout, create_branch, fetch, status, validate_branch_name,
};

#[tokio::test]
async fn status_reports_clean_branch() {
    let repo = repo_with_commit().await;
    let st = status(repo.path()).await.unwrap();
    assert_eq!(st.branch.as_deref(), Some("main"));
    assert!(!st.dirty);
    assert_eq!(st.changed_count, 0);
}

#[tokio::test]
async fn status_counts_dirty_and_untracked() {
    let repo = repo_with_commit().await;
    std::fs::write(repo.path().join("a.txt"), "changed\n").unwrap();
    std::fs::write(repo.path().join("new.txt"), "x\n").unwrap();
    let st = status(repo.path()).await.unwrap();
    assert!(st.dirty);
    assert_eq!(st.changed_count, 2);
}

#[tokio::test]
async fn status_detached_head_has_no_branch() {
    let repo = repo_with_commit().await;
    git(repo.path(), &["checkout", "--detach"]).await;
    let st = status(repo.path()).await.unwrap();
    assert_eq!(st.branch, None);
}

#[tokio::test]
async fn checkout_switches_clean_tree_and_lists_branches() {
    let repo = repo_with_commit().await;
    create_branch(repo.path(), "feature").await.unwrap();
    assert_eq!(
        status(repo.path()).await.unwrap().branch.as_deref(),
        Some("feature")
    );
    checkout(repo.path(), "main").await.unwrap();
    assert_eq!(
        status(repo.path()).await.unwrap().branch.as_deref(),
        Some("main")
    );
    let mut b = branches(repo.path()).await.unwrap();
    b.sort();
    assert_eq!(b, vec!["feature", "main"]);
}

#[tokio::test]
async fn checkout_refuses_dirty_tree_untouched() {
    let repo = repo_with_commit().await;
    create_branch(repo.path(), "feature").await.unwrap();
    checkout(repo.path(), "main").await.unwrap();
    std::fs::write(repo.path().join("a.txt"), "precious uncommitted work\n").unwrap();
    let err = checkout(repo.path(), "feature").await.unwrap_err();
    assert!(err.contains("never discards"), "got: {err}");
    assert_eq!(
        status(repo.path()).await.unwrap().branch.as_deref(),
        Some("main")
    );
    assert_eq!(
        std::fs::read_to_string(repo.path().join("a.txt")).unwrap(),
        "precious uncommitted work\n",
        "tree must be byte-identical after refusal"
    );
}

#[tokio::test]
async fn checkout_refuses_missing_branch() {
    let repo = repo_with_commit().await;
    let err = checkout(repo.path(), "ghost").await.unwrap_err();
    assert!(err.contains("does not exist locally"), "got: {err}");
}

#[tokio::test]
async fn create_branch_while_dirty_carries_changes() {
    let repo = repo_with_commit().await;
    std::fs::write(repo.path().join("a.txt"), "wip\n").unwrap();
    create_branch(repo.path(), "wip-branch").await.unwrap();
    let st = status(repo.path()).await.unwrap();
    assert_eq!(st.branch.as_deref(), Some("wip-branch"));
    assert!(st.dirty, "changes carried, not lost");
    assert_eq!(
        std::fs::read_to_string(repo.path().join("a.txt")).unwrap(),
        "wip\n"
    );
}

#[tokio::test]
async fn hostile_branch_names_rejected() {
    let repo = repo_with_commit().await;
    for bad in [
        "-f",
        "--upload-pack=/bin/sh",
        "",
        "bad..name",
        "end.lock",
        "spa ce",
    ] {
        assert!(
            validate_branch_name(bad).await.is_err(),
            "{bad:?} must be rejected"
        );
        assert!(checkout(repo.path(), bad).await.is_err());
        assert!(create_branch(repo.path(), bad).await.is_err());
    }
    assert_eq!(
        status(repo.path()).await.unwrap().branch.as_deref(),
        Some("main")
    );
}

#[tokio::test]
async fn fetch_updates_ahead_behind_against_local_remote() {
    let bare = tempfile::tempdir().unwrap();
    git(bare.path(), &["init", "--bare", "-b", "main"]).await;
    let bare_url = bare.path().to_str().unwrap().to_string();

    let repo = repo_with_commit().await;
    git(repo.path(), &["remote", "add", "origin", &bare_url]).await;
    git(repo.path(), &["push", "-u", "origin", "main"]).await;
    let st = status(repo.path()).await.unwrap();
    assert_eq!((st.ahead, st.behind), (0, 0));

    // Local commit -> ahead 1.
    std::fs::write(repo.path().join("b.txt"), "b\n").unwrap();
    git(repo.path(), &["add", "."]).await;
    git(repo.path(), &["commit", "-m", "local"]).await;
    assert_eq!(status(repo.path()).await.unwrap().ahead, 1);

    // Commit from a second clone -> behind 1 after fetch.
    let clone = tempfile::tempdir().unwrap();
    git(clone.path(), &["clone", &bare_url, "."]).await;
    git(clone.path(), &["config", "user.email", "test@omnibus.dev"]).await;
    git(clone.path(), &["config", "user.name", "OmniBus Test"]).await;
    std::fs::write(clone.path().join("c.txt"), "c\n").unwrap();
    git(clone.path(), &["add", "."]).await;
    git(clone.path(), &["commit", "-m", "remote side"]).await;
    git(clone.path(), &["push"]).await;

    fetch(repo.path()).await.unwrap();
    let st = status(repo.path()).await.unwrap();
    assert_eq!((st.ahead, st.behind), (1, 1));
}

#[tokio::test]
async fn fetch_failure_surfaces_error() {
    let repo = repo_with_commit().await;
    git(
        repo.path(),
        &["remote", "add", "origin", "/nonexistent/omnibus-remote"],
    )
    .await;
    let err = fetch(repo.path()).await.unwrap_err();
    assert!(!err.is_empty());
}

#[tokio::test]
async fn status_on_missing_repo_errors_cleanly() {
    let dir = tempfile::tempdir().unwrap();
    let missing = dir.path().join("does-not-exist");
    let err = status(&missing).await.unwrap_err();
    assert!(!err.is_empty());
}

#[tokio::test]
async fn checkout_on_missing_repo_errors_cleanly() {
    let dir = tempfile::tempdir().unwrap();
    let missing = dir.path().join("does-not-exist");
    // Name validation passes for a valid name; git itself must fail cleanly
    // (Err, not a panic) when the repo path doesn't exist.
    validate_branch_name("main").await.unwrap();
    let err = checkout(&missing, "main").await.unwrap_err();
    assert!(!err.is_empty());
}
