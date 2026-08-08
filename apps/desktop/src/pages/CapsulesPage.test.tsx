import type { InvokeArgs } from "@tauri-apps/api/core";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components/ui/sonner";
import { expectAtMostOneAccent } from "@/test/accent";
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

function mockedSuccessToast() {
  return toast.success as unknown as ReturnType<typeof vi.fn>;
}

function mockedErrorToast() {
  return toast.error as unknown as ReturnType<typeof vi.fn>;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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
  project?: Project;
  renameTask?: (args: Record<string, unknown> | undefined) => Task | Promise<Task>;
  duplicateTask?: (args: Record<string, unknown> | undefined) => Task | Promise<Task>;
  postMutationRefresh?: () => Project[] | Promise<Project[]>;
}) {
  // Clear call history (not just the implementation) so a test that asserts
  // on `mockInvoke.mock.calls` — e.g. "exactly one activate_task call" —
  // isn't polluted by invokes from an earlier test in this file. `invoke` is
  // a single shared mock across the whole suite (see smoke-utils), and
  // nothing resets it between tests otherwise.
  mockInvoke.mockClear();
  let mutationCompleted = false;
  mockInvoke.mockImplementation(async (cmd: string, args?: InvokeArgs) => {
    const a = args as Record<string, unknown> | undefined;
    switch (cmd) {
      case "list_projects":
        if (mutationCompleted && opts.postMutationRefresh) {
          return (await opts.postMutationRefresh()) as unknown;
        }
        return [opts.project ?? FAKE_PROJECT] as unknown;
      case "list_tasks":
        return (a?.projectId === FAKE_PROJECT.id ? [FAKE_TASK] : []) as unknown;
      case "task_resources":
        return (a?.taskId === FAKE_TASK.id ? (opts.resources ?? [FAKE_RESOURCE]) : []) as unknown;
      case "activate_task":
        return opts.activateTask(a);
      case "rename_task": {
        const renamed = opts.renameTask
          ? await opts.renameTask(a)
          : { ...FAKE_TASK, title: String(a?.title) };
        mutationCompleted = true;
        return renamed as unknown;
      }
      case "duplicate_task": {
        const copy = opts.duplicateTask
          ? await opts.duplicateTask(a)
          : { ...FAKE_TASK, id: "task-2", title: `${FAKE_TASK.title} copy` };
        mutationCompleted = true;
        return copy as unknown;
      }
      default:
        return [] as unknown;
    }
  });
}

