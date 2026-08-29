import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStore, type Prefs } from "@/store";
import { ThemeProvider } from "./theme-provider";

/** A minimal, controllable `matchMedia` stub. Tracks change listeners per
 * query string and exposes `flip` to simulate an OS-level change — this is
 * how we drive the "(prefers-color-scheme: dark)" listener that
 * ThemeProvider registers when the theme pref is "system", the same
 * mechanism the accent repaint must hook into. */
function stubMatchMedia() {
  const listeners = new Map<string, Set<(e: { matches: boolean }) => void>>();
  const state = new Map<string, boolean>();
  window.matchMedia = vi.fn((query: string) => ({
    get matches() {
      return state.get(query) ?? false;
    },
    media: query,
    addEventListener: (_type: string, cb: (e: { matches: boolean }) => void) => {
      if (!listeners.has(query)) listeners.set(query, new Set());
      listeners.get(query)!.add(cb);
    },
    removeEventListener: (_type: string, cb: (e: { matches: boolean }) => void) => {
      listeners.get(query)?.delete(cb);
    },
  })) as unknown as typeof window.matchMedia;
  return {
    setMatches(query: string, matches: boolean) {
      state.set(query, matches);
    },
    flip(query: string, matches: boolean) {
      state.set(query, matches);
      listeners.get(query)?.forEach((cb) => cb({ matches }));
    },
  };
}

const DARK_MQ = "(prefers-color-scheme: dark)";

function setPrefs(partial: Partial<Prefs>) {
  useStore.setState((s) => ({ prefs: { ...s.prefs, ...partial } }));
}

describe("ThemeProvider accent wiring", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    document.documentElement.className = "";
    document.documentElement.removeAttribute("style");
  });

  afterEach(() => {
    cleanup();
    window.matchMedia = originalMatchMedia;
    document.documentElement.className = "";
    document.documentElement.removeAttribute("style");
  });

  it("applies the accent for the resolved theme on mount", () => {
    stubMatchMedia();
    setPrefs({ theme: "light", accent: "sky" });
    render(
      <ThemeProvider>
        <div />
      </ThemeProvider>
    );
    const primary = document.documentElement.style.getPropertyValue("--primary");
    expect(primary).not.toBe("");
    // sky's light base #2E6F88 — cross-checked against accent.test.ts's own
    // hex table, not re-derived here.
    expect(primary).toBe("197 49% 36%");
  });

  it("reapplies when the accent pref changes", () => {
    stubMatchMedia();
    setPrefs({ theme: "light", accent: "tangerine" });
    render(
      <ThemeProvider>
        <div />
      </ThemeProvider>
    );
    const before = document.documentElement.style.getPropertyValue("--primary");
    act(() => setPrefs({ accent: "sand" }));
    const after = document.documentElement.style.getPropertyValue("--primary");
    expect(after).not.toBe(before);
  });

  // The bug people always ship: the accent variants differ per theme, so an
  // explicit theme-pref flip (not just an OS "system" flip) must repaint it.
  it("reapplies the accent when the theme pref flips light -> dark", () => {
    stubMatchMedia();
    setPrefs({ theme: "light", accent: "iris" });
    render(
      <ThemeProvider>
        <div />
      </ThemeProvider>
    );
    const lightPrimary = document.documentElement.style.getPropertyValue("--primary");
    expect(lightPrimary).toBe("239 63% 59%"); // iris light base #5558D9

    act(() => setPrefs({ theme: "dark" }));
    const darkPrimary = document.documentElement.style.getPropertyValue("--primary");
    expect(darkPrimary).not.toBe(lightPrimary);
    expect(darkPrimary).toBe("238 82% 72%"); // iris dark base #7B7FF2
  });

  // The case the brief calls out specifically: on "system", an OS-level
  // dark-mode flip must repaint the accent too, not just the theme class.
  it("reapplies the accent when the OS flips light -> dark while on system theme", () => {
    const mm = stubMatchMedia();
    mm.setMatches(DARK_MQ, false);
    setPrefs({ theme: "system", accent: "sky" });
    render(
      <ThemeProvider>
        <div />
      </ThemeProvider>
    );
    expect(document.documentElement.classList.contains("light")).toBe(true);
    const lightPrimary = document.documentElement.style.getPropertyValue("--primary");
    expect(lightPrimary).toBe("197 49% 36%"); // sky light base #2E6F88

    act(() => mm.flip(DARK_MQ, true));

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    const darkPrimary = document.documentElement.style.getPropertyValue("--primary");
    expect(darkPrimary).not.toBe(lightPrimary);
    expect(darkPrimary).toBe("197 47% 46%"); // sky dark base #3E8DAB
  });

  it("defaults to tangerine and matches today's --primary in light theme", () => {
    stubMatchMedia();
    setPrefs({ theme: "light", accent: "tangerine" });
    render(
      <ThemeProvider>
        <div />
      </ThemeProvider>
    );
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe("18 100% 59%");
  });
});
