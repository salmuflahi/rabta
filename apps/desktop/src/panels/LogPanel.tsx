import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";

const KINDS = [
  "all",
  "connectorConnected",
  "connectorDisconnected",
  "commandSent",
  "responseReceived",
  "eventReceived",
];

export function LogPanel() {
  const log = useStore((s) => s.log);
  const paused = useStore((s) => s.paused);
  const togglePause = useStore((s) => s.togglePause);
  const connectors = useStore((s) => s.connectors);
  const [kindFilter, setKindFilter] = useState("all");
  const [connFilter, setConnFilter] = useState("all");
  const scroller = useRef<HTMLDivElement>(null);

  const entryConnectorId = (e: Record<string, unknown>) =>
    (e.connectorId as string | undefined) ??
    (e.connector as { id?: string } | undefined)?.id;

  const shown = log.filter(
    (e) =>
      (kindFilter === "all" || e.type === kindFilter) &&
      (connFilter === "all" || entryConnectorId(e) === connFilter)
  );

  useEffect(() => {
    if (!paused) scroller.current?.scrollTo(0, scroller.current.scrollHeight);
  }, [log, paused]);

  return (
    <div className="flex flex-col border-b border-neutral-700 min-h-0">
      <div className="flex gap-2 p-2 border-b border-neutral-800 items-center">
        <h2 className="text-neutral-400 uppercase text-xs flex-1">Activity log</h2>
        <select value={connFilter} onChange={(e) => setConnFilter(e.target.value)} className="bg-neutral-800 p-1">
          <option value="all">all connectors</option>
          {connectors.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className="bg-neutral-800 p-1">
          {KINDS.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
        <button onClick={togglePause} className="bg-neutral-800 px-2 py-1">
          {paused ? "resume" : "pause"}
        </button>
      </div>
      <div ref={scroller} className="flex-1 overflow-y-auto p-2 text-xs">
        {shown.map((e) => (
          <div key={e.seq} className="whitespace-pre-wrap break-all">
            <span className="text-neutral-500">{e.at}</span>{" "}
            <span className="text-neutral-400">{e.type}</span> {JSON.stringify(e)}
          </div>
        ))}
      </div>
    </div>
  );
}
