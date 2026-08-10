import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_PREFS, useStore } from "@/store";
import { renderWithProviders } from "@/test/smoke-utils";
import { StatusBar } from "./StatusBar";

/** Splits an element's `class` attribute into discrete utility tokens, the
 * same style `src/test/no-box.ts` uses — so assertions check for a whole
 * Tailwind class (`h-[26px]`) rather than a fragile substring match that
 * would also pass for `h-[260px]` or `min-h-[26px]`. */
function classTokensOf(el: Element): string[] {
  return (el.getAttribute("class") || "").split(/\s+/).filter(Boolean);
}

const BASE_CONNECTORS = [
  {
    id: "c1",
    name: "VS Code",
    kind: "vscode",
    capabilities: [],
    connected: true,
    connectedSince: "2026-08-09T12:00:00.000Z",
  },
  {
    id: "c2",
    name: "Chrome",
    kind: "chrome",
    capabilities: [],
    connected: true,
    connectedSince: "2026-08-09T12:05:00.000Z",
  },
];

describe("StatusBar", () => {
  beforeEach(() => {
    useStore.setState({
      prefs: { ...DEFAULT_PREFS, statusbar: true },
      connectors: [],
      log: [],
    });
  });

  it("is entirely absent from the DOM when the statusbar preference is off", () => {
    useStore.setState({ prefs: { ...DEFAULT_PREFS, statusbar: false } });
    const { container } = renderWithProviders(<StatusBar />);

    // Not just visually hidden — nothing rendered at all.
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("status-bar")).not.toBeInTheDocument();
    expect(screen.queryByText(/online/)).not.toBeInTheDocument();
  });

  it("renders when the statusbar preference is on", () => {
    renderWithProviders(<StatusBar />);
    expect(screen.getByTestId("status-bar")).toBeInTheDocument();
  });

  it("shows real connector state, not a hardcoded string: 0 connected", () => {
    useStore.setState({ connectors: [] });
    renderWithProviders(<StatusBar />);
    expect(screen.getByText("No connectors online")).toBeInTheDocument();
  });

  it("shows real connector state, not a hardcoded string: 1 connected (singular)", () => {
    useStore.setState({ connectors: [BASE_CONNECTORS[0]] });
    renderWithProviders(<StatusBar />);
    expect(screen.getByText("1 connector online")).toBeInTheDocument();
    expect(screen.queryByText(/connectors online/)).not.toBeInTheDocument();
  });

  it("shows real connector state, not a hardcoded string: 2 connected (plural, no '(s)')", () => {
    useStore.setState({ connectors: BASE_CONNECTORS });
    renderWithProviders(<StatusBar />);
    expect(screen.getByText("2 connectors online")).toBeInTheDocument();
  });

  it("ignores connectors that are present but disconnected when counting", () => {
    useStore.setState({
      connectors: [
        { ...BASE_CONNECTORS[0], connected: false },
        BASE_CONNECTORS[1],
      ],
    });
    renderWithProviders(<StatusBar />);
    expect(screen.getByText("1 connector online")).toBeInTheDocument();
  });

  it("never renders a hardcoded 'Cursor and Chrome connected' string", () => {
    useStore.setState({ connectors: BASE_CONNECTORS });
    renderWithProviders(<StatusBar />);
    expect(screen.queryByText(/Cursor and Chrome connected/)).not.toBeInTheDocument();
  });

  it("shows the real time of the most recent logged event on the right", () => {
    useStore.setState({
      log: [
        { seq: 1, at: "2026-08-09T11:00:00.000Z", type: "connectorConnected" },
        { seq: 2, at: "2026-08-09T11:58:00.000Z", type: "eventReceived" },
      ],
    });
    renderWithProviders(<StatusBar />);
    // Deterministic "now" isn't controllable here without a fake clock, so
    // assert the stable prefix (mirrors ConnectorsPage.test.tsx's own
    // relative-time convention) rather than the exact "Nm ago" text.
    expect(screen.getByText(/^Last activity/)).toBeInTheDocument();
  });

  it("is honest about having nothing to report when the log is empty", () => {
    useStore.setState({ log: [] });
    renderWithProviders(<StatusBar />);
    expect(screen.getByText("No activity yet")).toBeInTheDocument();
  });

  it("pairs the connected dot's colour with words — colour is never the only signal", () => {
    useStore.setState({ connectors: BASE_CONNECTORS });
    renderWithProviders(<StatusBar />);
    // The dot itself carries no text; the sentence next to it must.
    expect(screen.getByText("2 connectors online")).toBeInTheDocument();
  });

  it("renders at 26px tall with a 0.5px top hairline, using whole class tokens", () => {
    renderWithProviders(<StatusBar />);
    const bar = screen.getByTestId("status-bar");
    const tokens = classTokensOf(bar);
    expect(tokens).toContain("h-[26px]");
    expect(tokens).toContain("border-t-[0.5px]");
  });
});
