import { Icon } from "@/components/ui/icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EASE } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import {
  SIDEBAR_MOTION_MS,
  SIDEBAR_TITLEBAR_SPACER_HEIGHT_PX,
  SIDEBAR_TOGGLE_WIDTH_PX,
  sidebarToggleLeftPx,
} from "./titlebar";

/** The sidebar toggle — one control, drawn once, pinned over the window's
 * top-left corner by AppShell rather than by whichever chrome region
 * happens to be under it.
 *
 * It used to be rendered twice: by the Sidebar's own titlebar row while the
 * sidebar was open, and by the Toolbar while it was collapsed, with a
 * shared 73px geometry contract holding the two in the same spot. That
 * arrangement had two problems this component exists to remove:
 *
 *  1. **It vanished in fullscreen.** The Sidebar dropped its entire
 *     traffic-light row when macOS went fullscreen (no lights to reserve
 *     room for) — and that row was the only place the toggle lived while
 *     the sidebar was open, so fullscreen + open sidebar had no toggle at
 *     all.
 *  2. **It couldn't survive an animated collapse.** With the sidebar now
 *     sliding out rather than blinking away, two alternating instances
 *     would either both be on screen mid-animation or neither would.
 *
 * One absolutely-positioned instance is immune to both: it never unmounts,
 * never moves, and the handoff's "the sidebar toggle must not move between
 * states — this was an explicit requirement" holds by construction instead
 * of by two components agreeing on arithmetic.
 *
 * What still changes with state is its *tone*: expanded, it sits over the
 * sidebar's ink surface and takes the `--sidebar-*` tokens; collapsed,
 * it sits over the toolbar and takes the regular chrome tokens. The swap is
 * a plain class change with `transition-colors`, so it cross-fades over the
 * same duration the panel takes to leave.
 */
export function SidebarToggle() {
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const fullscreen = useStore((s) => s.fullscreen);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const label = collapsed ? "Show sidebar" : "Hide sidebar";

  return (
    <div
      // Centred in the titlebar strip, whose height is the Toolbar's own
      // minus its hairline — the same constant both columns build their
      // top row from, so the toggle is centred against the hairline rather
      // than against a number typed in twice.
      className="pointer-events-none absolute left-0 top-0 z-20 flex items-center"
      data-sidebar-toggle-rail
      style={{
        height: SIDEBAR_TITLEBAR_SPACER_HEIGHT_PX,
        paddingLeft: sidebarToggleLeftPx(fullscreen),
        // The inset transitions too, so entering or leaving fullscreen
        // slides the control across instead of teleporting it. Both halves
        // come from their module — the duration was already a constant while
        // the curve was retyped as a literal on this same line, which is how
        // a "shared" curve quietly stops being shared.
        transition: `padding-left ${SIDEBAR_MOTION_MS}ms ${EASE.mac}`,
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={label}
            style={{ width: SIDEBAR_TOGGLE_WIDTH_PX }}
            className={cn(
              "pointer-events-auto grid h-6 shrink-0 place-items-center rounded-md",
              "transition-colors duration-sidebar ease-mac focus-visible:outline-none focus-visible:ring-2",
              collapsed
                ? "text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                : "text-sidebar-foreground/55 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground focus-visible:ring-sidebar-ring",
            )}
          >
            {/* Icon reflects current state (sidebar visible vs. hidden), not
                the action the click performs — matches the handoff's
                #ic-sidebar-on / #ic-sidebar-off pairing. */}
            <Icon name={collapsed ? "sidebar-off" : "sidebar-on"} className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side={collapsed ? "bottom" : "right"} className="flex items-center gap-3">
          <span>{label}</span>
          <span className="font-mono text-[11px] text-muted-foreground">⌘\</span>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
