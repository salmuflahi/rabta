import { describe, it, expect } from "vitest";
import { buildContext, safeLink } from "./context";
import type { Task, Project, TaskResource } from "@/store";
const task = { id: "1", title: "Reconnect", projectId: "p" } as Task;
const project = { name: "Atlas", repoPath: "/Users/sam/atlas" } as Project;
const resources = [
  {
    connectorKind: "vscode",
    payload: {
      openFiles: ["/Users/sam/atlas/src/main.ts"],
      terminals: [{ cwd: "/Users/sam/atlas" }],
      fileContents: "SECRET_CONTENT",
    },
  },
  {
    connectorKind: "chrome",
    payload: {
      tabs: [
        { url: "https://sam:password@example.com/docs?token=SECRET#private" },
        { url: "javascript:alert(1)" },
      ],
    },
  },
  { connectorKind: "git", payload: { branch: "feat/reconnect" } },
] as unknown as TaskResource[];
describe("context handoff", () => {
  it("exports only selected metadata and strips credentials and query strings", () => {
    const brief = buildContext(
      task,
      project,
      resources,
      ["files", "tabs", "terminals", "git"],
      "Find the issue",
    );
    expect(brief).toContain("src/main.ts");
    expect(brief).toContain("https://example.com/docs");
    expect(brief).toContain("feat/reconnect");
    expect(brief).toContain("Find the issue");
    for (const value of ["SECRET", "password", "/Users/sam", "javascript:"])
      expect(brief).not.toContain(value);
  });
  it("omits categories the user excluded", () => {
    const brief = buildContext(task, project, resources, ["git"], "");
    expect(brief).toContain("feat/reconnect");
    expect(brief).not.toContain("src/main.ts");
    expect(brief).not.toContain("example.com");
  });
  it("keeps unknown and malformed resource data out of the brief", () => {
    expect(safeLink("file:///private/key")).toBe("");
    expect(() =>
      buildContext(
        task,
        undefined,
        [
          {
            connectorKind: "chrome",
            payload: { tabs: [null, 42, { url: 4 }] },
          },
        ] as unknown as TaskResource[],
        ["tabs"],
        "",
      ),
    ).not.toThrow();
  });
});
