import markUrl from "@/assets/brand/rabta-mark.svg";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useStore, type NavKey } from "@/store";
import { NAV_ITEMS, SETTINGS_ITEM, type NavItem } from "./nav";

// Row height (38px) + column gap (4px): the moving selection surface is
// translated by activeIndex * ROW_STRIDE to sit behind the active row.
const ROW_STRIDE = 42;

function NavRow({
  item,
  active,
  collapsed,
  standalone,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  /** Settings sits outside the moving-indicator group, so it paints its own
   * active surface instead of relying on the shared indicator. */
  standalone?: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-current={active ? "page" : undefined}
          aria-label={collapsed ? `${item.label} (${item.shortcut})` : undefined}
          className={cn(
            "group relative z-10 flex h-[38px] items-center rounded-[8px] text-sm transition-colors duration-[120ms] ease-out",
            // Collapsed: a centred, icon-sized hit area so the active/hover
            // surface stays a tidy pill in the wider rail (not a full-width bar).
            collapsed ? "mx-auto w-11 justify-center" : "w-full gap-2.5 px-2.5",
            active
              ? "text-sidebar-accent-foreground"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground",
            // Selected nav stays teal — orange is reserved for actions/brand.
            standalone && active && "bg-sidebar-accent",
          )}
        >
          <Icon className="size-4 shrink-0" />
          <span
            aria-hidden={collapsed}
            className={cn(
              "min-w-0 flex-1 truncate text-left transition-opacity duration-150 ease-out",
              collapsed && "pointer-events-none w-0 flex-none opacity-0",
            )}
          >
            {item.label}
          </span>
        </button>
      </TooltipTrigger>
      {/* Shortcut lives here now instead of a persistent badge. */}
      <TooltipContent side="right" className="flex items-center gap-3">
        <span>{item.label}</span>
        <span className="font-mono text-[11px] text-muted-foreground">{item.shortcut}</span>
      </TooltipContent>
    </Tooltip>
  );
}

export function Sidebar() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const fullscreen = useStore((s) => s.fullscreen);

  const go = (key: NavKey) => setView(key);
  const activeNavIndex = NAV_ITEMS.findIndex((item) => item.key === view);

  return (
    <aside
      className={cn(
        // Fixed, non-scrolling frame region: it fills the grid cell and clips
        // its own overflow so navigation never scrolls with the workspace.
        "flex h-full min-h-0 flex-col overflow-hidden border-r border-sidebar-border/60 bg-sidebar pb-[18px] text-sidebar-foreground",
        collapsed ? "px-2.5" : "px-[13px]",
      )}
    >
      {/* Title-bar strip: draggable space that sits under the overlay traffic
          lights and the frame collapse control (both rendered by AppShell). */}
      {/* Title-bar reservation: clears the traffic lights when windowed;
          in fullscreen there are none, so only a small top gap for the
          toggle + breathing room. */}
      <div data-tauri-drag-region className={cn("shrink-0", fullscreen ? "h-11" : "h-[52px]")} />

      {/* Branding — application identity only, never a navigation control. */}
      <div
        className={cn(
          "mb-7 mt-2 flex items-center gap-2 text-sidebar-foreground/85",
          collapsed ? "justify-center px-0" : "px-1.5",
        )}
      >
        <img src={markUrl} alt="Rabta" className="size-6 shrink-0 rounded-[6px]" />
        <span
          aria-hidden={collapsed}
          className={cn(
            "overflow-hidden whitespace-nowrap text-sm font-semibold tracking-tight transition-opacity duration-150",
            collapsed && "w-0 opacity-0",
          )}
        >
          Rabta
        </span>
      </div>

      <nav className="relative flex flex-1 flex-col gap-1">
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-0 h-[38px] rounded-[8px] bg-sidebar-accent transition-[transform,opacity] duration-[160ms] ease-out",
            collapsed ? "left-1/2 w-11" : "left-0 right-0",
            activeNavIndex < 0 && "opacity-0",
          )}
          style={{
            transform: collapsed
              ? `translate(-50%, ${Math.max(activeNavIndex, 0) * ROW_STRIDE}px)`
              : `translateY(${Math.max(activeNavIndex, 0) * ROW_STRIDE}px)`,
          }}
        />
        {NAV_ITEMS.map((item) => (
          <NavRow
            key={item.key}
            item={item}
            active={view === item.key}
            collapsed={collapsed}
            onClick={() => go(item.key)}
          />
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-1 border-t border-sidebar-border pt-2">
        <NavRow
          item={SETTINGS_ITEM}
          active={view === SETTINGS_ITEM.key}
          collapsed={collapsed}
          standalone
          onClick={() => go(SETTINGS_ITEM.key)}
        />
        {/* The local-storage status only reads with its label, so it's hidden
            entirely when collapsed rather than leaving a meaningless dot. */}
        {!collapsed && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2 rounded-[8px] px-2.5 py-2 text-xs text-sidebar-foreground/50">
                {/* Neutral status dot — deliberately not emerald, so it isn't
                    read as an online/connected indicator. */}
                <span className="size-1.5 shrink-0 rounded-full bg-sidebar-foreground/35" />
                <span className="overflow-hidden whitespace-nowrap">Data stored locally</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">
              Runs entirely on 127.0.0.1 — no cloud account, no telemetry.
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </aside>
  );
}
