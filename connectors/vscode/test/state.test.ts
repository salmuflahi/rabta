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
