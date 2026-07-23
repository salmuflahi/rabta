import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components/ui/sonner";
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
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("ProjectsPage", () => {
  beforeEach(() => {
    useStore.setState({ newProjectRequest: false });
  });

  it("renders without throwing (catches missing-provider crashes)", async () => {
    renderWithProviders(<ProjectsPage />);
    expect(await screen.findByText("Projects")).toBeInTheDocument();
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

    await screen.findByText("Test Project");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

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

    await screen.findByText("Test Project");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
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
    vi.useFakeTimers();
    try {
      renderWithProviders(<ProjectsPage />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByText("Test Project")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
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
