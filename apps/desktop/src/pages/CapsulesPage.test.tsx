import type { InvokeArgs } from "@tauri-apps/api/core";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components/ui/sonner";
import { expectAtMostOneAccent } from "@/test/accent";
import { mockInvoke, renderWithProviders } from "@/test/smoke-utils";
import { useStore, type Project, type Task, type TaskResource } from "@/store";
import { CapsulesPage } from "./CapsulesPage";

// The delete flow's Undo toast goes through the sonner `toast` function
// directly (not toastOk/toastErr) — mocked so tests can inspect the
// message/action without needing an actual <Toaster/> mounted.
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
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
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
 * instead of the full animation timeline — these tests are about the
 * CapsulesPage <-> useRestore wiring, not the animation. */
function stubReducedMotion(): () => void {
  const original = window.matchMedia;
  window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
  return () => {
    if (original) window.matchMedia = original;
    // @ts-expect-error - test cleanup restoring an absent global
    else delete window.matchMedia;
  };
}

/** Resets the store fields this page reads, so a filter or selection left
 * behind by one test can't decide what the next one renders. */
function resetSelection() {
  useStore.setState({
    selectedCapsuleId: null,
    capsuleFilter: "open",
    activeTaskId: null,
    pendingResumeTaskId: null,
    newTaskRequest: false,
    connectors: [],
  });
}

