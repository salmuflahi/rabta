/**
 * In-memory Rabta database for tests: the real migrations, then one project
 * with an open task that has editor, browser and git captures plus one pin,
 * a done task with only a git capture, a tombstoned task that must never
 * show up, and a handful of hub events.
 *
 * Hygiene: no real usernames, machine names or absolute home paths.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../../../crates/omnibus-db/migrations/", import.meta.url));

/** Rabta writes RFC 3339 with microseconds and an explicit offset. */
const stamp = (iso: string): string => iso.replace("Z", "000+00:00");

export const FIXTURE = {
  projectId: "prj_atlas",
  projectName: "atlas-api",
  repoPath: "~/code/atlas-api",
  openTaskId: "task_reconnect",
  openTaskTitle: "Wire the connector SDK reconnect",
  openBranch: "feat/connector-reconnect",
  openSavedAt: stamp("2026-07-29T14:12:00.000Z"),
  doneTaskId: "task_token",
  doneTaskTitle: "Fix token refresh race in auth",
  doneBranch: "fix/token-refresh-race",
  doneSavedAt: stamp("2026-07-29T09:20:00.000Z"),
  deletedTaskId: "task_deleted",
  folder: "~/code/atlas-api",
  files: ["src/hub.rs", "src/connector/session.rs", "src/connector/handshake.rs", "tests/reconnect.rs"],
  activeFile: "src/connector/session.rs",
  dirtyFiles: ["tests/reconnect.rs"],
  terminals: [
    { name: "zsh", cwd: "~/code/atlas-api", busy: false },
    { name: "cargo watch", cwd: "~/code/atlas-api", busy: true },
    { name: "zsh", cwd: "~/code/atlas-api/crates", busy: false },
  ],
  tabs: [
    { title: "WebSocket close codes - MDN", url: "https://developer.mozilla.org/" },
    { title: "tokio-tungstenite docs", url: "https://docs.rs/tokio-tungstenite/" },
    { title: "Exponential backoff and jitter", url: "https://aws.amazon.com/builders-library/" },
    { title: "atlas-api: Pull requests", url: "https://github.com/" },
    { title: "Reconnect design notes", url: "https://www.notion.so/" },
  ],
  pin: {
    id: "pin_reconnect_docs",
    connectorKind: "chrome",
    identity: "https://docs.rs/tokio-tungstenite/",
    payload: { url: "https://docs.rs/tokio-tungstenite/", title: "tokio-tungstenite docs" },
    createdAt: stamp("2026-07-28T10:00:00.000Z"),
  },
  sessionId: "sess_vscode_01",
  /** Live events inserted, newest first, as (type, payload name) pairs. */
  events: [
    ["connectorDisconnected", null],
    ["responseReceived", null],
    ["commandSent", "workspace.snapshot"],
    ["eventReceived", "workspace.changed"],
    ["connectorConnected", null],
  ] as const,
};

export interface FixtureOptions {
  /** File to create. Defaults to an in-memory database. */
  path?: string;
  /** PRAGMA user_version to stamp. Defaults to 5, the current schema. */
  userVersion?: number;
}

export function applyMigrations(db: DatabaseSync): string[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  if (files.length !== 5) throw new Error(`expected five migrations in ${MIGRATIONS_DIR}, found ${files.length}`);
  for (const name of files) db.exec(readFileSync(join(MIGRATIONS_DIR, name), "utf8"));
  return files;
}

export function buildFixtureDb(options: FixtureOptions = {}): DatabaseSync {
  const db = new DatabaseSync(options.path ?? ":memory:");
  applyMigrations(db);
  db.exec(`PRAGMA user_version = ${options.userVersion ?? 5}`);
  seed(db);
  return db;
}

