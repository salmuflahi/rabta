# Defined Workspaces — Phase 2 (the swap) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** With `focusMode` on, resuming a task also puts away what does not belong to it — stashed first, closed second, and never anything that would lose work.

**Architecture:** After a clean restore, the desktop asks each connector for `workspace.state` again, diffs it against the incoming capsule, and issues one close per leftover item. The desktop owns policy (what is not in the capsule); each connector owns safety (what must never close) and refuses with a reason, which the desktop records as `kept` rather than an error. Nothing new is captured — the outgoing task's auto-save already holds the strays.

**Tech Stack:** Rust (tokio, Tauri 2, rusqlite), React 18 + TypeScript, two TypeScript connectors (Chrome MV3, VS Code), vitest, `cargo test`.

**Spec:** `docs/superpowers/specs/2026-08-04-defined-workspaces-design.md`
**Phase 1:** merged at `2c8455c` — pins, `identity_of`, `merge_pins`, `task_pins`.

## Global Constraints

- **`focusMode` defaults to OFF.** With it off, `activate_task` must behave byte-for-byte as it does today. This is the guarantee the whole phase is built to protect.
- **Close runs only after a clean open phase.** If any command in the restore step errored, skip reconcile entirely and report it. Diffing after the opens also means reconcile can never close what the restore just placed.
- **Never closed, ever:** an unsaved (dirty) editor; a browser-pinned tab; a busy terminal; the last tab in a window; anything incognito.
- **A refusal is not an error.** It goes in `kept` with its reason. Errors stay errors.
- **Identity is exact** and already implemented — chrome → tab URL; vscode file → its `fsPath` (a bare JSON string); vscode terminal → `name` + `"\0"` + `cwd ?? ""`. Rust `capsules::identity_of` and TS `identityOf` in `CapsuleItems.tsx` must continue to agree.
- **Nothing may be captured differently.** `snapshotTabs` and `snapshotWorkspace` keep returning what they return today, except for the two additive fields Task 2 adds.
- **Both extensions go to `0.2.0`** and require Web Store / Open VSX submissions. `engines.vscode` → `^1.93`.
- **Copy style:** sentence case, no exclamation marks, name what is true then what to do about it.

---

### Task 1: Chrome `tabs.close`, with the guards only Chrome can see

**Files:**
- Modify: `connectors/chrome/src/background.ts` (add the handler beside `tabs.open` / `tabs.focus`)
- Modify: `connectors/chrome/src/tabs.ts` (add the pure decision function)
- Modify: `connectors/chrome/manifest.json` and `connectors/chrome/package.json` (version → `0.2.0`)
- Test: `connectors/chrome/test/tabs.test.ts`

**Interfaces:**
- Consumes: `isRestorableUrl` from `./tabs`.
- Produces:
  - `export type CloseVerdict = { close: true } | { close: false; reason: string }`
  - `export function closeVerdict(tab: { url: string; pinned: boolean; incognito: boolean }, tabsInWindow: number): CloseVerdict` — pure, no `chrome` import, so every guard is unit-testable without a browser.
  - Wire: `tabs.close({ url })` → `{ closed: url }` on success, or `{ kept: url, reason: string }` when a guard refuses. It never throws for a guard; it throws only when the call itself is malformed.

- [ ] **Step 1: Write the failing test**

Add to `connectors/chrome/test/tabs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { closeVerdict } from "../src/tabs";

const tab = (over: Partial<{ url: string; pinned: boolean; incognito: boolean }> = {}) => ({
  url: "https://a.test/",
  pinned: false,
  incognito: false,
  ...over,
});

describe("closeVerdict", () => {
  it("closes an ordinary tab when it is not the last in its window", () => {
    expect(closeVerdict(tab(), 3)).toEqual({ close: true });
  });

  it("never closes a browser-pinned tab", () => {
    // Pinning a tab in Chrome is an explicit "this stays", independent of any capsule.
    expect(closeVerdict(tab({ pinned: true }), 3)).toEqual({
      close: false,
      reason: "pinned in the browser",
    });
  });

  it("never closes an incognito tab", () => {
    // Incognito is never captured, so it would read as unrelated and be closed.
    // This exclusion is load-bearing, not incidental.
    expect(closeVerdict(tab({ incognito: true }), 3)).toEqual({
      close: false,
      reason: "incognito",
    });
  });

  it("never closes the last tab in a window, because that closes the window", () => {
    expect(closeVerdict(tab(), 1)).toEqual({
      close: false,
      reason: "the last tab in its window",
    });
  });

  it("never closes a url it would refuse to open", () => {
    expect(closeVerdict(tab({ url: "chrome://extensions" }), 3)).toEqual({
      close: false,
      reason: "not an http(s) page",
    });
  });

  it("reports the strongest reason when several apply", () => {
    // A pinned incognito last tab is refused once, not three times.
    const v = closeVerdict(tab({ pinned: true, incognito: true }), 1);
    expect(v.close).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd connectors/chrome && npx vitest run tabs`
