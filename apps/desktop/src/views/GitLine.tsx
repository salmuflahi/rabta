import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

interface GitStatus {
  branch: string | null;
  dirty: boolean;
  changedCount: number;
  ahead: number;
  behind: number;
}

export function GitLine({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [target, setTarget] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      setStatus(await invoke<GitStatus>("git_status", { projectId }));
      setBranches(await invoke<string[]>("git_branches", { projectId }));
    } catch (e) {
      setNote(String(e));
    }
  };

  useEffect(() => {
    refresh();
  }, [projectId]);

  async function run(command: string, args: Record<string, unknown>, okNote: string) {
    setBusy(true);
    setNote("");
    try {
      await invoke(command, { projectId, ...args });
      setNote(okNote);
      await refresh();
    } catch (e) {
      setNote(String(e));
    } finally {
      setBusy(false);
    }
  }

  const s = status;
  return (
    <div className="mt-1 flex items-center gap-2 text-xs flex-wrap">
      {s ? (
        <span className={s.dirty ? "text-amber-400" : "text-neutral-400"}>
          ⎇ {s.branch ?? "detached"}
          {s.changedCount > 0 && ` · ${s.changedCount} changed`}
          {s.ahead > 0 && ` ↑${s.ahead}`}
          {s.behind > 0 && ` ↓${s.behind}`}
        </span>
      ) : (
        <span className="text-neutral-600">git…</span>
      )}
      <button onClick={() => run("git_fetch", {}, "fetched")} disabled={busy} className="bg-neutral-800 px-2 disabled:opacity-40">
        fetch
      </button>
      <select value={target} onChange={(e) => setTarget(e.target.value)} className="bg-neutral-800 p-0.5">
        <option value="">branch…</option>
        {branches.map((b) => (
          <option key={b} value={b}>{b}</option>
        ))}
      </select>
      <button
        onClick={() => run("git_checkout", { branch: target }, `switched to ${target}`)}
        disabled={busy || !target || target === s?.branch}
        className="bg-neutral-700 px-2 disabled:opacity-40"
      >
        switch
      </button>
      <input
        value={newBranch}
        onChange={(e) => setNewBranch(e.target.value)}
        placeholder="new branch"
        className="bg-neutral-800 p-0.5 w-28"
      />
      <button
        onClick={() => run("git_create_branch", { name: newBranch }, `created ${newBranch}`).then(() => setNewBranch(""))}
        disabled={busy || !newBranch}
        className="bg-neutral-800 px-2 disabled:opacity-40"
      >
        create
      </button>
      {note && <span className="text-neutral-400 break-all">{note}</span>}
    </div>
  );
}
