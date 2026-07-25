import { act, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/smoke-utils";
import { useStore } from "@/store";
import { Sidebar } from "./Sidebar";

const STORE_DEFAULTS = {
  view: "capsules" as const,
  sidebarCollapsed: false,
};

describe("Sidebar collapse", () => {
  beforeEach(() => {
    localStorage.clear();
    useStore.setState(STORE_DEFAULTS);
  });

  it("toggleSidebar flips state and persists to localStorage", () => {
    expect(useStore.getState().sidebarCollapsed).toBe(false);

    useStore.getState().toggleSidebar();
    expect(useStore.getState().sidebarCollapsed).toBe(true);
    expect(localStorage.getItem("rabta.sidebarCollapsed")).toBe("true");

    useStore.getState().toggleSidebar();
    expect(useStore.getState().sidebarCollapsed).toBe(false);
    expect(localStorage.getItem("rabta.sidebarCollapsed")).toBe("false");
  });

  it("keeps nav labels mounted but aria-hidden when collapsed, so they can fade out", () => {
    useStore.setState({ sidebarCollapsed: false });
    renderWithProviders(<Sidebar />);
    // Expanded: the label is visible and not aria-hidden.
    const expanded = screen.getByText("Overview");
    expect(expanded).toBeInTheDocument();
    expect(expanded.closest("[aria-hidden='true']")).toBeNull();

    // Sidebar reads sidebarCollapsed via useStore, so flipping it in the
    // store re-renders the already-mounted component (no `rerender` needed).
    act(() => {
      useStore.setState({ sidebarCollapsed: true });
    });

    // Collapsed: the label stays in the DOM (so it can opacity-fade rather
    // than pop out) but is aria-hidden, and the icon button is still
    // addressable by its aria-label.
    const collapsed = screen.getByText("Overview");
    expect(collapsed.closest("[aria-hidden='true']")).not.toBeNull();
    // Collapsed rows expose the label + shortcut via aria-label (the visible
    // ⌘-badges were removed), so the button is addressable by that name.
    expect(screen.getByRole("button", { name: "Overview (⌘1)" })).toBeInTheDocument();
  });
});
