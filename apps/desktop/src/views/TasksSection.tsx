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
  const files = Array.isArray(r.payload.openFiles) ? r.payload.openFiles.length : 0;
  const terms = Array.isArray(r.payload.terminals) ? r.payload.terminals.length : 0;
  return `${r.connectorKind}: ${files} files, ${terms} terminals · ${new Date(r.createdAt).toLocaleTimeString()}`;
}

export function TasksSection({ projectId }: { projectId: string }) {
  const activeTaskId = useStore((s) => s.activeTaskId);
  const setActiveTaskId = useStore((s) => s.setActiveTaskId);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [resources, setResources] = useState<Record<string, TaskResource[]>>({});
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);

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

  async function addTask() {
    try {
      await invoke("create_task", { projectId, title });
      setTitle("");
      refresh();
    } catch (e) {
      setNote(String(e));
    }
  }

  async function activate(id: string) {
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
      refresh();
    } catch (e) {
      setNote(String(e));
    }
  }

  async function save(id: string) {
    setNote("saving…");
    try {
      const s = await invoke<SaveSummary>("save_capsule", { taskId: id });
      setNote(s.captured.length ? `saved: ${s.captured.join(", ")}` : "nothing connected to save");
      refresh();
    } catch (e) {
      setNote(String(e));
    }
  }

  async function toggleStatus(t: Task) {
    try {
      await invoke("set_task_status", { id: t.id, status: t.status === "open" ? "done" : "open" });
      refresh();
    } catch (e) {
      setNote(String(e));
    }
  }

  async function remove(id: string) {
    try {
      await invoke("delete_task", { id });
      setConfirming(null);
      refresh();
    } catch (e) {
      setNote(String(e));
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
          <button onClick={() => activate(t.id)} className="bg-neutral-700 px-2">
            activate
          </button>
          <button onClick={() => save(t.id)} className="bg-neutral-800 px-2">
            save state
          </button>
          <button onClick={() => toggleStatus(t)} className="bg-neutral-800 px-2">
            {t.status === "open" ? "done" : "reopen"}
          </button>
          {confirming === t.id ? (
            <>
              <button onClick={() => remove(t.id)} className="bg-red-900 px-2">
                confirm
              </button>
              <button onClick={() => setConfirming(null)} className="bg-neutral-800 px-2">
                cancel
              </button>
            </>
          ) : (
            <button onClick={() => setConfirming(t.id)} className="bg-neutral-800 px-2">
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
        <button onClick={addTask} disabled={!title} className="bg-neutral-700 px-2 text-xs disabled:opacity-40">
          add task
        </button>
      </div>
      {note && <div className="text-neutral-400 text-xs">{note}</div>}
    </div>
  );
}
