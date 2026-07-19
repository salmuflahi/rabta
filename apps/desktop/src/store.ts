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

interface Store {
  connectors: ConnectorRow[];
  log: LogEntry[];
  paused: boolean;
  setConnectors: (live: ConnectorInfo[]) => void;
  append: (event: { type: string; [key: string]: unknown }) => void;
  /** Pre-seed the log with persisted events and the panel with known connectors. */
  preload: (events: PersistedEvent[], known: KnownConnector[]) => void;
  togglePause: () => void;
  view: "projects" | "debug";
  setView: (view: "projects" | "debug") => void;
  projects: Project[];
  setProjects: (projects: Project[]) => void;
}

export const useStore = create<Store>((set) => ({
  connectors: [],
  log: [],
  paused: false,
  view: "projects",
  setView: (view) => set({ view }),
  projects: [],
  setProjects: (projects) => set({ projects }),
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
        { seq: seq++, at: new Date().toLocaleTimeString(), ...event },
      ],
    })),
  preload: (events, known) =>
    set((s) => {
      const historical: LogEntry[] = events.map((e) => ({
        ...e.payload,
        seq: seq++,
        at: new Date(e.at).toLocaleTimeString(),
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