function mockCapsulesInvoke(opts: {
  activateTask?: (args: Record<string, unknown> | undefined) => unknown;
  /** What `active_task` resolves to. The page fetches it on mount — it is
   * shell-wide state and Capsules is the default landing page — so seeding
   * `activeTaskId` in the store alone is not enough. */
  activeTask?: string | null;
  resources?: TaskResource[];
  project?: Project;
  tasks?: Task[];
  renameTask?: (args: Record<string, unknown> | undefined) => Task | Promise<Task>;
  duplicateTask?: (args: Record<string, unknown> | undefined) => Task | Promise<Task>;
  postMutationRefresh?: () => Project[] | Promise<Project[]>;
} = {}) {
  resetSelection();
  // Clear call history (not just the implementation): `invoke` is a single
  // shared mock across the suite, and a test asserting "exactly one
  // activate_task call" would otherwise see an earlier test's.
  mockInvoke.mockClear();
  let mutationCompleted = false;
  const tasks = opts.tasks ?? [FAKE_TASK];
  mockInvoke.mockImplementation(async (cmd: string, args?: InvokeArgs) => {
    const a = args as Record<string, unknown> | undefined;
    switch (cmd) {
      case "list_projects":
        if (mutationCompleted && opts.postMutationRefresh) {
          return (await opts.postMutationRefresh()) as unknown;
        }
        return [opts.project ?? FAKE_PROJECT] as unknown;
      case "list_tasks":
        return tasks.filter((t) => t.projectId === a?.projectId) as unknown;
      case "task_resources":
        return (a?.taskId === FAKE_TASK.id ? (opts.resources ?? [FAKE_RESOURCE]) : []) as unknown;
      case "active_task":
        return (opts.activeTask ?? null) as unknown;
      case "activate_task":
        return opts.activateTask ? opts.activateTask(a) : { restored: [], skipped: [] };
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

/** The master list and the detail pane both name the selected capsule, so
 * every title assertion has to say which one it means. */
function list() {
  return within(document.querySelector("[data-capsule-list]") as HTMLElement);
}
function detail() {
  return within(document.querySelector("[data-capsule-detail]") as HTMLElement);
}

/** Opens the detail pane's ⋯ menu for the selected capsule.
 *
 * `vi.waitFor` rather than testing-library's `findBy*`: one test below runs
 * on fake timers to walk the delete undo window forward, and `findBy*`
 * polls on the real clock, which never ticks there. */
async function openMoreMenu(title = FAKE_TASK.title) {
  const trigger = await vi.waitFor(() =>
    screen.getByRole("button", { name: `More actions for ${title}` }),
  );
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  return vi.waitFor(() => screen.getByRole("menu"));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("CapsulesPage shell state", () => {
  // The sidebar's Projects count reads the store, and the sidebar is
  // visible from this screen. Keeping the fetched projects in local state
  // is what made that count read 0 while this page listed capsules grouped
  // under three project names.
  it("publishes the projects it fetched to the store", async () => {
    mockCapsulesInvoke();
    renderWithProviders(<CapsulesPage />);
    await screen.findByRole("heading", { level: 2, name: FAKE_TASK.title });
    expect(useStore.getState().projects.map((p) => p.id)).toEqual([FAKE_PROJECT.id]);
  });

  it("fetches the active capsule on mount rather than trusting whatever was left in the store", async () => {
    mockCapsulesInvoke({ activeTask: FAKE_TASK.id });
    useStore.setState({ activeTaskId: null });
    renderWithProviders(<CapsulesPage />);
    await waitFor(() => expect(useStore.getState().activeTaskId).toBe(FAKE_TASK.id));
  });
});

describe("CapsulesPage layout", () => {
  // The Toolbar owns the view's <h1>; the detail pane's capsule title is the
  // selected item *within* that view, so it takes the 22px screen-title size
  // but the heading level below it.
  it("does not own the document's top heading", async () => {
    mockCapsulesInvoke();
    renderWithProviders(<CapsulesPage />);
    await screen.findByRole("heading", { level: 2, name: FAKE_TASK.title });
    expect(document.querySelector("h1")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: FAKE_TASK.title })).toBeInTheDocument();
  });

  it("groups the master list by project and counts what's showing", async () => {
    mockCapsulesInvoke({
      tasks: [
        FAKE_TASK,
        { ...FAKE_TASK, id: "task-2", title: "Second capsule" },
      ],
    });
    renderWithProviders(<CapsulesPage />);
    await screen.findByText("Second capsule");
    expect(screen.getByText(FAKE_PROJECT.name)).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("selects a capsule on click and keeps the selected row neutral", async () => {
    mockCapsulesInvoke({
      tasks: [FAKE_TASK, { ...FAKE_TASK, id: "task-2", title: "Second capsule" }],
    });
    const { container } = renderWithProviders(<CapsulesPage />);
    await screen.findByRole("heading", { level: 2, name: FAKE_TASK.title });
    fireEvent.click(list().getByText("Second capsule").closest("button")!);

    expect(useStore.getState().selectedCapsuleId).toBe("task-2");
    // DELIBERATE DIVERGENCE, same as the sidebar's: the handoff fills the
    // selected row with the accent. A permanent accent fill here would
    // compete with Restore, which is the actual action.
    const selectedRow = list().getByText("Second capsule").closest("button")!;
    expect(selectedRow.className.split(/\s+/)).toContain("bg-secondary");
    expect(selectedRow.className.split(/\s+/)).not.toContain("bg-primary");
    expectAtMostOneAccent(container);
  });

  it("falls back to the first row when the selected id no longer exists", async () => {
    mockCapsulesInvoke();
    useStore.setState({ selectedCapsuleId: "task-that-was-deleted" });
    renderWithProviders(<CapsulesPage />);
    // The detail pane renders the surviving capsule rather than nothing.
    expect(await screen.findByRole("heading", { level: 2, name: FAKE_TASK.title })).toBeInTheDocument();
  });

  it("filters to Done and back, and says so when a filter is empty", async () => {
    mockCapsulesInvoke({
      tasks: [FAKE_TASK, { ...FAKE_TASK, id: "task-done", title: "Finished thing", status: "done" }],
    });
    renderWithProviders(<CapsulesPage />);
    await screen.findByRole("heading", { level: 2, name: FAKE_TASK.title });

    fireEvent.click(screen.getByRole("radio", { name: "Done" }));
    await waitFor(() => expect(list().getByText("Finished thing")).toBeInTheDocument());
    expect(list().queryByText(FAKE_TASK.title)).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "Open" }));
    await waitFor(() => expect(list().getByText(FAKE_TASK.title)).toBeInTheDocument());
  });
});

describe("CapsulesPage detail pane", () => {
  it("shows where the capsule lives and when it was captured", async () => {
    mockCapsulesInvoke({
      resources: [{ ...FAKE_RESOURCE, payload: { branch: "feat/onboarding" } }],
    });
    renderWithProviders(<CapsulesPage />);
    await screen.findByRole("heading", { level: 2, name: FAKE_TASK.title });
    expect(detail().getByText(/Test Project/)).toBeInTheDocument();
    expect(detail().getByText("feat/onboarding")).toBeInTheDocument();
  });

  it("marks the active capsule Active and the finished one Done", async () => {
    mockCapsulesInvoke({ activeTask: FAKE_TASK.id });
    const { container } = renderWithProviders(<CapsulesPage />);
    expect(await screen.findByText("Active")).toBeInTheDocument();
    // The Active chip's dot is the accent, but it is a mark, not an action.
    expect(container.querySelector("[data-accent-mark]")).not.toBeNull();
    expectAtMostOneAccent(container);
  });

  // The honest bit. The handoff hard-codes this to Chrome's "on next
  // reload"; this app's Chrome connector really does reopen tabs live, so
  // the amber case is the one that's actually true here — a captured tool
  // that isn't running right now.
  it("says which captured tools will restore now and which are waiting on a reconnect", async () => {
    mockCapsulesInvoke({
      resources: [
        FAKE_RESOURCE,
        {
          ...FAKE_RESOURCE,
          id: "res-2",
          connectorKind: "chrome",
          payload: { tabs: ["a", "b", "c"] },
        },
      ],
    });
    useStore.setState({
      connectors: [
        {
          id: "c1",
          name: "Chrome",
          kind: "chrome",
          capabilities: [],
          connected: false,
          connectedSince: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    renderWithProviders(<CapsulesPage />);

    expect(await screen.findByText("What's inside")).toBeInTheDocument();
    expect(screen.getByText("3 tabs")).toBeInTheDocument();
    expect(screen.getByText("when Chrome reconnects")).toBeInTheDocument();
    // Git is not a connector — it's read off the repo, so it never waits.
    expect(screen.getAllByText("restores now").length).toBeGreaterThanOrEqual(1);
  });

  it("offers Capture as the only action for a never-captured capsule, with its own empty state", async () => {
    mockCapsulesInvoke({ resources: [] });
    renderWithProviders(<CapsulesPage />);
    await screen.findByRole("heading", { level: 2, name: FAKE_TASK.title });

    expect(screen.queryByRole("button", { name: /Restore/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Capture/ })).toBeInTheDocument();
    expect(screen.getByText("Nothing captured yet")).toBeInTheDocument();
    expect(detail().getByText(/never captured/)).toBeInTheDocument();
    expect(screen.queryByText("What's inside")).toBeNull();
  });

  // Product requirement, not decoration: the handoff calls this copy the
  // app's positioning and asks for it verbatim.
  it("carries the privacy footer verbatim", async () => {
    mockCapsulesInvoke();
    renderWithProviders(<CapsulesPage />);
    expect(
      await screen.findByText(
        "Saves paths, URLs and branch names — never your files, pages or passwords.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Restore puts your editor, tabs and branch back the way you left them."),
    ).toBeInTheDocument();
  });
});

describe("CapsulesPage restore", () => {
  it("opens the Restore Experience sheet and passes focusMode to activate_task", async () => {
    const restoreMotion = stubReducedMotion();
    const gate = deferred<{ restored: string[]; skipped: string[] }>();
    mockCapsulesInvoke({ activateTask: () => gate.promise });
    useStore.setState({ prefs: { ...useStore.getState().prefs, focusMode: true } });

    try {
      renderWithProviders(<CapsulesPage />);
      fireEvent.click(await screen.findByRole("button", { name: /Restore/ }));

      await waitFor(() =>
        expect(mockInvoke).toHaveBeenCalledWith("activate_task", {
          taskId: FAKE_TASK.id,
          focusMode: true,
        }),
      );

      await act(async () => {
        gate.resolve({ restored: ["git"], skipped: [] });
        await gate.promise;
      });
      await waitFor(() => expect(useStore.getState().activeTaskId).toBe(FAKE_TASK.id));
    } finally {
      useStore.setState({ prefs: { ...useStore.getState().prefs, focusMode: false } });
      restoreMotion();
    }
  });

  it("does not fire a second activate_task while one is in flight", async () => {
    const restoreMotion = stubReducedMotion();
    const gate = deferred<{ restored: string[]; skipped: string[] }>();
    mockCapsulesInvoke({ activateTask: () => gate.promise });

    try {
      renderWithProviders(<CapsulesPage />);
      const button = await screen.findByRole("button", { name: /Restore/ });
      fireEvent.click(button);
      await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("activate_task", expect.anything()));
      fireEvent.click(button);

      const calls = mockInvoke.mock.calls.filter(([cmd]) => cmd === "activate_task");
      expect(calls).toHaveLength(1);

      await act(async () => {
        gate.resolve({ restored: [], skipped: [] });
        await gate.promise;
      });
    } finally {
      restoreMotion();
    }
  });

  it("consumes a palette-initiated resume through the same path, then clears it", async () => {
    const restoreMotion = stubReducedMotion();
    const gate = deferred<{ restored: string[]; skipped: string[] }>();
    mockCapsulesInvoke({ activateTask: () => gate.promise });

    try {
      renderWithProviders(<CapsulesPage />);
      await screen.findByRole("heading", { level: 2, name: FAKE_TASK.title });
      act(() => useStore.getState().requestResume(FAKE_TASK.id));

      await waitFor(() =>
        expect(mockInvoke).toHaveBeenCalledWith("activate_task", {
          taskId: FAKE_TASK.id,
          focusMode: false,
        }),
      );
      expect(useStore.getState().pendingResumeTaskId).toBeNull();
      expect(useStore.getState().selectedCapsuleId).toBe(FAKE_TASK.id);

      await act(async () => {
        gate.resolve({ restored: [], skipped: [] });
        await gate.promise;
      });
    } finally {
      restoreMotion();
    }
  });
});

describe("CapsulesPage capture and create", () => {
  it("captures the selected capsule through save_capsule", async () => {
    mockCapsulesInvoke();
    renderWithProviders(<CapsulesPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Capture/ }));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("save_capsule", { taskId: FAKE_TASK.id }),
    );
  });

  // A capsule belongs to a project — the composer adds it to the one you're
  // looking at, not to whichever project happens to sort first.
  it("adds a capsule to the selected capsule's project and selects the new one", async () => {
    mockCapsulesInvoke();
    mockInvoke.mockImplementation((async (cmd: string, args?: InvokeArgs) => {
      const a = args as Record<string, unknown> | undefined;
      if (cmd === "list_projects") return [FAKE_PROJECT];
      if (cmd === "list_tasks") return a?.projectId === FAKE_PROJECT.id ? [FAKE_TASK] : [];
      if (cmd === "task_resources") return [FAKE_RESOURCE];
      if (cmd === "create_task") return { ...FAKE_TASK, id: "task-new", title: String(a?.title) };
      return [];
    }) as never);

    renderWithProviders(<CapsulesPage />);
    const input = await screen.findByPlaceholderText("New capsule");
    fireEvent.change(input, { target: { value: "  Trim me  " } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("create_task", {
        projectId: FAKE_PROJECT.id,
        title: "Trim me",
      }),
    );
    await waitFor(() => expect(useStore.getState().selectedCapsuleId).toBe("task-new"));
  });

  it("focuses the composer on a new-capsule request, then clears it", async () => {
    mockCapsulesInvoke();
    const view = renderWithProviders(<CapsulesPage />);
    const input = await screen.findByPlaceholderText("New capsule");

    act(() => useStore.getState().requestNewTask());
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(useStore.getState().newTaskRequest).toBe(false);

    // Consumed means consumed: remounting must not steal focus again.
    view.unmount();
    mockCapsulesInvoke();
    renderWithProviders(<CapsulesPage />);
    const remounted = await screen.findByPlaceholderText("New capsule");
    expect(document.activeElement).not.toBe(remounted);
  });
});

describe("CapsulesPage ⋯ menu", () => {
  it("renames a capsule, trimming the title", async () => {
    mockCapsulesInvoke();
    renderWithProviders(<CapsulesPage />);
    await openMoreMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));

    const field = await screen.findByLabelText("Capsule title");
    fireEvent.change(field, { target: { value: "  Renamed capsule  " } });
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("rename_task", {
        id: FAKE_TASK.id,
        title: "Renamed capsule",
      }),
    );
    await waitFor(() => expect(mockedSuccessToast()).toHaveBeenCalled());
  });

  it("reports a rename failure and claims no success", async () => {
    mockCapsulesInvoke({
      renameTask: () => {
        throw new Error("db locked");
      },
    });
    mockedSuccessToast().mockClear();
    mockedErrorToast().mockClear();
    renderWithProviders(<CapsulesPage />);
    await openMoreMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    fireEvent.change(await screen.findByLabelText("Capsule title"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));

    await waitFor(() => expect(mockedErrorToast()).toHaveBeenCalled());
    expect(mockedSuccessToast()).not.toHaveBeenCalled();
  });

  // A refresh blip after a committed write must not read as a failed write.
  it("keeps a rename a success when only the post-rename refresh fails", async () => {
    mockCapsulesInvoke({
      postMutationRefresh: () => {
        throw new Error("refresh blew up");
      },
    });
    mockedSuccessToast().mockClear();
    mockedErrorToast().mockClear();
    renderWithProviders(<CapsulesPage />);
    await openMoreMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    fireEvent.change(await screen.findByLabelText("Capsule title"), { target: { value: "y" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));

    await waitFor(() => expect(mockedSuccessToast()).toHaveBeenCalled());
    expect(mockedErrorToast()).not.toHaveBeenCalled();
  });

  it("duplicates a capsule without activating it", async () => {
    mockCapsulesInvoke();
    renderWithProviders(<CapsulesPage />);
    await openMoreMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("duplicate_task", { id: FAKE_TASK.id }));
    expect(mockInvoke).not.toHaveBeenCalledWith("activate_task", expect.anything());
  });

  it("marks a capsule done through set_task_status", async () => {
    mockCapsulesInvoke();
    renderWithProviders(<CapsulesPage />);
    await openMoreMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Mark done" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("set_task_status", { id: FAKE_TASK.id, status: "done" }),
    );
  });
});

