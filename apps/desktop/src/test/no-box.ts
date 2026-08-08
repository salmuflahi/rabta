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
