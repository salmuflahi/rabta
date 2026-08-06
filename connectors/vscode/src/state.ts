/** A URI reduced to the two fields state mapping needs; matches vscode.Uri structurally. */
export interface UriLike {
  scheme: string;
  fsPath: string;
}

/** Terminal metadata: cwd is knowable only when the terminal was created with one. */
export interface TerminalInfo {
  name: string;
  cwd: string | null;
  /** A shell execution is in flight. A running process is not in the capsule,
   *  so focus mode must never dispose one. */
  busy: boolean;
}

/** Plain-data snapshot of the editor, extracted by the adapter layer. */
export interface SnapshotInput {
  workspaceFolders: string[];
  tabUris: UriLike[];
  activeUri: UriLike | null;
  terminals: TerminalInfo[];
  /** Paths with unsaved changes, from the editor. Filtered to open files below. */
  dirtyPaths: string[];
}

/** The `workspace.state` wire shape (see phase 7 spec). */
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

/**
 * Maps raw editor data to the wire state: file-scheme tabs only, deduped in
 * first-seen order; first workspace folder wins; non-file active editors
 * report null.
 */
export function snapshotWorkspace(input: SnapshotInput): WorkspaceState {
  const openFiles = [
    ...new Set(input.tabUris.filter((u) => u.scheme === "file").map((u) => u.fsPath)),
  ];
  const open = new Set(openFiles);
  const dirtyFiles = [...new Set(input.dirtyPaths)].filter((p) => open.has(p));
  return {
    workspaceFolder: input.workspaceFolders[0] ?? null,
    openFiles,
    activeFile: filePathOf(input.activeUri),
    terminals: input.terminals,
    dirtyFiles,
  };
}

/** File-scheme guard used by event emitters: path for real files, null otherwise. */
export function filePathOf(uri: UriLike | null | undefined): string | null {
  return uri && uri.scheme === "file" ? uri.fsPath : null;
}

/** Whether focus mode may dispose this terminal. Pure, so the guard is testable
 *  without an editor. */
export function terminalCloseVerdict(t: { busy: boolean }): { close: boolean; reason?: string } {
  return t.busy ? { close: false, reason: "running something" } : { close: true };
}
