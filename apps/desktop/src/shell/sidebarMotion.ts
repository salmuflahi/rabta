import { useEffect, useState } from "react";
import { useStore } from "@/store";
import { SIDEBAR_MOTION_MS } from "./titlebar";

/** Whether the sidebar's *contents* should be in the document right now.
 *
 * `sidebarCollapsed` alone can't answer this once collapsing is animated.
 * The panel takes SIDEBAR_MOTION_MS to slide out, and an empty petrol box
 * sliding away is not the same picture as the sidebar sliding away — the
 * nav has to still be in it. So presence lags the flag on the way out and
 * leads it on the way in:
 *
 *   expand:   present ─┐ flips true immediately, then the track widens
 *   collapse: present ─┘ stays true for the whole slide, then unmounts
 *
 * Unmounting at the end (rather than leaving the content parked at zero
 * width) is what keeps the collapsed sidebar's contract from Phase 1
 * intact: collapsed means *gone* — no labels, no focusable buttons hiding
 * in a box with no visible extent.
 *
 * Under reduced motion the CSS transition is neutralised globally
 * (index.css) but this timer still runs, so the content lingers, invisible
 * and inert, at zero width for the same 280ms. That's deliberate: it costs
 * nothing visually, and making the timer conditional would mean this hook
 * had to track both the OS preference and the app's own Motion setting to
 * stay in sync with a stylesheet that already handles them.
 */
export function useSidebarPresence(): boolean {
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const [present, setPresent] = useState(!collapsed);

  useEffect(() => {
    if (!collapsed) {
      setPresent(true);
      return;
    }
    const id = window.setTimeout(() => setPresent(false), SIDEBAR_MOTION_MS);
    return () => window.clearTimeout(id);
  }, [collapsed]);

  return present;
}
