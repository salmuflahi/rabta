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

/** Brand ease — matches Tailwind's `ease-brand` utility.
 * Ink redesign (2026-08): retuned from (0.2, 0.8, 0.2, 1) to a crisper
 * expo-out — near-instant attack, long settle — so state changes feel
 * placed rather than eased. */
export const BRAND_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

/** Completion pop — a slight overshoot for terminal "it landed" moments
 * only (the restore ceremony's check badge and row ticks). Never for
 * layout-affecting motion; the overshoot reads as bounce on anything
 * larger than an icon. */
export const SPRING_EASE = "cubic-bezier(0.34, 1.45, 0.64, 1)";

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

/**
 * Durations, in milliseconds, that `tailwind.config.js` publishes as
 * `duration-*` utilities. This file is the source; the config reads from it.
 * Before Phase 4 the two restated each other and drifted.
 */
export const DUR = {
  // Ink redesign (2026-08): fast/standard/switch/sheet each dropped one
  // step — the crisper BRAND_EASE front-loads its travel, so the same
  // perceived settle now happens in less clock time. `sidebar` stays 280:
  // that number is pinned in three places (index.css's @property
  // transition, SIDEBAR_MOTION_MS, and this token) and the boundary slide
  // is long-travel enough that shortening it reads as a snap.
  fast: 100,
  standard: 160,
  sidebar: 280,
  switch: 150,
  /** The Migrate and pairing sheets' slide-down. */
  sheet: 260,
} as const;

/**
 * The app's three easing curves, published by Tailwind as `ease-*`. Three is
 * the whole budget — a fourth needs a reason written down here.
 */
export const EASE = {
  brand: BRAND_EASE,
  standard: RESTORE_SHEET_EASE,
  mac: "cubic-bezier(0.32, 0.72, 0, 1)",
} as const;
