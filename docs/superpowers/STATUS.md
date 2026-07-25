# Rabta — Project Status & Handoff

> **Read this first.** This is the single "where we are / what's next" file for picking up work.
> Last updated: **2026-07-24**. Branch: **`codex/track-b-core`** (local-only repo, no git remote).
> Track B Core implementation range: **`cc39522` through `68259f5`**, based on main at `27a6c8b`.
> Durable plans and specs live in `docs/superpowers/plans/` and `docs/superpowers/specs/`.

---

## What this project is

**Rabta** (formerly OmniBus) is a local-first Tauri desktop app that saves and restores a task's workspace "capsule": editor files and terminals, browser tabs, and git branch. The frontend is React/TypeScript/Tailwind; the Rust side owns the local database, connector hub, capsule orchestration, and session accounting.

## Where we are

- **All 11 original vision-roadmap phases: complete.**
- **QoL and polish arc A1–A6: complete.**
- **Track B Core B1–B3: complete on `codex/track-b-core`.**
- Desktop suite: **166 Vitest tests passing across 20 files**.
- Rust workspace suite: **all tests passing**.
- `cargo fmt --all -- --check`: passing.
- `cargo clippy --workspace --all-targets -- -D warnings`: passing.
- `pnpm build`: passing. Vite reports only its advisory 500 kB chunk-size notice.
- A real tempfile-backed schema-v1 database upgrades to schema v2 in place while preserving project, task, and resource IDs.

### Track B Core B1–B3

| Phase | Completed work |
|---|---|
| B1 — Durable operations | Schema v2 migration; project rename, archive/unarchive, icon, exact ordering, and permanent delete; capsule rename and duplicate; archive-safe task/GitHub operations; persisted session metadata and saturating duration accrual |
| B2 — Product UI | Project and capsule actions wired into existing menus; curated project icons; accessible drag and keyboard ordering; Archived Projects restore/delete flow; truthful duplicate/rename feedback; persisted Continue Working and capsule session preview |
| B3 — Active-session runtime | Focused, non-idle active-time accounting with fractional carry and 30-second sleep cap; durable activation/archive transitions; continuation/session concurrency isolation; ordered focus/idle dispatch with nested-scroll activity capture; 15-second heartbeat, 60-second idle bridge, and best-effort shutdown flush |

The high-risk session path has deterministic tests for persistence failure, focus loss, activation/archive serialization, overflow saturation, subsecond carry, and blocked reconnect continuation behavior.

---

## Manual GUI acceptance still pending

The live debug app was launched successfully with `pnpm tauri dev`. The available GUI automation can attach only to bundled macOS apps, not the raw Tauri debug executable, so these checks remain explicitly pending rather than being reported as verified:

1. Rename a project and capsule.
2. Choose and persist a project icon.
3. Drag reorder and keyboard reorder; relaunch and confirm order.
4. Archive, Undo, Archived Restore, and permanent Delete safety.
5. Duplicate a capsule and confirm resources copy without automatic activation or branch switching.
6. Resume and confirm last-open/session copy.
7. Keep focused for at least 20 seconds, blur, idle for 60 seconds, refocus, and confirm only eligible time accrues.
8. Toggle sidebar collapse with its button and **⌘\\**.
9. Move/resize, quit, relaunch, and confirm window state.

Do not treat these GUI-only checks as blockers to the automated B1–B3 implementation; record any observed failure as a focused test before fixing it.

---

## What's next

### B4 — Connector version reporting — DONE

Connectors self-report a product/build `version` on the `hello` frame (distinct
from `protocolVersion`). It threads through the shared protocol (Zod +
serde/fixture `hello-version.json`), the hub `ConnectorInfo`, the
`connectorConnected` broadcast, and is **persisted** in the `connectors` table
(migration `003_connector_version.sql`, mirroring how capabilities persist) so a
known/last-seen connector still shows its version. The SDK (`ConnectOptions.version`)
and all three connectors report it — fake reads its `package.json`, VS Code reads
`context.extension.packageJSON.version`, Chrome reads `chrome.runtime.getManifest().version`.
The Connectors page shows a `v<version>` chip next to the kind badge, omitted when
none was reported. A `None`/absent version is never fabricated at any layer.

Verified green: full Rust workspace (fmt/clippy/tests incl. new handshake, db,
recorder, migration coverage), all TS package suites (protocol 15, desktop 169,
connector-sdk 9 incl. the real headless-hub integration test, chrome 28, vscode 5,
fake 2), all builds, and vscode/chrome `tsc` typecheck. Drive-by fix: the
connector-sdk integration test referenced the pre-rename crate `omnibus-hub`;
corrected to `rabta-hub` (the package rename had left it red, uncaught by Track B's
cargo+desktop-only gate). Only residual: the literal `v<version>` badge in the live
Tauri window is component-tested but not GUI-verified (same automation limitation as
the Track B manual list).

### B5 — Packaging, signing, and release hardening

After B4, produce a repeatable macOS bundle, settle signing/notarization strategy, verify clean-install data migration and window state, and run the manual GUI acceptance list against the bundled app.

### Deferred low-priority polish

- Sidebar labels disappear immediately rather than fading during collapse.
- `humanizeCapsule` is computed twice per open Resume-preview row.
- The unsaved-changes dot tooltip is not independently keyboard-focusable.
- The production bundle remains slightly above Vite's default 500 kB advisory threshold.

---

## How to resume

Track B Core B1–B3 is merged to `main` (fast-forward to `f52224a`). B4 is
implemented on branch `track-b-b4-connector-version`.

1. Run `git log --oneline -15` to confirm state.
2. Complete the manual GUI list against a bundled build or with a human operator.
3. B5 is next: produce a repeatable macOS bundle, settle signing/notarization,
   verify clean-install migration (now through schema v3) and window state, then
   run the manual GUI acceptance list against the bundled app.
4. Keep B4 and B5 separate. Prefer the smallest implementation that proves the current phase.
