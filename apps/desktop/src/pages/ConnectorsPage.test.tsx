import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectAtMostOneAccent } from "@/test/accent";
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

  it("shows only the first pairing card's Approve button with primary variant when multiple pairings are pending", async () => {
    useStore.setState({
      connectors: [],
      pairings: [
        { pairingId: "pair-1", name: "Chrome", kind: "browser" },
        { pairingId: "pair-2", name: "Firefox", kind: "browser" },
      ],
    });

    renderWithProviders(<ConnectorsPage />);

    const approveButtons = screen.getAllByText("Approve");
    expect(approveButtons).toHaveLength(2);

    // Only the first Approve button should have bg-primary class
    const buttonsWithPrimary = approveButtons.filter((btn) => btn.classList.contains("bg-primary"));
    expect(buttonsWithPrimary).toHaveLength(1);
    expect(buttonsWithPrimary[0]).toBe(approveButtons[0]);
  });

  // Card no longer applies a border by default (Surface owns elevation, not
  // outlines), so a call site that layers on a border colour must also
  // supply the border-width utility itself or the colour renders as
  // nothing (Preflight resets border-width to 0).
  it("gives the pending-pairing card an explicit border width alongside its warning colour", async () => {
    useStore.setState({
      connectors: [],
      pairings: [{ pairingId: "pair-1", name: "Chrome", kind: "browser" }],
    });

    const { container } = renderWithProviders(<ConnectorsPage />);
    await screen.findByText("Approve");

    const pairingCard = container.querySelector('[class*="border-warning"]');
    expect(pairingCard).not.toBeNull();
    expect(pairingCard!.className).toMatch(/(^|\s)border(\s|$)/);
  });

  it("spends the accent at most once", async () => {
    useStore.setState({
      connectors: [
        {
          id: "conn-1",
          name: "VS Code",
          kind: "vscode",
          capabilities: ["files", "terminals"],
          connected: true,
          connectedSince: new Date().toISOString(),
        },
      ],
      pairings: [
        { pairingId: "pair-1", name: "Chrome", kind: "browser" },
        { pairingId: "pair-2", name: "Firefox", kind: "browser" },
      ],
    });

    const { container } = renderWithProviders(<ConnectorsPage />);
    await screen.findByText(/connected/i);
    expectAtMostOneAccent(container);
  });

  it("states connector status in words, not only colour", async () => {
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
    // Colour is never the only signal.
    expect(await screen.findByText(/Connected|Offline|Not connected/)).toBeInTheDocument();
  });
});
