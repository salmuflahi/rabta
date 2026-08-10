import type { ThemePref } from "@/store";

/**
 * The theme actually in force right now — "system" resolved against the OS.
 *
 * Lifted out of ThemeProvider in Phase 2 because Settings' accent swatch
 * needs the same answer: `ACCENTS` is keyed by theme, so a swatch rendering
 * the preference verbatim would paint the light hexes while the window is
 * dark. Two copies of this would be two chances to disagree with the class
 * actually on `<html>`.
 *
 * Falls back to light if `matchMedia` is unavailable (jsdom, and any
 * environment that doesn't implement it) rather than throwing.
 */
export function resolveTheme(theme: ThemePref): "light" | "dark" {
  if (theme !== "system") return theme;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}
