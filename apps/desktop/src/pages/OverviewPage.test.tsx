import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useStore, type Project, type Task } from "@/store";
import { mockInvoke, renderWithProviders } from "@/test/smoke-utils";
import { OverviewPage } from "./OverviewPage";

describe("OverviewPage", () => {
  it("renders the empty-state welcome copy without throwing", async () => {
    renderWithProviders(<OverviewPage />);
    expect(await screen.findByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Welcome to Rabta")).toBeInTheDocument();
  });

  it("renders stat cards and recent activity when data is seeded", async () => {
    // OverviewPage refetches projects/tasks itself via list_projects +
    // list_tasks (same invokes CapsulesPage already uses), so the mock
    // must resolve them — a bare useStore.setState would just get
    // clobbered by the default `[]`-resolving invoke once it lands.
    const project: Project = {
      id: "proj-1",
      name: "Rabta",
      repoPath: "/tmp/rabta",
      devUrl: null,
      defaultBranch: "main",
      icon: null,
      archivedAt: null,
      lastOpenedAt: null,
      lastTaskId: null,
      activeSeconds: 0,
      sortOrder: 0,
      createdAt: "now",
      updatedAt: "now",
    };
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "list_projects") return [project];
      if (cmd === "list_tasks") return [];
      if (cmd === "active_task") return null;
      return [];
    });
    useStore.setState({
      connectors: [
        {
          id: "conn-1",
          name: "VS Code",
          kind: "vscode",
          capabilities: [],
          connected: true,
          connectedSince: "2026-01-01T15:04:12.000Z",
        },
      ],
      log: [{ seq: 1, at: "3:05:00 PM", type: "connectorConnected" }],
    });

    renderWithProviders(<OverviewPage />);

    expect(await screen.findByText("Connectors Connected")).toBeInTheDocument();
    expect(screen.getByText("Recent Activity")).toBeInTheDocument();
  });

  it("shows newest active Continue Working projects and routes Resume through Capsules", async () => {
    const ship: Project = {
      id: "proj-ship",
      name: "Ship",
      repoPath: "/tmp/ship",
      devUrl: null,
      defaultBranch: "main",
      icon: "rocket",
      archivedAt: null,
      lastOpenedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
      lastTaskId: "task-ship",
      activeSeconds: 2 * 3600 + 17 * 60,
      sortOrder: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const previous: Project = {
      ...ship,
      id: "proj-previous",
      name: "Previous Project",
      lastOpenedAt: new Date(Date.now() - 60 * 60_000).toISOString(),
      lastTaskId: "task-previous",
      activeSeconds: 60,
    };
    const stale: Project = {
      ...ship,
      id: "proj-stale",
      name: "Stale Project",
      lastOpenedAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
      lastTaskId: "missing-task",
      activeSeconds: 30,
    };
    const neverOpened: Project = {
      ...ship,
      id: "proj-never-opened",
      name: "Never Opened",
      lastOpenedAt: null,
      lastTaskId: null,
      activeSeconds: 0,
    };
    const archivedOnlyInStore: Project = {
      ...ship,
      id: "proj-archived",
      name: "Archived Project",
      archivedAt: "2026-07-20T00:00:00.000Z",
    };
    const tasks: Task[] = [
      {
        id: "task-ship",
        projectId: ship.id,
        title: "Deploy the release",
        status: "open",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "task-previous",
        projectId: previous.id,
        title: "Review telemetry",
        status: "open",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    mockInvoke.mockClear();
    mockInvoke.mockImplementation(async (cmd: string, args?: { projectId?: string }) => {
      if (cmd === "list_projects") return [ship, previous, stale, neverOpened];
      if (cmd === "list_tasks") return tasks.filter((task) => task.projectId === args?.projectId);
      if (cmd === "active_task") return null;
      return [];
    });
    // `list_projects` is the authoritative source: an archived record that
    // exists only in stale local state must not leak into Continue Working.
    useStore.setState({ projects: [archivedOnlyInStore], pendingResumeTaskId: null, view: "overview" });

    renderWithProviders(<OverviewPage />);

    expect(await screen.findByText("Continue Working")).toBeInTheDocument();
    expect(screen.getByText("Last session 2h 17m")).toBeInTheDocument();
    expect(screen.getByText("Deploy the release")).toBeInTheDocument();
    expect(screen.queryByText("Never Opened")).not.toBeInTheDocument();
    expect(screen.queryByText("Archived Project")).not.toBeInTheDocument();
    expect(
      screen.getByText("Ship").compareDocumentPosition(screen.getByText("Previous Project")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    fireEvent.click(screen.getByRole("button", { name: "Resume Ship" }));
    expect(useStore.getState().pendingResumeTaskId).toBe("task-ship");
    expect(useStore.getState().view).toBe("capsules");
    expect(mockInvoke).not.toHaveBeenCalledWith("activate_task", expect.anything());

    useStore.setState({ pendingResumeTaskId: null, view: "overview" });
    fireEvent.click(screen.getByRole("button", { name: "View Capsules" }));
    expect(useStore.getState().pendingResumeTaskId).toBeNull();
    expect(useStore.getState().view).toBe("capsules");
  });
});
