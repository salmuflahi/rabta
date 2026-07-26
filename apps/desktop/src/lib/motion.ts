// Pure motion foundation: no React, no invoke, no side effects at import.
// Shared timing constants + a guarded prefers-reduced-motion check that the
// signature Resume ceremony (and later microinteractions) build on.
//
// Motion rules (see docs/superpowers/plans/2026-07-21-qol-polish-arc.md,
// Phase A1): transform/opacity only, brand ease, respect
// `prefers-reduced-motion` everywhere.

/** User's motion preference (Settings → Appearance). "system" follows the OS
 * `prefers-reduced-motion`; "full"/"reduced" force it either way. */
export type MotionPref = "system" | "full" | "reduced";

/**
 * Whether reduced motion should apply. With no argument (or "system") it
 * follows the OS `prefers-reduced-motion`; "reduced"/"full" are explicit
 * overrides from the app's own Motion setting. Guarded for environments
 * without `window`/`matchMedia` (SSR, some test setups) — never throws,
 * degrades to `false` (motion allowed).
 */
export function prefersReducedMotion(pref: MotionPref = "system"): boolean {
  if (pref === "reduced") return true;
  if (pref === "full") return false;
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

/** Consolidated motion tokens (Part 17). The standard ease is the same
 * settling curve the Restore sheet uses — smooth ease-out, no overshoot. */
export const STANDARD_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
export const MOTION_FAST_MS = 120;
export const MOTION_STANDARD_MS = 180;
export const SIDEBAR_MS = 280;

/** Ease used by the Restore Experience sheet/backdrop/fold (a gentler,
 * more "settling" curve than `BRAND_EASE` — no bounce/overshoot). See
 * docs/superpowers/specs/2026-07-22-restore-experience-spec.md. */
export const RESTORE_SHEET_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
