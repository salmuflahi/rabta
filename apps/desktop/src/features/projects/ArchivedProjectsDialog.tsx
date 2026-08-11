import { invoke } from "@tauri-apps/api/core";
import { ArchiveRestore, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { relativeTime } from "@/lib/humanize";
import { ProjectIcon } from "@/lib/project-icons";
import { toastErr, toastOk } from "@/lib/toast";
import { useDeferredDelete } from "@/lib/useDeferredDelete";
import type { Project } from "@/store";

interface ArchivedProjectsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onActiveChanged: () => Promise<void> | void;
}

/** Mirrors one archived-project row below: a size-8 leading icon box (the
 * real `ProjectIcon` sits in an identically-sized `bg-muted` box), the name
 * and "Archived …" lines stacked, and the Restore (default `size="sm"`,
 * h-8) / delete (`size="icon"`, size-9) buttons' true sizes on the trailing
 * edge. Neither button has a className override here the way Projects'
 * detail-pane actions do, so their default buttonVariants sizes are exact. */
function ArchivedProjectRowSkeleton() {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border p-3">
      <div className="flex min-w-0 items-center gap-3">
        <Skeleton className="size-8 shrink-0" />
        <div className="min-w-0 space-y-1.5">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-2.5 w-24" />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="size-9" />
      </div>
    </div>
  );
}

export function ArchivedProjectsDialog({
  open,
  onOpenChange,
  onActiveChanged,
}: ArchivedProjectsDialogProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const rows = await invoke<Project[]>("list_archived_projects");
    setProjects(rows);
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    refresh()
      .catch(toastErr)
      .finally(() => setLoading(false));
  }, [open, refresh]);

  const refreshAll = useCallback(async () => {
    await Promise.all([refresh(), Promise.resolve(onActiveChanged())]);
  }, [onActiveChanged, refresh]);

  const { pendingIds, requestDelete } = useDeferredDelete<Project>({
    commit: (project) => invoke("delete_project", { id: project.id }),
    labelOf: (project) => project.name,
    onCommitted: () => void refreshAll(),
  });

  const visibleProjects = projects.filter(
    (project) => !pendingIds.has(project.id),
  );

  async function restore(project: Project) {
    setBusyId(project.id);
    try {
      await invoke<Project>("unarchive_project", { id: project.id });
      await refreshAll();
      toastOk("Project restored", project.name);
    } catch (error) {
      toastErr(error);
      await refresh().catch(() => {});
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archived projects</DialogTitle>
          <DialogDescription>
            Restore a workspace or permanently remove its capsules and saved
            resources.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="space-y-2">
            <ArchivedProjectRowSkeleton />
            <ArchivedProjectRowSkeleton />
          </div>
        ) : visibleProjects.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center">
            <ArchiveRestore className="mx-auto size-5 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">No archived projects</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Archived workspaces will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleProjects.map((project) => (
              <div
                key={project.id}
                className="flex items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <ProjectIcon icon={project.icon} className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{project.name}</p>
                    {project.archivedAt && (
                      <p className="text-xs text-muted-foreground">
                        Archived {relativeTime(project.archivedAt)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId !== null}
                    aria-label={`Restore ${project.name}`}
                    onClick={() => void restore(project)}
                  >
                    Restore
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={busyId !== null}
                    aria-label={`Delete ${project.name} permanently`}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => requestDelete(project)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
