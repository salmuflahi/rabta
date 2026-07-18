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
  [key: string]: unknown;
}

const MAX_LOG = 500;
let seq = 0;

interface Store {
  connectors: ConnectorRow[];
  log: LogEntry[];
  paused: boolean;
  setConnectors: (live: ConnectorInfo[]) => void;
  append: (event: { type: string; [key: string]: unknown }) => void;
  togglePause: () => void;
}

export const useStore = create<Store>((set) => ({
  connectors: [],
  log: [],
  paused: false,
  // Live list from the hub; anything previously seen but now absent is
  // kept and shown as disconnected (spec: status dot).
  setConnectors: (live) =>
    set((s) => {
      const rows: ConnectorRow[] = live.map((c) => {
        const prev = s.connectors.find((p) => p.id === c.id);
        return { ...c, connected: true, connectedSince: prev?.connectedSince ?? new Date().toLocaleTimeString() };
      });
      const gone = s.connectors
        .filter((p) => !live.some((c) => c.id === p.id))
        .map((p) => ({ ...p, connected: false }));
      return { connectors: [...rows, ...gone] };
    }),
  append: (event) =>
    set((s) => ({
      log: [...s.log.slice(-(MAX_LOG - 1)), { seq: seq++, at: new Date().toLocaleTimeString(), ...event }],
    })),
  togglePause: () => set((s) => ({ paused: !s.paused })),
}));