describe("CapsulesPage", () => {
  // Task 11 moved the page name into the workspace Toolbar's <h1>; Task 12
  // stripped Overview's own eyebrow/title stack to match. Capsules never got
  // the same treatment, so it rendered "Capsules" a second time via its own
  // PageHeader <h1> directly under the toolbar's. This page must not own an
  // <h1> (or restate the "TASKS" eyebrow) — but the name still needs to
  // resolve for screen readers and the findByText("Capsules") pattern
  // other tests here rely on, via a visually-hidden heading.
  it("does not render its own page title as a heading — the toolbar owns it", async () => {
    renderWithProviders(<CapsulesPage />);
    await screen.findByText("No capsules yet");

    expect(document.querySelector("h1")).not.toBeInTheDocument();
    expect(screen.queryByText("TASKS")).not.toBeInTheDocument();
    // Accessible name preserved via a visually-hidden heading.
    expect(screen.getByText("Capsules")).toBeInTheDocument();
  });

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
        expect(mockInvoke).toHaveBeenCalledWith("activate_task", { taskId: FAKE_TASK.id, focusMode: false })
      );
      await waitFor(() => expect(screen.getByText("Workspace restored")).toBeInTheDocument());

      // setActiveTaskId's effect: the task's card now shows the "Active"
      // badge (the store update from `resume`'s `run`, not a toast).
      expect(await screen.findByText("Active")).toBeInTheDocument();
    } finally {
      restoreMatchMedia();
    }
  });

  it("passes focusMode to activate_task", async () => {
    // Off by default: every Resume today is non-destructive, and that is not
    // a promise to withdraw quietly.
    const restoreMatchMedia = stubReducedMotion();
    mockCapsulesInvoke({
      activateTask: async () => ({
        applied: ["git"],
        pending: [],
        skipped: [],
        savedPrevious: null,
        errors: [],
        closed: [],
        kept: [],
      }),
    });

    try {
      renderWithProviders(<CapsulesPage />);

      const resumeButton = await screen.findByRole("button", { name: "Resume" });
      fireEvent.click(resumeButton);

      await waitFor(() =>
        expect(mockInvoke).toHaveBeenCalledWith("activate_task", {
          taskId: FAKE_TASK.id,
          focusMode: false,
        })
      );
    } finally {
      restoreMatchMedia();
    }
  });

  it("passes focusMode: true to activate_task when the pref is on", async () => {
    // The previous test alone can't rule out a hard-coded `false` — this
    // proves the call site actually reads the pref.
    const restoreMatchMedia = stubReducedMotion();
    mockCapsulesInvoke({
      activateTask: async () => ({
        applied: ["git"],
        pending: [],
        skipped: [],
        savedPrevious: null,
        errors: [],
        closed: [],
        kept: [],
      }),
    });
    act(() => {
      useStore.getState().setPref("focusMode", true);
    });

    try {
      renderWithProviders(<CapsulesPage />);

      const resumeButton = await screen.findByRole("button", { name: "Resume" });
      fireEvent.click(resumeButton);

      await waitFor(() =>
        expect(mockInvoke).toHaveBeenCalledWith("activate_task", {
          taskId: FAKE_TASK.id,
          focusMode: true,
        })
      );
    } finally {
      restoreMatchMedia();
      act(() => {
        useStore.getState().setPref("focusMode", false);
      });
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

  it("disables Resume for a task with no saved capsule (nothing to restore yet)", async () => {
    mockCapsulesInvoke({
      resources: [],
      activateTask: async () => ({}),
    });
    renderWithProviders(<CapsulesPage />);

    // With nothing saved, Resume would be a confusing no-op, so it's held back
    // until a capsule exists; Save State stays available as the first step.
    const resumeButton = await screen.findByRole("button", { name: "Resume" });
    expect(resumeButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save State" })).toBeEnabled();
    // No activation is attempted on the empty capsule.
    expect(mockInvoke).not.toHaveBeenCalledWith("activate_task", expect.anything());
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

  it("a task with no saved capsule shows an actionable hint, not a dead popover", async () => {
    mockCapsulesInvoke({ resources: [], activateTask: async () => ({}) });
    renderWithProviders(<CapsulesPage />);

    await screen.findByText(FAKE_TASK.title);
    // The empty capsule now teaches the first move rather than opening an
    // empty "No capsule yet" popover.
    expect(screen.getByText(/Nothing saved yet/i)).toBeInTheDocument();
    expect(screen.queryByText("No capsule yet")).not.toBeInTheDocument();
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
        expect(mockInvoke).toHaveBeenCalledWith("activate_task", { taskId: FAKE_TASK.id, focusMode: false })
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

  it("spends the accent at most once with no active task", async () => {
    // activeTaskId is module-level store state shared across this file's
    // tests; an earlier test (the real resume() flow, around line ~220)
    // calls the production setActiveTaskId(t.id) and leaves it set to
    // FAKE_TASK.id with no cleanup. Reset it explicitly so this test's own
    // premise — "no active task" — actually holds, regardless of test
    // execution order.
    useStore.setState({ activeTaskId: null });
    mockCapsulesInvoke({ activateTask: async () => ({}) });
    const { container } = renderWithProviders(<CapsulesPage />);
    await screen.findByText(FAKE_TASK.title);
    // No active task: Resume stays outline (this page's Restore-gating
    // rule), and the leading marker dot renders transparent, not bg-primary.
    expectAtMostOneAccent(container);
    // Direct half of the isActive && hasCapsule gate: this row has a
    // capsule (default FAKE_RESOURCE) but is not the active task, so its
    // Resume button must NOT carry the primary accent fill. Without this,
    // a test that only budgets total accents can't tell "no active task"
    // from "the gate is broken and Resume defaults to primary" — both
    // would still pass expectAtMostOneAccent as long as nothing else
    // accents.
    expect(screen.getByRole("button", { name: "Resume" })).not.toHaveClass("bg-primary");
  });

  it("spends the accent at most once when a capsule's task is active (marker + primary Resume together)", async () => {
    // Presets activeTaskId directly (rather than driving the real resume()
    // flow) so the Restore Experience sheet — which carries its own
    // internal bg-primary progress fill, a separate concern from this
    // page's one-accent budget — never opens and contaminates the count.
    mockCapsulesInvoke({ activateTask: async () => ({}) });
    useStore.setState({ activeTaskId: FAKE_TASK.id });
    try {
      const { container } = renderWithProviders(<CapsulesPage />);
      await screen.findByText(FAKE_TASK.title);
      // Wait for the resource-derived render ("on main", from FAKE_RESOURCE)
      // so the hasCapsule-gated Resume variant has actually settled before
      // asserting on it.
      expect(await screen.findByText("on main")).toBeInTheDocument();

      // The active row's own "you are here" dot is a real bg-primary fill,
      // exempted via data-accent-mark; the Resume button (variant="primary"
      // because this task is both active and has a capsule) is the page's
      // one real accent action.
      const marker = container.querySelector("[data-accent-mark]");
      expect(marker).not.toBeNull();

      // Direct half of the isActive && hasCapsule gate: prove the Resume
      // button itself genuinely switched to the primary fill, rather than
      // merely trusting the one-accent budget below. expectAtMostOneAccent
      // alone can't distinguish "the gate correctly promoted Resume to
      // primary" from "the gate is broken and Resume never accents at all"
      // — both leave the page at <=1 accents. Paired with the negative
      // assertion in the no-active-task test above (same hasCapsule=true
      // row, isActive=false, Resume must NOT be bg-primary), this pins the
      // gate from both sides.
      expect(screen.getByRole("button", { name: "Resume" })).toHaveClass("bg-primary");

      expectAtMostOneAccent(container);
    } finally {
      useStore.setState({ activeTaskId: null });
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

    // Delete now lives in the overflow (danger tucked away); the row's
    // right-click menu is the quickest programmatic path to it.
    fireEvent.contextMenu(await screen.findByText(FAKE_TASK.title));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Delete/ }));

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

    fireEvent.contextMenu(await screen.findByText(FAKE_TASK.title));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Delete/ }));
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

      fireEvent.contextMenu(screen.getByText(FAKE_TASK.title));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      fireEvent.click(screen.getByRole("menuitem", { name: /Delete/ }));
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
    mockedSuccessToast().mockClear();
    mockedErrorToast().mockClear();
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

  it("renames a capsule through rename_task", async () => {
    mockCapsulesInvoke({ activateTask: async () => ({}) });
    renderWithProviders(<CapsulesPage />);

    fireEvent.contextMenu(await screen.findByText(FAKE_TASK.title));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Rename" }));

    const title = await screen.findByLabelText("Capsule title");
    fireEvent.change(title, { target: { value: "Enterprise launch" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("rename_task", {
        id: FAKE_TASK.id,
        title: "Enterprise launch",
      })
    );
  });

  it("trims surrounding whitespace from a renamed capsule title", async () => {
    mockCapsulesInvoke({ activateTask: async () => ({}) });
    renderWithProviders(<CapsulesPage />);

    fireEvent.contextMenu(await screen.findByText(FAKE_TASK.title));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Rename" }));

    fireEvent.change(await screen.findByLabelText("Capsule title"), {
      target: { value: "  Enterprise launch  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("rename_task", {
        id: FAKE_TASK.id,
        title: "Enterprise launch",
      })
    );
  });

  it("shows rename errors and does not show success when rename_task rejects", async () => {
    mockCapsulesInvoke({
      activateTask: async () => ({}),
      renameTask: async () => {
        throw new Error("rename failed");
      },
    });
    renderWithProviders(<CapsulesPage />);

    fireEvent.contextMenu(await screen.findByText(FAKE_TASK.title));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Rename" }));
    fireEvent.click(await screen.findByRole("button", { name: "Rename" }));

    await waitFor(() => expect(mockedErrorToast()).toHaveBeenCalledWith("Error: rename failed"));
    expect(mockedSuccessToast()).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Rename capsule" })).toBeInTheDocument();
  });

  it("keeps rename a success when only the post-rename refresh fails", async () => {
    mockCapsulesInvoke({
      activateTask: async () => ({}),
      postMutationRefresh: async () => {
        throw new Error("rename refresh failed");
      },
    });
    renderWithProviders(<CapsulesPage />);

    fireEvent.contextMenu(await screen.findByText(FAKE_TASK.title));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Rename" }));
    fireEvent.click(await screen.findByRole("button", { name: "Rename" }));

    // The rename committed, so success is reported and the dialog closes even
    // though the follow-up refresh failed — that error is swallowed, never
    // surfaced as a rename failure for an edit that actually persisted.
    await waitFor(() => expect(mockedSuccessToast()).toHaveBeenCalledWith("Capsule renamed", undefined));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Rename capsule" })).not.toBeInTheDocument()
    );
    expect(mockedErrorToast()).not.toHaveBeenCalled();
  });

  it("disables rename submission while rename_task is pending", async () => {
    const pendingRename = deferred<Task>();
    mockCapsulesInvoke({
      activateTask: async () => ({}),
      renameTask: () => pendingRename.promise,
    });
    renderWithProviders(<CapsulesPage />);

    fireEvent.contextMenu(await screen.findByText(FAKE_TASK.title));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Rename" }));
    const renameButton = await screen.findByRole("button", { name: "Rename" });
    fireEvent.click(renameButton);

    await waitFor(() => expect(renameButton).toBeDisabled());

    pendingRename.resolve({ ...FAKE_TASK, title: FAKE_TASK.title });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Rename capsule" })).not.toBeInTheDocument()
    );
  });

  it("duplicates a capsule without activating it", async () => {
    mockCapsulesInvoke({ activateTask: async () => ({}) });
    renderWithProviders(<CapsulesPage />);

    fireEvent.contextMenu(await screen.findByText(FAKE_TASK.title));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Duplicate" }));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("duplicate_task", { id: FAKE_TASK.id }));
    expect(mockInvoke).not.toHaveBeenCalledWith("activate_task", expect.anything());
  });

  it("shows duplicate errors and does not show success when duplicate_task rejects", async () => {
    mockCapsulesInvoke({
      activateTask: async () => ({}),
      duplicateTask: async () => {
        throw new Error("duplicate failed");
      },
    });
    renderWithProviders(<CapsulesPage />);

    fireEvent.contextMenu(await screen.findByText(FAKE_TASK.title));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Duplicate" }));

    await waitFor(() => expect(mockedErrorToast()).toHaveBeenCalledWith("Error: duplicate failed"));
    expect(mockedSuccessToast()).not.toHaveBeenCalled();
  });

  it("keeps duplicate a success when only the post-duplicate refresh fails", async () => {
    mockCapsulesInvoke({
      activateTask: async () => ({}),
      postMutationRefresh: async () => {
        throw new Error("duplicate refresh failed");
      },
    });
    renderWithProviders(<CapsulesPage />);

    fireEvent.contextMenu(await screen.findByText(FAKE_TASK.title));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Duplicate" }));

    // The duplicate committed, so success is reported even though the refresh
    // failed afterwards (swallowed, not shown as a duplicate failure).
    await waitFor(() =>
      expect(mockedSuccessToast()).toHaveBeenCalledWith("Capsule duplicated", {
        description: `${FAKE_TASK.title} copy`,
      })
    );
    expect(mockedErrorToast()).not.toHaveBeenCalled();
  });

  it("disables capsule actions while duplicate_task is pending", async () => {
    const pendingDuplicate = deferred<Task>();
    mockCapsulesInvoke({
      activateTask: async () => ({}),
      duplicateTask: () => pendingDuplicate.promise,
    });
    renderWithProviders(<CapsulesPage />);

    fireEvent.contextMenu(await screen.findByText(FAKE_TASK.title));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Duplicate" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Resume" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Save State" })).toBeDisabled();
    // Done/Rename/Duplicate/Delete now live behind the overflow ⋯ trigger;
    // disabling that trigger makes all of them unreachable while busy.
    expect(
      screen.getByRole("button", { name: `More actions for ${FAKE_TASK.title}` })
    ).toBeDisabled();

    pendingDuplicate.resolve({
      ...FAKE_TASK,
      id: "task-2",
      title: `${FAKE_TASK.title} copy`,
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Resume" })).toBeEnabled());
  });

  it("shows persisted last-session duration only when available", async () => {
    mockCapsulesInvoke({
      activateTask: async () => ({}),
      project: { ...FAKE_PROJECT, activeSeconds: 8220 },
    });
    renderWithProviders(<CapsulesPage />);

    fireEvent.click(await screen.findByText("on main"));

    expect(await screen.findByText("Last session 2h 17m")).toBeInTheDocument();
  });

  it("does not show a last-session claim when persisted duration is zero", async () => {
    mockCapsulesInvoke({ activateTask: async () => ({}) });
    renderWithProviders(<CapsulesPage />);

    fireEvent.click(await screen.findByText("on main"));

    expect(await screen.findByText("Saved state")).toBeInTheDocument();
    expect(screen.queryByText(/Last session/)).not.toBeInTheDocument();
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
        expect(mockInvoke).toHaveBeenCalledWith("activate_task", { taskId: FAKE_TASK.id, focusMode: false })
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

describe("CapsulesPage keepCompleted (Settings → Behavior)", () => {
  afterEach(() => {
    // Restore the default so the shared store doesn't leak into other suites.
    act(() => {
      useStore.getState().setPref("keepCompleted", true);
    });
  });

  it("hides done capsules when Keep completed is off, and keeps them when on", async () => {
    const openTask: Task = { ...FAKE_TASK, id: "t-open", title: "Open capsule", status: "open" };
    const doneTask: Task = { ...FAKE_TASK, id: "t-done", title: "Done capsule", status: "done" };
    mockInvoke.mockClear();
    mockInvoke.mockImplementation(async (cmd: string, args?: InvokeArgs) => {
      const a = args as Record<string, unknown> | undefined;
      switch (cmd) {
        case "list_projects":
          return [FAKE_PROJECT] as unknown;
        case "list_tasks":
          return (a?.projectId === FAKE_PROJECT.id ? [openTask, doneTask] : []) as unknown;
        case "active_task":
          return null as unknown;
        default:
          return [] as unknown; // task_resources, etc.
      }
    });

    act(() => {
      useStore.getState().setPref("keepCompleted", true);
    });
    renderWithProviders(<CapsulesPage />);

    // Kept: both the open and the done capsule are listed.
    expect(await screen.findByText("Open capsule")).toBeInTheDocument();
    expect(screen.getByText("Done capsule")).toBeInTheDocument();

    // Turning it off drops the finished capsule; the open one stays.
    act(() => {
      useStore.getState().setPref("keepCompleted", false);
    });
    await waitFor(() => expect(screen.queryByText("Done capsule")).not.toBeInTheDocument());
    expect(screen.getByText("Open capsule")).toBeInTheDocument();
  });
});
