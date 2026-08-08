import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useStore } from "@/store";
import { expectAtMostOneAccent } from "@/test/accent";
import { renderWithProviders } from "@/test/smoke-utils";
import { ActivityPage } from "./ActivityPage";

describe("ActivityPage", () => {
  // Task 11 moved the page name into the workspace Toolbar's <h1>; Task 12
  // stripped Overview's own eyebrow/title stack to match. Activity never got
  // the same treatment, so it rendered "Activity" a second time via its own
  // PageHeader <h1> directly under the toolbar's. This page must not own an
  // <h1> (or restate the "HISTORY" eyebrow) — but the name still needs to
  // resolve for screen readers, via a visually-hidden heading, and the total
  // event count is genuinely useful, so it must survive somewhere on the
  // page (moved into the Events section, not deleted).
  it("does not render its own page title as a heading — the toolbar owns it", async () => {
    useStore.setState({
      log: [
        {
          seq: 1,
          at: "2026-07-17T15:04:12.000Z",
          type: "connectorConnected",
          connector: { id: "conn-1", name: "VS Code" },
        },
      ],
    });
    renderWithProviders(<ActivityPage />);
    await screen.findByText("Activity");

    expect(document.querySelector("h1")).not.toBeInTheDocument();
    expect(screen.queryByText("HISTORY")).not.toBeInTheDocument();
    // Accessible name preserved via a visually-hidden heading.
    expect(screen.getByText("Activity")).toBeInTheDocument();
    // The event count is real, useful info — kept, not deleted.
    expect(screen.getByText("1 event")).toBeInTheDocument();
  });

  it("spends the accent at most once", async () => {
    const { container } = renderWithProviders(<ActivityPage />);
    await screen.findByText("Activity");
    expectAtMostOneAccent(container);
  });

  // expectAtMostOneAccent alone is vacuous — it would pass even if a
  // reviewer later added a stray primary button, since "at most one" also
  // permits zero either way. Pin the actual contract directly: Activity has
  // no primary action at all, so no element may carry bg-primary — checked
  // against a populated (non-empty-state) render, not just the empty page.
  it("never renders a primary-accent element — Activity has no primary action", async () => {
    useStore.setState({
      connectors: [
        {
          id: "conn-1",
          name: "VS Code",
          kind: "vscode",
          capabilities: [],
          connected: true,
          connectedSince: "2026-01-01T15:00:00.000Z",
        },
      ],
      log: [
        {
          seq: 1,
          at: "2026-07-17T15:04:12.000Z",
          type: "connectorConnected",
          connector: { id: "conn-1", name: "VS Code" },
        },
      ],
    });

    const { container } = renderWithProviders(<ActivityPage />);
    await screen.findByText("Activity");
    expect(await screen.findByText("VS Code connected")).toBeInTheDocument();

    const primaryEls = Array.from(container.querySelectorAll<HTMLElement>("*")).filter((el) =>
      /(^|\s)bg-primary(\s|$)/.test(el.getAttribute("class") || ""),
    );
    expect(primaryEls).toHaveLength(0);
  });

  it("humanizes seeded log entries, resolving connectorId to a name", async () => {
    useStore.setState({
      connectors: [
        {
          id: "conn-1",
          name: "VS Code",
          kind: "vscode",
          capabilities: [],
          connected: true,
          connectedSince: "2026-01-01T15:00:00.000Z",
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
