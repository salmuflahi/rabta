import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useStore, type NavKey } from "@/store";
import { NAV_ITEMS, SETTINGS_ITEM, type NavGroupName, type NavItem } from "./nav";
import {
  NAV_ROW_GAP_CLASS,
  NAV_ROW_HEIGHT_CLASS,
  NAV_ROW_RADIUS_CLASS,
  NAV_ROW_STRIDE_PX,
} from "./navRow";
import {
  SIDEBAR_TITLEBAR_DIVIDER_HEIGHT_CLASS,
  SIDEBAR_TITLEBAR_SPACER_HEIGHT_CLASS,
} from "./titlebar";

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
  count,
  countAriaLabel,
  countClassName,
  hint,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  /** Settings sits outside the moving-indicator group, so it paints its own
   * active surface instead of relying on the shared indicator. */
  standalone?: boolean;
  /** Right-aligned count badge. Only Capsules/Projects/Connectors carry one
   * in the handoff — Overview and Activity pass nothing. */
  count?: string;
  /** Screen-reader text for `count` when its colour is doing work that
   * plain digits don't carry on their own (see Connectors below) — colour
   * is never the only signal. */
  countAriaLabel?: string;
  countClassName?: string;
  /** Right-aligned keyboard hint, shown only on the standalone Settings row. */
  hint?: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-current={active ? "page" : undefined}
          aria-label={collapsed ? `${item.label} (${item.shortcut})` : undefined}
          className={cn(
            // Row height/radius come from the shared navRow module —
            // overflow-hidden keeps the label clipped to the row.
            NAV_ROW_HEIGHT_CLASS,
            NAV_ROW_RADIUS_CLASS,
            "group relative z-10 flex w-full items-center gap-2 overflow-hidden px-2",
            "text-body transition-colors duration-fast ease-standard",
            active
              ? "text-secondary-foreground font-510"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground",
            // Selected nav uses the neutral --secondary surface, not the
            // accent — see the DELIBERATE DIVERGENCE comment on the moving
            // pill below for why. Settings sits outside that shared pill,
            // so it paints the same neutral fill on itself here.
            standalone && active && "bg-secondary",
          )}
        >
          <Icon name={item.icon} className="size-[15px] shrink-0 opacity-90" />
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
          {!collapsed && count !== undefined && (
            <span
              aria-label={countAriaLabel}
              className={cn("shrink-0 text-label tabular-nums", countClassName ?? "text-tertiary-foreground")}
            >
              {count}
            </span>
          )}
          {!collapsed && hint && (
            <kbd
              className={cn(
                "shrink-0 font-mono text-[11px]",
                active ? "text-secondary-foreground/70" : "text-tertiary-foreground",
              )}
            >
              {hint}
            </kbd>
          )}
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

/** One sidebar section — a group header plus its own locally-scoped sliding
 * selection pill. Scoping the pill per group (rather than one pill sliding
 * across the whole flat NAV_ITEMS list) is what lets NAV_ROW_STRIDE_PX stay
 * a plain height+gap sum: a pill spanning both groups would also have to
 * account for the other group's header height in its translateY, which is
 * exactly the kind of second hardcoded number this module's stride math
 * exists to avoid. */
