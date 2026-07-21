import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useStore, type Task, type TaskResource } from "../store";

interface ActivateSummary {
  applied: string[];
  pending: string[];
  skipped: string[];
  savedPrevious: string | null;
  errors: string[];
}

interface SaveSummary {
  captured: string[];
  skipped: string[];
}

function summarize(r: TaskResource): string {
  if (r.connectorKind === "git") {
    return `git: ${typeof r.payload.branch === "string" ? r.payload.branch : "?"}`;
  }
  const files = Array.isArray(r.payload.openFiles) ? r.payload.openFiles.length : 0;
  const terms = Array.isArray(r.payload.terminals) ? r.payload.terminals.length : 0;
  return `${r.connectorKind}: ${files} files, ${terms} terminals · ${new Date(r.createdAt).toLocaleTimeString()}`;
}

export function TasksSection({ projectId }: { projectId: string }) {
  const activeTaskId = useStore((s) => s.activeTaskId);
  const setActiveTaskId = useStore((s) => s.setActiveTaskId);
  const bumpActivation = useStore((s) => s.bumpActivation);
  const activationNonce = useStore((s) => s.activationNonce);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [resources, setResources] = useState<Record<string, TaskResource[]>>({});
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  // Guards against double-click re-entrancy: the backend now serializes
  // activation/save, but the UI should still reflect an op in flight rather
  // than let the user queue up duplicate clicks.
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const list = await invoke<Task[]>("list_tasks", { projectId });
      setTasks(list);
      const entries = await Promise.all(
        list.map(async (t) => [t.id, await invoke<TaskResource[]>("task_resources", { taskId: t.id })] as const)
      );
      setResources(Object.fromEntries(entries));
    } catch (e) {
      console.error("tasks refresh failed:", e);
    }
  };

  useEffect(() => {
    refresh();
  }, [projectId]);

  // Refetch (not remount) when any project's task activation bumps the
  // global nonce, so cross-project capsule summaries stay fresh without
  // discarding this section's local state (title draft, delete confirm,
  // or — if this is the acting section — the activation `note` it just set).
  useEffect(() => {
    refresh();
  }, [activationNonce]);

  async function addTask() {
    setBusy(true);
    try {
      await invoke("create_task", { projectId, title });
      setTitle("");
      refresh();
    } catch (e) {
      setNote(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function activate(id: string) {
    setBusy(true);
    setNote("activating…");
    try {
      const s = await invoke<ActivateSummary>("activate_task", { taskId: id });
      setActiveTaskId(id);
      const parts = [
        s.applied.length ? `applied: ${s.applied.join(", ")}` : "",
        s.pending.length ? `pending editor reload: ${s.pending.join(", ")}` : "",
        s.skipped.length ? `not connected: ${s.skipped.join(", ")}` : "",
        s.savedPrevious ? "previous task saved" : "",
        ...s.errors,
      ].filter(Boolean);
      setNote(parts.join(" · ") || "activated (no capsule yet)");
      // Activation may have auto-saved the previously-active task, which
      // can live in a different project — bump the global nonce so every
      // TasksSection refetches and none show a stale capsule summary.
      bumpActivation();
      refresh();
    } catch (e) {
      setNote(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function save(id: string) {
    setBusy(true);
    setNote("saving…");
    try {
      const s = await invoke<SaveSummary>("save_capsule", { taskId: id });
      setNote(s.captured.length ? `saved: ${s.captured.join(", ")}` : "nothing connected to save");
      refresh();
    } catch (e) {
      setNote(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(t: Task) {
    setBusy(true);
    try {
      await invoke("set_task_status", { id: t.id, status: t.status === "open" ? "done" : "open" });
      refresh();
    } catch (e) {
      setNote(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await invoke("delete_task", { id });
      setConfirming(null);
      refresh();
    } catch (e) {
      setNote(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 border-t border-neutral-800 pt-2 flex flex-col gap-1">
      {tasks.map((t) => (
        <div
          key={t.id}
          className={`p-1 flex items-center gap-2 text-xs ${t.id === activeTaskId ? "bg-neutral-800 border-l-2 border-green-600" : ""}`}
        >
          <span className={`flex-1 ${t.status === "done" ? "line-through text-neutral-600" : ""}`}>
            {t.title}
          </span>
          <span className="text-neutral-500">
            {(resources[t.id] ?? []).map(summarize).join(" | ") || "no capsule"}
          </span>
          <button
            onClick={() => activate(t.id)}
            disabled={busy}
            className="bg-neutral-700 px-2 disabled:opacity-40"
          >
            activate
          </button>
          <button
            onClick={() => save(t.id)}
            disabled={busy}
            className="bg-neutral-800 px-2 disabled:opacity-40"
          >
            save state
          </button>
          <button
            onClick={() => toggleStatus(t)}
            disabled={busy}
            className="bg-neutral-800 px-2 disabled:opacity-40"
          >
            {t.status === "open" ? "done" : "reopen"}
          </button>
          {confirming === t.id ? (
            <>
              <button
                onClick={() => remove(t.id)}
                disabled={busy}
                className="bg-red-900 px-2 disabled:opacity-40"
              >
                confirm
              </button>
              <button onClick={() => setConfirming(null)} className="bg-neutral-800 px-2">
                cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirming(t.id)}
              disabled={busy}
              className="bg-neutral-800 px-2 disabled:opacity-40"
            >
              delete
            </button>
          )}
        </div>
      ))}
      <div className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="new task title"
          className="bg-neutral-800 p-1 flex-1 text-xs"
        />
        <button
          onClick={addTask}
          disabled={!title || busy}
          className="bg-neutral-700 px-2 text-xs disabled:opacity-40"
        >
          add task
        </button>
      </div>
      {note && <div className="text-neutral-400 text-xs">{note}</div>}
    </div>
  );
}
