import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon, type IconName } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadError } from "@/components/ui/load-error";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { CapsuleItems } from "@/features/capsules/CapsuleItems";
import { capsuleBranch, capsuleSavedAt } from "@/lib/capsuleFacts";
import { humanizeCapsule, relativeTime } from "@/lib/humanize";
import { toastErr, toastOk } from "@/lib/toast";
import { useDeferredDelete } from "@/lib/useDeferredDelete";
import { cn } from "@/lib/utils";
import { activateSummaryToResult, type ActivateSummary } from "@/restore/normalize";
import { useRestore } from "@/restore/RestoreExperience";
import type { RestoreTool } from "@/restore/types";
import { useStore, type Project, type Task, type TaskResource } from "@/store";

interface SaveSummary {
  captured: string[];
  skipped: string[];
}

/** connector kind -> friendly Restore Experience tool name. */
const RESTORE_TOOL_NAME: Record<string, string> = {
  vscode: "VS Code",
  cursor: "Cursor",
  chrome: "Chrome",
  git: "Git",
  terminal: "Terminal",
};

function friendlyToolName(kind: string): string {
  return RESTORE_TOOL_NAME[kind.toLowerCase()] ?? kind.charAt(0).toUpperCase() + kind.slice(1);
}

/** humanizeCapsule's abstract icon kind -> a sprite glyph. */
const CAPSULE_ICONS: Record<ReturnType<typeof humanizeCapsule>["icon"], IconName> = {
  editor: "code",
  browser: "globe",
  git: "branch",
  terminal: "terminal",
  generic: "capsule",
};

/** Builds the Restore Experience's tool list from a capsule's resources
 * (never hard-coded). One row per distinct connector kind. */
function restoreToolsFor(resources: TaskResource[]): RestoreTool[] {
  const seen = new Set<string>();
  const tools: RestoreTool[] = [];
  for (const r of resources) {
    const kind = r.connectorKind;
    if (seen.has(kind)) continue;
    seen.add(kind);
    tools.push({ id: kind, name: friendlyToolName(kind), kind });
  }
  return tools;
}

/** One "What's inside" card's worth of facts. */
interface InsideCard {
  kind: string;
  icon: IconName;
  /** The humanized count line — "3 files · 1 terminal", "5 tabs". */
  count: string;
  name: string;
  /** Whether the tool that captured this is connected right now. */
  live: boolean;
  when: string;
}

/**
 * What each captured tool will actually do on Restore.
 *
 * DELIBERATE DIVERGENCE FROM THE HANDOFF. Its Capsules section hard-codes
 * the amber case to Chrome — "restores now" in `ok` or "on next reload" in
 * `warn`, with the note that "Chrome cannot restore until its next reload".
 * That is true of the prototype's fixture, not of this app: the Chrome
 * connector implements a real `tabs.open` command (connectors/chrome/src/
 * background.ts) and reopens tabs live.
 *
 * Printing the handoff's sentence anyway would be the app claiming
 * something about itself that isn't so, which the brief forbids in the
 * other direction ("never claim more than the software does") and which is
 * no better in this one. The honest amber this app *does* have is
 * connection state: a capsule can name a tool that isn't running, and that
 * part of the restore genuinely will not happen until it comes back.
 */
function insideCards(resources: TaskResource[], connectedKinds: Set<string>): InsideCard[] {
  const byKind = new Map<string, InsideCard>();
  for (const r of resources) {
    const kind = (r.connectorKind ?? "").toLowerCase();
    if (byKind.has(kind)) continue;
    const h = humanizeCapsule(r);
    const live = connectedKinds.has(kind) || kind === "git";
    byKind.set(kind, {
      kind,
      icon: CAPSULE_ICONS[h.icon],
      count: h.summary,
      name: friendlyToolName(kind),
      live,
      // Git is not a connector — it's read straight off the repo, so it is
      // always available and never waits on anything to reconnect.
      when: live ? "restores now" : `when ${friendlyToolName(kind)} reconnects`,
    });
  }
  return [...byKind.values()];
}

function CapsulesSkeleton() {
  return (
    <div className="grid h-full min-h-0 grid-cols-[296px_minmax(0,1fr)] overflow-hidden">
      <div className="flex min-h-0 flex-col gap-2 border-r-[0.5px] border-border p-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
      <div className="mx-auto w-full max-w-[720px] px-8 pt-[30px]">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="mt-3 h-7 w-80" />
        <Skeleton className="mt-2 h-4 w-64" />
        <div className="mt-4 flex gap-2">
          <Skeleton className="h-7 w-24 rounded-[7px]" />
          <Skeleton className="h-7 w-24 rounded-[7px]" />
        </div>
      </div>
    </div>
  );
}

