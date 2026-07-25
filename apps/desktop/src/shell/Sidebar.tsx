import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import markUrl from "@/assets/brand/rabta-mark.svg";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useStore, type NavKey } from "@/store";
import { NAV_ITEMS, SETTINGS_ITEM, type NavItem } from "./nav";

// Row height (38px) + column gap (4px). The moving selection indicator is
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
  const button = (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        "group relative z-10 flex h-[38px] w-full items-center rounded-[8px] text-sm transition-colors duration-[120ms] ease-out",
        collapsed ? "justify-center px-0" : "gap-2.5 px-2.5",
        active
          ? "text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground",
        // Settings paints its own petrol surface (no shared indicator).
        // Selected nav stays teal — orange is reserved for actions/brand.
        standalone && active && "bg-sidebar-accent",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span
        aria-hidden={collapsed}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden whitespace-nowrap transition-opacity duration-150 ease-out",
          collapsed && "pointer-events-none w-0 flex-none opacity-0",
        )}
      >
        <span className="flex-1 truncate text-left">{item.label}</span>
        <Kbd className="border-sidebar-foreground/15 bg-transparent text-sidebar-foreground/40 transition-colors duration-[120ms] group-hover:border-sidebar-foreground/25 group-hover:text-sidebar-foreground/60">
          {item.shortcut}
        </Kbd>
      </span>
    </button>
  );

  if (!collapsed) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

export function Sidebar() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useStore((s) => s.toggleSidebar);

  const go = (key: NavKey) => setView(key);

  const activeNavIndex = NAV_ITEMS.findIndex((item) => item.key === view);
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const toggleLabel = collapsed ? "Expand sidebar" : "Collapse sidebar";

  const logoButton = (
    <button
      type="button"
      onClick={() => go("overview")}
      aria-label="Rabta — go to Overview"
      className={cn(
        "flex items-center gap-2 rounded-[8px] transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        collapsed && "justify-center",
      )}
    >
      <img src={markUrl} alt="" className="size-6 shrink-0 rounded-[6px]" />
      <span
        aria-hidden={collapsed}
        className={cn(
          "overflow-hidden whitespace-nowrap text-sm font-semibold tracking-tight transition-opacity duration-150",
          collapsed && "w-0 opacity-0",
        )}
      >
        Rabta
      </span>
    </button>
  );

  const collapseButton = (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={toggleLabel}
          className="flex size-7 shrink-0 items-center justify-center rounded-[7px] text-sidebar-foreground/50 transition-colors duration-[120ms] hover:bg-sidebar-accent/50 hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <ToggleIcon className="size-[18px]" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{toggleLabel}</TooltipContent>
    </Tooltip>
  );

  return (
    <aside
      className={cn(
        "flex h-full flex-col bg-sidebar py-[18px] text-sidebar-foreground",
        collapsed ? "px-2.5" : "px-[13px]",
      )}
    >
      <div
        className={cn(
          "mb-5",
          collapsed ? "flex flex-col items-center gap-1.5" : "flex items-center justify-between gap-2 px-1.5",
        )}
      >
        {logoButton}
        {collapseButton}
      </div>

      <nav className="relative flex flex-1 flex-col gap-1">
        {/* One shared selection surface that slides between rows instead of
            being torn down and rebuilt on every navigation. */}
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
                "flex items-center rounded-[8px] py-2 text-xs text-sidebar-foreground/55",
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
