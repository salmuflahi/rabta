# Lens redesign verification

## Rabta Teams: the Room, threads and Together — September 10, 2026

- Service: `node --test services/teams/` passes 26 tests against real HTTP
  servers and temporary durable directories, including snapshot reference
  validation, hash-chained thread appends with idempotency across a restart,
  the inbox, Together broadcast, expiry on the 60-second timer, revocation,
  and the separate 15-per-second cursor budget.
- Rust: `cargo test -p rabta-desktop --lib` passes 58 tests on this Linux
  host, three of them for the Step-in import: references resolve under the
  chosen project or home only, absolute paths and parent segments are refused
  with reasons, and the produced resources match the shapes restore reads.
- Desktop frontend: 874 tests in 81 files pass, including the Room (inbox
  Step in through `import_task_snapshot` and the normal `activate_task`,
  acknowledging a decision, tying a knot with the active capsule attached as
  project-relative references, handing off with a service-safe thread id,
  named cursors that disappear with their owner, Together off by default),
  the thread helpers and the snapshot builder; TypeScript and the Vite
  production build pass. The workspace tests make no network requests.
- VS Code connector: TypeScript, 24 tests and the esbuild bundle pass; the
  cursor event is project-relative, one-based, null outside the folder, and
  peer cursors are capped at 32 with validated colours.
- Not verified here: two real Macs in one room, cursor latency, the VS Code
  decorations on screen, focus-mode restore of an imported capsule, and the
  real-pair gates in `docs/rabta-teams-plan.md`.

## Native toolkit, second batch, and the wordmark — September 9, 2026

- Rust: `cargo check` and `cargo test --lib` for the desktop crate run on this
  Linux host after installing the GTK/WebKit development packages; 55 unit
  tests pass. `cargo check --target aarch64-apple-darwin` cannot run here
  because a Tauri dependency compiles Objective-C; `build.rs` now states that a
  macOS target on a non-Mac host does not compile the native service.
- Desktop frontend: 862 tests in 78 files pass, including 14 new native
  toolkit panel tests; TypeScript and the Vite production build pass.
- Website: 75 tests pass after the wordmark switch, `astro check` reports no
  issues, and the built home, brand, 404 and why pages were screenshotted with
  headless Chromium (reduced motion for the home hero, whose GSAP intro does
  not advance under a virtual-time capture). The nav, hero, brand specimens,
  tile and 404 all render the wordmark; no page contains the retired R.
- Brand: every icon, favicon, connector icon, `.icns`, `.ico` and the social
  card were regenerated from `wordmark.svg` by the new Node generator on
  Linux; the outputs were inspected at 512, 32 and 1200×630.
- Not verified here: the Objective-C compile and link, Accessibility, Input
  Monitoring, Camera and Screen Recording prompts, event-tap behaviour on real
  hardware, `hdiutil`, Homebrew and `screencapture` interaction, the Info.plist
  merge in the bundle, and signed distribution. These stay Mac CI and
  on-device gates.

## Expanded desktop toolkit and Teams — September 9, 2026

- Full desktop suite: 847 tests passed after final integration. TypeScript and
  Vite production build passed, including image and media worker bundles.
- Native window calculation/targeting tests: 12 passed. Teams service HTTP/SSE
  tests: 14 passed. The desktop Teams client also exercised the real local
  service, including reviewed proposal application.
- MCP TypeScript passed and all 29 server tests passed. The full local MCP run
  is limited by EPERM on Unix socket creation; Mac CI runs the entire suite.
  Utility source synchronization passed.
- Website build and all 24 route/component tests passed. Utility routes now
  render download-oriented details, with no image, SVG, media or utility editor
  mounted there. The published site distinguishes the existing stable download
  from the expanded desktop preview.
- Strict UI audit: 43 full-repository findings, including seven authored Select
  ownership false positives and 36 existing gallery/legacy findings. Scoped
  creative, Teams and new native surfaces had no findings. This is not a clean
  full-repository accessibility audit.
