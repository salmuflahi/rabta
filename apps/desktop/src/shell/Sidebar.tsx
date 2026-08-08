import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useStore, type NavKey } from "@/store";
import { NAV_ITEMS, SETTINGS_ITEM, type NavItem } from "./nav";
import {
  SIDEBAR_TITLEBAR_DIVIDER_HEIGHT_CLASS,
  SIDEBAR_TITLEBAR_SPACER_HEIGHT_CLASS,
} from "./titlebar";

// Row height (h-[25px]) + nav gap (gap-1 = 4px): the moving selection
// surface is translated by activeIndex * ROW_STRIDE to sit behind the active
// row.
const ROW_STRIDE = 26;

/** The mark, inlined so `currentColor` inherits the sidebar's ivory.
 * The tiled `rabta-mark.svg` stays the Dock icon, where it sits against
 * the desktop and reads properly. */
function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      data-brand-mark
      viewBox="0 0 64 64"
      role="img"
      aria-label="Rabta"
      className={className}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M13 8h28.5L56 22.5V51a5 5 0 0 1-5 5H22L8 42V13a5 5 0 0 1 5-5Zm8 13h14v-5l14 16-14 16v-5H25l-8-8V25a4 4 0 0 1 4-4Z"
      />
      <path fill="currentColor" d="M41.5 8v14.5H56Z" />
    </svg>
  );
}

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
            // Fixed 25px height. overflow-hidden keeps the label clipped to
            // the row.
            "group relative z-10 flex h-[25px] w-full items-center gap-2 overflow-hidden rounded-[10px]",
            "text-sm transition-colors duration-fast ease-standard",
            active
              ? "text-sidebar-accent-foreground"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground",
            // Selected nav stays teal — orange is reserved for the brand.
            standalone && active && "bg-sidebar-accent",
          )}
        >
          {/* Icon tile pinned to the row's left edge. At 25px rows it no
              longer fills the collapsed rail, so icons re-centre rather than
              staying pixel-identical between states (see COLLAPSED_WIDTH's
              comment in AppShell.tsx for why that trade was made). */}
          <span className="grid size-[18px] shrink-0 place-items-center">
            <Icon className="size-[14px]" />
          </span>
          {/* Collapsible label column: fades + slides as the rail narrows. */}
          <span
            aria-hidden={collapsed}
            className={cn(
              "min-w-0 flex-1 truncate text-left transition-[opacity,transform] duration-sidebar ease-standard",
              collapsed && "-translate-x-1 opacity-0",
            )}
          >
            {item.label}
          </span>
        </button>
      </TooltipTrigger>
      {/* Label + shortcut on hover — the only way to read a row when collapsed. */}
      <TooltipContent side="right" className="flex items-center gap-3">
        <span>{item.label}</span>
        <span className="font-mono text-[11px] text-muted-foreground">{item.shortcut}</span>
      </TooltipContent>
    </Tooltip>
  );
}

/** Brand + collapse control row. The logo is identity only (never a nav
 * control); the collapse control lives at the row's right and glides to the
 * rail centre as the sidebar closes. */
