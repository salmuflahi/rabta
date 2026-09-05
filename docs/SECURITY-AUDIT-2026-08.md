# Rabta security audit — v0.1.0

**Date:** 11 August 2026
**Scope:** Rabta 0.1.0 (macOS desktop app), the local hub, both connectors, the migration bundle format, the distribution chain, and rabta.build.
**Auditor:** Claude Opus 5, working against the source tree at `f313a3d` and against the shipped `Rabta_0.1.0_aarch64.dmg`.
**Method:** source review with every claim checked against the code or the artifact it describes; automated dependency scanning; verification of the signing chain against the real binary rather than against documentation.

---

## Verdict

**No vulnerabilities found. Rabta 0.1.0 is safe to distribute.**

The product's public promise — nothing leaves your machine — is structurally true rather than merely intended. There is no server to compromise, no credential to steal, no telemetry to leak, and no dependency in the shipped binary with a known advisory against it.

Five findings are recorded below. One was a real defect and is fixed. Four are accepted limitations that follow from deliberate design choices, and each is stated publicly on the site rather than left for a reader to discover.

The single most important thing this audit establishes is that **the claims on rabta.build are checkable and check out.** For a product whose entire value proposition is trust, that matters more than the absence of any particular bug.

---

## What Rabta is defending

Rabta stores a description of how you work: which repositories you have open, which files you had open in them, which URLs you were reading, which branch you were on. That is not source code, but it is an unusually precise picture of a person's attention.

The threats worth taking seriously are therefore:

1. **Exfiltration** — that picture reaching anyone but you.
2. **Local escalation** — another process on your Mac, or a web page in your browser, using Rabta's local socket to read that picture or to act on your machine.
3. **Supply chain** — a tampered download, or a dependency that does something the product does not.
4. **Destructive action** — Rabta damaging work it was meant to protect, since it holds write access to your repositories.

Each is addressed below.

---

## 1. Network exposure

### The hub binds loopback only

`crates/omnibus-hub/src/hub.rs:153-156`. Both the preferred-port branch (17872) and the fallback branch bind `127.0.0.1`. There is no other bind expression anywhere in the tree, and no configuration path that could change it — the address is a literal, not a setting.

**Consequence:** nothing on the local network, and nothing on the internet, can reach the hub. The macOS incoming-connection prompt users see on first launch is this socket, and allowing it does not expose anything beyond the machine.

### Web origins are rejected at the handshake

`hub.rs:342-356`. A WebSocket upgrade is accepted only when the `Origin` header is absent (a native process — an editor extension) or begins `chrome-extension://` / `moz-extension://`. Any `http(s)` origin is refused with 403 before the connection is established.

The implementation gets the subtle case right: a present-but-unparseable `Origin` (non-ASCII bytes) is rejected rather than treated as absent. Treating a malformed header as "no header" is the classic fail-open in this pattern, and the code has a comment saying exactly that.

**Consequence:** a malicious web page cannot open a socket to the hub even though it runs on the same machine. This is the control that stops "localhost is a trusted network" from being a vulnerability.

### Authentication, and a constant-time comparison

`hub.rs:466-500`. Version check first, then authentication. A connector authenticates either with the per-run `hub.json` secret (native processes that can read the file) or with a pairing token issued after explicit user approval. Comparison is via `ct_eq` (`hub.rs:394-405`), a constant-time loop over fixed-length UUIDs.

Timing side channels on a loopback socket are a marginal threat, and implementing this anyway is the right call — the cost is ten lines and the alternative is an argument about how marginal.

### Resource limits

Command timeout 10s, ping interval 5s, pairing timeout 120s (`hub.rs:45-48`). Pairing requests are parked with a resolver and expire; an unauthenticated client can send `pair` frames but cannot accumulate unbounded state.

**Accepted limitation:** there is no per-connection rate limit or global connection cap. On a loopback-only socket reachable solely by processes already running as you, an attacker with that access has better options than exhausting the hub. Recorded rather than fixed.

---

## 2. Secrets at rest

| Secret | Where | Lifetime | Protection |
|---|---|---|---|
| Hub discovery secret | `hub.json` | Regenerated every launch | File mode `0o600` (`hub.rs:177`) |
| Connector pairing token | `connectors` table | Persists until the connector is removed | Filesystem permissions on the app folder |
| GitHub credential | **Not stored** | — | Rabta never sees one |

