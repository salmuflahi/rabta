import { invoke } from "@tauri-apps/api/core";
import { Box, Code2, GitBranch, Globe, Layers, Loader2, Terminal } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { humanizeCapsule } from "@/lib/humanize";
import { toastErr, toastOk } from "@/lib/toast";
import { activateSummaryToResult, type ActivateSummary } from "@/restore/normalize";
import { useRestore } from "@/restore/RestoreExperience";
import type { RestoreTool } from "@/restore/types";
import { PageHeader } from "@/shell/PageHeader";
import { useStore, type Project, type Task, type TaskResource } from "@/store";

interface SaveSummary {
  captured: string[];
  skipped: string[];
}

// Maps humanizeCapsule's abstract icon kind to a concrete lucide icon.
const CAPSULE_ICONS: Record<ReturnType<typeof humanizeCapsule>["icon"], typeof Box> = {
  editor: Code2,
  browser: Globe,
  git: GitBranch,
  terminal: Terminal,
  generic: Box,
};

// connector kind -> friendly Restore Experience tool name. (Row icons are
// derived by RestoreExperience itself from `tool.kind`, via its own
// vscode/cursor/chrome/git/terminal -> icon map — falls back to a generic
// box there too, so this file doesn't duplicate that mapping.)
const RESTORE_TOOL_NAME: Record<string, string> = {
  vscode: "VS Code",
  cursor: "Cursor",
  chrome: "Chrome",
  git: "Git",
  terminal: "Terminal",
};

/** Builds the Restore Experience's tool list from a task's capsule
 * resources (never hard-coded). One row per distinct connector kind — a
 * task with no resources yields an empty array, which the sheet handles
 * fine (heading + progress, then completes with no rows). */
function restoreToolsFor(resources: TaskResource[]): RestoreTool[] {
  const seen = new Set<string>();
  const tools: RestoreTool[] = [];
  for (const r of resources) {
    const kind = r.connectorKind;
    if (seen.has(kind)) continue;
    seen.add(kind);
    tools.push({
      id: kind,
      name: RESTORE_TOOL_NAME[kind.toLowerCase()] ?? kind.charAt(0).toUpperCase() + kind.slice(1),
      kind,
    });
  }
  return tools;
}

/** Skeleton placeholder for the pre-first-load window only — approximates
 * two project groups of two task cards each, matching the real layout's
 * sizes so there's no layout shift once data lands. */
function CapsulesSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      {[0, 1].map((g) => (
        <div key={g}>
          <Skeleton className="mb-3 h-4 w-40" />
          <div className="flex flex-col gap-2">
            {[0, 1].map((i) => (
              <Card key={i} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-8 w-20" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** A tidy inline group of humanized capsule resources for one task, or a
 * muted "No capsule yet" when the task has never had one saved. */
function CapsuleSummary({ resources }: { resources: TaskResource[] }) {
  if (resources.length === 0) {
    return <p className="mt-0.5 text-xs text-muted-foreground">No capsule yet</p>;
  }
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
      {resources.map((r) => {
        const h = humanizeCapsule(r);
        const Icon = CAPSULE_ICONS[h.icon];
        return (
          <span key={r.id} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon className="size-3.5 shrink-0" />
            <span>{h.summary}</span>
            <span className="text-muted-foreground/70">· {h.savedAgo}</span>
          </span>
        );
      })}
    </div>
  );
}

export function CapsulesPage() {
  const activeTaskId = useStore((s) => s.activeTaskId);
  const setActiveTaskId = useStore((s) => s.setActiveTaskId);
  const activationNonce = useStore((s) => s.activationNonce);
  const bumpActivation = useStore((s) => s.bumpActivation);
  const setView = useStore((s) => s.setView);

  const [projects, setProjects] = useState<Project[]>([]);
  const [tasksByProject, setTasksByProject] = useState<Record<string, Task[]>>({});
  const [resources, setResources] = useState<Record<string, TaskResource[]>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  // In-flight affordance only (the result of an action is a toast, not
  // inline text): which task is mid-save, so its button can read "Saving…"
  // while busy. Resume's in-flight state now lives entirely in the Restore
  // Experience sheet (see `useRestore` below), not here.
  const [pendingAction, setPendingAction] = useState<{ taskId: string; kind: "save" } | null>(null);
  // Guards against double-click re-entrancy: the backend serializes
  // activation/save, but the UI should still reflect an op in flight rather
  // than let the user queue up duplicate clicks.
  const [busy, setBusy] = useState(false);
  // Pre-first-load window only: true until the initial mount fetch settles,
  // then stays false (subsequent refreshes — activationNonce bumps, post-
  // action reloads — don't re-show the skeleton).
  const [loading, setLoading] = useState(true);

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
    refresh().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch (not remount) when any project's task activation bumps the
  // global nonce, so cross-project capsule summaries stay fresh without
  // discarding this page's local state (drafts, delete-confirm dialog, or
  // an in-flight pendingAction).
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
      toastOk("Task added");
    } catch (e) {
      toastErr(e);
    } finally {
      setBusy(false);
    }
  }

  // The Restore Experience sheet owns the `activate_task` invoke itself
  // (opening -> restoring -> success/partial/failure, gated on the real
  // result); this page's `run` supplies the post-activate side effects,
  // unchanged from before, then hands back the normalized result for the
  // sheet to reveal.
  const { start: startRestore, node: restoreNode, active: restoreActive } = useRestore();

  function resume(t: Task) {
    const tools = restoreToolsFor(resources[t.id] ?? []);
    startRestore({
      title: "Restoring workspace",
      subtitle: t.title,
      tools,
      run: async () => {
        const summary = await invoke<ActivateSummary>("activate_task", { taskId: t.id });
        setActiveTaskId(t.id);
        // Activation may have auto-saved the previously-active task, which
        // can live in a different project — bump the global nonce so this
        // page refetches and no card shows a stale capsule summary.
        bumpActivation();
        refresh();
        return activateSummaryToResult(summary, tools);
      },
    });
  }

  async function save(id: string) {
    setBusy(true);
    setPendingAction({ taskId: id, kind: "save" });
    try {
      const s = await invoke<SaveSummary>("save_capsule", { taskId: id });
      if (s.captured.length) {
        toastOk("Saved state", s.captured.join(", "));
      } else {
        toastOk("Nothing connected to save");
      }
      await refresh();
    } catch (e) {
      toastErr(e);
    } finally {
      setBusy(false);
      setPendingAction(null);
    }
  }

  async function toggleStatus(t: Task) {
    setBusy(true);
    try {
      await invoke("set_task_status", { id: t.id, status: t.status === "open" ? "done" : "open" });
      await refresh();
      toastOk(t.status === "open" ? "Task marked done" : "Task reopened");
    } catch (e) {
      toastErr(e);
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
      toastOk("Task deleted");
    } catch (e) {
      toastErr(e);
    } finally {
      setBusy(false);
    }
  }

  const allTasks = Object.values(tasksByProject).flat();
  const openCount = allTasks.filter((t) => t.status === "open").length;
  const subtitle = openCount === 0 ? "No open tasks" : `${openCount} open ${openCount === 1 ? "task" : "tasks"}`;

  return (
    <div>
      {restoreNode}
      <PageHeader eyebrow="TASKS" title="Capsules" subtitle={subtitle} />

      {loading ? (
        <CapsulesSkeleton />
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<Layers />}
          title="No capsules yet"
          description="Capsules save and restore your editor, browser, and git state for a task."
          action={<Button onClick={() => setView("projects")}>Register a Project</Button>}
        />
      ) : (
        <div className="flex flex-col gap-8">
          {projects.map((p) => {
            const tasks = tasksByProject[p.id] ?? [];
            return (
              <div key={p.id}>
                <div className="mb-3 flex min-w-0 items-baseline gap-2">
                  <h2 className="min-w-0 truncate text-sm font-medium text-foreground">{p.name}</h2>
                  <span className="shrink-0 text-xs text-muted-foreground">{p.defaultBranch}</span>
                </div>

                <div className="flex flex-col gap-2">
                  {tasks.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No tasks in {p.name} yet — add one below
                    </p>
                  )}

                  {tasks.map((t) => {
                    const isActive = t.id === activeTaskId;
                    return (
                      <Card
                        key={t.id}
                        className={
                          isActive
                            ? "border-l-2 border-l-primary p-4 transition-colors hover:bg-accent/40"
                            : "p-4 transition-colors hover:bg-accent/40"
                        }
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-2">
                              <p
                                className={
                                  t.status === "done"
                                    ? "min-w-0 truncate font-medium text-muted-foreground line-through"
                                    : "min-w-0 truncate font-medium text-foreground"
                                }
                              >
                                {t.title}
                              </p>
                              {isActive && <Badge className="shrink-0">Active</Badge>}
                            </div>
                            <CapsuleSummary resources={resources[t.id] ?? []} />
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Button
                              size="sm"
                              className="transition-transform hover:-translate-y-px active:scale-[0.98]"
                              onClick={() => resume(t)}
                              disabled={busy || restoreActive}
                            >
                              {restoreActive ? (
                                <>
                                  <Loader2 className="size-3.5 animate-spin" />
                                  Restoring…
                                </>
                              ) : (
                                "Resume"
                              )}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => save(t.id)} disabled={busy || restoreActive}>
                              {pendingAction?.taskId === t.id && pendingAction.kind === "save"
                                ? "Saving…"
                                : "Save State"}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => toggleStatus(t)} disabled={busy || restoreActive}>
                              {t.status === "open" ? "Done" : "Reopen"}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setDeleteTarget(t)}
                              disabled={busy || restoreActive}
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
                    <Button onClick={() => addTask(p.id)} disabled={!(drafts[p.id] ?? "").trim() || busy || restoreActive}>
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
              disabled={busy || restoreActive}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
