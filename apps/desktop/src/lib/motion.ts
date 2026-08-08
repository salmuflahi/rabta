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
// FOLD_MS used to be declared here too, but nothing outside this file's own
// test ever referenced it — the fold → restore ceremony's real fold timing
// lives as its own local constant in RestoreExperience.tsx, which is the
// only place it's actually used.
export const RESTORE_MIN_MS = 260;
export const UNFOLD_MS = 180;
export const FADE_MS = 120;
export const STAGGER_MS = 60;
export const MAX_RESTORE_MS = 4000;

/** Brand ease — matches Tailwind's `ease-brand` utility. */
export const BRAND_EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

/** Ease used by the Restore Experience sheet/backdrop/fold (a gentler,
 * more "settling" curve than `BRAND_EASE` — no bounce/overshoot). See
 * docs/superpowers/specs/2026-07-22-restore-experience-spec.md.
 *
 * This used to also be exported as `STANDARD_EASE` with a second doc
 * comment claiming it was a separate "Part 17" consolidated token — same
 * cubic-bezier value, two names, zero call sites for the second one. That
 * export (along with the equally-unreferenced `MOTION_FAST_MS`,
 * `MOTION_STANDARD_MS`, `SIDEBAR_MS`) has been removed; this is the one
 * name for this curve now. */
export const RESTORE_SHEET_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
