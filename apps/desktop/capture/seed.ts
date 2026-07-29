/**
 * Deterministic capture fixture.
 *
 * Every value here is frozen: fixed ids, fixed timestamps derived from a
 * single pinned instant, fixed ordering. Two runs of the capture rig produce
 * byte-identical screenshots.
 *
 * Hygiene rules for anything added to this file:
 *   - no real usernames, machine names, emails or absolute home paths
 *   - no capability that does not exist in shipped v0.1.0
 *   - no fabricated counts (downloads, users, stars)
 *   - payload shapes must match what the Rust hub actually sends, so the
 *     components render through their real code paths
 */
import type {
  ConnectorInfo,
  KnownConnector,
  PersistedEvent,
  Project,
  Task,
  TaskResource,
} from "@/store";

/** The pinned clock. `main.tsx` freezes Date around this instant so every
 *  relative label ("8m ago", "1h 30m") is stable across runs. */
export const NOW_ISO = "2026-07-29T14:20:00.000Z";
export const NOW_MS = Date.parse(NOW_ISO);

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** ISO timestamp `n` ms before the pinned instant. */
const ago = (ms: number) => new Date(NOW_MS - ms).toISOString();

// ---------------------------------------------------------------- projects

export const PROJECTS: Project[] = [
  {
    id: "prj_atlas",
    name: "atlas-api",
    repoPath: "~/code/atlas-api",
    devUrl: "http://localhost:8080",
    defaultBranch: "main",
    icon: "database",
    archivedAt: null,
    lastOpenedAt: ago(8 * MIN),
    lastTaskId: "task_reconnect",
    activeSeconds: 5_400, // 1h 30m
    sortOrder: 0,
    createdAt: ago(21 * DAY),
    updatedAt: ago(8 * MIN),
  },
  {
    id: "prj_mercury",
    name: "mercury-web",
    repoPath: "~/code/mercury-web",
    devUrl: "http://localhost:3000",
    defaultBranch: "main",
    icon: "globe",
    archivedAt: null,
    lastOpenedAt: ago(2 * DAY),
    lastTaskId: "task_settings",
    activeSeconds: 12_600, // 3h 30m
    sortOrder: 1,
    createdAt: ago(34 * DAY),
    updatedAt: ago(2 * DAY),
  },
  {
    id: "prj_ledger",
    name: "ledger-cli",
    repoPath: "~/code/ledger-cli",
    devUrl: null,
    defaultBranch: "main",
    icon: "terminal",
    archivedAt: null,
    lastOpenedAt: ago(6 * DAY),
    lastTaskId: null,
    activeSeconds: 2_700, // 45m
    sortOrder: 2,
    createdAt: ago(58 * DAY),
    updatedAt: ago(6 * DAY),
  },
];

// ------------------------------------------------------------------- tasks

export const TASKS: Record<string, Task[]> = {
  prj_atlas: [
    {
      id: "task_reconnect",
      projectId: "prj_atlas",
      title: "Wire the connector SDK reconnect",
      status: "open",
      createdAt: ago(2 * DAY),
      updatedAt: ago(8 * MIN),
    },
    {
      id: "task_token",
      projectId: "prj_atlas",
      title: "Fix token refresh race in auth",
      status: "open",
      createdAt: ago(3 * DAY),
      updatedAt: ago(5 * HOUR),
    },
    {
      id: "task_flaky",
      projectId: "prj_atlas",
      title: "Track down the flaky restore test",
      status: "open",
      createdAt: ago(9 * DAY),
      updatedAt: ago(2 * DAY),
    },
  ],
  prj_mercury: [
    {
      id: "task_settings",
      projectId: "prj_mercury",
      title: "Ship the settings redesign",
      status: "done",
      createdAt: ago(11 * DAY),
      updatedAt: ago(2 * DAY),
    },
    {
      id: "task_focus",
      projectId: "prj_mercury",
      title: "Audit focus states across dialogs",
      status: "open",
      createdAt: ago(4 * DAY),
      updatedAt: ago(2 * DAY),
    },
  ],
  prj_ledger: [],
};

export const ALL_TASKS: Task[] = Object.values(TASKS).flat();

/** The task Rabta considers active — drives the Overview "active task" card
 *  and the Capsules page's current-task treatment. */
export const ACTIVE_TASK_ID = "task_reconnect";

// --------------------------------------------------------------- resources
//
// Payload shapes mirror the hub wire format consumed by humanizeCapsule():
//   editor -> { openFiles: [], terminals: [] }
//   browser -> { tabs: [] }
//   git    -> { branch }

