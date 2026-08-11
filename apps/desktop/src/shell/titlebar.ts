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

import { DUR } from "@/lib/motion";

/** The Toolbar's total rendered height. box-sizing: border-box (Tailwind
 * Preflight) means this already includes the Toolbar's own border-b —
 * no extra math needed when comparing against it.
 *
 * Task 10 (Console v2 Phase 1) retones this from 38px to the handoff's
 * spec'd 52px (Rabta - Console v2.dc.html's toolbar `<header>`:
 * `height:52px`) — the prototype markup is the source of truth here, ahead
 * of the README's prose, per that task's brief. Retuning this number is
 * *why* this module exists: the Sidebar's titlebar spacer below is derived
 * from it rather than hardcoded, and the native traffic-light position in
 * `src-tauri/tauri.conf.json` has to be re-measured against the new strip
 * height (see that file's `trafficLightPosition` comment). */
export const TOOLBAR_HEIGHT_PX = 52;
export const TOOLBAR_HEIGHT_CLASS = "h-[52px]";

/** The Sidebar draws its side of the hairline as two separate elements — a
 * spacer plus a real 1px divider — so the spacer must be exactly one pixel
 * shorter than the Toolbar's total height for the two to sum to the same
 * value. */
export const SIDEBAR_TITLEBAR_DIVIDER_HEIGHT_PX = 1;
export const SIDEBAR_TITLEBAR_DIVIDER_HEIGHT_CLASS = "h-px";

export const SIDEBAR_TITLEBAR_SPACER_HEIGHT_PX =
  TOOLBAR_HEIGHT_PX - SIDEBAR_TITLEBAR_DIVIDER_HEIGHT_PX;
export const SIDEBAR_TITLEBAR_SPACER_HEIGHT_CLASS = "h-[51px]";

// --- Sidebar-toggle geometry (Task 10) ---
//
// The sidebar-toggle control is drawn by two different chrome regions
// depending on state — the Sidebar itself when it's open, the Toolbar when
// it's collapsed (see Sidebar.tsx's `SidebarToggleButton` and its two call
// sites) — but the handoff is explicit that its left edge must land at the
// *same* 73px from the window edge in both, so the control never visibly
// jumps as the sidebar animates open/closed. That 73px isn't an arbitrary
// number to pin directly: it's the sum of the space macOS's native
// traffic-light cluster occupies (never drawn by this app — see
// `src-tauri/tauri.conf.json`) plus the gap before the toggle, so it's
// built from the same pieces both chrome regions already need to reserve
// that space correctly. Building it from parts here (rather than each
// component hardcoding its own arithmetic) is the same reasoning as
// TOOLBAR_HEIGHT_PX above: two independent "73"s that happen to agree
// today are exactly the kind of thing this codebase has watched drift
// apart before.

/** One traffic-light dot, and the gap between consecutive dots — 12px
 * circles, 8px gaps, per the handoff. */
export const TRAFFIC_LIGHT_DOT_SIZE_PX = 12;
export const TRAFFIC_LIGHT_DOT_GAP_PX = 8;
export const TRAFFIC_LIGHT_DOT_COUNT = 3;

/** Total width of the three-dot cluster: 3 dots + 2 gaps between them. */
export const TRAFFIC_LIGHT_GROUP_WIDTH_PX =
  TRAFFIC_LIGHT_DOT_COUNT * TRAFFIC_LIGHT_DOT_SIZE_PX +
  (TRAFFIC_LIGHT_DOT_COUNT - 1) * TRAFFIC_LIGHT_DOT_GAP_PX;
export const TRAFFIC_LIGHT_GROUP_WIDTH_CLASS = "w-[52px]";

/** The sidebar's expanded width. 216px, matching the prototype markup's
 * `width:216px` and the README's Window chrome section. AppShell drives the
 * grid track from it; the Sidebar pins its own content column to it so the
 * contents keep their layout while the track animates to zero underneath
 * them (a percentage-width column would reflow the nav on every frame). */
export const SIDEBAR_EXPANDED_WIDTH_PX = 216;

/** Left padding shared by the Sidebar's own content column (its `aside`'s
 * `px-[10px]`) and the Toolbar's chrome row — the point both regions start
 * their content from before the traffic-light reservation begins. Kept as
 * its own constant (rather than each component owning an independent `10`)
 * because the 73px toggle position below is derived from it in both
 * places. */
// Phase 2 dropped the paired `CHROME_INSET_CLASS` ("pl-[10px]"): the
// Toolbar's left inset is now an animating inline value (it grows to clear
// the pinned toggle when the sidebar collapses), so no utility class
// expresses it any more. A class constant nothing renders is precisely the
// drift this module exists to prevent, so it went rather than lingering.
export const CHROME_INSET_PX = 10;