describe("CapsulesPage delete (deferred undo)", () => {
  it("hides the row and offers Undo before it commits anything", async () => {
    mockCapsulesInvoke();
    mockedToast().mockClear();
    renderWithProviders(<CapsulesPage />);
    await openMoreMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

    await waitFor(() => expect(list().queryByText(FAKE_TASK.title)).toBeNull());
    expect(mockedToast()).toHaveBeenCalled();
    expect(mockInvoke).not.toHaveBeenCalledWith("delete_task", expect.anything());
  });

  it("restores the row on Undo and never calls delete_task", async () => {
    mockCapsulesInvoke();
    mockedToast().mockClear();
    renderWithProviders(<CapsulesPage />);
    await openMoreMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    await waitFor(() => expect(list().queryByText(FAKE_TASK.title)).toBeNull());

    const options = mockedToast().mock.calls.at(-1)?.[1] as
      | { action?: { onClick?: () => void } }
      | undefined;
    act(() => options?.action?.onClick?.());

    await waitFor(() => expect(list().getByText(FAKE_TASK.title)).toBeInTheDocument());
    expect(mockInvoke).not.toHaveBeenCalledWith("delete_task", expect.anything());
  });

  it("commits exactly once when the undo window elapses", async () => {
    vi.useFakeTimers();
    try {
      mockCapsulesInvoke();
      mockedToast().mockClear();
      renderWithProviders(<CapsulesPage />);
      await vi.waitFor(() => expect(list().queryByText(FAKE_TASK.title)).not.toBeNull());
      await openMoreMenu();
      fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
      await vi.waitFor(() => expect(list().queryByText(FAKE_TASK.title)).toBeNull());

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });

      const deletes = mockInvoke.mock.calls.filter(([cmd]) => cmd === "delete_task");
      expect(deletes).toHaveLength(1);
      expect(deletes[0][1]).toEqual({ id: FAKE_TASK.id });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("CapsulesPage keepCompleted (Settings → Behavior)", () => {
  it("keeps done capsules in the Open list only when the preference is on", async () => {
    const doneTask: Task = { ...FAKE_TASK, id: "task-done", title: "Finished thing", status: "done" };
    mockCapsulesInvoke({ tasks: [FAKE_TASK, doneTask] });
    useStore.setState({ prefs: { ...useStore.getState().prefs, keepCompleted: true } });

    const view = renderWithProviders(<CapsulesPage />);
    await waitFor(() => expect(list().getByText("Finished thing")).toBeInTheDocument());
    view.unmount();

    mockCapsulesInvoke({ tasks: [FAKE_TASK, doneTask] });
    useStore.setState({ prefs: { ...useStore.getState().prefs, keepCompleted: false } });
    renderWithProviders(<CapsulesPage />);
    await screen.findByRole("heading", { level: 2, name: FAKE_TASK.title });
    expect(list().queryByText("Finished thing")).toBeNull();

    // Still reachable — the Done filter is what owns finished capsules now.
    fireEvent.click(screen.getByRole("radio", { name: "Done" }));
    await waitFor(() => expect(list().getByText("Finished thing")).toBeInTheDocument());

    useStore.setState({ prefs: { ...useStore.getState().prefs, keepCompleted: true } });
  });
});
