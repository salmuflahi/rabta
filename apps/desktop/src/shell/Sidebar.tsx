import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import markUrl from "@/assets/brand/rabta-mark.svg";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useStore, type NavKey } from "@/store";
import { NAV_ITEMS, SETTINGS_ITEM, type NavItem } from "./nav";

// Row height (h-10 = 40px) + nav gap (gap-1 = 4px): the moving selection
// surface is translated by activeIndex * ROW_STRIDE to sit behind the active
// row. The aside keeps a constant 24px horizontal padding, so when collapsed
// the content column is exactly one 40px icon tile wide — icons never shift
// horizontally between states, and the active surface morphs wide-pill →
// icon-tile purely by following the animating column width.
const ROW_STRIDE = 44;

/** Context Fold — the folded-corner motif applied to nav rows. A restrained
 * orange triangle in the row's top-right corner: it grows from nothing on
 * hover, and the active row keeps a small fold at rest. The teal selection
 * surface underneath is preserved; the fold sits on top of it. Clipped by the
 * row's own rounded corner, so it hugs the geometry in both states. */
function ContextFold({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute right-0 top-0 bg-primary",
        // Folded top-right corner. The row surface squares off its top-right
        // (rounded-tr-none) so this triangle reads as a crisp fold instead of
        // being swallowed by the corner radius. A hairline drop-shadow along
        // the fold line gives it a subtle turned-page depth.
        "[clip-path:polygon(100%_0,0_0,100%_100%)]",
        "[filter:drop-shadow(-0.5px_0.5px_0.5px_rgb(0_0_0_/_0.3))]",
        "transition-[width,height,opacity] duration-standard ease-standard",
        // Active rows keep a small fold at rest; idle rows show none.
        active ? "size-[6px] opacity-100" : "size-0 opacity-0",
        // Hover deepens the fold (idle rows reveal it, active rows enlarge it).
        "group-hover:size-[9px] group-hover:opacity-100",
      )}
    />
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
            // Fixed 40px height; rounded except the top-right, which is
            // squared so the Context Fold triangle reads crisp (a rounded
            // corner there would eat it). overflow-hidden keeps the label
            // clipped to the row.
            "group relative z-10 flex h-10 w-full items-center gap-1 overflow-hidden rounded-[10px] rounded-tr-none",
            "text-sm transition-colors duration-fast ease-standard",
            active
              ? "text-sidebar-accent-foreground"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground",
            // Selected nav stays teal — orange is reserved for the fold/brand.
            standalone && active && "bg-sidebar-accent",
          )}
        >
          {/* Fixed icon rail: a 40px tile pinned to the row's left edge. Its
              position is identical whether the sidebar is open or collapsed. */}
          <span className="grid size-10 shrink-0 place-items-center">
            <Icon className="size-[18px]" />
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
          <ContextFold active={active} />
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
        <img src={markUrl} alt="Rabta" className="size-6 shrink-0 rounded-[6px]" />
        <span className="truncate text-[15px] font-semibold tracking-tight">Rabta</span>
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
      // Fixed, non-scrolling frame region. Constant 24px side padding is what
      // makes the collapsed content column exactly one icon tile wide, so the
      // icon rail never shifts. One continuous petrol edge (border-r).
      className="flex h-full min-h-0 flex-col overflow-hidden border-r border-sidebar-border/60 bg-sidebar px-[24px] text-sidebar-foreground"
    >
      {/* Row 1 — macOS traffic-light strip. Windowed only; the OS overlays the
          lights here. In fullscreen there are no lights, so the row is dropped
          and the brand row moves up into this space (no empty band). Its height
          matches the workspace Toolbar (h-[60px] border-b) so the titlebar
          divider below lines up with the Toolbar's bottom border — one
          continuous hairline across the whole app. */}
      {!fullscreen && <div data-tauri-drag-region className="h-[59px] shrink-0" />}

      {/* Titlebar divider — sets the window-controls row apart from the brand
          row below, aligned with the Toolbar border. Windowed only, since
          fullscreen has no light row above it. */}
      {!fullscreen && <div className="-mx-[24px] h-px shrink-0 bg-sidebar-border/50" />}

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
            "pointer-events-none absolute inset-x-0 top-3 h-10 rounded-[10px] rounded-tr-none bg-sidebar-accent",
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
      <div className="-mx-[24px] h-px shrink-0 bg-sidebar-border/50" />

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
