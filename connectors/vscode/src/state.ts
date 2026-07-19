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
