import type { InvokeArgs } from "@tauri-apps/api/core";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components/ui/sonner";
import { mockInvoke, renderWithProviders } from "@/test/smoke-utils";
import { useStore, type Project, type Task, type TaskResource } from "@/store";
import { CapsulesPage } from "./CapsulesPage";

// The delete flow's Undo toast goes through the sonner `toast` function
// directly (not toastOk/toastErr) — mocked so tests can inspect the
// message/action without needing an actual <Toaster/> mounted (sonner's
// toasts are a global queue; a real Toaster would add DOM-timing flakiness
// this doesn't need).
vi.mock("@/components/ui/sonner", () => {
  const fn = vi.fn();
  return { toast: Object.assign(fn, { success: vi.fn(), error: vi.fn() }) };
});

function mockedToast() {
  return toast as unknown as ReturnType<typeof vi.fn>;
}

const FAKE_PROJECT: Project = {
  id: "proj-1",
  name: "Test Project",
  repoPath: "/tmp/test-project",
  devUrl: null,
  defaultBranch: "main",
  icon: null,
  archivedAt: null,
  lastOpenedAt: null,
  lastTaskId: null,
  activeSeconds: 0,
  sortOrder: 0,
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
    // Teaching copy: explains what a capsule does for the user (A5-T2).
    expect(screen.getByText(/save and restore/i)).toBeInTheDocument();
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

  it("clicking a task's capsule summary opens a Popover peek with the humanized per-tool breakdown and saved-ago text", async () => {
    mockCapsulesInvoke({ activateTask: async () => ({}) });
    renderWithProviders(<CapsulesPage />);

    await screen.findByText(FAKE_TASK.title);
    // The capsule summary row is the preview's trigger — FAKE_RESOURCE is a
    // git resource, humanized to "on main" by CapsuleSummary.
    fireEvent.click(screen.getByText("on main"));

    expect(await screen.findByText("Saved state")).toBeInTheDocument();
    // Friendly tool name (from RESTORE_TOOL_NAME) + humanizeCapsule's summary.
    expect(screen.getByText(/Git — on main/)).toBeInTheDocument();
    // Muted "saved {savedAgo}" line — assert the stable "saved" prefix
    // rather than the exact relative time (time-based flakiness).
    expect(screen.getByText(/^saved /)).toBeInTheDocument();
  });

  it("a task with no saved capsule shows 'No saved state yet.' in the preview", async () => {
    mockCapsulesInvoke({ resources: [], activateTask: async () => ({}) });
    renderWithProviders(<CapsulesPage />);

    await screen.findByText(FAKE_TASK.title);
    fireEvent.click(screen.getByText("No capsule yet"));

    expect(await screen.findByText("Saved state")).toBeInTheDocument();
    expect(screen.getByText("No saved state yet.")).toBeInTheDocument();
  });

  it("newTaskRequest focuses the first project's new-task input, then clears itself; a remount after consumption does not refocus", async () => {
    // Simulates App.tsx's CurrentPage switch unmounting/remounting this page
    // when the sidebar navigates away and back — the historical bug: with a
    // never-reset counter, every remount after the first ⌘⇧N would
    // spuriously refocus/rescroll to the new-task input.
    mockInvoke.mockClear();
    mockInvoke.mockImplementation(async (cmd: string, args?: InvokeArgs) => {
      const a = args as Record<string, unknown> | undefined;
      switch (cmd) {
        case "list_projects":
          return [FAKE_PROJECT] as unknown;
        case "list_tasks":
          return (a?.projectId === FAKE_PROJECT.id ? [] : []) as unknown;
        default:
          return [] as unknown;
      }
    });

    try {
      const first = renderWithProviders(<CapsulesPage />);
      await screen.findByText(FAKE_PROJECT.name);
      const input = screen.getByPlaceholderText("New task title") as HTMLInputElement;
      expect(input).not.toHaveFocus();

      act(() => useStore.getState().requestNewTask());
      await waitFor(() => expect(input).toHaveFocus());
      expect(useStore.getState().newTaskRequest).toBe(false);

      first.unmount();
      renderWithProviders(<CapsulesPage />);
      await screen.findByText(FAKE_PROJECT.name);
      const input2 = screen.getByPlaceholderText("New task title") as HTMLInputElement;

      // Remount with the flag already false: no spurious refocus.
      expect(input2).not.toHaveFocus();

      // A fresh ⌘⇧N (requestNewTask) still focuses it post-remount.
      act(() => useStore.getState().requestNewTask());
      await waitFor(() => expect(input2).toHaveFocus());
      expect(useStore.getState().newTaskRequest).toBe(false);
    } finally {
      useStore.setState({ newTaskRequest: false });
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

/** list_projects/list_tasks/task_resources/delete_task wiring for the single
 * FAKE_PROJECT/FAKE_TASK fixture. Tracks whether delete_task has actually
 * landed so a post-commit `refresh()` (list_tasks) reflects the real backend
 * state, same as production. */
function mockCapsulesInvokeForDelete(opts?: { deleteTask?: () => unknown }) {
  mockInvoke.mockClear();
  let deleted = false;
  mockInvoke.mockImplementation(async (cmd: string, args?: InvokeArgs) => {
    const a = args as Record<string, unknown> | undefined;
    switch (cmd) {
      case "list_projects":
        return [FAKE_PROJECT] as unknown;
      case "list_tasks":
        return (a?.projectId === FAKE_PROJECT.id && !deleted ? [FAKE_TASK] : []) as unknown;
      case "task_resources":
        return (a?.taskId === FAKE_TASK.id ? [FAKE_RESOURCE] : []) as unknown;
      case "delete_task":
        if (opts?.deleteTask) return opts.deleteTask();
        deleted = true;
        return undefined as unknown;
      default:
        return [] as unknown;
    }
  });
}

describe("CapsulesPage delete (deferred undo)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("requestDelete hides the task row immediately, shows an Undo toast, and does not call delete_task yet", async () => {
    mockCapsulesInvokeForDelete();
    mockedToast().mockClear();
    renderWithProviders(<CapsulesPage />);

    await screen.findByText(FAKE_TASK.title);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.queryByText(FAKE_TASK.title)).not.toBeInTheDocument();
    expect(mockedToast()).toHaveBeenCalledTimes(1);
    const [message, options] = mockedToast().mock.calls[0];
    expect(message).toBe(`${FAKE_TASK.title} deleted`);
    expect(options.action.label).toBe("Undo");
    expect(mockInvoke).not.toHaveBeenCalledWith("delete_task", expect.anything());
  });

  it("clicking Undo restores the task row and never calls delete_task", async () => {
    mockCapsulesInvokeForDelete();
    mockedToast().mockClear();
    renderWithProviders(<CapsulesPage />);

    await screen.findByText(FAKE_TASK.title);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.queryByText(FAKE_TASK.title)).not.toBeInTheDocument();

    const [, options] = mockedToast().mock.calls[0];
    await act(async () => {
      options.action.onClick();
    });

    expect(await screen.findByText(FAKE_TASK.title)).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalledWith("delete_task", expect.anything());
  });

  it("letting the undo window elapse calls delete_task exactly once with the right id, and the row stays gone", async () => {
    mockCapsulesInvokeForDelete();
    mockedToast().mockClear();
    vi.useFakeTimers();
    try {
      renderWithProviders(<CapsulesPage />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByText(FAKE_TASK.title)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
      expect(screen.queryByText(FAKE_TASK.title)).not.toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      const deleteCalls = mockInvoke.mock.calls.filter(([cmd]) => cmd === "delete_task");
      expect(deleteCalls).toHaveLength(1);
      expect(deleteCalls[0][1]).toEqual({ id: FAKE_TASK.id });
      expect(screen.queryByText(FAKE_TASK.title)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("CapsulesPage context menu", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("right-clicking a task row opens the menu with Resume, Save State, Done, and Delete", async () => {
    mockCapsulesInvokeForDelete();
    renderWithProviders(<CapsulesPage />);

    const row = await screen.findByText(FAKE_TASK.title);
    fireEvent.contextMenu(row);

    expect(await screen.findByRole("menuitem", { name: "Resume" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Save State" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Done" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Delete/ })).toBeInTheDocument();
  });

  it("selecting Resume from the menu drives the same activate_task path as the Resume button", async () => {
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

      const row = await screen.findByText(FAKE_TASK.title);
      fireEvent.contextMenu(row);

      const resumeItem = await screen.findByRole("menuitem", { name: "Resume" });
      fireEvent.click(resumeItem);

      await waitFor(() =>
        expect(mockInvoke).toHaveBeenCalledWith("activate_task", { taskId: FAKE_TASK.id })
      );
      await waitFor(() => expect(screen.getByText("Workspace restored")).toBeInTheDocument());
    } finally {
      restoreMatchMedia();
    }
  });

  it("selecting Save State from the menu invokes save_capsule for that task", async () => {
    mockCapsulesInvokeForDelete();
    renderWithProviders(<CapsulesPage />);

    const row = await screen.findByText(FAKE_TASK.title);
    fireEvent.contextMenu(row);

    const saveItem = await screen.findByRole("menuitem", { name: "Save State" });
    fireEvent.click(saveItem);

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("save_capsule", { taskId: FAKE_TASK.id })
    );
  });

  it("selecting Done from the menu invokes set_task_status", async () => {
    mockCapsulesInvokeForDelete();
    renderWithProviders(<CapsulesPage />);

    const row = await screen.findByText(FAKE_TASK.title);
    fireEvent.contextMenu(row);

    const doneItem = await screen.findByRole("menuitem", { name: "Done" });
    fireEvent.click(doneItem);

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("set_task_status", { id: FAKE_TASK.id, status: "done" })
    );
  });

  it("selecting Delete from the menu triggers the undo flow (row hides, Undo toast, no immediate delete_task)", async () => {
    mockCapsulesInvokeForDelete();
    mockedToast().mockClear();
    renderWithProviders(<CapsulesPage />);

    const row = await screen.findByText(FAKE_TASK.title);
    fireEvent.contextMenu(row);

    const deleteItem = await screen.findByRole("menuitem", { name: /Delete/ });
    fireEvent.click(deleteItem);

    expect(screen.queryByText(FAKE_TASK.title)).not.toBeInTheDocument();
    expect(mockedToast()).toHaveBeenCalledTimes(1);
    const [message, options] = mockedToast().mock.calls[0];
    expect(message).toBe(`${FAKE_TASK.title} deleted`);
    expect(options.action.label).toBe("Undo");
    expect(mockInvoke).not.toHaveBeenCalledWith("delete_task", expect.anything());
  });
});
