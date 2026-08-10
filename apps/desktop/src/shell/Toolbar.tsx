import { Icon } from "@/components/ui/icon";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { useStore, type NavKey } from "@/store";
import { NAV_ITEMS, SETTINGS_ITEM } from "./nav";
import { SidebarToggleButton } from "./Sidebar";
import {
  CHROME_INSET_CLASS,
  SIDEBAR_TOGGLE_GAP_CLASS,
  TOOLBAR_HEIGHT_CLASS,
  TRAFFIC_LIGHT_GROUP_WIDTH_CLASS,
  TRAFFIC_LIGHT_WRAPPER_INSET_CLASS,
} from "./titlebar";

/** Visible entry point to the ⌘K command palette. Without it the palette is
 * discoverable only by devs who already know the shortcut — so this both
 * opens it (real: toggles the store's commandOpen) and teaches the binding.
 * Fixed 196px per the handoff (Rabta - Console v2.dc.html's toolbar search
 * button: `width:196px`), not a flexible/responsive width — the toolbar has
 * a `flex-1` spacer on either side of it to absorb window width instead. */
function SearchTrigger() {
  const toggleCommandOpen = useStore((s) => s.toggleCommandOpen);
  return (
    <button
      type="button"
      onClick={toggleCommandOpen}
      aria-label="Search or jump to anything (Command K)"
      className="flex h-6 w-[196px] shrink-0 items-center gap-1.5 rounded-md border-[0.5px] border-border bg-field px-[7px] text-meta text-muted-foreground transition-colors duration-fast ease-standard hover:border-tertiary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Icon name="search" className="size-[13px] shrink-0" />
      <span className="min-w-0 flex-1 truncate text-left">Search</span>
      <Kbd className="shrink-0">⌘K</Kbd>
    </button>
  );
}

/** The one accent action a view can offer in the toolbar — see
 * `contextualAction` below for the per-view mapping. Nothing renders when a
 * view has none (Activity, Settings): the accent budget
 * (`expectAtMostOneAccent`, src/test/accent.ts) is spent here or not at
 * all, never defaulted to something generic. */
function ContextualAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-6 shrink-0 items-center gap-[5px] rounded-md bg-primary pl-2 pr-2.5 text-meta font-510 text-primary-foreground transition-colors duration-fast ease-standard hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Icon name="plus" className="size-3 shrink-0" />
      {label}
    </button>
  );
}

/** Non-functional browser-style back/forward chrome. Console v2 Phase 1
 * hasn't built a navigation-history stack (there's no state anywhere this
 * shell can read to know what "back" would even mean yet), so both buttons
 * are real `disabled` controls rather than fake live ones — matching the
 * handoff's own prototype, which wires neither to a click handler either.
 * Back reads at 40% opacity per the handoff ("back is disabled at 50%
 * opacity" in prose; the prototype markup's own `opacity:.4` is what's
 * actually rendered, and per this project's rule the markup wins ties).
 * Forward stays full-opacity chrome, also inert, for the same reason. */
function HistoryChevrons() {
  return (
    <div className="ml-0.5 flex shrink-0 items-center overflow-hidden rounded-md bg-secondary shadow-[0_0_0_0.5px_hsl(var(--border))]">
      <button
        type="button"
        disabled
        aria-label="Back"
        title="Back"
        className="grid h-[22px] w-[27px] place-items-center text-tertiary-foreground opacity-40"
      >
        <Icon name="chevron-left" className="size-3" />
      </button>
      <span aria-hidden className="h-[13px] w-px shrink-0 bg-border" />
      <button
        type="button"
        disabled
        aria-label="Forward"
        title="Forward"
        className="grid h-[22px] w-[27px] place-items-center text-muted-foreground"
      >
        <Icon name="chevron-right" className="size-3" />
      </button>
    </div>
  );
}

