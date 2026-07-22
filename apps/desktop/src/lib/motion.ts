// Pure motion foundation: no React, no invoke, no side effects at import.
// Shared timing constants + a guarded prefers-reduced-motion check that the
// signature Resume ceremony (and later microinteractions) build on.
//
// Motion rules (see docs/superpowers/plans/2026-07-21-qol-polish-arc.md,
// Phase A1): transform/opacity only, brand ease, respect
// `prefers-reduced-motion` everywhere.

/**
 * Whether the user has requested reduced motion at the OS/browser level.
 * Guarded for environments without `window`/`matchMedia` (SSR, some test
 * setups) — never throws, degrades to `false` (i.e. motion allowed).
 */
export function prefersReducedMotion(): boolean {
  try {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// Timing constants (ms) for the fold → restore → unfold → fade ceremony.
export const FOLD_MS = 180;
export const RESTORE_MIN_MS = 260;
export const UNFOLD_MS = 180;
export const FADE_MS = 120;
export const STAGGER_MS = 60;
export const MAX_RESTORE_MS = 4000;

/** Brand ease — matches Tailwind's `ease-brand` utility. */
export const BRAND_EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
