import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Toolbar } from "./Toolbar";
import { NAV_ITEMS, SETTINGS_ITEM } from "./nav";
import {
  CHROME_INSET_PX,
  SIDEBAR_MOTION_MS,
  SIDEBAR_TOGGLE_LEFT_PX,
  TOOLBAR_HEIGHT_CLASS,
  chromeLeadWidthPx,
} from "./titlebar";
import { useStore, type NavKey } from "@/store";
import { renderWithProviders } from "@/test/smoke-utils";
import { expectAtMostOneAccent } from "@/test/accent";

describe("Toolbar", () => {
  // The title moves here so pages stop restating what the sidebar says.
  it("names the current view", () => {
    useStore.setState({ view: "capsules" });
    renderWithProviders(<Toolbar />);
    expect(screen.getByRole("heading", { name: "Capsules" })).toBeInTheDocument();
  });

  it("follows the view as it changes", () => {
    useStore.setState({ view: "settings" });
    renderWithProviders(<Toolbar />);
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
  });

  // A manual check ("looks right for a couple of views") had previously
  // been mistaken for coverage of the whole nav. Assert every one of the
  // six real destinations — the five NAV_ITEMS plus SETTINGS_ITEM — resolves
  // to its own label, not just the two spot-checked above.
  it("names every one of the six destinations", () => {
    for (const item of [...NAV_ITEMS, SETTINGS_ITEM]) {
      useStore.setState({ view: item.key });
      const { unmount } = renderWithProviders(<Toolbar />);
      expect(screen.getByRole("heading", { name: item.label })).toBeInTheDocument();
      unmount();
    }
  });

  // store.ts's readPrefs() spreads an unvalidated JSON.parse over defaults
  // and never checks a persisted `landingPage` against NavKey, so `view` can
  // end up holding a value that matches no NAV_ITEMS/SETTINGS_ITEM entry
  // (e.g. a stale key from a hand-edited or older localStorage payload).
  // The heading must still have an accessible name — never an empty <h1>.
  it("falls back to a known label when the view matches no nav item", () => {
    useStore.setState({ view: "not-a-real-view" as NavKey });
    renderWithProviders(<Toolbar />);
    const heading = screen.getByRole("heading");
    expect(heading).toHaveTextContent(/.+/);
    expect(heading.textContent).toBe(NAV_ITEMS[0].label);
  });

  // Task 10 retones the toolbar from 38px to the handoff's spec'd 52px —
  // whole-token match against the literal class actually rendered.
  it("is 52px tall", () => {
    useStore.setState({ view: "overview" });
    const { container } = renderWithProviders(<Toolbar />);
    const header = container.querySelector("header");
    expect(header).not.toBeNull();
    expect(header!.className.split(/\s+/)).toContain(TOOLBAR_HEIGHT_CLASS);
  });

  describe("contextual accent action", () => {
    // Per the handoff: "New capsule" on Overview and Capsules, "Add
    // project" on Projects, nothing on Connectors, Activity, or Settings —
    // this is the toolbar's one spendable accent (the sidebar's selected
    // row is deliberately neutral), so both the label per view and its
    // absence on the other three views are pinned.
    //
    // Connectors used to show "Add connector", wired to open the same
    // ConnectionIndicator popover the adjacent pill already opened. No
    // manual-add flow exists anywhere in the app (connectors self-pair;
    // store.ts has no "start pairing" action, ConnectorsPage.tsx has no add
    // UI), so an accent + plus-icon button that opens a popover instead of
    // creating anything misrepresented itself and duplicated an adjacent
    // control. Finding 1 (Important review) — omit it, exactly like
    // Activity and Settings already do.
    const expectedLabels: Partial<Record<NavKey, string>> = {
      overview: "New capsule",
      capsules: "New capsule",
      projects: "Add project",
    };

    for (const item of [...NAV_ITEMS, SETTINGS_ITEM]) {
      const expected = expectedLabels[item.key];
      if (expected) {
        it(`shows "${expected}" on ${item.key}`, () => {
          useStore.setState({ view: item.key });
          renderWithProviders(<Toolbar />);
          expect(screen.getByRole("button", { name: expected })).toBeInTheDocument();
        });
      } else {
        it(`shows no accent action on ${item.key}`, () => {
          useStore.setState({ view: item.key });
          const { container } = renderWithProviders(<Toolbar />);
          for (const label of Object.values(expectedLabels)) {
            expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
          }
          // Belt-and-suspenders beyond the known-label check above: assert
          // no accent-filled control renders at all, by the same selector
          // `expectAtMostOneAccent` uses. This is what actually catches a
          // regression of Finding 1 ("Add connector" coming back on
          // Connectors) rather than relying on it staying out of
          // `expectedLabels` above.
          expect(container.querySelectorAll(".bg-primary").length).toBe(0);
        });
      }
    }

    // Finding 1 (Important review): Connectors used to show an "Add
    // connector" accent button wired to open ConnectionIndicator's popover
    // — the same popover the adjacent pill already opened. No manual-add
    // flow exists anywhere in the app (connectors self-pair), so the button
    // created nothing and duplicated an adjacent control. Named explicitly
    // here, in addition to the generic loop above, because this is the
    // exact old-contract assertion the review flagged.
    it('shows no "Add connector" action on connectors', () => {
      useStore.setState({ view: "connectors" });
      renderWithProviders(<Toolbar />);
      expect(screen.queryByRole("button", { name: "Add connector" })).not.toBeInTheDocument();
    });

    it("New capsule on Overview routes to Capsules and requests a new one", () => {
      useStore.setState({ view: "overview", newTaskRequest: false });
      renderWithProviders(<Toolbar />);
      fireEvent.click(screen.getByRole("button", { name: "New capsule" }));
      expect(useStore.getState().view).toBe("capsules");
      expect(useStore.getState().newTaskRequest).toBe(true);
      // Reset — this store is a module-level singleton shared by every test
      // in this file (ProjectsPage.test.tsx/CapsulesPage.test.tsx establish
      // this same cleanup convention for these two flags).
      useStore.setState({ newTaskRequest: false });
    });

    it("Add project on Projects requests a new project", () => {
      useStore.setState({ view: "projects", newProjectRequest: false });
      renderWithProviders(<Toolbar />);
      fireEvent.click(screen.getByRole("button", { name: "Add project" }));
      expect(useStore.getState().newProjectRequest).toBe(true);
      useStore.setState({ newProjectRequest: false });
    });

    it("never spends more than the toolbar's one accent, on any view", () => {
      for (const item of [...NAV_ITEMS, SETTINGS_ITEM]) {
        useStore.setState({ view: item.key });
        const { container, unmount } = renderWithProviders(<Toolbar />);
        expectAtMostOneAccent(container);
        unmount();
      }
    });
  });

  describe("connector indicator", () => {
    // Finding 2 (Important review): the toolbar used to carry a "N
    // connected" pill (ConnectionIndicator) that opened a popover of
    // per-connector state. Both the prototype markup (traffic-lights/
    // toggle → chevrons → title → spacer → search → conditional accent
    // button, no connector pill) and the task brief's own prose agree it
    // does not belong in the toolbar. Removing it doesn't lose the count —
    // Sidebar's Connectors row shows it (Task 9) and StatusBar states it in
    // words (Task 8) — it was the toolbar's own third copy of the same
    // number. Assert it renders nowhere in the toolbar, connected or not.
    it("renders no connector-count pill or connection popover trigger", () => {
      useStore.setState({
        view: "connectors",
        connectors: [
          {
            id: "c1",
            name: "VS Code",
            kind: "vscode",
            capabilities: [],
            connected: true,
            connectedSince: "2026-08-09T12:00:00.000Z",
          },
        ],
      });
      renderWithProviders(<Toolbar />);
      expect(
        screen.queryByRole("button", { name: /Open connection status/ }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/connected$/)).not.toBeInTheDocument();
      useStore.setState({ connectors: [] });
    });
  });

  describe("back/forward chevrons", () => {
    it("renders Back disabled at 40% opacity and Forward enabled-looking", () => {
      useStore.setState({ view: "overview" });
      renderWithProviders(<Toolbar />);
      const back = screen.getByRole("button", { name: "Back" });
      const forward = screen.getByRole("button", { name: "Forward" });
      expect(back).toBeDisabled();
      expect(back.className.split(/\s+/)).toContain("opacity-40");
      expect(forward.className.split(/\s+/)).not.toContain("opacity-40");
    });
  });

  describe("clearance for the window controls above it", () => {
    // The Toolbar no longer draws the sidebar toggle — AppShell pins one
    // instance over both columns (see SidebarToggle.tsx and the
    // "sidebar toggle position" suite in titlebar.test.tsx for why). All
    // the Toolbar owes it, and macOS's traffic lights, is left padding
    // while the sidebar is out of the way.
    function leftInset(container: HTMLElement): number {
      const header = container.querySelector("header");
      expect(header).not.toBeNull();
      return Number.parseFloat((header as HTMLElement).style.paddingLeft);
    }

    it("draws no toggle of its own in any state", () => {
      for (const sidebarCollapsed of [true, false]) {
        useStore.setState({ view: "overview", sidebarCollapsed, fullscreen: false });
        const { unmount } = renderWithProviders(<Toolbar />);
        expect(screen.queryByRole("button", { name: /^(Show|Hide) sidebar$/ })).toBeNull();
        unmount();
      }
    });

    it("clears the pinned toggle when the sidebar is collapsed", () => {
      useStore.setState({ view: "overview", sidebarCollapsed: true, fullscreen: false });
      const { container } = renderWithProviders(<Toolbar />);
      expect(leftInset(container)).toBe(CHROME_INSET_PX + chromeLeadWidthPx(false));
      // Far enough in that the 73px toggle and the 26px control itself are
      // both behind the Toolbar's first control, not under it.
      expect(leftInset(container)).toBeGreaterThan(SIDEBAR_TOGGLE_LEFT_PX);
    });

    it("falls back to the plain chrome inset when the sidebar is open", () => {
      useStore.setState({ view: "overview", sidebarCollapsed: false, fullscreen: false });
      const { container } = renderWithProviders(<Toolbar />);
      expect(leftInset(container)).toBe(CHROME_INSET_PX);
    });

    it("uses the shorter lead in fullscreen, where there are no traffic lights", () => {
      useStore.setState({ view: "overview", sidebarCollapsed: true, fullscreen: true });
      const { container } = renderWithProviders(<Toolbar />);
      expect(leftInset(container)).toBe(CHROME_INSET_PX + chromeLeadWidthPx(true));
      expect(chromeLeadWidthPx(true)).toBeLessThan(chromeLeadWidthPx(false));
    });

    // The lead animates rather than switching, so collapsing walks the
    // toolbar's contents across to meet the departing panel instead of
    // jumping them 107px the instant the flag flips.
    it("transitions the lead rather than snapping it", () => {
      useStore.setState({ view: "overview", sidebarCollapsed: true, fullscreen: false });
      const { container } = renderWithProviders(<Toolbar />);
      const header = container.querySelector("header") as HTMLElement;
      expect(header.style.transition).toContain("padding-left");
      expect(header.style.transition).toContain(`${SIDEBAR_MOTION_MS}ms`);
    });
  });
});
