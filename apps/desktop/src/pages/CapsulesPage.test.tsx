import type { InvokeArgs } from "@tauri-apps/api/core";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { mockInvoke, renderWithProviders } from "@/test/smoke-utils";
import { useStore, type Project, type Task, type TaskResource } from "@/store";
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

/** Stubs `window.matchMedia` to report reduced motion, so the Restore
 * Experience sheet resolves through its timers on the next real-timer tick
 * instead of the full ~1s+ animation timeline — these tests are about the
 * CapsulesPage <-> useRestore wiring, not the animation (already covered by
 * `restore/RestoreExperience.test.tsx`). Returns a restore function. */
function stubReducedMotion(): () => void {
  const originalMatchMedia = window.matchMedia;
  window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
  return () => {
    if (originalMatchMedia) {
      window.matchMedia = originalMatchMedia;
    } else {
      // @ts-expect-error - test cleanup restoring an absent global
      delete window.matchMedia;
    }
  };
}

/** Standard list_projects/list_tasks/task_resources wiring for the single
 * FAKE_PROJECT/FAKE_TASK fixture, with a caller-supplied `activate_task`
 * handler and an overridable set of task resources (capsule contents). */
function mockCapsulesInvoke(opts: {
  activateTask: (args: Record<string, unknown> | undefined) => unknown;
  resources?: TaskResource[];
}) {
  // Clear call history (not just the implementation) so a test that asserts
  // on `mockInvoke.mock.calls` — e.g. "exactly one activate_task call" —
  // isn't polluted by invokes from an earlier test in this file. `invoke` is
  // a single shared mock across the whole suite (see smoke-utils), and
  // nothing resets it between tests otherwise.
  mockInvoke.mockClear();
  mockInvoke.mockImplementation(async (cmd: string, args?: InvokeArgs) => {
    const a = args as Record<string, unknown> | undefined;
    switch (cmd) {
      case "list_projects":
        return [FAKE_PROJECT] as unknown;
      case "list_tasks":
        return (a?.projectId === FAKE_PROJECT.id ? [FAKE_TASK] : []) as unknown;
      case "task_resources":
        return (a?.taskId === FAKE_TASK.id ? (opts.resources ?? [FAKE_RESOURCE]) : []) as unknown;
      case "activate_task":
        return opts.activateTask(a);
      default:
        return [] as unknown;
    }
  });
}

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

  it("Resume click opens the Restore Experience sheet and shows the Restoring… disabled state while active", async () => {
    const restoreMatchMedia = stubReducedMotion();
    let resolveActivate!: (summary: unknown) => void;
    mockCapsulesInvoke({
      activateTask: () =>
        new Promise((resolve) => {
          resolveActivate = resolve;
        }),
    });

    try {
      renderWithProviders(<CapsulesPage />);

      const resumeButton = await screen.findByRole("button", { name: "Resume" });
      fireEvent.click(resumeButton);

      // The sheet opens and the button flips to its in-flight state
      // immediately (same frame as the click) — it doesn't wait on the
      // invoke or any animation.
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      expect(await screen.findByRole("button", { name: "Restoring…" })).toBeDisabled();

      resolveActivate({ applied: ["git"], pending: [], skipped: [], savedPrevious: null, errors: [] });
      await waitFor(() => expect(screen.getByText("Workspace restored")).toBeInTheDocument());
    } finally {
      restoreMatchMedia();
    }
  });

  it("success path: setActiveTaskId fires and the sheet reaches Workspace restored, invoked with {taskId}", async () => {
    const restoreMatchMedia = stubReducedMotion();
    mockCapsulesInvoke({
      activateTask: async () => ({
        applied: ["git"],
        pending: [],
        skipped: [],
        savedPrevious: null,
        errors: [],
      }),
    });

    try {
      renderWithProviders(<CapsulesPage />);

      const resumeButton = await screen.findByRole("button", { name: "Resume" });
      fireEvent.click(resumeButton);

      await waitFor(() =>
        expect(mockInvoke).toHaveBeenCalledWith("activate_task", { taskId: FAKE_TASK.id })
      );
      await waitFor(() => expect(screen.getByText("Workspace restored")).toBeInTheDocument());

      // setActiveTaskId's effect: the task's card now shows the "Active"
      // badge (the store update from `resume`'s `run`, not a toast).
      expect(await screen.findByText("Active")).toBeInTheDocument();
    } finally {
      restoreMatchMedia();
    }
  });

  it("duplicate click while active does not fire a second activate_task", async () => {
    const restoreMatchMedia = stubReducedMotion();
    let resolveActivate!: (summary: unknown) => void;
    mockCapsulesInvoke({
      activateTask: () =>
        new Promise((resolve) => {
          resolveActivate = resolve;
        }),
    });

    try {
      renderWithProviders(<CapsulesPage />);

      const resumeButton = await screen.findByRole("button", { name: "Resume" });
      fireEvent.click(resumeButton);
      await screen.findByRole("button", { name: "Restoring…" });

      // The button is disabled, but click it again anyway (re-entrancy
      // guard lives in useRestore's `start`, not just the `disabled` attr).
      fireEvent.click(screen.getByRole("button", { name: "Restoring…" }));

      const activateCalls = mockInvoke.mock.calls.filter(([cmd]) => cmd === "activate_task");
      expect(activateCalls).toHaveLength(1);

      resolveActivate({ applied: ["git"], pending: [], skipped: [], savedPrevious: null, errors: [] });
      await waitFor(() => expect(screen.getByText("Workspace restored")).toBeInTheDocument());
    } finally {
      restoreMatchMedia();
    }
  });

  it("a task with no capsule resources still opens the sheet and completes without throwing", async () => {
    const restoreMatchMedia = stubReducedMotion();
    mockCapsulesInvoke({
      resources: [],
      activateTask: async () => ({
        applied: [],
        pending: [],
        skipped: [],
        savedPrevious: null,
        errors: [],
      }),
    });

    try {
      renderWithProviders(<CapsulesPage />);

      const resumeButton = await screen.findByRole("button", { name: "Resume" });
      fireEvent.click(resumeButton);

      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      await waitFor(() =>
        expect(mockInvoke).toHaveBeenCalledWith("activate_task", { taskId: FAKE_TASK.id })
      );
      // No capsule resources and no issues reported resolves to "success"
      // (per normalize.ts: nothing to restore is not a partial failure)
      // rather than throwing or hanging.
      await waitFor(() => expect(screen.getByText("Workspace restored")).toBeInTheDocument());
    } finally {
      restoreMatchMedia();
    }
  });

  it("a pendingResumeTaskId set by the command palette resumes the matching task through the real Restore Experience, then clears itself", async () => {
    // Simulates the command palette's "Resume {task}" item having already
    // set the store signal (and navigated here) before this page mounts —
    // this page must route it through the SAME `resume()` its own Resume
    // button uses, not a second/duplicated activate_task path.
    const restoreMatchMedia = stubReducedMotion();
    mockCapsulesInvoke({
      activateTask: async () => ({
        applied: ["git"],
        pending: [],
        skipped: [],
        savedPrevious: null,
        errors: [],
      }),
    });

    try {
      useStore.setState({ pendingResumeTaskId: FAKE_TASK.id });
      renderWithProviders(<CapsulesPage />);

      await waitFor(() =>
        expect(mockInvoke).toHaveBeenCalledWith("activate_task", { taskId: FAKE_TASK.id })
      );
      const activateCalls = mockInvoke.mock.calls.filter(([cmd]) => cmd === "activate_task");
      expect(activateCalls).toHaveLength(1);
      await waitFor(() => expect(screen.getByText("Workspace restored")).toBeInTheDocument());
      expect(useStore.getState().pendingResumeTaskId).toBeNull();
    } finally {
      restoreMatchMedia();
      useStore.setState({ pendingResumeTaskId: null });
    }
  });
});
