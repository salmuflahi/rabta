import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { Button } from "./components/ui/button";
import { decidePairing } from "./lib/pairing";
import { ActivityPage } from "./pages/ActivityPage";
import { CapsulesPage } from "./pages/CapsulesPage";
import { ConnectorsPage } from "./pages/ConnectorsPage";
import { OverviewPage } from "./pages/OverviewPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { AppShell } from "./shell/AppShell";
import { CommandPalette } from "./shell/CommandPalette";
import { PageHeader } from "./shell/PageHeader";
import {
  useStore,
  type ConnectorInfo,
  type KnownConnector,
  type NavKey,
  type PendingPairing,
  type PersistedEvent,
} from "./store";

const PLACEHOLDER_COPY: Record<NavKey, { eyebrow: string; title: string; subtitle: string }> = {
  overview: {
    eyebrow: "Home",
    title: "Overview",
    subtitle: "A dashboard summary of your workspace is coming in a later task.",
  },
  capsules: {
    eyebrow: "Workspace",
    title: "Capsules",
    subtitle: "Capsule browsing and detail views are coming in a later task.",
  },
  projects: {
    eyebrow: "Workspace",
    title: "Projects",
    subtitle: "The projects list and task board are coming in a later task.",
  },
  connectors: {
    eyebrow: "Workspace",
    title: "Connectors",
    subtitle: "Connector management is coming in a later task.",
  },
  activity: {
    eyebrow: "Workspace",
    title: "Activity",
    subtitle: "The live activity log is coming in a later task.",
  },
  settings: {
    eyebrow: "Workspace",
    title: "Settings",
    subtitle: "Settings are coming in a later task.",
  },
};

function PlaceholderPage({ view }: { view: NavKey }) {
  const { eyebrow, title, subtitle } = PLACEHOLDER_COPY[view];
  return (
    <div>
      <PageHeader eyebrow={eyebrow} title={title} subtitle={subtitle} />
      <p className="text-sm text-muted-foreground">Coming soon.</p>
    </div>
  );
}

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
    default:
      return <PlaceholderPage view={view} />;
  }
}

export default function App() {
  const append = useStore((s) => s.append);
  const setConnectors = useStore((s) => s.setConnectors);
  const preload = useStore((s) => s.preload);
  const view = useStore((s) => s.view);
  const pairings = useStore((s) => s.pairings);
  const setPairings = useStore((s) => s.setPairings);
  const addPairing = useStore((s) => s.addPairing);
  const removePairing = useStore((s) => s.removePairing);
  const setHubPort = useStore((s) => s.setHubPort);
  const toggleCommandOpen = useStore((s) => s.toggleCommandOpen);

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
        .then(refresh);

      invoke<PendingPairing[]>("pending_pairings")
        .then(setPairings)
        .catch((e) => console.error("pending pairings refresh failed:", e));
    });

    return () => {
      unlistenPromise.then((f) => f());
    };
  }, [append, setConnectors, preload, setPairings, addPairing]);

  useEffect(() => {
    invoke<number>("hub_port")
      .then(setHubPort)
      .catch(() => {});
  }, [setHubPort]);

  // Global ⌘K / Ctrl-K toggle for the command palette (Escape-to-close is
  // handled by Radix Dialog inside CommandPalette itself).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggleCommandOpen();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleCommandOpen]);

  function decide(pairing: PendingPairing, ok: boolean) {
    decidePairing(pairing, ok, removePairing);
  }

  return (
    <div className="flex h-screen flex-col">
      {pairings.map((p) => (
        <div key={p.pairingId} className="flex items-center gap-3 border-b border-warning/30 bg-warning/10 p-2 text-sm text-foreground">
          <span className="flex-1">
            <b>{p.name}</b> ({p.kind}) wants to connect to Rabta
          </span>
          <Button size="sm" onClick={() => decide(p, true)}>
            Approve
          </Button>
          <Button size="sm" variant="outline" onClick={() => decide(p, false)}>
            Deny
          </Button>
        </div>
      ))}
      <div className="min-h-0 flex-1">
        <AppShell>
          <CurrentPage view={view} />
        </AppShell>
      </div>
      <CommandPalette />
    </div>
  );
}
