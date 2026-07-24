import { describe, expect, it } from "vitest";
import { moveProject, moveProjectBy } from "@/lib/project-order";
import type { Project } from "@/store";

function project(id: string, sortOrder: number): Project {
  return {
    id,
    name: id.toUpperCase(),
    repoPath: `/tmp/${id}`,
    devUrl: null,
    defaultBranch: "main",
    icon: null,
    archivedAt: null,
    lastOpenedAt: null,
    lastTaskId: null,
    activeSeconds: 0,
    sortOrder,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const a = project("a", 0);
const b = project("b", 1);
const c = project("c", 2);

describe("project ordering", () => {
  it("moves a dragged project to the target position", () => {
    expect(moveProject([a, b, c], "a", "c").map((item) => item.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("moves one position through the menu helper", () => {
    expect(moveProjectBy([a, b, c], "b", -1).map((item) => item.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("returns the original list for boundaries, missing IDs, or equal IDs", () => {
    const projects = [a, b, c];
    expect(moveProjectBy(projects, "a", -1)).toBe(projects);
    expect(moveProjectBy(projects, "c", 1)).toBe(projects);
    expect(moveProject(projects, "missing", "a")).toBe(projects);
    expect(moveProject(projects, "a", "missing")).toBe(projects);
    expect(moveProject(projects, "a", "a")).toBe(projects);
  });
});
