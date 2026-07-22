import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useStore } from "../store";

interface GitStatus {
  branch: string | null;
  dirty: boolean;
  changedCount: number;
  ahead: number;
  behind: number;
}

export function GitLine({ projectId }: { projectId: string }) {
  const activationNonce = useStore((s) => s.activationNonce);
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

  // A task activation elsewhere may have git-first restored a capsule,
  // switching this project's branch out from under it — refetch (without
  // remounting, so any in-flight note/local state here survives) whenever
  // the global activation nonce bumps.
  useEffect(() => {
    refresh();
  }, [activationNonce]);

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
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      {s ? (
        <span className={s.dirty ? "text-warning" : "text-muted-foreground"}>
          ⎇ {s.branch ?? "detached"}
          {s.changedCount > 0 && ` · ${s.changedCount} changed`}
          {s.ahead > 0 && ` ↑${s.ahead}`}
          {s.behind > 0 && ` ↓${s.behind}`}
        </span>
      ) : (
        <span className="text-muted-foreground/70">git…</span>
      )}
      <button
        onClick={() => run("git_fetch", {}, "fetched")}
        disabled={busy}
        className="rounded border border-input px-2 py-0.5 text-foreground hover:bg-accent disabled:opacity-40"
      >
        Fetch
      </button>
      <select
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        className="rounded border border-input bg-transparent px-1 py-0.5 text-foreground"
      >
        <option value="">branch…</option>
        {branches.map((b) => (
          <option key={b} value={b}>{b}</option>
        ))}
      </select>
      <button
        onClick={() => run("git_checkout", { branch: target }, `switched to ${target}`)}
        disabled={busy || !target || target === s?.branch}
        className="rounded border border-input px-2 py-0.5 text-foreground hover:bg-accent disabled:opacity-40"
      >
        Switch
      </button>
      <input
        value={newBranch}
        onChange={(e) => setNewBranch(e.target.value)}
        placeholder="new branch"
        className="w-28 rounded border border-input bg-transparent px-1 py-0.5 text-foreground placeholder:text-muted-foreground"
      />
      <button
        onClick={() => run("git_create_branch", { name: newBranch }, `created ${newBranch}`).then(() => setNewBranch(""))}
        disabled={busy || !newBranch}
        className="rounded border border-input px-2 py-0.5 text-foreground hover:bg-accent disabled:opacity-40"
      >
        Create
      </button>
      {note && <span className="break-all text-muted-foreground">{note}</span>}
    </div>
  );
}
