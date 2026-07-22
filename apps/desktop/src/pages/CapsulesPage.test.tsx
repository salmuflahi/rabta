import type { InvokeArgs } from "@tauri-apps/api/core";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mockInvoke, renderWithProviders } from "@/test/smoke-utils";
import type { Project, Task, TaskResource } from "@/store";
import { CapsulesPage } from "./CapsulesPage";

const FAKE_PROJECT: Project = {
  id: "proj-1",
  name: "Test Project",
  repoPath: "/tmp/test-project",
  devUrl: null,
  defaultBranch: "main",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const FAKE_TASK: Task = {
  id: "task-1",
  projectId: "proj-1",
  title: "Write onboarding docs",
  status: "open",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("CapsulesPage", () => {
  it("renders a populated task row without throwing (catches missing-provider crashes)", async () => {
    // Override the shared mock per-command so this test exercises a real,
    // populated task Card (Dialog trigger, Badge, buttons) rather than the
    // empty-state path — that's the render surface most likely to crash on
    // a missing provider.
    mockInvoke.mockImplementation(async (cmd: string, args?: InvokeArgs) => {
      const a = args as Record<string, unknown> | undefined;
      switch (cmd) {
        case "list_projects":
          return [FAKE_PROJECT] as unknown;
        case "list_tasks":
          return (a?.projectId === FAKE_PROJECT.id ? [FAKE_TASK] : []) as unknown;
        case "task_resources":
          return [] as TaskResource[] as unknown;
        default:
          return [] as unknown;
      }
    });

    renderWithProviders(<CapsulesPage />);

    expect(await screen.findByText("Write onboarding docs")).toBeInTheDocument();
    expect(screen.getByText("Resume")).toBeInTheDocument();
  });
});
