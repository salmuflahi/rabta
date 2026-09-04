import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { BRIEFING_MAX_BYTES, CLOSING_LINE, renderBriefing } from "../src/briefing.ts";
import { DatabaseMissingError, openDatabase, warnIfNewerSchema } from "../src/db.ts";
import { KNOWN_SCHEMA, resolveDbPath } from "../src/paths.ts";
import { buildServer, capsuleUri } from "../src/server.ts";
import type { CapsuleView } from "../src/shapes.ts";
import { FIXTURE, buildFixtureDb } from "./fixture-db.ts";

const GOLDEN = fileURLToPath(new URL("./fixtures/briefing.golden.md", import.meta.url));
const READ_TOOLS = ["capsule_briefing", "list_capsules", "list_projects", "read_capsule", "recent_activity"];
const WRITE_TOOLS = ["capture_capsule", "restore_capsule"];
const TOOL_NAMES = [...READ_TOOLS, ...WRITE_TOOLS].sort();

let client: Client;
let db: ReturnType<typeof buildFixtureDb>;

async function call(name: string, args: Record<string, unknown> = {}): Promise<CallToolResult> {
  return (await client.callTool({ name, arguments: args })) as CallToolResult;
}

function text(result: CallToolResult): string {
  const first = result.content[0];
  if (!first || first.type !== "text") throw new Error("expected a text content block");
  return first.text;
}

function parsed<T>(result: CallToolResult): T {
  expect(result.isError ?? false).toBe(false);
  const data = JSON.parse(text(result)) as T;
  // The structured copy is the same document as the text.
  expect(result.structuredContent).toEqual(data);
  return data;
}

beforeAll(async () => {
  db = buildFixtureDb();
  const server = buildServer(db);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: "rabta-mcp-tests", version: "0.0.0" });
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client.close();
  db.close();
});

describe("tool surface", () => {
  it("exposes five read-only tools and two writes, with titles, descriptions and described parameters", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(TOOL_NAMES);
    for (const tool of tools) {
      expect(tool.title, tool.name).toBeTruthy();
      expect(tool.description, tool.name).toBeTruthy();
      if (READ_TOOLS.includes(tool.name)) {
        expect(tool.annotations, tool.name).toMatchObject({
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        });
      } else {
        expect(tool.annotations, tool.name).toMatchObject({ readOnlyHint: false, openWorldHint: false });
      }
      const properties = (tool.inputSchema as { properties?: Record<string, { description?: string }> }).properties ?? {};
      for (const [param, schema] of Object.entries(properties)) {
        expect(schema.description, `${tool.name}.${param}`).toBeTruthy();
      }
    }
  });

  it("advertises the capsule resource template as JSON", async () => {
    const { resourceTemplates } = await client.listResourceTemplates();
    expect(resourceTemplates).toHaveLength(1);
    expect(resourceTemplates[0]).toMatchObject({
      uriTemplate: "rabta://capsules/{task_id}",
      mimeType: "application/json",
    });
  });
});

describe("list_projects", () => {
  it("returns the project with its open task count", async () => {
    const { projects } = parsed<{ projects: Record<string, unknown>[] }>(await call("list_projects"));
    expect(projects).toEqual([
      {
        id: FIXTURE.projectId,
        name: FIXTURE.projectName,
        repoPath: FIXTURE.repoPath,
        defaultBranch: "main",
        archived: false,
        openTasks: 1,
        lastOpenedAt: FIXTURE.openSavedAt,
      },
    ]);
  });
});