function BrandRow({ collapsed, fullscreen }: { collapsed: boolean; fullscreen: boolean }) {
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const label = collapsed ? "Show sidebar" : "Hide sidebar";
  return (
    <div className={cn("flex shrink-0 items-center", fullscreen ? "h-[58px] pt-2" : "h-[58px]")}>
      {/* Non-interactive identity. Dragging it moves the window. */}
      <div
        data-tauri-drag-region
        className={cn(
          "flex min-w-0 items-center gap-2 overflow-hidden text-sidebar-foreground/90",
          "transition-opacity duration-sidebar ease-standard",
          collapsed && "opacity-0",
        )}
      >
        <BrandMark className="size-4 shrink-0 text-sidebar-foreground" />
        <span className="truncate text-body font-semibold tracking-tight">Rabta</span>
      </div>
      <div className="flex-1" />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={label}
            className="grid size-10 shrink-0 place-items-center rounded-[9px] text-sidebar-foreground/55 transition-colors duration-fast ease-standard hover:bg-sidebar-accent/40 hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            <Icon className="size-[18px]" />
          </button>
        </TooltipTrigger>
        <TooltipContent side={collapsed ? "right" : "bottom"} className="flex items-center gap-3">
          <span>{label}</span>
          <span className="font-mono text-[11px] text-muted-foreground">⌘\</span>
        </TooltipContent>
      </Tooltip>
    </div>
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
      // Fixed, non-scrolling frame region. One continuous petrol edge
      // (border-r).
      className="flex h-full min-h-0 flex-col overflow-hidden border-r border-sidebar-border/60 bg-sidebar px-[10px] text-sidebar-foreground"
    >
      {/* Row 1 — macOS traffic-light strip. Windowed only; the OS overlays the
          lights here. In fullscreen there are no lights, so the row is dropped
          and the brand row moves up into this space (no empty band). This
          spacer plus the 1px divider below it total the workspace Toolbar's
          height (src/shell/titlebar.ts, currently 38px) so the titlebar
          divider lines up with the Toolbar's bottom border — one continuous
          hairline across the whole app. The two heights are pulled from the
          same shared constants module specifically because they've already
          drifted apart once (the Toolbar went from 60px to 38px without a
          matching edit here) — keep them wired to titlebar.ts rather than
          hardcoding either number again. */}
      {!fullscreen && (
        <div data-tauri-drag-region className={cn(SIDEBAR_TITLEBAR_SPACER_HEIGHT_CLASS, "shrink-0")} />
      )}

      {/* Titlebar divider — sets the window-controls row apart from the brand
          row below, aligned with the Toolbar border. Windowed only, since
          fullscreen has no light row above it. */}
      {!fullscreen && (
        <div
          className={cn(
            "-mx-[10px] shrink-0 bg-sidebar-border/50",
            SIDEBAR_TITLEBAR_DIVIDER_HEIGHT_CLASS,
          )}
        />
      )}

      {/* Row 2 — brand + collapse control. Flows straight into the nav; the
          only divider up top is the titlebar one under the traffic lights. */}
      <BrandRow collapsed={collapsed} fullscreen={fullscreen} />

      {/* Navigation. */}
      <nav className="relative flex flex-col gap-1 pt-3">
        <div
          aria-hidden
          className={cn(
            // Moving selection surface. inset-x-0 means it fills the nav column
            // width in both states, so it morphs wide-pill → icon-tile as the
            // rail width animates; only its vertical slide is transitioned here.
            "pointer-events-none absolute inset-x-0 top-3 h-[25px] rounded-[10px] bg-sidebar-accent",
            "transition-transform duration-standard ease-standard",
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

      {/* Flexible spacer pushes the footer to the bottom of the rail. */}
      <div className="flex-1" />

      {/* Footer divider. */}
      <div className="-mx-[10px] h-px shrink-0 bg-sidebar-border/50" />

      {/* Footer — Settings + the local-only assurance (expanded only). */}
      <div className="flex flex-col gap-1 pb-[18px] pt-2">
        <NavRow
          item={SETTINGS_ITEM}
          active={view === SETTINGS_ITEM.key}
          collapsed={collapsed}
          standalone
          onClick={() => go(SETTINGS_ITEM.key)}
        />
        {/* Reads only with its label, so it's dropped entirely when collapsed
            rather than leaving a bare dot. */}
        {!collapsed && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2 rounded-[9px] px-3 py-2 text-xs text-sidebar-foreground/50">
                {/* Neutral dot — deliberately not emerald, so it isn't read as
                    an online/connected indicator. */}
                <span className="size-1.5 shrink-0 rounded-full bg-sidebar-foreground/35" />
                <span className="truncate">Data stored locally</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">
              Everything runs on your Mac — no cloud account, no telemetry.
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </aside>
  );
}
