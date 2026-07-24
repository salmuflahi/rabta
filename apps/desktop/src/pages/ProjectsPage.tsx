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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ArchiveRestore, FolderGit2 } from "lucide-react";
import { useEffect, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import { ArchivedProjectsDialog } from "@/features/projects/ArchivedProjectsDialog";
import { ProjectCard } from "@/features/projects/ProjectCard";
import { ProjectDialogs } from "@/features/projects/ProjectDialogs";
import { moveProject, moveProjectBy } from "@/lib/project-order";
import { toastErr, toastOk } from "@/lib/toast";
import { useDeferredDelete } from "@/lib/useDeferredDelete";
import { PageHeader } from "@/shell/PageHeader";
import {
  useStore,
  type Project,
  type ProjectIconKey,
  type RepoInspection,
} from "@/store";

interface ArchiveProjectResult {
  project: Project;
  warnings: string[];
}

/** Skeleton placeholder for the pre-first-load window only — approximates
 * three project cards (name/path/branch lines + a delete button) so there's
 * no layout shift once list_projects resolves. */
function ProjectsSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <Card key={i} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-8 w-16 shrink-0" />
          </div>
        </Card>
      ))}
    </div>
  );
}

export function ProjectsPage() {
  const projects = useStore((s) => s.projects);
  const setProjects = useStore((s) => s.setProjects);
  const setActiveTaskId = useStore((s) => s.setActiveTaskId);
  const newProjectRequest = useStore((s) => s.newProjectRequest);
  const clearNewProjectRequest = useStore((s) => s.clearNewProjectRequest);

  const [registerOpen, setRegisterOpen] = useState(false);
  const [name, setName] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [devUrl, setDevUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [pathNote, setPathNote] = useState("");
  const [startedNonce, setStartedNonce] = useState<Record<string, number>>({});
  // Bumped by GitLine's own onChanged (fetch/checkout/create-branch success)
  // so the dot refetches without GitLine remounting — see FIX 1 in the
  // final-fixes brief: startedNonce alone missed GitLine's own git ops.
  const [gitOpNonce, setGitOpNonce] = useState<Record<string, number>>({});
  // Pre-first-load window only: true until the initial list_projects fetch
  // settles, then stays false for the life of the page.
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reorderBusy, setReorderBusy] = useState(false);
  const [renameProject, setRenameProject] = useState<Project | null>(null);
  const [iconProject, setIconProject] = useState<Project | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const refresh = () =>
    invoke<Project[]>("list_projects")
      .then(setProjects)
      .catch((e) => console.error("list_projects failed:", e));

  useEffect(() => {
    refresh().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    invoke<string | null>("active_task").then(setActiveTaskId).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ⌘N global shortcut (App.tsx): sets newProjectRequest, which this effect
  // consumes to open the register dialog and then immediately clears —
  // mirrors the pendingResumeTaskId pattern. Because the flag is cleared
  // right after firing, remounting this page (e.g. navigating away and back
  // via the sidebar) sees it already false and does nothing; a fresh ⌘N
  // still re-opens the dialog by setting it true again.
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
    } catch (e) {
      setPathNote(String(e));
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

  async function setProjectIcon(
    id: string,
    icon: ProjectIconKey | null,
  ) {
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
      const result = await invoke<ArchiveProjectResult>("archive_project", {
        id: project.id,
      });
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

  // Deferred-commit delete: requestDelete hides the row immediately and
  // shows an Undo toast; the real delete_project invoke only fires ~5s
  // later if the user hasn't clicked Undo (see useDeferredDelete.ts).
  const { pendingIds, requestDelete } = useDeferredDelete<Project>({
    commit: (p) => invoke("delete_project", { id: p.id }),
    labelOf: (p) => p.name,
    onCommitted: refresh,
  });

  async function persistReorder(
    reorder: (snapshot: Project[]) => Project[],
  ) {
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
    void persistReorder((snapshot) =>
      moveProject(snapshot, String(active.id), String(over.id)),
    );
  }

  const visibleProjects = projects.filter((p) => !pendingIds.has(p.id));
  const count = visibleProjects.length;
  const subtitle = count === 0 ? "No projects registered yet" : `${count} ${count === 1 ? "project" : "projects"} registered`;

  return (
    <div>
      <PageHeader
        eyebrow="WORKSPACE"
        title="Projects"
        subtitle={subtitle}
        actions={
          <>
            <Button
              variant="outline"
              aria-label="Archived projects"
              onClick={() => setArchivedOpen(true)}
            >
              <ArchiveRestore />
              Archived
            </Button>
            <Button
              onClick={() => {
                resetForm();
                setRegisterOpen(true);
              }}
            >
              Register Project
            </Button>
          </>
        }
      />

      {loading ? (
        <ProjectsSkeleton />
      ) : count === 0 ? (
        <EmptyState
          icon={<FolderGit2 />}
          title="No projects yet"
          description="Register your first project and Rabta will remember your entire workflow — files, branches, tabs, and terminals."
          action={
            <Button
              onClick={() => {
                resetForm();
                setRegisterOpen(true);
              }}
            >
              Register Project
            </Button>
          }
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={visibleProjects.map((project) => project.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-3">
              {visibleProjects.map((project, index) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  actionsDisabled={busy || reorderBusy}
                  gitRefreshKey={
                    (startedNonce[project.id] ?? 0) +
                    (gitOpNonce[project.id] ?? 0)
                  }
                  startedNonce={startedNonce[project.id] ?? 0}
                  onGitChanged={() =>
                    setGitOpNonce((nonces) => ({
                      ...nonces,
                      [project.id]: (nonces[project.id] ?? 0) + 1,
                    }))
                  }
                  onIssueStarted={() =>
                    setStartedNonce((nonces) => ({
                      ...nonces,
                      [project.id]: (nonces[project.id] ?? 0) + 1,
                    }))
                  }
                  onRename={setRenameProject}
                  onChangeIcon={setIconProject}
                  onMove={(target, direction) =>
                    void persistReorder((snapshot) =>
                      moveProjectBy(snapshot, target.id, direction),
                    )
                  }
                  canMoveUp={index > 0}
                  canMoveDown={index < visibleProjects.length - 1}
                  onArchive={(target) => void archiveProject(target)}
                  onDelete={requestDelete}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

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

      <ArchivedProjectsDialog
        open={archivedOpen}
        onOpenChange={setArchivedOpen}
        onActiveChanged={refresh}
      />

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
            <Button onClick={save} disabled={!name || !repoPath || !branch}>
              Register
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
