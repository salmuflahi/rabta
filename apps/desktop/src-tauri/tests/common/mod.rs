//! Shared git test helpers: real temp repos driven by the git CLI.
use std::path::Path;

/// Runs a raw git command in a test repo, panicking on failure.
pub async fn git(repo: &Path, args: &[&str]) {
    let out = tokio::process::Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .output()
        .await
        .expect("git runs");
    assert!(
        out.status.success(),
        "git {args:?} failed: {}",
        String::from_utf8_lossy(&out.stderr)
    );
}

/// A temp repo on branch `main` with one committed file `a.txt`.
pub async fn repo_with_commit() -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    let p = dir.path();
    git(p, &["init", "-b", "main"]).await;
    git(p, &["config", "user.email", "test@omnibus.dev"]).await;
    git(p, &["config", "user.name", "OmniBus Test"]).await;
    git(p, &["config", "commit.gpgsign", "false"]).await;
    std::fs::write(p.join("a.txt"), "one\n").unwrap();
    git(p, &["add", "."]).await;
    git(p, &["commit", "-m", "init"]).await;
    dir
}
