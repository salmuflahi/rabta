import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components/ui/sonner";
import { expectAtMostOneAccent } from "@/test/accent";
import { mockInvoke, renderWithProviders } from "@/test/smoke-utils";
import { useStore, type Project } from "@/store";
import { ProjectsPage } from "./ProjectsPage";

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

const ARCHIVED_PROJECT: Project = {
  ...FAKE_PROJECT,
  id: "archived-1",
  name: "Archived Project",
  archivedAt: "2026-02-01T00:00:00.000Z",
  sortOrder: 4,
};

const SECOND_PROJECT: Project = {
  ...FAKE_PROJECT,
  id: "proj-2",
  name: "Second Project",
  repoPath: "/tmp/second-project",
  sortOrder: 1,
};

describe("ProjectsPage", () => {
  beforeEach(() => {
    useStore.setState({ newProjectRequest: false });
  });

  it("renders without throwing (catches missing-provider crashes)", async () => {
    renderWithProviders(<ProjectsPage />);
    expect(await screen.findByText("Projects")).toBeInTheDocument();
  });

  it("spends the accent at most once", async () => {
    const { container } = renderWithProviders(<ProjectsPage />);
    await screen.findByText("Projects");
    expectAtMostOneAccent(container);
  });

  // expectAtMostOneAccent alone is vacuous — it passes whether or not the
  // primary action renders at all. Pin the lower bound too: the toolbar's
  // "Register Project" (this page's one primary) must actually carry
  // bg-primary, even though the empty state's own duplicate CTA (rendered
  // alongside it here) shares the same accessible name.
  it("marks the toolbar's Register Project action as the primary accent", async () => {
    renderWithProviders(<ProjectsPage />);
    await screen.findByText("Projects");
    const registerButtons = screen.getAllByRole("button", { name: "Register Project" });
    const primaryButtons = registerButtons.filter((button) =>
      button.classList.contains("bg-primary"),
    );
    expect(primaryButtons).toHaveLength(1);
  });

  it("renders the educational empty-state copy and the Register Project CTA", async () => {
    renderWithProviders(<ProjectsPage />);
    expect(await screen.findByText("No projects yet")).toBeInTheDocument();
    expect(
      screen.getByText(/Rabta will remember your entire workflow/)
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Register Project" }).length).toBeGreaterThan(0);
  });

  it("newProjectRequest opens the register dialog once and clears itself", async () => {
    renderWithProviders(<ProjectsPage />);
    await screen.findByText("Projects");

    act(() => useStore.getState().requestNewProject());

    expect(await screen.findByPlaceholderText("my-project")).toBeInTheDocument();
    // The flag resets right after firing (mirrors pendingResumeTaskId) — it
    // isn't left set like the old counter would have been.
    expect(useStore.getState().newProjectRequest).toBe(false);
  });

  it("remounting after a consumed request does not reopen the dialog; a fresh ⌘N does", async () => {
    // Simulates App.tsx's CurrentPage switch unmounting/remounting this page
    // when the sidebar navigates away and back — the historical bug: with a
    // never-reset counter, every remount after the first ⌘N would spuriously
    // reopen the dialog.
    const first = renderWithProviders(<ProjectsPage />);
    await screen.findByText("Projects");

    act(() => useStore.getState().requestNewProject());
    expect(await screen.findByPlaceholderText("my-project")).toBeInTheDocument();
    expect(useStore.getState().newProjectRequest).toBe(false);

    first.unmount();
    renderWithProviders(<ProjectsPage />);
    await screen.findByText("Projects");

    // Remount with the flag already false: no spurious reopen.
    expect(screen.queryByPlaceholderText("my-project")).not.toBeInTheDocument();

    // A second ⌘N (requestNewProject) still reopens it post-remount.
    act(() => useStore.getState().requestNewProject());
    expect(await screen.findByPlaceholderText("my-project")).toBeInTheDocument();
    expect(useStore.getState().newProjectRequest).toBe(false);
  });
});

/** Standard list_projects/delete_project wiring for a single FAKE_PROJECT,
 * with delete_project resolving successfully unless overridden. Tracks
 * whether delete_project has actually landed so a post-commit `refresh()`
 * (list_projects) reflects the real backend state, same as production. */
function mockProjectsInvoke(opts?: { deleteProject?: () => unknown }) {
  mockInvoke.mockClear();
  let deleted = false;
  mockInvoke.mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "list_projects":
        return (deleted ? [] : [FAKE_PROJECT]) as unknown;
      case "delete_project":
        if (opts?.deleteProject) return opts.deleteProject();
        deleted = true;
        return undefined as unknown;
      default:
        return [] as unknown;
    }
  });
}

