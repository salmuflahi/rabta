import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");

/** Extract the `--name: value;` pairs inside a given selector block. */
function tokensIn(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`selector ${selector} not found in index.css`);
  let depth = 0;
  let end = start;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = css.slice(start, end);
  const out = new Map<string, string>();
  for (const m of body.matchAll(/(--[a-z-]+):\s*([^;]+);/g)) {
    out.set(m[1], m[2].trim());
  }
  return out;
}

const REQUIRED = [
  "--sidebar",
  "--background",
  "--card",
  "--muted",
  "--foreground",
  "--muted-foreground",
  "--tertiary-foreground",
  "--border",
  "--primary",
  "--primary-foreground",
];

describe("colour tokens", () => {
  const light = tokensIn(":root");
  const dark = tokensIn(".dark");

  it.each(REQUIRED)("defines %s in both themes", (token) => {
    expect(light.has(token)).toBe(true);
    expect(dark.has(token)).toBe(true);
  });

  // --border is the default border-colour for every element via
  // `* { @apply border-border }` in index.css. A raw rgba() here would
  // compile to hsl(rgba(...)) and break every border utility in the app.
  it.each(REQUIRED)("%s is a bare HSL triplet, not a colour function", (token) => {
    for (const map of [light, dark]) {
      const value = (map.get(token) ?? "").replace(/\/\*.*?\*\//g, "").trim();
      expect(value).toMatch(/^\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%$/);
    }
  });

  it("keeps the dark canvas darker than its raised surface", () => {
    const lightnessOf = (v: string) => Number(v.split(/\s+/)[2].replace("%", ""));
    expect(lightnessOf(dark.get("--background")!)).toBeLessThan(
      lightnessOf(dark.get("--card")!),
    );
  });

  // The macOS convention: the sidebar is darker than the content area.
  it("keeps the dark sidebar darker than the canvas", () => {
    const lightnessOf = (v: string) => Number(v.split(/\s+/)[2].replace("%", ""));
    expect(lightnessOf(dark.get("--sidebar")!)).toBeLessThan(
      lightnessOf(dark.get("--background")!),
    );
  });

  it("keeps secondary and muted distinct in both themes", () => {
    expect(light.get("--secondary")).not.toBe(light.get("--muted"));
    expect(dark.get("--secondary")).not.toBe(dark.get("--muted"));
  });
});
