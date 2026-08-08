import { expect } from "vitest";

/**
 * Assertion helpers for primitives whose depth must come from elevation
 * alone, never a drawn outline or a panel behind them.
 *
 * A naive `not.toMatch(/(^|\s)border(\s|$)/)` only rejects the bare `border`
 * utility — it silently accepts `border-b`, `border-t`, `border-2`,
 * `border-border`, and every other hyphenated border-width / border-style /
 * border-colour utility, because none of those end in whitespace right after
 * the word "border". These helpers instead split the class list into
 * discrete utility tokens and check each token's *base* utility (the part
 * after any responsive/state variant prefix, e.g. `hover:`, `dark:`) against
 * the real Tailwind border/background utility shapes.
 */

/**
 * Returns the class list of an element as an array of individual utility
 * tokens.
 *
 * Reads via `getAttribute("class")` rather than `.className` so this works
 * identically for HTML and SVG elements: on an `SVGElement`, `.className` is
 * an `SVGAnimatedString` object, not a plain string, and would silently
 * produce `"[object SVGAnimatedString]"` if concatenated or matched
 * directly. The `class` attribute itself is always a plain string on both.
 */
function classTokensOf(el: Element): string[] {
  const classStr = el.getAttribute("class") || "";
  return classStr.split(/\s+/).filter(Boolean);
}

/**
 * Strips any Tailwind variant prefixes (`hover:`, `dark:`, `md:`, stacked
 * combinations, ...) off a class token, leaving the base utility.
 */
function baseUtilityOf(token: string): string {
  const parts = token.split(":");
  return parts[parts.length - 1];
}

function isBorderUtility(token: string): boolean {
  const base = baseUtilityOf(token);
  // Matches the bare `border` utility and any hyphenated border-width,
  // border-style, or border-colour utility (border-b, border-2,
  // border-dashed, border-border, border-border/60, ...). Anchored to the
  // start of the base utility so a class that merely contains the letters
  // "border" mid-word (e.g. a hypothetical `bordered` or `reborder-x`
  // class) is correctly left alone.
  return base === "border" || base.startsWith("border-");
}

function isBackgroundUtility(token: string): boolean {
  return baseUtilityOf(token).startsWith("bg-");
}

/**
 * Fails if `el` carries any border-width, border-style, or border-colour
 * utility class, in any form (`border`, `border-b`, `border-2`,
 * `border-border/60`, ...).
 */
export function expectNoBorder(el: Element): void {
  const offenders = classTokensOf(el).filter(isBorderUtility);
  expect(
    offenders.length,
    `expected no border utility classes, found: ${offenders.join(", ")}`,
  ).toBe(0);
}

/**
 * Fails if `el` carries any `bg-*` utility class.
 */
export function expectNoBackground(el: Element): void {
  const offenders = classTokensOf(el).filter(isBackgroundUtility);
  expect(
    offenders.length,
    `expected no background utility classes, found: ${offenders.join(", ")}`,
  ).toBe(0);
}

/**
 * Matches only a ring *width* utility (the bare `ring` utility, which is
 * 3px, and the explicit `ring-0`/`ring-1`/`ring-2`/`ring-4`/`ring-8`
 * widths) — never a ring *color* (`ring-ring`, `ring-primary/50`, ...),
 * *offset* (`ring-offset-2`, `ring-offset-background`), or *inset*
 * (`ring-inset`) utility, all of which also start with `ring` but are
 * harmless without a nonzero width alongside them.
 */
function isRingWidthUtility(token: string): boolean {
  const base = baseUtilityOf(token);
  return base === "ring" || /^ring-(0|1|2|4|8)$/.test(base);
}

/**
 * Fails if `el` carries a *nonzero* ring-width utility, in any variant
 * (`ring-2`, `hover:ring`, `focus-visible:ring-4`, ...). `ring-0` itself is
 * allowed — it is the idiom this file's callers use to neutralise a ring
 * that would otherwise be painted by a global rule (see
 * `expectFocusRingSuppressed` below), not a ring that will actually render.
 */
export function expectNoVisibleFocusRing(el: Element): void {
  const offenders = classTokensOf(el).filter(
    (token) => isRingWidthUtility(token) && baseUtilityOf(token) !== "ring-0",
  );
  expect(
    offenders.length,
    `expected no nonzero ring-width utility classes, found: ${offenders.join(", ")}`,
  ).toBe(0);
}

/**
 * Fails unless `el` explicitly neutralises the global `:focus-visible` ring
 * (`src/index.css`'s `ring-2 ring-ring ring-offset-2 ring-offset-background`)
 * via a `focus-visible:ring-0` class of its own, AND carries no other
 * nonzero ring-width utility that could still paint one.
 *
 * For a non-interactive container that only ever receives *programmatic*
 * focus (a dialog/sheet root moved there so Escape works and screen readers
 * announce it — never a control a keyboard user tabbed to), `outline-none`
 * alone does not suppress the ring: Tailwind's `ring-*` utilities render as
 * a `box-shadow`, which `outline-none` (which only touches the `outline`
 * property) cannot touch. The element needs its own ring utility — set to
 * zero width — to out-specificity the global rule.
 */
export function expectFocusRingSuppressed(el: Element): void {
  const tokens = classTokensOf(el);
  expect(
    tokens.includes("focus-visible:ring-0"),
    `expected a "focus-visible:ring-0" class to neutralise the global :focus-visible ring, found: ${tokens.join(", ")}`,
  ).toBe(true);
  expectNoVisibleFocusRing(el);
}

/**
 * Fails unless `el` carries the `focus-visible:ring-2` class that the app's
 * interactive controls (buttons, etc.) rely on for a visible keyboard-focus
 * indicator. Pair with `expectFocusRingSuppressed` on a dialog/sheet's own
 * root: the container must give up its ring so a genuinely interactive
 * control inside it can still show one.
 */
export function expectHasFocusRing(el: Element): void {
  const tokens = classTokensOf(el);
  expect(
    tokens.includes("focus-visible:ring-2"),
    `expected a "focus-visible:ring-2" class so keyboard focus stays visible, found: ${tokens.join(", ")}`,
  ).toBe(true);
}
