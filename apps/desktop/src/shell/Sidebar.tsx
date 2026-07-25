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
            "group relative z-10 flex h-[38px] w-full items-center rounded-[8px] text-sm transition-colors duration-[120ms] ease-out",
            collapsed ? "justify-center px-0" : "gap-2.5 px-2.5",
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
      <div data-tauri-drag-region className="h-[52px] shrink-0" />

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
            "pointer-events-none absolute left-0 right-0 top-0 h-[38px] rounded-[8px] bg-sidebar-accent transition-[transform,opacity] duration-[160ms] ease-out",
            activeNavIndex < 0 && "opacity-0",
          )}
          style={{ transform: `translateY(${Math.max(activeNavIndex, 0) * ROW_STRIDE}px)` }}
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
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                "flex items-center rounded-[8px] py-2 text-xs text-sidebar-foreground/50",
                collapsed ? "justify-center px-0" : "gap-2 px-2.5",
              )}
            >
              {/* Neutral status dot — deliberately not emerald, so it isn't
                  read as an online/connected indicator. */}
              <span className="size-1.5 shrink-0 rounded-full bg-sidebar-foreground/35" />
              <span
                aria-hidden={collapsed}
                className={cn(
                  "overflow-hidden whitespace-nowrap transition-opacity duration-150",
                  collapsed && "w-0 opacity-0",
                )}
              >
                Data stored locally
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="right">
            Runs entirely on 127.0.0.1 — no cloud account, no telemetry.
          </TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}
