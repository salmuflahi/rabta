import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { LiveRegion } from "./components/ui/live-region";
import { announce } from "./lib/announce";
import { saveCapsule } from "./lib/capsule";
import { describeEvent } from "./lib/humanize";
import { toastOk } from "./lib/toast";
import { useSessionTracking } from "./lib/useSessionTracking";
import { ActivityPage } from "./pages/ActivityPage";
import { CapsulesPage } from "./pages/CapsulesPage";
import { ConnectorsPage } from "./pages/ConnectorsPage";
import { OverviewPage } from "./pages/OverviewPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { AppShell } from "./shell/AppShell";
import { MigrateSheet } from "./features/migrate/MigrateSheet";
import { PairingSheet } from "./features/pairing/PairingSheet";
import { CommandPalette } from "./shell/CommandPalette";
import {
  useStore,
  type ConnectorInfo,
  type KnownConnector,
  type NavKey,
  type PendingPairing,
  type PersistedEvent,
} from "./store";

function CurrentPage({ view }: { view: NavKey }) {
  switch (view) {
    case "overview":
      return <OverviewPage />;
    case "capsules":
      return <CapsulesPage />;
    case "projects":
      return <ProjectsPage />;
    case "connectors":
      return <ConnectorsPage />;
    case "activity":
      return <ActivityPage />;
    case "settings":
      return <SettingsPage />;
    default: {
      // NavKey is a closed union — every view is handled above. This keeps
      // the switch exhaustive so a new view can't silently render nothing.
      const _exhaustive: never = view;
      return _exhaustive;
    }
  }
}

