import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import { Sidebar } from "./Sidebar";
import { Toolbar } from "./Toolbar";

// The window uses an overlay title bar with the macOS traffic lights at
// x≈19. They span to ~73px, so the frame collapse control sits just to their
// right and — because it's positioned against the window, not the sidebar —
// stays put when the sidebar width changes.
const COLLAPSE_LEFT = 80;
// A petrol title strip that never narrows below this keeps the traffic lights
// and the fixed toggle over the sidebar colour even when the rail collapses.
const TITLE_ZONE_MIN = 116;

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
          className="absolute top-[11px] z-50 flex size-7 items-center justify-center rounded-[7px] text-sidebar-foreground/55 transition-colors duration-[140ms] hover:bg-white/10 hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
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
    <div
      className={cn(
        "relative grid h-full min-h-0 transition-[grid-template-columns] duration-200 ease-out",
        collapsed ? "grid-cols-[72px_1fr]" : "grid-cols-[280px_1fr]",
      )}
    >
      {/* Petrol title-bar backing: keeps the top-left corner (traffic lights +
          fixed toggle) on sidebar colour, and never narrows past the toggle. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 z-30 h-[52px] bg-sidebar transition-[width] duration-200 ease-out"
        style={{ width: collapsed ? TITLE_ZONE_MIN : 280 }}
      />

      <Sidebar />

      <div className="flex min-w-0 flex-col">
        <Toolbar />
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-background p-9">
          {/* Only the workspace transitions between pages; the frame is fixed. */}
          <div key={view} className="animate-page-in">
            {children}
          </div>
        </main>
      </div>

      <SidebarToggle />
    </div>
  );
}
