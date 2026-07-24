import { invoke } from "@tauri-apps/api/core";
import {
  Archive,
  FolderOpen,
  Palette,
  Pencil,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDuration, relativeTime } from "@/lib/humanize";
import { ProjectIcon } from "@/lib/project-icons";
import { toastErr } from "@/lib/toast";
import { useStore, type Project } from "@/store";
import { GitHubSection } from "@/views/GitHubSection";
import { GitLine } from "@/views/GitLine";

interface GitStatus {
  branch: string | null;
  dirty: boolean;
  changedCount: number;
  ahead: number;
  behind: number;
}

export function UnsavedChangesDot({
  projectId,
  refreshKey,
}: {
  projectId: string;
  refreshKey?: number;
}) {
  const activationNonce = useStore((state) => state.activationNonce);
  const [status, setStatus] = useState<GitStatus | null>(null);

  useEffect(() => {
    invoke<GitStatus>("git_status", { projectId })
      .then(setStatus)
      .catch((error) =>
        console.error("git status refresh (dot) failed:", error),
      );
  }, [projectId, activationNonce, refreshKey]);

  if (!status?.dirty) return null;

  const count = status.changedCount;
  const label = `${count} uncommitted ${
    count === 1 ? "change" : "changes"
  }`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="status"
          aria-label={label}
          className="inline-block size-2 shrink-0 rounded-full bg-warning"
        />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export interface ProjectCardProps {
  project: Project;
  actionsDisabled: boolean;
  gitRefreshKey: number;
  startedNonce: number;
  onGitChanged: () => void;
  onIssueStarted: () => void;
  onRename: (project: Project) => void;
  onChangeIcon: (project: Project) => void;
  onMove: (project: Project, direction: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onArchive: (project: Project) => void;
  onDelete: (project: Project) => void;
}

export function ProjectCard({
  project,
  actionsDisabled,
  gitRefreshKey,
  startedNonce,
  onGitChanged,
  onIssueStarted,
  onRename,
  onChangeIcon,
  onMove: _onMove,
  canMoveUp: _canMoveUp,
  canMoveDown: _canMoveDown,
  onArchive,
  onDelete,
}: ProjectCardProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Card className="overflow-hidden p-0">
          <div className="flex items-start justify-between gap-4 p-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-primary/15 bg-primary/5 text-primary">
                <ProjectIcon icon={project.icon} className="size-[18px]" />
              </div>
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-1.5">
                  <p className="truncate font-medium text-foreground">
                    {project.name}{" "}
                    <span className="font-normal text-muted-foreground">
                      ({project.defaultBranch})
                    </span>
                  </p>
                  <UnsavedChangesDot
                    projectId={project.id}
                    refreshKey={gitRefreshKey}
                  />
                </div>
                <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                  {project.repoPath}
                </p>
                {project.devUrl && (
                  <p className="truncate text-xs text-muted-foreground">
                    {project.devUrl}
                  </p>
                )}
                {project.lastOpenedAt ? (
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground/70">
                    <span>Opened {relativeTime(project.lastOpenedAt)}</span>
                    <span>Last session {formatDuration(project.activeSeconds)}</span>
                  </div>
                ) : (
                  <p className="mt-1 truncate text-xs text-muted-foreground/70">
                    Created {project.createdAt}
                  </p>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={actionsDisabled}
              aria-label={`Archive ${project.name}`}
              onClick={() => onArchive(project)}
            >
              <Archive />
              Archive
            </Button>
          </div>

          <div className="border-t border-border/70 px-4 pb-4 pt-2">
            <GitLine
              key={`${project.id}-${startedNonce}`}
              projectId={project.id}
              onChanged={onGitChanged}
            />
            <GitHubSection
              projectId={project.id}
              onStarted={onIssueStarted}
            />
          </div>
        </Card>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          disabled={actionsDisabled}
          onSelect={() => onRename(project)}
        >
          <Pencil className="mr-2 size-4" />
          Rename
        </ContextMenuItem>
        <ContextMenuItem
          disabled={actionsDisabled}
          onSelect={() => onChangeIcon(project)}
        >
          <Palette className="mr-2 size-4" />
          Change icon
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() =>
            invoke("reveal_in_finder", { path: project.repoPath }).catch(
              toastErr,
            )
          }
        >
          <FolderOpen className="mr-2 size-4" />
          Reveal in Finder
        </ContextMenuItem>
        <ContextMenuItem
          disabled={actionsDisabled}
          onSelect={() => onArchive(project)}
        >
          <Archive className="mr-2 size-4" />
          Archive
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={actionsDisabled}
          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
          onSelect={() => onDelete(project)}
        >
          <Trash2 className="mr-2 size-4" />
          Delete permanently
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