export const RESOURCES: Record<string, TaskResource[]> = {
  task_reconnect: [
    {
      id: "res_reconnect_editor",
      taskId: "task_reconnect",
      connectorKind: "vscode",
      resourceType: "workspace",
      payload: {
        folder: "~/code/atlas-api",
        openFiles: [
          "src/hub.rs",
          "src/connector/session.rs",
          "src/connector/handshake.rs",
          "tests/reconnect.rs",
        ],
        terminals: [
          { cwd: "~/code/atlas-api" },
          { cwd: "~/code/atlas-api" },
          { cwd: "~/code/atlas-api/crates" },
        ],
      },
      createdAt: ago(8 * MIN),
    },
    {
      id: "res_reconnect_browser",
      taskId: "task_reconnect",
      connectorKind: "chrome",
      resourceType: "tabs",
      payload: {
        tabs: [
          { title: "WebSocket close codes — MDN", url: "https://developer.mozilla.org/" },
          { title: "tokio-tungstenite docs", url: "https://docs.rs/tokio-tungstenite/" },
          { title: "Exponential backoff and jitter", url: "https://aws.amazon.com/builders-library/" },
          { title: "atlas-api · Pull requests", url: "https://github.com/" },
          { title: "Reconnect design notes", url: "https://www.notion.so/" },
        ],
      },
      createdAt: ago(8 * MIN),
    },
    {
      id: "res_reconnect_git",
      taskId: "task_reconnect",
      connectorKind: "git",
      resourceType: "branch",
      payload: { branch: "feat/connector-reconnect", repo: "atlas-api" },
      createdAt: ago(8 * MIN),
    },
  ],
  task_token: [
    {
      id: "res_token_editor",
      taskId: "task_token",
      connectorKind: "vscode",
      resourceType: "workspace",
      payload: {
        folder: "~/code/atlas-api",
        openFiles: ["src/auth/refresh.rs", "src/auth/mod.rs"],
        terminals: [{ cwd: "~/code/atlas-api" }],
      },
      createdAt: ago(5 * HOUR),
    },
    {
      id: "res_token_git",
      taskId: "task_token",
      connectorKind: "git",
      resourceType: "branch",
      payload: { branch: "fix/token-refresh-race", repo: "atlas-api" },
      createdAt: ago(5 * HOUR),
    },
  ],
  task_flaky: [
    {
      id: "res_flaky_editor",
      taskId: "task_flaky",
      connectorKind: "vscode",
      resourceType: "workspace",
      payload: {
        folder: "~/code/atlas-api",
        openFiles: ["tests/restore_capsule.rs", "src/capsule/apply.rs", "src/capsule/mod.rs"],
        terminals: [{ cwd: "~/code/atlas-api" }, { cwd: "~/code/atlas-api" }],
      },
      createdAt: ago(2 * DAY),
    },
    {
      id: "res_flaky_git",
      taskId: "task_flaky",
      connectorKind: "git",
      resourceType: "branch",
      payload: { branch: "chore/flaky-restore-test", repo: "atlas-api" },
      createdAt: ago(2 * DAY),
    },
  ],
  task_settings: [
    {
      id: "res_settings_editor",
      taskId: "task_settings",
      connectorKind: "vscode",
      resourceType: "workspace",
      payload: {
        folder: "~/code/mercury-web",
        openFiles: ["src/pages/Settings.tsx", "src/components/Toggle.tsx"],
        terminals: [{ cwd: "~/code/mercury-web" }],
      },
      createdAt: ago(2 * DAY),
    },
    {
      id: "res_settings_browser",
      taskId: "task_settings",
      connectorKind: "chrome",
      resourceType: "tabs",
      payload: {
        tabs: [
          { title: "Settings redesign — spec", url: "https://www.notion.so/" },
          { title: "mercury-web · localhost:3000/settings", url: "http://localhost:3000/settings" },
        ],
      },
      createdAt: ago(2 * DAY),
    },
    {
      id: "res_settings_git",
      taskId: "task_settings",
      connectorKind: "git",
      resourceType: "branch",
      payload: { branch: "feat/settings-redesign", repo: "mercury-web" },
      createdAt: ago(2 * DAY),
    },
  ],
  task_focus: [
    {
      id: "res_focus_editor",
      taskId: "task_focus",
      connectorKind: "vscode",
      resourceType: "workspace",
      payload: {
        folder: "~/code/mercury-web",
        openFiles: ["src/components/Dialog.tsx"],
        terminals: [],
      },
      createdAt: ago(2 * DAY),
    },
  ],
};

// -------------------------------------------------------------- connectors

/** Live connectors, as the hub reports them. Only kinds that exist in
 *  v0.1.0 — an editor connector and the browser connector. */
export const LIVE_CONNECTORS: ConnectorInfo[] = [
  {
    id: "conn_vscode_01",
    name: "VS Code",
    kind: "vscode",
    capabilities: ["workspace.open", "workspace.snapshot", "terminal.list"],
    version: "0.1.0",
  },
];

/** Previously-seen connectors, rendered as offline rows. The Chrome
 *  connector is genuinely not connected in this fixture — it is pending Web
 *  Store review, so showing it live would misrepresent availability. */
