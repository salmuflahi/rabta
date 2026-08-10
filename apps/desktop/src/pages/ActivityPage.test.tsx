import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useStore, type LogEntry } from "@/store";
import { expectAtMostOneAccent } from "@/test/accent";
import { renderWithProviders } from "@/test/smoke-utils";
import { ActivityPage } from "./ActivityPage";

function eventList() {
  return within(document.querySelector("[data-event-list]") as HTMLElement);
}
function details() {
  return within(document.querySelector("[data-event-details]") as HTMLElement);
}

function seed(log: LogEntry[], extra: Record<string, unknown> = {}) {
  useStore.setState({
    log,
    paused: false,
    connectors: [],
    selectedEventSeq: null,
    ...extra,
  });
}

const VS_CODE = {
  id: "conn-1",
  name: "VS Code",
  kind: "vscode",
  capabilities: [],
  connected: true,
  connectedSince: "2026-01-01T15:00:00.000Z",
};

describe("ActivityPage", () => {
  beforeEach(() => seed([]));

  // The Toolbar owns the view's <h1>. This page has no heading of its own
  // at all now — the Details pane's label is a `<p>`, not a heading, since
  // it names a pane rather than a section of content.
  it("does not own the document's top heading", () => {
    seed([{ seq: 1, at: new Date().toISOString(), type: "connectorConnected" }]);
    renderWithProviders(<ActivityPage />);
    expect(document.querySelector("h1")).not.toBeInTheDocument();
  });

  it("counts what is showing", () => {
    seed([
      { seq: 1, at: new Date().toISOString(), type: "connectorConnected" },
      { seq: 2, at: new Date().toISOString(), type: "commandSent" },
    ]);
    renderWithProviders(<ActivityPage />);
    expect(screen.getByText("2 events")).toBeInTheDocument();
  });

  it("pluralises a single event", () => {
    seed([{ seq: 1, at: new Date().toISOString(), type: "connectorConnected" }]);
    renderWithProviders(<ActivityPage />);
    expect(screen.getByText("1 event")).toBeInTheDocument();
  });

  it("humanizes entries and resolves a connectorId to a name", () => {
    seed(
      [{ seq: 1, at: new Date().toISOString(), type: "commandSent", connectorId: "conn-1", name: "workspace.state" }],
      { connectors: [VS_CODE] },
    );
    renderWithProviders(<ActivityPage />);
    expect(eventList().getByText(/VS Code/)).toBeInTheDocument();
    expect(eventList().queryByText(/conn-1/)).toBeNull();
  });

  // Activity has no primary action, so nothing on it may carry the accent —
  // pinned directly, because "at most one" also permits zero and would pass
  // either way.
  it("never renders a primary-accent element", () => {
    seed([{ seq: 1, at: new Date().toISOString(), type: "commandSent" }], { connectors: [VS_CODE] });
    const { container } = renderWithProviders(<ActivityPage />);
    expect(container.querySelector(".bg-primary")).toBeNull();
    expectAtMostOneAccent(container);
  });

  it("says so plainly when there is nothing to show", () => {
    seed([]);
    renderWithProviders(<ActivityPage />);
    expect(screen.getByText(/Nothing yet — connector events/)).toBeInTheDocument();
  });
});

describe("ActivityPage details pane", () => {
  beforeEach(() => seed([]));

  it("shows the newest event's payload until one is picked", () => {
    seed([
      { seq: 1, at: new Date().toISOString(), type: "commandSent", name: "workspace.state" },
      { seq: 2, at: new Date().toISOString(), type: "responseReceived", name: "tabs.list" },
    ]);
    renderWithProviders(<ActivityPage />);
    // Newest last in the list, and that's what the pane opens on.
    expect(details().getByText(/"seq": 2/)).toBeInTheDocument();
  });

  it("switches the payload when a row is selected", () => {
    seed([
      { seq: 1, at: new Date().toISOString(), type: "commandSent", name: "workspace.state" },
      { seq: 2, at: new Date().toISOString(), type: "responseReceived", name: "tabs.list" },
    ]);
    renderWithProviders(<ActivityPage />);
    fireEvent.click(eventList().getAllByRole("button")[0]);

    expect(useStore.getState().selectedEventSeq).toBe(1);
    expect(details().getByText(/"seq": 1/)).toBeInTheDocument();
    expect(details().queryByText(/"seq": 2/)).toBeNull();
  });

  // The log is a ring buffer, so the selected event can age out from under
  // the selection.
  it("tolerates a selected event that no longer exists", () => {
    seed([{ seq: 9, at: new Date().toISOString(), type: "commandSent" }], { selectedEventSeq: 1 });
    renderWithProviders(<ActivityPage />);
    expect(details().getByText(/"seq": 9/)).toBeInTheDocument();
  });

  // Payloads are the one place a user legitimately needs to copy a raw value
  // out of the app; the rest of the chrome is user-select: none.
  it("makes the payload selectable", () => {
    seed([{ seq: 1, at: new Date().toISOString(), type: "commandSent" }]);
    const { container } = renderWithProviders(<ActivityPage />);
    const pre = container.querySelector("pre")!;
    expect(pre.className.split(/\s+/)).toContain("select-text");
  });

  it("keeps the selected row neutral", () => {
    seed([
      { seq: 1, at: new Date().toISOString(), type: "commandSent" },
      { seq: 2, at: new Date().toISOString(), type: "commandSent" },
    ]);
    renderWithProviders(<ActivityPage />);
    const row = eventList().getAllByRole("button")[0];
    fireEvent.click(row);
    expect(row.className.split(/\s+/)).toContain("bg-secondary");
    expect(row.className.split(/\s+/)).not.toContain("bg-primary");
  });
});

describe("ActivityPage age and filtering", () => {
  beforeEach(() => seed([]));

  // "events older than an hour render in tertiary text" — the handoff.
  it("renders events older than an hour in tertiary text", () => {
    const old = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    seed([
      { seq: 1, at: old, type: "commandSent", name: "old.thing" },
      { seq: 2, at: new Date().toISOString(), type: "commandSent", name: "new.thing" },
    ]);
    renderWithProviders(<ActivityPage />);
    const rows = eventList().getAllByRole("button");
    expect(rows[0].firstElementChild!.className).toMatch(/text-tertiary-foreground/);
    expect(rows[1].firstElementChild!.className).not.toMatch(/text-tertiary-foreground/);
  });

  // The filter is local state, not the store's `selectedConnectorId`:
  // narrowing this list must not move the cursor on the Connectors screen.
  it("does not touch the Connectors screen's selection", () => {
    seed([{ seq: 1, at: new Date().toISOString(), type: "commandSent", connectorId: "conn-1" }], {
      connectors: [VS_CODE],
      selectedConnectorId: null,
    });
    renderWithProviders(<ActivityPage />);
    expect(useStore.getState().selectedConnectorId).toBeNull();
  });

  it("only follows the newest event while scroll is not paused", () => {
    seed([{ seq: 1, at: new Date().toISOString(), type: "commandSent" }]);
    renderWithProviders(<ActivityPage />);
    const toggle = screen.getByRole("button", { name: "Pause auto-scroll" });
    fireEvent.click(toggle);
    expect(useStore.getState().paused).toBe(true);
    expect(screen.getByRole("button", { name: "Resume auto-scroll" })).toBeInTheDocument();
  });
});
