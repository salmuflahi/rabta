import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Toolbar } from "./Toolbar";
import { NAV_ITEMS, SETTINGS_ITEM } from "./nav";
import { TOOLBAR_HEIGHT_CLASS } from "./titlebar";
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
    // project" on Projects, "Add connector" on Connectors, nothing on
    // Activity or Settings — this is the toolbar's one spendable accent
    // (the sidebar's selected row is deliberately neutral), so both the
    // label per view and its absence on the other two views are pinned.
    const expectedLabels: Partial<Record<NavKey, string>> = {
      overview: "New capsule",
      capsules: "New capsule",
      projects: "Add project",
      connectors: "Add connector",
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
          renderWithProviders(<Toolbar />);
          for (const label of Object.values(expectedLabels)) {
            expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
          }
        });
      }
    }

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

  describe("sidebar toggle + traffic lights", () => {
    it("renders the toggle in the toolbar only when the sidebar is collapsed", () => {
      useStore.setState({ view: "overview", sidebarCollapsed: true });
      renderWithProviders(<Toolbar />);
      expect(screen.getByRole("button", { name: "Show sidebar" })).toBeInTheDocument();
    });

    it("omits the toggle from the toolbar when the sidebar is open", () => {
      useStore.setState({ view: "overview", sidebarCollapsed: false });
      renderWithProviders(<Toolbar />);
      expect(screen.queryByRole("button", { name: "Show sidebar" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Hide sidebar" })).not.toBeInTheDocument();
    });
  });
});
