# Rabta (formerly OmniBus)

**A local-first desktop platform that acts as a shared "brain" for your dev tools.**

You work in tasks, not apps. Editors, browsers, terminals, and git connect once to a local hub; Rabta captures the state of a task across all of them and restores it on demand. Switch tasks and your workspace — files, folder, terminals, git branch, browser tabs — comes back. It restores what it can immediately and tells you what is waiting on another app: a branch switch and an editor's files land at once, where browser tabs come back on the next reload. A partial result is reported, never hidden. No cloud, no telemetry, no account. "USB-C for dev tools": every app connects once, then talks to every other app through Rabta.

> **Status:** v0.1.0 is released — signed, notarized, and downloadable from
> [rabta.build](https://rabta.build). Apple Silicon only (macOS 11+); there is no
> Intel build. Both connectors are published — the editor on Open VSX, the
> browser on the Chrome Web Store. See [`docs/vision.md`](./docs/vision.md) for
> the original project vision.

---

## What it does

```
   VS Code / Cursor      Chrome           Terminal        git        GitHub
   (extension)           (extension)      (cwd)           (CLI)      (gh CLI)
        │                    │               │              │           │
        │  WebSocket +       │               │              │           │
        │  shared protocol   │               │              │           │
        └──────────┬─────────┴───────────────┴──────┬───────┴───────────┘
                   │                                 │
          ┌────────┴─────────────────────────────────┴────────┐
          │                Rabta Desktop (Tauri)               │
          │  ┌───────┐   authenticated    ┌────────────────┐   │
          │  │  Hub  │◄── local WS ───────│ connectors     │   │
          │  └───┬───┘   127.0.0.1 only   └────────────────┘   │
          │      │ HubEvent (broadcast)                        │
          │  ┌───┴────────┬──────────────┬─────────────────┐   │
          │  │ Dev console│  Recorder    │  Capsule engine │   │
          │  │  (Debug)   │  (SQLite)    │  (save/restore) │   │
          │  └────────────┴──────────────┴─────────────────┘   │
          │        Projects view · Tasks · Git · GitHub        │
          └────────────────────────────────────────────────────┘
                                  │
                          ~/…/com.omnibus.dev/
                          hub.json (0600) · omnibus.db
```

- **Tasks & capsules.** A task remembers the state of the tools you've connected to it — open files, workspace folder, terminal cwds, git branch, browser tab URLs. Save it, switch away, come back: it all restores. Switching tasks auto-saves the outgoing one.
- **One hub, one protocol.** Every connector speaks the same JSON-over-WebSocket protocol to a local hub bound to `127.0.0.1` only. Apps never talk to each other directly — everything flows through Rabta and is visible in the Debug activity log.
- **Authenticated.** Native connectors read a per-run secret from a `0600` discovery file automatically; a browser (which can't read files) pairs through an in-app approve/deny banner and gets a persistent token. Random web pages are rejected at the WebSocket handshake.
- **Safe git.** Status, fetch, checkout, and branch creation — but Rabta *never* force-checkouts, resets, stashes, or discards. A checkout onto a dirty tree is refused with a message, never forced.
- **GitHub, no credential stored.** Reads issues and starts a task+branch from one — through your own authenticated `gh` CLI. Rabta never sees or stores a GitHub token.

Items in a capsule can be **pinned**. A pinned item opens every time you resume the task, even if it was closed when you last saved — that is the difference between "always here" and "here until I close it once". Everything else in a capsule is simply what was open, and comes back as it was.

Resuming is additive by default: nothing ever closes. **Focus mode** (Settings — off by default) makes resuming also put away what doesn't belong to the task: browser tabs and editor files/terminals the capsule didn't capture, closed one at a time through the connector that owns them, and only once the restore itself has finished cleanly. It never closes an unsaved file, a terminal running something, or anything pinned — those are reported back as *kept*, with the reason, rather than being silently skipped or forced closed. It only ever acts on tabs, files, and terminals inside the connectors Rabta manages — it does not hide other applications' windows or touch anything Rabta didn't open.

## Privacy & security posture

This is load-bearing, not a footnote — the whole value proposition depends on trust. Rabta stores **only the metadata needed to restore a task**:

- **Stored:** workspace folder + open-file *paths*, terminal cwds, git *branch name*, browser tab *URLs* (http/https, non-incognito only), and per-connector pairing tokens (random UUIDs).
- **Never touched:** file *contents*, terminal *output*, keystrokes, clipboard, page contents, cookies, browser history, passwords, or any GitHub credential. The Chrome extension requests only `tabs` + `storage` — it is *structurally incapable* of reading page content (no host permissions, no content scripts).
- **Never leaves the machine.** No cloud backend; the hub is never exposed over the internet. The only outbound traffic is your own `git`/`gh` reaching their remotes, exactly as they would from your shell.

Full principles: [`docs/vision.md` → Privacy Principles](./docs/vision.md).

---

## Repository layout

```
omnibus/
├── apps/desktop/           # Tauri 2 app — React/TS/Tailwind/Zustand + a thin Rust shell
│   └── src-tauri/          #   hosts the hub; capsules.rs, git.rs, github.rs, projects.rs
├── crates/
│   ├── omnibus-hub/        # the hub: WS server, auth, routing, liveness (runs headless in tests)
│   └── omnibus-db/         # SQLite persistence: projects, tasks, task_resources, events, connectors
├── connectors/
│   ├── vscode/             # real VS Code / Cursor extension (esbuild bundle)
│   ├── chrome/             # real Chrome MV3 extension (browser-native transport)
│   └── fake/               # simulated connector — the SDK reference, still used in CI
├── packages/
│   ├── protocol/           # the wire protocol: Zod schemas + shared JSON fixtures
│   └── connector-sdk/      # Node TS SDK: discovery, handshake, reconnect (used by vscode + fake)
└── docs/
    ├── vision.md           # product vision + privacy principles
    └── superpowers/        # per-phase design specs and implementation plans
```

**The protocol is defined twice on purpose** — Zod in `packages/protocol`, serde in `crates/omnibus-hub` — and kept in lockstep by shared JSON fixtures tested from both languages, so drift fails CI instead of failing at runtime. The Chrome extension can't use the Node SDK (no `fs`, no Node `ws`), so it has its own browser-native transport; it still speaks the exact same protocol.

## Install (packaged)

```sh
./scripts/package.sh     # → dist-artifacts/: the .dmg app + .vsix + chrome .zip
```

Then follow [`docs/INSTALL.md`](./docs/INSTALL.md): drag the app to Applications (first launch is right-click → **Open**, since the build is unsigned), `--install-extension` the `.vsix`, and **Load unpacked** the Chrome zip. macOS/arm64.

## Build & run from source

Prerequisites: **Node + pnpm**, **Rust + cargo**, and (for the git/GitHub features) **`git`** and the **`gh` CLI** (`gh auth login`). macOS.

```sh
pnpm install                       # workspace deps
cargo build                        # hub + desktop shell (compiles bundled SQLite once — slow first time)

# run the desktop app (opens the Rabta window; the hub starts with it):
pnpm --filter desktop tauri dev

# build the connectors you want to use:
pnpm --filter omnibus-vscode build     # → connectors/vscode/dist/extension.js
pnpm --filter omnibus-chrome build      # → connectors/chrome/dist/
```

Load a connector into its editor/browser:

```sh
# VS Code / Cursor — opens a window with the extension loaded on <repo>:
cursor --extensionDevelopmentPath="$PWD/connectors/vscode" <repo>

# Chrome — isolated profile so your main browser is untouched:
open -na "Google Chrome" --args \
  --user-data-dir="$HOME/omnibus-chrome" \
  --load-extension="$PWD/connectors/chrome" <urls…>
```

The hub also runs without the desktop app, for testing or scripting:

```sh
cargo run -p omnibus-hub --example headless          # prints HubEvents as JSON lines
#   OMNIBUS_DATA_DIR=<dir>   overrides the discovery-file location
#   --record                 persists activity to omnibus.db like the app does
```

## Try the full loop

1. **Register a project** (Projects tab): paste a repo path — the default branch prefills from `.git/HEAD` — name it, **register**.
2. **Connect an editor** (`cursor --extensionDevelopmentPath=…`) → it appears green in the **Debug** tab. Open a couple files.
3. **Connect Chrome** (`--load-extension`) → an **approve/deny pairing banner** appears in Rabta → approve → it reconnects green. Open a couple tabs.
4. **Save state** on a task → the summary shows `vscode: N files · chrome: M tabs · git: <branch>`.
5. **Switch:** close the files/tabs, activate another task, then activate the first again → files reopen, tabs return, branch restored. That restore is the product.
6. **Safe git** on the project row: `fetch`, switch branches (refused on a dirty tree), create a branch — and capsules restore the branch too.
7. **GitHub:** on a project with a GitHub remote, **fetch issues** (via your `gh`), then **start task** on one → a task `#N …` plus a safe `issue-N-slug` branch.
8. **Persistence:** quit the app and relaunch → recent activity returns as dimmed `[hist]` entries and previously-seen connectors show as known-but-disconnected rows.

## Testing

```sh
cargo test     # hub (auth, routing, liveness, pairing), db, capsules, git.rs, github.rs — all headless
pnpm test      # protocol fixtures (both languages), connector-SDK integration (spawns the real hub),
               #   vscode/chrome pure modules + transport state machines, fake connector
```

Orchestration is integration-tested against a **real hub with scripted connectors**, not mocks — capsule save/restore, cross-editor-reload continuations, the auth gate, safe-git refusals (asserting byte-identical trees), and the GitHub task+branch flow all run without a GUI. UI-driven paths are verified by manual walkthrough.

## How it was built

Every phase went spec → plan → implementation → review → live walkthrough → merge, one isolated worktree each. Specs and plans live in [`docs/superpowers/`](./docs/superpowers/), one per phase:

| # | Phase | Design spec |
|---|-------|-------------|
| 1–4 | Architecture foundation (shell, protocol, hub, fake connector, dev console) | [foundation](./docs/superpowers/specs/2026-07-17-omnibus-architecture-foundation-design.md) |
| 5 | Persistence (SQLite, recorder, history preload) | [persistence](./docs/superpowers/specs/2026-07-17-omnibus-persistence-design.md) |
| 6 | Project registration | [project registration](./docs/superpowers/specs/2026-07-18-omnibus-project-registration-design.md) |
| 7 | VS Code connector | [vscode connector](./docs/superpowers/specs/2026-07-18-omnibus-vscode-connector-design.md) |
| 8 | Task Capsules | [task capsules](./docs/superpowers/specs/2026-07-18-omnibus-task-capsules-design.md) |
| 9 | Safe git operations | [safe git ops](./docs/superpowers/specs/2026-07-19-omnibus-safe-git-ops-design.md) |
| 10a | Hub authentication | [hub authentication](./docs/superpowers/specs/2026-07-19-omnibus-hub-authentication-design.md) |
| 10b | Chrome connector | [chrome connector](./docs/superpowers/specs/2026-07-19-omnibus-chrome-connector-design.md) |
| 11 | GitHub integration | [github integration](./docs/superpowers/specs/2026-07-19-omnibus-github-integration-design.md) |

## Not done yet

- **Packaging:** runs from source only — no signed/notarized `.dmg`, and the extensions aren't published to the Chrome Web Store or VS Code Marketplace.
- **Cross-platform:** macOS is the only tested target (nothing is deeply macOS-specific; the discovery file and keychain-adjacent bits would need porting).
- **Future roadmap** (explicitly deferred): more connectors (Docker, Postman, Figma, Linear, Jira), a plugin SDK, automation rules, optional AI suggestions, cloud sync, and team collaboration.
