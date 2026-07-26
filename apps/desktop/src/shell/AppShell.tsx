import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import { Sidebar } from "./Sidebar";
import { Toolbar } from "./Toolbar";

// The overlay traffic lights are centred over the collapsed rail
// (trafficLightPosition x≈27, spanning to ~85px); the frame collapse control
// sits just to their right in the rail's top-right. It's positioned against
// the window (not the sidebar) so it keeps a fixed screen position across a
// collapse, and the rail is wide enough that both stay on petrol in either
// state — no ivory spill, no petrol protrusion. In fullscreen there are no
// traffic lights, so the control moves to the natural top-left header spot.
function toggleLeft(fullscreen: boolean, collapsed: boolean): number {
  if (!fullscreen) return 90; // windowed: to the right of the traffic lights
  return collapsed ? 20 : 16; // fullscreen: centred in the narrow rail / top-left
}

/** Frame-level sidebar toggle. Beside the traffic lights when windowed; a
 * plain top-left header control in fullscreen. */
function SidebarToggle() {
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const fullscreen = useStore((s) => s.fullscreen);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const label = collapsed ? "Show Sidebar" : "Hide Sidebar";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={label}
          style={{ left: toggleLeft(fullscreen, collapsed) }}
          // Always over the petrol rail, so a light icon.
          className="absolute top-[13px] z-50 flex size-7 items-center justify-center rounded-[7px] text-sidebar-foreground/55 transition-[left,color,background-color] duration-[160ms] hover:bg-white/10 hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <Icon className="size-[18px]" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const fullscreen = useStore((s) => s.fullscreen);
  const view = useStore((s) => s.view);

  // Collapsed rail: wide enough to centre the traffic lights when windowed,
  // but a plain narrow icon rail in fullscreen (no lights to accommodate).
  const cols = collapsed
    ? fullscreen
      ? "grid-cols-[68px_minmax(0,1fr)]"
      : "grid-cols-[116px_minmax(0,1fr)]"
    : "grid-cols-[280px_minmax(0,1fr)]";

  return (
    // The grid columns are the single source of truth for the sidebar/main
    // boundary — one continuous vertical edge, no separate title-bar backing.
    // `overflow-hidden` + `min-h-0` on every region keep the shell fixed and
    // scroll only the workspace, so the sidebar never moves under the lights.
    <div
      className={cn(
        "relative grid h-full min-h-0 overflow-hidden transition-[grid-template-columns] duration-200 ease-out",
        cols,
      )}
    >
      <Sidebar />

      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <Toolbar />
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-x-none bg-background p-9">
          {/* Only the workspace scrolls / transitions; the frame is fixed. */}
          <div key={view} className="animate-page-in">
            {children}
          </div>
        </main>
      </div>

      <SidebarToggle />
    </div>
  );
}
