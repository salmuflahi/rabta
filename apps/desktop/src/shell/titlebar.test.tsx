import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/smoke-utils";
import { useStore } from "@/store";
import { Sidebar } from "./Sidebar";
import { Toolbar } from "./Toolbar";
import {
  CHROME_INSET_CLASS,
  CHROME_INSET_PX,
  SIDEBAR_TITLEBAR_DIVIDER_HEIGHT_CLASS,
  SIDEBAR_TITLEBAR_DIVIDER_HEIGHT_PX,
  SIDEBAR_TITLEBAR_SPACER_HEIGHT_CLASS,
  SIDEBAR_TITLEBAR_SPACER_HEIGHT_PX,
  SIDEBAR_TOGGLE_GAP_CLASS,
  SIDEBAR_TOGGLE_GAP_PX,
  SIDEBAR_TOGGLE_LEFT_PX,
  TOOLBAR_HEIGHT_CLASS,
  TOOLBAR_HEIGHT_PX,
  TRAFFIC_LIGHT_GROUP_WIDTH_CLASS,
  TRAFFIC_LIGHT_GROUP_WIDTH_PX,
  TRAFFIC_LIGHT_WRAPPER_INSET_CLASS,
  TRAFFIC_LIGHT_WRAPPER_INSET_PX,
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

/** Same whole-token extraction as `pixelHeightFromClassList`, generalized to
 * any arbitrary-value utility prefix (`w-`, `pl-`, `gap-`, ...) so the
 * toggle-position test below can pull each piece of its geometry straight
 * out of the rendered classes rather than trusting a comment. */
function arbitraryPxFromClassList(className: string, prefix: string): number | null {
  const tokens = className.split(/\s+/);
  const re = new RegExp(`^${prefix}-\\[(\\d+)px\\]$`);
  for (const token of tokens) {
    const match = re.exec(token);
    if (match) return Number(match[1]);
  }
  return null;
}

/** The Sidebar's `aside` uses symmetric `px-[10px]`; the Toolbar's `header`
 * uses the asymmetric `pl-[10px]` (CHROME_INSET_CLASS) since its right edge
 * padding isn't part of this invariant. Either expresses the same left
 * inset. */
function leftPaddingFromClassList(className: string): number | null {
  return (
    arbitraryPxFromClassList(className, "pl") ?? arbitraryPxFromClassList(className, "px")
  );
}

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

    expect(CHROME_INSET_CLASS).toBe(`pl-[${CHROME_INSET_PX}px]`);
    expect(TRAFFIC_LIGHT_GROUP_WIDTH_CLASS).toBe(`w-[${TRAFFIC_LIGHT_GROUP_WIDTH_PX}px]`);
    expect(TRAFFIC_LIGHT_WRAPPER_INSET_CLASS).toBe(`pl-[${TRAFFIC_LIGHT_WRAPPER_INSET_PX}px]`);
    expect(SIDEBAR_TOGGLE_GAP_CLASS).toBe(`gap-[${SIDEBAR_TOGGLE_GAP_PX}px]`);
    expect(
      CHROME_INSET_PX + TRAFFIC_LIGHT_WRAPPER_INSET_PX + TRAFFIC_LIGHT_GROUP_WIDTH_PX + SIDEBAR_TOGGLE_GAP_PX,
    ).toBe(SIDEBAR_TOGGLE_LEFT_PX);
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
  // The handoff calls this out as an explicit requirement: the toggle's
  // left edge must land at the same 73px from the window edge whether it's
  // drawn by the Sidebar itself (sidebar open) or by the Toolbar (sidebar
  // collapsed) — see SIDEBAR_TOGGLE_LEFT_PX in titlebar.ts for how that
  // number is built from the traffic-light geometry both regions reserve.
  // Sums the same pieces straight out of the rendered classes in both
  // states, rather than trusting that they were built consistently.
  function toggleLeftOffset(toggle: HTMLElement): number {
    const wrapper = toggle.parentElement;
    expect(wrapper).not.toBeNull();
    const outer = wrapper!.parentElement;
    expect(outer).not.toBeNull();

    const outerInset = leftPaddingFromClassList(outer!.className);
    const wrapperInset = arbitraryPxFromClassList(wrapper!.className, "pl");
    const wrapperGap = arbitraryPxFromClassList(wrapper!.className, "gap");
    const spacer = wrapper!.firstElementChild as HTMLElement | null;
    expect(spacer).not.toBeNull();
    const spacerWidth = arbitraryPxFromClassList(spacer!.className, "w");

    expect(outerInset, `outer inset in "${outer!.className}"`).not.toBeNull();
    expect(wrapperInset, `wrapper inset in "${wrapper!.className}"`).not.toBeNull();
    expect(wrapperGap, `wrapper gap in "${wrapper!.className}"`).not.toBeNull();
    expect(spacerWidth, `spacer width in "${spacer!.className}"`).not.toBeNull();

    return outerInset! + wrapperInset! + spacerWidth! + wrapperGap!;
  }

  it("lands at 73px in the Sidebar when the sidebar is open", () => {
    useStore.setState({ view: "capsules", sidebarCollapsed: false, fullscreen: false });
    renderWithProviders(<Sidebar />);
    const toggle = screen.getByRole("button", { name: "Hide sidebar" });
    expect(toggleLeftOffset(toggle)).toBe(SIDEBAR_TOGGLE_LEFT_PX);
    expect(SIDEBAR_TOGGLE_LEFT_PX).toBe(73);
  });

  it("lands at the same 73px in the Toolbar when the sidebar is collapsed", () => {
    useStore.setState({ view: "capsules", sidebarCollapsed: true, fullscreen: false });
    renderWithProviders(<Toolbar />);
    const toggle = screen.getByRole("button", { name: "Show sidebar" });
    expect(toggleLeftOffset(toggle)).toBe(SIDEBAR_TOGGLE_LEFT_PX);
    expect(SIDEBAR_TOGGLE_LEFT_PX).toBe(73);
  });
});
