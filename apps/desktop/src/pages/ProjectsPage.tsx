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
import { toastErr, toastOk } from "@/lib/toast";
import { PageHeader } from "@/shell/PageHeader";
import { useStore, type Project, type RepoInspection } from "@/store";
import { GitHubSection } from "@/views/GitHubSection";
import { GitLine } from "@/views/GitLine";

export function ProjectsPage() {
  const projects = useStore((s) => s.projects);
  const setProjects = useStore((s) => s.setProjects);
  const setActiveTaskId = useStore((s) => s.setActiveTaskId);

  const [registerOpen, setRegisterOpen] = useState(false);
  const [name, setName] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [devUrl, setDevUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [pathNote, setPathNote] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [startedNonce, setStartedNonce] = useState<Record<string, number>>({});

  const refresh = () =>
    invoke<Project[]>("list_projects")
      .then(setProjects)
      .catch((e) => console.error("list_projects failed:", e));

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    invoke<string | null>("active_task").then(setActiveTaskId).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  async function remove(id: string) {
    try {
      await invoke("delete_project", { id });
      setDeleteTarget(null);
      refresh();
      toastOk("Project deleted");
    } catch (e) {
      toastErr(e);
    }
  }

  const count = projects.length;
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

      {count === 0 ? (
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
          {projects.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-foreground font-medium">
                    {p.name} <span className="font-normal text-muted-foreground">({p.defaultBranch})</span>
                  </p>
                  <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{p.repoPath}</p>
                  {p.devUrl && <p className="text-xs text-muted-foreground">{p.devUrl}</p>}
                  <p className="text-xs text-muted-foreground/70">Created {p.createdAt}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setDeleteTarget(p)}>
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
              <Label htmlFor="project-path">Repository path</Label>
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
              <Label htmlFor="project-branch">Default branch</Label>
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

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.name}?</DialogTitle>
            <DialogDescription>
              Tasks and resources for this project go with it. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => deleteTarget && remove(deleteTarget.id)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