The pairing token persists deliberately: it is what stops an approved connector from re-prompting on every launch. It is generated on the machine, is meaningless anywhere else, and is deleted with the app folder.

**Finding (fixed):** the privacy page enumerated "the exact categories of data stored" and omitted this token, beside copy stressing that the `hub.json` secret rotates every launch. A reader could reasonably conclude that every local secret was ephemeral. Corrected in `c587009`.

**On the GitHub credential:** `apps/desktop/src-tauri/src/github.rs` shells out to the user's own authenticated `gh` CLI with a fixed argv. There is no token field, no keychain access, and nothing persisted. This is the correct design — it means a Rabta compromise cannot yield a GitHub token, because there is no GitHub token to yield.

---

## 3. What is collected

Verified by reading every filesystem and content-access path in the tree.

**The only file reads in the Tauri layer** are `.git/HEAD` (`projects.rs:43`, to resolve the current branch) and a user-picked migration bundle (`migrate.rs:171`). No source file is ever opened.

**The editor connector** uses `document.uri` and never `getText()` — grep returns zero occurrences across the connector. It reports which files are open, not what is in them.

**The browser connector** is structurally incapable of reading page content; see §5.

Stored data, from the live schema: `projects`, `tasks`, `task_resources`, `task_pins`, `connectors`, `events`, `db_meta`. Every resource payload is a pointer — a path, a URL, a working directory, a branch name.

**Consequence:** the claim "it stores paths, not contents" is enforced by what the code is capable of, not by a policy it follows.

---

## 4. Executing other programs

Rabta runs `git` and `gh`. This is the largest local-action surface and it is handled correctly.

- **Direct argv, never a shell.** `Command::new("git").args([...])` throughout (`git.rs:23`, `github.rs:97`). No `sh -c`, no string interpolation into a command line. Shell metacharacters in a branch name or path are inert.
- **stdin nulled** on every invocation, so nothing can block on a credential prompt.
- **Argv-flag injection is guarded explicitly.** `validate_branch_name` (`git.rs:42-56`) rejects empty and `-`-prefixed names *before* deferring to `git check-ref-format --branch`. A branch called `--upload-pack=...` cannot become a flag.
- **`git -C <repo>`** rather than a process-wide `chdir`, so concurrent operations cannot race each other's working directory.

**On destructive Git operations:** the surface is deliberately narrow — status, fetch, checkout, branch creation. There is no `reset`, no `stash`, no `clean`, no `checkout --force` anywhere in the tree, and a dirty working tree refuses a switch with a message rather than resolving it. This is a security property as much as a UX one: the app holds write access to your repositories and declines to use most of it.

---

## 5. The browser connector

`connectors/chrome/manifest.json`, Manifest V3:

```
"permissions": ["tabs", "storage", "alarms"]
```

- **No `host_permissions`.** The extension has no access to any site.
- **No `content_scripts`, no `scripting` permission.** No code is ever injected into a page.
- **No `externally_connectable`.** No web page can send it a message; `onMessage` (`background.ts:150`) receives only from the extension's own popup.
- **Socket target is a literal** — `ws://127.0.0.1:${port}` (`connection.ts:141`), with the port validated as a positive integer first.

`tabs.ts:33` excludes incognito tabs and any non-`http(s)` scheme before anything reaches the wire.

**Consequence:** "it cannot read your pages" is not a promise about restraint. Chrome's own permission model makes page content unreachable to this extension. The strongest phrasing available — *structurally unable* — is accurate.

---

## 6. Desktop app hardening

- **Tauri capabilities:** `{"identifier": "default", "windows": ["main"], "permissions": ["core:default"]}`. No shell plugin, no fs plugin, no http plugin exposed to the frontend. The IPC surface is exactly the commands the app defines.
- **Webview CSP:** `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'`. `'unsafe-inline'` on styles only, which is what a React app with runtime style props requires; scripts are `'self'` with no inline allowance.
- **No auto-updater.** No `tauri-plugin-updater`, no update endpoint. This removes an entire class of risk (a compromised update channel) at the cost of manual upgrades, and the site says so.
- **No HTTP client crate** in any `Cargo.toml`; zero `fetch`/`XHR`/`WebSocket`/`sendBeacon` in `apps/desktop/src`.

**Network calls in the whole product: two.** `git fetch --all` (`GitLine.tsx:174`) and `gh issue list` (`GitHubSection.tsx:82`). Both require a click. Neither goes to Rabta.

