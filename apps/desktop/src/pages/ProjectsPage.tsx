import { invoke } from "@tauri-apps/api/core";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadError } from "@/components/ui/load-error";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ArchivedProjectsDialog } from "@/features/projects/ArchivedProjectsDialog";
import { ProjectDialogs } from "@/features/projects/ProjectDialogs";
import { useGitStatus } from "@/features/projects/useGitStatus";
import { capsuleBranch, capsuleSavedAt } from "@/lib/capsuleFacts";
import { relativeTime } from "@/lib/humanize";
import { ProjectIcon } from "@/lib/project-icons";
import { moveProject, moveProjectBy } from "@/lib/project-order";
import { toastErr, toastOk } from "@/lib/toast";
import { useDeferredDelete } from "@/lib/useDeferredDelete";
import { cn } from "@/lib/utils";
import {
  useStore,
  type Project,
  type ProjectIconKey,
  type RepoInspection,
  type Task,
  type TaskResource,
} from "@/store";
import { GitHubSection } from "@/views/GitHubSection";
import { GitLine } from "@/views/GitLine";

interface ArchiveProjectResult {
  project: Project;
  warnings: string[];
}

/** Mirrors one `ProjectRow`: a size-[15px] leading icon next to the title,
 * and the "N open capsules · saved" line below it indented `ml-[23px]` to
 * clear the icon+gap exactly like the real row's `pl-[23px]`. Rows are
 * stacked with no gap of their own, matching the real list — each row's
 * padding (not a parent `gap-*`) is what spaces them. */
function ProjectRowSkeleton() {
  return (
    <div className="px-2 py-1.5">
      <div className="flex items-center gap-2">
        <Skeleton className="size-[15px] shrink-0 rounded-[3px]" />
        <Skeleton className="h-3.5 w-32" />
      </div>
      <Skeleton className="ml-[23px] mt-1.5 h-2.5 w-28" />
    </div>
  );
}

function ProjectsSkeleton() {
  return (
    <div className="grid h-full min-h-0 grid-cols-[296px_minmax(0,1fr)] overflow-hidden">
      <div className="flex min-h-0 flex-col overflow-hidden border-r-[0.5px] border-border px-2 pb-3 pt-2.5">
        {[0, 1, 2].map((i) => (
          <ProjectRowSkeleton key={i} />
        ))}
      </div>

      {/* Detail: the h2 title + mono repo path, the branch/status chip row
          against the Reveal/Archive/⋯ actions (the trailing controls'
          own h-6 / size-6 exactly, since those are fixed on the real
          buttons), and the Capsules list. GitLine and GitHubSection carry
          their own internal loading and aren't mimicked here — the same
          scope OverviewSkeleton draws around the hero's nested chip row. */}
      <div className="mx-auto w-full max-w-[720px] px-8 pt-[30px]">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="mt-1.5 h-3.5 w-72" />
        <div className="mt-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-[126px] rounded-md" />
            <Skeleton className="h-6 w-[74px] rounded-md" />
            <Skeleton className="size-6 rounded-md" />
          </div>
        </div>
        <Skeleton className="mt-7 h-3 w-20" />
        <div className="mt-[7px] space-y-px rounded-[10px] bg-card p-4 shadow-raised">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-3.5 flex-1" />
              <Skeleton className="h-3 w-10 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GroupHeading({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <p className={cn("pl-0.5 text-sub font-semibold text-muted-foreground", className)}>{children}</p>
  );
}

/** One row in the master list. Sortable, because drag-to-reorder is a
 * shipped feature and the list is where an order belongs — the detail pane
 * has nothing to reorder. */
