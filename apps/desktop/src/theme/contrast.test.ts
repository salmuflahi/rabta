import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";
import { tokensIn } from "./tokens-source";
import { ACCENTS, applyAccent, type AccentId } from "./accent";

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
