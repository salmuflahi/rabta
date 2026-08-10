import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { expectAtMostOneAccent } from "@/test/accent";
import { renderWithProviders } from "@/test/smoke-utils";
import { useStore, type ConnectorRow } from "@/store";
import { ConnectorsPage } from "./ConnectorsPage";

function connector(overrides: Partial<ConnectorRow> = {}): ConnectorRow {
  return {
    id: "conn-1",
    name: "VS Code",
    kind: "vscode",
    capabilities: ["workspace", "editor", "terminal"],
    connected: true,
    connectedSince: "2026-01-01T15:00:00.000Z",
    ...overrides,
  };
}

function list() {
  return within(document.querySelector("[data-connector-list]") as HTMLElement);
}
function detail() {
  return within(document.querySelector("[data-connector-detail]") as HTMLElement);
}

function seed(state: Partial<Parameters<typeof useStore.setState>[0]> = {}) {
  useStore.setState({
    connectors: [],
    pairings: [],
    log: [],
    selectedConnectorId: null,
    ...state,
  });
}

describe("ConnectorsPage", () => {
  beforeEach(() => seed());

  // The Toolbar owns the view's <h1>.
  it("does not own the document's top heading", () => {
    seed({ connectors: [connector()] });
    renderWithProviders(<ConnectorsPage />);
    expect(document.querySelector("h1")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "VS Code" })).toBeInTheDocument();
  });

  it("states status in words in both panes, not colour alone", () => {
    seed({
      connectors: [connector(), connector({ id: "conn-2", name: "Chrome", kind: "chrome", connected: false })],
    });
    renderWithProviders(<ConnectorsPage />);
    expect(list().getByText("Connected")).toBeInTheDocument();
    expect(list().getByText("Offline")).toBeInTheDocument();
    expect(detail().getByText(/^Connected .* · approved by you/)).toBeInTheDocument();
  });

  it("selects a connector on click and keeps the selected row neutral", () => {
    seed({
      connectors: [connector(), connector({ id: "conn-2", name: "Chrome", kind: "chrome" })],
    });
    const { container } = renderWithProviders(<ConnectorsPage />);
    fireEvent.click(list().getByText("Chrome").closest("button")!);

    expect(useStore.getState().selectedConnectorId).toBe("conn-2");
    const row = list().getByText("Chrome").closest("button")!;
    expect(row.className.split(/\s+/)).toContain("bg-secondary");
    expect(row.className.split(/\s+/)).not.toContain("bg-primary");
    expectAtMostOneAccent(container);
  });

  it("falls back to the first connector when the selected id has gone away", () => {
    seed({ connectors: [connector()], selectedConnectorId: "conn-that-quit" });
    renderWithProviders(<ConnectorsPage />);
    expect(screen.getByRole("heading", { level: 2, name: "VS Code" })).toBeInTheDocument();
  });

  it("reports an offline connector as offline rather than claiming a live link", () => {
    seed({ connectors: [connector({ connected: false })] });
    renderWithProviders(<ConnectorsPage />);
    expect(detail().getByText(/^Offline · last seen/)).toBeInTheDocument();
    expect(detail().queryByText(/approved by you/)).toBeNull();
  });

  it("shows a reported version, and nothing when none was reported", () => {
    seed({ connectors: [connector({ version: "0.1.0" })] });
    const withVersion = renderWithProviders(<ConnectorsPage />);
    expect(detail().getByText(/v0\.1\.0/)).toBeInTheDocument();
    withVersion.unmount();

    seed({ connectors: [connector()] });
    renderWithProviders(<ConnectorsPage />);
    expect(detail().queryByText(/\bv\d/)).toBeNull();
  });
});

describe("ConnectorsPage permissions", () => {
  beforeEach(() => seed());

  // These lines are claims the app makes about itself, checked against what
  // the connectors actually send (see src/lib/connectorFacts.ts).
  it("derives Can see from the capabilities the connector actually declared", () => {
    seed({ connectors: [connector({ capabilities: ["tabs"], kind: "chrome", name: "Chrome" })] });
    renderWithProviders(<ConnectorsPage />);

    expect(detail().getByText("Can see")).toBeInTheDocument();
    expect(detail().getByText("The addresses and titles of open tabs")).toBeInTheDocument();
    // Never declared a terminal capability, so it is never described as
    // reading terminals.
    expect(detail().queryByText(/Terminal names/)).toBeNull();
  });

  it("denies concretely, next to what it is denying", () => {
    seed({ connectors: [connector({ capabilities: ["tabs"] })] });
    renderWithProviders(<ConnectorsPage />);
    expect(detail().getByText("Never sees")).toBeInTheDocument();
    expect(detail().getByText("Page contents, form data or cookies")).toBeInTheDocument();
    expect(detail().getByText("Passwords, tokens or keychain items")).toBeInTheDocument();
  });

  it("lists every declared capability with what it is for", () => {
    seed({ connectors: [connector({ capabilities: ["workspace", "editor"] })] });
    renderWithProviders(<ConnectorsPage />);
    expect(detail().getByText("workspace")).toBeInTheDocument();
    expect(detail().getByText("editor")).toBeInTheDocument();
    expect(detail().getByText(/Reads which folder is open/)).toBeInTheDocument();
  });

  // A connector declaring something this app has no words for is exactly
  // what the user should be able to see — hiding it would be the wrong way
  // round for a privacy screen.
  it("still lists a capability it has no description for", () => {
    seed({ connectors: [connector({ capabilities: ["clipboard"] })] });
    renderWithProviders(<ConnectorsPage />);
    expect(detail().getByText("clipboard")).toBeInTheDocument();
    expect(detail().getByText(/no description for it/)).toBeInTheDocument();
  });

  it("carries the local-only footer verbatim", () => {
    seed({ connectors: [connector()] });
    renderWithProviders(<ConnectorsPage />);
    expect(
      screen.getByText("Talks to Rabta on this Mac only — nothing leaves it."),
    ).toBeInTheDocument();
  });

  // There is no disconnect command in this app — connectors hold the socket
  // and drop it themselves. The handoff draws a Disconnect button; drawing
  // one that did nothing would be worse than saying so.
  it("offers no Disconnect button it could not honour", () => {
    seed({ connectors: [connector()] });
    renderWithProviders(<ConnectorsPage />);
    expect(screen.queryByRole("button", { name: /Disconnect/i })).toBeNull();
    expect(screen.getByText("Quit the app to disconnect it")).toBeInTheDocument();
  });
});