function ProjectRow({
  project,
  selected,
  disabled,
  openCapsules,
  onSelect,
}: {
  project: Project;
  selected: boolean;
  disabled: boolean;
  openCapsules: number;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
    disabled,
  });
  const status = useGitStatus(project.id);
  const dirtyLabel = status?.dirty
    ? `${status.changedCount} uncommitted ${status.changedCount === 1 ? "change" : "changes"}`
    : null;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "opacity-60")}
    >
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        onClick={onSelect}
        {...attributes}
        {...listeners}
        className={cn(
          // Neutral selection, as everywhere else in this app — see
          // CapsulesPage's row for the full note on why the handoff's
          // accent fill isn't used for a permanently-visible row.
          "block w-full cursor-default touch-none rounded-md px-2 py-1.5 text-left transition-colors duration-fast ease-standard",
          selected ? "bg-secondary" : "hover:bg-hover",
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <ProjectIcon
            icon={project.icon}
            className={cn("size-[15px] shrink-0", selected ? "text-foreground" : "text-muted-foreground")}
          />
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-body text-foreground",
              selected && "font-510",
            )}
          >
            {project.name}
          </span>
          {dirtyLabel && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  role="status"
                  aria-label={dirtyLabel}
                  className="size-1.5 shrink-0 rounded-full bg-warn"
                />
              </TooltipTrigger>
              <TooltipContent>{dirtyLabel}</TooltipContent>
            </Tooltip>
          )}
        </span>
        <span className="mt-0.5 block truncate pl-[23px] text-meta text-tertiary-foreground">
          {openCapsules} open {openCapsules === 1 ? "capsule" : "capsules"}
          {project.lastOpenedAt ? ` · ${relativeTime(project.lastOpenedAt)}` : ""}
        </span>
      </button>
    </div>
  );
}

/**
 * Projects — the handoff's master/detail screen.
 *
 * Left (296px): every registered project, with an amber dot when its
 * working tree is dirty. Right: the selected one — where it lives, what
 * branch it's on, its capsules, its GitHub issues, and the safe-git
 * promise.
 *
 * The old page stacked a full card per project, each one carrying its own
 * GitLine and GitHubSection: with three projects registered that was three
 * git-status fetches, three issue lists, and three sets of branch controls
 * on screen at once, all competing. Only the selected project loads that
 * machinery now.
 */
