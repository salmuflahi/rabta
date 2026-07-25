import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useStore } from "@/store";
import { renderWithProviders } from "@/test/smoke-utils";
import { ConnectorsPage } from "./ConnectorsPage";

describe("ConnectorsPage", () => {
  it("renders a populated connector card and a pending pairing without throwing", async () => {
    useStore.setState({
      connectors: [
        {
          id: "conn-1",
          name: "VS Code",
          kind: "vscode",
          capabilities: ["files", "terminals"],
          connected: true,
          connectedSince: "2026-01-01T15:04:12.000Z",
        },
      ],
      pairings: [{ pairingId: "pair-1", name: "Chrome", kind: "browser" }],
    });

    renderWithProviders(<ConnectorsPage />);

    expect(await screen.findByText("Connectors")).toBeInTheDocument();
    // "VS Code" appears as both the connector name and the friendly kind badge.
    expect(screen.getAllByText("VS Code").length).toBeGreaterThan(0);
    expect(screen.getByText(/^Connected/)).toBeInTheDocument();
    expect(screen.getByText(/Chrome/)).toBeInTheDocument();
    expect(screen.getByText("Approve")).toBeInTheDocument();
    expect(screen.getByText("Deny")).toBeInTheDocument();
  });

  it("shows 'Connected · since {relativeTime}' for a connected connector (asserts the stable prefix, not the exact relative time)", async () => {
    useStore.setState({
      connectors: [
        {
          id: "conn-1",
          name: "VS Code",
          kind: "vscode",
          capabilities: [],
          connected: true,
          connectedSince: new Date().toISOString(),
        },
      ],
      pairings: [],
    });

    renderWithProviders(<ConnectorsPage />);

    expect(await screen.findByText(/^Connected · since /)).toBeInTheDocument();
  });

  it("shows a connector's reported version and renders none when it reported none", async () => {
    useStore.setState({
      connectors: [
        {
          id: "conn-v",
          name: "VS Code",
          kind: "vscode",
          capabilities: ["files"],
          version: "0.1.0",
          connected: true,
          connectedSince: new Date().toISOString(),
        },
        {
          id: "conn-nov",
          name: "Legacy",
          kind: "fake",
          capabilities: [],
          connected: false,
          connectedSince: "2026-01-01T15:04:12.000Z",
        },
      ],
      pairings: [],
    });

    renderWithProviders(<ConnectorsPage />);

    expect(await screen.findByText("v0.1.0")).toBeInTheDocument();
    // Only the connector that reported a version shows a version chip.
    expect(screen.getAllByText(/^v\d/)).toHaveLength(1);
  });

  it("shows 'Last seen {relativeTime}' for a disconnected connector, using an honest ISO connectedSince", async () => {
    useStore.setState({
      connectors: [
        {
          id: "conn-2",
          name: "Chrome",
          kind: "browser",
          capabilities: [],
          connected: false,
          connectedSince: "2026-01-01T15:04:12.000Z",
        },
      ],
      pairings: [],
    });

    renderWithProviders(<ConnectorsPage />);

    expect(await screen.findByText(/^Offline · last seen /)).toBeInTheDocument();
    // Not the raw unparseable locale string / "unknown" fallback.
    expect(screen.queryByText(/last seen unknown/)).not.toBeInTheDocument();
  });
});
