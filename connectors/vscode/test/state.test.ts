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
      dirtyPaths: [],
    });
    expect(state.openFiles).toEqual(["/repo/a.ts", "/repo/b.ts"]);
    expect(state.activeFile).toBe("/repo/b.ts");
  });

  it("uses the first workspace folder and null when none", () => {
    expect(
      snapshotWorkspace({
        workspaceFolders: ["/one", "/two"],
        tabUris: [],
        activeUri: null,
        terminals: [],
        dirtyPaths: [],
      }).workspaceFolder
    ).toBe("/one");
    expect(
      snapshotWorkspace({ workspaceFolders: [], tabUris: [], activeUri: null, terminals: [], dirtyPaths: [] })
        .workspaceFolder
    ).toBeNull();
  });

  it("active file is null for non-file schemes", () => {
    const state = snapshotWorkspace({
      workspaceFolders: [],
      tabUris: [],
      activeUri: uri("untitled", "Untitled-1"),
      terminals: [],
      dirtyPaths: [],
    });
    expect(state.activeFile).toBeNull();
  });

  it("passes terminal info through untouched", () => {
    const terminals = [
      { name: "zsh", cwd: "/repo", busy: false },
      { name: "task", cwd: null, busy: true },
    ];
    expect(
      snapshotWorkspace({ workspaceFolders: [], tabUris: [], activeUri: null, terminals, dirtyPaths: [] })
        .terminals
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
