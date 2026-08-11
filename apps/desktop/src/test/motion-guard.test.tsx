// The reduced-motion story is a blanket rule over `*`, not a per-animation
// opt-in — so this guards the blanket itself, plus the app's own
// data-motion="reduced" twin, plus the absence of anything that escapes
// them. An animation with `!important` on its duration would.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");

describe("reduced motion", () => {
  it("clamps animation and transition under the OS preference", () => {
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block).toMatch(/animation-duration:\s*0\.001ms\s*!important/);
    expect(block).toMatch(/transition-duration:\s*0\.001ms\s*!important/);
  });

  it("clamps the same way for the app's own Motion setting", () => {
    expect(css).toMatch(/:root\[data-motion="reduced"\]/);
  });

  // An animation whose duration is itself !important would outrank the
  // blanket and keep playing for a user who asked it not to.
  it("has no animation that can outrank the blanket", () => {
    const offenders = [...css.matchAll(/animation[^;]*!important/g)]
      .map((m) => m[0])
      .filter((decl) => !decl.includes("0.001ms") && !decl.includes("iteration-count"));
    expect(offenders).toEqual([]);
  });
});
