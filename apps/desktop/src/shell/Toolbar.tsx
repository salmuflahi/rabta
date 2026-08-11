import { Icon } from "@/components/ui/icon";
import { Kbd } from "@/components/ui/kbd";
import { EASE } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useStore, type NavKey } from "@/store";
import { NAV_ITEMS, SETTINGS_ITEM } from "./nav";
import { CHROME_INSET_PX, SIDEBAR_MOTION_MS, TOOLBAR_HEIGHT_CLASS, chromeLeadWidthPx } from "./titlebar";

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

/** The contextual action a view can offer in the toolbar — see
 * `useContextualAction` below for the per-view mapping. Nothing renders when a
 * view has none (Activity, Settings): the toolbar never defaults to something
 * generic just to fill the corner.
 *
 * `demoted` renders the same button in neutral chrome instead of the accent.
 * The button stays put and keeps working either way — only its claim to being
 * *the* action on screen goes away, which is the whole of what the accent
 * says. See the accent note on `useContextualAction` for when that happens
 * and why the button is demoted rather than hidden. */
function ContextualAction({
  label,
  onClick,
  demoted,
}: {
  label: string;
  onClick: () => void;
  demoted: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-[5px] rounded-md pl-2 pr-2.5 text-meta font-510 transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        demoted
          ? "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          : "bg-primary text-primary-foreground hover:bg-primary/90",
      )}
    >
      <Icon name="plus" className="size-3 shrink-0" />
      {label}
    </button>
  );
}

/** Browser-style back/forward, now live against the store's navigation
 * history (src/shell/history.ts).
 *
 * DELIBERATE DIVERGENCE from the handoff, which specifies both as dead
 * chrome ("back is disabled at 50% opacity") and wires neither to a
 * handler. A permanently disabled control in a shipping app reads as broken
 * software rather than as restraint — so these navigate. The handoff's
 * rendered `opacity:.4` is kept for the genuinely-disabled state, where it
 * now means "nothing behind you" rather than "not built".
 *
 * Labels name the destination because that is the whole point of making
 * them live: "Back to Capsules" tells you what will happen, "Back" does
 * not. */
