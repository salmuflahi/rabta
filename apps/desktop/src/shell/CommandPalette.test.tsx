import type { InvokeArgs } from "@tauri-apps/api/core";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { mockInvoke, renderWithProviders } from "@/test/smoke-utils";
import { useStore, type Project, type Task } from "@/store";
import { CommandPalette } from "./CommandPalette";

const FAKE_PROJECT: Project = {
  id: "proj-1",
  name: "Test Project",
  repoPath: "/tmp/test-project",
  devUrl: null,
  defaultBranch: "main",
  icon: "rocket",
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

const INACTIVE_PROJECT: Project = {
  ...FAKE_PROJECT,
  id: "proj-inactive",
  name: "Inactive Project",
  archivedAt: "2026-07-20T00:00:00.000Z",
};

const INACTIVE_TASK: Task = {
  ...FAKE_TASK,
  id: "task-inactive",
  projectId: INACTIVE_PROJECT.id,
  title: "Inactive task",
};

/** `list_tasks` only, keyed to FAKE_PROJECT/FAKE_TASK; every other invoke
 * resolves `[]` via smoke-utils' default. */
function mockListTasks(tasks: Task[] = [FAKE_TASK]) {
  mockInvoke.mockClear();
  mockInvoke.mockImplementation(async (cmd: string, args?: InvokeArgs) => {
    const a = args as Record<string, unknown> | undefined;
    if (cmd === "list_tasks" && a?.projectId === FAKE_PROJECT.id) return tasks as unknown;
    return [] as unknown;
  });
}

function type(value: string) {
  fireEvent.change(screen.getByPlaceholderText("Search or jump to…"), { target: { value } });
}

describe("CommandPalette", () => {
  beforeEach(() => {
    useStore.setState({
      commandOpen: false,
      projects: [],
      connectors: [],
      activeTaskId: null,
      pendingResumeTaskId: null,
      selectedCapsuleId: null,
      selectedProjectId: null,
      selectedConnectorId: null,
    });
  });

  it("opens on the store flag with the Go to and Actions groups", async () => {
    useStore.setState({ commandOpen: true });
    renderWithProviders(<CommandPalette />);

    expect(await screen.findByText("Go to")).toBeInTheDocument();
    expect(screen.getByText("Actions")).toBeInTheDocument();
    expect(screen.getByText("New capsule")).toBeInTheDocument();
    expect(screen.getByText("Add project")).toBeInTheDocument();
  });

  // The handoff: 50px search row with an `esc` pill, a 31px footer saying
  // what the search covers. The privacy line is a product requirement.
  it("carries the esc pill, the key hints and the privacy line", async () => {
    useStore.setState({ commandOpen: true });
    renderWithProviders(<CommandPalette />);

    expect(await screen.findByText("esc")).toBeInTheDocument();
    expect(screen.getByText("↑↓ Navigate · ↵ Open")).toBeInTheDocument();
    expect(screen.getByText("Searches this Mac only")).toBeInTheDocument();
  });

  // "With an empty query only the default-flagged items show" — all of Go
  // to, all of Actions, and the first three capsules. Projects, connectors
  // and settings are reachable by typing, not by scrolling a directory.
  it("shows only the default items until you type", async () => {
    mockListTasks([
      FAKE_TASK,
      { ...FAKE_TASK, id: "t2", title: "Second" },
      { ...FAKE_TASK, id: "t3", title: "Third" },
      { ...FAKE_TASK, id: "t4", title: "Fourth" },
    ]);
    useStore.setState({
      commandOpen: true,
      projects: [FAKE_PROJECT],
      connectors: [
        {
          id: "c1",
          name: "Chrome",
          kind: "chrome",
          capabilities: [],
          connected: true,
          connectedSince: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    renderWithProviders(<CommandPalette />);

    await screen.findByText(FAKE_TASK.title);
    expect(screen.queryByText("Fourth")).toBeNull();
    expect(screen.queryByText("Projects", { selector: "[cmdk-group-heading]" })).toBeNull();
    expect(screen.queryByText("Connectors", { selector: "[cmdk-group-heading]" })).toBeNull();

    type("chrome");
    await waitFor(() => expect(screen.getByText("Chrome")).toBeInTheDocument());
  });

  it("fetches tasks once per open, and only for projects in the store", async () => {
    mockInvoke.mockClear();
    mockInvoke.mockImplementation(async (cmd: string, args?: InvokeArgs) => {
      const a = args as Record<string, unknown> | undefined;
      if (cmd === "list_tasks" && a?.projectId === FAKE_PROJECT.id) {
        return [FAKE_TASK, INACTIVE_TASK] as unknown;
      }
      return [] as unknown;
    });
    useStore.setState({ commandOpen: true, projects: [FAKE_PROJECT] });
    renderWithProviders(<CommandPalette />);

    expect(await screen.findByText(FAKE_TASK.title)).toBeInTheDocument();
    // A task whose project isn't registered is dropped, not shown orphaned.
    expect(screen.queryByText(INACTIVE_TASK.title)).toBeNull();
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith("list_tasks", { projectId: FAKE_PROJECT.id });
    expect(mockInvoke).not.toHaveBeenCalledWith("list_tasks", { projectId: INACTIVE_PROJECT.id });
  });

  it("filters across label and meta with a plain substring match", async () => {
    mockListTasks();
    useStore.setState({ commandOpen: true, projects: [FAKE_PROJECT] });
    renderWithProviders(<CommandPalette />);
    await screen.findByText(FAKE_TASK.title);

    type("onboarding");
    await waitFor(() => {
      expect(screen.getByText(FAKE_TASK.title)).toBeInTheDocument();
      expect(screen.queryByText("Overview")).toBeNull();
    });
  });

  it("navigates and closes on select", async () => {
    useStore.setState({ commandOpen: true });
    renderWithProviders(<CommandPalette />);

    fireEvent.click(await screen.findByText("Connectors"));
    expect(useStore.getState().view).toBe("connectors");
    expect(useStore.getState().commandOpen).toBe(false);
  });

  // The palette never runs a restore itself: it sets the pending signal and
  // jumps to Capsules, which already owns that ceremony.
  it("routes Restore through Capsules without invoking activate_task", async () => {
    mockListTasks();
    useStore.setState({ commandOpen: true, projects: [FAKE_PROJECT] });
    renderWithProviders(<CommandPalette />);

    fireEvent.click(await screen.findByText(`Restore ${FAKE_TASK.title}`));

    expect(useStore.getState().pendingResumeTaskId).toBe(FAKE_TASK.id);
    expect(useStore.getState().selectedCapsuleId).toBe(FAKE_TASK.id);
    expect(useStore.getState().view).toBe("capsules");
    expect(useStore.getState().commandOpen).toBe(false);
    expect(mockInvoke).not.toHaveBeenCalledWith("activate_task", expect.anything());
  });

  it("opens a capsule with it selected", async () => {
    mockListTasks();
    useStore.setState({ commandOpen: true, projects: [FAKE_PROJECT] });
    renderWithProviders(<CommandPalette />);

    fireEvent.click(await screen.findByText(FAKE_TASK.title));
    expect(useStore.getState().selectedCapsuleId).toBe(FAKE_TASK.id);
    expect(useStore.getState().view).toBe("capsules");
  });

  it("jumps straight to a settings section", async () => {
    useStore.setState({ commandOpen: true, settingsSection: "general" });
    renderWithProviders(<CommandPalette />);

    type("appearance");
    fireEvent.click(await screen.findByText("Appearance"));
    expect(useStore.getState().settingsSection).toBe("appearance");
    expect(useStore.getState().view).toBe("settings");
  });

  // The handoff asks Switch theme to show the current theme as its meta, so
  // the action reads as a state change rather than a mystery toggle.
  it("shows the current theme beside Switch theme", async () => {
    useStore.setState({ commandOpen: true });
    useStore.getState().setPref("theme", "dark");
    renderWithProviders(<CommandPalette />);

    const row = (await screen.findByText("Switch theme")).closest("[cmdk-item]")!;
    expect(row.textContent).toContain("Dark");
  });

  it("clears the query between opens", async () => {
    mockListTasks();
    useStore.setState({ commandOpen: true, projects: [FAKE_PROJECT] });
    const view = renderWithProviders(<CommandPalette />);
    await screen.findByText(FAKE_TASK.title);
    type("onboarding");
    await waitFor(() => expect(screen.queryByText("Overview")).toBeNull());

    view.unmount();
    useStore.setState({ commandOpen: false });
    renderWithProviders(<CommandPalette />);
    useStore.setState({ commandOpen: true });

    expect(await screen.findByText("Overview")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search or jump to…")).toHaveValue("");
  });
});