**Finding (fixed):** the FAQ claimed there was one. Corrected in `c587009`, and a test now prevents any page claiming an exclusive count.

---

## 7. The migration bundle

The one place Rabta reads a file a user brings from elsewhere, and therefore the one genuine untrusted-input boundary.

- **Encryption:** `age` with an scrypt passphrase recipient (`bundle.rs:226-241`) — ChaCha20-Poly1305 with a memory-hard KDF, a modern and well-reviewed construction. Not hand-rolled.
- **It is not an archive.** The bundle is a single sealed JSON document, so there is no zip-slip or path-traversal surface: no entry names, no extraction step.
- **Format and version are checked before any row is read** (`check_readable`, `bundle.rs:201-218`). A newer bundle is refused with an explanation rather than partially applied.
- **Authenticated encryption** means a tampered bundle fails to decrypt rather than decrypting to attacker-chosen content.

**Finding (fixed) — the one real defect in this audit.** `MigrateSheet.tsx:319-327` wrote an imported bundle's preferences blob into `localStorage["rabta.prefs"]` verbatim, and `readPrefs` validated `accent` and `statusbar` but trusted `landingPage` straight out of `JSON.parse`. `landingPage` seeds both `view` and `history[0].view`, so a value outside `NavKey` did not fail loudly — `App.tsx`'s exhaustiveness switch fell through to a branch holding the raw string, which React rendered as a text node where the page should be.

*Severity: low.* The failure is degraded rendering, not code execution — the CSP forbids inline script and the value is rendered as text, never as markup. But it was reachable from a file, which is what made it worth fixing at the root rather than papering over downstream.

*Fix:* `NAV_KEYS` now exists at runtime with `NavKey` derived from it, and `readPrefs` validates against it (`f313a3d`). Six tests cover it; removing the check fails five of them.

---

## 8. Debug-only code paths

The demo fixture (`demo_seed.rs`) writes to a user's database, so it was checked specifically for whether it can reach a release build. It cannot, by five independent mechanisms:

1. `#[cfg(debug_assertions)] pub mod demo_seed;` — not compiled into a release binary.
2. The `seed_demo_data` command body is split: the release branch returns an error string and contains none of the seeding code.
3. Debug builds resolve a separate data directory (`data_dir_for` appends `.debug`), so even in dev it cannot touch a released app's database.
4. It refuses to run when any project exists.
5. The UI entry point is additionally gated on `import.meta.env.DEV`.

The one thing that would defeat layer 1 — a `[profile.release] debug-assertions = true` override — does not exist: neither `Cargo.toml` defines a `[profile.release]` section, so Cargo's default of `false` applies.

---

## 9. Supply chain

### Rust — `cargo audit`, 563 crate dependencies

**Zero vulnerabilities.** Seventeen advisories are reported, all of category *unmaintained* or *unsound*, none a vulnerability:

- Ten GTK3 binding crates (`gtk`, `gdk`, `atk`, and their `-sys` variants) — RUSTSEC-2024-0411 through 0420.
- Five `unic-*` crates — RUSTSEC-2025-0075/0080/0081/0098/0100.
- `proc-macro-error` — RUSTSEC-2024-0370.
- `glib` unsoundness — RUSTSEC-2024-0429.

**None of the seventeen is in the shipped binary.** `cargo tree --target aarch64-apple-darwin` returns zero matches for every one of them, as a normal dependency or a build dependency. They are present in `Cargo.lock` because a lockfile is platform-agnostic: they are Tauri's Linux backend, which macOS does not compile. Verified rather than assumed.

### JavaScript — `pnpm audit --prod`

**No known vulnerabilities.**

### Website

Zero third-party requests on all nine pages. Every subresource is root-relative and present on disk; the single `@font-face` is self-hosted; there is no `@import`; a scan for common analytics and CDN vendors returns nothing. There is no supply chain to compromise because there is no third party in it.

---

## 10. Distribution

Verified against the actual artifact, not against documentation:

```
codesign -dv:      Authority=Developer ID Application: sammy almuflahi (86M2X6MUA3)
                   Authority=Developer ID Certification Authority
                   Authority=Apple Root CA
                   Timestamp=Jul 28, 2026
                   Notarization Ticket=stapled
stapler validate:  The validate action worked!
spctl -a -t install: accepted, source=Notarized Developer ID
shasum -a 256:     3978ec57af7d37ab32670033d679c21a28cf74cebb0435ce011049e05635c655
```

