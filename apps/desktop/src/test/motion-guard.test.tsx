// The reduced-motion story is a blanket rule over `*`, not a per-animation
// opt-in — so this guards the blanket itself, plus the app's own
// data-motion="reduced" twin, plus the absence of anything that escapes
// them. An animation or transition with `!important` on its duration would.
//
// Known limit, not chased here: this guard only reads the raw index.css
// source. An `!important` introduced through Tailwind's `!` modifier inside
// a .tsx className (e.g. `!duration-75`) is compiled into generated CSS this
// guard never sees — out of reach for a guard whose only input is the
// hand-written stylesheet.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");

/**
 * Extracts a CSS rule block by its selector text: from the selector to the
 * block's own matching closing brace (not to end-of-file, and not merely
 * "the selector string appears somewhere"). Declarations are flat here (no
 * nested braces), so the first `}` after the first `{` is the real end.
 */
function ruleBlock(source: string, selector: string): string {
  const start = source.indexOf(selector);
  expect(start, `selector ${JSON.stringify(selector)} not found`).toBeGreaterThanOrEqual(0);
  const openBrace = source.indexOf("{", start);
  const closeBrace = source.indexOf("}", openBrace);
  return source.slice(start, closeBrace + 1);
}

describe("reduced motion", () => {
  it("clamps animation and transition under the OS preference", () => {
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block).toMatch(/animation-duration:\s*0\.001ms\s*!important/);
    expect(block).toMatch(/transition-duration:\s*0\.001ms\s*!important/);
  });

  // Previously this only asserted the selector string appears somewhere in
  // the file — it never looked at what (if anything) was inside the block.
  // A regression that guts this block's declarations while leaving the
  // selector behind (even inside a comment) would have passed silently,
  // and the app's own Settings -> Appearance -> Motion control would stop
  // working with nothing to catch it. Fault-injection-verified: see
  // task-15-report.md for the observed before/after.
  it("clamps the same way for the app's own Motion setting", () => {
    const block = ruleBlock(css, ':root[data-motion="reduced"]');
    expect(block).toMatch(/animation-duration:\s*0\.001ms\s*!important/);
    expect(block).toMatch(/animation-iteration-count:\s*1\s*!important/);
    expect(block).toMatch(/transition-duration:\s*0\.001ms\s*!important/);
  });

  // An animation or transition whose duration is itself !important would
  // outrank the blanket and keep playing for a user who asked it not to.
  // Widened to also catch `transition-*: … !important` — every
  // micro-interaction in this app is a transition, not a @keyframes
  // animation, so a bare "animation" substring match had a blind spot
  // sitting exactly where this app's own escapes would appear.
  it("has no animation or transition that can outrank the blanket", () => {
    const offenders = [...css.matchAll(/(?:animation|transition)[^;]*!important/g)]
      .map((m) => m[0])
      .filter((decl) => !decl.includes("0.001ms") && !decl.includes("iteration-count"));
    expect(offenders).toEqual([]);
  });
});
