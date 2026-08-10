import type { InvokeArgs } from "@tauri-apps/api/core";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useStore, type Project, type Task, type TaskResource } from "@/store";
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

function taskFixture(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-fixture",
    projectId: "proj-fixture",
    title: "Fixture capsule",
    status: "open",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function resourceFixture(overrides: Partial<TaskResource> = {}): TaskResource {
  return {
    id: "res-fixture",
    taskId: "task-fixture",
    connectorKind: "git",
    resourceType: "branch",
    payload: { branch: "main" },
    createdAt: "2026-07-24T15:55:00.000Z",
    ...overrides,
  };
}

/** Wires the three invokes Overview makes: projects, their tasks, and each
 * task's captured resources. Everything the page says about a capsule comes
 * from these, so a test that wants a branch or a chip has to provide the
 * payload that would really carry it. */
function seed({
  projects,
  tasks = [],
  resources = {},
  activeTask = null,
}: {
  projects: Project[];
  tasks?: Task[];
  resources?: Record<string, TaskResource[]>;
  activeTask?: string | null;
}) {
  mockInvoke.mockClear();
  mockInvoke.mockImplementation(async (cmd: string, args?: InvokeArgs) => {
    const arg = args && !Array.isArray(args) && typeof args === "object" ? (args as Record<string, string>) : {};
    if (cmd === "list_projects") return projects;
    if (cmd === "list_tasks") return tasks.filter((t) => t.projectId === arg.projectId);
    if (cmd === "task_resources") return resources[arg.taskId] ?? [];
    if (cmd === "active_task") return activeTask;
    return [];
  });
}

describe("OverviewPage", () => {
  it("leads with the date and a one-line glance at this Mac", async () => {
    const now = Date.parse("2026-08-09T16:00:00.000Z");
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(now);
    vi.setSystemTime(now);
    const project = projectFixture({ id: "proj-1", name: "atlas-api" });
    seed({
      projects: [project],
      tasks: [taskFixture({ id: "t1", projectId: "proj-1", title: "Wire the reconnect" })],
      resources: { t1: [resourceFixture({ taskId: "t1", createdAt: "2026-08-09T15:48:00.000Z" })] },
    });
    useStore.setState({
      connectors: [
        {
          id: "c1",
          name: "Cursor",
          kind: "cursor",
          capabilities: [],
          connected: true,
          connectedSince: "2026-08-09T15:00:00.000Z",
        },
        {
          id: "c2",
          name: "Chrome",
          kind: "chrome",
          capabilities: [],
          connected: false,
          connectedSince: "2026-08-09T15:00:00.000Z",
        },
      ],
    });

    try {
      renderWithProviders(<OverviewPage />);
      // Locale-formatted, so the assertion is on the parts, not a fixed
      // en-GB string — the handoff's "Saturday, 9 August" is the shape.
      const heading = await screen.findByRole("heading", { level: 1 });
      const expected = new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
      }).format(new Date(now));
      expect(heading.textContent).toBe(expected);
      expect(heading.textContent).toMatch(/August/);

      // Only *connected* apps count — one of the two above is offline.
      expect(await screen.findByText(/^1 app connected · 1 capsule open · last capture/)).toBeInTheDocument();
    } finally {
      dateNow.mockRestore();
      vi.useRealTimers();
    }
  });

  // "The app has no account and must never greet the user by name." The date
  // heading is deliberately the most personal thing on the screen.
  it("never greets the user", async () => {
    seed({ projects: [] });
    const { container } = renderWithProviders(<OverviewPage />);
    await screen.findByRole("heading", { level: 1 });
    expect(container.textContent).not.toMatch(/\b(Welcome|Hello|Hi|Good (morning|afternoon|evening))\b/);
  });

  // Counts live on the sidebar rows that own them; the handoff is explicit
  // that Overview carries "no counts that repeat the sidebar badges".
  it("does not restate sidebar counts as stat tiles", async () => {
    seed({ projects: [projectFixture()] });
    renderWithProviders(<OverviewPage />);
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByText("Projects")).toBeNull();
    expect(screen.queryByText("Open Tasks")).toBeNull();
    expect(screen.queryByText("Connected Apps")).toBeNull();
  });

  it("shows the capsule you were last in, with its branch, save time and contents", async () => {
    const now = Date.parse("2026-08-09T16:00:00.000Z");
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(now);
    seed({
      projects: [projectFixture({ id: "proj-1", name: "atlas-api" })],
      tasks: [taskFixture({ id: "t1", projectId: "proj-1", title: "Wire the connector SDK reconnect" })],
      resources: {
        t1: [
          resourceFixture({
            id: "r-git",
            taskId: "t1",
            connectorKind: "git",
            payload: { branch: "feat/reconnect" },
            createdAt: "2026-08-09T15:48:00.000Z",
          }),
          resourceFixture({
            id: "r-editor",
            taskId: "t1",
            connectorKind: "cursor",
            resourceType: "workspace",
            payload: {
              openFiles: ["a.ts", "b.ts", "c.ts"],
              terminals: [{ name: "zsh" }],
              workspaceFolder: "/repo",
            },
            createdAt: "2026-08-09T15:48:00.000Z",
          }),
          resourceFixture({
            id: "r-chrome",
            taskId: "t1",
            connectorKind: "chrome",
            resourceType: "tabs",
            payload: { tabs: ["a", "b"] },
            createdAt: "2026-08-09T15:48:00.000Z",
          }),
        ],
      },
    });

    try {
      renderWithProviders(<OverviewPage />);
      expect(await screen.findByText("Wire the connector SDK reconnect")).toBeInTheDocument();
      expect(screen.getByText(/atlas-api/)).toBeInTheDocument();
      expect(screen.getByText("feat/reconnect")).toBeInTheDocument();
      expect(screen.getByText(/saved 12m ago/)).toBeInTheDocument();

      // Chips are read off real payloads — three files, two tabs, one
      // branch, one terminal, one folder. Nothing is assumed.
      expect(screen.getByText("3 files")).toBeInTheDocument();
      expect(screen.getByText("2 tabs")).toBeInTheDocument();
      expect(screen.getByText("1 branch")).toBeInTheDocument();
      expect(screen.getByText("1 terminal")).toBeInTheDocument();
      expect(screen.getByText("1 folder")).toBeInTheDocument();
    } finally {
      dateNow.mockRestore();
    }
  });

  // A tool that captured nothing produces no chip rather than a zero:
  // "0 tabs" and "Chrome wasn't running" are different facts.
  it("shows no chip for a tool that captured nothing", async () => {
    seed({
      projects: [projectFixture({ id: "proj-1" })],
      tasks: [taskFixture({ id: "t1", projectId: "proj-1" })],
      resources: { t1: [resourceFixture({ taskId: "t1" })] },
    });
    renderWithProviders(<OverviewPage />);
    await screen.findByText("Fixture capsule");
    expect(screen.getByText("1 branch")).toBeInTheDocument();
    expect(screen.queryByText(/^0 /)).toBeNull();
    expect(screen.queryByText(/tabs?$/)).toBeNull();
  });

  it("says so plainly when a capsule has never been captured", async () => {
    seed({
      projects: [projectFixture({ id: "proj-1" })],
      tasks: [taskFixture({ id: "t1", projectId: "proj-1", title: "Fresh capsule" })],
      resources: { t1: [] },
    });
    renderWithProviders(<OverviewPage />);
    await screen.findByText("Fresh capsule");
    expect(screen.getByText(/never captured/)).toBeInTheDocument();
  });

  it("lists the other open capsules and opens one in Capsules with it selected", async () => {
    seed({
      projects: [projectFixture({ id: "proj-1", name: "atlas-api" })],
      tasks: [
        taskFixture({ id: "t1", projectId: "proj-1", title: "Newest" }),
        taskFixture({ id: "t2", projectId: "proj-1", title: "Older" }),
        taskFixture({ id: "t3", projectId: "proj-1", title: "Oldest" }),
      ],
      resources: {
        t1: [resourceFixture({ taskId: "t1", createdAt: "2026-08-09T15:00:00.000Z" })],
        t2: [resourceFixture({ taskId: "t2", createdAt: "2026-08-09T14:00:00.000Z" })],
        t3: [resourceFixture({ taskId: "t3", createdAt: "2026-08-09T13:00:00.000Z" })],
      },
    });
    useStore.setState({ view: "overview", selectedCapsuleId: null });

    renderWithProviders(<OverviewPage />);
    expect(await screen.findByText("Also open")).toBeInTheDocument();
    // The freshest capture is the hero; the rest fall to "Also open", still
    // newest-first.
    const others = screen
      .getAllByRole("button")
      .filter((b) => /^(Older|Oldest)/.test(b.textContent ?? ""));
    expect(others.map((b) => b.firstElementChild?.textContent)).toEqual(["Older", "Oldest"]);

    fireEvent.click(others[0]);
    expect(useStore.getState().selectedCapsuleId).toBe("t2");
    expect(useStore.getState().view).toBe("capsules");
  });

  it("routes Resume through Capsules rather than activating in place", async () => {
    seed({
      projects: [projectFixture({ id: "proj-1" })],
      tasks: [taskFixture({ id: "t1", projectId: "proj-1", title: "Ship it" })],
      resources: { t1: [resourceFixture({ taskId: "t1" })] },
    });
    useStore.setState({ view: "overview", pendingResumeTaskId: null });

    renderWithProviders(<OverviewPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Resume" }));

    expect(useStore.getState().pendingResumeTaskId).toBe("t1");
    expect(useStore.getState().view).toBe("capsules");
    // Overview never re-implements the restore ceremony — Capsules owns it.
    expect(mockInvoke).not.toHaveBeenCalledWith("activate_task", expect.anything());
  });

  it("spends the accent at most once, live marker and Resume both present", async () => {
    // The one scenario the accent-mark opt-out exists for: the hero draws
    // both the "this is the live one" dot and the page's single primary
    // action, side by side.
    seed({
      projects: [projectFixture({ id: "proj-1" })],
      tasks: [taskFixture({ id: "t1", projectId: "proj-1" })],
      resources: { t1: [resourceFixture({ taskId: "t1" })] },
      activeTask: "t1",
    });
    const { container } = renderWithProviders(<OverviewPage />);
    await screen.findByRole("button", { name: "Resume" });
    expect(container.querySelector("[data-accent-mark]")).not.toBeNull();
    expectAtMostOneAccent(container);
  });

  it("shows the recent events with their times", async () => {
    seed({ projects: [] });
    useStore.setState({
      connectors: [],
      log: [{ seq: 1, at: new Date(Date.now() - 120_000).toISOString(), type: "connectorConnected" }],
    });
    renderWithProviders(<OverviewPage />);
    expect(await screen.findByText("Recent")).toBeInTheDocument();
    expect(screen.getByText("2m ago")).toBeInTheDocument();
  });
});
