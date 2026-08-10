import { create } from "zustand";
import type { MotionPref } from "@/lib/motion";
import type { AccentId } from "@/theme/accent";
import { ACCENTS } from "@/theme/accent";

export interface ConnectorInfo {
  id: string;
  name: string;
  kind: string;
  capabilities: string[];
  /** The connector's own product/build version, if it reported one. */
  version?: string;
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
  version?: string;
  firstSeen: string;
  lastSeen: string;
}

const MAX_LOG = 500;
let seq = 0;

/** `.toISOString()` throws on an invalid Date (unlike the old
 * `.toLocaleTimeString()`, which just returned "Invalid Date" harmlessly) —
 * guard against an unparseable `lastSeen` by falling back to now. */
function toIsoOrNow(input: string): string {
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

const SIDEBAR_KEY = "rabta.sidebarCollapsed";
function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === "true";
  } catch {
    return false;
  }
}

/** User preferences (Settings). All client-side, persisted to one localStorage
 * key. Only settings that actually change app behavior live here. */
export type ThemePref = "system" | "light" | "dark";
export interface Prefs {
  theme: ThemePref;
  /** Settings › Appearance. Which of the four accent colours (src/theme/accent.ts)
   *  paints --primary/--primary-hover/--accent-text/--accent-soft. */
  accent: AccentId;
  motion: MotionPref;
  /** Persist the collapsed rail across launches. */
  rememberSidebar: boolean;
  /** Which page Rabta opens on. */
  landingPage: NavKey;
  /** On launch, resume the previously-active task automatically. */
  resumeOnLaunch: boolean;
  /** Keep completed (done) capsules visible in the list. */
  keepCompleted: boolean;
  /** On resume, also put away what does not belong to the task. Off by
   *  default: every Resume today is non-destructive. */
  focusMode: boolean;
  /** Reveal the raw connector-command console (Settings → Advanced). */
  developerMode: boolean;
  /** Settings › Window. Shows/hides the window-chrome footer (StatusBar)
   *  that reports live connector count and last activity. */
  statusbar: boolean;
}

const PREFS_KEY = "rabta.prefs";
export const DEFAULT_PREFS: Prefs = {
  theme: "system",
  accent: "tangerine",
  motion: "system",
  rememberSidebar: true,
  landingPage: "capsules",
  resumeOnLaunch: false,
  keepCompleted: true,
  focusMode: false,
  developerMode: false,
  statusbar: true,
};

export function readPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) {
      return { ...DEFAULT_PREFS };
    }
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    const merged = { ...DEFAULT_PREFS, ...parsed };

    // Validate accent: if it's not a valid key in ACCENTS, use the default
    if (merged.accent && !(merged.accent in ACCENTS)) {
      merged.accent = DEFAULT_PREFS.accent;
    }

    // Validate statusbar: a persisted non-boolean ("true", null, 0, ...)
    // must not make the bar render or hide unpredictably — fall back to
    // the default instead of trusting whatever JSON.parse produced.
    if (typeof merged.statusbar !== "boolean") {
      merged.statusbar = DEFAULT_PREFS.statusbar;
    }

    return merged;
  } catch {
    return { ...DEFAULT_PREFS };
  }
}
export function writePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}
const INITIAL_PREFS = readPrefs();

const knownId = (c: { name: string; kind: string }) => `known:${c.name}:${c.kind}`;

export type ProjectIconKey =
  | "code"
  | "globe"
  | "database"
  | "terminal"
  | "blocks"
  | "rocket"
  | "wrench"
  | "folder";

