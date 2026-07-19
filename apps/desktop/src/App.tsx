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
  type PersistedEvent,
} from "./store";
import { ProjectsView } from "./views/ProjectsView";

export default function App() {
  const append = useStore((s) => s.append);
  const setConnectors = useStore((s) => s.setConnectors);
  const preload = useStore((s) => s.preload);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);

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

    const unlisten = listen<{ type: string; [k: string]: unknown }>("hub-event", (e) => {
      append(e.payload);
      if (e.payload.type === "connectorConnected" || e.payload.type === "connectorDisconnected") {
        refresh();
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [append, setConnectors, preload]);

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
