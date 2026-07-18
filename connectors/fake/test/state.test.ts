import { describe, expect, it } from "vitest";
import { createWorkspace } from "../src/state";

describe("fake workspace state", () => {
  it("opens a workspace and resets open files", () => {
    const ws = createWorkspace();
    ws.openFile("stale.ts");
    expect(ws.open("/tmp/demo")).toEqual({ opened: "/tmp/demo" });
    expect(ws.state).toEqual({ root: "/tmp/demo", openFiles: [] });
  });

  it("tracks opened files without duplicates", () => {
    const ws = createWorkspace();
    ws.openFile("a.ts");
    ws.openFile("a.ts");
    ws.openFile("b.ts");
    expect(ws.state.openFiles).toEqual(["a.ts", "b.ts"]);
  });
});
