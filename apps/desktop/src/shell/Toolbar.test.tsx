import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Toolbar } from "./Toolbar";
import { NAV_ITEMS, SETTINGS_ITEM } from "./nav";
import { useStore, type NavKey } from "@/store";
import { renderWithProviders } from "@/test/smoke-utils";

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
});
