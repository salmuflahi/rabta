import type { Project, Task, TaskResource } from "@/store";
import { safeLink } from "@/features/handoff/context";
import type { TeamSnapshot } from "./client";

const clean = (value: unknown) => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 1024) : "";
const entries = (value: unknown): unknown[] => Array.isArray(value) ? value.slice(0, 200) : [];
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};

/** A project-relative reference, or `~/…` for something outside the project
 * but inside the home folder. Anything else is left out: a teammate cannot
 * resolve it and must not receive the absolute path. */
export function relativeReference(value: unknown, root: string): string | null {
  const path = clean(value);
  if (!path) return null;
  if (root && (path === root || path.startsWith(root.endsWith("/") ? root : root + "/"))) {
    const rest = path.slice(root.length).replace(/^\/+/, "");
    return rest || null;
  }
  const home = /^\/(?:Users|home)\/[^/]+\/(.+)$/.exec(path);
  return home ? `~/${home[1]}` : null;
}
/** Builds the snapshot Teams stores from a local task's captured resources. */
export function buildSnapshot(task: Task, project: Project | undefined, resources: TaskResource[], note = ""): TeamSnapshot {
  const root = clean(project?.repoPath);
  const files: string[] = []; const links: string[] = []; const folders: string[] = [];
  let branch: string | null = null; let activeFile: string | null = null;
  const push = (list: string[], value: string | null) => { if (value && !list.includes(value)) list.push(value); };
  for (const resource of resources) {
    const payload = resource.payload ?? {};
    if (["vscode", "cursor"].includes(resource.connectorKind)) {
      for (const file of entries(payload.openFiles)) push(files, relativeReference(typeof file === "string" ? file : record(file).path, root));
      activeFile = relativeReference(payload.activeFile, root) ?? activeFile;
      for (const terminal of entries(payload.terminals)) push(folders, relativeReference(record(terminal).cwd, root));
    }
    if (["chrome", "browser"].includes(resource.connectorKind)) {
      for (const tab of entries(payload.tabs)) { const url = safeLink(record(tab).url); if (url && !links.includes(url)) links.push(url); }
    }
    if (resource.connectorKind === "git" && clean(payload.branch)) branch = clean(payload.branch);
  }
  if (activeFile && !files.includes(activeFile)) activeFile = null;
  return {
    title: clean(task.title).slice(0, 160) || "Untitled task",
    project: { id: clean(project?.id) || task.projectId, name: clean(project?.name).slice(0, 120) || "Untitled project" },
    files: files.slice(0, 200), links: links.slice(0, 100), folders: folders.slice(0, 50), pins: [], branch, activeFile, note: note.trim().slice(0, 2000),
  };
}
export function snapshotIsEmpty(snapshot: TeamSnapshot): boolean {
  return !snapshot.files.length && !snapshot.links.length && !snapshot.folders.length && !snapshot.branch;
}
export function describeSnapshot(snapshot: TeamSnapshot): string {
  const parts = [
    snapshot.files.length ? `${snapshot.files.length} file${snapshot.files.length === 1 ? "" : "s"}` : "",
    snapshot.links.length ? `${snapshot.links.length} link${snapshot.links.length === 1 ? "" : "s"}` : "",
    snapshot.folders.length ? `${snapshot.folders.length} folder${snapshot.folders.length === 1 ? "" : "s"}` : "",
    snapshot.branch ? `branch ${snapshot.branch}` : "",
  ].filter(Boolean);
  return parts.join(" · ") || "nothing to open";
}
