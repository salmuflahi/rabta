import * as vscode from "vscode";
import { connect, type Connector } from "@rabta/connector-sdk";
import {
  cursorEvent,
  fileClosePlan,
  filePathOf,
  peerCursors,
  snapshotWorkspace,
  terminalClosePlan,
  type PeerCursor,
  type TerminalInfo,
  type UriLike,
} from "./state";

let connector: Connector | undefined;

// Together: while on, this editor's cursor is reported as a project-relative
// position (never for files outside the workspace folder), and teammates'
// cursors are drawn as decorations with their name. Off by default; the
// desktop app turns it on only after the person chose Together in the Room.
let togetherOn = false;
let cursorTimer: NodeJS.Timeout | undefined;
let peers: PeerCursor[] = [];
const peerStyles = new Map<string, { color: string; type: vscode.TextEditorDecorationType }>();

function emitCursor(): void {
  if (!togetherOn) return;
  const editor = vscode.window.activeTextEditor;
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
  const event = editor
    ? cursorEvent({
        path: filePathOf({ scheme: editor.document.uri.scheme, fsPath: editor.document.uri.fsPath }),
        folder,
        line: editor.selection.active.line + 1,
        column: editor.selection.active.character + 1,
        selectionLine: editor.selection.anchor.line + 1,
        selectionColumn: editor.selection.anchor.character + 1,
      })
    : null;
  connector?.emit("editor.cursor", event ?? { path: null });
}
/** Trailing throttle: at most one cursor report every 100 ms. */
function scheduleCursor(): void {
  if (!togetherOn || cursorTimer) return;
  cursorTimer = setTimeout(() => { cursorTimer = undefined; emitCursor(); }, 100);
}
function styleFor(peer: PeerCursor): vscode.TextEditorDecorationType {
  const existing = peerStyles.get(peer.id);
  if (existing && existing.color === peer.color) return existing.type;
  existing?.type.dispose();
  const type = vscode.window.createTextEditorDecorationType({
    borderColor: peer.color,
    borderStyle: "solid",
    borderWidth: "0 0 0 2px",
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    after: {
      contentText: ` ${peer.name} `,
      backgroundColor: peer.color,
      color: "#0A0B0E",
      margin: "0 0 0 4px",
      fontWeight: "600",
      textDecoration: "none; border-radius: 6px; font-size: 11px",
    },
  });
  peerStyles.set(peer.id, { color: peer.color, type });
  return type;
}
/** Draws every peer whose file is visible; clears peers that left. */
function paintPeers(): void {
  const alive = new Set(peers.map((peer) => peer.id));
  for (const [id, style] of peerStyles) {
    if (!alive.has(id)) { style.type.dispose(); peerStyles.delete(id); }
  }
  for (const editor of vscode.window.visibleTextEditors) {
    for (const peer of peers) {
      const type = styleFor(peer);
      if (editor.document.uri.scheme !== "file" || editor.document.uri.fsPath !== peer.path) { editor.setDecorations(type, []); continue; }
      const line = Math.min(peer.line - 1, Math.max(0, editor.document.lineCount - 1));
      const column = Math.min(peer.column - 1, editor.document.lineAt(line).text.length);
      const position = new vscode.Position(line, column);
      editor.setDecorations(type, [new vscode.Range(position, position)]);
    }
  }
}
function clearPeers(): void {
  peers = [];
  for (const style of peerStyles.values()) style.type.dispose();
  peerStyles.clear();
}

// vscode has no "is this terminal busy" property. The shell-execution events
// wired in activate() are the only way to know a command is in flight — which
// is what stops focus mode disposing a terminal running a dev server or a
// build. Module-scoped (not local to activate) so terminalInfo can read it.
const busyTerminals = new Set<vscode.Terminal>();

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
    dirtyPaths: vscode.workspace.textDocuments
      .filter((d) => d.isDirty && d.uri.scheme === "file")
      .map((d) => d.uri.fsPath),
  });
}

/** cwd is knowable only for terminals created with an explicit one. Shared by
 *  terminalInfo (reporting) and terminal.dispose (matching) so there is one
 *  place that knows how a terminal's cwd is derived, not two. */
function cwdOf(terminal: vscode.Terminal): string | null {
  const cwd = (terminal.creationOptions as vscode.TerminalOptions).cwd;
  return typeof cwd === "string" ? cwd : cwd instanceof vscode.Uri ? cwd.fsPath : null;
}

function terminalInfo(terminal: vscode.Terminal): TerminalInfo {
  return {
    name: terminal.name,
    cwd: cwdOf(terminal),
    busy: busyTerminals.has(terminal),
  };
}

/**
 * Fire-and-forget connection: activation must never wait for the hub
 * (spec criterion 7). Handlers are registered before dialing via `setup`;
 * events emitted before the connection lands are deliberately dropped.
 */
