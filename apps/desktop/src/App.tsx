import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { CommandSender } from "./panels/CommandSender";
import { ConnectorsPanel } from "./panels/ConnectorsPanel";
import { LogPanel } from "./panels/LogPanel";
import {
  useStore,
  type ConnectorInfo,
  type KnownConnector,
  type PendingPairing,
  type PersistedEvent,
} from "./store";
import { ProjectsView } from "./views/ProjectsView";

export default function App() {
  const append = useStore((s) => s.append);
  const setConnectors = useStore((s) => s.setConnectors);
  const preload = useStore((s) => s.preload);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const pairings = useStore((s) => s.pairings);
  const setPairings = useStore((s) => s.setPairings);
  const addPairing = useStore((s) => s.addPairing);
  const removePairing = useStore((s) => s.removePairing);

  useEffect(() => {
    const refresh = () =>
      invoke<ConnectorInfo[]>("connectors")
        .then(setConnectors)
        .catch((e) => console.error("connectors refresh failed:", e));

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

    const unlisten = listen<{ type: string; [k: string]: unknown }>("hub-event", (e) => {
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
    return () => {
      unlisten.then((f) => f());
    };
  }, [append, setConnectors, preload, setPairings, addPairing]);

  async function decide(pairingId: string, ok: boolean) {
    try {
      await invoke(ok ? "approve_pairing" : "deny_pairing", { pairingId });
    } catch (e) {
      console.error("pairing decision failed:", e);
    }
    removePairing(pairingId);
  }

  const tab = (v: "projects" | "debug", label: string) => (
    <button
      onClick={() => setView(v)}
      className={`px-3 py-1 ${view === v ? "bg-neutral-700" : "bg-neutral-800"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="h-screen bg-neutral-900 text-neutral-200 font-mono text-sm flex flex-col">
      {pairings.map((p) => (
        <div key={p.pairingId} className="flex items-center gap-3 p-2 bg-amber-950 border-b border-amber-800 text-sm">
          <span className="flex-1">
            <b>{p.name}</b> ({p.kind}) wants to connect to OmniBus
          </span>
          <button onClick={() => decide(p.pairingId, true)} className="bg-green-900 px-3 py-1">
            approve
          </button>
          <button onClick={() => decide(p.pairingId, false)} className="bg-neutral-800 px-3 py-1">
            deny
          </button>
        </div>
      ))}
      <header className="flex gap-2 p-2 border-b border-neutral-700">
        {tab("projects", "Projects")}
        {tab("debug", "Debug")}
      </header>
      {view === "projects" ? (
        <ProjectsView />
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-[300px_1fr] grid-rows-[1fr_200px]">
          <ConnectorsPanel />
          <LogPanel />
          <CommandSender />
        </div>
      )}
    </div>
  );
}
