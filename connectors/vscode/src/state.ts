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

/**
 * Whether focus mode may dispose every terminal sharing one name+cwd
 * identity. Pure — no `vscode` import — so the guard is testable without an
 * editor. Mirrors `fileClosePlan`'s shape.
 *
 * Two terminals can share a name+cwd identity (two "zsh" shells in the same
 * folder are the same identity per phase 1's rule). Judging and disposing
 * matches one at a time — first-match instead of gather-all — is how a busy
 * shell in the second slot turns into "disposed the idle one, left the busy
 * one running, told the desktop the identity is closed": a false report.
 * Worse, `Terminal.dispose()` removes from `window.terminals`
 * asynchronously, so re-querying between dispose calls can re-find and
 * re-dispose the SAME terminal object, reporting "closed" twice while an
 * actual duplicate survives untouched. So every match must be gathered
 * first, from one snapshot, and judged together: if any one of them is
 * busy, NONE dispose, and the whole identity is reported kept.
 */
export function terminalClosePlan(
  terminals: { busy: boolean }[]
): { close: true } | { close: false; reason: string } {
  if (terminals.length === 0) return { close: false, reason: "no longer open" };
  for (const t of terminals) {
    const verdict = terminalCloseVerdict(t);
    if (!verdict.close) return { close: false, reason: verdict.reason ?? "running something" };
  }
  return { close: true };
}

/**
 * Whether focus mode may close every tab open on a path. Pure — no `vscode`
 * import — so the guard is testable without an editor.
 *
 * A path can be open in more than one tab at once (an ordinary split view).
 * Judging and closing matches one at a time is how a dirty copy in the
 * second group turns into "closed the clean one, left the dirty one open,
 * told the desktop the file is closed" — a false report. So every match is
 * judged together first: if any one of them is dirty, NONE close, and the
 * whole path is reported kept.
 */
export function fileClosePlan(
  tabs: { isDirty: boolean }[]
): { close: true } | { close: false; reason: string } {
  if (tabs.length === 0) return { close: false, reason: "no longer open" };
  if (tabs.some((t) => t.isDirty)) return { close: false, reason: "unsaved changes" };
  return { close: true };
}
