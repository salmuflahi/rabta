import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useStore, type Project, type RepoInspection } from "../store";
import { GitHubSection } from "./GitHubSection";
import { GitLine } from "./GitLine";
import { TasksSection } from "./TasksSection";

export function ProjectsView() {
  const projects = useStore((s) => s.projects);
  const setProjects = useStore((s) => s.setProjects);
  const setActiveTaskId = useStore((s) => s.setActiveTaskId);
  const [name, setName] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [devUrl, setDevUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [pathNote, setPathNote] = useState("");
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [startedNonce, setStartedNonce] = useState<Record<string, number>>({});

  const refresh = () =>
    invoke<Project[]>("list_projects")
      .then(setProjects)
      .catch((e) => console.error("list_projects failed:", e));

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    invoke<string | null>("active_task").then(setActiveTaskId).catch(() => {});
  }, []);

  async function onPathBlur() {
    if (!repoPath) return;
    try {
      const ins = await invoke<RepoInspection>("inspect_repo_path", { path: repoPath });
      if (!ins.exists) setPathNote("path does not exist");
      else if (!ins.isGitRepo) setPathNote("not a git repository");
      else {
        setPathNote("");
        if (ins.defaultBranch && !branch) setBranch(ins.defaultBranch);
      }
    } catch (e) {
      setPathNote(String(e));
    }
  }

  async function save() {
    setError("");
    try {
      await invoke("create_project", {
        name,
        repoPath,
        devUrl: devUrl || null,
        defaultBranch: branch,
      });
      setName("");
      setRepoPath("");
      setDevUrl("");
      setBranch("");
      setPathNote("");
      refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  async function remove(id: string) {
    try {
      await invoke("delete_project", { id });
      setConfirming(null);
      refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
      <div>
        <h2 className="text-neutral-400 uppercase text-xs mb-2">Projects</h2>
        {projects.length === 0 && <div className="text-neutral-500">none registered</div>}
        {projects.map((p) => (
          <div key={p.id} className="border border-neutral-700 p-2 mb-2 flex flex-col">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div>
                  {p.name} <span className="text-neutral-500">({p.defaultBranch})</span>
                </div>
                <div className="text-neutral-500 text-xs break-all">{p.repoPath}</div>
                {p.devUrl && <div className="text-neutral-400 text-xs">{p.devUrl}</div>}
                <div className="text-neutral-600 text-xs">created {p.createdAt}</div>
              </div>
              {confirming === p.id ? (
                <span className="text-xs flex items-center gap-2">
                  <span className="text-red-400">delete? tasks and resources go with it</span>
                  <button onClick={() => remove(p.id)} className="bg-red-900 px-2 py-1">
                    confirm
                  </button>
                  <button onClick={() => setConfirming(null)} className="bg-neutral-800 px-2 py-1">
                    cancel
                  </button>
                </span>
              ) : (
                <button onClick={() => setConfirming(p.id)} className="bg-neutral-800 px-2 py-1">
                  delete
                </button>
              )}
            </div>
            <GitLine projectId={p.id} />
            <GitHubSection
              projectId={p.id}
              onStarted={() => setStartedNonce((n) => ({ ...n, [p.id]: (n[p.id] ?? 0) + 1 }))}
            />
            <TasksSection key={`${p.id}-${startedNonce[p.id] ?? 0}`} projectId={p.id} />
          </div>
        ))}
      </div>

      <div className="border border-neutral-700 p-3 max-w-xl">
        <h2 className="text-neutral-400 uppercase text-xs mb-2">Register project</h2>
        <div className="flex flex-col gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="name"
            className="bg-neutral-800 p-1"
          />
          <input
            value={repoPath}
            onChange={(e) => setRepoPath(e.target.value)}
            onBlur={onPathBlur}
            placeholder="/absolute/path/to/repo"
            className="bg-neutral-800 p-1"
          />
          {pathNote && <div className="text-red-400 text-xs">{pathNote}</div>}
          <input
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="default branch"
            className="bg-neutral-800 p-1"
          />
          <input
            value={devUrl}
            onChange={(e) => setDevUrl(e.target.value)}
            placeholder="dev URL (optional)"
            className="bg-neutral-800 p-1"
          />
          <button
            onClick={save}
            disabled={!name || !repoPath || !branch}
            className="bg-neutral-700 py-1 disabled:opacity-40"
          >
            register
          </button>
          {error && <div className="text-red-400 text-xs">{error}</div>}
        </div>
      </div>
    </div>
  );
}