/** The first light sits 13px from the window's left edge (measured against
 * the running app window — see task-10-report.md for the raw
 * measurements). Both chrome regions reach that inset by adding a small
 * extra inset on top of their shared CHROME_INSET_PX. */
export const TRAFFIC_LIGHT_FIRST_LIGHT_OFFSET_PX = 13;
export const TRAFFIC_LIGHT_WRAPPER_INSET_PX =
  TRAFFIC_LIGHT_FIRST_LIGHT_OFFSET_PX - CHROME_INSET_PX;
export const TRAFFIC_LIGHT_WRAPPER_INSET_CLASS = "pl-[3px]";

/** Gap between the traffic-light cluster and the toggle button that
 * follows it. (Its paired `gap-[8px]` class went with Phase 2's move of the
 * toggle out of both chrome rows and into a pinned overlay — no flex row
 * lays the two out side by side any more.) */
export const SIDEBAR_TOGGLE_GAP_PX = 8;

/** The toggle's own left edge from the window edge — identical in both
 * chrome regions, since both are built from the same four numbers above. */
export const SIDEBAR_TOGGLE_LEFT_PX =
  CHROME_INSET_PX +
  TRAFFIC_LIGHT_WRAPPER_INSET_PX +
  TRAFFIC_LIGHT_GROUP_WIDTH_PX +
  SIDEBAR_TOGGLE_GAP_PX;

// --- Fullscreen (Phase 2, Task 1) ---
//
// In native macOS fullscreen the OS hides the traffic lights entirely, so
// every number above that exists to reserve room for them is dead weight:
// the toggle would sit 73px in with nothing to its left. Fullscreen gets
// its own, shorter lead built from the same chrome inset.
//
// This also fixes a real bug. The Sidebar used to drop its whole
// traffic-light row on fullscreen — and that row was the *only* place the
// toggle was drawn while the sidebar was open, so an open sidebar in
// fullscreen had no toggle anywhere in the window. The control is now
// drawn once, by AppShell, pinned over both columns (see SidebarToggle),
// which is also what makes it literally impossible for the two chrome
// regions to disagree about its position.

/** The toggle's left edge in fullscreen: no lights to clear, so it starts
 * at the plain chrome inset. */
export const SIDEBAR_TOGGLE_FULLSCREEN_LEFT_PX = CHROME_INSET_PX;

/** The toggle control's own rendered width (`w-[26px]` in SidebarToggle). */
export const SIDEBAR_TOGGLE_WIDTH_PX = 26;

/** Where a chrome region's own first control may start, given the pinned
 * toggle overlays that region. Only the Toolbar needs this, and only while
 * the sidebar is collapsed — while it's open the toggle sits over the
 * sidebar instead and the Toolbar's content can start at its own inset. */
export function chromeLeadWidthPx(fullscreen: boolean): number {
  const left = fullscreen ? SIDEBAR_TOGGLE_FULLSCREEN_LEFT_PX : SIDEBAR_TOGGLE_LEFT_PX;
  return left + SIDEBAR_TOGGLE_WIDTH_PX + SIDEBAR_TOGGLE_GAP_PX - CHROME_INSET_PX;
}

/** Left edge of the pinned toggle, per window state. */
export function sidebarToggleLeftPx(fullscreen: boolean): number {
  return fullscreen ? SIDEBAR_TOGGLE_FULLSCREEN_LEFT_PX : SIDEBAR_TOGGLE_LEFT_PX;
}

// --- Sidebar collapse motion (Phase 2, Task 1) ---
//
// DELIBERATE DIVERGENCE FROM THE HANDOFF. Its Interactions section says
// "Sidebar collapse is instant, not animated. Animating it was tried and
// cut." We animate it anyway, on the product owner's explicit call — the
// panel should slide away and slide back rather than blink out of
// existence. Everything else in the Motion table is honoured, including
// the shared macOS curve, and the whole thing collapses under
// prefers-reduced-motion via the global rule in index.css.
//
// The duration lives here rather than only in the Tailwind
// `duration-sidebar` token because JS needs the same number: the sidebar's
// content stays mounted for exactly this long after a collapse so it can
// animate out before unmounting (see useSidebarPresence).

/** Sidebar open/close duration. Re-exported under this name (rather than
 * having every call site below import `DUR.sidebar` directly) because this
 * module, not motion.ts, is where the surrounding geometry constants those
 * call sites already depend on live. The value itself now traces to
 * motion.ts's `DUR.sidebar` — the single source both this constant and
 * Tailwind's `duration-sidebar` utility read from — and must still equal
 * the `--sidebar-width` transition in index.css, which is hand-kept in
 * sync (a CSS custom property's transition-duration can't import a JS/TS
 * value). */
export const SIDEBAR_MOTION_MS = DUR.sidebar;
