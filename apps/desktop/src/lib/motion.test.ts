import { describe, it, expect, afterEach, vi } from "vitest";
import {
  prefersReducedMotion,
  FOLD_MS,
  RESTORE_MIN_MS,
  UNFOLD_MS,
  FADE_MS,
  STAGGER_MS,
  MAX_RESTORE_MS,
  BRAND_EASE,
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

describe("timing constants", () => {
  it("exports the expected millisecond values", () => {
    expect(FOLD_MS).toBe(180);
    expect(RESTORE_MIN_MS).toBe(260);
    expect(UNFOLD_MS).toBe(180);
    expect(FADE_MS).toBe(120);
    expect(STAGGER_MS).toBe(60);
    expect(MAX_RESTORE_MS).toBe(4000);
  });

  it("exports the brand ease as the expected cubic-bezier string", () => {
    expect(BRAND_EASE).toBe("cubic-bezier(0.2, 0.8, 0.2, 1)");
  });
});