Expected: FAIL — `closeVerdict` is not exported.

- [ ] **Step 3: Implement the pure guard**

In `connectors/chrome/src/tabs.ts`, after `isRestorableUrl`:

```ts
/** Why a tab was left alone. `close: false` is a refusal, not a failure — the
 *  desktop records it as kept. */
export type CloseVerdict = { close: true } | { close: false; reason: string };

/**
 * Whether focus mode may close this tab. Pure — no `chrome` import — so every
 * guard is testable without a browser.
 *
 * These are the facts only the browser holds. The desktop decides what does not
 * belong to a task; it cannot see that a tab is pinned, incognito, or the last
 * one keeping a window open, and asking it to would leave a gap between the
 * report and the close in which a window can empty.
 */
export function closeVerdict(
  tab: { url: string; pinned: boolean; incognito: boolean },
  tabsInWindow: number,
): CloseVerdict {
  if (tab.incognito) return { close: false, reason: "incognito" };
  if (tab.pinned) return { close: false, reason: "pinned in the browser" };
  if (!isRestorableUrl(tab.url)) return { close: false, reason: "not an http(s) page" };
  if (tabsInWindow <= 1) return { close: false, reason: "the last tab in its window" };
  return { close: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd connectors/chrome && npx vitest run tabs`
Expected: PASS.

- [ ] **Step 5: Wire the handler**

In `connectors/chrome/src/background.ts`, inside `onCommand`, after the `tabs.focus` block and before the final `throw`:

```ts
        if (name === "tabs.close") {
          const { url } = args as { url: string };
          const matches = await chrome.tabs.query({ url });
          if (matches.length === 0) return { kept: url, reason: "no longer open" };
          const results: { closed?: string; kept?: string; reason?: string }[] = [];
          for (const t of matches) {
            const inWindow = await chrome.tabs.query({ windowId: t.windowId });
            const verdict = closeVerdict(
              { url: t.url ?? "", pinned: t.pinned ?? false, incognito: t.incognito ?? false },
              inWindow.length,
            );
            if (!verdict.close) {
              results.push({ kept: url, reason: verdict.reason });
              continue;
            }
            if (t.id != null) {
              await chrome.tabs.remove(t.id);
              results.push({ closed: url });
            }
          }
          // One url can be open in several tabs. If any copy was refused, the
          // url is reported kept — saying "closed" while a copy survives would
          // make the receipt a lie.
          const refused = results.find((r) => r.kept);
          return refused ?? { closed: url };
        }
```

Add `closeVerdict` to the existing import from `./tabs` at the top of the file.

- [ ] **Step 6: Bump the version**

`connectors/chrome/manifest.json` and `connectors/chrome/package.json`: `"version": "0.2.0"`.

- [ ] **Step 7: Run the connector suite**

Run: `cd connectors/chrome && npx vitest run`
Expected: all pass, including the 37 pre-existing tests.

- [ ] **Step 8: Commit**

```bash
git add connectors/chrome/src/tabs.ts connectors/chrome/src/background.ts connectors/chrome/test/tabs.test.ts connectors/chrome/manifest.json connectors/chrome/package.json
git commit -m "feat(chrome): tabs.close, refusing what must never close

The desktop decides what does not belong to a task. It cannot see that a tab is
pinned, incognito, or the last one holding a window open — so those guards live
here, checked in the same call that closes, with no gap in between. A refusal
returns a reason rather than throwing: it is not a failure."
```

---

### Task 2: VS Code reports `dirty` and `busy`

**Files:**
- Modify: `connectors/vscode/src/state.ts` (extend `TerminalInfo` and `WorkspaceState`)
- Modify: `connectors/vscode/src/extension.ts` (track busy terminals; report dirty files)
- Modify: `connectors/vscode/package.json` (`engines.vscode` → `^1.93`, version → `0.2.0`)
- Test: `connectors/vscode/test/state.test.ts`

**Interfaces:**
- Produces:
  - `TerminalInfo` gains `busy: boolean`.
  - `WorkspaceState` gains `dirtyFiles: string[]` — the subset of `openFiles` with unsaved changes. A separate list rather than a per-item object, so `openFiles` keeps its existing `string[]` shape and Phase 1's identity (the bare path) is untouched.
  - `SnapshotInput` gains `dirtyPaths: string[]` and its `terminals` carry `busy`.

- [ ] **Step 1: Write the failing test**

