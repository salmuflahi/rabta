import { useEffect, useLayoutEffect } from "react";
import { prefersReducedMotion } from "@/lib/motion";
import { applyAccent } from "@/theme/accent";
import { resolveTheme } from "@/theme/resolve";
import { useStore, type ThemePref } from "@/store";

/**
 * Applies the resolved color theme, the accent, and the motion preference to
 * the document root, driven by the persisted prefs in the store. "system"
 * follows the OS live (prefers-color-scheme / prefers-reduced-motion). No
 * context — reads the store directly so `useTheme` stays a thin store
 * binding.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useStore((s) => s.prefs.theme);
  const accent = useStore((s) => s.prefs.accent);
  const motion = useStore((s) => s.prefs.motion);

  // Color theme (layout effect to avoid a flash), + live OS changes on
  // "system". The accent's variants differ per theme (src/theme/accent.ts),
  // so `applyAccent` is re-run from inside the SAME `apply()` closure that
  // resolves the theme — on mount, on every theme/accent-pref change, and on
  // a live OS dark-mode flip while the pref is "system" — rather than from a
  // separate effect that would miss the OS-flip case.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const resolved = resolveTheme(theme);
      root.classList.remove("light", "dark");
      root.classList.add(resolved);
      applyAccent(accent, resolved, root);
    };
    apply();
    if (theme !== "system") return;
    try {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    } catch {
      /* ignore */
    }
  }, [theme, accent]);

  // Motion preference → data-motion="reduced" (own setting, or "system" + OS
  // prefers-reduced-motion). index.css keys reduced transitions off this.
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      root.setAttribute("data-motion", prefersReducedMotion(motion) ? "reduced" : "full");
    };
    apply();
    if (motion !== "system") return;
    try {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    } catch {
      /* ignore */
    }
  }, [motion]);

  return <>{children}</>;
}

/** Thin binding to the persisted theme preference. */
export function useTheme() {
  const theme = useStore((s) => s.prefs.theme);
  const setPref = useStore((s) => s.setPref);
  return { theme, setTheme: (t: ThemePref) => setPref("theme", t) };
}
