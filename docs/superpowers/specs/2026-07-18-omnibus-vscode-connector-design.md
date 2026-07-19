# OmniBus — VS Code Connector (Phase 7)

**Date:** 2026-07-18
**Status:** Implemented
**Scope:** A real VS Code extension (`connectors/vscode`) that registers with the hub via the existing connector SDK: workspace/editor state reads, file/workspace opening, terminal creation, editor events.
**Out of scope:** task capsules and save/restore orchestration (phase 8), cursor positions (phase 8 decides what restore needs), git operations (phase 9), Chrome (phase 10), extension marketplace packaging/publishing.

Builds on merged phases 1–6. Foundation Principles / Coding standards / DoD and the vision's Privacy Principles bind this phase. This is the first connector that leaves our own process boundary — the fake connector finally gets replaced by the thing it simulated.

---

## Goal

**What:** OmniBus can see and drive a real editor. With the app running, launching VS Code (or Cursor — same extension host) with the OmniBus extension makes a `vscode`-kind connector appear in the dev console; the hub can read its workspace state, open files, and create terminals; editor activity streams into the activity log.

**Why this shape:** phase 8 (capsules) needs exactly two primitives from every connector — *read your state* and *apply this state*. This phase ships the read side fully and enough of the apply side (open file/workspace, create terminal) to prove restoration is possible, without inventing capsule semantics early.

```
   VS Code / Cursor window
   ┌────────────────────────────┐
   │  extension host (Node)     │
   │  ┌──────────────────────┐  │        ┌──────────────┐
   │  │ OmniBus extension    │  │  WS    │     Hub      │
   │  │  extension.ts (thin  │◄─┼───────►│ (unchanged)  │
   │  │   vscode adapter)    │  │        └──────────────┘
   │  │  state.ts (pure,     │  │   same SDK, same protocol,
   │  │   tested)            │  │   same handshake as the
   │  │  @omnibus/connector- │  │   fake connector
   │  │   sdk (reused as-is) │  │
   │  └──────────────────────┘  │
   └────────────────────────────┘
```

### Success criteria

1. With the OmniBus app running, launching the editor with the extension (`--extensionDevelopmentPath`) shows a connector named `vscode` (kind `vscode`, capabilities `workspace, editor, terminal`) with a green dot in the dev console.
2. `workspace.state` returns the editor's real state: workspace folder, open file paths, active file, terminals (name + cwd where knowable).
3. `editor.openFile { path }` opens the file in the editor; `terminal.create { cwd }` creates and shows a terminal there.
4. Opening/closing files in the editor emits `editor.fileOpened` / `editor.fileClosed` events that appear in the activity log.
5. Quitting the OmniBus app and relaunching it: the extension reconnects by itself (SDK backoff) without reloading the editor.
6. A full command round-trip through the real extension is proven mechanically: the headless hub's `--probe` receives a response (an `ok: false` "no handler" reply is proof of routing) from the extension.
7. Editor activation is never blocked by OmniBus: with no hub running, the extension activates instantly and connects later when the hub appears.
8. `pnpm test` covers the state module; `pnpm --filter omnibus-vscode build` bundles cleanly; all existing suites stay green and warning-free.

## Non-goals

- No capsule save/restore semantics, no state diffing, no persistence in the extension.
- No cursor positions, scroll positions, or editor layout — phase 8 decides what restore actually needs before we capture more.
- No git operations (phase 9) and no terminal *output* reading — ever, per Privacy Principles.
- No marketplace packaging, signing, or publishing; the extension runs from source via `--extensionDevelopmentPath`.
- No changes to hub, protocol, SDK, or fake connector (the fake stays — tests and CI use it; it remains the SDK reference).
- No settings UI in the editor.

---

## Key decision: a real extension reusing the SDK unchanged

**What:** `connectors/vscode` is a standard VS Code extension (TS, `engines.vscode ^1.85`, activation `onStartupFinished`) that depends on `@omnibus/connector-sdk` exactly as the fake connector does.

**Why it works:** the extension host is Node — the SDK's `ws` transport, `hub.json` discovery from the home directory, and reconnect loop all run unmodified. This is the payoff of phase 3's "validate the architecture with a fake connector first": the real connector is *handlers over the same SDK*, not new architecture.

**Bundling:** VS Code loads a single JS entry; extensions can't resolve pnpm workspace symlinks at runtime. `esbuild` bundles `src/extension.ts` → `dist/extension.js` (CommonJS, `external: ["vscode"]`), inlining the SDK and protocol. One ~15-line build script, no webpack.

**Editor reality on this machine:** VS Code proper isn't installed; Cursor is (a VS Code fork with the same extension API and a `cursor` CLI supporting `--extensionDevelopmentPath`). The extension targets the standard API; the walkthrough runs in Cursor.

## Key decision: activation never waits for the hub

