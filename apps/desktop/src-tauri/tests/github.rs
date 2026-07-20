use omnibus_desktop_lib::github::{branch_name_for_issue, owner_repo_from_remote, parse_issues};

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
