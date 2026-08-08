// Shared titlebar height between the Sidebar's traffic-light row and the
// workspace Toolbar. They live in separate DOM subtrees (the two columns of
// the AppShell grid) but must resolve to the exact same pixel height: the
// Sidebar's titlebar divider and the Toolbar's bottom border are drawn to
// read as one continuous hairline across the window. These two heights have
// already drifted apart once (the Toolbar moved from 60px to 38px without a
// matching Sidebar edit) — centralizing the numbers here means the next
// height change has one place to update instead of two that have to be
// remembered to agree.
//
// Tailwind's JIT scanner only generates CSS for arbitrary-value classes it
// can see as literal text in a scanned file, so a numeric constant can't be
// interpolated into a className at runtime (`` `h-[${n}px]` `` produces no
// CSS). The class constants below stay literal strings for that reason —
// the paired *_PX constants exist so a test can assert the literal classes
// actually agree with the numbers, instead of trusting a comment.

/** The Toolbar's total rendered height. box-sizing: border-box (Tailwind
 * Preflight) means this already includes the Toolbar's own 1px border-b —
 * no extra math needed when comparing against it. */
export const TOOLBAR_HEIGHT_PX = 38;
export const TOOLBAR_HEIGHT_CLASS = "h-[38px]";

/** The Sidebar draws its side of the hairline as two separate elements — a
 * spacer plus a real 1px divider — so the spacer must be exactly one pixel
 * shorter than the Toolbar's total height for the two to sum to the same
 * value. */
export const SIDEBAR_TITLEBAR_DIVIDER_HEIGHT_PX = 1;
export const SIDEBAR_TITLEBAR_DIVIDER_HEIGHT_CLASS = "h-px";

export const SIDEBAR_TITLEBAR_SPACER_HEIGHT_PX =
  TOOLBAR_HEIGHT_PX - SIDEBAR_TITLEBAR_DIVIDER_HEIGHT_PX;
export const SIDEBAR_TITLEBAR_SPACER_HEIGHT_CLASS = "h-[37px]";