describe("list_capsules", () => {
  it("lists open capsules by default with a summary built only from what was captured", async () => {
    const { capsules } = parsed<{ capsules: Record<string, unknown>[] }>(await call("list_capsules"));
    expect(capsules).toEqual([
      {
        id: FIXTURE.openTaskId,
        title: FIXTURE.openTaskTitle,
        project: FIXTURE.projectName,
        status: "open",
        branch: FIXTURE.openBranch,
        savedAt: FIXTURE.openSavedAt,
        summary: "4 files, 3 terminals, 5 tabs, 1 pin",
      },
    ]);
  });

  it("orders every status newest capture first and never prints a zero", async () => {
    const { capsules } = parsed<{ capsules: { id: string; status: string; summary: string }[] }>(
      await call("list_capsules", { status: "all" }),
    );
    expect(capsules.map((c) => c.id)).toEqual([FIXTURE.openTaskId, FIXTURE.doneTaskId]);
    expect(capsules[1]).toMatchObject({ status: "done", branch: FIXTURE.doneBranch, summary: "branch only" });
    for (const c of capsules) expect(c.summary).not.toMatch(/\b0 /);
  });

  it("filters by status, project name, project id and limit", async () => {
    const done = parsed<{ capsules: { id: string }[] }>(await call("list_capsules", { status: "done" }));
    expect(done.capsules.map((c) => c.id)).toEqual([FIXTURE.doneTaskId]);

    const byName = parsed<{ capsules: { id: string }[] }>(
      await call("list_capsules", { project: FIXTURE.projectName.toUpperCase(), status: "all" }),
    );
    expect(byName.capsules).toHaveLength(2);

    const byId = parsed<{ capsules: { id: string }[] }>(
      await call("list_capsules", { project: FIXTURE.projectId, status: "all", limit: 1 }),
    );
    expect(byId.capsules.map((c) => c.id)).toEqual([FIXTURE.openTaskId]);
  });

  it("rejects an unknown project with a pointer to list_projects", async () => {
    const result = await call("list_capsules", { project: "nope" });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("list_projects");
  });

  it("rejects an out-of-range limit", async () => {
    // The SDK reports a schema failure either as a rejected call or as an
    // error result, depending on its version; both count as a rejection.
    const outcome = await call("list_capsules", { limit: 0 }).then(
      (result) => (result.isError ? new Error(text(result)) : result),
      (error: unknown) => error,
    );
    expect(outcome).toBeInstanceOf(Error);
    expect(String((outcome as Error).message)).toMatch(/limit|invalid|validation/i);
  });
});

describe("read_capsule", () => {
  it("returns the full capsule from the newest live rows only", async () => {
    const view = parsed<CapsuleView>(await call("read_capsule", { task_id: FIXTURE.openTaskId }));
    expect(view).toEqual({
      id: FIXTURE.openTaskId,
      title: FIXTURE.openTaskTitle,
      project: FIXTURE.projectName,
      status: "open",
      savedAt: FIXTURE.openSavedAt,
      branch: FIXTURE.openBranch,
      editor: {
        folder: FIXTURE.folder,
        files: FIXTURE.files,
        activeFile: FIXTURE.activeFile,
        dirtyFiles: FIXTURE.dirtyFiles,
        terminals: FIXTURE.terminals,
      },
      browser: { tabs: FIXTURE.tabs },
      pins: [
        {
          id: FIXTURE.pin.id,
          connectorKind: FIXTURE.pin.connectorKind,
          identity: FIXTURE.pin.identity,
          payload: FIXTURE.pin.payload,
          createdAt: FIXTURE.pin.createdAt,
        },
      ],
    });
    const raw = text(await call("read_capsule", { task_id: FIXTURE.openTaskId }));
    expect(raw).not.toContain("src/old.rs");
    expect(raw).not.toContain("must not appear");
  });

  it("reports tools that captured nothing as null", async () => {
    const view = parsed<CapsuleView>(await call("read_capsule", { task_id: FIXTURE.doneTaskId }));
    expect(view).toMatchObject({
      id: FIXTURE.doneTaskId,
      status: "done",
      branch: FIXTURE.doneBranch,
      savedAt: FIXTURE.doneSavedAt,
      editor: null,
      browser: null,
      pins: [],
    });
  });

  it("hides tombstoned tasks and points unknown ids at list_capsules", async () => {
    for (const task_id of ["does-not-exist", FIXTURE.deletedTaskId]) {
      const result = await call("read_capsule", { task_id });
      expect(result.isError).toBe(true);
      expect(text(result)).toContain("list_capsules");
      expect(result.structuredContent).toBeUndefined();
    }
  });
});

