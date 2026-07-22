import type { InvokeArgs } from "@tauri-apps/api/core";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

const FAKE_RESOURCE: TaskResource = {
  id: "res-1",
  taskId: "task-1",
  connectorKind: "git",
  resourceType: "capsule",
  payload: { branch: "main" },
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("CapsulesPage", () => {
  it("renders the no-projects empty state without throwing", async () => {
    // Default mockInvoke resolves [] for every command (see smoke-utils),
    // so list_projects -> [] exercises the empty-state path directly. Run
    // this before the next test overrides mockInvoke's implementation.
    renderWithProviders(<CapsulesPage />);

    expect(await screen.findByText("No capsules yet")).toBeInTheDocument();
    expect(screen.getByText("Register a Project")).toBeInTheDocument();
  });

  it("renders a populated task row with a humanized capsule summary without throwing (catches missing-provider crashes)", async () => {
    // Override the shared mock per-command so this test exercises a real,
    // populated task Card (Dialog trigger, Badge, buttons, humanized capsule
    // resource) rather than the empty-state path — that's the render surface
    // most likely to crash on a missing provider.
    mockInvoke.mockImplementation(async (cmd: string, args?: InvokeArgs) => {
      const a = args as Record<string, unknown> | undefined;
      switch (cmd) {
        case "list_projects":
          return [FAKE_PROJECT] as unknown;
        case "list_tasks":
          return (a?.projectId === FAKE_PROJECT.id ? [FAKE_TASK] : []) as unknown;
        case "task_resources":
          return (a?.taskId === FAKE_TASK.id ? [FAKE_RESOURCE] : []) as TaskResource[] as unknown;
        default:
          return [] as unknown;
      }
    });

    renderWithProviders(<CapsulesPage />);

    expect(await screen.findByText("Write onboarding docs")).toBeInTheDocument();
    expect(screen.getByText("Resume")).toBeInTheDocument();
    // Humanized capsule text (from humanizeCapsule) rather than the old
    // terse "git: main" phrasing.
    expect(screen.getByText("on main")).toBeInTheDocument();
  });

  it("clicking Resume drives the ceremony's activate_task invoke exactly once (no duplicate activate path)", async () => {
    // Reduced motion so the ceremony resolves instantly (no overlay timers
    // to wait out) — this test is about the wiring, not the animation.
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;

    mockInvoke.mockImplementation(async (cmd: string, args?: InvokeArgs) => {
      const a = args as Record<string, unknown> | undefined;
      switch (cmd) {
        case "list_projects":
          return [FAKE_PROJECT] as unknown;
        case "list_tasks":
          return (a?.projectId === FAKE_PROJECT.id ? [FAKE_TASK] : []) as unknown;
        case "task_resources":
          return (a?.taskId === FAKE_TASK.id ? [FAKE_RESOURCE] : []) as TaskResource[] as unknown;
        case "activate_task":
          return {
            applied: ["git"],
            pending: [],
            skipped: [],
            savedPrevious: null,
            errors: [],
          } as unknown;
        default:
          return [] as unknown;
      }
    });

    try {
      renderWithProviders(<CapsulesPage />);

      const resumeButton = await screen.findByText("Resume");
      fireEvent.click(resumeButton);

      await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("activate_task", { taskId: FAKE_TASK.id }));
      // The ceremony owns the only activate path — assert there's no
      // duplicate inline invoke alongside it.
      const activateCalls = mockInvoke.mock.calls.filter(([cmd]) => cmd === "activate_task");
      expect(activateCalls).toHaveLength(1);
    } finally {
      if (originalMatchMedia) {
        window.matchMedia = originalMatchMedia;
      } else {
        // @ts-expect-error - test cleanup restoring an absent global
        delete window.matchMedia;
      }
    }
  });
});
