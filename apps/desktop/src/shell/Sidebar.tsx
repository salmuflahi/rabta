import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import markUrl from "@/assets/brand/rabta-mark.svg";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useStore, type NavKey } from "@/store";
import { NAV_ITEMS, SETTINGS_ITEM, type NavItem } from "./nav";

function NavRow({
  item,
  active,
  collapsed,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  const button = (
    <button
      type="button"
      onClick={onClick}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        "flex h-[38px] w-full items-center rounded-[8px] text-sm transition-[background-color,color] duration-150 ease-brand active:scale-[0.99]",
        collapsed ? "justify-center px-0" : "gap-2.5 px-2.5",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span
        aria-hidden={collapsed}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden whitespace-nowrap transition-opacity duration-200 ease-brand",
          collapsed && "pointer-events-none w-0 flex-none opacity-0"
        )}
      >
        <span className="flex-1 truncate text-left">{item.label}</span>
        <Kbd className="border-sidebar-foreground/20 bg-transparent text-sidebar-foreground/50">
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

  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const toggleLabel = collapsed ? "Expand Sidebar" : "Collapse Sidebar";
  const toggleButton = (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label={toggleLabel}
      className={cn(
        "flex h-[38px] w-full items-center rounded-[8px] text-sm text-sidebar-foreground/60 transition-[background-color,color] duration-150 ease-brand hover:bg-sidebar-accent/50 hover:text-sidebar-foreground active:scale-[0.99]",
        collapsed ? "justify-center px-0" : "gap-2.5 px-2.5"
      )}
    >
      <ToggleIcon className="size-4 shrink-0" />
      <span
        aria-hidden={collapsed}
        className={cn(
          "flex-1 overflow-hidden whitespace-nowrap text-left transition-opacity duration-200 ease-brand",
          collapsed && "pointer-events-none w-0 flex-none opacity-0"
        )}
      >
        {toggleLabel}
      </span>
    </button>
  );

  return (
    <aside
      className={cn(
        "flex h-full flex-col bg-sidebar py-[18px] text-sidebar-foreground",
        collapsed ? "px-2" : "px-[13px]"
      )}
    >
      <div className={cn("mb-6 flex items-center gap-2", collapsed ? "justify-center px-0" : "px-2.5")}>
        <img src={markUrl} alt="" className="size-6 shrink-0 rounded-[6px]" />
        <span
          aria-hidden={collapsed}
          className={cn(
            "overflow-hidden whitespace-nowrap text-sm font-semibold tracking-tight transition-opacity duration-200 ease-brand",
            collapsed && "w-0 opacity-0"
          )}
        >
          Rabta
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
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
          onClick={() => go(SETTINGS_ITEM.key)}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            {collapsed ? (
              <div className="flex items-center justify-center rounded-[8px] px-0 py-2 text-xs text-sidebar-foreground/60">
                <span className="size-1.5 rounded-full bg-success" />
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-[8px] px-2.5 py-2 text-xs text-sidebar-foreground/60">
                <span className="size-1.5 rounded-full bg-success" />
                Local only
              </div>
            )}
          </TooltipTrigger>
          <TooltipContent side="right">
            Runs entirely on 127.0.0.1 — no cloud account, no telemetry.
          </TooltipContent>
        </Tooltip>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>{toggleButton}</TooltipTrigger>
            <TooltipContent side="right">{toggleLabel}</TooltipContent>
          </Tooltip>
        ) : (
          toggleButton
        )}
      </div>
    </aside>
  );
}
