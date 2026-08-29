import { describe, expect, it } from "vitest";
import { ACCENTS, applyAccent, type AccentId } from "./accent";

const IDS: AccentId[] = ["tangerine", "iris", "sky", "sand"];

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

  // Default install must look exactly as it does today: tangerine's light
  // base is the existing --primary value (#FF6B2C, "18 100% 59%" in
  // src/index.css), and it is identical in both themes per the handoff.
  it("defaults to tangerine, whose light base equals today's --primary #FF6B2C", () => {
    expect(ACCENTS.tangerine.light.base).toBe("#FF6B2C");
    expect(ACCENTS.tangerine.dark.base).toBe("#FF6B2C");
  });

  // Values taken verbatim from the design handoff's Accent table.
  it("matches the handoff's accent table exactly", () => {
    expect(ACCENTS).toMatchObject({
      tangerine: {
        light: { base: "#FF6B2C", hover: "#F0561A", text: "#C2501B" },
        dark: { base: "#FF6B2C", hover: "#FF7F45", text: "#FF8A5C" },
      },
      // Ink redesign (2026-08): iris replaced the retired petrol accent.
      iris: {
        light: { base: "#5558D9", hover: "#4649C7", text: "#4F52CE" },
        dark: { base: "#7B7FF2", hover: "#8C90F5", text: "#A5A8F7" },
      },
      sky: {
        light: { base: "#2E6F88", hover: "#245A70", text: "#2E6F88" },
        dark: { base: "#3E8DAB", hover: "#4A9DBC", text: "#7FC2DB" },
      },
      sand: {
        light: { base: "#9A6A12", hover: "#7E560D", text: "#8A5F10" },
        dark: { base: "#C08A2A", hover: "#D19A36", text: "#DFB259" },
      },
    });
  });
});

describe("applyAccent", () => {
  function freshRoot(): HTMLElement {
    return document.createElement("div");
  }

  it("writes all four custom properties onto the root", () => {
    const root = freshRoot();
    applyAccent("tangerine", "light", root);
    for (const prop of ["--primary", "--primary-hover", "--accent-text", "--accent-soft"]) {
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
  // never wrapped in hsl(). Same split enforced for Task 1's tokens.
  it("writes --accent-soft as a literal rgba(), not an HSL triplet", () => {
    const root = freshRoot();
    applyAccent("iris", "light", root);
    const value = root.style.getPropertyValue("--accent-soft");
    expect(value).toMatch(/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*\.?\d+(\.\d+)?\s*\)$/);
  });

  // The default install's --primary must be byte-identical to today's value,
  // so switching to this accent mechanism doesn't repaint anything by
  // accident.
  it("applying the tangerine default in light theme reproduces today's --primary exactly", () => {
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

  // accent-soft alpha must differ by theme: 14% light, 20% dark (matching
  // Task 1's --ok-soft/--warn-soft convention of literal rgba()).
  it("accent-soft alpha is 14% in light and 20% in dark, for the same accent+base", () => {
    const light = freshRoot();
    const dark = freshRoot();
    applyAccent("sand", "light", light);
    applyAccent("sand", "dark", dark);
    const lightAlpha = light.style.getPropertyValue("--accent-soft").match(/,\s*([\d.]+)\s*\)$/)?.[1];
    const darkAlpha = dark.style.getPropertyValue("--accent-soft").match(/,\s*([\d.]+)\s*\)$/)?.[1];
    expect(Number(lightAlpha)).toBeCloseTo(0.14, 5);
    expect(Number(darkAlpha)).toBeCloseTo(0.2, 5);
  });

  // Switching accent must replace the written properties, not append to
  // them — setProperty always overwrites, but this pins the observable
  // behavior so a future refactor (e.g. to a single cssText blob) can't
  // regress it.
  it("switching accent replaces the custom properties rather than appending", () => {
    const root = freshRoot();
    applyAccent("tangerine", "light", root);
    const tangerinePrimary = root.style.getPropertyValue("--primary");
    applyAccent("sky", "light", root);
    const skyPrimary = root.style.getPropertyValue("--primary");
    expect(skyPrimary).not.toBe(tangerinePrimary);
    expect(skyPrimary).not.toContain(tangerinePrimary);
    expect(root.style.cssText.match(/--primary:/g)?.length).toBe(1);
  });
});
