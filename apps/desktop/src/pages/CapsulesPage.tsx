import { invoke } from "@tauri-apps/api/core";
import { PackageOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/shell/PageHeader";
import { useStore, type Project, type Task, type TaskResource } from "@/store";

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

// Ported verbatim from views/TasksSection.tsx — humanizes a single capsule
// resource (e.g. "git: main" or "vscode: 3 files, 1 terminals · 3:04:12 PM").
function summarize(r: TaskResource): string {
  if (r.connectorKind === "git") {
    return `git: ${typeof r.payload.branch === "string" ? r.payload.branch : "?"}`;
  }
  const files = Array.isArray(r.payload.openFiles) ? r.payload.openFiles.length : 0;
  const terms = Array.isArray(r.payload.terminals) ? r.payload.terminals.length : 0;
  return `${r.connectorKind}: ${files} files, ${terms} terminals · ${new Date(r.createdAt).toLocaleTimeString()}`;
}

function summarizeAll(resources: TaskResource[]): string {
  return resources.map(summarize).join(" · ") || "No capsule yet";
}

export function CapsulesPage() {
  const activeTaskId = useStore((s) => s.activeTaskId);
  const setActiveTaskId = useStore((s) => s.setActiveTaskId);
  const activationNonce = useStore((s) => s.activationNonce);
  const bumpActivation = useStore((s) => s.bumpActivation);

  const [projects, setProjects] = useState<Project[]>([]);
  const [tasksByProject, setTasksByProject] = useState<Record<string, Task[]>>({});
  const [resources, setResources] = useState<Record<string, TaskResource[]>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [actionNote, setActionNote] = useState<{ taskId: string; text: string } | null>(null);
  // Guards against double-click re-entrancy: the backend serializes
  // activation/save, but the UI should still reflect an op in flight rather
  // than let the user queue up duplicate clicks.
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const list = await invoke<Project[]>("list_projects");
      setProjects(list);
      const perProject = await Promise.all(
        list.map(async (p) => [p.id, await invoke<Task[]>("list_tasks", { projectId: p.id })] as const)
      );
      setTasksByProject(Object.fromEntries(perProject));
      const allTasks = perProject.flatMap(([, tasks]) => tasks);
      const entries = await Promise.all(
        allTasks.map(async (t) => [t.id, await invoke<TaskResource[]>("task_resources", { taskId: t.id })] as const)
      );
      setResources(Object.fromEntries(entries));
    } catch (e) {
      console.error("capsules refresh failed:", e);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch (not remount) when any project's task activation bumps the
  // global nonce, so cross-project capsule summaries stay fresh without
  // discarding this page's local state (drafts, delete-confirm dialog, or
  // the activation note it just set).
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activationNonce]);

  async function addTask(projectId: string) {
    const title = (drafts[projectId] ?? "").trim();
    if (!title) return;
    setBusy(true);
    try {
      await invoke("create_task", { projectId, title });
      setDrafts((d) => ({ ...d, [projectId]: "" }));
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function activate(id: string) {
    setBusy(true);
    setActionNote({ taskId: id, text: "Activating…" });
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
      setActionNote({ taskId: id, text: parts.join(" · ") || "Activated (no capsule yet)" });
      // Activation may have auto-saved the previously-active task, which can
      // live in a different project — bump the global nonce so this page
      // refetches and no card shows a stale capsule summary.
      bumpActivation();
      await refresh();
    } catch (e) {
      setActionNote({ taskId: id, text: String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function save(id: string) {
    setBusy(true);
    setActionNote({ taskId: id, text: "Saving…" });
    try {
      const s = await invoke<SaveSummary>("save_capsule", { taskId: id });
      setActionNote({
        taskId: id,
        text: s.captured.length ? `Saved: ${s.captured.join(", ")}` : "Nothing connected to save",
      });
      await refresh();
    } catch (e) {
      setActionNote({ taskId: id, text: String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(t: Task) {
    setBusy(true);
    try {
      await invoke("set_task_status", { id: t.id, status: t.status === "open" ? "done" : "open" });
      await refresh();
    } catch (e) {
      setActionNote({ taskId: t.id, text: String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await invoke("delete_task", { id });
      setDeleteTarget(null);
      await refresh();
    } catch (e) {
      setActionNote({ taskId: id, text: String(e) });
    } finally {
      setBusy(false);
    }
  }

  const allTasks = Object.values(tasksByProject).flat();
  const openCount = allTasks.filter((t) => t.status === "open").length;
  const subtitle = openCount === 0 ? "No open tasks" : `${openCount} open ${openCount === 1 ? "task" : "tasks"}`;

  return (
    <div>
      <PageHeader eyebrow="TASKS" title="Capsules" subtitle={subtitle} />

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {projects.length === 0 ? (
        <EmptyState
          icon={<PackageOpen />}
          title="No projects yet"
          description="Register a project in Projects to start tracking tasks and capsules."
        />
      ) : (
        <div className="flex flex-col gap-8">
          {projects.map((p) => {
            const tasks = tasksByProject[p.id] ?? [];
            return (
              <div key={p.id}>
                <div className="mb-3 flex items-baseline gap-2">
                  <h2 className="text-sm font-medium text-foreground">{p.name}</h2>
                  <span className="text-xs text-muted-foreground">{p.defaultBranch}</span>
                </div>

                <div className="flex flex-col gap-2">
                  {tasks.length === 0 && (
                    <p className="text-xs text-muted-foreground">No tasks yet</p>
                  )}

                  {tasks.map((t) => {
                    const isActive = t.id === activeTaskId;
                    return (
                      <Card
                        key={t.id}
                        className={isActive ? "border-l-2 border-l-primary p-4" : "p-4"}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p
                                className={
                                  t.status === "done"
                                    ? "font-medium text-muted-foreground line-through"
                                    : "font-medium text-foreground"
                                }
                              >
                                {t.title}
                              </p>
                              {isActive && <Badge>Active</Badge>}
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {summarizeAll(resources[t.id] ?? [])}
                            </p>
                            {actionNote?.taskId === t.id && (
                              <p className="mt-1 text-xs text-muted-foreground">{actionNote.text}</p>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Button size="sm" onClick={() => activate(t.id)} disabled={busy}>
                              Resume
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => save(t.id)} disabled={busy}>
                              Save State
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => toggleStatus(t)} disabled={busy}>
                              {t.status === "open" ? "Done" : "Reopen"}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setDeleteTarget(t)}
                              disabled={busy}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}

                  <div className="flex gap-2">
                    <Input
                      value={drafts[p.id] ?? ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                      placeholder="New task title"
                      className="max-w-sm"
                    />
                    <Button onClick={() => addTask(p.id)} disabled={!(drafts[p.id] ?? "").trim() || busy}>
                      Add Task
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{deleteTarget?.title}"?</DialogTitle>
            <DialogDescription>Its saved capsule state goes with it. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && remove(deleteTarget.id)}
              disabled={busy}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
