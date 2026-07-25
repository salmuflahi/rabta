import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import { Sidebar } from "./Sidebar";
import { Toolbar } from "./Toolbar";

// The overlay traffic lights sit at x≈19 and span to ~77px, so the frame
// collapse control lives just to their right. It's positioned against the
// window (not the sidebar), so it holds a fixed screen position across a
// collapse — and when the rail is narrow it sits over the ivory toolbar
// rather than forcing the petrol background to protrude past the rail.
const COLLAPSE_LEFT = 82;

/** Frame-level sidebar toggle, pinned beside the traffic lights. */
function SidebarToggle() {
  const collapsed = useStore((s) => s.sidebarCollapsed);
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
          style={{ left: COLLAPSE_LEFT }}
          className={cn(
            "absolute top-[11px] z-50 flex size-7 items-center justify-center rounded-[7px] transition-colors duration-[140ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            // Collapsed → the control is over the ivory toolbar (dark icon);
            // expanded → over the petrol sidebar (light icon).
            collapsed
              ? "text-muted-foreground hover:bg-accent hover:text-foreground"
              : "text-sidebar-foreground/55 hover:bg-white/10 hover:text-sidebar-foreground",
          )}
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
  const view = useStore((s) => s.view);

  return (
    // The grid columns are the single source of truth for the sidebar/main
    // boundary — one continuous vertical edge, no separate title-bar backing.
    // `overflow-hidden` + `min-h-0` on every region keep the shell fixed and
    // scroll only the workspace, so the sidebar never moves under the lights.
    <div
      className={cn(
        "relative grid h-full min-h-0 overflow-hidden transition-[grid-template-columns] duration-200 ease-out",
        collapsed ? "grid-cols-[72px_1fr]" : "grid-cols-[280px_1fr]",
      )}
    >
      <Sidebar />

      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <Toolbar />
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-background p-9">
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