describe("ConnectorsPage traffic", () => {
  beforeEach(() => seed());

  it("shows only this connector's own events", () => {
    seed({
      connectors: [connector(), connector({ id: "conn-2", name: "Chrome", kind: "chrome" })],
      log: [
        { seq: 1, at: new Date().toISOString(), type: "commandSent", connectorId: "conn-1", name: "workspace.state" },
        { seq: 2, at: new Date().toISOString(), type: "commandSent", connectorId: "conn-2", name: "tabs.list" },
      ],
    });
    renderWithProviders(<ConnectorsPage />);
    expect(detail().getByText(/workspace\.state/)).toBeInTheDocument();
    expect(detail().queryByText(/tabs\.list/)).toBeNull();
  });

  it("says so plainly when a connector has done nothing yet", () => {
    seed({ connectors: [connector()] });
    renderWithProviders(<ConnectorsPage />);
    expect(detail().getByText("Nothing from this connector yet.")).toBeInTheDocument();
  });
});

describe("ConnectorsPage pairing", () => {
  beforeEach(() => seed());

  it("offers Deny and Approve for a pending request", () => {
    seed({ pairings: [{ pairingId: "pair-1", name: "Chrome", kind: "chrome" }] });
    renderWithProviders(<ConnectorsPage />);
    // Scoped: the empty state below also names Chrome, in its install steps.
    expect(screen.getByRole("button", { name: "Approve" }).closest("div")!.parentElement!.textContent).toMatch(
      /Chrome \(Chrome\) wants to connect/,
    );
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deny" })).toBeInTheDocument();
  });

  // N pending requests must never mean N orange buttons.
  it("spends the accent on the first Approve only", () => {
    seed({
      pairings: [
        { pairingId: "pair-1", name: "Chrome", kind: "chrome" },
        { pairingId: "pair-2", name: "Cursor", kind: "cursor" },
      ],
    });
    const { container } = renderWithProviders(<ConnectorsPage />);
    const approves = screen.getAllByRole("button", { name: "Approve" });
    expect(approves).toHaveLength(2);
    expect(approves.filter((b) => b.classList.contains("bg-primary"))).toHaveLength(1);
    expectAtMostOneAccent(container);
  });
});

describe("ConnectorsPage empty state", () => {
  beforeEach(() => seed());

  it("teaches the real, do-it-now install steps", () => {
    renderWithProviders(<ConnectorsPage />);
    expect(screen.getByText("No connectors yet")).toBeInTheDocument();
    expect(screen.getByText("VS Code or Cursor")).toBeInTheDocument();
    expect(screen.getByText(/chrome:\/\/extensions/)).toBeInTheDocument();
    expect(
      screen.getByText("Talks to Rabta on this Mac only — nothing leaves it."),
    ).toBeInTheDocument();
  });
});

describe("ConnectorsPage capability tokens", () => {
  beforeEach(() => seed());

  // Connectors declare capabilities at two granularities: the coarse family
  // the extensions send today ("workspace") and the dotted command form the
  // handoff writes ("workspace.snapshot"). Both must resolve to the same
  // description, and the table must still print the exact token declared.
  it("describes dotted command tokens by their family, without rewriting them", () => {
    seed({ connectors: [connector({ capabilities: ["workspace.snapshot", "tabs.list"] })] });
    renderWithProviders(<ConnectorsPage />);
    expect(detail().getByText("workspace.snapshot")).toBeInTheDocument();
    expect(detail().getByText("tabs.list")).toBeInTheDocument();
    expect(detail().getByText(/Reads which folder is open/)).toBeInTheDocument();
    expect(detail().getByText("The addresses and titles of open tabs")).toBeInTheDocument();
    expect(detail().queryByText(/no description for it/)).toBeNull();
  });
});
