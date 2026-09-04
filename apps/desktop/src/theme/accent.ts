// The accent choices (Settings › Appearance) and the mechanism that paints
// them onto the document root.
//
// Each accent has a light and a dark variant because the same hue needs
// different weight to stay legible on each surface — see `applyAccent`
// below, which is why `ACCENTS[id]` is keyed by theme rather than being one
// flat colour.
//
// Brand redesign (2026-09-03): Tangerine is the ember, the brand's one
// accent, and stays the default. Iris, Graphite and Sky are the quiet
// alternatives. Petrol and Sand are retired — a preference that still names
// either is migrated to Tangerine by `readPrefs` (src/store.ts), which
// treats any id not in this table as the default.

import { contrastRatio } from "./contrast";

export type AccentId = "tangerine" | "iris" | "graphite" | "sky";

/** Accent ids that used to exist. Listed so a test can prove they migrate,
 * and so nobody reintroduces one by accident. */
export const RETIRED_ACCENTS = ["petrol", "sand"] as const;

export interface AccentVariant {
  /** The accent's primary fill — buttons, selected rows, the live dot. */
  base: string;
  /** Hover state for `base`. */
  hover: string;
  /**
   * Accent-coloured text on an accent-soft background (e.g. the "Active"
   * status chip). The base is too dark/saturated for small text on light
   * surfaces — never reach for `base`/`--primary` for a label; use this.
   */
  text: string;
}

export const ACCENTS: Record<AccentId, { light: AccentVariant; dark: AccentVariant; label: string }> = {
  tangerine: {
    label: "Tangerine",
    light: { base: "#FF6B2C", hover: "#F0561A", text: "#C2501B" },
    dark: { base: "#FF6B2C", hover: "#FF7F45", text: "#FF8A5C" },
  },
  iris: {
    label: "Iris",
    light: { base: "#5558D9", hover: "#4448C8", text: "#4A4DC4" },
    dark: { base: "#7B7FF2", hover: "#8B8FF5", text: "#A3A6F7" },
  },
  graphite: {
    label: "Graphite",
    light: { base: "#2C2F3A", hover: "#1E2028", text: "#2C2F3A" },
    dark: { base: "#D9DBE3", hover: "#E8E9EF", text: "#D9DBE3" },
  },
  sky: {
    label: "Sky",
    light: { base: "#2E6F88", hover: "#245A70", text: "#2E6F88" },
    dark: { base: "#3E8DAB", hover: "#4A9DBC", text: "#7FC2DB" },
  },
};

/** `accent-soft` (chip/selection-tint backgrounds) alpha, per theme. */
const SOFT_ALPHA: Record<"light" | "dark", number> = { light: 0.14, dark: 0.2 };

/**
 * #RRGGBB -> bare "H S% L%" triplet, matching this codebase's convention for
 * solid colour custom properties (bound via `hsl(var(--x))` — see
 * src/theme/tokens.test.ts). Never wrap the result in `hsl(...)` yourself.
 */
function hexToHslTriplet(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/**
 * #RRGGBB + alpha -> a literal `rgba(...)`, matching this codebase's
 * convention for alpha-carrying custom properties (bound directly, never
 * through `hsl()` — see src/theme/tokens.test.ts).
 */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const a = String(alpha).replace(/^0\./, ".");
  return `rgba(${r},${g},${b},${a})`;
}

// Label candidates for text painted on a solid --primary button, in
// preference order, per theme. --primary-foreground cannot be one static
// value per theme: a dark label clears tangerine and graphite-dark, a light
// label clears iris-light and graphite-light, and no single colour serves
// both — so the label is resolved per accent from an ordered list, and the
// first candidate that clears WCAG AA wins. Order matters: an accent that
// already reads fine keeps the app's normal label colour rather than jumping
// to a more extreme one for no reason.
export const LABEL_CANDIDATES: Record<"light" | "dark", string[]> = {
  // "225 13% 6%" is --foreground's :root value (the ink); white is the
  // fallback for the two dark light-theme bases (iris, graphite).
  light: ["225 13% 6%", "0 0% 100%"],
  // "19 38% 8%" is --primary-foreground's .dark default; "240 14% 97%" is
  // --foreground's .dark value; pure black is the last resort.
  dark: ["19 38% 8%", "240 14% 97%", "0 0% 0%"],
};

// WCAG AA body-text minimum — matches BODY in contrast.test.ts.
const WCAG_AA_BODY = 4.5;

/**
 * Picks the first label candidate (see `LABEL_CANDIDATES`) that clears WCAG
 * AA (4.5:1) against a resolved `--primary` background. `base` must be a
 * bare "H S% L%" triplet, as produced by `hexToHslTriplet`.
 *
 * Falls back to the *best-available* candidate — the highest ratio among
 * all of them, not simply the first — if none clear the bar. That should
 * not happen for any accent in `ACCENTS` today (contrast.test.ts's accent
 * sweep asserts every accent/theme combination clears it), and this branch
 * carries its own direct test precisely because nothing else exercises it.
 */
function resolvePrimaryForeground(base: string, theme: "light" | "dark"): string {
  const candidates = LABEL_CANDIDATES[theme];
  const passing = candidates.find((candidate) => contrastRatio(candidate, base) >= WCAG_AA_BODY);
  if (passing) return passing;
  return candidates.reduce((best, candidate) =>
    contrastRatio(candidate, base) > contrastRatio(best, base) ? candidate : best
  );
}

// Exported for contrast.test.ts's direct fallback-branch test only — not
// meant as a general public API. Everything else should go through
// `applyAccent`, which is what the running app actually calls.
export { resolvePrimaryForeground };

/**
 * Writes the resolved accent's five custom properties onto `root` (defaults
 * to the document root): `--primary`/`--primary-foreground`/`--primary-hover`/
 * `--accent-text` as bare HSL triplets, `--accent-soft` as a literal rgba().
 * Each call to `setProperty` replaces the prior value outright, so switching
 * accents (or theme) never leaves a stale property behind.
 *
 * Must be re-run on every theme change, including an OS-level flip while the
 * user's theme pref is "system" — the variants differ per theme.
 *
 * If the provided `id` is not a valid AccentId (a retired accent, a corrupt
 * preference), falls back to the default accent (tangerine) rather than
 * throwing.
 */
export function applyAccent(
  id: AccentId,
  theme: "light" | "dark",
  root: HTMLElement = document.documentElement
): void {
  const accentId: AccentId = id in ACCENTS ? id : "tangerine";
  const variant = ACCENTS[accentId][theme];
  const primary = hexToHslTriplet(variant.base);
  root.style.setProperty("--primary", primary);
  root.style.setProperty("--primary-foreground", resolvePrimaryForeground(primary, theme));
  root.style.setProperty("--primary-hover", hexToHslTriplet(variant.hover));
  root.style.setProperty("--accent-text", hexToHslTriplet(variant.text));
  root.style.setProperty("--accent-soft", hexToRgba(variant.base, SOFT_ALPHA[theme]));
}
