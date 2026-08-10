import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/smoke-utils";
import { useStore } from "@/store";
import { NAV_ITEMS } from "./nav";
import {
  NAV_ROW_GAP_CLASS,
  NAV_ROW_GAP_PX,
  NAV_ROW_HEIGHT_CLASS,
  NAV_ROW_HEIGHT_PX,
  NAV_ROW_RADIUS_CLASS,
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

  // Task 9 retones the row from 25px to the handoff's spec'd 28px.
  it("is spec'd at 28px, not the previous arc's 25px", () => {
    expect(NAV_ROW_HEIGHT_PX).toBe(28);
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
  //
  // Task 9 splits the nav into two groups (Workspace / This Mac), each with
  // its own sliding pill scoped to its own rows (see Sidebar.tsx's
  // NavGroup) — so the expected index below is the row's position *within
  // its own group*, not its position in the flat NAV_ITEMS list. Connectors
  // is NAV_ITEMS[3] overall but index 0 within "This Mac"; Activity is
  // NAV_ITEMS[4] overall but index 1 within "This Mac".
  it.each([
    { key: "capsules" as const, group: "Workspace", indexInGroup: 1 },
    { key: "connectors" as const, group: "This Mac", indexInGroup: 0 },
    { key: "activity" as const, group: "This Mac", indexInGroup: 1 },
  ])("pill sits exactly on the $key row (group $group, index $indexInGroup)", ({ key, group, indexInGroup }) => {
    // Guards the table above against nav.ts's `group` field drifting away
    // from what this test assumes — if capsules/connectors/activity ever
    // move groups, this fails loudly here instead of the pill silently
    // landing on the wrong row.
    expect(NAV_ITEMS.find((item) => item.key === key)?.group).toBe(group);

    useStore.setState({ view: key, sidebarCollapsed: false, fullscreen: false });

    const { container } = renderWithProviders(<Sidebar />);

    const nav = container.querySelector("nav");
    expect(nav).not.toBeNull();

    // The active row, found the same way a user would recognise it —
    // aria-current="page" — not by trusting the index we already computed.
    const activeButton = nav!.querySelector("button[aria-current='page']") as HTMLElement | null;
    expect(activeButton).not.toBeNull();

    // The group wrapper the active row lives in, identified by the group
    // name Sidebar.tsx stamps on it — not by DOM position, so this doesn't
    // silently pass if group order ever changes.
    const groupEl = activeButton!.closest(`[data-nav-group="${group}"]`) as HTMLElement | null;
    expect(groupEl).not.toBeNull();

    // The moving selection surface: the single aria-hidden absolutely
    // positioned div that is the group wrapper's direct child.
    const pill = groupEl!.querySelector(":scope > [aria-hidden]") as HTMLElement | null;
    expect(pill).not.toBeNull();

    const rowHeight = pixelHeightFromClassList(activeButton!.className);
    const gap = gapPxFromClassList(groupEl!.className);
    expect(rowHeight).not.toBeNull();
    expect(gap).not.toBeNull();

    const expectedStride = rowHeight! + gap!;
    const expectedTranslate = indexInGroup * expectedStride;

    const translateY = translateYFromTransform(pill!.style.transform);
    expect(translateY).not.toBeNull();
    expect(translateY).toBe(expectedTranslate);
  });

  // The row and pill radii must agree (whole-token match — see
  // src/test/no-box.ts for why substring matching on Tailwind class names
  // is unreliable) or the pill visibly mismatches the row it sits under.
  it("row and pill share the same 6px radius", () => {
    useStore.setState({ view: "capsules", sidebarCollapsed: false, fullscreen: false });
    const { container } = renderWithProviders(<Sidebar />);

    const activeButton = container.querySelector("button[aria-current='page']") as HTMLElement | null;
    expect(activeButton).not.toBeNull();
    const groupEl = activeButton!.closest("[data-nav-group]") as HTMLElement | null;
    expect(groupEl).not.toBeNull();
    const pill = groupEl!.querySelector(":scope > [aria-hidden]") as HTMLElement | null;
    expect(pill).not.toBeNull();

    expect(NAV_ROW_RADIUS_CLASS).toBe("rounded-[6px]");
    expect(activeButton!.className.split(/\s+/)).toContain(NAV_ROW_RADIUS_CLASS);
    expect(pill!.className.split(/\s+/)).toContain(NAV_ROW_RADIUS_CLASS);
  });
});
