/**
 * The mark's three strokes, drawn in the order the product happens: the stem
 * (you start), the bowl (you capture), the leg (you leave and come back).
 * These are the same numbers the desktop app uses in
 * apps/desktop/src/lib/motion.ts, so the logo draws identically on the page
 * and in the app. Milliseconds. This module imports nothing so a test can
 * load it and compare it with the app's copy.
 */
export const MARK_DRAW = {
  stem: { delay: 0, duration: 420 },
  bowl: { delay: 180, duration: 560 },
  leg: { delay: 560, duration: 640 },
  total: 1100,
} as const;
