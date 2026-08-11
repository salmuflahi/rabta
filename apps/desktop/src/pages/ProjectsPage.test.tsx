import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components/ui/sonner";
import { expectAtMostOneAccent } from "@/test/accent";
import { mockInvoke, renderWithProviders } from "@/test/smoke-utils";
import { useStore, type Project, type Task } from "@/store";
import { ProjectsPage } from "./ProjectsPage";

// The delete/archive Undo toasts go through the sonner `toast` function
// directly (not toastOk/toastErr) — mocked so tests can inspect the
// message/action without needing an actual <Toaster/> mounted.
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

const CLEAN_STATUS = { branch: "main", dirty: false, changedCount: 0, ahead: 0, behind: 0 };

/** The master list and the detail pane both name the selected project, and
 * the branch shows up in both the chips row and GitLine's controls below
 * it — so every query has to say which region it means. */
function list() {
  return within(document.querySelector("[data-project-list]") as HTMLElement);
}
function chips() {
  return within(document.querySelector("[data-project-chips]") as HTMLElement);
}

function resetPage() {
  useStore.setState({ newProjectRequest: false, selectedProjectId: null, projects: [] });
}

/** Standard wiring for a set of projects. `git_status` resolves clean
 * unless overridden — the detail pane's chips and the master list's dirty
 * dot both read it, so a test that says nothing about git gets "clean". */
function mockProjects(opts?: {
  projects?: Project[];
  tasks?: Task[];
  gitStatus?: unknown;
  handlers?: Record<string, (args: Record<string, unknown> | undefined) => unknown>;
}) {
  resetPage();
  mockInvoke.mockClear();
  mockInvoke.mockImplementation(async (cmd: string, args?: unknown) => {
    const a = args as Record<string, unknown> | undefined;
    const custom = opts?.handlers?.[cmd];
    if (custom) return custom(a) as unknown;
    switch (cmd) {
      case "list_projects":
        return (opts?.projects ?? [FAKE_PROJECT]) as unknown;
      case "list_tasks":
        return ((opts?.tasks ?? []).filter((t) => t.projectId === a?.projectId)) as unknown;
      case "git_status":
        return (opts?.gitStatus ?? CLEAN_STATUS) as unknown;
      default:
        return [] as unknown;
    }
  });
}

/** Opens the detail pane's ⋯ menu for the selected project. */
async function openMoreMenu(name = FAKE_PROJECT.name) {
  const trigger = await vi.waitFor(() =>
    screen.getByRole("button", { name: `More actions for ${name}` }),
  );
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  return vi.waitFor(() => screen.getByRole("menu"));
}

