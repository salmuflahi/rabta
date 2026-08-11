import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";
import { tokensIn } from "./tokens-source";
import { ACCENTS, applyAccent, LABEL_CANDIDATES, resolvePrimaryForeground, type AccentId } from "./accent";

// WCAG AA: 4.5:1 for body text, 3:1 for large text and UI components.
const BODY = 4.5;
const UI = 3;

const readTokens = (theme: "light" | "dark") => tokensIn(theme === "dark" ? ".dark" : ":root");

// tokensIn returns a Map (tokens-source.ts), not a plain object — look a
// token up or fail with a useful message, rather than silently handing
// contrastRatio an `undefined` and getting an unrelated parse error.
function get(tokens: Map<string, string>, name: string): string {
  const value = tokens.get(name);
  if (value === undefined) throw new Error(`token ${name} not found`);
  return value;
}

const PAIRS: Array<{ fg: string; bg: string; min: number; why: string }> = [
  { fg: "--foreground", bg: "--background", min: BODY, why: "body text" },
  { fg: "--muted-foreground", bg: "--background", min: BODY, why: "subtitles" },
  { fg: "--tertiary-foreground", bg: "--background", min: UI, why: "metadata and counts" },
  { fg: "--primary-foreground", bg: "--primary", min: BODY, why: "accent button label" },
  { fg: "--ok", bg: "--background", min: UI, why: "connected state" },
  { fg: "--bad", bg: "--background", min: UI, why: "disconnect and Never sees" },
  { fg: "--warn", bg: "--background", min: UI, why: "warnings" },
  { fg: "--sidebar-foreground", bg: "--sidebar", min: BODY, why: "sidebar labels" },
];

describe.each(["light", "dark"] as const)("%s theme contrast", (theme) => {
  const tokens = readTokens(theme);
  it.each(PAIRS)("$why meets $min:1", ({ fg, bg, min }) => {
    expect(contrastRatio(get(tokens, fg), get(tokens, bg))).toBeGreaterThanOrEqual(min);
  });
});

describe("contrastRatio", () => {
  it("is 21:1 for black on white", () => {
    expect(contrastRatio("0 0% 0%", "0 0% 100%")).toBeCloseTo(21, 1);
  });

  it("is 1:1 for a colour on itself", () => {
    expect(contrastRatio("210 40% 50%", "210 40% 50%")).toBeCloseTo(1, 2);
  });
});

// The --primary-foreground/--primary pair above only covers the *default*
// accent (tangerine) baked into :root/.dark. Settings -> Appearance offers
// four accents (src/theme/accent.ts); applyAccent() repaints --primary and
// --primary-foreground at runtime for whichever one is active, and the
// other three never appear in index.css at all — so the pair above cannot
// see them, and a pass there does not mean the app is accessible for
// everyone. Assert all four by actually calling applyAccent() and reading
// back what it wrote, exactly like the running app does, so a future accent
// hue edit that regresses legibility fails here instead of shipping.
describe.each(["light", "dark"] as const)("%s theme, every accent's button label", (theme) => {
  const ids = Object.keys(ACCENTS) as AccentId[];
  it.each(ids)("%s clears 4.5:1 against its own --primary", (id) => {
    const root = document.createElement("div");
    applyAccent(id, theme, root);
    const fg = root.style.getPropertyValue("--primary-foreground");
    const bg = root.style.getPropertyValue("--primary");
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(BODY);
  });
});

// Review follow-up — resolvePrimaryForeground's "nothing cleared the bar"
// branch (accent.ts) never fires for any of today's 8 real accent/theme
// combinations, so without a dedicated test it has zero coverage: a future
// edit to that branch could start returning an arbitrarily bad candidate
// and nothing above would catch it, since the sweep only ever exercises the
// passing path. This drives the resolver directly with a contrived base no
// real accent has, so the branch is covered and its behaviour — return the
// *best available* candidate, not just the first one tried — is pinned.
describe("resolvePrimaryForeground's fallback of last resort", () => {
  it("returns the best-available candidate, not just the first, when none clears the bar", () => {
    // Achromatic "0 0% 50%": both of light theme's candidates fail 4.5:1
    // against it (white ~3.98:1, --foreground ~4.20:1) — the "impossible"
    // band for this candidate pair is L 47%-51%, found by scanning; 50% is
    // comfortably inside it either way. Crucially the two don't fail
    // *equally* — otherwise "best available" and "just the first" would be
    // indistinguishable and this test would prove nothing.
    const contrivedBase = "0 0% 50%";
    const [first, second] = LABEL_CANDIDATES.light;
    const firstRatio = contrastRatio(first, contrivedBase);
    const secondRatio = contrastRatio(second, contrivedBase);
    expect(firstRatio).toBeLessThan(BODY);
    expect(secondRatio).toBeLessThan(BODY);
    expect(secondRatio).toBeGreaterThan(firstRatio);

    // The old (fixed) behaviour would have returned `first` unconditionally
    // — this asserts the actual best of the two, `second`, instead.
    expect(resolvePrimaryForeground(contrivedBase, "light")).toBe(second);
  });
});
