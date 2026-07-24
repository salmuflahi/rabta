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

  it("hides nav labels when collapsed but keeps icon buttons", () => {
    useStore.setState({ sidebarCollapsed: false });
    renderWithProviders(<Sidebar />);
    expect(screen.getByText("Overview")).toBeInTheDocument();

    // Sidebar reads sidebarCollapsed via useStore, so flipping it in the
    // store re-renders the already-mounted component (no `rerender` needed).
    act(() => {
      useStore.setState({ sidebarCollapsed: true });
    });

    // Radix tooltip content isn't in the DOM until hovered/focused, so the
    // label text should not be found inline while collapsed.
    expect(screen.queryByText("Overview")).not.toBeInTheDocument();
    // The icon button itself still renders, addressable by its aria-label.
    expect(screen.getByRole("button", { name: "Overview" })).toBeInTheDocument();
  });
});