export function ProjectsPage() {
  const projects = useStore((s) => s.projects);
  const setProjects = useStore((s) => s.setProjects);
  const setActiveTaskId = useStore((s) => s.setActiveTaskId);
  const setView = useStore((s) => s.setView);
  const selectCapsule = useStore((s) => s.selectCapsule);
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const selectProject = useStore((s) => s.selectProject);
  const newProjectRequest = useStore((s) => s.newProjectRequest);
  const clearNewProjectRequest = useStore((s) => s.clearNewProjectRequest);

  const [registerOpen, setRegisterOpen] = useState(false);
  const [name, setName] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [devUrl, setDevUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [pathNote, setPathNote] = useState("");
  // Bumped after a GitHub issue is started (which creates a capsule) and
  // after any GitLine mutation, so the chips and capsule list refetch
  // without remounting the pane.
  const [gitNonce, setGitNonce] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reorderBusy, setReorderBusy] = useState(false);
  const [renameProject, setRenameProject] = useState<Project | null>(null);
  const [iconProject, setIconProject] = useState<Project | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [tasks, setTasks] = useState<Record<string, Task[]>>({});
  const [resources, setResources] = useState<Record<string, TaskResource[]>>({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const refresh = () =>
    invoke<Project[]>("list_projects")
      .then(setProjects)
      .catch((e) => console.error("list_projects failed:", e));

  // Initial load tracks failure separately so a read error shows a retry
  // panel, not the "No projects yet" empty state. The post-mutation
  // refresh() stays error-swallowing so a transient blip mid-session can't
  // blank an already-populated page.
  const loadProjects = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    invoke<Project[]>("list_projects")
      .then((p) => {
        setProjects(p);
        setLoadError(false);
      })
      .catch((e) => {
        console.error("list_projects failed:", e);
        setLoadError(true);
      })
      .finally(() => setLoading(false));
  }, [setProjects]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    invoke<string | null>("active_task").then(setActiveTaskId).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Capsules per project, plus their resources — the master list needs the
  // open count and the detail pane needs each capsule's branch and save
  // time. One fetch, both consumers.
  useEffect(() => {
    if (projects.length === 0) {
      setTasks({});
      setResources({});
      return;
    }
    let cancelled = false;
    Promise.all(
      projects.map(async (p) => [p.id, await invoke<Task[]>("list_tasks", { projectId: p.id })] as const),
    )
      .then(async (pairs) => {
        if (cancelled) return;
        setTasks(Object.fromEntries(pairs));
        const all = pairs.flatMap(([, list]) => list);
        const res = await Promise.all(
          all.map(
            async (t) =>
              [t.id, await invoke<TaskResource[]>("task_resources", { taskId: t.id })] as const,
          ),
        );
        if (!cancelled) setResources(Object.fromEntries(res));
      })
      .catch((e) => console.error("loading project capsules failed:", e));
    return () => {
      cancelled = true;
    };
  }, [projects, gitNonce]);

  // ⌘N global shortcut / the toolbar's "Add project": open the register
  // dialog, then clear. Because the flag is cleared right after firing,
  // remounting this page sees it already false and does nothing.
  useEffect(() => {
    if (!newProjectRequest) return;
    resetForm();
    setRegisterOpen(true);
    clearNewProjectRequest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newProjectRequest]);

  async function onPathBlur() {
    if (!repoPath) return;
    try {
      const ins = await invoke<RepoInspection>("inspect_repo_path", { path: repoPath });
      if (!ins.exists) setPathNote("Path does not exist");
      else if (!ins.isGitRepo) setPathNote("Not a git repository");
      else {
        setPathNote("");
        if (ins.defaultBranch && !branch) setBranch(ins.defaultBranch);
      }
    } catch {
      setPathNote("Could not inspect that path");
    }
  }

  function resetForm() {
    setName("");
    setRepoPath("");
    setDevUrl("");
    setBranch("");
    setPathNote("");
  }

  async function save() {
    try {
      await invoke("create_project", {
        name,
        repoPath,
        devUrl: devUrl || null,
        defaultBranch: branch,
      });
      const registeredName = name;
      resetForm();
      setRegisterOpen(false);
      refresh();
      toastOk("Project registered", registeredName);
    } catch (e) {
      toastErr(e);
    }
  }

  async function renameProjectById(id: string, nextName: string) {
    setBusy(true);
    try {
      await invoke<Project>("rename_project", { id, name: nextName });
      setRenameProject(null);
      await refresh();
      toastOk("Project renamed");
    } catch (error) {
      toastErr(error);
    } finally {
      setBusy(false);
    }
  }

  async function setProjectIcon(id: string, icon: ProjectIconKey | null) {
    setBusy(true);
    try {
      await invoke<Project>("set_project_icon", { id, icon });
      setIconProject(null);
      await refresh();
    } catch (error) {
      toastErr(error);
    } finally {
      setBusy(false);
    }
  }

  async function archiveProject(project: Project) {
    setBusy(true);
    try {
      const result = await invoke<ArchiveProjectResult>("archive_project", { id: project.id });
      await refresh();
      result.warnings.forEach(toastErr);
      toast(`${project.name} archived`, {
        action: {
          label: "Undo",
          onClick: () =>
            invoke<Project>("unarchive_project", { id: project.id })
              .then(refresh)
              .catch((error) => {
                void refresh();
                toastErr(error);
              }),
        },
      });
    } catch (error) {
      toastErr(error);
    } finally {
      setBusy(false);
    }
  }

  // Deferred-commit delete: hides the row immediately and shows an Undo
  // toast; the real delete_project only fires ~5s later.
  const { pendingIds, requestDelete } = useDeferredDelete<Project>({
    commit: (p) => invoke("delete_project", { id: p.id }),
    labelOf: (p) => p.name,
    onCommitted: refresh,
  });

  async function persistReorder(reorder: (snapshot: Project[]) => Project[]) {
    if (reorderBusy) return;
    const snapshot = projects;
    const nextProjects = reorder(snapshot);
    if (nextProjects === snapshot) return;

    setProjects(nextProjects);
    setReorderBusy(true);
    try {
      const reordered = await invoke<Project[]>("reorder_projects", {
        orderedIds: nextProjects.map((project) => project.id),
      });
      setProjects(reordered);
    } catch (error) {
      setProjects(snapshot);
      toastErr(error);
    } finally {
      setReorderBusy(false);
    }
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    void persistReorder((snapshot) => moveProject(snapshot, String(active.id), String(over.id)));
  }

  const visibleProjects = useMemo(
    () => projects.filter((p) => !pendingIds.has(p.id)),
    [projects, pendingIds],
  );

  // Tolerates a stale id: the selected project can be archived or deleted.
  const selected = visibleProjects.find((p) => p.id === selectedProjectId) ?? visibleProjects[0] ?? null;
  const selectedIndex = selected ? visibleProjects.findIndex((p) => p.id === selected.id) : -1;
  const status = useGitStatus(selected?.id, gitNonce);
  const projectCapsules = selected ? tasks[selected.id] ?? [] : [];
  const actionsDisabled = busy || reorderBusy;

  if (loading) return <ProjectsSkeleton />;
  if (loadError) {
    return (
      <div className="h-full min-h-0 overflow-y-auto p-4">
        <LoadError onRetry={loadProjects} entity="your projects" />
      </div>
    );
  }

  const registerDialog = (
    <Dialog
      open={registerOpen}
      onOpenChange={(open) => {
        setRegisterOpen(open);
        if (!open) resetForm();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register Project</DialogTitle>
          <DialogDescription>Point at an absolute path to an existing git repository.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-project"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-path">Repository Path</Label>
            <Input
              id="project-path"
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              onBlur={onPathBlur}
              placeholder="/absolute/path/to/repo"
              className="font-mono"
            />
            {pathNote && <p className="text-xs text-destructive">{pathNote}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-branch">Default Branch</Label>
            <Input
              id="project-branch"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-dev-url">Dev URL (optional)</Label>
            <Input
              id="project-dev-url"
              value={devUrl}
              onChange={(e) => setDevUrl(e.target.value)}
              placeholder="http://localhost:3000"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setRegisterOpen(false);
              resetForm();
            }}
          >
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={!name || !repoPath || !branch}>
            Register
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="grid h-full min-h-0 grid-cols-[296px_minmax(0,1fr)] overflow-hidden">
      {registerDialog}
      <ProjectDialogs
        renameProject={renameProject}
        iconProject={iconProject}
        busy={busy}
        onClose={() => {
          setRenameProject(null);
          setIconProject(null);
        }}
        onRename={renameProjectById}
        onSetIcon={setProjectIcon}
      />
      <ArchivedProjectsDialog open={archivedOpen} onOpenChange={setArchivedOpen} onActiveChanged={refresh} />

      {/* --- Master --- */}
      <div className="flex min-h-0 flex-col overflow-hidden border-r-[0.5px] border-border">
        <div data-project-list className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 pt-2.5">
          {visibleProjects.length === 0 ? (
            <p className="px-2 pt-2 text-meta text-muted-foreground">No projects registered yet.</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext
                items={visibleProjects.map((p) => p.id)}
                strategy={verticalListSortingStrategy}
              >
                {visibleProjects.map((project) => (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    selected={selected?.id === project.id}
                    disabled={actionsDisabled}
                    openCapsules={(tasks[project.id] ?? []).filter((t) => t.status === "open").length}
                    onSelect={() => selectProject(project.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 border-t-[0.5px] border-border p-2">
          <Button
            size="sm"
            variant="secondary"
            className="h-7 flex-1"
            onClick={() => {
              resetForm();
              setRegisterOpen(true);
            }}
          >
            Register project
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 shrink-0 text-muted-foreground"
            aria-label="Archived projects"
            onClick={() => setArchivedOpen(true)}
          >
            <Icon name="archive" className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* --- Detail --- */}
      <div data-project-detail className="min-h-0 overflow-y-auto">
        {!selected ? (
          <div className="mx-auto max-w-[720px] px-8 pb-10 pt-[30px]">
            <p className="text-card-title font-590 text-foreground">No projects yet</p>
            <p className="mt-1 max-w-[420px] text-sub leading-[1.55] text-muted-foreground">
              Register your first project and Rabta will remember your whole workflow — files,
              branches, tabs and terminals.
            </p>
            <Button
              className="mt-4"
              variant="primary"
              onClick={() => {
                resetForm();
                setRegisterOpen(true);
              }}
            >
              Register project
            </Button>
          </div>
        ) : (
          <div className="mx-auto max-w-[720px] px-8 pb-10 pt-[30px]">
            <h2 className="text-title font-640 text-foreground">{selected.name}</h2>
            <p className="mt-1.5 truncate font-mono text-meta text-muted-foreground">{selected.repoPath}</p>

            {/* Chips wrap on the left; the actions stay together on the
                right. One flex row with a spacer between them stranded
                Archive on a second line as soon as the branch name got
                long enough to wrap. */}
            <div className="mt-3.5 flex items-start justify-between gap-3">
              <div data-project-chips className="flex min-w-0 flex-wrap items-center gap-2">
                {status?.branch && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 font-mono text-meta text-foreground">
                    <Icon name="branch" className="size-3 text-muted-foreground" />
                    {status.branch}
                  </span>
                )}
                {status && (
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-1 text-meta font-590",
                      status.dirty ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok",
                    )}
                  >
                    {status.dirty ? `${status.changedCount} uncommitted` : "clean"}
                  </span>
                )}
                {selected.lastOpenedAt && (
                  <span className="text-sub text-tertiary-foreground">
                    opened {relativeTime(selected.lastOpenedAt)}
                  </span>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-6 rounded-md px-2.5 text-sub"
                  onClick={() =>
                    invoke("reveal_in_finder", { path: selected.repoPath }).catch(toastErr)
                  }
                >
                  <Icon name="folder-open" className="size-3" />
                  Reveal in Finder
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-6 rounded-md px-2.5 text-sub"
                  disabled={actionsDisabled}
                  aria-label={`Archive ${selected.name}`}
                  onClick={() => void archiveProject(selected)}
                >
                  <Icon name="archive" className="size-3" />
                  Archive
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="secondary"
                      className="size-6 rounded-md text-muted-foreground"
                      aria-label={`More actions for ${selected.name}`}
                      disabled={actionsDisabled}
                    >
                      <Icon name="ellipsis" className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onSelect={() => setRenameProject(selected)}>Rename</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setIconProject(selected)}>Change icon</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={selectedIndex <= 0}
                      onSelect={() =>
                        void persistReorder((snapshot) => moveProjectBy(snapshot, selected.id, -1))
                      }
                    >
                      Move up
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={selectedIndex < 0 || selectedIndex >= visibleProjects.length - 1}
                      onSelect={() =>
                        void persistReorder((snapshot) => moveProjectBy(snapshot, selected.id, 1))
                      }
                    >
                      Move down
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                      onSelect={() => requestDelete(selected)}
                    >
                      Delete permanently
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {selected.devUrl && (
              <button
                type="button"
                onClick={() => invoke("open_url", { url: selected.devUrl }).catch(toastErr)}
                title={`Open ${selected.devUrl}`}
                className="mt-2 block max-w-full truncate rounded-sm text-left font-mono text-meta text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {selected.devUrl}
              </button>
            )}

            <GroupHeading className="mt-7">Capsules</GroupHeading>
            <div className="mt-[7px] overflow-hidden rounded-[10px] bg-card shadow-raised">
              <div className="divide-y-[0.5px] divide-border">
                {projectCapsules.length === 0 ? (
                  <p className="px-4 py-3 text-sub text-muted-foreground">
                    No capsules in this project yet.
                  </p>
                ) : (
                  projectCapsules.map((t) => {
                    const rs = resources[t.id] ?? [];
                    const savedAt = capsuleSavedAt(rs);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          selectCapsule(t.id);
                          setView("capsules");
                        }}
                        className="flex w-full cursor-default items-center gap-3 px-4 py-2.5 text-left transition-colors duration-fast ease-standard hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      >
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate text-body",
                            t.status === "done"
                              ? "text-tertiary-foreground line-through"
                              : "text-foreground",
                          )}
                        >
                          {t.title}
                        </span>
                        {capsuleBranch(rs) && (
                          <span className="shrink-0 font-mono text-[11px] text-tertiary-foreground">
                            {capsuleBranch(rs)}
                          </span>
                        )}
                        <span className="shrink-0 text-meta text-tertiary-foreground">
                          {savedAt ? relativeTime(savedAt) : "—"}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Branch controls. Not in the handoff's Projects layout — it
                shows the branch as a read-only chip — but fetch / checkout /
                create-branch are shipped features with nowhere else to live,
                and the safe-git footer below is a promise about exactly
                these operations. */}
            <GroupHeading className="mt-7">Branch</GroupHeading>
            <div className="mt-[7px] rounded-[10px] bg-card p-3 shadow-raised">
              <GitLine
                key={`${selected.id}-${gitNonce}`}
                projectId={selected.id}
                onChanged={() => setGitNonce((n) => n + 1)}
              />
            </div>

            <GitHubSection projectId={selected.id} onStarted={() => setGitNonce((n) => n + 1)} />

            <p className="mt-[26px] flex items-center gap-1.5 text-meta text-tertiary-foreground">
              <Icon name="shield" className="size-3 shrink-0" />
              Safe git only — Rabta never forces, resets or discards.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