export default function App() {
  const append = useStore((s) => s.append);
  const setConnectors = useStore((s) => s.setConnectors);
  const setConnectorsAndLogLoaded = useStore((s) => s.setConnectorsAndLogLoaded);
  const preload = useStore((s) => s.preload);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const activeTaskId = useStore((s) => s.activeTaskId);
  const requestResume = useStore((s) => s.requestResume);
  const requestNewProject = useStore((s) => s.requestNewProject);
  const requestNewTask = useStore((s) => s.requestNewTask);
  const setPairings = useStore((s) => s.setPairings);
  const addPairing = useStore((s) => s.addPairing);
  const setHubPort = useStore((s) => s.setHubPort);
  const toggleCommandOpen = useStore((s) => s.toggleCommandOpen);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const setFullscreen = useStore((s) => s.setFullscreen);

  useSessionTracking();

  // Track native macOS fullscreen so the frame can drop the traffic-light
  // reservation and narrow the collapsed rail. Guarded so non-Tauri contexts
  // (tests) simply stay windowed.
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        const sync = async () => {
          try {
            setFullscreen(await win.isFullscreen());
          } catch {
            /* ignore */
          }
        };
        await sync();
        const un = await win.onResized(() => void sync());
        if (cancelled) un();
        else unlisten = un;
      } catch {
        /* not running in Tauri — stay windowed */
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [setFullscreen]);

  // Resume-on-launch (Settings → Behavior): if enabled and a task is active,
  // route to Capsules and drive the existing Resume path once on startup.
  useEffect(() => {
    if (!useStore.getState().prefs.resumeOnLaunch) return;
    invoke<string | null>("active_task")
      .then((id) => {
        if (id) {
          requestResume(id);
          setView("capsules");
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // First-run onboarding: a brand-new user (no projects) lands on the guided
  // Overview — with its Get-started checklist — rather than a bare Capsules
  // empty state. The saved landing preference only makes sense once there's a
  // workspace to return to, so it's respected as soon as any project exists.
  useEffect(() => {
    invoke<unknown[]>("list_projects")
      .then((p) => {
        if (p.length === 0) setView("overview");
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const refresh = () =>
      invoke<ConnectorInfo[]>("connectors")
        .then(setConnectors)
        .catch((e) => console.error("connectors refresh failed:", e));

    // Subscribe before issuing any initial-load invokes so an event that
    // fires while a snapshot request is still in flight is never missed by
    // a not-yet-registered listener (and can't be clobbered by a stale
    // snapshot landing afterward — setPairings merges rather than replaces).
    const unlistenPromise = listen<{ type: string; [k: string]: unknown }>("hub-event", (e) => {
      append(e.payload);
      if (e.payload.type === "connectorConnected" || e.payload.type === "connectorDisconnected") {
        refresh();
        // Same "<name> connected"/"<name> disconnected" sentence the
        // Activity log already prints for these two event types
        // (humanize.ts's describeEvent) — reused rather than re-derived so
        // the announcement can never drift from what's on screen.
        // `resolveName` reads the store fresh via getState() rather than
        // closing over a selector: this listener is registered once on
        // mount, so a value captured from this effect's own render would
        // stay pinned to the connectors list as it was at mount (empty) and
        // never resolve a later reconnect's name. Read before refresh()'s
        // promise settles, while the disconnecting connector's row is still
        // in the list as "connected" — refresh() only marks it disconnected
        // once the new snapshot lands, asynchronously.
        const resolveName = (id: string) =>
          useStore.getState().connectors.find((c) => c.id === id)?.name;
        announce(describeEvent(e.payload, resolveName).sentence);
      }
      if (e.payload.type === "pairingRequested") {
        addPairing({
          pairingId: e.payload.pairingId as string,
          name: e.payload.name as string,
          kind: e.payload.kind as string,
        });
      }
    });

    unlistenPromise.then(() => {
      Promise.all([
        invoke<PersistedEvent[]>("recent_events", { limit: 200 }),
        invoke<KnownConnector[]>("known_connectors"),
      ])
        .then(([events, known]) => preload(events, known))
        .catch((e) => console.error("history preload failed:", e))
        .then(refresh)
        // Marks the initial connector+log preload settled (success or
        // failure) — refresh()'s own internal .catch means this always
        // fires. ConnectorsPage/ActivityPage gate their loading skeleton on
        // it, since `connectors`/`log` starting empty is otherwise
        // indistinguishable from "loaded and genuinely empty".
        .then(() => setConnectorsAndLogLoaded(true));

      invoke<PendingPairing[]>("pending_pairings")
        .then(setPairings)
        .catch((e) => console.error("pending pairings refresh failed:", e));
    });

    return () => {
      unlistenPromise.then((f) => f());
    };
  }, [append, setConnectors, preload, setPairings, addPairing, setConnectorsAndLogLoaded]);

  useEffect(() => {
    invoke<number>("hub_port")
      .then(setHubPort)
      .catch(() => {});
  }, [setHubPort]);

  // Global shortcuts: ⌘K (palette, existing), ⌘\ (toggle sidebar), ⌘N (new
  // project), ⌘⇧N (new capsule/task), ⌘R (resume last). Escape-to-close for
  // the palette is handled by Radix Dialog inside CommandPalette itself.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();

      // ⌘K is a search launcher — it fires everywhere, including while
      // typing in a field, so it's handled before the input guard below.
      if (key === "k") {
        e.preventDefault();
        toggleCommandOpen();
        return;
      }

      // ⌘\ toggles the sidebar rail — also a global chrome action, so it
      // fires before the input guard just like ⌘K.
      if (key === "\\") {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      // ⌘1–5 jump to the primary views; ⌘, opens Settings. Global chrome
      // navigation (matches the tooltips on the nav rows), so it fires before
      // the input guard too — a bare digit isn't something you'd type into a
      // field with ⌘ held.
      if (key >= "1" && key <= "5") {
        e.preventDefault();
        const order: NavKey[] = ["overview", "capsules", "projects", "connectors", "activity"];
        setView(order[Number(key) - 1]);
        return;
      }
      if (key === ",") {
        e.preventDefault();
        setView("settings");
        return;
      }

      // ⌘[ / ⌘] — the macOS standard back/forward binding, matching the
      // toolbar chevrons.
      if (e.metaKey && !e.shiftKey && e.key === "[") {
        e.preventDefault();
        useStore.getState().goBack();
        return;
      }
      if (e.metaKey && !e.shiftKey && e.key === "]") {
        e.preventDefault();
        useStore.getState().goForward();
        return;
      }

      // ⌘S saves the active capsule from anywhere (heads-down in the editor,
      // you shouldn't have to come back to the Capsules page to capture).
      if (key === "s") {
        e.preventDefault();
        if (activeTaskId) void saveCapsule(activeTaskId);
        else toastOk("No active capsule to save");
        return;
      }

      // Input guard: don't let ⌘N/⌘⇧N/⌘R hijack typing "n"/"r" with a stray
      // modifier while focus is in a text field.
      const target = e.target as HTMLElement | null;
      const isEditable =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (isEditable) return;

      // Check the shift variant (⌘⇧N) first — both it and plain ⌘N match
      // key === "n".
      if (key === "n" && e.shiftKey) {
        e.preventDefault();
        setView("capsules");
        requestNewTask();
        return;
      }

      if (key === "n") {
        e.preventDefault();
        setView("projects");
        requestNewProject();
        return;
      }

      if (key === "r") {
        e.preventDefault();
        if (activeTaskId) {
          requestResume(activeTaskId);
          setView("capsules");
        } else {
          toastOk("No recent capsule to resume");
        }
        return;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    toggleCommandOpen,
    toggleSidebar,
    setView,
    activeTaskId,
    requestResume,
    requestNewProject,
    requestNewTask,
  ]);

  return (
    <div className="flex h-screen min-w-0 flex-col overflow-hidden">
      {/* Screen-reader announcements — mounted exactly once, app-wide. See
          lib/announce.ts; every call site routes through announce() rather
          than rendering aria-live itself. */}
      <LiveRegion />
      <div className="min-h-0 flex-1">
        <MigrateSheet />
        <PairingSheet />
        <AppShell>
          <CurrentPage view={view} />
        </AppShell>
      </div>
      <CommandPalette />
    </div>
  );
}
