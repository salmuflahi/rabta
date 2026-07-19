# VS Code Connector (Phase 7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A real VS Code extension (`connectors/vscode`) that registers with the hub through the existing connector SDK: state reads, file/workspace opening, terminal creation, editor events.

**Architecture:** `state.ts` holds pure, tested mapping functions (never imports `vscode`); `extension.ts` is a thin adapter extracting plain data from the vscode API and wiring the SDK (fire-and-forget connect — activation never waits for the hub). esbuild bundles everything (SDK inlined, `vscode` external) into `dist/extension.js`.

**Tech Stack:** VS Code extension API (`@types/vscode ^1.85`), esbuild, vitest, existing `@omnibus/connector-sdk`.

**Spec:** `docs/superpowers/specs/2026-07-18-omnibus-vscode-connector-design.md` — read before starting. Foundation Principles / Coding standards / DoD + vision Privacy Principles bind every task.

## Global Constraints

- Hub, protocol, SDK, and fake connector are NOT modified in this phase.
- Capabilities declared: exactly `["workspace", "editor", "terminal"]`; connector `name: "vscode"`, `kind: "vscode"`.
- Command/event surface exactly as the spec's table: `workspace.state`, `editor.openFiles`, `editor.openFile{path}`, `workspace.open{path}` (reply BEFORE invoking openFolder), `terminal.create{cwd,name?}`; events `editor.fileOpened/fileClosed/activeChanged` with file-scheme paths only.
- `activate()` returns immediately (no await on connect); failures go to an "OmniBus" output channel, never a modal or thrown activation error; `deactivate()` calls `connector.close()`.
- The extension stores nothing and never reads file contents or terminal output.
- Bundle: CommonJS, `external: ["vscode"]` only. Builds warning-free; public functions documented; package README required.
- Environment: cargo NOT on default PATH (`export PATH="$HOME/.cargo/bin:$PATH"` — needed for `pnpm test`'s SDK suite); the editor on this machine is Cursor (`cursor` CLI); generous timeouts.

---

### Task 1: Extension scaffold + pure state module with tests

**Files:**
- Create: `connectors/vscode/{package.json, tsconfig.json, esbuild.mjs, README.md, .vscodeignore, src/state.ts}`
- Test: `connectors/vscode/test/state.test.ts`

**Interfaces:**
- Produces (Task 2 consumes): `state.ts` exports `UriLike { scheme, fsPath }`, `TerminalInfo { name, cwd: string|null }`, `SnapshotInput { workspaceFolders: string[], tabUris: UriLike[], activeUri: UriLike|null, terminals: TerminalInfo[] }`, `WorkspaceState { workspaceFolder: string|null, openFiles: string[], activeFile: string|null, terminals: TerminalInfo[] }`, `snapshotWorkspace(SnapshotInput) -> WorkspaceState`, `filePathOf(UriLike|null|undefined) -> string|null`.

- [ ] **Step 1: Scaffold + failing tests**

`connectors/vscode/package.json`:
```json
{
  "name": "omnibus-vscode",
  "displayName": "OmniBus Connector",
  "description": "Connects this editor to the local OmniBus hub.",
  "version": "0.1.0",
  "private": true,
  "publisher": "omnibus-dev",
  "engines": { "vscode": "^1.85.0" },
  "main": "./dist/extension.js",
  "activationEvents": ["onStartupFinished"],
  "contributes": {},
  "scripts": {
    "build": "node esbuild.mjs",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@omnibus/connector-sdk": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/vscode": "^1.85.0",
    "esbuild": "^0.24.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

`connectors/vscode/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src", "test"]
}
```

`connectors/vscode/esbuild.mjs`:
```js
// Bundles the extension: SDK + protocol inlined, `vscode` provided by the host.
import { build } from "esbuild";

await build({
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["vscode"],
  sourcemap: true,
});
```

`connectors/vscode/.vscodeignore`:
```
src/
test/
esbuild.mjs
tsconfig.json
node_modules/
```

`connectors/vscode/README.md`: what it is (the real VS Code/Cursor connector; replaces nothing — the fake stays as the SDK reference), how to build (`pnpm --filter omnibus-vscode build`), how to run in development:
```sh
cursor --extensionDevelopmentPath="$PWD/connectors/vscode" /path/to/a/repo
```
and how to run tests (`pnpm --filter omnibus-vscode test`).

`connectors/vscode/test/state.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { filePathOf, snapshotWorkspace } from "../src/state";

const uri = (scheme: string, fsPath: string) => ({ scheme, fsPath });

