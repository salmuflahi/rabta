import { describe, expect, it } from "vitest";
import type { Project, Task, TaskResource } from "@/store";
import { buildSnapshot, describeSnapshot, relativeReference, snapshotIsEmpty } from "./snapshot";

const project = { id: "p1", name: "Rabta", repoPath: "/Users/sam/code/rabta" } as Project;
const task = { id: "t1", projectId: "p1", title: "Wire the reconnect" } as Task;
const resource = (connectorKind: string, payload: Record<string, unknown>): TaskResource => ({ id: connectorKind, taskId: "t1", connectorKind, resourceType: "workspace", payload, createdAt: "" });

describe("capsule snapshots", () => {
  it("keeps references project-relative and refuses everything else", () => {
    expect(relativeReference("/Users/sam/code/rabta/src/a.ts", project.repoPath)).toBe("src/a.ts");
    expect(relativeReference("/Users/sam/code/rabta", project.repoPath)).toBeNull();
    expect(relativeReference("/Users/sam/notes/todo.md", project.repoPath)).toBe("~/notes/todo.md");
    expect(relativeReference("/home/sam/x.md", project.repoPath)).toBe("~/x.md");
    expect(relativeReference("/etc/passwd", project.repoPath)).toBeNull();
    expect(relativeReference("/Users/sam/code/rabta-other/a.ts", project.repoPath)).toBe("~/code/rabta-other/a.ts");
    expect(relativeReference("/Users/sam/code/rabta/src/\u0001a.ts", project.repoPath)).toBe("src/ a.ts");
    expect(relativeReference(42, project.repoPath)).toBeNull();
  });
  it("builds a snapshot of references only, from the tools that captured the task", () => {
    const snapshot = buildSnapshot(task, project, [
      resource("vscode", { openFiles: ["/Users/sam/code/rabta/src/a.ts", { path: "/Users/sam/code/rabta/src/b.ts" }, "/etc/hosts", "/Users/sam/code/rabta/src/a.ts"], activeFile: "/Users/sam/code/rabta/src/b.ts", terminals: [{ cwd: "/Users/sam/code/rabta/packages" }] }),
      resource("chrome", { tabs: [{ url: "https://example.com/docs?token=secret#x", title: "Docs" }, { url: "javascript:alert(1)" }, { url: "https://example.com/docs?token=secret" }] }),
      resource("git", { branch: "feat/reconnect" }),
    ], "  Start with the sdk.  ");
    expect(snapshot).toEqual({
      title: "Wire the reconnect", project: { id: "p1", name: "Rabta" },
      files: ["src/a.ts", "src/b.ts"], links: ["https://example.com/docs"], folders: ["packages"], pins: [],
      branch: "feat/reconnect", activeFile: "src/b.ts", note: "Start with the sdk.",
    });
    expect(JSON.stringify(snapshot)).not.toContain("/Users/sam");
    expect(JSON.stringify(snapshot)).not.toContain("secret");
    expect(snapshotIsEmpty(snapshot)).toBe(false);
    expect(describeSnapshot(snapshot)).toBe("2 files · 1 link · 1 folder · branch feat/reconnect");
  });
  it("drops an active file that is not among the open files and reports empty capsules", () => {
    const snapshot = buildSnapshot(task, project, [resource("vscode", { openFiles: [], activeFile: "/Users/sam/code/rabta/src/b.ts" })]);
    expect(snapshot.activeFile).toBeNull();
    expect(snapshotIsEmpty(snapshot)).toBe(true);
    expect(describeSnapshot(snapshot)).toBe("nothing to open");
    expect(buildSnapshot({ ...task, title: "" }, undefined, []).title).toBe("Untitled task");
  });
});
