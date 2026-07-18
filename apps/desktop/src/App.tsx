import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { CommandSender } from "./panels/CommandSender";
import { ConnectorsPanel } from "./panels/ConnectorsPanel";
import { LogPanel } from "./panels/LogPanel";
import { useStore, type ConnectorInfo } from "./store";

export default function App() {
  const append = useStore((s) => s.append);
  const setConnectors = useStore((s) => s.setConnectors);

  useEffect(() => {
    const refresh = () =>
      invoke<ConnectorInfo[]>("connectors")
        .then(setConnectors)
        .catch((err) => console.error("failed to refresh connectors", err));
    refresh();
    const unlisten = listen<{ type: string; [k: string]: unknown }>("hub-event", (e) => {
      append(e.payload);
      if (e.payload.type === "connectorConnected" || e.payload.type === "connectorDisconnected") {
        refresh();
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [append, setConnectors]);

  return (
    <div className="h-screen bg-neutral-900 text-neutral-200 grid grid-cols-[300px_1fr] grid-rows-[1fr_200px] font-mono text-sm">
      <ConnectorsPanel />
      <LogPanel />
      <CommandSender />
    </div>
  );
}