describe("snapshotWorkspace", () => {
  it("keeps only file-scheme tabs, deduped, in order", () => {
    const state = snapshotWorkspace({
      workspaceFolders: ["/repo"],
      tabUris: [
        uri("file", "/repo/a.ts"),
        uri("untitled", "Untitled-1"),
        uri("file", "/repo/b.ts"),
        uri("file", "/repo/a.ts"),
        uri("vscode-userdata", "/settings.json"),
      ],
      activeUri: uri("file", "/repo/b.ts"),
      terminals: [],
    });
    expect(state.openFiles).toEqual(["/repo/a.ts", "/repo/b.ts"]);
    expect(state.activeFile).toBe("/repo/b.ts");
  });

  it("uses the first workspace folder and null when none", () => {
    expect(
      snapshotWorkspace({ workspaceFolders: ["/one", "/two"], tabUris: [], activeUri: null, terminals: [] })
        .workspaceFolder
    ).toBe("/one");
    expect(
      snapshotWorkspace({ workspaceFolders: [], tabUris: [], activeUri: null, terminals: [] })
        .workspaceFolder
    ).toBeNull();
  });

  it("active file is null for non-file schemes", () => {
    const state = snapshotWorkspace({
      workspaceFolders: [],
      tabUris: [],
      activeUri: uri("untitled", "Untitled-1"),
      terminals: [],
    });
    expect(state.activeFile).toBeNull();
  });

  it("passes terminal info through untouched", () => {
    const terminals = [
      { name: "zsh", cwd: "/repo" },
      { name: "task", cwd: null },
    ];
    expect(
      snapshotWorkspace({ workspaceFolders: [], tabUris: [], activeUri: null, terminals }).terminals
    ).toEqual(terminals);
  });
});