async function chooseMoreMenuItem(name: string | RegExp) {
  await openMoreMenu();
  fireEvent.click(screen.getByRole("menuitem", { name }));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("ProjectsPage", () => {
  beforeEach(resetPage);

  it("renders master and detail without throwing", async () => {
    mockProjects();
    renderWithProviders(<ProjectsPage />);
    expect(await screen.findByRole("heading", { level: 2, name: "Test Project" })).toBeInTheDocument();
    expect(list().getByText("Test Project")).toBeInTheDocument();
  });

  // The Toolbar owns the view's <h1>; the detail pane's project name is the
  // selected item within it.
  it("does not own the document's top heading", async () => {
    mockProjects();
    renderWithProviders(<ProjectsPage />);
    await screen.findByRole("heading", { level: 2, name: "Test Project" });
    expect(document.querySelector("h1")).not.toBeInTheDocument();
  });

  it("shows where the project lives and what state its tree is in", async () => {
    mockProjects({ gitStatus: { branch: "feat/x", dirty: true, changedCount: 3, ahead: 0, behind: 0 } });
    renderWithProviders(<ProjectsPage />);
    await screen.findByRole("heading", { level: 2, name: "Test Project" });
    expect(screen.getByText("/tmp/test-project")).toBeInTheDocument();
    expect(chips().getByText("feat/x")).toBeInTheDocument();
    expect(chips().getByText("3 uncommitted")).toBeInTheDocument();
  });

  it("reports a clean tree as clean", async () => {
    mockProjects();
    renderWithProviders(<ProjectsPage />);
    await screen.findByRole("heading", { level: 2, name: "Test Project" });
    expect(chips().getByText("clean")).toBeInTheDocument();
  });

  it("selects a project on click and keeps the selected row neutral", async () => {
    mockProjects({ projects: [FAKE_PROJECT, SECOND_PROJECT] });
    const { container } = renderWithProviders(<ProjectsPage />);
    await screen.findByRole("heading", { level: 2, name: "Test Project" });

    fireEvent.click(list().getByText("Second Project").closest('[role="option"]')!);
    expect(useStore.getState().selectedProjectId).toBe(SECOND_PROJECT.id);
    const row = list().getByText("Second Project").closest('[role="option"]')!;
    expect(row.className.split(/\s+/)).toContain("bg-secondary");
    expect(row.className.split(/\s+/)).not.toContain("bg-primary");
    expectAtMostOneAccent(container);
  });

  it("falls back to the first project when the selected id no longer exists", async () => {
    mockProjects();
    useStore.setState({ selectedProjectId: "gone" });
    renderWithProviders(<ProjectsPage />);
    expect(await screen.findByRole("heading", { level: 2, name: "Test Project" })).toBeInTheDocument();
  });

  // Product requirement, not decoration.
  it("carries the safe-git promise verbatim", async () => {
    mockProjects();
    renderWithProviders(<ProjectsPage />);
    expect(
      await screen.findByText("Safe git only — Rabta never forces, resets or discards."),
    ).toBeInTheDocument();
  });

  it("lists the project's capsules and opens one in Capsules", async () => {
    const task: Task = {
      id: "t1",
      projectId: FAKE_PROJECT.id,
      title: "Fix the thing",
      status: "open",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    mockProjects({ tasks: [task] });
    useStore.setState({ view: "projects", selectedCapsuleId: null });
    renderWithProviders(<ProjectsPage />);

    fireEvent.click(await screen.findByText("Fix the thing"));
    expect(useStore.getState().selectedCapsuleId).toBe("t1");
    expect(useStore.getState().view).toBe("capsules");
  });

  it("teaches the first move when nothing is registered", async () => {
    mockProjects({ projects: [] });
    renderWithProviders(<ProjectsPage />);
    expect(await screen.findByText("No projects yet")).toBeInTheDocument();
    expect(screen.getByText(/Rabta will remember your whole workflow/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Register project" }).length).toBeGreaterThan(0);
  });

  it("opens the register dialog on a new-project request, once, then clears it", async () => {
    mockProjects();
    const first = renderWithProviders(<ProjectsPage />);
    await screen.findByRole("heading", { level: 2, name: "Test Project" });

    act(() => useStore.getState().requestNewProject());
    expect(await screen.findByPlaceholderText("my-project")).toBeInTheDocument();
    expect(useStore.getState().newProjectRequest).toBe(false);

    // Consumed means consumed: a remount must not reopen it.
    first.unmount();
    mockProjects();
    renderWithProviders(<ProjectsPage />);
    await screen.findByRole("heading", { level: 2, name: "Test Project" });
    expect(screen.queryByPlaceholderText("my-project")).not.toBeInTheDocument();

    act(() => useStore.getState().requestNewProject());
    expect(await screen.findByPlaceholderText("my-project")).toBeInTheDocument();
  });
});

describe("ProjectsPage dirty dot", () => {
  beforeEach(resetPage);

  it("marks a dirty tree in the list with an accessible label", async () => {
    mockProjects({ gitStatus: { branch: "main", dirty: true, changedCount: 4, ahead: 0, behind: 0 } });
    renderWithProviders(<ProjectsPage />);
    await screen.findByRole("heading", { level: 2, name: "Test Project" });
    expect(await list().findByRole("status", { name: "4 uncommitted changes" })).toBeInTheDocument();
  });

  it("pluralises a single change correctly", async () => {
    mockProjects({ gitStatus: { branch: "main", dirty: true, changedCount: 1, ahead: 0, behind: 0 } });
    renderWithProviders(<ProjectsPage />);
    await screen.findByRole("heading", { level: 2, name: "Test Project" });
    expect(await list().findByRole("status", { name: "1 uncommitted change" })).toBeInTheDocument();
  });

  it("shows no dot when the tree is clean", async () => {
    mockProjects();
    renderWithProviders(<ProjectsPage />);
    await screen.findByRole("heading", { level: 2, name: "Test Project" });
    // dnd-kit mounts its own aria-live region with role=status, so this
    // asks specifically for a dot: the dot is the only status with a
    // "N uncommitted" name.
    expect(list().queryByRole("status", { name: /uncommitted/ })).toBeNull();
  });
});

describe("ProjectsPage delete (deferred undo)", () => {
  beforeEach(() => {
    resetPage();
    mockedToast().mockClear();
  });

  function mockWithDelete() {
    let deleted = false;
    mockProjects({
      handlers: {
        list_projects: () => (deleted ? [] : [FAKE_PROJECT]),
        delete_project: () => {
          deleted = true;
          return undefined;
        },
      },
    });
  }

  it("hides the row and offers Undo before committing anything", async () => {
    mockWithDelete();
    renderWithProviders(<ProjectsPage />);
    await chooseMoreMenuItem(/Delete permanently/);

    await waitFor(() => expect(list().queryByText("Test Project")).toBeNull());
    const [message, options] = mockedToast().mock.calls[0];
    expect(message).toBe("Test Project deleted");
    expect(options.action.label).toBe("Undo");
    expect(mockInvoke).not.toHaveBeenCalledWith("delete_project", expect.anything());
  });

  it("restores the row on Undo and never calls delete_project", async () => {
    mockWithDelete();
    renderWithProviders(<ProjectsPage />);
    await chooseMoreMenuItem(/Delete permanently/);
    await waitFor(() => expect(list().queryByText("Test Project")).toBeNull());

    const [, options] = mockedToast().mock.calls[0];
    await act(async () => options.action.onClick());

    await waitFor(() => expect(list().getByText("Test Project")).toBeInTheDocument());
    expect(mockInvoke).not.toHaveBeenCalledWith("delete_project", expect.anything());
  });

  it("commits exactly once when the undo window elapses", async () => {
    mockWithDelete();
    renderWithProviders(<ProjectsPage />);
    await openMoreMenu();
    const deleteItem = await screen.findByRole("menuitem", { name: /Delete permanently/ });

    vi.useFakeTimers();
    try {
      fireEvent.click(deleteItem);
      await vi.waitFor(() => expect(list().queryByText("Test Project")).toBeNull());

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      const calls = mockInvoke.mock.calls.filter(([cmd]) => cmd === "delete_project");
      expect(calls).toHaveLength(1);
      expect(calls[0][1]).toEqual({ id: FAKE_PROJECT.id });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("ProjectsPage durable management", () => {
  beforeEach(() => {
    resetPage();
    mockedToast().mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it("archives immediately, reports warnings, and Undo calls real unarchive_project", async () => {
    let archived = false;
    mockProjects({
      handlers: {
        list_projects: () => (archived ? [] : [FAKE_PROJECT]),
        archive_project: () => {
          archived = true;
          return {
            project: { ...FAKE_PROJECT, archivedAt: "2026-02-01T00:00:00.000Z" },
            warnings: ["git capture unavailable"],
          };
        },
        unarchive_project: () => {
          archived = false;
          return FAKE_PROJECT;
        },
      },
    });

    renderWithProviders(<ProjectsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Archive Test Project" }));

    await waitFor(() => expect(list().queryByText("Test Project")).toBeNull());
    expect(mockInvoke).toHaveBeenCalledWith("archive_project", { id: FAKE_PROJECT.id });
    expect(toast.error).toHaveBeenCalledWith("git capture unavailable");

    const archiveToast = mockedToast().mock.calls.find(([m]) => m === "Test Project archived");
    expect(archiveToast).toBeTruthy();
    await act(async () => {
      await archiveToast![1].action.onClick();
    });

    expect(mockInvoke).toHaveBeenCalledWith("unarchive_project", { id: FAKE_PROJECT.id });
    await waitFor(() => expect(list().getByText("Test Project")).toBeInTheDocument());
  });

  it("renames from the ⋯ menu and disables empty or unchanged names", async () => {
    let project = FAKE_PROJECT;
    mockProjects({
      handlers: {
        list_projects: () => [project],
        rename_project: (a) => {
          project = { ...project, name: String(a?.name) };
          return project;
        },
      },
    });

    renderWithProviders(<ProjectsPage />);
    await chooseMoreMenuItem("Rename");

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
    await waitFor(() => expect(list().getByText("Rabta Core")).toBeInTheDocument());
  });

  it("sets an allowlisted icon, and only loads archived projects when asked", async () => {
    let active = FAKE_PROJECT;
    let archivedRows = [ARCHIVED_PROJECT];
    mockProjects({
      handlers: {
        list_projects: () => [active],
        set_project_icon: (a) => {
          active = { ...active, icon: a?.icon as Project["icon"] };
          return active;
        },
        list_archived_projects: () => archivedRows,
        unarchive_project: () => {
          archivedRows = [];
          return { ...ARCHIVED_PROJECT, archivedAt: null };
        },
      },
    });

    renderWithProviders(<ProjectsPage />);
    await screen.findByRole("heading", { level: 2, name: "Test Project" });
    expect(mockInvoke.mock.calls.some(([cmd]) => cmd === "list_archived_projects")).toBe(false);

    await chooseMoreMenuItem("Change icon");
    fireEvent.click(await screen.findByRole("button", { name: "Launch icon" }));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("set_project_icon", {
        id: FAKE_PROJECT.id,
        icon: "rocket",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Archived projects" }));
    expect(await screen.findByText("Archived Project")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restore Archived Project" }));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("unarchive_project", { id: ARCHIVED_PROJECT.id }),
    );
  });

  it("reveals the repository in Finder with its real path", async () => {
    mockProjects();
    renderWithProviders(<ProjectsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Reveal in Finder/ }));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("reveal_in_finder", {
        path: FAKE_PROJECT.repoPath,
      }),
    );
  });
});

describe("ProjectsPage ordering", () => {
  beforeEach(resetPage);

  it("disables Move up for the first project and Move down for the last", async () => {
    mockProjects({ projects: [FAKE_PROJECT, SECOND_PROJECT] });
    renderWithProviders(<ProjectsPage />);
    await openMoreMenu();
    expect(screen.getByRole("menuitem", { name: "Move up" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("menuitem", { name: "Move down" })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("persists Move down through reorder_projects", async () => {
    mockProjects({
      projects: [FAKE_PROJECT, SECOND_PROJECT],
      handlers: {
        reorder_projects: (a) =>
          (a?.orderedIds as string[]).map(
            (id) => [FAKE_PROJECT, SECOND_PROJECT].find((p) => p.id === id)!,
          ),
      },
    });
    renderWithProviders(<ProjectsPage />);
    await chooseMoreMenuItem("Move down");

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("reorder_projects", {
        orderedIds: [SECOND_PROJECT.id, FAKE_PROJECT.id],
      }),
    );
  });

  it("restores the original order when persisting the reorder fails", async () => {
    mockProjects({
      projects: [FAKE_PROJECT, SECOND_PROJECT],
      handlers: {
        reorder_projects: () => {
          throw new Error("write failed");
        },
      },
    });
    renderWithProviders(<ProjectsPage />);
    await chooseMoreMenuItem("Move down");

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    // Whole-row text content, not firstElementChild's: a row is now Row
    // (leading icon, then a title/subtitle stack), so the first element is
    // the icon, not the name — the row's full text still contains the name
    // either way, and that's all this assertion is checking.
    const names = list()
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(names[0]).toContain("Test Project");
  });
});