export const KNOWN_CONNECTORS: KnownConnector[] = [
  {
    name: "VS Code",
    kind: "vscode",
    capabilities: ["workspace.open", "workspace.snapshot", "terminal.list"],
    version: "0.1.0",
    firstSeen: ago(21 * DAY),
    lastSeen: ago(8 * MIN),
  },
  {
    name: "Chrome",
    kind: "chrome",
    capabilities: ["tabs.list", "tabs.open"],
    version: "0.1.0",
    firstSeen: ago(14 * DAY),
    lastSeen: ago(3 * HOUR),
  },
];

export const HUB_PORT = 17872;

/** One pending pairing request, so the Connectors capture shows the real
 *  approval gate: a connector cannot talk to the hub until the user clicks
 *  Approve in the app. This is shipped v0.1.0 behaviour and the clearest
 *  visual statement of the product's trust model. The Chrome connector is
 *  still listed as offline elsewhere in the fixture — nothing here implies
 *  it is available from the Web Store. */
export const PENDING_PAIRINGS = [
  { pairingId: "pair_chrome_01", name: "Chrome", kind: "chrome" },
];

// ------------------------------------------------------------------ events

export const EVENTS: PersistedEvent[] = [
  {
    seq: 41,
    at: ago(3 * MIN),
    type: "commandSent",
    sessionConnectorId: "conn_vscode_01",
    payload: { name: "workspace.open", connectorId: "conn_vscode_01" },
  },
  {
    seq: 40,
    at: ago(3 * MIN),
    type: "responseReceived",
    sessionConnectorId: "conn_vscode_01",
    payload: { connectorId: "conn_vscode_01" },
  },
  {
    seq: 39,
    at: ago(8 * MIN),
    type: "connectorConnected",
    sessionConnectorId: "conn_vscode_01",
    payload: { connector: { name: "VS Code", kind: "vscode" } },
  },
  {
    seq: 38,
    at: ago(12 * MIN),
    type: "commandSent",
    sessionConnectorId: "conn_vscode_01",
    payload: { name: "workspace.snapshot", connectorId: "conn_vscode_01" },
  },
  {
    seq: 37,
    at: ago(12 * MIN),
    type: "eventReceived",
    sessionConnectorId: "conn_vscode_01",
    payload: { name: "workspace.changed", connectorId: "conn_vscode_01" },
  },
  // The browser connector's session id here is the store's own key for a
  // previously-seen connector (`known:<name>:<kind>`), so the Activity view
  // resolves these rows to "Chrome" through its real lookup instead of
  // degrading to the generic "a connector" fallback.
  {
    seq: 36,
    at: ago(3 * HOUR),
    type: "connectorDisconnected",
    sessionConnectorId: "known:Chrome:chrome",
    payload: { connectorId: "known:Chrome:chrome" },
  },
  {
    seq: 35,
    at: ago(5 * HOUR),
    type: "commandSent",
    sessionConnectorId: "known:Chrome:chrome",
    payload: { name: "tabs.open", connectorId: "known:Chrome:chrome" },
  },
  {
    seq: 34,
    at: ago(5 * HOUR),
    type: "responseReceived",
    sessionConnectorId: "known:Chrome:chrome",
    payload: { connectorId: "known:Chrome:chrome" },
  },
  {
    seq: 33,
    at: ago(2 * DAY),
    type: "connectorConnected",
    sessionConnectorId: "conn_chrome_01",
    payload: { connector: { name: "Chrome", kind: "chrome" } },
  },
];

// ------------------------------------------------------------------- git

export const GIT_STATUS: Record<string, {
  branch: string | null;
  dirty: boolean;
  changedCount: number;
  ahead: number;
  behind: number;
}> = {
  prj_atlas: { branch: "feat/connector-reconnect", dirty: true, changedCount: 4, ahead: 2, behind: 0 },
  prj_mercury: { branch: "main", dirty: false, changedCount: 0, ahead: 0, behind: 0 },
  prj_ledger: { branch: "main", dirty: false, changedCount: 0, ahead: 0, behind: 1 },
};

export const GIT_BRANCHES: Record<string, string[]> = {
  prj_atlas: ["main", "feat/connector-reconnect", "fix/token-refresh-race", "chore/flaky-restore-test"],
  prj_mercury: ["main", "feat/settings-redesign"],
  prj_ledger: ["main"],
};

/** Result of activating `task_reconnect` — the shape `activate_task`
 *  returns. Chrome lands in `pending` because the browser connector is
 *  offline in this fixture; that is the honest outcome, and it is what the
 *  Restore sheet renders as "On next reload". */
export const ACTIVATE_SUMMARY = {
  applied: ["vscode", "git"],
  pending: ["chrome"],
  skipped: [] as string[],
  savedPrevious: null as string | null,
  errors: [] as string[],
};

export const SAVE_SUMMARY = {
  captured: ["vscode", "git"],
  skipped: ["chrome"],
};
