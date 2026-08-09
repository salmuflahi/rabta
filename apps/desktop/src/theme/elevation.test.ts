import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import config from "../../tailwind.config.js";

const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");
const shadows = config.theme.extend.boxShadow;

function blockFor(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  const end = css.indexOf("\n  }", start);
  return css.slice(start, end);
}

function varValue(block: string, name: string): string {
  return block.match(new RegExp(`${name}:([^;]+);`))?.[1].trim() ?? "";
}

describe("elevation", () => {
  it("exposes raised, grouped and modal shadows through CSS variables", () => {
    expect(shadows.raised).toBe("var(--shadow-raised)");
    expect(shadows.grouped).toBe("var(--shadow-grouped)");
    expect(shadows.modal).toBe("var(--shadow-modal)");
  });

  it("defines all three elevation variables in both themes", () => {
    for (const selector of [":root", ".dark"]) {
      const block = blockFor(selector);
      expect(block).toMatch(/--shadow-raised:/);
      expect(block).toMatch(/--shadow-grouped:/);
      expect(block).toMatch(/--shadow-modal:/);
    }
  });

  // The hairline ring is the first shadow layer at every level, in both
  // themes — it is what stands in for `border` on a card, per the handoff:
  // "Cards do not use border; the hairline is the first shadow ring. This
  // keeps borders from doubling where cards sit next to hairline dividers."
  it("leads every elevation level, in both themes, with a 0 0 0 0.5px ring", () => {
    for (const selector of [":root", ".dark"]) {
      const block = blockFor(selector);
      for (const name of ["--shadow-raised", "--shadow-grouped", "--shadow-modal"]) {
        expect(varValue(block, name).startsWith("0 0 0 0.5px")).toBe(true);
      }
    }
  });

  // Superseded contract: dark mode used to fake a lit top edge with an inset
  // highlight (`inset 0 1px 0 rgba(210,240,240,.06)`) because nothing but a
  // highlight reads as "lit" on a dark surface. The handoff replaces that
  // model outright — in both themes — with the hairline ring above.
  it("carries no inset lit edge in either theme", () => {
    for (const selector of [":root", ".dark"]) {
      const block = blockFor(selector);
      for (const name of ["--shadow-raised", "--shadow-grouped", "--shadow-modal"]) {
        expect(varValue(block, name)).not.toMatch(/inset/);
      }
    }
  });

  // Modal must read as a materially heavier elevation than raised — a much
  // larger blur/spread built on --shadow-lg rather than --shadow — so the
  // restore sheet and command palette (Phase 2) sit above everything else
  // rather than looking like just another card.
  it("makes modal distinguishable from raised", () => {
    for (const selector of [":root", ".dark"]) {
      const block = blockFor(selector);
      const raised = varValue(block, "--shadow-raised");
      const modal = varValue(block, "--shadow-modal");
      expect(modal).not.toBe(raised);
      expect(raised).toContain("var(--shadow)");
      expect(raised).not.toContain("var(--shadow-lg)");
      expect(modal).toContain("var(--shadow-lg)");
    }
  });

  // Grouped surfaces (inspector panes, sheet footers, chips) sit flush
  // rather than lifting off the canvas, so grouped gets the hairline ring
  // alone — no additional blur term.
  it("gives grouped only the hairline ring, with no additional blur shadow", () => {
    for (const selector of [":root", ".dark"]) {
      expect(varValue(blockFor(selector), "--shadow-grouped")).toBe("0 0 0 0.5px hsl(var(--border))");
    }
  });
});

// The hairline now arrives as a shadow, not a drawn edge — a reader could
// reasonably assume "hairline ring" means Surface grew a `border` utility.
// It must not have: `expectNoBorder`'s whole-token matching (src/test/no-box.ts)
// keeps holding for both variants. That assertion lives in
// src/components/ui/surface.test.tsx ("draws no border in either variant"),
// unchanged by this task — restated here only as a pointer, not a duplicate
// render, since this file has no React rendering setup of its own.
