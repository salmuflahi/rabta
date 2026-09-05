// Pure motion foundation: no React, no invoke, no side effects at import.
// Shared timing constants + a guarded prefers-reduced-motion check that the
// signature Restore ceremony (and later microinteractions) build on.
//
// The vocabulary is the brand's, shared with the website — see
// docs/superpowers/specs/2026-09-03-rabta-brand-redesign-design.md §5:
// one settling curve, one spring for landed moments, transform/opacity
// only, and reduced motion honoured everywhere.

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
export const RESTORE_MIN_MS = 260;
export const UNFOLD_MS = 180;
export const FADE_MS = 120;
export const STAGGER_MS = 60;
export const MAX_RESTORE_MS = 4000;

/** The brand's one settling curve. Everything that comes to rest uses it;
 * matches Tailwind's `ease-brand` utility and the website's `--ease`. */
export const BRAND_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

/** The Restore Experience's sheet/backdrop curve. Since the brand redesign
 * this is the same curve as `BRAND_EASE` — the sheet no longer has a
 * private, gentler ease. Kept as a named export because the restore code
 * reads better naming the thing it is easing. */
export const RESTORE_SHEET_EASE = BRAND_EASE;

/**
 * Durations, in milliseconds, that `tailwind.config.js` publishes as
 * `duration-*` utilities. This file is the source; the config reads from it.
 */
export const DUR = {
  /** Hover and press feedback. */
  fast: 100,
  /** A state change: a row selecting, a chip retinting, a view settling. */
  standard: 160,
  /** The sidebar/main boundary sliding. Also `.sidebar-track` in index.css. */
  sidebar: 280,
  /** The macOS switch's knob travel. */
  switch: 150,
  /** The Migrate, pairing and restore sheets' entrance. */
  sheet: 260,
} as const;

/**
 * The app's three easing curves, published by Tailwind as `ease-*`. Three is
 * the whole budget — a fourth needs a reason written down here.
 */
export const EASE = {
  brand: BRAND_EASE,
  standard: RESTORE_SHEET_EASE,
  /** The handoff's macOS curve, for the switch knob and the sidebar slide. */
  mac: "cubic-bezier(0.32, 0.72, 0, 1)",
} as const;

/**
 * The spring for a landed moment — the mark's last stroke settling, a
 * restore completing. Shared with Motion's `type: "spring"` transitions so
 * the app and the marketing site land the same way.
 */
export const LANDED_SPRING = { type: "spring", stiffness: 260, damping: 18, mass: 1 } as const;

/**
 * The mark's stroke choreography (ms). Stem, then the bowl overlapping it,
 * then the leg — the return — last. Same numbers the website's brand.js
 * uses, so the logo draws identically in the app and on the page.
 */
export const MARK_DRAW = {
  stem: { delay: 0, duration: 420 },
  bowl: { delay: 180, duration: 560 },
  leg: { delay: 560, duration: 640 },
  /** When the whole mark has landed and the spring may start. */
  total: 1100,
} as const;