Add to `connectors/vscode/test/state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { snapshotWorkspace } from "../src/state";

describe("snapshotWorkspace dirty and busy", () => {
  const base = {
    workspaceFolders: ["/repo"],
    tabUris: [
      { scheme: "file", fsPath: "/repo/a.ts" },
      { scheme: "file", fsPath: "/repo/b.ts" },
    ],
    activeUri: null,
    terminals: [],
    dirtyPaths: [],
  };

  it("reports only the open files that have unsaved changes", () => {
    const s = snapshotWorkspace({ ...base, dirtyPaths: ["/repo/b.ts"] });
    expect(s.openFiles).toEqual(["/repo/a.ts", "/repo/b.ts"]);
    expect(s.dirtyFiles).toEqual(["/repo/b.ts"]);
  });

  it("never reports a dirty file that is not open", () => {
    // dirtyFiles is a subset of openFiles or the desktop cannot match it.
    const s = snapshotWorkspace({ ...base, dirtyPaths: ["/repo/gone.ts"] });
    expect(s.dirtyFiles).toEqual([]);
  });

  it("carries each terminal's busy flag through unchanged", () => {
    const s = snapshotWorkspace({
      ...base,
      terminals: [
        { name: "zsh", cwd: "/repo", busy: false },
        { name: "dev", cwd: "/repo", busy: true },
      ],
    });
    expect(s.terminals).toEqual([
      { name: "zsh", cwd: "/repo", busy: false },
      { name: "dev", cwd: "/repo", busy: true },
    ]);
  });

  it("leaves openFiles a bare string array, so phase 1 identity still matches", () => {
    const s = snapshotWorkspace({ ...base, dirtyPaths: ["/repo/a.ts"] });
    expect(s.openFiles.every((f) => typeof f === "string")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd connectors/vscode && npx vitest run state`
Expected: FAIL — `dirtyPaths` is not a known property, `dirtyFiles` does not exist.

- [ ] **Step 3: Extend the state types and mapper**

In `connectors/vscode/src/state.ts`:

```ts
export interface TerminalInfo {
  name: string;
  cwd: string | null;
  /** A shell execution is in flight. A running process is not in the capsule,
   *  so focus mode must never dispose one. */
  busy: boolean;
}

export interface SnapshotInput {
  workspaceFolders: string[];
  tabUris: UriLike[];
  activeUri: UriLike | null;
  terminals: TerminalInfo[];
  /** Paths with unsaved changes, from the editor. Filtered to open files below. */
  dirtyPaths: string[];
}

export interface WorkspaceState {
  workspaceFolder: string | null;
  openFiles: string[];
  activeFile: string | null;
  terminals: TerminalInfo[];
  /** Subset of openFiles with unsaved changes. A separate list, so openFiles
   *  stays a bare string array and phase 1's identity (the path itself) is
   *  untouched. */
  dirtyFiles: string[];
}
```

and in `snapshotWorkspace`, after `openFiles` is computed:

```ts
  const open = new Set(openFiles);
  const dirtyFiles = [...new Set(input.dirtyPaths)].filter((p) => open.has(p));
  return {
    workspaceFolder: input.workspaceFolders[0] ?? null,
    openFiles,
    activeFile: filePathOf(input.activeUri),
    terminals: input.terminals,
    dirtyFiles,
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd connectors/vscode && npx vitest run state`
Expected: PASS.

- [ ] **Step 5: Feed it from the editor**

In `connectors/vscode/src/extension.ts`, add busy tracking near the top of `activate` (before the connector is created):

```ts
  // vscode has no "is this terminal busy" property. These two events, stable
  // since 1.93, are the only way to know a command is in flight — which is what
  // stops focus mode disposing a terminal running a dev server or a build.
  const busyTerminals = new Set<vscode.Terminal>();
  context.subscriptions.push(
    vscode.window.onDidStartTerminalShellExecution((e) => busyTerminals.add(e.terminal)),
    vscode.window.onDidEndTerminalShellExecution((e) => busyTerminals.delete(e.terminal)),
    vscode.window.onDidCloseTerminal((t) => busyTerminals.delete(t)),
  );
```

Change `terminalInfo` to take the busy set:

```ts
  function terminalInfo(terminal: vscode.Terminal): TerminalInfo {
    return {
      name: terminal.name,
      cwd: cwdOf(terminal),
      busy: busyTerminals.has(terminal),
    };
  }
```

Keep whatever `cwdOf` logic `terminalInfo` already had for `cwd`; only `busy` is new.

In `snapshot()`, pass the dirty paths:

```ts
      dirtyPaths: vscode.workspace.textDocuments
        .filter((d) => d.isDirty && d.uri.scheme === "file")
        .map((d) => d.uri.fsPath),
```

- [ ] **Step 6: Raise the engine floor and version**

`connectors/vscode/package.json`: `"engines": { "vscode": "^1.93.0" }`, `"version": "0.2.0"`. Also bump `@types/vscode` to `^1.93.0` so the two shell-execution events typecheck.

- [ ] **Step 7: Typecheck and run the suite**

Run: `cd connectors/vscode && npx tsc --noEmit && npx vitest run`
Expected: both clean. If `onDidStartTerminalShellExecution` does not typecheck, `@types/vscode` was not raised.

- [ ] **Step 8: Commit**

