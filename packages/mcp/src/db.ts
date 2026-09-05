import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { KNOWN_SCHEMA } from "./paths.js";

export type TaskStatusFilter = "open" | "done" | "all";

export interface ProjectRow {
  id: string;
  name: string;
  repo_path: string;
  default_branch: string;
  archived_at: string | null;
  last_opened_at: string | null;
  open_tasks: number;
}

export interface TaskRow {
  id: string;
  project_id: string;
  project_name: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ResourceRow {
  id: string;
  task_id: string;
  connector_kind: string;
  resource_type: string;
  payload: string;
  created_at: string;
}

export interface PinRow {
  id: string;
  task_id: string;
  connector_kind: string;
  identity: string;
  payload: string;
  created_at: string;
}

export interface EventRow {
  seq: number;
  at: string;
  type: string;
  session_connector_id: string | null;
  payload: string;
}

/** Thrown when the database file is not where it should be. */
export class DatabaseMissingError extends Error {
  readonly path: string;

  constructor(path: string) {
    super(
      `rabta-mcp: no Rabta database at ${path}. Open Rabta once so it creates one, ` +
        "or set RABTA_DB to the path of an existing database.",
    );
    this.name = "DatabaseMissingError";
    this.path = path;
  }
}

/** Opens the database read-only. Never creates a file. */
export function openDatabase(path: string): DatabaseSync {
  if (!existsSync(path)) throw new DatabaseMissingError(path);
  return new DatabaseSync(path, { readOnly: true });
}

export function readUserVersion(db: DatabaseSync): number {
  const row = db.prepare("PRAGMA user_version").get() as { user_version?: number | bigint } | undefined;
  return Number(row?.user_version ?? 0);
}

function writeStderr(line: string): void {
  process.stderr.write(`${line}\n`);
}

/**
 * Prints one warning when the database schema is newer than KNOWN_SCHEMA
 * and returns the version read. Reads continue either way.
 */
export function warnIfNewerSchema(db: DatabaseSync, log: (line: string) => void = writeStderr): number {
  const version = readUserVersion(db);
  if (version > KNOWN_SCHEMA) {
    log(
      `rabta-mcp: database schema is version ${version}, newer than version ${KNOWN_SCHEMA} ` +
        "that this build knows. Reads continue, but anything added since is not surfaced. " +
        "Update @rabta/mcp.",
    );
  }
  return version;
}

/** Every query the server runs. All of them read; none of them write. */
export class RabtaReader {
  readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  listProjects(): ProjectRow[] {
    const rows = this.db
      .prepare(
        `SELECT p.id, p.name, p.repo_path, p.default_branch, p.archived_at, p.last_opened_at,
                (SELECT COUNT(*) FROM tasks t
                  WHERE t.project_id = p.id AND t.deleted_at IS NULL AND t.status = 'open') AS open_tasks
           FROM projects p
          WHERE p.deleted_at IS NULL
          ORDER BY (p.archived_at IS NOT NULL), p.sort_order, lower(p.name), p.id`,
      )
      .all();
    return rows as unknown as ProjectRow[];
  }

  /** Finds a live project by id or by name (case-insensitive). An id match wins. */
  findProject(nameOrId: string): ProjectRow | undefined {
    const row = this.db
      .prepare(
        `SELECT p.id, p.name, p.repo_path, p.default_branch, p.archived_at, p.last_opened_at,
                (SELECT COUNT(*) FROM tasks t
                  WHERE t.project_id = p.id AND t.deleted_at IS NULL AND t.status = 'open') AS open_tasks
           FROM projects p
          WHERE p.deleted_at IS NULL AND (p.id = $q OR lower(p.name) = lower($q))
          ORDER BY (p.id = $q) DESC
          LIMIT 1`,
      )
      .get({ q: nameOrId });
    return row as unknown as ProjectRow | undefined;
  }

  listTasks(filter: { projectId?: string; status: TaskStatusFilter }): TaskRow[] {
    const rows = this.db
      .prepare(
        `SELECT t.id, t.project_id, p.name AS project_name, t.title, t.status, t.created_at, t.updated_at
           FROM tasks t
           JOIN projects p ON p.id = t.project_id
          WHERE t.deleted_at IS NULL AND p.deleted_at IS NULL
            AND ($project IS NULL OR t.project_id = $project)
            AND ($status = 'all' OR t.status = $status)
          ORDER BY t.updated_at DESC, t.id`,
      )
      .all({ project: filter.projectId ?? null, status: filter.status });
    return rows as unknown as TaskRow[];
  }

  getTask(id: string): TaskRow | undefined {
    const row = this.db
      .prepare(
        `SELECT t.id, t.project_id, p.name AS project_name, t.title, t.status, t.created_at, t.updated_at
           FROM tasks t
           JOIN projects p ON p.id = t.project_id
          WHERE t.id = $id AND t.deleted_at IS NULL AND p.deleted_at IS NULL`,
      )
      .get({ id });
    return row as unknown as TaskRow | undefined;
  }

  /**
   * The capsule: the newest live task_resources row per (connector_kind,
   * resource_type), oldest capture first.
   */
  capsuleResources(taskId: string): ResourceRow[] {
    const rows = this.db
      .prepare(
        `SELECT id, task_id, connector_kind, resource_type, payload, created_at
           FROM (SELECT r.id, r.task_id, r.connector_kind, r.resource_type, r.payload, r.created_at,
                        ROW_NUMBER() OVER (PARTITION BY r.connector_kind, r.resource_type
                                           ORDER BY r.created_at DESC, r.rowid DESC) AS rn
                   FROM task_resources r
                  WHERE r.task_id = $task AND r.deleted_at IS NULL)
          WHERE rn = 1
          ORDER BY created_at, id`,
      )
      .all({ task: taskId });
    return rows as unknown as ResourceRow[];
  }

  pins(taskId: string): PinRow[] {
    const rows = this.db
      .prepare(
        `SELECT id, task_id, connector_kind, identity, payload, created_at
           FROM task_pins
          WHERE task_id = $task AND deleted_at IS NULL
          ORDER BY created_at, id`,
      )
      .all({ task: taskId });
    return rows as unknown as PinRow[];
  }

  recentEvents(limit: number): EventRow[] {
    const rows = this.db
      .prepare(
        `SELECT seq, at, type, session_connector_id, payload
           FROM events
          ORDER BY seq DESC
          LIMIT $limit`,
      )
      .all({ limit });
    return rows as unknown as EventRow[];
  }

  /**
   * Session connector id to connector kind, learned from connectorConnected
   * events. Session ids are per connection, so this is the only place the
   * log says which kind of connector a later event came from.
   */
  sessionKinds(): Map<string, string> {
    const rows = this.db
      .prepare(
        `SELECT session_connector_id, payload
           FROM events
          WHERE type = 'connectorConnected' AND session_connector_id IS NOT NULL
          ORDER BY seq`,
      )
      .all() as unknown as { session_connector_id: string; payload: string }[];
    const kinds = new Map<string, string>();
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.payload) as { connector?: { kind?: unknown } };
        const kind = parsed?.connector?.kind;
        if (typeof kind === "string" && kind) kinds.set(row.session_connector_id, kind);
      } catch {
        // A corrupt payload only loses this one mapping.
      }
    }
    return kinds;
  }
}