describe("capsule resource", () => {
  it("lists every live capsule and serves the same JSON as read_capsule", async () => {
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri).sort()).toEqual(
      [capsuleUri(FIXTURE.openTaskId), capsuleUri(FIXTURE.doneTaskId)].sort(),
    );
    for (const r of resources) expect(r.mimeType).toBe("application/json");

    const read = await client.readResource({ uri: capsuleUri(FIXTURE.openTaskId) });
    expect(read.contents).toHaveLength(1);
    const content = read.contents[0] as { uri: string; mimeType?: string; text?: string };
    expect(content.uri).toBe(capsuleUri(FIXTURE.openTaskId));
    expect(content.mimeType).toBe("application/json");
    expect(content.text).toBe(text(await call("read_capsule", { task_id: FIXTURE.openTaskId })));
  });

  it("fails to read an unknown capsule", async () => {
    await expect(client.readResource({ uri: capsuleUri("missing") })).rejects.toThrow(/list_capsules/);
  });
});

describe("capsule_briefing", () => {
  it("matches the golden briefing for the open task", async () => {
    const briefing = text(await call("capsule_briefing", { task_id: FIXTURE.openTaskId }));
    if (process.env.UPDATE_GOLDEN) writeFileSync(GOLDEN, briefing);
    expect(briefing).toBe(readFileSync(GOLDEN, "utf8"));
    expect(Buffer.byteLength(briefing, "utf8")).toBeLessThan(BRIEFING_MAX_BYTES);
    expect(briefing).toContain(`# ${FIXTURE.openTaskTitle}`);
    expect(briefing).toContain(`Project ${FIXTURE.projectName} on branch ${FIXTURE.openBranch}, saved ${FIXTURE.openSavedAt}.`);
    expect(briefing).toContain(`- ${FIXTURE.activeFile} (active)`);
    expect(briefing).toContain("- tests/reconnect.rs (unsaved changes)");
    expect(briefing).toContain("- cargo watch in ~/code/atlas-api (busy)");
    expect(briefing).toContain("- tokio-tungstenite docs <https://docs.rs/tokio-tungstenite/>");
    expect(briefing).toContain("## Pins");
    expect(briefing.trimEnd().endsWith(CLOSING_LINE)).toBe(true);
    expect(briefing).not.toMatch(/[–—]/);
  });

  it("omits sections for tools that captured nothing", async () => {
    const briefing = text(await call("capsule_briefing", { task_id: FIXTURE.doneTaskId }));
    expect(briefing).toContain(`# ${FIXTURE.doneTaskTitle}`);
    expect(briefing).toContain(`on branch ${FIXTURE.doneBranch}`);
    expect(briefing).toContain("Marked done.");
    for (const heading of ["## Files", "## Terminals", "## Browser tabs", "## Pins"]) {
      expect(briefing).not.toContain(heading);
    }
    expect(briefing).not.toMatch(/\b0 (files|terminals|tabs|pins)/);
    expect(briefing.trimEnd().endsWith(CLOSING_LINE)).toBe(true);
  });

  it("is an error for an unknown capsule", async () => {
    const result = await call("capsule_briefing", { task_id: "missing" });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("list_capsules");
  });

  it("truncates long lists to stay under 4 KB", () => {
    const view: CapsuleView = {
      id: "t",
      title: "A capsule with far too much in it",
      project: "atlas-api",
      status: "open",
      savedAt: FIXTURE.openSavedAt,
      branch: "main",
      editor: {
        folder: "~/code/atlas-api",
        files: Array.from({ length: 300 }, (_, i) => `src/module_${i}/deeply/nested/path/to/file_${i}.rs`),
        activeFile: "src/module_0/deeply/nested/path/to/file_0.rs",
        dirtyFiles: [],
        terminals: Array.from({ length: 40 }, (_, i) => ({ name: `shell ${i}`, cwd: "~/code/atlas-api", busy: false })),
      },
      browser: {
        tabs: Array.from({ length: 120 }, (_, i) => ({
          title: `Tab number ${i} with a fairly long title that goes on`,
          url: `https://example.com/a/very/long/path/${"x".repeat(150)}/${i}`,
        })),
      },
      pins: [],
    };
    const briefing = renderBriefing(view);
    expect(Buffer.byteLength(briefing, "utf8")).toBeLessThanOrEqual(BRIEFING_MAX_BYTES);
    expect(briefing).toMatch(/- and \d+ more/);
    expect(briefing).toContain("(active)");
    expect(briefing.trimEnd().endsWith(CLOSING_LINE)).toBe(true);
  });
});

