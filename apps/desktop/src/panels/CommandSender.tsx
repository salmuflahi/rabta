import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useStore } from "../store";

export function CommandSender() {
  const connectors = useStore((s) => s.connectors);
  const [target, setTarget] = useState("");
  const [name, setName] = useState("workspace.open");
  const [args, setArgs] = useState('{"path": "/tmp/demo"}');
  const [result, setResult] = useState("");

  async function send() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(args);
    } catch {
      setResult("error: args is not valid JSON");
      return;
    }
    try {
      const res = await invoke("send_command", { target, name, args: parsed });
      setResult(JSON.stringify(res, null, 2));
    } catch (e) {
      setResult(`error: ${e}`);
    }
  }

  return (
    <div className="p-2 flex gap-2 min-h-0">
      <div className="flex flex-col gap-2 w-72">
        <select value={target} onChange={(e) => setTarget(e.target.value)} className="bg-neutral-800 p-1">
          <option value="">pick a connector</option>
          {connectors.filter((c) => c.connected).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="command name"
          className="bg-neutral-800 p-1"
        />
        <button onClick={send} disabled={!target} className="bg-neutral-700 py-1 disabled:opacity-40">
          send
        </button>
      </div>
      <textarea value={args} onChange={(e) => setArgs(e.target.value)} className="bg-neutral-800 p-1 flex-1" />
      <pre className="flex-1 overflow-auto bg-neutral-950 p-2 text-xs">{result}</pre>
    </div>
  );
}
