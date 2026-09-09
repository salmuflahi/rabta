/**
 * The brand's arrival timing, in milliseconds. `total` is how long the
 * wordmark takes to arrive and land (brand.ts); the three named entries are
 * the choreography of the retired three-stroke mark and stay so this module
 * and its twin in apps/desktop/src/lib/motion.ts remain equal, which a test
 * checks. This module imports nothing so the test can load both and compare.
 */
export const MARK_DRAW = {
  stem: { delay: 0, duration: 420 },
  bowl: { delay: 180, duration: 560 },
  leg: { delay: 560, duration: 640 },
  total: 1100,
} as const;