export interface Project {
  id: string;
  name: string;
  repoPath: string;
  devUrl: string | null;
  defaultBranch: string;
  icon: ProjectIconKey | null;
  archivedAt: string | null;
  lastOpenedAt: string | null;
  lastTaskId: string | null;
  activeSeconds: number;
  sortOrder: number;
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

/** Which direction a migration is going. */
export type MigrateRole = "send" | "receive";

/** Which parts of this Mac cross. Mirrors `Include` in rabta-db — the
 * bundle honours these, so an unticked section is absent from the file
 * rather than filtered on the way out. */
export interface MigrateInclude {
  capsules: boolean;
  projects: boolean;
  pairings: boolean;
  preferences: boolean;
  history: boolean;
}

/** What to do about a name that already exists on the receiving Mac.
 * `replace` is the only destructive one, and the UI says so in words. */
export type MigrateMerge = "keepBoth" | "replace" | "skip";

export interface MigrateState {
  role: MigrateRole;
  /** Index into the role's own step list — see MigrateSheet. */
  step: number;
  /** Only "file" is implemented; "nearby" is drawn disabled with its
   * reason. See src-tauri/src/migrate.rs for why. */
  transport: "file" | "nearby";
  include: MigrateInclude;
  /** Where the bundle is written to, or read from. */
  path: string;
  passphrase: string;
  /** Receive: the home directory incoming paths are remapped onto. */
  remap: string;
  merge: MigrateMerge;
}

export const DEFAULT_MIGRATE_INCLUDE: MigrateInclude = {
  capsules: true,
  projects: true,
  pairings: true,
  preferences: true,
  history: true,
};

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
  /** ⌘N global shortcut signal (App.tsx), same reset-after-consume shape as
   * `pendingResumeTaskId`: `requestNewProject` sets this true, ProjectsPage's
   * effect opens the register dialog and immediately calls
   * `clearNewProjectRequest`. Because the flag is cleared on consumption
   * (not left to persist like a counter would), remounting ProjectsPage
   * — e.g. navigating away and back via the sidebar — sees `false` and does
   * nothing; only a fresh ⌘N sets it true again. */
  newProjectRequest: boolean;
  requestNewProject: () => void;
  clearNewProjectRequest: () => void;
  /** ⌘⇧N global shortcut signal (App.tsx). Same reset-after-consume shape as
   * `newProjectRequest`: CapsulesPage's effect focuses the new-task input
   * then calls `clearNewTaskRequest`, so remounting the page never
   * re-triggers a stale request. */
  newTaskRequest: boolean;
  requestNewTask: () => void;
  clearNewTaskRequest: () => void;
  // --- Master/detail selection (Console v2 Phase 2) ---
  //
  // The handoff's State block lists one selected id per master/detail
  // screen — `capsule`, `project`, `connector`, `event`, `section`, plus the
  // capsule list's `filter`. They live here rather than in each page's local
  // state for one reason: selection has to survive navigation. Opening a
  // capsule from Overview's "Also open" means routing to Capsules *with that
  // row selected*, and the command palette does the same for all four lists.
  // Page-local state would lose the id on the way across.
  //
  // Every one is nullable and every consumer must tolerate a stale id: the
  // selected capsule can be deleted, the selected connector can go away, and
  // neither should render an empty detail pane pretending something is
  // there. The pages fall back to their own first row.
  /** Selected capsule (task) id in the Capsules master list. */
  selectedCapsuleId: string | null;
  selectCapsule: (id: string | null) => void;
  /** Selected project id in the Projects master list. */
  selectedProjectId: string | null;
  selectProject: (id: string | null) => void;
  /** Selected connector id in the Connectors master list. */
  selectedConnectorId: string | null;
  selectConnector: (id: string | null) => void;
  /** Selected event sequence number in the Activity list. */
  selectedEventSeq: number | null;
  selectEvent: (seq: number | null) => void;
  /** Selected Settings section id. */
  settingsSection: string;
  setSettingsSection: (id: string) => void;
  /** Capsules list filter — the handoff's Open / Done segmented control. */
  capsuleFilter: "open" | "done";
  setCapsuleFilter: (filter: "open" | "done") => void;

  // --- Migrate (Console v2 Phase 3) ---
  //
  // The handoff's State block names this `mig  null | { role, step, ... }`:
  // one nullable object, because a migration is either happening or it
  // isn't, and half its fields are meaningless when it isn't. Kept out of
  // the sheet's own local state so ⌘K's "Migrate" and "Receive" actions can
  // open it directly at the right role from anywhere.
  mig: MigrateState | null;
  openMigrate: (role: MigrateRole) => void;
  closeMigrate: () => void;
  patchMigrate: (patch: Partial<MigrateState>) => void;

