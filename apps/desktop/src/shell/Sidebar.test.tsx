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

describe("sidebar chrome", () => {
  // The tiled mark is petrol on a petrol sidebar — invisible. Chrome uses
  // an INLINE monochrome mark, not an <img>: rabta-mark-mono.svg is filled
  // with currentColor, and an SVG loaded through <img src> is an isolated
  // document where currentColor resolves to black. Inlining is what makes
  // the fill inherit the sidebar's ivory.
  it("inlines the mark so it inherits the sidebar's colour", () => {
    const { container } = renderWithProviders(<Sidebar />);
    expect(container.querySelector("img[alt='Rabta']")).toBeNull();
    const svg = container.querySelector("svg[data-brand-mark]");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("aria-label")).toBe("Rabta");
    // currentColor is the whole point — a hardcoded fill would defeat it.
    expect(svg!.innerHTML).toMatch(/currentColor/);
    expect(svg!.innerHTML).not.toMatch(/#102526/);
  });

  // The Context Fold put a second permanent orange element on every screen,
  // which is one more than the accent rule allows.
  it("draws no context fold on nav rows", () => {
    const { container } = renderWithProviders(<Sidebar />);
    expect(container.querySelector("[data-context-fold]")).toBeNull();
    expect(container.innerHTML).not.toMatch(/clip-path:polygon/);
  });
});
