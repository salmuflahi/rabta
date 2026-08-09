// Console v2 Phase 1, Task 2 — the four accent choices (Settings ›
// Appearance) and the mechanism that paints them onto the document root.
//
// Values are verbatim from the design handoff's Accent table. Each accent
// has a light and a dark variant because the same hue needs different
// weight to stay legible on each surface — see `applyAccent` below, which
// is why `ACCENTS[id]` is keyed by theme rather than being one flat colour.

export type AccentId = "tangerine" | "petrol" | "sky" | "sand";

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
  petrol: {
    label: "Petrol",
    light: { base: "#14494C", hover: "#0E3739", text: "#14494C" },
    dark: { base: "#2E8286", hover: "#379A9E", text: "#67BFC2" },
  },
  sky: {
    label: "Sky",
    light: { base: "#2E6F88", hover: "#245A70", text: "#2E6F88" },
    dark: { base: "#3E8DAB", hover: "#4A9DBC", text: "#7FC2DB" },
  },
  sand: {
    label: "Sand",
    light: { base: "#9A6A12", hover: "#7E560D", text: "#8A5F10" },
    dark: { base: "#C08A2A", hover: "#D19A36", text: "#DFB259" },
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

/**
 * Writes the resolved accent's four custom properties onto `root` (defaults
 * to the document root): `--primary`/`--primary-hover`/`--accent-text` as
 * bare HSL triplets, `--accent-soft` as a literal rgba(). Each call to
 * `setProperty` replaces the prior value outright, so switching accents (or
 * theme) never leaves a stale property behind.
 *
 * Must be re-run on every theme change, including an OS-level flip while the
 * user's theme pref is "system" — the variants differ per theme, so a theme
 * flip with no re-application would leave the accent showing the wrong
 * theme's colours.
 *
 * If the provided `id` is not a valid AccentId, falls back to the default
 * accent (tangerine) rather than throwing. This ensures the app is resilient
 * to corrupted or stale persisted preferences.
 */
export function applyAccent(
  id: AccentId,
  theme: "light" | "dark",
  root: HTMLElement = document.documentElement
): void {
  // Validate id is a key in ACCENTS; fall back to default if not
  const accentId: AccentId = id in ACCENTS ? id : "tangerine";
  const variant = ACCENTS[accentId][theme];
  root.style.setProperty("--primary", hexToHslTriplet(variant.base));
  root.style.setProperty("--primary-hover", hexToHslTriplet(variant.hover));
  root.style.setProperty("--accent-text", hexToHslTriplet(variant.text));
  root.style.setProperty("--accent-soft", hexToRgba(variant.base, SOFT_ALPHA[theme]));
}