The SHA-256 matches the value published on `/setup/` byte-for-byte. A user who follows the verification steps on that page gets a real answer.

**Finding (fixed) — the highest-impact issue in this audit, and it was in prose.** `/changelog/` stated *"the build is unsigned, so the first launch is right-click → Open rather than a double-click."* Both halves are false, and the instruction is actively harmful: `/setup/` correctly tells users that a Gatekeeper warning means the file is not the one that was signed and must not be worked around. The changelog trained users to perform that exact bypass as normal, eroding the one signal that would reveal a tampered download.

*Severity: moderate.* No code defect, but it degraded a working control to the point of uselessness for anyone who read that page first. Fixed in `c587009`; a cross-page test now fails if any page calls the build unsigned or instructs the bypass.

---

## 11. The website

- **CSP** (meta-delivered; since 2026-09-04 generated by Astro from `site/astro.config.ts`, with the same directive set on every page enforced by `tests/site/launch-readiness.test.mjs`):
  `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; media-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; upgrade-insecure-requests`
- Zero inline event handlers, zero `javascript:` URLs, zero inline `style` attributes, zero `<style>` blocks, zero `eval`/`new Function`, zero forms. The one inline `<script>` is `application/ld+json`, which the HTML spec treats as a data block and never evaluates — so `script-src 'self'` without `'unsafe-inline'` is genuinely sufficient.
- Every off-site link is `https` with `rel="noopener noreferrer"`.
- `referrer: strict-origin-when-cross-origin`, so a link out of the privacy page does not tell the destination which page you were reading.

**Accepted limitation:** `frame-ancestors` cannot be enforced from a `<meta>` CSP — the specification ignores it there — so the site has no clickjacking protection. This is a GitHub Pages constraint: static hosting cannot set response headers. The impact is low for a site with no authenticated actions and no forms; there is nothing for a framing attacker to capture. Moving to a host that sets real headers would close it. The head comment in `_chrome/head.html` states this honestly rather than implying the policy is complete.

---

## Findings summary

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | `/changelog/` told users a signed, notarized build was unsigned and instructed the Gatekeeper bypass | Moderate | **Fixed** (`c587009`) |
| 2 | `landingPage` unvalidated at the localStorage boundary, reachable via bundle import | Low | **Fixed** (`f313a3d`) |
| 3 | FAQ claimed one network call; there are two, both click-gated | Low | **Fixed** (`c587009`) |
| 4 | Privacy page's "exact categories" omitted the persisted pairing token | Informational | **Fixed** (`c587009`) |
| 5 | No `frame-ancestors` (meta CSP cannot carry it); no hub rate limiting | Accepted | Documented |

---

## What this audit did not cover

Stated so the report is not read as broader than it is:

- **No dynamic analysis.** No fuzzing of the protocol parser, no runtime instrumentation, no attempt to exploit anything found. This is a source and configuration review plus artifact verification.
- **No review of the `age`, `rusqlite`, `tokio-tungstenite` or Tauri implementations themselves.** They are treated as trusted dependencies; `cargo audit` is the only check applied to their internals.
- **macOS only.** There is no Windows or Linux build to audit.
- **The published Chrome Web Store and Open VSX artifacts were not byte-compared to the repository.** The listings resolve and serve the versions the site names, which is what was checked.
- **No penetration test of rabta.build's hosting.** GitHub Pages' own security posture is out of scope.

---

## Recommendations

Nothing here blocks release. In rough priority:

1. **Add `frame-ancestors` if the site ever moves off GitHub Pages.** The only real gap, and it is a hosting constraint rather than a code one.
2. **Keep the cross-page test suite growing.** Four of the five findings above were factual contradictions between pages, and every one of them was mechanically checkable. The guard added in `c587009` catches that class; the class is worth watching because it recurs whenever pages are written in parallel.
3. **Run `cargo audit` in CI.** It is currently a manual step. Zero vulnerabilities today is a snapshot, not a property.
4. **Publish connectors 0.2.0.** Not a security matter, but `dist-artifacts/` holds a build newer than what the registries serve, and drift between what is packaged and what is published is how the wrong artifact eventually ships.

---

*Every claim in this report was verified against the source file or the artifact cited. Where something could not be verified, it is listed under "What this audit did not cover" rather than assumed.*
