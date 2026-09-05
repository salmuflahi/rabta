import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  prefersReducedMotion,
  RESTORE_MIN_MS,
  UNFOLD_MS,
  FADE_MS,
  STAGGER_MS,
  MAX_RESTORE_MS,
  BRAND_EASE,
  RESTORE_SHEET_EASE,
  DUR,
  EASE,
  MARK_DRAW,
  LANDED_SPRING,
} from "@/lib/motion";

describe("prefersReducedMotion", () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
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

  it("honours the app's own override either way", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    expect(prefersReducedMotion("reduced")).toBe(true);
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    expect(prefersReducedMotion("full")).toBe(false);
  });
});

describe("timing constants", () => {
  it("exports the expected millisecond values", () => {
    expect(RESTORE_MIN_MS).toBe(260);
    expect(UNFOLD_MS).toBe(180);
    expect(FADE_MS).toBe(120);
    expect(STAGGER_MS).toBe(60);
    expect(MAX_RESTORE_MS).toBe(4000);
  });

  it("exports the brand ease as the redesign's one settling curve", () => {
    expect(BRAND_EASE).toBe("cubic-bezier(0.16, 1, 0.3, 1)");
  });
});

// DUR/EASE are the single source `tailwind.config.js` reads its
// `duration-*`/`ease-*` utilities from. These tests pin the published shape
// so an edit cannot drift the two apart.
describe("motion tokens", () => {
  it("exports the durations Tailwind publishes", () => {
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

  it("uses one settling curve for the sheet and the brand", () => {
    expect(RESTORE_SHEET_EASE).toBe(BRAND_EASE);
  });

  // `.sidebar-track` animates a custom property, which Tailwind cannot express
  // as a utility, so it is hand-written CSS and cannot import this module.
  it("keeps index.css's hand-written .sidebar-track curve equal to EASE.mac", () => {
    const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");
    const rule = css.match(/\.sidebar-track\s*\{[\s\S]*?\}/)?.[0];
    expect(rule, "index.css no longer defines .sidebar-track").toBeTruthy();
    expect(rule).toContain(EASE.mac);
    expect(rule).toContain(`${DUR.sidebar}ms`);
  });
});

describe("the mark's choreography", () => {
  it("draws stem, bowl, leg in that order and lands within the total", () => {
    expect(MARK_DRAW.stem.delay).toBeLessThan(MARK_DRAW.bowl.delay);
    expect(MARK_DRAW.bowl.delay).toBeLessThan(MARK_DRAW.leg.delay);
    for (const stroke of [MARK_DRAW.stem, MARK_DRAW.bowl, MARK_DRAW.leg]) {
      expect(stroke.delay + stroke.duration).toBeLessThanOrEqual(MARK_DRAW.total + 100);
    }
  });

  it("lands on a spring, not a curve", () => {
    expect(LANDED_SPRING.type).toBe("spring");
    expect(LANDED_SPRING.stiffness).toBeGreaterThan(0);
    expect(LANDED_SPRING.damping).toBeGreaterThan(0);
  });
});
