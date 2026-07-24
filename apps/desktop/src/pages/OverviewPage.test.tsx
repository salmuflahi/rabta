import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useStore } from "@/store";
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
    const project = {
      id: "proj-1",
      name: "Rabta",
      repoPath: "/tmp/rabta",
      devUrl: null,
      defaultBranch: "main",
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
});