**What:** `activate()` calls `connect(...)` fire-and-forget (`.then`, not `await`) and returns immediately. Command handlers are registered in the SDK's `setup` callback (before dialing); event listeners emit through an optional connector reference that is simply absent until connected.

**Why:** the SDK's `connect()` promise resolves only after the first `welcome` — awaiting it would hang extension activation whenever OmniBus isn't running, which is most of the time on a normal day. The editor must never pay for OmniBus's absence.

**Trade-off accepted:** editor events fired before the connection lands are dropped, not queued. That is correct — the hub reads current state on demand (`workspace.state`); missed transient events carry no durable meaning.

## Key decision: a pure state module

**What:** `state.ts` contains pure functions from plain data (`{ workspaceFolders, tabUris, activeUri, terminals }`) to the wire shapes; `extension.ts` is a thin adapter that extracts that plain data from the `vscode` API and forwards commands.

**Why:** the `vscode` module only exists inside a running extension host, which makes anything that imports it untestable in vitest. Keeping every mapping/filtering rule (file-scheme-only, dedupe, first-workspace-folder) in a module that never imports `vscode` means the logic is fully unit-tested and the untested adapter layer is ~a screen of glue.

## Command and event surface

Declared capabilities: `["workspace", "editor", "terminal"]`.

Commands (the shapes phase 8 will consume):

```
workspace.state   {}                    -> { workspaceFolder: string|null,
                                             openFiles: string[],
                                             activeFile: string|null,
                                             terminals: [{ name, cwd: string|null }] }
editor.openFiles  {}                    -> { openFiles: string[] }        (parity with the fake)
editor.openFile   { path }              -> { opened: path }               (non-preview tab)
workspace.open    { path }              -> { opening: path }              (vscode.openFolder, same window)
terminal.create   { cwd, name? }        -> { created: <terminal name> }   (created and shown)
```

Events: `editor.fileOpened { path }`, `editor.fileClosed { path }`, `editor.activeChanged { path: string|null }` — file-scheme URIs only; untitled/virtual documents never leak.

Semantics worth stating:

- `workspace.open` reloads the editor window (that is how `vscode.openFolder` works), which kills the extension host mid-response. The command replies `{ opening }` *before* invoking it; the connector then disconnects and re-registers from the new window — the dev console shows exactly that lifecycle. Callers (phase 8) must treat it as fire-and-confirm-by-reconnect.
- Terminal `cwd` is read from `creationOptions` — knowable only for terminals created with an explicit cwd (including ours). Terminals opened by the user without one report `cwd: null`; we never shell out to discover more.
- Open files come from the tabs API (`window.tabGroups`), not just visible editors — background tabs count, matching what a human means by "my open files."

## What gets stored (privacy)

Nothing, anywhere. The extension holds no state and writes no files; it emits file *paths* and workspace/terminal *metadata* onto the bus — never file contents, terminal output, or keystrokes. What the hub-side recorder persists is governed by phase 5's rules; this phase adds no storage of its own.

## Error handling

| Failure | Behavior |
|---|---|
| Hub not running at editor launch | Activation completes instantly; SDK redials with backoff until the hub appears (criterion 7) |
| OmniBus app restarts | New port in `hub.json`; SDK re-reads and reconnects (criterion 5) |
| Command for a missing handler | SDK's built-in `ok: false, error: "no handler …"` response — also our probe-based round-trip proof |
| `editor.openFile` on a nonexistent path | `openTextDocument` rejects; SDK catches and replies `ok: false` with the message |
| `workspace.open` window reload | Expected lifecycle: reply first, then disconnect + re-register (documented above) |
| Extension deactivation / editor quit | `connector.close()` in `deactivate()`; hub sees a clean disconnect |
| Connect failure inside `activate` | Logged to an "OmniBus" output channel — never a modal, never a thrown activation error |

## Testing

- **State module (vitest, no `vscode` import):** file-scheme filtering, dedupe, first-folder selection, active-file null cases, terminal cwd passthrough — pure-function tests in `connectors/vscode/test/state.test.ts`.
- **Bundle:** `pnpm --filter omnibus-vscode build` must produce `dist/extension.js` with `vscode` as the only external.
- **Round-trip (mechanical):** headless hub with `--probe` + editor launched with the extension → probe response line from a real extension host (criterion 6).
- **Interactive walkthrough (criteria 1–5):** in Cursor via `--extensionDevelopmentPath`, against the running app.
- Existing suites untouched and green.

## Build order

1. `connectors/vscode` scaffold (manifest, esbuild, tsconfig, README) + `state.ts` + tests.
2. `extension.ts` adapter (connect wiring, handlers, event listeners, output channel, deactivate) + clean bundle.
3. Round-trip proof against the headless hub; interactive walkthrough in Cursor; docs (root README "Try it" + spec status).
