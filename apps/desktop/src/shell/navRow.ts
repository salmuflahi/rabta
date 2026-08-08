// Shared nav row sizing between each NavRow button and the moving selection
// surface that slides behind the active one (see Sidebar.tsx). The pill is
// translated by `activeIndex * NAV_ROW_STRIDE_PX`, so the stride has to be
// exactly one row's height plus the gap between rows — get that wrong and
// the pill lands short (or long) of the active row by a few pixels at
// index 1, twice that at index 2, and so on.
//
// This drifted once already: the row height moved from `h-10` (40px) to
// `h-[25px]` without updating the hardcoded `ROW_STRIDE` that used to live
// in Sidebar.tsx, leaving every row under-travelled. NAV_ROW_STRIDE_PX below
// is *derived* from the height + gap constants rather than written as its
// own number, specifically so that can't happen again — change the height
// or the gap and the stride updates with it.
//
// Tailwind's JIT scanner only emits CSS for arbitrary-value classes it can
// see as literal text in a scanned file (`` `h-[${n}px]` `` produces no
// CSS), so — same reasoning as titlebar.ts — the class constants below stay
// literal strings. A test pins them against the numeric constants so the
// two can't drift apart.

export const NAV_ROW_HEIGHT_PX = 25;
export const NAV_ROW_HEIGHT_CLASS = "h-[25px]";

/** Tailwind's `gap-1` utility (0.25rem). Kept as its own named constant
 * (rather than inlined into the stride) so a test can pin the class/px pair
 * the same way it pins the row height. */
export const NAV_ROW_GAP_PX = 4;
export const NAV_ROW_GAP_CLASS = "gap-1";

/** Vertical distance between two consecutive nav rows. Always derived from
 * the height + gap above — never hardcode this number directly. */
export const NAV_ROW_STRIDE_PX = NAV_ROW_HEIGHT_PX + NAV_ROW_GAP_PX;
