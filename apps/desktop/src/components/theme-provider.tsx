import { useEffect, useLayoutEffect } from "react";
import { prefersReducedMotion } from "@/lib/motion";
import { useStore, type ThemePref } from "@/store";

function resolveTheme(theme: ThemePref): "light" | "dark" {
  if (theme !== "system") return theme;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

/**
 * Applies the resolved color theme and the motion preference to the document
 * root, driven by the persisted prefs in the store. "system" follows the OS
 * live (prefers-color-scheme / prefers-reduced-motion). No context — reads the
 * store directly so `useTheme` stays a thin store binding.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useStore((s) => s.prefs.theme);
  const motion = useStore((s) => s.prefs.motion);

  // Color theme (layout effect to avoid a flash), + live OS changes on "system".
  useLayoutEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      root.classList.remove("light", "dark");
      root.classList.add(resolveTheme(theme));
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
  }, [theme]);

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