export function activate(context: vscode.ExtensionContext): void {
  const out = vscode.window.createOutputChannel("Rabta");

  // These two events are stable only from 1.93 — the reason engines.vscode
  // was raised. Track start/end plus close (a terminal killed mid-command
  // never fires the end event) so busyTerminals never sticks stale.
  context.subscriptions.push(
    vscode.window.onDidStartTerminalShellExecution((e) => busyTerminals.add(e.terminal)),
    vscode.window.onDidEndTerminalShellExecution((e) => busyTerminals.delete(e.terminal)),
    vscode.window.onDidCloseTerminal((t) => busyTerminals.delete(t))
  );

  connect(
    {
      name: "vscode",
      kind: "vscode",
      capabilities: ["workspace", "editor", "terminal"],
      version: context.extension.packageJSON.version as string,
    },
    (c) => {
      connector = c;
      c.onCommand("workspace.state", () => snapshot());
      c.onCommand("editor.openFiles", () => ({ openFiles: snapshot().openFiles }));
      c.onCommand("editor.openFile", async (args) => {
        const { path } = args as { path: string };
        const doc = await vscode.workspace.openTextDocument(path);
        await vscode.window.showTextDocument(doc, { preview: false });
        return { opened: path };
      });
      c.onCommand("workspace.open", (args) => {
        const { path } = args as { path?: unknown };
        if (typeof path !== "string" || path.length === 0) {
          throw new Error("workspace.open requires a non-empty string path");
        }
        // Reply first — openFolder reloads the window and kills this
        // extension host; the connector re-registers from the new window.
        setTimeout(() => {
          Promise.resolve(
            vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(path), {
              forceNewWindow: false,
            })
          ).catch((e) => out.appendLine(`workspace.open failed: ${e}`));
        }, 50);
        return { opening: path };
      });
      c.onCommand("together.configure", (args) => {
        const { enabled } = (args ?? {}) as { enabled?: unknown };
        togetherOn = enabled === true;
        if (togetherOn) emitCursor();
        else { clearPeers(); if (cursorTimer) { clearTimeout(cursorTimer); cursorTimer = undefined; } }
        return { enabled: togetherOn };
      });
      c.onCommand("editor.showCursors", (args) => {
        const { cursors } = (args ?? {}) as { cursors?: unknown };
        peers = togetherOn ? peerCursors(cursors) : [];
        paintPeers();
        return { shown: peers.length };
      });
      c.onCommand("editor.reveal", async (args) => {
        const { path, line, column } = (args ?? {}) as { path?: unknown; line?: unknown; column?: unknown };
        if (typeof path !== "string" || !path.startsWith("/")) throw new Error("editor.reveal requires an absolute file path");
        const doc = await vscode.workspace.openTextDocument(path);
        const editor = await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: false });
        const row = Math.min(Math.max(0, (typeof line === "number" ? line : 1) - 1), Math.max(0, doc.lineCount - 1));
        const col = Math.min(Math.max(0, (typeof column === "number" ? column : 1) - 1), doc.lineAt(row).text.length);
        const position = new vscode.Position(row, col);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
        return { revealed: path, line: row + 1 };
      });
      c.onCommand("terminal.create", (args) => {
        const { cwd, name } = args as { cwd: string; name?: string };
        const terminal = vscode.window.createTerminal({ cwd, name });
        terminal.show();
        return { created: terminal.name };
      });
      c.onCommand("editor.closeFile", async (args) => {
        const { path } = args as { path: string };
        // A path can be open in more than one tab group at once (an ordinary
        // split view). Every match must be gathered and judged together
        // before any of them close — see fileClosePlan. A dirty buffer holds
        // work no capsule captured; never close it, and never prompt either
        // — a resume is not the moment to ask. Filtered to `scheme ===
        // "file"`, the same filter `snapshot()` uses: a `git:` tab (e.g.
        // VS Code's read-only "Open File (HEAD)" view) can share the same
        // fsPath but was never captured or targeted, and must never be swept
        // in just because its path matches.
        const tabs = vscode.window.tabGroups.all
          .flatMap((g) => g.tabs)
          .filter(
            (t) =>
              t.input instanceof vscode.TabInputText &&
              t.input.uri.scheme === "file" &&
              t.input.uri.fsPath === path,
          );
        const verdict = fileClosePlan(tabs.map((t) => ({ isDirty: t.isDirty })));
        if (!verdict.close) return { kept: path, reason: verdict.reason };
        const allClosed = await vscode.window.tabGroups.close(tabs, false);
        if (!allClosed) return { kept: path, reason: "the editor did not close it" };
        return { closed: path };
      });
      c.onCommand("terminal.dispose", (args) => {
        const { name, cwd } = args as { name: string; cwd?: string | null };
        // Every terminal sharing this name+cwd identity must be gathered
        // from one snapshot and judged together — see terminalClosePlan.
        // `.find()` (first-match) judges one alone, so N terminals sharing
        // an identity produced N identical dispose commands; worse,
        // `Terminal.dispose()` removes from `window.terminals`
        // asynchronously, so re-querying between dispose calls could
        // re-find and re-dispose the same terminal.
        const terminals = vscode.window.terminals.filter(
          (t) => t.name === name && (cwdOf(t) ?? "") === (cwd ?? ""),
        );
        const verdict = terminalClosePlan(terminals.map((t) => ({ busy: busyTerminals.has(t) })));
        if (!verdict.close) return { kept: name, reason: verdict.reason };
        for (const terminal of terminals) terminal.dispose();
        return { closed: name };
      });
    }
  )
    .then((c) => {
      connector = c;
      out.appendLine(`connected to Rabta as ${c.connectorId}`);
    })
    .catch((e) => out.appendLine(`Rabta connection failed: ${e}`));

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
      scheduleCursor();
    }),
    vscode.window.onDidChangeTextEditorSelection(() => scheduleCursor()),
    vscode.window.onDidChangeVisibleTextEditors(() => { if (peers.length) paintPeers(); }),
    out
  );
}

/** Clean disconnect so the hub sees the editor leave immediately. */
export function deactivate(): void {
  clearPeers();
  connector?.close();
}
