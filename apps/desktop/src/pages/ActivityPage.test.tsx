import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useStore } from "@/store";
import { renderWithProviders } from "@/test/smoke-utils";
import { ActivityPage } from "./ActivityPage";

describe("ActivityPage", () => {
  it("humanizes seeded log entries, resolving connectorId to a name", async () => {
    useStore.setState({
      connectors: [
        {
          id: "conn-1",
          name: "VS Code",
          kind: "vscode",
          capabilities: [],
          connected: true,
          connectedSince: "3:00:00 PM",
        },
      ],
      log: [
        {
          seq: 1,
          at: "2026-07-17T15:04:12.000Z",
          type: "connectorConnected",
          connector: { id: "conn-1", name: "VS Code" },
        },
        {
          seq: 2,
          at: "2026-07-17T15:05:00.000Z",
          type: "connectorDisconnected",
          connectorId: "conn-1",
        },
      ],
    });

    renderWithProviders(<ActivityPage />);

    expect(await screen.findByText("Activity")).toBeInTheDocument();
    expect(screen.getByText("VS Code connected")).toBeInTheDocument();
    expect(screen.getByText("VS Code disconnected")).toBeInTheDocument();
    // Raw payload is present but tucked behind the per-row expander, not inline.
    expect(screen.queryByText(/"seq":1/)).not.toBeInTheDocument();
  });

  it("shows an inviting empty state when there is no activity", async () => {
    useStore.setState({ connectors: [], log: [] });

    renderWithProviders(<ActivityPage />);

    expect(await screen.findByText("No activity yet")).toBeInTheDocument();
  });
});
