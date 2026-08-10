import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useStore, type ConnectorRow, type NavKey } from "@/store";
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

// Connector types Rabta ships an integration for. The popover always lists
// these so a user can see what's available, connected or not.
const KNOWN_CONNECTORS: { kind: string; name: string }[] = [
  { kind: "vscode", name: "VS Code" },
  { kind: "chrome", name: "Chrome" },
];

type ConnState = "connected" | "offline" | "absent";

function connStateStyles(state: ConnState): { dot: string; text: string; label: string } {
  switch (state) {
    case "connected":
      return { dot: "bg-success", text: "text-success", label: "Connected" };
    case "offline":
      return { dot: "bg-warning", text: "text-warning", label: "Offline" };
    default:
      return { dot: "bg-muted-foreground/40", text: "text-muted-foreground", label: "Not connected" };
  }
}

/** One row per known connector plus any other live connector kind (e.g. a
 * dev fake), each with its current connection state. */
function connectionRows(connectors: ConnectorRow[]): { key: string; name: string; state: ConnState }[] {
  const rows = KNOWN_CONNECTORS.map(({ kind, name }) => {
    const matches = connectors.filter((c) => c.kind === kind);
    const state: ConnState = matches.some((c) => c.connected)
      ? "connected"
      : matches.length > 0
        ? "offline"
        : "absent";
    return { key: kind, name, state };
  });
  const extra = connectors
    .filter((c) => !KNOWN_CONNECTORS.some((k) => k.kind === c.kind))
    .map((c) => ({ key: c.id, name: c.name, state: (c.connected ? "connected" : "offline") as ConnState }));
  return [...rows, ...extra];
}

/** `open`/`onOpenChange` are controlled from Toolbar() so the Connectors
 * view's "Add connector" accent action can open the same popover this
 * indicator's own trigger opens — see the `action` mapping in Toolbar()
 * for why: there's no store-level "start adding a connector" request to
 * hook into (connectors self-pair; ConnectorsPage.tsx is out of scope for
 * this change), so reusing this real, already-informative surface beats
 * inventing new state or shipping a button that does nothing. */
function ConnectionIndicator({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const connectors = useStore((s) => s.connectors);
  const hubPort = useStore((s) => s.hubPort);
  const setView = useStore((s) => s.setView);
  const connectedCount = connectors.filter((c) => c.connected).length;
  const rows = connectionRows(connectors);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${connectedCount} connector${connectedCount === 1 ? "" : "s"} connected. Open connection status.`}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors duration-fast ease-standard hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              connectedCount > 0 ? "bg-success" : "bg-muted-foreground/40",
            )}
          />
          <span className="truncate">{connectedCount} connected</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-64 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
      >
        <p className="text-meta font-medium text-popover-foreground">Connections</p>
        <p className="mt-0.5 text-label text-muted-foreground">Local hub · localhost:{hubPort ?? "…"}</p>
        <div className="mt-3 flex flex-col gap-2">
          {rows.map(({ key, name, state }) => {
            const s = connStateStyles(state);
            return (
              <div key={key} className="flex items-center gap-2 text-meta">
                <span className={cn("size-2 shrink-0 rounded-full", s.dot)} />
                <span className="min-w-0 flex-1 truncate text-foreground">{name}</span>
                <span className={cn("shrink-0 text-label", s.text)}>{s.label}</span>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setView("connectors")}
          className="mt-3 w-full border-t border-border pt-3 text-left text-label font-medium text-primary transition-colors duration-fast ease-standard hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Manage connectors →
        </button>
      </PopoverContent>
    </Popover>
  );
}

/** The toolbar's one contextual accent action, per view — "New capsule" on
 * Overview and Capsules (both are places a user starts one from), "Add
 * project" on Projects, "Add connector" on Connectors, and nothing on
 * Activity or Settings (there's no single sensible "create" for either).
 * This is the toolbar's one spendable accent: Sidebar.tsx's selected-row
 * pill is deliberately neutral (see its DELIBERATE DIVERGENCE comment) so
 * the accent budget (`expectAtMostOneAccent`) is spent here or not at all.
 *
 * `requestNewTask`/`requestNewProject` are the same store actions the
 * ⌘⇧N/⌘N global shortcuts already drive (App.tsx) — reused rather than
 * reinvented so this button and the shortcut always agree on what "new"
 * means. Connectors has no equivalent store request (see
 * ConnectionIndicator's doc comment above), so its action opens that
 * popover instead. */
function useContextualAction(
  view: NavKey,
  openConnectionPopover: () => void,
): { label: string; onClick: () => void } | null {
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
      return { label: "Add connector", onClick: openConnectionPopover };
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
  const [connectionPopoverOpen, setConnectionPopoverOpen] = useState(false);
  // `view` traces back to `readPrefs()`'s unvalidated `JSON.parse` of
  // `landingPage` (store.ts), which never checks the persisted value against
  // `NavKey` — a stale/hand-edited localStorage value can produce a `view`
  // that matches no NAV_ITEMS/SETTINGS_ITEM entry. Falling back to `""`
  // would render a heading with no accessible name; NAV_ITEMS[0] is always
  // present, so it's used as a known-good label instead.
  const title =
    [...NAV_ITEMS, SETTINGS_ITEM].find((item) => item.key === view)?.label ?? NAV_ITEMS[0].label;

  const action = useContextualAction(view, () => setConnectionPopoverOpen(true));

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
      <ConnectionIndicator open={connectionPopoverOpen} onOpenChange={setConnectionPopoverOpen} />
      <div className="flex-1" />
      <SearchTrigger />
      {action && <ContextualAction label={action.label} onClick={action.onClick} />}
    </header>
  );
}
