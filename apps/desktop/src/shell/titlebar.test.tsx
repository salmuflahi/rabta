import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/smoke-utils";
import { useStore } from "@/store";
import { Sidebar } from "./Sidebar";
import { Toolbar } from "./Toolbar";
import { AppShell } from "./AppShell";
import {
  CHROME_INSET_PX,
  SIDEBAR_TITLEBAR_DIVIDER_HEIGHT_CLASS,
  SIDEBAR_TITLEBAR_DIVIDER_HEIGHT_PX,
  SIDEBAR_TITLEBAR_SPACER_HEIGHT_CLASS,
  SIDEBAR_TITLEBAR_SPACER_HEIGHT_PX,
  SIDEBAR_TOGGLE_FULLSCREEN_LEFT_PX,
  SIDEBAR_TOGGLE_GAP_PX,
  SIDEBAR_TOGGLE_LEFT_PX,
  SIDEBAR_TOGGLE_WIDTH_PX,
  TOOLBAR_HEIGHT_CLASS,
  TOOLBAR_HEIGHT_PX,
  TRAFFIC_LIGHT_GROUP_WIDTH_CLASS,
  TRAFFIC_LIGHT_GROUP_WIDTH_PX,
  TRAFFIC_LIGHT_WRAPPER_INSET_CLASS,
  TRAFFIC_LIGHT_WRAPPER_INSET_PX,
  chromeLeadWidthPx,
  sidebarToggleLeftPx,
} from "./titlebar";

/** Extracts an exact `h-[<n>px]` (or bare `h-px`) token from a className
 * string via whole-token matching — a substring search would happily match
 * `h-[138px]` against a `38` needle, which is exactly the kind of assertion
 * this project has shipped before that didn't actually pin anything down. */
function pixelHeightFromClassList(className: string): number | null {
  const tokens = className.split(/\s+/);
  if (tokens.includes("h-px")) return 1;
  for (const token of tokens) {
    const match = /^h-\[(\d+)px\]$/.exec(token);
    if (match) return Number(match[1]);
  }
  return null;
}

// A `arbitraryPxFromClassList` / `leftPaddingFromClassList` pair used to
// live here, summing the toggle's inset out of four rendered utility
// classes. Phase 2 pins the toggle with one inline offset instead, so the
// test below reads that offset directly and the class-scraping helpers went
// with the arithmetic they existed to verify.

describe("titlebar shared constants", () => {
  // The *_CLASS strings are literal (Tailwind can't extract classes built
  // from interpolated numbers), so nothing forces them to track the *_PX
  // numbers except this assertion — pin it so the two can't drift apart.
  it("literal Tailwind classes agree with their numeric constants", () => {
    expect(TOOLBAR_HEIGHT_CLASS).toBe(`h-[${TOOLBAR_HEIGHT_PX}px]`);
    expect(SIDEBAR_TITLEBAR_SPACER_HEIGHT_CLASS).toBe(
      `h-[${SIDEBAR_TITLEBAR_SPACER_HEIGHT_PX}px]`,
    );
    expect(SIDEBAR_TITLEBAR_DIVIDER_HEIGHT_CLASS).toBe("h-px");
    expect(SIDEBAR_TITLEBAR_DIVIDER_HEIGHT_PX).toBe(1);
    expect(SIDEBAR_TITLEBAR_SPACER_HEIGHT_PX + SIDEBAR_TITLEBAR_DIVIDER_HEIGHT_PX).toBe(
      TOOLBAR_HEIGHT_PX,
    );

    expect(TRAFFIC_LIGHT_GROUP_WIDTH_CLASS).toBe(`w-[${TRAFFIC_LIGHT_GROUP_WIDTH_PX}px]`);
    expect(TRAFFIC_LIGHT_WRAPPER_INSET_CLASS).toBe(`pl-[${TRAFFIC_LIGHT_WRAPPER_INSET_PX}px]`);
    expect(
      CHROME_INSET_PX + TRAFFIC_LIGHT_WRAPPER_INSET_PX + TRAFFIC_LIGHT_GROUP_WIDTH_PX + SIDEBAR_TOGGLE_GAP_PX,
    ).toBe(SIDEBAR_TOGGLE_LEFT_PX);
  });

  // Fullscreen has no traffic lights, so every part of the 73px lead that
  // exists to clear them drops away and the toggle starts at the plain
  // chrome inset. Pinned here because it's the number that used to be
  // "nothing at all": the sidebar dropped its whole titlebar row in
  // fullscreen and took the only toggle with it.
  it("collapses the toggle's lead to the plain chrome inset in fullscreen", () => {
    expect(SIDEBAR_TOGGLE_FULLSCREEN_LEFT_PX).toBe(CHROME_INSET_PX);
    expect(sidebarToggleLeftPx(false)).toBe(SIDEBAR_TOGGLE_LEFT_PX);
    expect(sidebarToggleLeftPx(true)).toBe(SIDEBAR_TOGGLE_FULLSCREEN_LEFT_PX);
    expect(sidebarToggleLeftPx(true)).toBeLessThan(sidebarToggleLeftPx(false));
  });

  // The Toolbar's own first control has to start clear of the pinned
  // toggle — measured from the Toolbar's inset, since that's where its
  // padding starts counting from.
  it("derives the Toolbar's collapsed lead from the toggle's position and width", () => {
    for (const fullscreen of [false, true]) {
      expect(CHROME_INSET_PX + chromeLeadWidthPx(fullscreen)).toBe(
        sidebarToggleLeftPx(fullscreen) + SIDEBAR_TOGGLE_WIDTH_PX + SIDEBAR_TOGGLE_GAP_PX,
      );
    }
  });
});