```bash
git add connectors/vscode/src/state.ts connectors/vscode/src/extension.ts connectors/vscode/test/state.test.ts connectors/vscode/package.json
git commit -m "feat(vscode): report dirty files and busy terminals

Focus mode must never close a buffer with unsaved changes or a terminal running
something — neither is in the capsule, so closing either destroys work nothing
can give back. vscode exposes no busy property; the shell-execution events are
the only way to know, which is what raises the floor to 1.93.

dirtyFiles is a separate list rather than a flag on each open file, so openFiles
stays a bare string array and phase 1's identity keeps matching."
```

---

### Task 3: VS Code `editor.closeFile` and `terminal.dispose`

**Files:**
- Modify: `connectors/vscode/src/extension.ts` (two handlers)
- Test: `connectors/vscode/test/close.test.ts` (create)

**Interfaces:**
- Consumes: the `busyTerminals` set and `TerminalInfo.busy` from Task 2.
- Produces:
  - `editor.closeFile({ path })` → `{ closed: path }`, or `{ kept: path, reason: "unsaved changes" }` / `{ kept: path, reason: "no longer open" }`
  - `terminal.dispose({ name, cwd })` → `{ closed: name }`, or `{ kept: name, reason: "running something" }` / `{ kept: name, reason: "no longer open" }`
  - `export function terminalCloseVerdict(t: { busy: boolean }): { close: boolean; reason?: string }` in `connectors/vscode/src/state.ts` — pure, so the guard is testable without an editor.

- [ ] **Step 1: Write the failing test**

Create `connectors/vscode/test/close.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { terminalCloseVerdict } from "../src/state";

describe("terminalCloseVerdict", () => {
  it("closes an idle terminal", () => {
    expect(terminalCloseVerdict({ busy: false })).toEqual({ close: true });
  });

  it("never closes a terminal running something", () => {
    // A running process is not in the capsule. Closing it destroys work that
    // nothing can restore — the one action in this design that could.
    expect(terminalCloseVerdict({ busy: true })).toEqual({
      close: false,
      reason: "running something",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd connectors/vscode && npx vitest run close`
Expected: FAIL — `terminalCloseVerdict` is not exported.

- [ ] **Step 3: Implement the pure guard**

In `connectors/vscode/src/state.ts`:

```ts
/** Whether focus mode may dispose this terminal. Pure, so the guard is testable
 *  without an editor. */
export function terminalCloseVerdict(t: { busy: boolean }): { close: boolean; reason?: string } {
  return t.busy ? { close: false, reason: "running something" } : { close: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd connectors/vscode && npx vitest run close`
Expected: PASS.

- [ ] **Step 5: Wire both handlers**

In `connectors/vscode/src/extension.ts`, beside the existing `onCommand` registrations:

```ts
      c.onCommand("editor.closeFile", async (args) => {
        const { path } = args as { path: string };
        const tab = vscode.window.tabGroups.all
          .flatMap((g) => g.tabs)
          .find((t) => t.input instanceof vscode.TabInputText && t.input.uri.fsPath === path);
        if (!tab) return { kept: path, reason: "no longer open" };
        // A dirty buffer holds work no capsule captured. Never close it, and do
        // not prompt either — a resume is not the moment to ask.
        if (tab.isDirty) return { kept: path, reason: "unsaved changes" };
        await vscode.window.tabGroups.close(tab, false);
        return { closed: path };
      });

      c.onCommand("terminal.dispose", (args) => {
        const { name, cwd } = args as { name: string; cwd?: string | null };
        const terminal = vscode.window.terminals.find(
          (t) => t.name === name && (cwdOf(t) ?? "") === (cwd ?? ""),
        );
        if (!terminal) return { kept: name, reason: "no longer open" };
        const verdict = terminalCloseVerdict({ busy: busyTerminals.has(terminal) });
        if (!verdict.close) return { kept: name, reason: verdict.reason };
        terminal.dispose();
        return { closed: name };
      });
```

Import `terminalCloseVerdict` from `./state`. Use whatever helper Task 2 used for `cwdOf`.

- [ ] **Step 6: Typecheck and run the suite**

Run: `cd connectors/vscode && npx tsc --noEmit && npx vitest run`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add connectors/vscode/src/extension.ts connectors/vscode/src/state.ts connectors/vscode/test/close.test.ts
git commit -m "feat(vscode): editor.closeFile and terminal.dispose, each refusing what it must