describe("recent_activity", () => {
  it("returns events newest first with connector kind and event name", async () => {
    const { events } = parsed<{ events: { seq: number; at: string; type: string; connectorKind: string | null; name: string | null }[] }>(
      await call("recent_activity"),
    );
    expect(events.map((e) => [e.type, e.name])).toEqual(FIXTURE.events.map(([type, name]) => [type, name]));
    for (const e of events) {
      expect(e.connectorKind).toBe("vscode");
      expect(typeof e.seq).toBe("number");
      expect(e.at).toMatch(/^2026-/);
    }
    const seqs = events.map((e) => e.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => b - a));
  });

  it("honours the limit", async () => {
    const { events } = parsed<{ events: unknown[] }>(await call("recent_activity", { limit: 2 }));
    expect(events).toHaveLength(2);
  });
});

describe("paths", () => {
  const home = "/Users/somebody";

  it("prefers RABTA_DB over everything else", () => {
    expect(resolveDbPath({ env: { RABTA_DB: "/somewhere/else.db" }, argv: ["--debug"], home })).toBe("/somewhere/else.db");
  });

  it("ignores a blank RABTA_DB", () => {
    expect(resolveDbPath({ env: { RABTA_DB: "  " }, argv: [], home })).toBe(
      `${home}/Library/Application Support/com.omnibus.dev/omnibus.db`,
    );
  });

  it("defaults to the release app database", () => {
    expect(resolveDbPath({ env: {}, argv: [], home })).toBe(`${home}/Library/Application Support/com.omnibus.dev/omnibus.db`);
  });

  it("uses the debug app database with --debug", () => {
    expect(resolveDbPath({ env: {}, argv: ["--debug"], home })).toBe(
      `${home}/Library/Application Support/com.omnibus.dev.debug/omnibus.db`,
    );
  });

  it("refuses to open a missing database and names the path", () => {
    const missing = fileURLToPath(new URL("./does-not-exist/omnibus.db", import.meta.url));
    expect(() => openDatabase(missing)).toThrow(DatabaseMissingError);
    expect(() => openDatabase(missing)).toThrow(missing);
    expect(() => openDatabase(missing)).toThrow(/open Rabta once/i);
  });
});

describe("schema version", () => {
  function captureStderr(run: () => void): string[] {
    const chunks: string[] = [];
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(((chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    }) as typeof process.stderr.write);
    try {
      run();
    } finally {
      spy.mockRestore();
    }
    return chunks;
  }

  it("is 5", () => {
    expect(KNOWN_SCHEMA).toBe(5);
  });

  it("prints one stderr warning for a newer database and keeps going", () => {
    const newer = buildFixtureDb({ userVersion: 9 });
    try {
      let version = 0;
      const chunks = captureStderr(() => {
        version = warnIfNewerSchema(newer);
      });
      expect(version).toBe(9);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toMatch(/version 9/);
      expect(chunks[0]).toMatch(/version 5/);
    } finally {
      newer.close();
    }
  });

  it("stays quiet at the known schema", () => {
    const chunks = captureStderr(() => {
      expect(warnIfNewerSchema(db)).toBe(5);
    });
    expect(chunks).toEqual([]);
  });
});
