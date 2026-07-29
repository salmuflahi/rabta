/**
 * Mock Tauri bridge for the screenshot capture rig.
 *
 * Vite aliases `@tauri-apps/api/core` and `@tauri-apps/api/event` to this
 * module during capture only. It is never part of the shipped app build.
 *
 * The point is fidelity: every command name, argument name and return shape
 * matches what the Rust backend actually exposes, and mutating commands
 * mutate this module's in-memory state the same way the real backend
 * mutates the database. The React tree therefore renders through its real
 * code paths — same effects, same loading states, same transitions — rather
 * than against a hand-drawn approximation.
 */
import {
  ACTIVATE_SUMMARY,
  ACTIVE_TASK_ID,
  ALL_TASKS,
  EVENTS,
  GIT_BRANCHES,
  GIT_STATUS,
  HUB_PORT,
  KNOWN_CONNECTORS,
  LIVE_CONNECTORS,
  PENDING_PAIRINGS,
  PROJECTS,
  RESOURCES,
  SAVE_SUMMARY,
  TASKS,
} from "./seed";
import type { Project, Task } from "@/store";

// Mutable copies so mutating commands behave like the real backend.
let projects: Project[] = PROJECTS.map((p) => ({ ...p }));
const tasks: Record<string, Task[]> = Object.fromEntries(
  Object.entries(TASKS).map(([k, v]) => [k, v.map((t) => ({ ...t }))]),
);
let activeTaskId: string | null = ACTIVE_TASK_ID;

/** Commands the app fires that have no meaningful return value. Listing them
 *  explicitly means an unhandled command is a loud failure, not a silent
 *  `undefined` that renders as an empty screen. */
const VOID_COMMANDS = new Set([
  "open",
  "open_url",
  "reveal_in_finder",
  "send_command",
  "session_heartbeat",
  "session_update",
  "done",
  "approve_pairing",
  "deny_pairing",
  "delete_project",
  "delete_task",
]);

/** Deliberate, fixed latency so loading states are exercised but capture
 *  stays fast and deterministic. */
const LATENCY_MS = 0;

type Args = Record<string, unknown> | undefined;

function handle(cmd: string, args: Args): unknown {
  switch (cmd) {
    // ---------------------------------------------------------- read paths
    case "list_projects":
      return projects.filter((p) => p.archivedAt === null);
    case "list_archived_projects":
      return projects.filter((p) => p.archivedAt !== null);
    case "list_tasks": {
      const projectId = String(args?.projectId ?? "");
      return tasks[projectId] ?? [];
    }
    case "task_resources": {
      const taskId = String(args?.taskId ?? "");
      return RESOURCES[taskId] ?? [];
    }
    case "active_task":
      return activeTaskId;
    case "connectors":
      return LIVE_CONNECTORS;
    case "known_connectors":
      return KNOWN_CONNECTORS;
    case "recent_events": {
      const limit = Number(args?.limit ?? 200);
      return EVENTS.slice(0, limit);
    }
    case "pending_pairings":
      // The app surfaces a pending pairing as a global banner on every
      // view. That belongs in the Connectors capture, where the approval
      // gate is the story — everywhere else it would read as a permanent
      // alert the product doesn't actually have.
      return /capture=connectors/.test(window.location.hash) ? PENDING_PAIRINGS : [];
    case "hub_port":
      return HUB_PORT;
    case "git_status": {
      const projectId = String(args?.projectId ?? "");
      return GIT_STATUS[projectId] ?? { branch: null, dirty: false, changedCount: 0, ahead: 0, behind: 0 };
    }
    case "git_branches": {
      const projectId = String(args?.projectId ?? "");
      return GIT_BRANCHES[projectId] ?? [];
    }
    // GitHub integration is not configured in this fixture, so the section
    // renders its real unavailable state rather than inventing issues.
    case "github_available":
      return false;
    case "github_issues":
      return [];
    case "inspect_repo_path":
      return { exists: true, isGitRepo: true, defaultBranch: "main" };

    // --------------------------------------------------------- write paths
    case "activate_task": {
      const taskId = String(args?.taskId ?? "");
      activeTaskId = taskId;
      return { ...ACTIVATE_SUMMARY };
    }
    case "save_capsule":
      return { ...SAVE_SUMMARY };
    case "set_task_status": {
      const id = String(args?.id ?? "");
      const status = String(args?.status ?? "open") as Task["status"];
      for (const list of Object.values(tasks)) {
        const t = list.find((x) => x.id === id);
        if (t) {
          t.status = status;
          return { ...t };
        }
      }
      return null;
    }
    case "rename_task": {
      const id = String(args?.id ?? "");
      const title = String(args?.title ?? "");
      for (const list of Object.values(tasks)) {
        const t = list.find((x) => x.id === id);
        if (t) {
          t.title = title;
          return { ...t };
        }
      }
      return null;
    }
    case "rename_project": {
      const id = String(args?.id ?? "");
      const name = String(args?.name ?? "");
      const p = projects.find((x) => x.id === id);
      if (p) p.name = name;
      return p ? { ...p } : null;
    }
    case "set_project_icon": {
      const id = String(args?.id ?? "");
      const p = projects.find((x) => x.id === id);
      if (p) p.icon = (args?.icon ?? null) as Project["icon"];
      return p ? { ...p } : null;
    }
    case "reorder_projects": {
      const order = (args?.ids ?? []) as string[];
      if (order.length) {
        projects = order
          .map((id, i) => {
            const p = projects.find((x) => x.id === id);
            return p ? { ...p, sortOrder: i } : null;
          })
          .filter((p): p is Project => p !== null);
      }
      return projects.filter((p) => p.archivedAt === null);
    }
    case "archive_project":
      return { archived: true, activeTaskCleared: false };
    case "unarchive_project": {
      const id = String(args?.id ?? "");
      const p = projects.find((x) => x.id === id);
      if (p) p.archivedAt = null;
      return p ? { ...p } : null;
    }
    case "create_project":
    case "create_task":
    case "duplicate_task":
    case "start_issue_task":
      // Not exercised by any captured screen; fail loudly if that changes.
      throw new Error(`capture: ${cmd} intentionally unimplemented`);

    default:
      if (VOID_COMMANDS.has(cmd)) return null;
      throw new Error(`capture: unhandled command "${cmd}"`);
  }
}

// ------------------------------------------------- @tauri-apps/api/core

export function invoke<T>(cmd: string, args?: Args): Promise<T> {
  try {
    const value = handle(cmd, args) as T;
    return LATENCY_MS > 0
      ? new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS))
      : Promise.resolve(value);
  } catch (err) {
    // Surface mistakes in the rig immediately instead of letting a screen
    // silently capture in an error state.
    console.error("[capture]", err);
    return Promise.reject(err);
  }
}

export const convertFileSrc = (p: string) => p;
export const isTauri = () => true;

// ------------------------------------------------ @tauri-apps/api/event

export type UnlistenFn = () => void;

/** No live events during capture — the screens are captured in a settled
 *  state seeded via `recent_events`, so nothing streams in mid-screenshot
 *  and makes the output non-deterministic. */
export function listen<T>(
  _event: string,
  _handler: (e: { payload: T }) => void,
): Promise<UnlistenFn> {
  return Promise.resolve(() => {});
}

export function emit(): Promise<void> {
  return Promise.resolve();
}

export const once = listen;