  /** Icons-only rail vs. full sidebar, persisted to localStorage so it
   * survives reload. Toggled via the sidebar's collapse button or ⌘\. */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  /** Native macOS fullscreen: no traffic lights, so the frame drops the
   * title-bar reservation and the collapsed rail narrows. */
  fullscreen: boolean;
  setFullscreen: (fullscreen: boolean) => void;
  /** User preferences (Settings). */
  prefs: Prefs;
  setPref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
  resetPrefs: () => void;
}

export const useStore = create<Store>((set) => ({
  connectors: [],
  log: [],
  paused: false,
  view: INITIAL_PREFS.landingPage,
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
  newProjectRequest: false,
  requestNewProject: () => set({ newProjectRequest: true }),
  clearNewProjectRequest: () => set({ newProjectRequest: false }),
  newTaskRequest: false,
  requestNewTask: () => set({ newTaskRequest: true }),
  clearNewTaskRequest: () => set({ newTaskRequest: false }),
  mig: null,
  openMigrate: (role) =>
    set({
      mig: {
        role,
        step: 0,
        transport: "file",
        include: { ...DEFAULT_MIGRATE_INCLUDE },
        path: "",
        passphrase: "",
        remap: "",
        merge: "keepBoth",
      },
    }),
  closeMigrate: () => set({ mig: null }),
  patchMigrate: (patch) =>
    set((s) => (s.mig ? { mig: { ...s.mig, ...patch } } : {})),
  selectedCapsuleId: null,
  selectCapsule: (selectedCapsuleId) => set({ selectedCapsuleId }),
  selectedProjectId: null,
  selectProject: (selectedProjectId) => set({ selectedProjectId }),
  selectedConnectorId: null,
  selectConnector: (selectedConnectorId) => set({ selectedConnectorId }),
  selectedEventSeq: null,
  selectEvent: (selectedEventSeq) => set({ selectedEventSeq }),
  settingsSection: "general",
  setSettingsSection: (settingsSection) => set({ settingsSection }),
  capsuleFilter: "open",
  setCapsuleFilter: (capsuleFilter) => set({ capsuleFilter }),
  sidebarCollapsed: INITIAL_PREFS.rememberSidebar ? readSidebarCollapsed() : false,
  toggleSidebar: () =>
    set((s) => {
      const next = !s.sidebarCollapsed;
      // Only persist across launches when the user opted into remembering it.
      if (s.prefs.rememberSidebar) {
        try {
          localStorage.setItem(SIDEBAR_KEY, String(next));
        } catch {
          /* ignore */
        }
      }
      return { sidebarCollapsed: next };
    }),
  fullscreen: false,
  setFullscreen: (fullscreen) => set({ fullscreen }),
  prefs: INITIAL_PREFS,
  setPref: (key, value) =>
    set((s) => {
      const prefs = { ...s.prefs, [key]: value };
      writePrefs(prefs);
      return { prefs };
    }),
  resetPrefs: () => {
    try {
      localStorage.removeItem(PREFS_KEY);
      localStorage.removeItem(SIDEBAR_KEY);
    } catch {
      /* ignore */
    }
    set({ prefs: { ...DEFAULT_PREFS }, sidebarCollapsed: false });
  },
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
          connectedSince: prev?.connectedSince ?? new Date().toISOString(),
        };
      });
      const gone = s.connectors
        .filter((p) => !live.some((c) => c.id === p.id))
        // A live connection supersedes any earlier row of the same tool,
        // whether that row is a synthetic `known:` seed OR a real previous
        // session with a now-stale id. The hub mints a fresh id per accept, so
        // without this a reconnect (VS Code restart, hub blip) would strand a
        // permanent duplicate "Offline" row for the same (name, kind).
        .filter((p) => !live.some((c) => c.name === p.name && c.kind === p.kind))
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
          version: k.version,
          connected: false,
          connectedSince: toIsoOrNow(k.lastSeen),
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