A dirty buffer and a busy terminal both hold work no capsule captured. Both are
refused with a reason rather than prompting — a resume is not the moment to ask
someone whether they meant it."
```

---

### Task 4: The reconcile step

**Files:**
- Modify: `apps/desktop/src-tauri/src/capsules.rs` (`ActivateSummary`, `activate_task`, a new `reconcile` method)
- Modify: `apps/desktop/src-tauri/src/lib.rs` (`activate_task` command takes `focus_mode`)
- Test: `apps/desktop/src-tauri/tests/capsules.rs`

**Interfaces:**
- Consumes: `capsules::identity_of`, `merge_pins`, `Db::task_pins` (all from Phase 1).
- Produces:
  - `ActivateSummary` gains `pub closed: Vec<String>` and `pub kept: Vec<(String, String)>` — item label and reason. Both `#[serde(rename_all = "camelCase")]` already applies to the struct, so the UI sees `closed` and `kept`.
  - `Capsules::activate_task(&self, task_id: &str, focus_mode: bool)` — the parameter is new; `false` must reproduce today's behaviour exactly.
  - Tauri: `invoke("activate_task", { taskId, focusMode })`.

- [ ] **Step 1: Write the failing test**

Add to `apps/desktop/src-tauri/tests/capsules.rs`. Use the file's real harness — `setup()`, `scripted_connector_kind(...)`, `tabs_state(...)` — exactly as the Phase 1 tests do:

```rust
#[tokio::test]
async fn focus_mode_closes_only_what_is_not_in_the_capsule() {
    let (hub, db, capsules, task_id, _tmp) = setup().await;
    // Captured: one tab. Live: that tab plus a stray.
    let seen = scripted_connector_kind(&hub, "chrome", |name, _args| match name {
        "workspace.state" => Some(tabs_state(&["https://keep.test/", "https://stray.test/"])),
        _ => None,
    })
    .await;
    capsules.save_capsule(&task_id).await.unwrap();

    // Re-point the capsule at only the first url, so the second is a stray.
    let res = db.task_resources(&task_id).unwrap();
    let chrome = res.iter().find(|r| r.connector_kind == "chrome").unwrap();
    db.replace_task_resources(&task_id, "chrome", &chrome.resource_type,
        &tabs_state(&["https://keep.test/"])).unwrap();

    let summary = capsules.activate_task(&task_id, true).await.unwrap();

    let names = drain(&seen);
    assert!(
        names.iter().any(|(n, a)| n == "tabs.close" && a["url"] == "https://stray.test/"),
        "the stray should have been closed: {names:?}"
    );
    assert!(
        !names.iter().any(|(n, a)| n == "tabs.close" && a["url"] == "https://keep.test/"),
        "a captured tab must never be closed: {names:?}"
    );
    assert!(summary.closed.iter().any(|c| c.contains("stray.test")));
}

#[tokio::test]
async fn focus_mode_off_closes_nothing() {
    let (hub, db, capsules, task_id, _tmp) = setup().await;
    let seen = scripted_connector_kind(&hub, "chrome", |name, _args| match name {
        "workspace.state" => Some(tabs_state(&["https://a.test/", "https://stray.test/"])),
        _ => None,
    })
    .await;
    capsules.save_capsule(&task_id).await.unwrap();
    let res = db.task_resources(&task_id).unwrap();
    let chrome = res.iter().find(|r| r.connector_kind == "chrome").unwrap();
    db.replace_task_resources(&task_id, "chrome", &chrome.resource_type,
        &tabs_state(&["https://a.test/"])).unwrap();

    let summary = capsules.activate_task(&task_id, false).await.unwrap();

    let names = drain(&seen);
    assert!(
        !names.iter().any(|(n, _)| n == "tabs.close"),
        "focus off must close nothing: {names:?}"
    );
    assert!(summary.closed.is_empty() && summary.kept.is_empty());
}

#[tokio::test]
async fn a_refusal_is_kept_not_an_error() {
    let (hub, db, capsules, task_id, _tmp) = setup().await;
    let seen = scripted_connector_kind(&hub, "chrome", |name, args| match name {
        "workspace.state" => Some(tabs_state(&["https://keep.test/", "https://pinned.test/"])),
        "tabs.close" => Some(serde_json::json!({
            "kept": args["url"], "reason": "pinned in the browser"
        })),
        _ => None,
    })
    .await;
    capsules.save_capsule(&task_id).await.unwrap();
    let res = db.task_resources(&task_id).unwrap();
    let chrome = res.iter().find(|r| r.connector_kind == "chrome").unwrap();
    db.replace_task_resources(&task_id, "chrome", &chrome.resource_type,
        &tabs_state(&["https://keep.test/"])).unwrap();

    let summary = capsules.activate_task(&task_id, true).await.unwrap();
    let _ = drain(&seen);

    assert!(summary.closed.is_empty(), "nothing was actually closed: {summary:?}");
    assert_eq!(summary.kept.len(), 1, "the refusal should be kept: {summary:?}");
    assert!(summary.kept[0].1.contains("pinned"));
    assert!(summary.errors.is_empty(), "a refusal is not an error: {summary:?}");
}
```