/** Section heading above a grouped list — 12/600, secondary. */
function GroupHeading({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <p className={cn("pl-0.5 text-sub font-semibold text-muted-foreground", className)}>{children}</p>
  );
}

/**
 * Capsules — the handoff's master/detail screen.
 *
 * Left (296px): an Open / Done segmented filter, a right-aligned count, and
 * the capsules grouped by project as two-line rows. Right: everything about
 * the selected one — its status, where it lives, what it will restore, and
 * what has happened to it.
 *
 * The whole page used to be one scrolling column of per-project cards, each
 * row carrying its own Resume / Save State / ⋯ trio. That put four buttons
 * on every row and no room to say what any of them would do. Master/detail
 * moves the actions to the one capsule you're looking at, which is what
 * makes room for "What's inside" and the hint line under the buttons.
 */
export function CapsulesPage() {
  const activeTaskId = useStore((s) => s.activeTaskId);
  const setActiveTaskId = useStore((s) => s.setActiveTaskId);
  const connectors = useStore((s) => s.connectors);
  const keepCompleted = useStore((s) => s.prefs.keepCompleted);
  const focusMode = useStore((s) => s.prefs.focusMode);
  const activationNonce = useStore((s) => s.activationNonce);
  const bumpActivation = useStore((s) => s.bumpActivation);
  const setView = useStore((s) => s.setView);
  const pendingResumeTaskId = useStore((s) => s.pendingResumeTaskId);
  const clearPendingResume = useStore((s) => s.clearPendingResume);
  const newTaskRequest = useStore((s) => s.newTaskRequest);
  const clearNewTaskRequest = useStore((s) => s.clearNewTaskRequest);
  const selectedCapsuleId = useStore((s) => s.selectedCapsuleId);
  const selectCapsule = useStore((s) => s.selectCapsule);
  const filter = useStore((s) => s.capsuleFilter);
  const setFilter = useStore((s) => s.setCapsuleFilter);

  // Projects live in the store, not in local state: the sidebar's Projects
  // count reads them, and it is visible from this screen. Keeping them
  // local here is what made that count read 0 while this page was showing
  // capsules grouped under three project names.
  const projects = useStore((s) => s.projects);
  const setProjects = useStore((s) => s.setProjects);
  const [tasksByProject, setTasksByProject] = useState<Record<string, Task[]>>({});
  const [resources, setResources] = useState<Record<string, TaskResource[]>>({});
  const [pins, setPins] = useState<Record<string, { connectorKind: string; identity: string; payload: unknown }[]>>({});
  const [draft, setDraft] = useState("");
  const [renameTarget, setRenameTarget] = useState<Task | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const newCapsuleInput = useRef<HTMLInputElement>(null);

  const refreshOrThrow = async () => {
    const list = await invoke<Project[]>("list_projects");
    setProjects(list);
    const perProject = await Promise.all(
      list.map(async (p) => [p.id, await invoke<Task[]>("list_tasks", { projectId: p.id })] as const),
    );
    setTasksByProject(Object.fromEntries(perProject));
    const allTasks = perProject.flatMap(([, tasks]) => tasks);
    const entries = await Promise.all(
      allTasks.map(async (t) => {
        const [taskResources, taskPins] = await Promise.all([
          invoke<TaskResource[]>("task_resources", { taskId: t.id }),
          invoke<{ connectorKind: string; identity: string; payload: unknown }[]>("task_pins", { taskId: t.id }),
        ]);
        return [t.id, taskResources, taskPins] as const;
      }),
    );
    setResources(Object.fromEntries(entries.map(([id, r]) => [id, r] as const)));
    setPins(Object.fromEntries(entries.map(([id, , p]) => [id, p] as const)));
  };

  const refresh = async () => {
    try {
      await refreshOrThrow();
    } catch (e) {
      console.error("capsules refresh failed:", e);
    }
  };

  async function loadCapsules() {
    setLoading(true);
    setLoadError(false);
    try {
      await refreshOrThrow();
      setLoadError(false);
    } catch (e) {
      console.error("capsules load failed:", e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCapsules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Which capsule is active is shell-wide state (the sidebar and Overview
  // both read it) but nothing fetches it on mount except whichever page is
  // open. Without this, arriving here directly — and Capsules is the
  // default landing page — showed the active capsule as merely Open.
  useEffect(() => {
    invoke<string | null>("active_task").then(setActiveTaskId).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch (not remount) when any activation bumps the global nonce, so
  // cross-project capsules stay fresh without discarding this page's local
  // state. Skips its own mount run so it doesn't double the initial load.
  const nonceReady = useRef(false);
  useEffect(() => {
    if (!nonceReady.current) {
      nonceReady.current = true;
      return;
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activationNonce]);

  // Deferred-commit delete: hides the row immediately and shows an Undo
  // toast; the real delete_task only fires ~5s later.
  const { pendingIds: pendingTaskIds, requestDelete } = useDeferredDelete<Task>({
    commit: (t) => invoke("delete_task", { id: t.id }),
    labelOf: (t) => t.title,
    onCommitted: refresh,
  });

  const allTasks = useMemo(
    () => Object.values(tasksByProject).flat().filter((t) => !pendingTaskIds.has(t.id)),
    [tasksByProject, pendingTaskIds],
  );

  // The Open / Done segmented control owns visibility. Settings' "Keep
  // completed capsules visible in the list" still means what it says: with
  // it on, done capsules also appear in the Open list, struck through, the
  // way the handoff's own left column shows them; with it off, Open is
  // strictly open. The active capsule is never hidden either way — losing
  // sight of where you are is exactly what this app exists to prevent.
  const visible = useMemo(
    () =>
      allTasks.filter((t) =>
        filter === "done"
          ? t.status === "done"
          : t.status === "open" || t.id === activeTaskId || keepCompleted,
      ),
    [allTasks, filter, keepCompleted, activeTaskId],
  );

  const groups = useMemo(
    () =>
      projects
        .map((p) => ({ project: p, rows: visible.filter((t) => t.projectId === p.id) }))
        .filter((g) => g.rows.length > 0),
    [projects, visible],
  );

  // Selection has to tolerate a stale id — the selected capsule can be
  // deleted, filtered out, or belong to a project that's gone. Fall back to
  // the first visible row rather than render a detail pane about nothing.
  const selected = visible.find((t) => t.id === selectedCapsuleId) ?? visible[0] ?? null;
  const selectedProject = selected ? projects.find((p) => p.id === selected.projectId) : undefined;
  const selectedResources = selected ? resources[selected.id] ?? [] : [];
  const hasState = selectedResources.length > 0;
  const connectedKinds = useMemo(
    () => new Set(connectors.filter((c) => c.connected).map((c) => c.kind.toLowerCase())),
    [connectors],
  );

  const { start: startRestore, node: restoreNode, active: restoreActive } = useRestore();

  function resume(t: Task) {
    const tools = restoreToolsFor(resources[t.id] ?? []);
    startRestore({
      title: "Restoring workspace",
      subtitle: t.title,
      tools,
      run: async () => {
        const summary = await invoke<ActivateSummary>("activate_task", { taskId: t.id, focusMode });
        setActiveTaskId(t.id);
        bumpActivation();
        refresh();
        return activateSummaryToResult(summary, tools);
      },
    });
  }

  async function save(id: string) {
    setBusy(true);
    setSaving(true);
    try {
      const s = await invoke<SaveSummary>("save_capsule", { taskId: id });
      toastOk(s.captured.length ? "Saved state" : "Nothing connected to save", s.captured.join(", ") || undefined);
      await refresh();
    } catch (e) {
      toastErr(e);
    } finally {
      setBusy(false);
      setSaving(false);
    }
  }

  async function addCapsule() {
    const title = draft.trim();
    // A capsule belongs to a project. Default to the one you're looking at,
    // so ⌘⇧N from a selected capsule adds a sibling rather than dropping the
    // new one into whichever project happens to sort first.
    const projectId = selected?.projectId ?? projects[0]?.id;
    if (!title || !projectId) return;
    setBusy(true);
    try {
      const created = await invoke<Task>("create_task", { projectId, title });
      setDraft("");
      await refresh();
      if (created?.id) selectCapsule(created.id);
      toastOk("Capsule added");
    } catch (e) {
      toastErr(e);
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(t: Task) {
    setBusy(true);
    try {
      await invoke("set_task_status", { id: t.id, status: t.status === "open" ? "done" : "open" });
      await refresh();
      toastOk(t.status === "open" ? "Capsule marked done" : "Capsule reopened");
    } catch (e) {
      toastErr(e);
    } finally {
      setBusy(false);
    }
  }

  async function renameTask(id: string, title: string) {
    setBusy(true);
    try {
      await invoke<Task>("rename_task", { id, title: title.trim() });
      // Rename committed — report success and close BEFORE the reload, then
      // use the error-swallowing refresh(), so a transient refresh failure
      // can't surface as an error toast for an edit that actually persisted.
      toastOk("Capsule renamed");
      setRenameTarget(null);
      await refresh();
    } catch (error) {
      toastErr(error);
    } finally {
      setBusy(false);
    }
  }

  async function duplicateTask(task: Task) {
    setBusy(true);
    try {
      const copy = await invoke<Task>("duplicate_task", { id: task.id });
      toastOk("Capsule duplicated", copy.title);
      await refresh();
    } catch (error) {
      toastErr(error);
    } finally {
      setBusy(false);
    }
  }

  // Palette-initiated resume: the palette only sets `pendingResumeTaskId` +
  // navigates here — it never runs activate_task itself. Wait for this
  // page's own fetch to land before resolving the signal.
  useEffect(() => {
    if (!pendingResumeTaskId || loading) return;
    if (restoreActive) return;
    const task = allTasks.find((t) => t.id === pendingResumeTaskId);
    if (task) {
      selectCapsule(task.id);
      resume(task);
    }
    clearPendingResume();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingResumeTaskId, allTasks, restoreActive, loading]);

  // ⌘⇧N / the toolbar's "New capsule": focus the composer at the foot of the
  // list, then clear. Left set if the input isn't mounted yet, so a later
  // render can still fulfil it.
  useEffect(() => {
    if (!newTaskRequest) return;
    const el = newCapsuleInput.current;
    if (!el) return;
    el.focus();
    clearNewTaskRequest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newTaskRequest, loading, projects]);

  const actionsDisabled = busy || restoreActive;

  if (loading) return <CapsulesSkeleton />;
  if (loadError) {
    return (
      <div className="h-full min-h-0 overflow-y-auto p-4">
        <LoadError onRetry={() => void loadCapsules()} entity="your capsules" />
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[296px_minmax(0,1fr)] overflow-hidden">
      {restoreNode}

      <Dialog open={renameTarget !== null} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (renameTarget && renameTitle.trim()) void renameTask(renameTarget.id, renameTitle);
            }}
          >
            <DialogHeader>
              <DialogTitle>Rename capsule</DialogTitle>
            </DialogHeader>
            <div className="mt-4 flex flex-col gap-1.5">
              <Label htmlFor="capsule-title">Capsule title</Label>
              <Input
                id="capsule-title"
                value={renameTitle}
                onChange={(event) => setRenameTitle(event.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setRenameTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={busy || !renameTitle.trim()}>
                Rename
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* --- Master --- */}
      <div className="flex min-h-0 flex-col overflow-hidden border-r-[0.5px] border-border">
        <div className="flex shrink-0 items-center gap-2 px-3 pb-1 pt-2.5">
          <Segmented
            ariaLabel="Filter capsules"
            value={filter}
            onChange={(v) => setFilter(v as "open" | "done")}
            options={[
              { value: "open", label: "Open" },
              { value: "done", label: "Done" },
            ]}
          />
          <div className="flex-1" />
          <span className="text-meta tabular-nums text-tertiary-foreground">{visible.length}</span>
        </div>

        <div data-capsule-list className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 pt-0.5">
          {groups.length === 0 ? (
            <p className="px-2 pt-4 text-meta text-muted-foreground">
              {projects.length === 0
                ? "No projects registered yet."
                : filter === "done"
                  ? "Nothing finished yet."
                  : "No open capsules."}
            </p>
          ) : (
            groups.map(({ project, rows }) => (
              <div key={project.id}>
                <p className="px-2 pb-[3px] pt-[11px] text-label font-semibold text-tertiary-foreground">
                  {project.name}
                </p>
                {rows.map((t) => {
                  const isSelected = selected?.id === t.id;
                  const isActive = t.id === activeTaskId;
                  const rs = resources[t.id] ?? [];
                  const savedAt = capsuleSavedAt(rs);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      aria-current={isSelected ? "true" : undefined}
                      onClick={() => selectCapsule(t.id)}
                      className={cn(
                        // DELIBERATE DIVERGENCE FROM THE HANDOFF, matching
                        // the one the sidebar already makes (Sidebar.tsx's
                        // NavGroup): the handoff fills the selected row with
                        // the accent and puts white text on it. A selected
                        // row is permanent on this screen, so an accent fill
                        // there would compete with the detail pane's Restore
                        // button for the one-accent budget
                        // (`expectAtMostOneAccent`, src/test/accent.ts) —
                        // and Restore is the action, which is what the
                        // accent is for. Neutral `--secondary` at weight 510
                        // instead, exactly as the nav does it.
                        "block w-full cursor-default rounded-md px-2 py-1.5 text-left transition-colors duration-fast ease-standard",
                        isSelected ? "bg-secondary" : "hover:bg-hover",
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-[7px]">
                        <span
                          aria-hidden
                          data-accent-mark={isActive || undefined}
                          className={cn(
                            "size-[7px] shrink-0 rounded-full",
                            isActive
                              ? "bg-primary"
                              : t.status === "done"
                                ? "bg-ok"
                                : "bg-tertiary-foreground",
                          )}
                        />
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate text-body",
                            isSelected && "font-510",
                            t.status === "done"
                              ? "text-tertiary-foreground line-through"
                              : isSelected
                                ? "text-secondary-foreground"
                                : "text-foreground",
                          )}
                        >
                          {t.title}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate pl-[14px] text-meta text-tertiary-foreground">
                        {isActive ? "Active · " : ""}
                        {savedAt ? `saved ${relativeTime(savedAt)}` : "never captured"}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* The composer is the only way to make a capsule, so it is always
            present rather than hidden behind the toolbar action — which
            focuses this input rather than opening a dialog. */}
        <div className="flex shrink-0 items-center gap-1.5 border-t-[0.5px] border-border p-2">
          <Input
            ref={newCapsuleInput}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addCapsule();
            }}
            placeholder="New capsule"
            className="h-7 flex-1 text-body"
            disabled={projects.length === 0}
          />
          <Button
            size="sm"
            variant="secondary"
            className="h-7 shrink-0"
            onClick={() => void addCapsule()}
            disabled={!draft.trim() || actionsDisabled || projects.length === 0}
          >
            Add
          </Button>
        </div>
      </div>

      {/* --- Detail --- */}
      <div data-capsule-detail className="min-h-0 overflow-y-auto">
        {!selected ? (
          <div className="mx-auto max-w-[720px] px-8 pb-10 pt-[30px]">
            <p className="text-card-title font-590 text-foreground">No capsule selected</p>
            <p className="mt-1 text-sub text-muted-foreground">
              {projects.length === 0
                ? "Register a project first — a capsule belongs to one."
                : "Pick one on the left, or start a new one below the list."}
            </p>
            {projects.length === 0 && (
              <Button className="mt-4" variant="primary" onClick={() => setView("projects")}>
                Register a project
              </Button>
            )}
          </div>
        ) : (
          <div className="mx-auto max-w-[720px] px-8 pb-10 pt-[30px]">
            <div className="flex items-center gap-2">
              {selected.status === "done" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-[9px] py-[3px] text-meta font-590 text-ok">
                  <Icon name="check" className="size-[11px]" />
                  Done
                </span>
              ) : selected.id === activeTaskId ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-[9px] py-[3px] text-meta font-590 text-accent-text">
                  <span data-accent-mark aria-hidden className="size-1.5 rounded-full bg-primary" />
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-[9px] py-[3px] text-meta font-590 text-muted-foreground">
                  Open
                </span>
              )}
            </div>

            {/* The handoff calls this the "screen title" and sizes it 22/640
                — but the screen is Capsules, and the Toolbar already owns
                that <h1>. This is the selected item within it, so it takes
                the size and the heading level below it rather than
                competing for the document's top heading. */}
            <h2 className="mt-2.5 text-title font-640 text-foreground">{selected.title}</h2>
            <p className="mt-1.5 text-sub text-muted-foreground">
              {selectedProject?.name ?? "Unknown project"}
              {capsuleBranch(selectedResources) && (
                <>
                  {" · "}
                  <span className="font-mono text-meta">{capsuleBranch(selectedResources)}</span>
                </>
              )}
              {" · "}
              {capsuleSavedAt(selectedResources)
                ? `saved ${relativeTime(capsuleSavedAt(selectedResources)!)}`
                : "never captured"}
            </p>

            <div className="mt-4 flex items-center gap-2">
              {hasState && (
                <Button
                  variant="primary"
                  className="h-7 rounded-[7px] px-[15px] text-body font-510"
                  onClick={() => resume(selected)}
                  disabled={actionsDisabled}
                >
                  <Icon name="play" className="size-[11px]" />
                  {restoreActive ? "Restoring…" : "Restore"}
                </Button>
              )}
              <Button
                // A never-captured capsule shows Capture as the one accent
                // action instead of Restore — there is nothing to restore.
                variant={hasState ? "secondary" : "primary"}
                className="h-7 rounded-[7px] px-[13px] text-body"
                onClick={() => void save(selected.id)}
                disabled={actionsDisabled}
              >
                <Icon name="capture" className="size-3" />
                {saving ? "Capturing…" : "Capture"}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="size-7 rounded-[7px] text-muted-foreground"
                    aria-label={`More actions for ${selected.title}`}
                    disabled={actionsDisabled}
                  >
                    <Icon name="ellipsis" className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
                  <DropdownMenuItem onSelect={() => toggleStatus(selected)}>
                    {selected.status === "open" ? "Mark done" : "Reopen"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setRenameTarget(selected);
                      setRenameTitle(selected.title);
                    }}
                  >
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => duplicateTask(selected)}>Duplicate</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                    onSelect={() => requestDelete(selected)}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <p className="mt-[11px] text-sub text-tertiary-foreground">
              Restore puts your editor, tabs and branch back the way you left them.
            </p>

            {hasState ? (
              <>
                <GroupHeading className="mt-7">What's inside</GroupHeading>
                <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
                  {insideCards(selectedResources, connectedKinds).map((card) => (
                    <div
                      key={card.kind}
                      data-inside-card={card.kind}
                      className="rounded-[10px] bg-card p-[13px] shadow-raised"
                    >
                      <div className="flex items-center justify-between">
                        <Icon name={card.icon} className="size-4 text-muted-foreground" />
                        <span
                          aria-hidden
                          className={cn("size-[7px] rounded-full", card.live ? "bg-ok" : "bg-warn")}
                        />
                      </div>
                      <p className="mt-2.5 text-card-title font-590 text-foreground">{card.count}</p>
                      <p className="mt-0.5 text-sub text-muted-foreground">{card.name}</p>
                      <p className={cn("mt-[7px] text-label", card.live ? "text-ok" : "text-warn")}>
                        {card.when}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Per-item pin curation ("always open this"). Not in the
                    handoff, but a real shipped feature — it lives under the
                    grid rather than being dropped. */}
                <CapsuleItems
                  taskId={selected.id}
                  resources={selectedResources}
                  pins={pins[selected.id] ?? []}
                  onChanged={refresh}
                />

                {/* History. The handoff shows "a grouped list of audit
                    entries with times"; this app keeps no per-capsule audit
                    trail, so rather than invent one, the history is the
                    capture record the capsule actually has — one row per
                    tool, newest first, with when it was taken. */}
                <GroupHeading className="mt-7">History</GroupHeading>
                <div className="mt-[7px] overflow-hidden rounded-[10px] bg-card shadow-raised">
                  <div className="divide-y-[0.5px] divide-border">
                    {[...selectedResources]
                      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
                      .map((r) => (
                        <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                          <span className="min-w-0 flex-1 truncate text-sub text-foreground">
                            Captured {friendlyToolName(r.connectorKind)} — {humanizeCapsule(r).summary}
                          </span>
                          <span className="shrink-0 text-meta text-tertiary-foreground">
                            {relativeTime(r.createdAt)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="mt-7 flex flex-col items-center gap-2 rounded-[10px] border border-dashed border-border px-6 py-[34px] text-center">
                <Icon name="capsule" className="size-[22px] text-tertiary-foreground" />
                <p className="text-body font-510 text-foreground">Nothing captured yet</p>
                <p className="max-w-[340px] text-sub leading-[1.55] text-muted-foreground">
                  Set up your editor and tabs, then press Capture to save this workspace.
                </p>
              </div>
            )}

            <p className="mt-[26px] flex items-center gap-1.5 text-meta text-tertiary-foreground">
              <Icon name="shield" className="size-3 shrink-0" />
              Saves paths, URLs and branch names — never your files, pages or passwords.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
