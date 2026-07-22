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
          connectedSince: "3:04:12 PM",
        },
      ],
      pairings: [{ pairingId: "pair-1", name: "Chrome", kind: "browser" }],
    });

    renderWithProviders(<ConnectorsPage />);

    expect(await screen.findByText("Connectors")).toBeInTheDocument();
    expect(screen.getByText("VS Code")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText(/Chrome/)).toBeInTheDocument();
    expect(screen.getByText("Approve")).toBeInTheDocument();
    expect(screen.getByText("Deny")).toBeInTheDocument();
  });
});