describe("filePathOf", () => {
  it("returns the path for file URIs and null otherwise", () => {
    expect(filePathOf(uri("file", "/repo/a.ts"))).toBe("/repo/a.ts");
    expect(filePathOf(uri("untitled", "x"))).toBeNull();
    expect(filePathOf(null)).toBeNull();
    expect(filePathOf(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm install && pnpm --filter omnibus-vscode test`
Expected: FAIL — cannot resolve `../src/state`.

- [ ] **Step 3: Implement `connectors/vscode/src/state.ts`**

```ts
/** A URI reduced to the two fields state mapping needs; matches vscode.Uri structurally. */
export interface UriLike {
  scheme: string;
  fsPath: string;
}

/** Terminal metadata: cwd is knowable only when the terminal was created with one. */
export interface TerminalInfo {
  name: string;
  cwd: string | null;
}

/** Plain-data snapshot of the editor, extracted by the adapter layer. */
export interface SnapshotInput {
  workspaceFolders: string[];
  tabUris: UriLike[];
  activeUri: UriLike | null;
  terminals: TerminalInfo[];
}

/** The `workspace.state` wire shape (see phase 7 spec). */
export interface WorkspaceState {
  workspaceFolder: string | null;
  openFiles: string[];
  activeFile: string | null;
  terminals: TerminalInfo[];
}

/**
 * Maps raw editor data to the wire state: file-scheme tabs only, deduped in
 * first-seen order; first workspace folder wins; non-file active editors
 * report null.
 */
export function snapshotWorkspace(input: SnapshotInput): WorkspaceState {
  const openFiles = [
    ...new Set(input.tabUris.filter((u) => u.scheme === "file").map((u) => u.fsPath)),
  ];
  return {
    workspaceFolder: input.workspaceFolders[0] ?? null,
    openFiles,
    activeFile: filePathOf(input.activeUri),
    terminals: input.terminals,
  };
}

/** File-scheme guard used by event emitters: path for real files, null otherwise. */
export function filePathOf(uri: UriLike | null | undefined): string | null {
  return uri && uri.scheme === "file" ? uri.fsPath : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter omnibus-vscode test` — 6 tests PASS.
Run: `pnpm --filter omnibus-vscode typecheck` — clean.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: vscode connector scaffold with pure, tested state module"
```

---

### Task 2: Extension adapter + bundle

**Files:**
- Create: `connectors/vscode/src/extension.ts`

**Interfaces:**
- Consumes: Task 1's `state.ts` exports; `connect(opts, setup)` / `Connector.onCommand/emit/close/connectorId` from `@omnibus/connector-sdk`; the `vscode` API.
- Produces: `dist/extension.js` (built artifact, git-ignored) exposing `activate`/`deactivate`; the live command/event surface from the spec.

- [ ] **Step 1: Implement `connectors/vscode/src/extension.ts`**

```ts
import * as vscode from "vscode";
import { connect, type Connector } from "@omnibus/connector-sdk";
import {
  filePathOf,
  snapshotWorkspace,
  type TerminalInfo,
  type UriLike,
} from "./state";

let connector: Connector | undefined;

/** Extracts plain data from the vscode API for the pure state module. */
function snapshot() {
  const tabUris: UriLike[] = vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .map((tab) => (tab.input instanceof vscode.TabInputText ? tab.input.uri : null))
    .filter((uri): uri is vscode.Uri => uri !== null)
    .map((uri) => ({ scheme: uri.scheme, fsPath: uri.fsPath }));
  const active = vscode.window.activeTextEditor?.document.uri;
  return snapshotWorkspace({
    workspaceFolders: (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath),
    tabUris,
    activeUri: active ? { scheme: active.scheme, fsPath: active.fsPath } : null,
    terminals: vscode.window.terminals.map(terminalInfo),
  });
}

/** cwd is knowable only for terminals created with an explicit one. */
function terminalInfo(terminal: vscode.Terminal): TerminalInfo {
  const cwd = (terminal.creationOptions as vscode.TerminalOptions).cwd;
  return {
    name: terminal.name,
    cwd: typeof cwd === "string" ? cwd : cwd instanceof vscode.Uri ? cwd.fsPath : null,
  };
}

/**
 * Fire-and-forget connection: activation must never wait for the hub
 * (spec criterion 7). Handlers are registered before dialing via `setup`;
 * events emitted before the connection lands are deliberately dropped.
 */
export function activate(context: vscode.ExtensionContext): void {
  const out = vscode.window.createOutputChannel("OmniBus");

  connect(
    { name: "vscode", kind: "vscode", capabilities: ["workspace", "editor", "terminal"] },
    (c) => {
      c.onCommand("workspace.state", () => snapshot());
      c.onCommand("editor.openFiles", () => ({ openFiles: snapshot().openFiles }));
      c.onCommand("editor.openFile", async (args) => {
        const { path } = args as { path: string };
        const doc = await vscode.workspace.openTextDocument(path);
        await vscode.window.showTextDocument(doc, { preview: false });
        return { opened: path };
      });
      c.onCommand("workspace.open", (args) => {
        const { path } = args as { path: string };
        // Reply first — openFolder reloads the window and kills this
        // extension host; the connector re-registers from the new window.
        setTimeout(() => {
          void vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(path), {
            forceNewWindow: false,
          });
        }, 50);
        return { opening: path };
      });
      c.onCommand("terminal.create", (args) => {
        const { cwd, name } = args as { cwd: string; name?: string };
        const terminal = vscode.window.createTerminal({ cwd, name });
        terminal.show();
        return { created: terminal.name };
      });
    }
  )
    .then((c) => {
      connector = c;
      out.appendLine(`connected to OmniBus as ${c.connectorId}`);
    })
    .catch((e) => out.appendLine(`OmniBus connection failed: ${e}`));

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      const path = filePathOf(doc.uri);
      if (path) connector?.emit("editor.fileOpened", { path });
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      const path = filePathOf(doc.uri);
      if (path) connector?.emit("editor.fileClosed", { path });
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      connector?.emit("editor.activeChanged", {
        path: filePathOf(editor?.document.uri ?? null),
      });
    }),
    out
  );
}

/** Clean disconnect so the hub sees the editor leave immediately. */
export function deactivate(): void {
  connector?.close();
}
```

- [ ] **Step 2: Verify bundle + types + suites**

Run: `pnpm --filter omnibus-vscode typecheck` — clean.
Run: `pnpm --filter omnibus-vscode build` — produces `connectors/vscode/dist/extension.js`; confirm `vscode` is the only external: `grep -c 'require("vscode")' connectors/vscode/dist/extension.js` ≥ 1 and `grep -c 'require("ws")' connectors/vscode/dist/extension.js` = 0 (ws must be inlined).
Add `connectors/vscode/dist/` to the root `.gitignore`.
Run: `export PATH="$HOME/.cargo/bin:$PATH" && pnpm test && cargo test` — all green.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: vscode extension adapter bundling the connector SDK"
```

---

### Task 3: Round-trip proof, interactive walkthrough, docs

(Controller-run: needs the GUI and the Cursor editor.)

- [ ] **Step 1: Mechanical round-trip (spec criterion 6)** — run the headless hub with `--probe` and `OMNIBUS_DATA_DIR="$HOME/Library/Application Support/com.omnibus.dev"` (so the extension's default discovery finds it); launch `cursor --extensionDevelopmentPath="$PWD/connectors/vscode" <some repo>`; expect a `{"probe": ...}` line — an `ok:false` "no handler" response from the real extension host proves routing.
- [ ] **Step 2: Interactive walkthrough (criteria 1–5, 7)** — with the OmniBus app running instead: `vscode` connector green with capabilities; events on file open/close; app restart → reconnect; editor launch with no hub → instant activation, late connect.
- [ ] **Step 3: Docs** — root README "Try it" gains the extension launch line; spec **Status:** → `Implemented`. Commit: `docs: vscode connector walkthrough; phase 7 success criteria verified`.

---

## Self-review notes

- Spec coverage: scaffold/bundling/README (T1), pure state module + 6 tests (T1), all five commands + three events + fire-and-forget activation + deactivate close (T2), bundle externals check (T2), probe round-trip + walkthrough + docs (T3). Privacy: no storage, paths only — no code path reads file contents or terminal output.
- Type consistency: `SnapshotInput`/`WorkspaceState`/`TerminalInfo`/`UriLike` (T1) are exactly what `extension.ts` (T2) imports; wire shapes match the spec table; `connect(opts, setup)` usage matches the SDK contract from phase 4/8 of the foundation work.
- `tab.input instanceof vscode.TabInputText` covers text tabs only — custom editors/diff tabs are deliberately excluded from `openFiles` in this phase (matches "open file paths" per privacy examples; diff/custom tabs are phase-8 questions).
- The 50 ms reply-before-openFolder delay is a pragmatic flush window, documented inline; phase 8 must treat `workspace.open` as fire-and-confirm-by-reconnect regardless (spec).