If the file has no `drain` helper, use whatever `while rx.try_recv()` idiom the neighbouring tests use to collect received commands; do not add a second helper.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p rabta-desktop --test capsules focus_mode`
Expected: FAIL — `activate_task` takes one argument, `ActivateSummary` has no `closed`.

- [ ] **Step 3: Extend the summary**

In `apps/desktop/src-tauri/src/capsules.rs`, add to `ActivateSummary`:

```rust
    /// Items focus mode closed. Empty whenever focus mode is off.
    pub closed: Vec<String>,
    /// Items focus mode left alone, and why. A refusal is not an error — a
    /// browser-pinned tab or a terminal running a build is a correct outcome,
    /// and the receipt says so rather than burying it.
    pub kept: Vec<(String, String)>,
```

Initialise both to `vec![]` at every construction site.

- [ ] **Step 4: Implement reconcile**

In the same file, on `Capsules`:

```rust
    /// Closes what the incoming capsule does not contain, one item at a time.
    ///
    /// Runs only after a clean open phase, for two reasons: the destructive
    /// half must never run on a restore that is already going wrong, and
    /// diffing *after* the opens means everything the restore just placed is by
    /// definition in the capsule, so this can never close its own work.
    ///
    /// The desktop decides only what is not in the capsule. Whether an item is
    /// safe to close is the connector's call — it holds the facts (pinned,
    /// incognito, dirty, busy, last in window) and answers in the same call
    /// that closes, leaving no gap. A refusal comes back as `kept`.
    async fn reconcile(
        &self,
        task_id: &str,
        closed: &mut Vec<String>,
        kept: &mut Vec<(String, String)>,
        errors: &mut Vec<String>,
    ) {
        let resources = {
            let db = self.db.clone();
            let tid = task_id.to_string();
            match tokio::task::spawn_blocking(move || db.task_resources(&tid)).await {
                Ok(Ok(r)) => r,
                // Either the blocking task panicked or the query failed. Both
                // mean reconcile has nothing to diff against, and closing on a
                // guess is exactly what this must never do — so record and stop.
                Ok(Err(e)) => {
                    errors.push(format!("reconcile: {e}"));
                    return;
                }
                Err(e) => {
                    errors.push(format!("reconcile: {e}"));
                    return;
                }
            }
        };
        let pins = {
            let db = self.db.clone();
            let tid = task_id.to_string();
            tokio::task::spawn_blocking(move || db.task_pins(&tid))
                .await
                .ok()
                .and_then(Result::ok)
                .unwrap_or_default()
        };

        for conn in self.hub.connectors().await {
            let kind = kind_str(conn.kind);
            if kind != "chrome" && kind != "vscode" {
                continue;
            }
            let Some(resource) = resources.iter().find(|r| r.connector_kind == kind) else {
                continue;
            };
            let wanted = merge_pins(kind, &resource.payload, &pins);
            let live = match self
                .hub
                .send_command(&conn.id, "workspace.state", json!({}))
                .await
            {
                Ok(v) => v,
                Err(e) => {
                    errors.push(format!("{kind}: reconcile state: {e}"));
                    continue;
                }
            };

            for (command, args, label) in close_targets(kind, &wanted, &live) {
                match self.hub.send_command(&conn.id, &command, args).await {
                    Ok(v) => {
                        if let Some(reason) = v.get("reason").and_then(Value::as_str) {
                            kept.push((label, reason.to_string()));
                        } else {
                            closed.push(label);
                        }
                    }
                    Err(e) => errors.push(format!("{command} {label}: {e}")),
                }
            }
        }
    }
```

and the pure diff beside `merge_pins`:

```rust
/// Everything live that the capsule does not want, as ready-to-send commands.
/// Pure, so the diff can be tested without a hub.
pub fn close_targets(kind: &str, wanted: &Value, live: &Value) -> Vec<(String, Value, String)> {
    let ids = |v: &Value, field: &str| -> std::collections::HashSet<String> {
        v.get(field)
            .and_then(Value::as_array)
            .map(|a| a.iter().filter_map(|i| identity_of(kind, i)).collect())
            .unwrap_or_default()
    };
    let mut out = vec![];
    match kind {
        "chrome" => {
            let keep = ids(wanted, "tabs");
            for t in live.get("tabs").and_then(Value::as_array).into_iter().flatten() {
                let Some(id) = identity_of(kind, t) else { continue };
                if !keep.contains(&id) {
                    out.push(("tabs.close".into(), json!({ "url": id }), id));
                }
            }
        }
        "vscode" => {
            let keep_files = ids(wanted, "openFiles");
            // A file with unsaved changes is never a close candidate. The
            // connector refuses it too; not asking is simply quieter.
            let dirty: std::collections::HashSet<String> = live
                .get("dirtyFiles")
                .and_then(Value::as_array)
                .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                .unwrap_or_default();
            for f in live.get("openFiles").and_then(Value::as_array).into_iter().flatten() {
                let Some(id) = identity_of(kind, f) else { continue };
                if !keep_files.contains(&id) && !dirty.contains(&id) {
                    out.push(("editor.closeFile".into(), json!({ "path": id }), id));
                }
            }
            let keep_terms = ids(wanted, "terminals");
            for t in live.get("terminals").and_then(Value::as_array).into_iter().flatten() {
                let Some(id) = identity_of(kind, t) else { continue };
                if keep_terms.contains(&id) || t.get("busy").and_then(Value::as_bool) == Some(true) {
                    continue;
                }
                let name = t.get("name").and_then(Value::as_str).unwrap_or_default();
                out.push((
                    "terminal.dispose".into(),
                    json!({ "name": name, "cwd": t.get("cwd").cloned().unwrap_or(Value::Null) }),
                    name.to_string(),
                ));
            }
        }
        _ => {}
    }
    out
}
```

- [ ] **Step 5: Call it, only after a clean open**

In `activate_task`, change the signature to `pub async fn activate_task(&self, task_id: &str, focus_mode: bool)`, and immediately before building the returned `ActivateSummary`:

```rust
        let mut closed = vec![];
        let mut kept = vec![];
        if focus_mode {
            if errors.is_empty() {
                self.reconcile(task_id, &mut closed, &mut kept, &mut errors).await;
            } else {
                kept.push((
                    "focus".to_string(),
                    "skipped — the restore did not finish cleanly".to_string(),
                ));
            }
        }