describe("titlebar alignment invariant", () => {
  // The Sidebar's titlebar region (traffic-light spacer + its 1px divider)
  // and the Toolbar (content + its own border-b, folded into its
  // border-box height) must resolve to the exact same total height, or the
  // hairline that's supposed to run unbroken across the window steps.
  it("Sidebar titlebar spacer + divider sums to the Toolbar's total height", () => {
    useStore.setState({ view: "capsules", sidebarCollapsed: false, fullscreen: false });

    const { container: sidebarContainer } = renderWithProviders(<Sidebar />);
    const { container: toolbarContainer } = renderWithProviders(<Toolbar />);

    // Row 1 of the sidebar: the first drag-region element in document order
    // is the traffic-light spacer (BrandRow's own drag region is nested
    // deeper and comes after it).
    const dragRegions = sidebarContainer.querySelectorAll("[data-tauri-drag-region]");
    expect(dragRegions.length).toBeGreaterThan(0);
    const spacer = dragRegions[0] as HTMLElement;
    const divider = spacer.nextElementSibling as HTMLElement | null;
    expect(divider).not.toBeNull();

    const spacerHeight = pixelHeightFromClassList(spacer.className);
    const dividerHeight = pixelHeightFromClassList(divider!.className);
    expect(spacerHeight).not.toBeNull();
    expect(dividerHeight).not.toBeNull();
    const sidebarTitlebarHeight = spacerHeight! + dividerHeight!;

    const toolbar = toolbarContainer.querySelector("header");
    expect(toolbar).not.toBeNull();
    // box-sizing: border-box (Tailwind Preflight) means the Toolbar's
    // h-[Npx] already includes its border-b — no extra math needed here.
    const toolbarHeight = pixelHeightFromClassList(toolbar!.className);
    expect(toolbarHeight).not.toBeNull();
    // Task 10 retones the hairline from a plain 1px `border-b` to the
    // handoff's 0.5px hairline (`border-b-[0.5px]`) — whole-token match
    // against the literal the Toolbar actually renders, not a substring
    // search that would also match an unrelated `border-b-*` utility.
    expect(toolbar!.className.split(/\s+/)).toContain("border-b-[0.5px]");

    expect(sidebarTitlebarHeight).toBe(toolbarHeight);
  });
});

describe("sidebar toggle position", () => {
  // The handoff calls this out as an explicit requirement: "The sidebar
  // toggle must not move between states."
  //
  // Phase 1 met that by drawing the control twice — once by the Sidebar,
  // once by the Toolbar — and holding both to a shared 73px arithmetic
  // contract. Phase 2 draws it once, in AppShell, pinned over both columns
  // (SidebarToggle.tsx), because the two-instance arrangement had already
  // produced one bug the arithmetic couldn't catch: in fullscreen the
  // Sidebar dropped the row that held its instance, and the Toolbar only
  // drew its instance while collapsed, so fullscreen + open sidebar had no
  // toggle at all.
  //
  // These tests therefore measure the rendered inset of the single
  // instance, in all four window states, rather than re-summing the parts.
  function toggleRailInset(container: HTMLElement): number {
    const rail = container.querySelector<HTMLElement>("[data-sidebar-toggle-rail]");
    expect(rail, "no pinned toggle rail in the shell").not.toBeNull();
    return Number.parseFloat(rail!.style.paddingLeft);
  }

  it.each([true, false])(
    "keeps the toggle at 73px whether the sidebar is collapsed (%s) or not",
    (sidebarCollapsed) => {
      useStore.setState({ view: "capsules", sidebarCollapsed, fullscreen: false });
      const { container } = renderWithProviders(<AppShell>content</AppShell>);
      expect(toggleRailInset(container)).toBe(SIDEBAR_TOGGLE_LEFT_PX);
      expect(SIDEBAR_TOGGLE_LEFT_PX).toBe(73);
    },
  );

  // The regression this phase exists to close: in fullscreen the toggle
  // must be *present* — with the sidebar open as well as collapsed — and
  // sit at the shorter, light-free inset.
  it.each([true, false])(
    "still renders the toggle in fullscreen, at the light-free inset (collapsed=%s)",
    (sidebarCollapsed) => {
      useStore.setState({ view: "capsules", sidebarCollapsed, fullscreen: true });
      const { container } = renderWithProviders(<AppShell>content</AppShell>);
      expect(
        screen.getByRole("button", { name: sidebarCollapsed ? "Show sidebar" : "Hide sidebar" }),
      ).toBeInTheDocument();
      expect(toggleRailInset(container)).toBe(SIDEBAR_TOGGLE_FULLSCREEN_LEFT_PX);
    },
  );

  // Exactly one instance, always — the property the two-component
  // arrangement could not guarantee once the panel started animating.
  it.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ])("renders exactly one toggle (collapsed=%s, fullscreen=%s)", (sidebarCollapsed, fullscreen) => {
    useStore.setState({ view: "capsules", sidebarCollapsed, fullscreen });
    renderWithProviders(<AppShell>content</AppShell>);
    expect(screen.getAllByRole("button", { name: /^(Show|Hide) sidebar$/ })).toHaveLength(1);
  });
});
