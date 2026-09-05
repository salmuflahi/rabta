import { describe, expect, it } from "vitest";
import { ACCENTS, RETIRED_ACCENTS, applyAccent, type AccentId } from "./accent";

const IDS: AccentId[] = ["tangerine", "iris", "graphite", "sky"];

describe("ACCENTS table", () => {
  it.each(IDS)("resolves %s in both themes", (id) => {
    expect(ACCENTS[id].light).toBeDefined();
    expect(ACCENTS[id].dark).toBeDefined();
    for (const variant of [ACCENTS[id].light, ACCENTS[id].dark]) {
      expect(variant.base).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(variant.hover).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(variant.text).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("has a human label for each id", () => {
    for (const id of IDS) {
      expect(typeof ACCENTS[id].label).toBe("string");
      expect(ACCENTS[id].label.length).toBeGreaterThan(0);
    }
  });

  it("offers exactly the four accents the redesign kept", () => {
    expect(Object.keys(ACCENTS).sort()).toEqual([...IDS].sort());
  });

  // The ember is the brand's accent (the mark's leg, the site's one CTA)
  // and it is identical in both themes.
  it("defaults to tangerine, whose base is the brand ember #FF6B2C in both themes", () => {
    expect(ACCENTS.tangerine.light.base).toBe("#FF6B2C");
    expect(ACCENTS.tangerine.dark.base).toBe("#FF6B2C");
  });

  // Petrol is gone on every surface of the brand. Nothing in the table may
  // reintroduce a teal, and the retired ids must not resolve.
  it("has retired petrol and sand", () => {
    expect(RETIRED_ACCENTS).toEqual(["petrol", "sand"]);
    for (const id of RETIRED_ACCENTS) {
      expect(id in ACCENTS).toBe(false);
    }
    expect(JSON.stringify(ACCENTS).toUpperCase()).not.toContain("#14494C");
    expect(JSON.stringify(ACCENTS).toUpperCase()).not.toContain("#2E8286");
  });
});

describe("applyAccent", () => {
  function freshRoot(): HTMLElement {
    return document.createElement("div");
  }

  it("writes all five custom properties onto the root", () => {
    const root = freshRoot();
    applyAccent("tangerine", "light", root);
    for (const prop of ["--primary", "--primary-foreground", "--primary-hover", "--accent-text", "--accent-soft"]) {
      expect(root.style.getPropertyValue(prop)).not.toBe("");
    }
  });

  // Solid colours are bare HSL triplets (bound via hsl(var(--x)) — see
  // src/theme/tokens.test.ts), never a colour function.
  it("writes --primary, --primary-hover and --accent-text as bare HSL triplets", () => {
    const root = freshRoot();
    applyAccent("sky", "dark", root);
    const HSL_TRIPLET = /^\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%$/;
    expect(root.style.getPropertyValue("--primary")).toMatch(HSL_TRIPLET);
    expect(root.style.getPropertyValue("--primary-hover")).toMatch(HSL_TRIPLET);
    expect(root.style.getPropertyValue("--accent-text")).toMatch(HSL_TRIPLET);
  });

  // --accent-soft carries alpha, so it is a literal rgba(), bound directly —
  // never wrapped in hsl().
  it("writes --accent-soft as a literal rgba(), not an HSL triplet", () => {
    const root = freshRoot();
    applyAccent("iris", "light", root);
    const value = root.style.getPropertyValue("--accent-soft");
    expect(value).toMatch(/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*\.?\d+(\.\d+)?\s*\)$/);
  });

  // The default install's --primary must be byte-identical to the ember's
  // triplet in index.css, so the static paint before ThemeProvider runs and
  // the painted value after it agree.
  it("applying the tangerine default reproduces index.css's --primary exactly", () => {
    const root = freshRoot();
    applyAccent("tangerine", "light", root);
    expect(root.style.getPropertyValue("--primary")).toBe("18 100% 59%");
  });

  // The whole reason ACCENTS[id] is keyed by theme: the same accent has
  // different values per theme, so re-applying with a different theme must
  // change the written values.
  it("the same accent id resolves to different values per theme", () => {
    const light = freshRoot();
    const dark = freshRoot();
    applyAccent("iris", "light", light);
    applyAccent("iris", "dark", dark);
    expect(light.style.getPropertyValue("--primary")).not.toBe(dark.style.getPropertyValue("--primary"));
    expect(light.style.getPropertyValue("--accent-soft")).not.toBe(dark.style.getPropertyValue("--accent-soft"));
  });

  it("accent-soft alpha is 14% in light and 20% in dark, for the same accent+base", () => {
    const light = freshRoot();
    const dark = freshRoot();
    applyAccent("graphite", "light", light);
    applyAccent("graphite", "dark", dark);
    const lightAlpha = light.style.getPropertyValue("--accent-soft").match(/,\s*([\d.]+)\s*\)$/)?.[1];
    const darkAlpha = dark.style.getPropertyValue("--accent-soft").match(/,\s*([\d.]+)\s*\)$/)?.[1];
    expect(Number(lightAlpha)).toBeCloseTo(0.14, 5);
    expect(Number(darkAlpha)).toBeCloseTo(0.2, 5);
  });

  // Graphite is the one accent whose light and dark bases invert (dark on
  // paper, paper on ink), which is exactly the case the per-accent label
  // resolution exists for.
  it("gives graphite a light label on paper and a dark label on ink", () => {
    const light = freshRoot();
    const dark = freshRoot();
    applyAccent("graphite", "light", light);
    applyAccent("graphite", "dark", dark);
    expect(light.style.getPropertyValue("--primary-foreground")).toBe("0 0% 100%");
    expect(dark.style.getPropertyValue("--primary-foreground")).toBe("19 38% 8%");
  });

  it("migrates a retired accent to the default rather than throwing", () => {
    for (const retired of RETIRED_ACCENTS) {
      const root = freshRoot();
      const expected = freshRoot();
      expect(() => applyAccent(retired as unknown as AccentId, "light", root)).not.toThrow();
      applyAccent("tangerine", "light", expected);
      expect(root.style.getPropertyValue("--primary")).toBe(expected.style.getPropertyValue("--primary"));
    }
  });
});
