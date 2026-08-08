import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import config from "../../tailwind.config.js";

const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");
const shadows = (config as any).theme.extend.boxShadow as Record<string, string>;

function blockFor(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  const end = css.indexOf("\n  }", start);
  return css.slice(start, end);
}

describe("elevation", () => {
  it("exposes raised and grouped shadows through CSS variables", () => {
    expect(shadows.raised).toBe("var(--shadow-raised)");
    expect(shadows.grouped).toBe("var(--shadow-grouped)");
  });

  it("defines both elevation variables in both themes", () => {
    for (const selector of [":root", ".dark"]) {
      const block = blockFor(selector);
      expect(block).toMatch(/--shadow-raised:/);
      expect(block).toMatch(/--shadow-grouped:/);
    }
  });

  // The lit top edge is what makes a dark surface read as a lit plane
  // rather than an outlined box.
  it("gives dark surfaces a lit top edge", () => {
    expect(blockFor(".dark")).toMatch(/--shadow-raised:\s*inset 0 1px 0/);
  });

  // On a white surface there is nothing brighter than white to catch the
  // light, so the inset highlight is invisible. Light mode carries its
  // depth on shadow alone.
  it("does not attempt a lit edge in light mode", () => {
    const raised = blockFor(":root").match(/--shadow-raised:([^;]+);/)?.[1] ?? "";
    expect(raised).not.toMatch(/inset/);
  });
});
