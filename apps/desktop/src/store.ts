import { create } from "zustand";

export interface ConnectorInfo {
  id: string;
  name: string;
  kind: string;
  capabilities: string[];
}

export interface ConnectorRow extends ConnectorInfo {
  connected: boolean;
  connectedSince: string;
}

export interface LogEntry {
  seq: number;
  at: string;
  type: string;
  historical?: boolean;
  [key: string]: unknown;
}

export interface PersistedEvent {
  seq: number;
  at: string;
  type: string;
  sessionConnectorId: string | null;
  payload: Record<string, unknown>;
}

export interface KnownConnector {
  name: string;
  kind: string;
  capabilities: string[];
  firstSeen: string;
  lastSeen: string;
}

const MAX_LOG = 500;
let seq = 0;

const knownId = (c: { name: string; kind: string }) => `known:${c.name}:${c.kind}`;

export interface Project {
  id: string;
  name: string;
  repoPath: string;
  devUrl: string | null;
  defaultBranch: string;
  createdAt: string;
  updatedAt: string;
}

export interface RepoInspection {
  exists: boolean;
  isGitRepo: boolean;
  defaultBranch: string | null;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  status: "open" | "done";
  createdAt: string;
  updatedAt: string;
}

export interface TaskResource {
  id: string;
  taskId: string;
  connectorKind: string;
  resourceType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface PendingPairing {
  pairingId: string;
  name: string;
  kind: string;
}

export type NavKey = "overview" | "capsules" | "projects" | "connectors" | "activity" | "settings";

interface Store {
  connectors: ConnectorRow[];
  log: LogEntry[];
  paused: boolean;
  setConnectors: (live: ConnectorInfo[]) => void;
  append: (event: { type: string; [key: string]: unknown }) => void;
  /** Pre-seed the log with persisted events and the panel with known connectors. */
  preload: (events: PersistedEvent[], known: KnownConnector[]) => void;
  togglePause: () => void;
  view: NavKey;
  setView: (view: NavKey) => void;
  projects: Project[];
  setProjects: (projects: Project[]) => void;
  activeTaskId: string | null;
  setActiveTaskId: (id: string | null) => void;
  /** Bumped after every successful task activation. Activating a task
   * auto-saves the previously-active task, which may live in a different
   * project — including this in a TasksSection's React `key` forces every
   * project's task list to refetch so none show a stale capsule summary. */
  activationNonce: number;
  bumpActivation: () => void;
  pairings: PendingPairing[];
  /** Merge an initial-load snapshot into the current pairings, keyed by
   * pairingId. Existing entries (e.g. from a `pairingRequested` event that
   * arrived before this snapshot resolved) win over the incoming snapshot,
   * so a race with the event listener can never drop a pending request. */
  setPairings: (pairings: PendingPairing[]) => void;
  addPairing: (pairing: PendingPairing) => void;
  removePairing: (pairingId: string) => void;
  hubPort: number | null;
  setHubPort: (port: number | null) => void;
  /** ⌘K / Ctrl-K command palette visibility. */
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
  toggleCommandOpen: () => void;
  /** Cross-page resume signal, set by the command palette's "Resume {task}"
   * item. CapsulesPage is the sole consumer: it watches this field and, once
   * the task is loaded and no restore is already active, drives it through
   * the SAME real Restore Experience its own Resume button uses — the
   * palette never re-implements or duplicates that ceremony. */
  pendingResumeTaskId: string | null;
  requestResume: (taskId: string) => void;
  clearPendingResume: () => void;
  /** ⌘N global shortcut signal (App.tsx). Bumped each time ⌘N fires;
   * ProjectsPage watches this counter and opens its register dialog whenever
   * it changes (a counter, not a boolean, so repeated ⌘N re-opens the dialog
   * even if the user closed it in between). Guarded at 0 on initial mount. */
  newProjectNonce: number;
  requestNewProject: () => void;
  /** ⌘⇧N global shortcut signal (App.tsx). Bumped each time ⌘⇧N fires;
   * CapsulesPage watches this counter and focuses its new-task input. Same
   * counter-not-boolean rationale as `newProjectNonce`. */
  newTaskNonce: number;
  requestNewTask: () => void;
}

export const useStore = create<Store>((set) => ({
  connectors: [],
  log: [],
  paused: false,
  view: "capsules",
  setView: (view) => set({ view }),
  projects: [],
  setProjects: (projects) => set({ projects }),
  activeTaskId: null,
  setActiveTaskId: (activeTaskId) => set({ activeTaskId }),
  activationNonce: 0,
  bumpActivation: () => set((s) => ({ activationNonce: s.activationNonce + 1 })),
  pairings: [],
  hubPort: null,
  setHubPort: (hubPort) => set({ hubPort }),
  commandOpen: false,
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  toggleCommandOpen: () => set((s) => ({ commandOpen: !s.commandOpen })),
  pendingResumeTaskId: null,
  requestResume: (taskId) => set({ pendingResumeTaskId: taskId }),
  clearPendingResume: () => set({ pendingResumeTaskId: null }),
  newProjectNonce: 0,
  requestNewProject: () => set((s) => ({ newProjectNonce: s.newProjectNonce + 1 })),
  newTaskNonce: 0,
  requestNewTask: () => set((s) => ({ newTaskNonce: s.newTaskNonce + 1 })),
  setPairings: (incoming) =>
    set((s) => {
      const merged = [...s.pairings];
      for (const p of incoming) {
        if (!merged.some((existing) => existing.pairingId === p.pairingId)) {
          merged.push(p);
        }
      }
      return { pairings: merged };
    }),
  addPairing: (pairing) =>
    set((s) => ({
      pairings: s.pairings.some((p) => p.pairingId === pairing.pairingId)
        ? s.pairings
        : [...s.pairings, pairing],
    })),
  removePairing: (pairingId) =>
    set((s) => ({ pairings: s.pairings.filter((p) => p.pairingId !== pairingId) })),
  // Live list from the hub; previously-seen-but-absent rows stay, shown
  // disconnected. Synthetic known-rows are dropped once a live row with the
  // same (name, kind) exists.
  setConnectors: (live) =>
    set((s) => {
      const rows: ConnectorRow[] = live.map((c) => {
        const prev = s.connectors.find((p) => p.id === c.id);
        return {
          ...c,
          connected: true,
          connectedSince: prev?.connectedSince ?? new Date().toLocaleTimeString(),
        };
      });
      const gone = s.connectors
        .filter((p) => !live.some((c) => c.id === p.id))
        .filter(
          (p) =>
            !(p.id.startsWith("known:") && live.some((c) => c.name === p.name && c.kind === p.kind))
        )
        .map((p) => ({ ...p, connected: false }));
      return { connectors: [...rows, ...gone] };
    }),
  append: (event) =>
    set((s) => ({
      log: [
        ...s.log.slice(-(MAX_LOG - 1)),
        { seq: seq++, at: new Date().toISOString(), ...event },
      ],
    })),
  preload: (events, known) =>
    set((s) => {
      const historical: LogEntry[] = events.map((e) => ({
        ...e.payload,
        seq: seq++,
        at: new Date(e.at).toISOString(),
        type: e.type,
        historical: true,
      }));
      const seeded: ConnectorRow[] = known
        .filter(
          (k) => !s.connectors.some((p) => p.name === k.name && p.kind === k.kind)
        )
        .map((k) => ({
          id: knownId(k),
          name: k.name,
          kind: k.kind,
          capabilities: k.capabilities,
          connected: false,
          connectedSince: new Date(k.lastSeen).toLocaleTimeString(),
        }));
      return {
        // Drop any previously-seeded historical entries before re-seeding so
        // a second preload (React StrictMode's double effect in dev) replaces
        // rather than duplicates them.
        log: [...historical, ...s.log.filter((e) => !e.historical)].slice(-MAX_LOG),
        connectors: [...s.connectors, ...seeded],
      };
    }),
  togglePause: () => set((s) => ({ paused: !s.paused })),
}));
