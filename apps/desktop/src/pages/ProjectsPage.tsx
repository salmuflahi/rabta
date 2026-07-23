import { invoke } from "@tauri-apps/api/core";
import { FolderGit2 } from "lucide-react";
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
import { toastErr, toastOk } from "@/lib/toast";
import { useDeferredDelete } from "@/lib/useDeferredDelete";
import { PageHeader } from "@/shell/PageHeader";
import { useStore, type Project, type RepoInspection } from "@/store";
import { GitHubSection } from "@/views/GitHubSection";
import { GitLine } from "@/views/GitLine";

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
  // Pre-first-load window only: true until the initial list_projects fetch
  // settles, then stays false for the life of the page.
  const [loading, setLoading] = useState(true);

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

  // Deferred-commit delete: requestDelete hides the row immediately and
  // shows an Undo toast; the real delete_project invoke only fires ~5s
  // later if the user hasn't clicked Undo (see useDeferredDelete.ts).
  const { pendingIds, requestDelete } = useDeferredDelete<Project>({
    commit: (p) => invoke("delete_project", { id: p.id }),
    labelOf: (p) => p.name,
    onCommitted: refresh,
  });

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

      {loading ? (
        <ProjectsSkeleton />
      ) : count === 0 ? (
        <EmptyState
          icon={<FolderGit2 />}
          title="No projects yet"
          description="Register a repository to start tracking tasks and git state."
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
        <div className="flex flex-col gap-3">
          {visibleProjects.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-foreground font-medium">
                    {p.name} <span className="font-normal text-muted-foreground">({p.defaultBranch})</span>
                  </p>
                  <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{p.repoPath}</p>
                  {p.devUrl && <p className="truncate text-xs text-muted-foreground">{p.devUrl}</p>}
                  <p className="truncate text-xs text-muted-foreground/70">Created {p.createdAt}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => requestDelete(p)}>
                  Delete
                </Button>
              </div>

              <GitLine key={`${p.id}-${startedNonce[p.id] ?? 0}`} projectId={p.id} />
              <GitHubSection
                projectId={p.id}
                onStarted={() => setStartedNonce((n) => ({ ...n, [p.id]: (n[p.id] ?? 0) + 1 }))}
              />
            </Card>
          ))}
        </div>
      )}

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
