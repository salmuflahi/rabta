import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { RESTORE_SHEET_EASE, prefersReducedMotion } from "@/lib/motion";
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
import { useSidebarPresence } from "./sidebarMotion";
import {
  SIDEBAR_EXPANDED_WIDTH_PX,
  SIDEBAR_TITLEBAR_DIVIDER_HEIGHT_CLASS,
  SIDEBAR_TITLEBAR_SPACER_HEIGHT_CLASS,
  TRAFFIC_LIGHT_GROUP_WIDTH_CLASS,
  TRAFFIC_LIGHT_WRAPPER_INSET_CLASS,
} from "./titlebar";

/** The mark — the return glyph — inlined so the stroke inherits the
 * sidebar's foreground via `currentColor` (an SVG behind <img src> is an
 * isolated document where currentColor resolves to black). The arrowhead is
 * brand orange and stays literal: it is the identity, not an accent. On
 * mount the stroke draws itself and the head lands; reduced motion renders
 * the finished mark outright. */
function BrandMark({ className }: { className?: string }) {
  const reduced = prefersReducedMotion();
  const [drawn, setDrawn] = useState(reduced);
  useEffect(() => {
    if (reduced) return;
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, [reduced]);
  const LEN = 42;
  return (
    <svg
      data-brand-mark
      viewBox="0 0 64 64"
      role="img"
      aria-label="Rabta"
      className={className}
    >
      <path
        d="M48 15 V28 A12 12 0 0 1 36 40 H27"
        fill="none"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        style={{
          strokeDasharray: LEN,
          strokeDashoffset: reduced ? 0 : drawn ? 0 : LEN,
          transition: reduced ? undefined : `stroke-dashoffset 420ms ${RESTORE_SHEET_EASE}`,
        }}
      />
      <path
        d="M15 40 L29 32.5 L29 47.5 Z"
        fill="#FF6B2C"
        stroke="#FF6B2C"
        strokeWidth="3.5"
        strokeLinejoin="round"
        style={{
          opacity: reduced ? 1 : drawn ? 1 : 0,
          transition: reduced ? undefined : `opacity 200ms ${RESTORE_SHEET_EASE} 260ms`,
        }}
      />
    </svg>
  );
}

function NavRow({
  item,
  active,
  standalone,
  count,
  countAriaLabel,
  countClassName,
  hint,
  onClick,
}: {
  item: NavItem;
  active: boolean;
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
  // NavRow only ever renders while the sidebar itself is expanded — Sidebar()
  // returns a bare, contentless `<aside>` when collapsed rather than
  // rendering nav rows at reduced width (see the collapse-fix report for why
  // an icon-only collapsed rail was removed). There is no `collapsed` prop
  // here any more: nothing left to fade or hide.
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-current={active ? "page" : undefined}
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
          <Icon
            name={item.icon}
            className={cn(
              "size-[15px] shrink-0 opacity-90 transition-transform duration-fast ease-standard",
              // A small settle as the row becomes selected — same
              // ease-standard "settling" curve the sliding selection pill
              // already uses (see the moving pill in NavGroup below), just on
              // the icon instead of the pill. Purely decorative: the active
              // row is already legible from its text weight/colour and the
              // pill without this.
              active && "scale-105",
            )}
          />
          <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
          {count !== undefined && (
            <span
              aria-label={countAriaLabel}
              className={cn(
                "shrink-0 text-label tabular-nums transition-opacity duration-standard",
                countClassName ?? "text-tertiary-foreground",
                // Dimmed at rest, full strength once selected — the same 70%
                // fraction the row's own inactive label already renders at
                // (this button's own text-sidebar-foreground/70 above), so
                // the count settles in step with the row instead of
                // introducing a new ratio.
                active ? "opacity-100" : "opacity-70",
              )}
            >
              {count}
            </span>
          )}
          {hint && (
            <kbd
              className={cn(
                "shrink-0 font-mono text-label",
                active ? "text-secondary-foreground/70" : "text-tertiary-foreground",
              )}
            >
              {hint}
            </kbd>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="flex items-center gap-3">
        <span>{item.label}</span>
        <span className="font-mono text-label text-muted-foreground">{item.shortcut}</span>
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
  go,
  countFor,
}: {
  name: NavGroupName;
  items: NavItem[];
  view: NavKey;
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
      <p className="px-2 pb-1 pt-[10px] text-label font-semibold text-tertiary-foreground">
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

/** Brand identity row. The collapse control used to live here, then moved
 * to Row 1, and now lives outside this component entirely — AppShell pins
 * one instance over both columns (see SidebarToggle.tsx) so it survives
 * fullscreen and the collapse animation. Row 1 above is now purely the
 * macOS titlebar strip. */
function BrandRow() {
  return (
    <div className="flex h-[58px] shrink-0 items-center">
      {/* Non-interactive identity. Dragging it moves the window. */}
      <div
        data-tauri-drag-region
        className="flex min-w-0 items-center gap-2 overflow-hidden text-sidebar-foreground/90"
      >
        <BrandMark className="size-4 shrink-0 text-sidebar-foreground" />
        <span className="truncate text-body font-semibold tracking-tight">Rabta</span>
      </div>
      <div className="flex-1" />
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
  const present = useSidebarPresence();
  const contentRef = useRef<HTMLDivElement>(null);

  // Once the flag flips, the contents are on their way out: still painted,
  // but no longer part of the page. `inert` is the one attribute that takes
  // them out of the tab order, the a11y tree and hit-testing in a single
  // stroke — a `tabIndex={-1}` on the container would leave every button
  // inside it still focusable. Set imperatively because React 18 has no
  // `inert` prop (React 19 added one).
  useEffect(() => {
    const el = contentRef.current;
    if (el) el.inert = collapsed;
  }, [collapsed, present]);

  const go = (key: NavKey) => setView(key);
  const navGroups = groupNavItems(NAV_ITEMS);

  // Collapsed = gone, not a narrowed icon rail. The prototype (Rabta -
  // Console v2.dc.html) is unambiguous: `s.sidebar ? "flex:0 0
  // 216px;border-right-width:0.5px;" : "flex:0 0 0px;border-right-
  // width:0px;"` — zero width, no border. There used to be an 88px
  // icon-only rail here (an older redesign's leftover, sized so macOS's
  // traffic lights had clearance); that clearance now lives in the shared
  // chrome geometry (titlebar.ts), so nothing needs to be rendered here at
  // all once the panel is away. No padding, no border, no nav content —
  // none of it would be reachable at zero width anyway, and leaving it
  // mounted would mean focusable buttons hiding in a box with no visible
  // extent.
  //
  // What's new in Phase 2 is *when* that happens: the contents outlive the
  // flag by one animation (useSidebarPresence) so the panel that slides out
  // is the sidebar rather than an empty ink box, and only then unmount.
  if (!present) {
    return <aside aria-hidden="true" className="h-full w-0 shrink-0 overflow-hidden bg-sidebar" />;
  }

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
    // The `aside` is only the clipping frame: its width is the animating
    // grid track, so it narrows to nothing as the sidebar leaves. Everything
    // visible lives in the fixed-width column inside it, anchored to the
    // frame's *right* edge — which is what turns "the track got narrower"
    // into "the sidebar slid off the left of the window" instead of "the
    // nav got squashed". Nothing here reflows during the animation; the
    // column keeps its 216px layout the whole way out and back.
    <aside className="relative h-full min-h-0 overflow-hidden bg-sidebar">
      <div
        ref={contentRef}
        aria-hidden={collapsed || undefined}
        style={{ width: SIDEBAR_EXPANDED_WIDTH_PX }}
        // One continuous ink edge (border-r) — on this column rather
        // than the frame, so it travels with the panel. Left on the frame it
        // would still paint a hairline at zero width, which is exactly the
        // seam the collapsed state is supposed to be free of.
        className="absolute inset-y-0 right-0 flex flex-col overflow-hidden border-r-[0.5px] border-sidebar-border bg-sidebar px-[10px] text-sidebar-foreground"
      >
      {/* Row 1 — macOS titlebar strip. The OS overlays the traffic lights
          here (never drawn by this app — see src-tauri/tauri.conf.json's
          trafficLightPosition); in fullscreen there are none, so only the
          light *reservation* drops, not the row. The row itself always
          renders: it plus the 1px divider below it total the workspace
          Toolbar's height (src/shell/titlebar.ts) so the titlebar divider
          lines up with the Toolbar's bottom border — one continuous
          hairline across the whole app, in fullscreen as well as windowed.
          Dropping the whole row on fullscreen (as this did before Phase 2)
          left the sidebar's contents sitting 52px higher than the
          workspace's, and took the sidebar toggle with it.

          The two heights are pulled from the same shared constants module
          specifically because they've already drifted apart once (the
          Toolbar went from 60px to 38px without a matching edit here) —
          keep them wired to titlebar.ts rather than hardcoding either
          number again.

          The toggle itself is no longer in this row. AppShell pins one
          instance over both columns (SidebarToggle.tsx) so it can't vanish
          in fullscreen and can't flicker mid-animation. */}
      <div
        data-tauri-drag-region
        className={cn(
          SIDEBAR_TITLEBAR_SPACER_HEIGHT_CLASS,
          "flex shrink-0 items-center",
          !fullscreen && TRAFFIC_LIGHT_WRAPPER_INSET_CLASS,
        )}
      >
        {!fullscreen && (
          <span aria-hidden className={cn(TRAFFIC_LIGHT_GROUP_WIDTH_CLASS, "shrink-0")} />
        )}
      </div>

      {/* Titlebar divider — sets the window-controls row apart from the brand
          row below, aligned with the Toolbar border. */}
      <div
        className={cn(
          "-mx-[10px] shrink-0 bg-sidebar-border/50",
          SIDEBAR_TITLEBAR_DIVIDER_HEIGHT_CLASS,
        )}
      />

      {/* Row 2 — brand. Flows straight into the nav; the only divider up top
          is the titlebar one under the traffic lights. */}
      <BrandRow />

      {/* Navigation — split into the Workspace and This Mac groups. Each
          group renders its own header and owns its own sliding selection
          pill (see NavGroup above for why the pill is scoped per group).
          `aria-label` gives this landmark a real name — a screen-reader
          user jumping between landmarks otherwise hears only the generic
          "navigation" for it, same as they would for a second nav region
          anywhere else in the app. */}
      <nav aria-label="Sections" className="flex flex-col pt-3">
        {navGroups.map((group) => (
          <NavGroup
            key={group.name}
            name={group.name}
            items={group.items}
            view={view}
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
          the local-only assurance. This copy is a product requirement, not
          decoration — the handoff calls it out explicitly as the app's
          positioning, so it ships verbatim rather than being paraphrased. */}
      <div className="flex flex-col gap-1 pb-[18px] pt-2">
        <NavRow
          item={SETTINGS_ITEM}
          active={view === SETTINGS_ITEM.key}
          standalone
          hint={SETTINGS_ITEM.shortcut}
          onClick={() => go(SETTINGS_ITEM.key)}
        />
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
      </div>
      </div>
    </aside>
  );
}
