import { useStore } from "../store";

export function ConnectorsPanel() {
  const connectors = useStore((s) => s.connectors);
  return (
    <div className="row-span-2 border-r border-neutral-700 p-3 overflow-y-auto">
      <h2 className="text-neutral-400 uppercase text-xs mb-2">Connectors</h2>
      {connectors.length === 0 && <div className="text-neutral-500">none connected</div>}
      {connectors.map((c) => (
        <div key={c.id} className="border border-neutral-700 p-2 mb-2">
          <div>
            <span className={c.connected ? "text-green-500" : "text-red-500"}>●</span> {c.name}{" "}
            <span className="text-neutral-500">({c.kind})</span>
          </div>
          <div className="text-neutral-500 break-all text-xs">{c.id}</div>
          <div className="text-neutral-400 text-xs">{c.capabilities.join(", ") || "—"}</div>
          <div className="text-neutral-500 text-xs">since {c.connectedSince}</div>
        </div>
      ))}
    </div>
  );
}