function NavGroup({
  name,
  items,
  view,
  collapsed,
  go,
  countFor,
}: {
  name: NavGroupName;
  items: NavItem[];
  view: NavKey;
  collapsed: boolean;
  go: (key: NavKey) => void;
  countFor: (item: NavItem) => {
    count?: string;
    countAriaLabel?: string;
    countClassName?: string;
  };
}) {
  const activeIndex = items.findIndex((item) => item.key === view);
  return (
    <div>
      <p
        aria-hidden={collapsed}
        className={cn(
          "px-2 pb-1 pt-[10px] text-label font-semibold text-tertiary-foreground",
          "transition-opacity duration-sidebar ease-standard",
          collapsed && "opacity-0",
        )}
      >
        {name}
      </p>
      <div data-nav-group={name} className={cn("relative flex flex-col", NAV_ROW_GAP_CLASS)}>
        <div
          aria-hidden
          className={cn(
            // Moving selection surface, neutral rather than accent-filled —
            // DELIBERATE DIVERGENCE FROM THE HANDOFF (Task 9): the handoff
            // fills the selected nav row with the accent colour. This app
            // uses the neutral `--secondary` surface at weight 510 instead,
            // because the sidebar is visible on every screen — an accent
            // fill there is permanent, and would compete with the toolbar's
            // contextual accent action for the one-accent-per-view budget
            // (`expectAtMostOneAccent`, src/test/accent.ts). Do not restore
            // the accent fill here; that was a considered choice, not an
            // oversight.
            "pointer-events-none absolute inset-x-0 top-0 bg-secondary",
            NAV_ROW_RADIUS_CLASS,
            NAV_ROW_HEIGHT_CLASS,
            "transition-transform duration-standard ease-standard",
            activeIndex < 0 && "opacity-0",
          )}
          style={{ transform: `translateY(${Math.max(activeIndex, 0) * NAV_ROW_STRIDE_PX}px)` }}
        />
        {items.map((item) => {
          const { count, countAriaLabel, countClassName } = countFor(item);
          return (
            <NavRow
              key={item.key}
              item={item}
              active={view === item.key}
              collapsed={collapsed}
              count={count}
              countAriaLabel={countAriaLabel}
              countClassName={countClassName}
              onClick={() => go(item.key)}
            />
          );
        })}
      </div>
    </div>
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

/** Groups NAV_ITEMS by their static `group` field, preserving NAV_ITEMS'
 * own order — so adding/reordering nav items never requires a second edit
 * here as long as each item's `group` is set correctly. */
function groupNavItems(items: NavItem[]): { name: NavGroupName; items: NavItem[] }[] {
  const groups: { name: NavGroupName; items: NavItem[] }[] = [];
  for (const item of items) {
    if (!item.group) continue;
    const last = groups[groups.length - 1];
    if (last && last.name === item.group) {
      last.items.push(item);
    } else {
      groups.push({ name: item.group, items: [item] });
    }
  }
  return groups;
}

export function Sidebar() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const fullscreen = useStore((s) => s.fullscreen);
  const projects = useStore((s) => s.projects);
  const connectors = useStore((s) => s.connectors);

  const go = (key: NavKey) => setView(key);
  const navGroups = groupNavItems(NAV_ITEMS);

  const connectedCount = connectors.filter((c) => c.connected).length;

  // Right-aligned nav counts. Only Projects and Connectors have a count
  // source reachable from the shell without reaching into src/pages/ or
  // src/store.ts (both out of scope for Task 9) — Capsules' count in the
  // handoff isn't backed by any state the shell can read today, so it's
  // deliberately left blank rather than showing a fabricated or stale
  // number. Connectors' count is real *live* state, so it's the one that
  // gets the `--ok` treatment — and since colour is never the only signal
  // (src/shell/StatusBar.tsx sets this precedent for the same data), the
  // accessible name spells out what the colour means instead of relying on
  // green alone.
  const countFor = (item: NavItem) => {
    if (item.key === "projects") {
      return { count: String(projects.length) };
    }
    if (item.key === "connectors") {
      return {
        count: String(connectedCount),
        countAriaLabel: `${connectedCount} connected`,
        countClassName: "text-ok",
      };
    }
    return {};
  };

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

      {/* Navigation — split into the Workspace and This Mac groups. Each
          group renders its own header and owns its own sliding selection
          pill (see NavGroup above for why the pill is scoped per group). */}
      <nav className="flex flex-col pt-3">
        {navGroups.map((group) => (
          <NavGroup
            key={group.name}
            name={group.name}
            items={group.items}
            view={view}
            collapsed={collapsed}
            go={go}
            countFor={countFor}
          />
        ))}
      </nav>

      {/* Flexible spacer pushes the footer to the bottom of the rail. */}
      <div className="flex-1" />

      {/* Footer divider. */}
      <div className="-mx-[10px] h-px shrink-0 bg-sidebar-border/50" />

      {/* Footer — Settings (pinned below both groups, with its ⌘, hint) +
          the local-only assurance (expanded only). */}
      <div className="flex flex-col gap-1 pb-[18px] pt-2">
        <NavRow
          item={SETTINGS_ITEM}
          active={view === SETTINGS_ITEM.key}
          collapsed={collapsed}
          standalone
          hint={SETTINGS_ITEM.shortcut}
          onClick={() => go(SETTINGS_ITEM.key)}
        />
        {/* Reads only with its label, so it's dropped entirely when collapsed
            rather than leaving a bare icon. This copy is a product
            requirement, not decoration — the handoff calls it out explicitly
            as the app's positioning, so it ships verbatim rather than being
            paraphrased. */}
        {!collapsed && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 rounded-[9px] px-2 py-2 text-label text-tertiary-foreground">
                <Icon name="shield" className="size-3 shrink-0" aria-hidden="true" />
                <span className="truncate">Everything stays on this Mac</span>
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
