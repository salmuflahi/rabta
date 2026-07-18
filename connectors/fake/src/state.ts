export interface WorkspaceState {
  root: string | null;
  openFiles: string[];
}

/** In-memory stand-in for a VS Code workspace. */
export function createWorkspace() {
  const state: WorkspaceState = { root: null, openFiles: [] };
  return {
    state,
    open(path: string) {
      state.root = path;
      state.openFiles = [];
      return { opened: path };
    },
    openFile(path: string) {
      if (!state.openFiles.includes(path)) state.openFiles.push(path);
    },
  };
}
