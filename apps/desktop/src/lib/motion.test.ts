import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  prefersReducedMotion,
  BRAND_EASE,
  RESTORE_SHEET_EASE,
  DUR,
  EASE,
} from "@/lib/motion";

describe("prefersReducedMotion", () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    // Restore whatever matchMedia looked like before each test, including
    // the "was deleted entirely" case.
    if (originalMatchMedia) {
      window.matchMedia = originalMatchMedia;
    } else {
      // @ts-expect-error - test cleanup restoring an absent global
      delete window.matchMedia;
    }
    vi.unstubAllGlobals();
  });

  it("returns true when matchMedia reports matches:true", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    expect(prefersReducedMotion()).toBe(true);
  });

  it("returns false when matchMedia reports matches:false", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    expect(prefersReducedMotion()).toBe(false);
  });

  it("returns false (never throws) when window.matchMedia is undefined", () => {
    // @ts-expect-error - simulating an environment without matchMedia
    delete window.matchMedia;
    expect(() => prefersReducedMotion()).not.toThrow();
    expect(prefersReducedMotion()).toBe(false);
  });
});

// Console v2 Phase 4, Task 9 — DUR/EASE are the single source `tailwind.
// config.js` reads its `duration-*`/`ease-*` utilities from, instead of
// restating the same numbers a second time. These tests pin the published
// shape so a future edit can't drift the two apart again.
describe("motion tokens", () => {
  it("exports the durations Tailwind publishes", () => {
    // Ink redesign (2026-08): one step shorter across the board; sidebar
    // stays 280 (pinned against index.css + SIDEBAR_MOTION_MS).
    expect(DUR).toEqual({ fast: 100, standard: 160, sidebar: 280, switch: 150, sheet: 260 });
  });

  it("exports the three easing curves and no more", () => {
    expect(Object.keys(EASE).sort()).toEqual(["brand", "mac", "standard"]);
  });

  it("keeps BRAND_EASE and EASE.brand the same value", () => {
    expect(EASE.brand).toBe(BRAND_EASE);
  });

  it("keeps RESTORE_SHEET_EASE and EASE.standard the same value", () => {
    expect(EASE.standard).toBe(RESTORE_SHEET_EASE);
  });

  // `.sidebar-track` animates a custom property, which Tailwind cannot express
  // as a utility, so it is hand-written CSS and cannot import this module. The
  // curve there is therefore a literal — the one copy that has to stay a copy.
  // Assert it rather than trust it: an edit to EASE.mac that misses index.css
  // would leave the rail and everything else it is meant to move with drifting
  // apart by an amount too small to notice and too consistent to be an
  // accident.
  it("keeps index.css's hand-written .sidebar-track curve equal to EASE.mac", () => {
    const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");
    const rule = css.match(/\.sidebar-track\s*\{[\s\S]*?\}/)?.[0];
    expect(rule, "index.css no longer defines .sidebar-track").toBeTruthy();
    expect(rule).toContain(EASE.mac);
    expect(rule).toContain(`${DUR.sidebar}ms`);
  });
});