function HistoryChevrons() {
  const history = useStore((s) => s.history);
  const historyIndex = useStore((s) => s.historyIndex);
  const goBack = useStore((s) => s.goBack);
  const goForward = useStore((s) => s.goForward);

  const back = historyIndex > 0 ? history[historyIndex - 1] : undefined;
  const forward = historyIndex < history.length - 1 ? history[historyIndex + 1] : undefined;

  const label = (dir: "Back" | "Forward", loc: { view: NavKey } | undefined) =>
    loc
      ? `${dir} to ${[...NAV_ITEMS, SETTINGS_ITEM].find((i) => i.key === loc.view)?.label ?? NAV_ITEMS[0].label}`
      : dir;

  return (
    <div className="ml-0.5 flex shrink-0 items-center overflow-hidden rounded-md bg-secondary shadow-[0_0_0_0.5px_hsl(var(--border))]">
      <button
        type="button"
        disabled={!back}
        onClick={goBack}
        aria-label={label("Back", back)}
        title={label("Back", back)}
        className="grid h-[22px] w-[27px] place-items-center text-tertiary-foreground transition-opacity duration-fast ease-standard hover:text-foreground disabled:opacity-40 disabled:hover:text-tertiary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon name="chevron-left" className="size-3" />
      </button>
      <span aria-hidden className="h-[13px] w-px shrink-0 bg-border" />
      <button
        type="button"
        disabled={!forward}
        onClick={goForward}
        aria-label={label("Forward", forward)}
        title={label("Forward", forward)}
        className="grid h-[22px] w-[27px] place-items-center text-muted-foreground transition-opacity duration-fast ease-standard hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
 * button there would create nothing).
 *
 * THE ACCENT IS NOT UNCONDITIONALLY THIS BUTTON'S. Within the chrome it is:
 * Sidebar.tsx's selected-row pill is deliberately neutral (see its DELIBERATE
 * DIVERGENCE comment) so the toolbar is the only chrome that can spend one.
 * But a screen is the chrome *plus the page*, and Overview and Capsules — the
 * two views this offers "New capsule" on — carry a real primary action of
 * their own: the hero's "Resume", the detail pane's "Restore"/"Capture". Both
 * were live at the same time as this button, two unlayered accents on one
 * screen, until pages began declaring their spend (`useOwnsViewAccent`,
 * src/shell/viewAccent.ts). It went unnoticed because the page tests render
 * pages without this toolbar and the toolbar tests render it without a page;
 * App.test.tsx now renders both together on both views.
 *
 * When a page holds the claim, this button renders neutral instead. Demoted,
 * not hidden: "New capsule" is the only create affordance Overview has, and a
 * control that vanishes when you open a capsule is a worse answer than one
 * that stays put and stops shouting. What the accent means — *the* action on
 * this screen — is exactly what's given up, and only for as long as the page
 * has a better claim to it. Overview with nothing open holds no claim, so the
 * button is orange there, which is right: with nothing to resume, starting one
 * is the primary action.
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
  const fullscreen = useStore((s) => s.fullscreen);
  // `view` traces back to `readPrefs()`'s unvalidated `JSON.parse` of
  // `landingPage` (store.ts), which never checks the persisted value against
  // `NavKey` — a stale/hand-edited localStorage value can produce a `view`
  // that matches no NAV_ITEMS/SETTINGS_ITEM entry. Falling back to `""`
  // would render a heading with no accessible name; NAV_ITEMS[0] is always
  // present, so it's used as a known-good label instead.
  const title =
    [...NAV_ITEMS, SETTINGS_ITEM].find((item) => item.key === view)?.label ?? NAV_ITEMS[0].label;

  const action = useContextualAction(view);
  // Compared against `view`, not read as a bare flag: a claim is only current
  // if it belongs to the view actually on screen.
  const contentOwnsAccent = useStore((s) => s.accentOwnerView) === view;

  return (
    <header
      data-tauri-drag-region
      className={cn(
        TOOLBAR_HEIGHT_CLASS,
        "flex shrink-0 items-center gap-2 border-b-[0.5px] border-border bg-background pr-3",
        "backdrop-blur-[24px] backdrop-saturate-[1.8]",
      )}
      // Clearance for the window controls that sit *over* this strip once
      // the sidebar is out of the way: macOS's traffic lights (windowed
      // only — the OS draws them, this app never does) and AppShell's
      // pinned sidebar toggle. Both live at fixed window coordinates, so
      // all the Toolbar owes them is empty space before its own first
      // control; `chromeLeadWidthPx` derives how much from the very same
      // constants those positions are built from, and fullscreen's shorter
      // lead falls out of it for free.
      //
      // It animates rather than switching, because the sidebar now slides:
      // collapsing has to walk the toolbar's contents leftward to meet the
      // departing panel over the same 280ms, not jump them 107px the
      // instant the flag flips. Expanded, the lead is zero — the toggle is
      // over the sidebar then, not over here — and the strip falls back to
      // the plain chrome inset both regions share.
      //
      // Inline rather than the CHROME_INSET_CLASS utility because it's now
      // a moving value, and inline rather than a spacer element because the
      // header is a `gap-2` flex row: a zero-width spacer would still push
      // everything after it 8px right.
      style={{
        paddingLeft: CHROME_INSET_PX + (sidebarCollapsed ? chromeLeadWidthPx(fullscreen) : 0),
        transition: `padding-left ${SIDEBAR_MOTION_MS}ms ${EASE.mac}`,
      }}
    >
      <HistoryChevrons />
      <h1 className="ml-1.5 truncate text-body font-semibold tracking-[-0.005em] text-foreground">
        {title}
      </h1>
      <div className="flex-1" />
      <SearchTrigger />
      {action && (
        // Keyed by view, so a swap between two views that happen to share a
        // label (Overview and Capsules both show "New capsule") still
        // remounts and replays the fade instead of React diffing the button
        // in place and skipping straight to the new label — same keyed-page
        // pattern AppShell uses for the content pane below this toolbar.
        // Cross-fade only: label/colour logic stays in ContextualAction and
        // useContextualAction above, untouched.
        <div key={view} className="shrink-0 animate-page-in">
          <ContextualAction
            label={action.label}
            onClick={action.onClick}
            demoted={contentOwnsAccent}
          />
        </div>
      )}
    </header>
  );
}
