// Console v2 Phase 4, Task 14 — WCAG contrast ratio computed straight from
// this app's colour tokens, rather than eyeballed once and left to drift.
// See contrast.test.ts, which asserts every text/background pairing the
// design handoff calls out; a future token edit that regresses one of them
// fails that suite instead of shipping unnoticed.
//
// Formula: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance

interface Hsl {
  h: number;
  s: number;
  l: number;
}

/**
 * Parses this codebase's bare custom-property shape, `"H S% L%"` (e.g.
 * `"240 3% 12%"` — see index.css and tokens.test.ts's "bare HSL triplet"
 * assertion). Throws on anything else — an rgba() literal or a `hsl(...)`
 * wrapper reaching here is a caller bug, not a value to guess at.
 */
function parseHslTriplet(value: string): Hsl {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/);
  if (!match) throw new Error(`not an "H S% L%" token: ${JSON.stringify(value)}`);
  const [, h, s, l] = match;
  return { h: Number(h), s: Number(s) / 100, l: Number(l) / 100 };
}

/** HSL (hue 0-360, saturation/lightness 0-1) -> sRGB, each channel 0-1. */
function hslToSrgb({ h, s, l }: Hsl): { r: number; g: number; b: number } {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hPrime = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hPrime % 2) - 1));
  const [r1, g1, b1] =
    hPrime < 1 ? [c, x, 0] :
    hPrime < 2 ? [x, c, 0] :
    hPrime < 3 ? [0, c, x] :
    hPrime < 4 ? [0, x, c] :
    hPrime < 5 ? [x, 0, c] :
    [c, 0, x];
  const m = l - c / 2;
  return { r: r1 + m, g: g1 + m, b: b1 + m };
}

/** WCAG relative luminance of an sRGB colour (each channel 0-1). */
function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const linearize = (channel: number) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * WCAG contrast ratio between two colours, each a bare `"H S% L%"` token
 * string (see `parseHslTriplet`). Argument order doesn't matter — the
 * result is `(lighter + 0.05) / (darker + 0.05)` regardless of which
 * argument is `fg` and which is `bg`.
 */
export function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(hslToSrgb(parseHslTriplet(fg)));
  const l2 = relativeLuminance(hslToSrgb(parseHslTriplet(bg)));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}
