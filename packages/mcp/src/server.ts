import { createRequire } from "node:module";
import type { DatabaseSync } from "node:sqlite";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { renderBriefing } from "./briefing.js";
import { RabtaReader } from "./db.js";
import type { TaskStatusFilter } from "./db.js";
import { buildCapsuleView, parseJsonObject, parseTime, toSummary } from "./shapes.js";
import type { CapsuleView } from "./shapes.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

export const SERVER_NAME = "rabta";
export const SERVER_VERSION: string = pkg.version;

/** Every tool in this server reads a local file and changes nothing. */
const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

function json(data: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

function fail(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

function unknownCapsule(taskId: string): string {
  return `No capsule with id "${taskId}". Call list_capsules to see the ids of the capsules saved on this Mac.`;
}

export function capsuleUri(taskId: string): string {
  return `rabta://capsules/${taskId}`;
}

/** Builds the MCP server over an already opened database. Tests inject a fixture here. */
export function buildServer(db: DatabaseSync): McpServer {
  const reader = new RabtaReader(db);
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  const loadCapsule = (taskId: string): CapsuleView | undefined => {
    const task = reader.getTask(taskId);
    if (!task) return undefined;
    return buildCapsuleView(task, reader.capsuleResources(task.id), reader.pins(task.id));
  };

  /** Newest capture first; tasks nothing was captured into come last, most recently updated first. */
  const listCapsules = (filter: { projectId?: string; status: TaskStatusFilter }): CapsuleView[] => {
    const entries = reader.listTasks(filter).map((task, index) => ({
      index,
      view: buildCapsuleView(task, reader.capsuleResources(task.id), reader.pins(task.id)),
    }));
    entries.sort((a, b) => {
      const aMs = parseTime(a.view.savedAt);
      const bMs = parseTime(b.view.savedAt);
      if (aMs !== null && bMs !== null && aMs !== bMs) return bMs - aMs;
      if (aMs !== null && bMs === null) return -1;
      if (aMs === null && bMs !== null) return 1;
      return a.index - b.index;
    });
    return entries.map((entry) => entry.view);
  };

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description:
        "List the projects Rabta knows about on this Mac. Returns each project's id, name, repository path, " +
        "default branch, whether it is archived, how many of its tasks are open, and when it was last opened. " +
        "Does not list capsules; use list_capsules for those.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    () =>
      json({
        projects: reader.listProjects().map((p) => ({
          id: p.id,
          name: p.name,
          repoPath: p.repo_path,
          defaultBranch: p.default_branch,
          archived: p.archived_at !== null,
          openTasks: p.open_tasks,
          lastOpenedAt: p.last_opened_at,
        })),
      }),
  );

  server.registerTool(
    "list_capsules",
    {
      title: "List capsules",
      description:
        "List the task capsules saved on this Mac, most recently captured first. Returns each capsule's id, " +
        "title, project, status, git branch, when it was last saved, and a one-line summary such as " +
        '"4 files, 3 terminals, 5 tabs" that counts only what was actually captured. ' +
        "Does not return the contents and does not restore anything; use read_capsule for the full JSON " +
        "or capsule_briefing for a Markdown summary.",
      inputSchema: {
        project: z
          .string()
          .min(1)
          .optional()
          .describe("Restrict to one project, by name or id (see list_projects). Omit for every project."),
        status: z
          .enum(["open", "done", "all"])
          .default("open")
          .describe('Which tasks to include: "open" (default), "done", or "all".'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("Maximum number of capsules to return, 1 to 100. Default 20."),
      },
      annotations: READ_ONLY,
    },
    ({ project, status, limit }) => {
      let projectId: string | undefined;
      if (project !== undefined) {
        const found = reader.findProject(project);
        if (!found) {
          return fail(`No project named or identified by "${project}". Call list_projects to see the names and ids.`);
        }
        projectId = found.id;
      }
      const capsules = listCapsules({ projectId, status }).slice(0, limit).map(toSummary);
      return json({ capsules });
    },
  );

  server.registerTool(
    "read_capsule",
    {
      title: "Read a capsule",
      description:
        "Read one capsule in full as JSON: the task's title, project, status, branch and save time, the editor " +
        "state (workspace folder, open files in captured order, active file, files with unsaved changes, " +
        "terminals with name, cwd and busy flag), the browser tabs (title and url), and any pinned items. " +
        "A tool that captured nothing appears as null rather than as empty lists. Does not restore anything; " +
        "use capsule_briefing when you want Markdown for your own context instead of JSON.",
      inputSchema: {
        task_id: z.string().min(1).describe("The capsule's id, as returned by list_capsules."),
      },
      annotations: READ_ONLY,
    },
    ({ task_id }) => {
      const view = loadCapsule(task_id);
      if (!view) return fail(unknownCapsule(task_id));
      return json(view as unknown as Record<string, unknown>);
    },
  );

  server.registerTool(
    "capsule_briefing",
    {
      title: "Capsule briefing",
      description:
        "Render one capsule as a short Markdown briefing (under 4 KB) that an agent can paste into its context " +
        "before starting work: the task title, project, branch and save time, then sections only for the tools " +
        "that captured something (files with the active one marked, terminals, browser tabs, pins). Long lists " +
        'end with "and N more". Does not restore anything; use read_capsule for the complete JSON.',
      inputSchema: {
        task_id: z.string().min(1).describe("The capsule's id, as returned by list_capsules."),
      },
      annotations: READ_ONLY,
    },
    ({ task_id }) => {
      const view = loadCapsule(task_id);
      if (!view) return fail(unknownCapsule(task_id));
      return { content: [{ type: "text", text: renderBriefing(view) }] };
    },
  );

  server.registerTool(
    "recent_activity",
    {
      title: "Recent activity",
      description:
        "List recent entries from Rabta's connector event log, newest first. Returns each event's sequence " +
        "number, time, type (connectorConnected, connectorDisconnected, commandSent, responseReceived, " +
        "eventReceived), the kind of connector involved (vscode, chrome, ...) when the log can tell, and the " +
        "command or event name when there is one. Does not include capsule contents; use list_capsules for those.",
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .default(50)
          .describe("Maximum number of events to return, 1 to 200. Default 50."),
      },
      annotations: READ_ONLY,
    },
    ({ limit }) => {
      const kinds = reader.sessionKinds();
      const events = reader.recentEvents(limit).map((event) => {
        const payload = parseJsonObject(event.payload);
        const connector = payload.connector;
        const kindFromPayload =
          typeof connector === "object" && connector !== null
            ? (connector as Record<string, unknown>).kind
            : undefined;
        const connectorKind =
          typeof kindFromPayload === "string" && kindFromPayload
            ? kindFromPayload
            : event.session_connector_id
              ? (kinds.get(event.session_connector_id) ?? null)
              : null;
        return {
          seq: event.seq,
          at: event.at,
          type: event.type,
          connectorKind,
          name: typeof payload.name === "string" ? payload.name : null,
        };
      });
      return json({ events });
    },
  );

  server.registerResource(
    "capsule",
    new ResourceTemplate("rabta://capsules/{task_id}", {
      list: () => ({
        resources: listCapsules({ status: "all" }).map((view) => ({
          uri: capsuleUri(view.id),
          name: view.title,
          description: `${view.project} capsule (${view.status})`,
          mimeType: "application/json",
        })),
      }),
    }),
    {
      title: "Rabta capsule",
      description: "One saved task capsule as JSON, the same document read_capsule returns.",
      mimeType: "application/json",
    },
    (uri, variables) => {
      const raw = variables.task_id;
      const taskId = Array.isArray(raw) ? raw[0] : raw;
      const view = taskId ? loadCapsule(taskId) : undefined;
      if (!view) throw new McpError(ErrorCode.InvalidParams, unknownCapsule(String(taskId ?? "")));
      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(view, null, 2) }],
      };
    },
  );

  return server;
}
