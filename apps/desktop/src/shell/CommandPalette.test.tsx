import type { InvokeArgs } from "@tauri-apps/api/core";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mockInvoke, renderWithProviders } from "@/test/smoke-utils";
import { useStore, type Project, type Task } from "@/store";
import { CommandPalette } from "./CommandPalette";

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

/** `list_tasks` only, keyed to FAKE_PROJECT/FAKE_TASK; every other invoke
 * (list_projects, task_resources, ...) resolves `[]` via smoke-utils'
 * default. */
function mockListTasks() {
  mockInvoke.mockClear();
  mockInvoke.mockImplementation(async (cmd: string, args?: InvokeArgs) => {
    const a = args as Record<string, unknown> | undefined;
    if (cmd === "list_tasks" && a?.projectId === FAKE_PROJECT.id) return [FAKE_TASK] as unknown;
    return [] as unknown;
  });
}

describe("CommandPalette", () => {
  it("renders nav commands when opened via the store", async () => {
    useStore.setState({ commandOpen: true, projects: [] });

    renderWithProviders(<CommandPalette />);

    expect(await screen.findByText("Register Project")).toBeInTheDocument();
    expect(screen.getByText("New Task")).toBeInTheDocument();
    expect(screen.getAllByText("Settings").length).toBeGreaterThan(0);
  });

  it("fetches tasks once on open (not per keystroke) and renders the task plus its Resume item", async () => {
    mockListTasks();
    useStore.setState({ commandOpen: true, projects: [FAKE_PROJECT] });

    renderWithProviders(<CommandPalette />);

    expect(await screen.findByText("Write onboarding docs")).toBeInTheDocument();
    expect(screen.getByText("Resume Write onboarding docs")).toBeInTheDocument();
    // Fetched once for the one project in the store.
    expect(mockInvoke).toHaveBeenCalledWith("list_tasks", { projectId: FAKE_PROJECT.id });
  });

  it("cmdk's fuzzy filter narrows to the matching task and hides unrelated nav items", async () => {
    mockListTasks();
    useStore.setState({ commandOpen: true, projects: [FAKE_PROJECT] });

    renderWithProviders(<CommandPalette />);
    await screen.findByText("Write onboarding docs");

    const input = screen.getByPlaceholderText("Search or jump to…");
    fireEvent.change(input, { target: { value: "onboarding" } });

    await waitFor(() => {
      expect(screen.getByText("Write onboarding docs")).toBeInTheDocument();
      expect(screen.queryByText("Overview")).not.toBeInTheDocument();
    });
  });

  it("selecting a nav item calls setView and closes the palette", async () => {
    useStore.setState({ commandOpen: true, projects: [] });
    renderWithProviders(<CommandPalette />);

    const item = await screen.findByText("Connectors");
    fireEvent.click(item);

    expect(useStore.getState().view).toBe("connectors");
    expect(useStore.getState().commandOpen).toBe(false);
  });

  it('selecting "Resume {task}" sets pendingResumeTaskId and navigates to Capsules — without running any restore invoke itself', async () => {
    mockListTasks();
    useStore.setState({ commandOpen: true, projects: [FAKE_PROJECT], pendingResumeTaskId: null });

    renderWithProviders(<CommandPalette />);

    const resumeItem = await screen.findByText("Resume Write onboarding docs");
    fireEvent.click(resumeItem);

    expect(useStore.getState().pendingResumeTaskId).toBe(FAKE_TASK.id);
    expect(useStore.getState().view).toBe("capsules");
    expect(useStore.getState().commandOpen).toBe(false);
    expect(mockInvoke).not.toHaveBeenCalledWith("activate_task", expect.anything());
  });
});