async function openProjectMenu(name = FAKE_PROJECT.name) {
  const row = await screen.findByText(name);
  fireEvent.contextMenu(row);
}

async function chooseProjectMenuItem(name: string | RegExp) {
  await openProjectMenu();
  fireEvent.click(screen.getByRole("menuitem", { name }));
}

describe("ProjectsPage delete (deferred undo)", () => {
  beforeEach(() => {
    useStore.setState({ newProjectRequest: false });
    mockedToast().mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("requestDelete hides the row immediately, shows an Undo toast, and does not call delete_project yet", async () => {
    mockProjectsInvoke();
    renderWithProviders(<ProjectsPage />);

    await chooseProjectMenuItem(/Delete/);

    expect(screen.queryByText("Test Project")).not.toBeInTheDocument();
    expect(mockedToast()).toHaveBeenCalledTimes(1);
    const [message, options] = mockedToast().mock.calls[0];
    expect(message).toBe("Test Project deleted");
    expect(options.action.label).toBe("Undo");
    expect(mockInvoke).not.toHaveBeenCalledWith("delete_project", expect.anything());
  });

  it("clicking Undo restores the row and never calls delete_project", async () => {
    mockProjectsInvoke();
    renderWithProviders(<ProjectsPage />);

    await chooseProjectMenuItem(/Delete/);
    expect(screen.queryByText("Test Project")).not.toBeInTheDocument();

    const [, options] = mockedToast().mock.calls[0];
    await act(async () => {
      options.action.onClick();
    });

    expect(await screen.findByText("Test Project")).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalledWith("delete_project", expect.anything());
  });

  it("letting the undo window elapse calls delete_project exactly once with the right id, and the row stays gone", async () => {
    mockProjectsInvoke();
    renderWithProviders(<ProjectsPage />);
    await openProjectMenu();
    const deleteItem = await screen.findByRole("menuitem", { name: /Delete/ });

    vi.useFakeTimers();
    try {
      fireEvent.click(deleteItem);
      expect(screen.queryByText("Test Project")).not.toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      const deleteCalls = mockInvoke.mock.calls.filter(([cmd]) => cmd === "delete_project");
      expect(deleteCalls).toHaveLength(1);
      expect(deleteCalls[0][1]).toEqual({ id: FAKE_PROJECT.id });
      expect(screen.queryByText("Test Project")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("ProjectsPage durable management", () => {
  beforeEach(() => {
    useStore.setState({ newProjectRequest: false });
    mockedToast().mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it("archives immediately, reports warnings, and Undo calls real unarchive_project", async () => {
    let archived = false;
    mockInvoke.mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case "list_projects":
          return (archived ? [] : [FAKE_PROJECT]) as unknown;
        case "archive_project":
          archived = true;
          return {
            project: { ...FAKE_PROJECT, archivedAt: "2026-02-01T00:00:00.000Z" },
            warnings: ["git capture unavailable"],
          } as unknown;
        case "unarchive_project":
          archived = false;
          return FAKE_PROJECT as unknown;
        case "git_status":
          return {
            branch: "main",
            dirty: false,
            changedCount: 0,
            ahead: 0,
            behind: 0,
          } as unknown;
        default:
          return [] as unknown;
      }
    });

    renderWithProviders(<ProjectsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Archive Test Project" }));

    await waitFor(() =>
      expect(screen.queryByText("Test Project")).not.toBeInTheDocument(),
    );
    expect(mockInvoke).toHaveBeenCalledWith("archive_project", {
      id: FAKE_PROJECT.id,
    });
    expect(toast.error).toHaveBeenCalledWith("git capture unavailable");

    const archiveToast = mockedToast().mock.calls.find(
      ([message]) => message === "Test Project archived",
    );
    expect(archiveToast).toBeTruthy();
    await act(async () => {
      await archiveToast![1].action.onClick();
    });

    expect(mockInvoke).toHaveBeenCalledWith("unarchive_project", {
      id: FAKE_PROJECT.id,
    });
    expect(await screen.findByText("Test Project")).toBeInTheDocument();
  });

  it("renames from the context menu and disables empty or unchanged names", async () => {
    let project = FAKE_PROJECT;
    mockInvoke.mockImplementation(async (cmd: string, args?: unknown) => {
      switch (cmd) {
        case "list_projects":
          return [project] as unknown;
        case "rename_project":
          project = {
            ...project,
            name: (args as { name: string }).name,
          };
          return project as unknown;
        case "git_status":
          return {
            branch: "main",
            dirty: false,
            changedCount: 0,
            ahead: 0,
            behind: 0,
          } as unknown;
        default:
          return [] as unknown;
      }
    });

    renderWithProviders(<ProjectsPage />);
    await chooseProjectMenuItem("Rename");

    const input = await screen.findByRole("textbox", { name: "Project name" });
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();
    fireEvent.change(input, { target: { value: " " } });
    expect(save).toBeDisabled();
    fireEvent.change(input, { target: { value: "Rabta Core" } });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("rename_project", {
        id: FAKE_PROJECT.id,
        name: "Rabta Core",
      }),
    );
    expect(await screen.findByText("Rabta Core")).toBeInTheDocument();
  });

  it("sets an allowlisted icon and lazily restores an archived project", async () => {
    let active = FAKE_PROJECT;
    let archivedRows = [ARCHIVED_PROJECT];
    mockInvoke.mockImplementation(async (cmd: string, args?: unknown) => {
      switch (cmd) {
        case "list_projects":
          return [active] as unknown;
        case "set_project_icon":
          active = { ...active, icon: (args as { icon: Project["icon"] }).icon };
          return active as unknown;
        case "list_archived_projects":
          return archivedRows as unknown;
        case "unarchive_project":
          archivedRows = [];
          return { ...ARCHIVED_PROJECT, archivedAt: null } as unknown;
        case "git_status":
          return {
            branch: "main",
            dirty: false,
            changedCount: 0,
            ahead: 0,
            behind: 0,
          } as unknown;
        default:
          return [] as unknown;
      }
    });

    renderWithProviders(<ProjectsPage />);
    await screen.findByText("Test Project");
    expect(
      mockInvoke.mock.calls.some(([cmd]) => cmd === "list_archived_projects"),
    ).toBe(false);

    await chooseProjectMenuItem("Change icon");
    fireEvent.click(await screen.findByRole("button", { name: "Launch icon" }));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("set_project_icon", {
        id: FAKE_PROJECT.id,
        icon: "rocket",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Archived projects" }));
    expect(await screen.findByText("Archived Project")).toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledWith("list_archived_projects");
    fireEvent.click(
      screen.getByRole("button", { name: "Restore Archived Project" }),
    );
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("unarchive_project", {
        id: ARCHIVED_PROJECT.id,
      }),
    );
  });

  it("permanently deletes an archived project and refreshes both project lists", async () => {
    let activeRows: Project[] = [FAKE_PROJECT];
    let archivedRows: Project[] = [ARCHIVED_PROJECT];
    mockInvoke.mockImplementation(async (cmd: string, args?: unknown) => {
      switch (cmd) {
        case "list_projects":
          return activeRows as unknown;
        case "list_archived_projects":
          return archivedRows as unknown;
        case "delete_project":
          expect(args).toEqual({ id: ARCHIVED_PROJECT.id });
          activeRows = [];
          archivedRows = [];
          return undefined as unknown;
        case "git_status":
          return {
            branch: "main",
            dirty: false,
            changedCount: 0,
            ahead: 0,
            behind: 0,
          } as unknown;
        default:
          return [] as unknown;
      }
    });

    renderWithProviders(<ProjectsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Archived projects" }));
    expect(await screen.findByText("Archived Project")).toBeInTheDocument();
    const activeListCalls = mockInvoke.mock.calls.filter(
      ([cmd]) => cmd === "list_projects",
    ).length;
    const archivedListCalls = mockInvoke.mock.calls.filter(
      ([cmd]) => cmd === "list_archived_projects",
    ).length;

    vi.useFakeTimers();
    try {
      fireEvent.click(
        screen.getByRole("button", {
          name: "Delete Archived Project permanently",
        }),
      );
      expect(screen.queryByText("Archived Project")).not.toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      expect(mockInvoke).toHaveBeenCalledWith("delete_project", {
        id: ARCHIVED_PROJECT.id,
      });
      expect(
        mockInvoke.mock.calls.filter(([cmd]) => cmd === "list_projects"),
      ).toHaveLength(activeListCalls + 1);
      expect(
        mockInvoke.mock.calls.filter(
          ([cmd]) => cmd === "list_archived_projects",
        ),
      ).toHaveLength(archivedListCalls + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows persisted last-opened and session duration metadata only after a session exists", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case "list_projects":
          return [
            {
              ...FAKE_PROJECT,
              lastOpenedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
              activeSeconds: 2 * 3600 + 17 * 60,
            },
          ] as unknown;
        case "git_status":
          return {
            branch: "main",
            dirty: false,
            changedCount: 0,
            ahead: 0,
            behind: 0,
          } as unknown;
        default:
          return [] as unknown;
      }
    });

    renderWithProviders(<ProjectsPage />);

    expect(await screen.findByText("Opened 5m ago")).toBeInTheDocument();
    expect(screen.getByText("Last session 2h 17m")).toBeInTheDocument();
  });
});

describe("ProjectsPage unsaved-changes dot", () => {
  beforeEach(() => {
    useStore.setState({ newProjectRequest: false });
  });

  it("shows an amber dot with an accessible 'N uncommitted changes' label when git_status reports dirty", async () => {
    mockInvoke.mockClear();
    mockInvoke.mockImplementation(async (cmd: string, args?: unknown) => {
      const a = args as { projectId?: string } | undefined;
      switch (cmd) {
        case "list_projects":
          return [FAKE_PROJECT] as unknown;
        case "git_status":
          return (a?.projectId === FAKE_PROJECT.id
            ? { branch: "main", dirty: true, changedCount: 3, ahead: 0, behind: 0 }
            : { branch: "main", dirty: false, changedCount: 0, ahead: 0, behind: 0 }) as unknown;
        default:
          return [] as unknown;
      }
    });

    renderWithProviders(<ProjectsPage />);

    await screen.findByText("Test Project");
    expect(await screen.findByLabelText("3 uncommitted changes")).toBeInTheDocument();
  });

  it("pluralizes singular correctly: '1 uncommitted change'", async () => {
    mockInvoke.mockClear();
    mockInvoke.mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case "list_projects":
          return [FAKE_PROJECT] as unknown;
        case "git_status":
          return { branch: "main", dirty: true, changedCount: 1, ahead: 0, behind: 0 } as unknown;
        default:
          return [] as unknown;
      }
    });

    renderWithProviders(<ProjectsPage />);

    await screen.findByText("Test Project");
    expect(await screen.findByLabelText("1 uncommitted change")).toBeInTheDocument();
  });

  it("renders no dot when the project is clean", async () => {
    mockInvoke.mockClear();
    mockInvoke.mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case "list_projects":
          return [FAKE_PROJECT] as unknown;
        case "git_status":
          return { branch: "main", dirty: false, changedCount: 0, ahead: 0, behind: 0 } as unknown;
        default:
          return [] as unknown;
      }
    });

    renderWithProviders(<ProjectsPage />);

    await screen.findByText("Test Project");
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("git_status", { projectId: FAKE_PROJECT.id })
    );
    expect(screen.queryByLabelText(/uncommitted change/i)).not.toBeInTheDocument();
  });

  it("re-fetches git_status for the dot when starting a GitHub issue task switches branches (same trigger as GitLine's remount)", async () => {
    // Regression coverage: the dot used to refresh only on [projectId,
    // activationNonce], while the sibling GitLine remounted on
    // startedNonce[p.id] bumped by GitHubSection's onStarted (fired after
    // start_issue_task switches/creates a branch). That left the dot stale
    // relative to the freshly-refreshed GitLine until an unrelated
    // activationNonce bump. The dot now also takes refreshKey=startedNonce
    // so it refetches on the exact same trigger.
    mockInvoke.mockClear();
    const gitStatusCallsForProject: unknown[] = [];
    mockInvoke.mockImplementation(async (cmd: string, args?: unknown) => {
      switch (cmd) {
        case "list_projects":
          return [FAKE_PROJECT] as unknown;
        case "git_status":
          gitStatusCallsForProject.push(args);
          return { branch: "main", dirty: true, changedCount: 2, ahead: 0, behind: 0 } as unknown;
        case "github_available":
          return true as unknown;
        case "github_issues":
          return [{ number: 7, title: "Fix thing", url: "https://x", labels: [] }] as unknown;
        case "start_issue_task":
          return { branch: "issue-7", branchNote: "Switched to issue-7" } as unknown;
        default:
          return [] as unknown;
      }
    });

    renderWithProviders(<ProjectsPage />);

    await screen.findByText("Test Project");
    await waitFor(() => expect(gitStatusCallsForProject.length).toBeGreaterThan(0));
    const callsBeforeStart = gitStatusCallsForProject.length;

    fireEvent.click(await screen.findByText("Sync GitHub"));
    fireEvent.click(await screen.findByText("Start task"));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("start_issue_task", expect.objectContaining({ projectId: FAKE_PROJECT.id }))
    );
    await waitFor(() => expect(gitStatusCallsForProject.length).toBeGreaterThan(callsBeforeStart));
    expect(gitStatusCallsForProject.at(-1)).toEqual({ projectId: FAKE_PROJECT.id });
  });

  it("GitLine's own git op (Fetch) refreshes the dot too, via GitLine's onChanged (FIX 1)", async () => {
    // Regression coverage for the review finding: GitLine performs its OWN
    // git mutations (fetch/checkout/create-branch) via `run()` -> `refresh()`,
    // and none of those used to bump any nonce the dot watches, so the dot
    // could keep showing stale state after GitLine visibly updated. GitLine
    // now calls `onChanged` on its success path, which bumps a `gitOpNonce`
    // this dot's refreshKey also sums in — this drives that real path (open
    // GitLine's "Git" menu, run Fetch) and asserts the dot's own git_status
    // refetch reflects the new state, with no time-based assertions.
    mockInvoke.mockClear();
    let dirty = true;
    mockInvoke.mockImplementation(async (cmd: string, args?: unknown) => {
      const a = args as { projectId?: string } | undefined;
      switch (cmd) {
        case "list_projects":
          return [FAKE_PROJECT] as unknown;
        case "git_status":
          return (a?.projectId === FAKE_PROJECT.id
            ? { branch: "main", dirty, changedCount: dirty ? 2 : 0, ahead: 0, behind: 0 }
            : { branch: "main", dirty: false, changedCount: 0, ahead: 0, behind: 0 }) as unknown;
        case "git_branches":
          return ["main"] as unknown;
        case "git_fetch":
          dirty = false;
          return undefined as unknown;
        default:
          return [] as unknown;
      }
    });

    renderWithProviders(<ProjectsPage />);

    await screen.findByText("Test Project");
    expect(await screen.findByLabelText("2 uncommitted changes")).toBeInTheDocument();

    // Radix's DropdownMenuTrigger opens on pointerdown, which happy-dom
    // doesn't drive reliably without user-event — same as GitLine.test.tsx,
    // it also opens on Enter/Space/ArrowDown keydown, so drive it via
    // keyboard for a deterministic test.
    const gitTrigger = await screen.findByRole("button", { name: "Git" });
    fireEvent.keyDown(gitTrigger, { key: "Enter" });

    const fetchItem = await screen.findByText("Fetch");
    fireEvent.keyDown(fetchItem, { key: "Enter" });

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("git_fetch", { projectId: FAKE_PROJECT.id })
    );

    // The dot refetches via GitLine's onChanged -> gitOpNonce bump (no
    // GitHub issue-task start involved here, and no GitLine remount either
    // — GitLine's key is keyed on startedNonce only, which never changed).
    await waitFor(() =>
      expect(screen.queryByLabelText(/uncommitted change/i)).not.toBeInTheDocument()
    );
  });
});

