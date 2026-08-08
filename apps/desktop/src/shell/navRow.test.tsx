import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/smoke-utils";
import { useStore } from "@/store";
import { NAV_ITEMS } from "./nav";
import {
  NAV_ROW_GAP_CLASS,
  NAV_ROW_GAP_PX,
  NAV_ROW_HEIGHT_CLASS,
  NAV_ROW_HEIGHT_PX,
  NAV_ROW_STRIDE_PX,
} from "./navRow";
import { Sidebar } from "./Sidebar";

/** Extracts an exact `h-[<n>px]` token from a className string via
 * whole-token matching — see titlebar.test.tsx for why substring matching
 * (e.g. `38` matching inside `138px`) is exactly the kind of assertion that
 * doesn't actually pin anything down. */
function pixelHeightFromClassList(className: string): number | null {
  for (const token of className.split(/\s+/)) {
    const match = /^h-\[(\d+)px\]$/.exec(token);
    if (match) return Number(match[1]);
  }
  return null;
}

// Tailwind's fixed spacing scale (the subset this file's gap classes could
// plausibly use) — used to independently translate whatever gap class is
// actually present in the rendered DOM into pixels, rather than trusting
// the NAV_ROW_GAP_PX constant.
const TAILWIND_GAP_PX: Record<string, number> = {
  "gap-0": 0,
  "gap-0.5": 2,
  "gap-1": 4,
  "gap-1.5": 6,
  "gap-2": 8,
  "gap-3": 12,
  "gap-4": 16,
};

function gapPxFromClassList(className: string): number | null {
  for (const token of className.split(/\s+/)) {
    if (token in TAILWIND_GAP_PX) return TAILWIND_GAP_PX[token];
  }
  return null;
}

/** Parses `translateY(<n>px)` out of a real inline `style.transform` value. */
function translateYFromTransform(transform: string): number | null {
  const match = /translateY\((-?\d+(?:\.\d+)?)px\)/.exec(transform);
  return match ? Number(match[1]) : null;
}

describe("nav row shared constants", () => {
  // Same shape as titlebar.test.tsx's "literal classes agree with their
  // numeric constants" — nothing else forces NAV_ROW_HEIGHT_CLASS /
  // NAV_ROW_GAP_CLASS to track the *_PX numbers except this assertion.
  it("literal Tailwind classes agree with their numeric constants", () => {
    expect(NAV_ROW_HEIGHT_CLASS).toBe(`h-[${NAV_ROW_HEIGHT_PX}px]`);
    expect(TAILWIND_GAP_PX[NAV_ROW_GAP_CLASS]).toBe(NAV_ROW_GAP_PX);
    expect(NAV_ROW_STRIDE_PX).toBe(NAV_ROW_HEIGHT_PX + NAV_ROW_GAP_PX);
  });
});

describe("sidebar selection pill alignment", () => {
  // The regression this pins down: ROW_STRIDE was hardcoded to 26 while the
  // real row height (25px) + real gap (4px) summed to 29 — a 3px-per-index
  // drift that put the pill nearly half a row off by the Activity row. This
  // test never imports NAV_ROW_STRIDE_PX as its expectation; it re-derives
  // the expected stride from the *actual rendered* row height and gap
  // classes, then checks that against the *actual rendered* translateY the
  // component applied. A test that just compared NAV_ROW_STRIDE_PX to
  // itself (or to a copy of its own formula) would pass even if Sidebar.tsx
  // never adopted the shared constant at all.
  it.each([
    { key: "capsules" as const, index: 1 },
    { key: "connectors" as const, index: 3 },
    { key: "activity" as const, index: 4 },
  ])("pill sits exactly on the $key row (index $index)", ({ key, index }) => {
    expect(NAV_ITEMS.findIndex((item) => item.key === key)).toBe(index);
    useStore.setState({ view: key, sidebarCollapsed: false, fullscreen: false });

    const { container } = renderWithProviders(<Sidebar />);

    const nav = container.querySelector("nav");
    expect(nav).not.toBeNull();

    // The moving selection surface: the single aria-hidden absolutely
    // positioned div that is `<nav>`'s direct child.
    const pill = nav!.querySelector(":scope > [aria-hidden]") as HTMLElement | null;
    expect(pill).not.toBeNull();

    // The active row, found the same way a user would recognise it —
    // aria-current="page" — not by trusting the index we already computed.
    const activeButton = nav!.querySelector("button[aria-current='page']") as HTMLElement | null;
    expect(activeButton).not.toBeNull();

    const rowHeight = pixelHeightFromClassList(activeButton!.className);
    const gap = gapPxFromClassList(nav!.className);
    expect(rowHeight).not.toBeNull();
    expect(gap).not.toBeNull();

    const expectedStride = rowHeight! + gap!;
    const expectedTranslate = index * expectedStride;

    const translateY = translateYFromTransform(pill!.style.transform);
    expect(translateY).not.toBeNull();
    expect(translateY).toBe(expectedTranslate);
  });
});
