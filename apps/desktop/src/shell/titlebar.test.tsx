import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/smoke-utils";
import { useStore } from "@/store";
import { Sidebar } from "./Sidebar";
import { Toolbar } from "./Toolbar";
import {
  SIDEBAR_TITLEBAR_DIVIDER_HEIGHT_CLASS,
  SIDEBAR_TITLEBAR_DIVIDER_HEIGHT_PX,
  SIDEBAR_TITLEBAR_SPACER_HEIGHT_CLASS,
  SIDEBAR_TITLEBAR_SPACER_HEIGHT_PX,
  TOOLBAR_HEIGHT_CLASS,
  TOOLBAR_HEIGHT_PX,
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
  });
});

describe("titlebar alignment invariant", () => {
  // The Sidebar's titlebar region (traffic-light spacer + its 1px divider)
  // and the Toolbar (content + its own 1px border-b, folded into its
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
    expect(toolbar!.className.split(/\s+/)).toContain("border-b");

    expect(sidebarTitlebarHeight).toBe(toolbarHeight);
  });
});