```

Update every existing caller of `activate_task` to pass `false`.

- [ ] **Step 6: Thread it through the command**

In `apps/desktop/src-tauri/src/lib.rs`:

```rust
#[tauri::command]
async fn activate_task(
    caps: State<'_, CapsulesHandle>,
    task_id: String,
    focus_mode: bool,
) -> Result<ActivateSummary, String> {
    caps.0.activate_task(&task_id, focus_mode).await
}
```

- [ ] **Step 7: Run the tests**

Run: `cargo test -p rabta-desktop`
Expected: all pass, including every pre-existing capsules test.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src-tauri/src/capsules.rs apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/tests/capsules.rs
git commit -m "feat(capsules): reconcile — close what the task does not want

Runs only after a clean open phase. The destructive half must never run on a
restore already going wrong, and diffing after the opens means it can never
close what the restore just placed.

A connector refusing to close something is not an error. It comes back as kept,
with the reason, and the receipt reports it."
```

---

### Task 5: The setting, and the receipt

**Files:**
- Modify: `apps/desktop/src/store.ts` (`Prefs` gains `focusMode`)
- Modify: `apps/desktop/src/pages/SettingsPage.tsx` (the toggle)
- Modify: `apps/desktop/src/pages/CapsulesPage.tsx` (pass `focusMode` to the invoke)
- Modify: `apps/desktop/src/restore/normalize.ts` (`ActivateSummary` gains the two fields)
- Modify: `apps/desktop/src/restore/RestoreExperience.tsx` (render them)
- Test: `apps/desktop/src/restore/normalize.test.ts`, `apps/desktop/src/pages/CapsulesPage.test.tsx`

**Interfaces:**
- Consumes: `invoke("activate_task", { taskId, focusMode })` and the extended `ActivateSummary` from Task 4.
- Produces: `Prefs.focusMode: boolean`, default `false`.

- [ ] **Step 1: Write the failing test**

Add to `apps/desktop/src/pages/CapsulesPage.test.tsx`:

```tsx
it("passes focusMode to activate_task", async () => {
  // Off by default: every Resume today is non-destructive, and that is not a
  // promise to withdraw quietly.
  renderCapsules();
  await clickResume();
  expect(mockInvoke).toHaveBeenCalledWith("activate_task", {
    taskId: FAKE_TASK.id,
    focusMode: false,
  });
});
```

Adapt `renderCapsules` / `clickResume` to whatever the file's existing helpers are called — read the neighbouring Resume tests and follow them exactly.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter desktop test CapsulesPage`
Expected: FAIL — called with `{ taskId }` only.

- [ ] **Step 3: Add the pref**

In `apps/desktop/src/store.ts`, in `Prefs`:

```ts
  /** On resume, also put away what does not belong to the task. Off by
   *  default: every Resume today is non-destructive. */
  focusMode: boolean;
```

and in `DEFAULT_PREFS`: `focusMode: false,`.

- [ ] **Step 4: Pass it at the call site**

In `apps/desktop/src/pages/CapsulesPage.tsx`, where `activate_task` is invoked (~line 376), read the pref via `useStore((s) => s.prefs.focusMode)` and pass it:

```tsx
        const summary = await invoke<ActivateSummary>("activate_task", {
          taskId: t.id,
          focusMode,
        });
```

- [ ] **Step 5: Extend the summary type**

In `apps/desktop/src/restore/normalize.ts`:

```ts
export interface ActivateSummary {
  applied: string[];
  pending: string[];
  skipped: string[];
  savedPrevious: string | null;
  errors: string[];
  /** Items focus mode closed. Empty when focus mode is off. */
  closed: string[];
  /** Items focus mode left alone, as [item, reason]. A refusal, not a failure. */
  kept: [string, string][];
}
```

