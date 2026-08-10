// Shared nav row sizing between each NavRow button and the moving selection
// surface that slides behind the active one (see Sidebar.tsx). The pill is
// translated by `activeIndex * NAV_ROW_STRIDE_PX`, so the stride has to be
// exactly one row's height plus the gap between rows — get that wrong and
// the pill lands short (or long) of the active row by a few pixels at
// index 1, twice that at index 2, and so on.
//
// This drifted once already: the row height moved from `h-10` (40px) to
// `h-[25px]` without updating the hardcoded `ROW_STRIDE` that used to live
// in Sidebar.tsx, leaving every row under-travelled — a 3px-per-index
// error that put the pill nearly half a row off by the last nav row and
// shipped into product screenshots. NAV_ROW_STRIDE_PX below is *derived*
// from the height + gap constants rather than written as its own number,
// specifically so that can't happen again — change the height or the gap
// and the stride updates with it.
//
// Task 9 (Console v2 Phase 1) retones the row height again, from 25px to
// the handoff's spec'd 28px (Rabta - Console v2.dc.html's `NAVB` constant:
// `height:28px`). Only the constant below changed — Sidebar.tsx and
// navRow.test.tsx both read it rather than a literal 28, so this is the one
// place that needed editing.
//
// Since Task 9 also splits the nav into two groups (Workspace / This Mac),
// the sliding pill is now scoped *per group* rather than to the whole nav
// list — each group's pill only travels across its own rows, so the stride
// arithmetic here never has to account for a group header's height. See
// Sidebar.tsx's `NavGroup` for how the two group-local pills are wired.
//
// Tailwind's JIT scanner only emits CSS for arbitrary-value classes it can
// see as literal text in a scanned file (`` `h-[${n}px]` `` produces no
// CSS), so — same reasoning as titlebar.ts — the class constants below stay
// literal strings. A test pins them against the numeric constants so the
// two can't drift apart.

export const NAV_ROW_HEIGHT_PX = 28;
export const NAV_ROW_HEIGHT_CLASS = "h-[28px]";

/** Tailwind's `gap-1` utility (0.25rem). Kept as its own named constant
 * (rather than inlined into the stride) so a test can pin the class/px pair
 * the same way it pins the row height. */
export const NAV_ROW_GAP_PX = 4;
export const NAV_ROW_GAP_CLASS = "gap-1";

/** Vertical distance between two consecutive nav rows. Always derived from
 * the height + gap above — never hardcode this number directly. */
export const NAV_ROW_STRIDE_PX = NAV_ROW_HEIGHT_PX + NAV_ROW_GAP_PX;

/** 6px corner radius, spec'd for both the row buttons and the pill that
 * slides behind them — shared so the two can never round differently and
 * make the pill visibly mismatch the row it's sitting under. */
export const NAV_ROW_RADIUS_CLASS = "rounded-[6px]";
