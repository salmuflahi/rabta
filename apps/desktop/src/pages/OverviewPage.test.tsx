import type { InvokeArgs } from "@tauri-apps/api/core";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useStore, type Project, type Task } from "@/store";
import { expectAtMostOneAccent } from "@/test/accent";
import { mockInvoke, renderWithProviders } from "@/test/smoke-utils";
import { OverviewPage } from "./OverviewPage";

function projectFixture(overrides: Partial<Project> = {}): Project {
  return {
    id: "proj-fixture",
    name: "Fixture Project",
    repoPath: "/tmp/fixture-project",
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
    ...overrides,
  };
}

describe("OverviewPage", () => {
  it("renders the empty-state welcome copy without throwing", async () => {
    renderWithProviders(<OverviewPage />);
    expect(await screen.findByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Welcome to Rabta")).toBeInTheDocument();
  });

  it("renders the connected apps and recent activity sections when data is seeded", async () => {
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

    // The stat tile is gone; the section heading is the only "Connected Apps"
    // left. The assertion stays >= 1 because that is the real contract —
    // the section must render, however many times the words appear.
    expect((await screen.findAllByText("Connected Apps")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Recent Activity")).toBeInTheDocument();
  });

  it("does not restate sidebar counts as stat tiles", async () => {
    renderWithProviders(<OverviewPage />);
    await screen.findByText("Overview");
    // Counts live on the sidebar rows that own them. A tile here would be
    // the same number in two places. The removed tiles used Title Case
    // ("Projects", "Open Tasks") — asserting the uppercase strings the
    // tiles never used would pass even if the tiles came back.
    expect(screen.queryByText("Projects")).toBeNull();
    expect(screen.queryByText("Open Tasks")).toBeNull();
  });

  it("spends the accent at most once", async () => {
    const { container } = renderWithProviders(<OverviewPage />);
    await screen.findByText("Overview");
    expectAtMostOneAccent(container);
  });

  it("omits Continue Working projects with malformed persisted lastOpenedAt timestamps", async () => {
    const valid = projectFixture({
      id: "proj-valid",
      name: "Valid Project",
      lastOpenedAt: "2026-07-24T15:00:00.000Z",
    });
    const invalid = projectFixture({
      id: "proj-invalid",
      name: "Invalid Timestamp Project",
      lastOpenedAt: "not-a-timestamp",
    });
    mockInvoke.mockClear();
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "list_projects") return [invalid, valid];
      if (cmd === "list_tasks") return [];
      if (cmd === "active_task") return null;
      return [];
    });

    renderWithProviders(<OverviewPage />);

    expect(await screen.findByText("Continue Working")).toBeInTheDocument();
    expect(screen.getByText("Valid Project")).toBeInTheDocument();
    expect(screen.queryByText("Invalid Timestamp Project")).not.toBeInTheDocument();
    expect(screen.queryByText("Opened unknown")).not.toBeInTheDocument();
  });

  it("caps Continue Working at five projects in deterministic newest-first order", async () => {
    const rankedProjects = [
      projectFixture({
        id: "proj-rank-1",
        name: "Rank 1",
        lastOpenedAt: "2026-07-24T16:00:00.000Z",
      }),
      projectFixture({
        id: "proj-rank-2",
        name: "Rank 2",
        lastOpenedAt: "2026-07-24T15:00:00.000Z",
      }),
      projectFixture({
        id: "proj-rank-3",
        name: "Rank 3",
        lastOpenedAt: "2026-07-24T14:00:00.000Z",
      }),
      projectFixture({
        id: "proj-rank-4",
        name: "Rank 4",
        lastOpenedAt: "2026-07-24T13:00:00.000Z",
      }),
      projectFixture({
        id: "proj-rank-5",
        name: "Rank 5",
        lastOpenedAt: "2026-07-24T12:00:00.000Z",
      }),
      projectFixture({
        id: "proj-rank-6",
        name: "Rank 6",
        lastOpenedAt: "2026-07-24T11:00:00.000Z",
      }),
    ];
    mockInvoke.mockClear();
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "list_projects") {
        return [
          rankedProjects[5],
          rankedProjects[2],
          rankedProjects[0],
          rankedProjects[4],
          rankedProjects[1],
          rankedProjects[3],
        ];
      }
      if (cmd === "list_tasks") return [];
      if (cmd === "active_task") return null;
      return [];
    });

    renderWithProviders(<OverviewPage />);

    expect(await screen.findByText("Continue Working")).toBeInTheDocument();
    expect(screen.getAllByText(/^Rank [1-6]$/).map((node) => node.textContent)).toEqual([
      "Rank 1",
      "Rank 2",
      "Rank 3",
      "Rank 4",
      "Rank 5",
    ]);
    expect(screen.queryByText("Rank 6")).not.toBeInTheDocument();
  });

  it("renders deterministic relative-time copy and omits a zero-duration last session", async () => {
    const now = Date.parse("2026-07-24T16:00:00.000Z");
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(now);
    const project = projectFixture({
      id: "proj-relative-time",
      name: "Relative Time Project",
      lastOpenedAt: "2026-07-24T15:55:00.000Z",
      activeSeconds: 0,
    });
    mockInvoke.mockClear();
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "list_projects") return [project];
      if (cmd === "list_tasks") return [];
      if (cmd === "active_task") return null;
      return [];
    });

    try {
      renderWithProviders(<OverviewPage />);

      expect(await screen.findByText("Opened 5m ago")).toBeInTheDocument();
      expect(screen.queryByText(/^Last session /)).not.toBeInTheDocument();
    } finally {
      dateNow.mockRestore();
    }
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
    mockInvoke.mockImplementation(async (cmd: string, args?: InvokeArgs) => {
      if (cmd === "list_projects") return [ship, previous, stale, neverOpened];
      if (cmd === "list_tasks") {
        const projectId =
          args && !Array.isArray(args) && typeof args === "object"
            ? (args as { projectId?: string }).projectId
            : undefined;
        return tasks.filter((task) => task.projectId === projectId);
      }
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

  it("renders the active task's live marker and Resume action within the one-accent budget", async () => {
    // The one scenario the accent-mark opt-out exists for: a real active
    // task renders both the "you are here" marker (data-accent-mark) and
    // the page's single primary action (Resume) side by side. Every other
    // test in this file seeds `active_task: null`, so the raised Surface
    // that holds both never mounts anywhere else.
    const project = projectFixture({ id: "prj_atlas", name: "atlas-api" });
    const activeTask: Task = {
      id: "task_reconnect",
      projectId: project.id,
      title: "Wire the connector SDK reconnect",
      status: "open",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    mockInvoke.mockClear();
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "list_projects") return [project];
      if (cmd === "list_tasks") return [activeTask];
      if (cmd === "active_task") return activeTask.id;
      return [];
    });

    const { container } = renderWithProviders(<OverviewPage />);

    // (a) The Resume button actually renders — proving the raised Surface
    // is on screen, otherwise the rest of this test would be vacuous.
    const resumeButton = await screen.findByRole("button", { name: "Resume" });
    expect(resumeButton).toBeInTheDocument();
    expect(screen.getByText("Wire the connector SDK reconnect")).toBeInTheDocument();

    // (b) The live marker renders and carries the opt-out attribute.
    const marker = container.querySelector("[data-accent-mark]");
    expect(marker).not.toBeNull();

    // (c) With both present, the page still spends the accent at most once.
    expectAtMostOneAccent(container);
  });
});
