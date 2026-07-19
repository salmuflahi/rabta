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
