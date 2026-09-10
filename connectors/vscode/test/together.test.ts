import { describe, expect, it } from "vitest";
import { cursorEvent, peerCursors, relativeToFolder } from "../src/state";

describe("together cursors", () => {
  it("reports only files inside the workspace folder, project-relative", () => {
    expect(relativeToFolder("/repo/src/a.ts", "/repo")).toBe("src/a.ts");
    expect(relativeToFolder("/repo/src/a.ts", "/repo/")).toBe("src/a.ts");
    expect(relativeToFolder("/repository/x.ts", "/repo")).toBeNull();
    expect(relativeToFolder("/repo", "/repo")).toBeNull();
    expect(relativeToFolder(null, "/repo")).toBeNull();
    expect(cursorEvent({ path: "/repo/src/a.ts", folder: "/repo", line: 118, column: 4 })).toEqual({ path: "src/a.ts", line: 118, column: 4 });
    expect(cursorEvent({ path: "/elsewhere/secret.ts", folder: "/repo", line: 1, column: 1 })).toBeNull();
    expect(cursorEvent({ path: "/repo/a.ts", folder: null, line: 1, column: 1 })).toBeNull();
  });
  it("includes a selection only when it differs from the cursor and clamps to human line numbers", () => {
    expect(cursorEvent({ path: "/repo/a.ts", folder: "/repo", line: 3, column: 2, selectionLine: 3, selectionColumn: 2 })).toEqual({ path: "a.ts", line: 3, column: 2 });
    expect(cursorEvent({ path: "/repo/a.ts", folder: "/repo", line: 3, column: 2, selectionLine: 5, selectionColumn: 1 })).toEqual({ path: "a.ts", line: 3, column: 2, selection: { line: 5, column: 1 } });
    expect(cursorEvent({ path: "/repo/a.ts", folder: "/repo", line: 0, column: -4 })).toEqual({ path: "a.ts", line: 1, column: 1 });
  });
  it("keeps only well-formed peers with absolute paths and safe colours", () => {
    const peers = peerCursors([
      { id: "alina", name: "Alina Rodriguez-Smith", color: "#BAD0BD", path: "/repo/a.ts", line: 12, column: 3 },
      { id: "bad", name: "x", color: "red; background:url()", path: "/repo/a.ts", line: 1, column: 1 },
      { id: "relative", name: "x", color: "#D7A57B", path: "a.ts", line: 1, column: 1 },
      { id: "loose", name: "Sam", color: "#D7A57B", path: "/repo/b.ts", line: 0, column: "2" },
      "junk",
    ]);
    expect(peers).toEqual([
      { id: "alina", name: "Alina Rodrigue", color: "#BAD0BD", path: "/repo/a.ts", line: 12, column: 3 },
      { id: "loose", name: "Sam", color: "#D7A57B", path: "/repo/b.ts", line: 1, column: 1 },
    ]);
    expect(peerCursors(null)).toEqual([]);
  });
});