function seed(db: DatabaseSync): void {
  const F = FIXTURE;
  const T = (iso: string) => stamp(iso);

  db.prepare(
    `INSERT INTO projects (id, name, repo_path, dev_url, default_branch, created_at, updated_at, icon,
                           archived_at, last_opened_at, last_task_id, active_seconds, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 0)`,
  ).run(
    F.projectId,
    F.projectName,
    F.repoPath,
    "http://localhost:8080",
    "main",
    T("2026-07-08T14:20:00.000Z"),
    T("2026-07-29T14:12:00.000Z"),
    "database",
    T("2026-07-29T14:12:00.000Z"),
    F.openTaskId,
    5400,
  );

  const insertTask = db.prepare(
    `INSERT INTO tasks (id, project_id, title, status, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  insertTask.run(F.openTaskId, F.projectId, F.openTaskTitle, "open", T("2026-07-27T14:20:00.000Z"), T("2026-07-29T14:12:00.000Z"), null);
  insertTask.run(F.doneTaskId, F.projectId, F.doneTaskTitle, "done", T("2026-07-26T14:20:00.000Z"), T("2026-07-29T09:20:00.000Z"), null);
  insertTask.run(F.deletedTaskId, F.projectId, "Deleted task that must stay hidden", "open", T("2026-07-20T14:20:00.000Z"), T("2026-07-29T15:00:00.000Z"), T("2026-07-29T15:00:00.000Z"));

  const insertResource = db.prepare(
    `INSERT INTO task_resources (id, task_id, connector_kind, resource_type, payload, created_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  // A superseded editor capture from the day before: only the newest row per (kind, type) is the capsule.
  insertResource.run(
    "res_reconnect_editor_old",
    F.openTaskId,
    "vscode",
    "workspace",
    JSON.stringify({ workspaceFolder: F.folder, openFiles: ["src/old.rs"], activeFile: "src/old.rs", terminals: [], dirtyFiles: [] }),
    T("2026-07-28T09:00:00.000Z"),
    null,
  );
  insertResource.run(
    "res_reconnect_editor",
    F.openTaskId,
    "vscode",
    "workspace",
    JSON.stringify({
      workspaceFolder: F.folder,
      openFiles: F.files,
      activeFile: F.activeFile,
      terminals: F.terminals,
      dirtyFiles: F.dirtyFiles,
    }),
    F.openSavedAt,
    null,
  );
  insertResource.run(
    "res_reconnect_browser",
    F.openTaskId,
    "chrome",
    "workspace",
    JSON.stringify({ tabs: F.tabs }),
    T("2026-07-29T14:11:30.000Z"),
    null,
  );
  // A tombstoned browser capture: deleted rows are not part of the capsule.
  insertResource.run(
    "res_reconnect_browser_deleted",
    F.openTaskId,
    "chrome",
    "workspace",
    JSON.stringify({ tabs: [{ title: "must not appear", url: "https://example.invalid/deleted" }] }),
    T("2026-07-29T16:00:00.000Z"),
    T("2026-07-29T16:00:01.000Z"),
  );
  insertResource.run(
    "res_reconnect_git",
    F.openTaskId,
    "git",
    "branch",
    JSON.stringify({ branch: F.openBranch }),
    T("2026-07-29T14:11:00.000Z"),
    null,
  );
  insertResource.run(
    "res_token_git",
    F.doneTaskId,
    "git",
    "branch",
    JSON.stringify({ branch: F.doneBranch }),
    F.doneSavedAt,
    null,
  );
  insertResource.run(
    "res_deleted_task_editor",
    F.deletedTaskId,
    "vscode",
    "workspace",
    JSON.stringify({ workspaceFolder: F.folder, openFiles: ["src/hidden.rs"], activeFile: null, terminals: [], dirtyFiles: [] }),
    T("2026-07-29T15:00:00.000Z"),
    null,
  );

  db.prepare(
    `INSERT INTO task_pins (id, task_id, connector_kind, identity, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(F.pin.id, F.openTaskId, F.pin.connectorKind, F.pin.identity, JSON.stringify(F.pin.payload), F.pin.createdAt);

  db.prepare(
    `INSERT INTO connectors (id, name, kind, capabilities, token, version, first_seen, last_seen)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`,
  ).run(
    "conn_vscode_known",
    "VS Code",
    "vscode",
    JSON.stringify(["workspace.open", "workspace.snapshot", "terminal.list"]),
    "0.1.0",
    T("2026-07-08T14:20:00.000Z"),
    T("2026-07-29T14:17:00.000Z"),
  );

  const insertEvent = db.prepare(
    `INSERT INTO events (at, type, session_connector_id, payload) VALUES (?, ?, ?, ?)`,
  );
  const sid = F.sessionId;
  insertEvent.run(
    T("2026-07-29T14:08:00.000Z"),
    "connectorConnected",
    sid,
    JSON.stringify({
      type: "connectorConnected",
      connector: { id: sid, name: "VS Code", kind: "vscode", capabilities: ["workspace.open", "workspace.snapshot", "terminal.list"], version: "0.1.0" },
    }),
  );
  insertEvent.run(
    T("2026-07-29T14:09:00.000Z"),
    "eventReceived",
    sid,
    JSON.stringify({ type: "eventReceived", connectorId: sid, name: "workspace.changed", data: { openFiles: F.files } }),
  );
  insertEvent.run(
    T("2026-07-29T14:12:00.000Z"),
    "commandSent",
    sid,
    JSON.stringify({ type: "commandSent", connectorId: sid, name: "workspace.snapshot", requestId: "req_1", args: {} }),
  );
  insertEvent.run(
    T("2026-07-29T14:12:00.500Z"),
    "responseReceived",
    sid,
    JSON.stringify({ type: "responseReceived", connectorId: sid, requestId: "req_1", ok: true, result: {} }),
  );
  insertEvent.run(
    T("2026-07-29T14:17:00.000Z"),
    "connectorDisconnected",
    sid,
    JSON.stringify({ type: "connectorDisconnected", connectorId: sid }),
  );

  db.prepare(`INSERT INTO db_meta (key, value) VALUES (?, ?)`).run("install_id", "inst_fixture");
}
