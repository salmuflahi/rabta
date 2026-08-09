import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");
const tailwindConfig = readFileSync(resolve(__dirname, "../../tailwind.config.js"), "utf8");

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

// Console v2 Phase 1, Task 1 — semantic (ok/warn/bad) and surface (field,
// hover, shadow, shadow-lg, scrim) tokens from the design handoff.
//
// These split into two kinds and the split matters:
//   - Solid colours (ok, warn, bad, field) are bound through `hsl(var(--x))`
//     in tailwind.config.js, so — exactly like the existing REQUIRED tokens
//     above — they MUST be bare HSL triplets. `* { @apply border-border }`
//     in index.css means a raw rgba() landing in one of these compiles to
//     `hsl(rgba(...))` and silently breaks every utility that uses it.
//   - Alpha-carrying overlays (ok-soft, warn-soft, hover, shadow,
//     shadow-lg, scrim) are literal rgba(...) values bound *directly*,
//     never through hsl(). They must never collapse into the triplet form.
//
// Both directions are asserted below so neither kind can drift into the
// other's shape without a test failing.
describe("Console v2 semantic and surface tokens (Task 1)", () => {
  const light = tokensIn(":root");
  const dark = tokensIn(".dark");

  const HSL_TRIPLET = /^\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%$/;
  const RGBA_LITERAL = /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*\.?\d+(\.\d+)?\s*\)$/;

  const HSL_TOKENS = ["--ok", "--warn", "--bad", "--field"];
  const RGBA_TOKENS = ["--ok-soft", "--warn-soft", "--hover", "--shadow", "--shadow-lg", "--scrim"];

  it.each(HSL_TOKENS)("defines %s in both themes", (token) => {
    expect(light.has(token)).toBe(true);
    expect(dark.has(token)).toBe(true);
  });

  it.each(RGBA_TOKENS)("defines %s in both themes", (token) => {
    expect(light.has(token)).toBe(true);
    expect(dark.has(token)).toBe(true);
  });

  it.each(HSL_TOKENS)("%s is a bare HSL triplet, not an rgba literal", (token) => {
    for (const map of [light, dark]) {
      const value = (map.get(token) ?? "").replace(/\/\*.*?\*\//g, "").trim();
      expect(value).toMatch(HSL_TRIPLET);
      expect(value).not.toMatch(RGBA_LITERAL);
    }
  });

  it.each(RGBA_TOKENS)("%s is a literal rgba(...), not an HSL triplet", (token) => {
    for (const map of [light, dark]) {
      const value = (map.get(token) ?? "").replace(/\/\*.*?\*\//g, "").trim();
      expect(value).toMatch(RGBA_LITERAL);
      expect(value).not.toMatch(HSL_TRIPLET);
    }
  });

  it.each(HSL_TOKENS)("binds %s through hsl(var(--x)) in tailwind.config.js", (token) => {
    const name = token.slice(2); // strip leading --
    expect(tailwindConfig).toMatch(new RegExp(`hsl\\(var\\(--${name}\\)\\)`));
  });

  it.each(RGBA_TOKENS)("binds %s directly, never wrapped in hsl(), in tailwind.config.js", (token) => {
    const name = token.slice(2);
    expect(tailwindConfig).toMatch(new RegExp(`var\\(--${name}\\)`));
    expect(tailwindConfig).not.toMatch(new RegExp(`hsl\\(var\\(--${name}\\)\\)`));
  });
});