describe("ProjectsPage context menu", () => {
  beforeEach(() => {
    useStore.setState({ newProjectRequest: false });
    mockedToast().mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("right-clicking a project row opens the menu with Reveal in Finder + Delete", async () => {
    mockProjectsInvoke();
    renderWithProviders(<ProjectsPage />);

    const row = await screen.findByText("Test Project");
    fireEvent.contextMenu(row);

    expect(await screen.findByText("Reveal in Finder")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Delete/ })).toBeInTheDocument();
  });

  it("selecting Reveal in Finder invokes reveal_in_finder with the project's repoPath", async () => {
    mockProjectsInvoke();
    renderWithProviders(<ProjectsPage />);

    const row = await screen.findByText("Test Project");
    fireEvent.contextMenu(row);

    const revealItem = await screen.findByText("Reveal in Finder");
    fireEvent.click(revealItem);

    expect(mockInvoke).toHaveBeenCalledWith("reveal_in_finder", { path: FAKE_PROJECT.repoPath });
  });

  it("selecting Delete from the menu triggers the undo flow (row hides, Undo toast, no immediate delete_project)", async () => {
    mockProjectsInvoke();
    renderWithProviders(<ProjectsPage />);

    const row = await screen.findByText("Test Project");
    fireEvent.contextMenu(row);

    const deleteItem = await screen.findByRole("menuitem", { name: /Delete/ });
    fireEvent.click(deleteItem);

    expect(screen.queryByText("Test Project")).not.toBeInTheDocument();
    expect(mockedToast()).toHaveBeenCalledTimes(1);
    const [message, options] = mockedToast().mock.calls[0];
    expect(message).toBe("Test Project deleted");
    expect(options.action.label).toBe("Undo");
    expect(mockInvoke).not.toHaveBeenCalledWith("delete_project", expect.anything());
  });
});