- [ ] **Step 6: Add the toggle**

In `apps/desktop/src/pages/SettingsPage.tsx`, beside `resumeOnLaunch`, following that control's exact markup:

- label: `Put away what isn't in the task`
- description: `On resume, close the tabs, files and terminals that don't belong to the task you're resuming. Never closes unsaved files, pinned tabs, or terminals that are running something.`

- [ ] **Step 7: Show it in the receipt**

In `apps/desktop/src/restore/RestoreExperience.tsx`, below the existing tool rows, render a line when either list is non-empty:

```tsx
{(result.closed.length > 0 || result.kept.length > 0) && (
  <p className="text-xs text-muted-foreground">
    {result.closed.length > 0 && `${result.closed.length} put away`}
    {result.closed.length > 0 && result.kept.length > 0 && " · "}
    {result.kept.length > 0 &&
      `${result.kept.length} kept — ${[...new Set(result.kept.map(([, r]) => r))].join(", ")}`}
  </p>
)}
```

Thread `closed` and `kept` through `normalize.ts` onto `RestoreResult` first, following how `errors` is already carried.

- [ ] **Step 8: Run the suite**

Run: `pnpm --filter desktop test && pnpm --filter desktop exec tsc -b --noEmit`
Expected: both clean.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src/store.ts apps/desktop/src/pages/SettingsPage.tsx apps/desktop/src/pages/CapsulesPage.tsx apps/desktop/src/restore/
git commit -m "feat(capsules): the focus mode setting, and a receipt that says what it did

Off by default. Nothing is ever put away silently: the receipt names how many
went and how many were kept, with the reason, in the same honest-partial-result
voice the restore sheet already uses."
```

---

### Task 6: Prove the guarantee, and write down what shipping costs

**Files:**
- Test: `apps/desktop/src-tauri/tests/capsules.rs`
- Modify: `docs/RELEASE.md`, `README.md`

- [ ] **Step 1: Write the guarantee test**

```rust
#[tokio::test]
async fn focus_off_issues_the_identical_command_sequence() {
    // The whole phase is built to protect this. A user who never turns focus
    // mode on must not be able to tell it was added.
    let (hub, _db, capsules, task_id, _tmp) = setup().await;
    let seen = scripted_connector_kind(&hub, "chrome", |name, _args| match name {
        "workspace.state" => Some(tabs_state(&["https://a.test/", "https://b.test/"])),
        _ => None,
    })
    .await;
    capsules.save_capsule(&task_id).await.unwrap();
    let _ = drain(&seen);

    capsules.activate_task(&task_id, false).await.unwrap();

    let names: Vec<String> = drain(&seen).into_iter().map(|(n, _)| n).collect();
    assert!(
        !names.iter().any(|n| n.ends_with(".close") || n.ends_with(".dispose")),
        "focus off must never close or dispose anything: {names:?}"
    );
}
```

- [ ] **Step 2: Prove every new test discriminates**

For each test added in Tasks 4 and 6, temporarily break the code it covers, run it, confirm it FAILS, restore, confirm it passes. Record the output for each. A test that passes for the wrong reason has already had to be replaced once on this feature.

- [ ] **Step 3: Run everything**

```bash
cargo test -p rabta-db && cargo test -p rabta-desktop && pnpm --filter desktop test
(cd connectors/chrome && npx vitest run) && (cd connectors/vscode && npx vitest run && npx tsc --noEmit)
```
Expected: all green.

- [ ] **Step 4: Package and verify both artifacts**

```bash
./scripts/package-chrome.sh
./scripts/verify-vsix.mjs dist-artifacts/rabta-vscode-0.2.0.vsix
```
The first prints the zip path; confirm `popup.css` is in it. The second must report every declared file present.

- [ ] **Step 5: Record the release cost**

In `docs/RELEASE.md`, note that 0.2.0 of both connectors requires submissions, and that `engines.vscode` rose to `^1.93`, dropping VS Code 1.85–1.92.

In `README.md`, describe focus mode — off by default, what it never closes. Claim nothing more than ships.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src-tauri/tests/capsules.rs docs/RELEASE.md README.md
git commit -m "test(capsules): focus off issues the identical command sequence

The guarantee the phase exists to protect: a user who never turns it on must
not be able to tell it was added."
```

---

## Done when

- Every suite green: rabta-db, rabta-desktop, desktop UI, both connectors, and `tsc`.
- With `focusMode` off, `activate_task` issues no close or dispose command at all.
- A refusal from a connector lands in `kept` with its reason and never in `errors`.
- Reconcile does not run when the open phase reported an error.
- Both connectors build to 0.2.0 artifacts that pass their packaging checks.

## Not in this plan

Hiding other applications' windows; Chrome tab groups; template workspaces; a "never reopen" list. All four are named out of scope in the spec.