- This environment has no Rust/macOS compiler or native runtime. The updated
  Apple Silicon CI is the compilation, Rust-test and preview packaging gate.
  Actual Mac permission denial/revocation, codecs, multi-display operation,
  clipboard exclusions and final visual acceptance remain on-device checks.
- Teams requires self-hosted HTTPS for remote participants. No managed service,
  arbitrary app-window streaming, automatic social posting or signed public
  release is claimed. The 57-feature reference remains partially implemented.

## Combined desktop app — September 9, 2026

The integration merges the Lens/family redesign through `b90def9` with the
Studio utilities and account handoff through `7e0c422`. Both sets of native
commands remain registered. Utilities use the shared font tokens, the current
sprite glyph source and the native view from the family launcher.

- TypeScript and Vite production build passed using the installed package executables.
- Full desktop suite passed: 786 tests in 65 files, plus the new family-menu integration test passed separately (787 tests total).
- The strict repository audit reports 42 findings: six ownership findings and 36 static violations. The new utility Select findings refer to authored React components injected from the existing Radix Select wrapper, not browser-native select elements. Other findings are in pre-existing gallery/test fixtures and legacy controls. This is not a clean full-repository accessibility audit.
- The browser environment rejected both local preview addresses with `ERR_BLOCKED_BY_CLIENT`; no fresh visual acceptance is claimed for this merge.
- Rust/Cargo and a macOS runtime are unavailable here. Native compilation, permission handling, capture/restore and packaging remain gates in the Mac preview workflow and on-device checks.
- This combines implemented source; `docs/native-suite-parity.md` still tracks the unimplemented portions of the 57-feature request. Desktop accounts open web management; native identity and cloud sync are not implemented.

2026-09-07. This change targets the existing React desktop frontend and keeps its Tauri commands intact.

- Production frontend: `npm run build --prefix apps/desktop` passes TypeScript and Vite. The result contains no newly added GPU/animation engine.
- Full desktop suite: 762 tests pass, including restore/partial restore, capture outcomes, pin curation, deletion/Undo, keyboard navigation, light/dark semantic contrast and all existing accent preferences.
- The premium static audit reports no findings in the changed files. Its full-repository scan reports 41 findings in existing settings/gallery/test fixtures, historical design cards and unrelated controls. This release does not claim those legacy surfaces have passed a full accessibility audit.
- New behavior checks cover Overview read-failure/retry and the quick connection action. Existing restore test mocks now implement MediaQueryList listener methods, matching the production browser API.
- Shared Lens source is copied verbatim from Rabta Studio 0.4.0. `upstream.json` records hashes; the sync script verifies the package and reads the complete subset before writing.
- Existing pnpm install attempted to add an unresolved `allowBuilds` placeholder for esbuild. That automatic file change was reverted; no dependency build permission was changed. The installed package executables successfully built through the existing npm build script.
- No new native macOS installer was built or signed. Native Tauri rendering, native window controls, accessibility zoom and final visual review on macOS remain release checks.
- Requested screenshots on 2026-09-07 render the real Overview and Capsules React views with the existing deterministic sample-data bridge. Light and dark screenshots were visually inspected at 1363 × 936. The capture entry now imports the exact production Lens styles. This is bounded browser visual review, not native macOS acceptance or a complete responsive audit.

## Mac preview handoff

The follow-up adds a read-only GitHub Actions workflow to build an Apple Silicon
preview on the pull request. Its Tauri config overlay changes the app name,
data-directory identifier and ad-hoc signing identity for that build only;
the normal release config is unchanged. The workflow has frontend and native
test gates, preserves app permissions inside a `ditto` ZIP, verifies its
signature and uploads a 14-day review artifact. A native build is not claimed
until that workflow succeeds. See [desktop preview instructions](docs/DESKTOP-PREVIEW.md).

The public website's illustrative app UI uses sample data and cannot manipulate a visitor's files. The production desktop views use actual connector/capsule state.