/** The toolbar's one contextual accent action, per view — "New capsule" on
 * Overview and Capsules (both are places a user starts one from), "Add
 * project" on Projects, and nothing on Connectors, Activity, or Settings
 * (there's no single sensible "create" for any of the three: Connectors
 * self-pair — no manual-add flow exists anywhere in the app — so an accent
 * button there would create nothing). This is the toolbar's one spendable
 * accent: Sidebar.tsx's selected-row pill is deliberately neutral (see its
 * DELIBERATE DIVERGENCE comment) so the accent budget
 * (`expectAtMostOneAccent`) is spent here or not at all.
 *
 * `requestNewTask`/`requestNewProject` are the same store actions the
 * ⌘⇧N/⌘N global shortcuts already drive (App.tsx) — reused rather than
 * reinvented so this button and the shortcut always agree on what "new"
 * means. Connectors has no equivalent store request — connectors self-pair,
 * and there is no manual-add flow anywhere in the app for this button to
 * trigger — so it renders nothing, same as Activity and Settings. */
function useContextualAction(view: NavKey): { label: string; onClick: () => void } | null {
  const setView = useStore((s) => s.setView);
  const requestNewTask = useStore((s) => s.requestNewTask);
  const requestNewProject = useStore((s) => s.requestNewProject);

  switch (view) {
    case "overview":
    case "capsules":
      return {
        label: "New capsule",
        onClick: () => {
          setView("capsules");
          requestNewTask();
        },
      };
    case "projects":
      return { label: "Add project", onClick: requestNewProject };
    case "connectors":
    case "activity":
    case "settings":
      return null;
    default: {
      const _exhaustive: never = view;
      return _exhaustive;
    }
  }
}

/** The workspace toolbar: a slim, mostly-draggable strip that begins at the
 * window edge (not the sidebar boundary — Task 10 moves the traffic lights
 * and sidebar toggle in here when the sidebar is collapsed, so the toolbar
 * now owns that corner of the window in that state). It carries the page
 * title, so pages no longer restate what the sidebar already shows, plus
 * browser-style back/forward chrome, the command-palette search field, and
 * the one per-view contextual accent action. */
export function Toolbar() {
  const view = useStore((s) => s.view);
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed);
  // `view` traces back to `readPrefs()`'s unvalidated `JSON.parse` of
  // `landingPage` (store.ts), which never checks the persisted value against
  // `NavKey` — a stale/hand-edited localStorage value can produce a `view`
  // that matches no NAV_ITEMS/SETTINGS_ITEM entry. Falling back to `""`
  // would render a heading with no accessible name; NAV_ITEMS[0] is always
  // present, so it's used as a known-good label instead.
  const title =
    [...NAV_ITEMS, SETTINGS_ITEM].find((item) => item.key === view)?.label ?? NAV_ITEMS[0].label;

  const action = useContextualAction(view);

  return (
    <header
      data-tauri-drag-region
      className={cn(
        TOOLBAR_HEIGHT_CLASS,
        CHROME_INSET_CLASS,
        "flex shrink-0 items-center gap-2 border-b-[0.5px] border-border bg-background pr-3",
        "backdrop-blur-[24px] backdrop-saturate-[1.8]",
      )}
    >
      {/* Traffic lights + toggle, only when the sidebar is collapsed — when
          it's open, the Sidebar itself draws both (see Sidebar.tsx's Row 1
          and SidebarToggleButton). Reserves the same 52px light cluster and
          73px toggle position either chrome region uses, built from the
          same shared constants so the two can never disagree. */}
      {sidebarCollapsed && (
        <div
          className={cn(
            "flex shrink-0 items-center",
            TRAFFIC_LIGHT_WRAPPER_INSET_CLASS,
            SIDEBAR_TOGGLE_GAP_CLASS,
          )}
        >
          <span aria-hidden className={cn(TRAFFIC_LIGHT_GROUP_WIDTH_CLASS, "shrink-0")} />
          <SidebarToggleButton tone="toolbar" />
        </div>
      )}
      <HistoryChevrons />
      <h1 className="ml-1.5 truncate text-body font-semibold tracking-[-0.005em] text-foreground">
        {title}
      </h1>
      <div className="flex-1" />
      <SearchTrigger />
      {action && <ContextualAction label={action.label} onClick={action.onClick} />}
    </header>
  );
}