describe("ProjectsPage accessible project ordering", () => {
  beforeEach(() => {
    useStore.setState({ newProjectRequest: false });
  });

  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((resolvePromise) => {
      resolve = resolvePromise;
    });
    return { promise, resolve };
  }

  function mockOrderedProjects(
    reorderProjects: (orderedIds: string[]) => Project[] | Promise<Project[]>,
  ) {
    mockInvoke.mockClear();
    mockInvoke.mockImplementation(async (cmd: string, args?: unknown) => {
      switch (cmd) {
        case "list_projects":
          return [FAKE_PROJECT, SECOND_PROJECT] as unknown;
        case "reorder_projects":
          return reorderProjects((args as { orderedIds: string[] }).orderedIds) as unknown;
        case "git_status":
          return {
            branch: "main",
            dirty: false,
            changedCount: 0,
            ahead: 0,
            behind: 0,
          } as unknown;
        default:
          return [] as unknown;
      }
    });
  }

  async function openMenuFor(projectName: string) {
    fireEvent.contextMenu(await screen.findByText(projectName));
  }

  function expectProjectOrder(first: string, second: string) {
    const firstNode = screen.getByText(first);
    const secondNode = screen.getByText(second);
    expect(
      firstNode.compareDocumentPosition(secondNode) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  }

  function projectCard(name: string) {
    const card = screen.getByText(name).closest("[data-state]");
    expect(card).toBeInstanceOf(HTMLElement);
    return card as HTMLElement;
  }

  function rectAt(top: number): DOMRect {
    return {
      x: 0,
      y: top,
      top,
      left: 0,
      right: 400,
      bottom: top + 100,
      width: 400,
      height: 100,
      toJSON: () => ({}),
    } as DOMRect;
  }

  it("disables Move down for the final project", async () => {
    mockOrderedProjects(() => [FAKE_PROJECT, SECOND_PROJECT]);
    renderWithProviders(<ProjectsPage />);

    await openMenuFor("Second Project");

    expect(await screen.findByRole("menuitem", { name: "Move down" })).toHaveAttribute(
      "data-disabled",
    );
  });

  it("persists Move down through the context menu and exposes a labeled drag handle", async () => {
    mockOrderedProjects((orderedIds) =>
      orderedIds.map((id, sortOrder) =>
        id === FAKE_PROJECT.id
          ? { ...FAKE_PROJECT, sortOrder }
          : { ...SECOND_PROJECT, sortOrder },
      ),
    );
    renderWithProviders(<ProjectsPage />);

    expect(await screen.findByLabelText("Reorder Test Project")).toBeInTheDocument();
    await openMenuFor("Test Project");
    const moveUp = await screen.findByRole("menuitem", { name: "Move up" });
    expect(moveUp).toHaveAttribute("data-disabled");
    fireEvent.click(screen.getByRole("menuitem", { name: "Move down" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("reorder_projects", {
        orderedIds: ["proj-2", "proj-1"],
      }),
    );
    await waitFor(() => expectProjectOrder("Second Project", "Test Project"));
    await waitFor(() =>
      expect(screen.getByLabelText("Reorder Second Project")).toBeEnabled(),
    );

    await openMenuFor("Second Project");
    expect(await screen.findByRole("menuitem", { name: "Move up" })).toHaveAttribute(
      "data-disabled",
    );
    expect(screen.getByRole("menuitem", { name: "Move down" })).not.toHaveAttribute("data-disabled");
  });

  it("allows only one pending reorder and replaces optimism with the authoritative response", async () => {
    const pending = deferred<Project[]>();
    mockOrderedProjects(() => pending.promise);
    renderWithProviders(<ProjectsPage />);

    await openMenuFor("Test Project");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Move down" }));

    await waitFor(() => expectProjectOrder("Second Project", "Test Project"));
    await waitFor(() =>
      expect(screen.getByLabelText("Reorder Second Project")).toBeDisabled(),
    );

    await openMenuFor("Second Project");
    const blockedMove = await screen.findByRole("menuitem", { name: "Move down" });
    expect(blockedMove).toHaveAttribute("data-disabled");
    fireEvent.click(blockedMove);
    expect(
      mockInvoke.mock.calls.filter(([cmd]) => cmd === "reorder_projects"),
    ).toHaveLength(1);

    const authoritativeProjects = [
      { ...FAKE_PROJECT, name: "Canonical First", sortOrder: 40 },
      { ...SECOND_PROJECT, name: "Canonical Second", sortOrder: 41 },
    ];
    await act(async () => {
      pending.resolve(authoritativeProjects);
      await pending.promise;
    });

    await waitFor(() =>
      expectProjectOrder("Canonical First", "Canonical Second"),
    );
    expect(useStore.getState().projects).toEqual(authoritativeProjects);
    expect(screen.queryByText("Test Project")).not.toBeInTheDocument();
    expect(screen.queryByText("Second Project")).not.toBeInTheDocument();
  });

  it("reorders through the configured keyboard sensor", async () => {
    mockOrderedProjects((orderedIds) =>
      orderedIds.map((id, sortOrder) =>
        id === FAKE_PROJECT.id
          ? { ...FAKE_PROJECT, sortOrder }
          : { ...SECOND_PROJECT, sortOrder },
      ),
    );
    renderWithProviders(<ProjectsPage />);

    await screen.findByText("Second Project");
    vi.spyOn(projectCard("Test Project"), "getBoundingClientRect").mockReturnValue(
      rectAt(0),
    );
    vi.spyOn(projectCard("Second Project"), "getBoundingClientRect").mockReturnValue(
      rectAt(120),
    );

    const handle = screen.getByLabelText("Reorder Test Project");
    handle.focus();
    fireEvent.keyDown(handle, { code: "Space", key: " " });
    await waitFor(() => expect(handle).toHaveAttribute("aria-pressed", "true"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    fireEvent.keyDown(handle, { code: "ArrowDown", key: "ArrowDown" });
    await waitFor(() =>
      expect(projectCard("Test Project")).toHaveStyle({
        transform: "translate3d(0px, 120px, 0) scaleX(1) scaleY(1)",
      }),
    );

    fireEvent.keyDown(handle, { code: "Space", key: " " });

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("reorder_projects", {
        orderedIds: ["proj-2", "proj-1"],
      }),
    );
    await waitFor(() => expectProjectOrder("Second Project", "Test Project"));
  });

  it("restores the original visual order when persisted reordering fails", async () => {
    mockOrderedProjects(() => Promise.reject(new Error("backend unavailable")));
    renderWithProviders(<ProjectsPage />);

    await openMenuFor("Test Project");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Move down" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("reorder_projects", {
        orderedIds: ["proj-2", "proj-1"],
      }),
    );
    await waitFor(() => expectProjectOrder("Test Project", "Second Project"));
  });
});
