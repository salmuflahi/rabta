import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AGENT_ACCESS_OFF, agentCall, agentPathsFor } from "../src/ipc.ts";
import { AGENT_ACCESS_OFF_TEXT, buildServer } from "../src/server.ts";
import { FIXTURE, buildFixtureDb } from "./fixture-db.ts";

/**
 * A stand-in for the app's agent socket: the same newline-delimited JSON
 * protocol, a secret to check, canned receipts, and a log of what it was
 * asked. The Rust side has its own tests against the real Capsules; this
 * one proves the client half speaks the same language.
 */
interface FakeApp {
  server: Server;
  calls: { method: string; params: Record<string, unknown> }[];
  close(): Promise<void>;
}

const SECRET = "s".repeat(64);
const RECEIPT = {
  applied: ["git", "vscode"],
  pending: [],
  skipped: ["chrome: not running"],
  savedPrevious: null,
  errors: [],
  closed: [],
  kept: [],
};

function startFakeApp(socketPath: string, secret = SECRET): Promise<FakeApp> {
  const calls: FakeApp["calls"] = [];
  const server = createServer((socket: Socket) => {
    let authed = false;
    let buffer = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      let index: number;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        const req = JSON.parse(line) as { id: unknown; method: string; params?: Record<string, unknown> };
        const reply = (body: Record<string, unknown>) => socket.write(`${JSON.stringify({ id: req.id, ...body })}\n`);
        if (!authed) {
          if (req.method === "auth" && req.params?.secret === secret) {
            authed = true;
            reply({ ok: true, result: { authenticated: true } });
          } else {
            reply({ ok: false, error: "auth failed" });
            socket.end();
          }
          continue;
        }
        calls.push({ method: req.method, params: req.params ?? {} });
        switch (req.method) {
          case "capture":
            reply({ ok: true, result: { captured: ["vscode", "git"], skipped: ["chrome: not running"] } });
            break;
          case "restore":
            reply({ ok: true, result: RECEIPT });
            break;
          default:
            reply({ ok: false, error: `unknown method: ${req.method}` });
        }
      }
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () =>
      resolve({
        server,
        calls,
        close: () => new Promise((done) => server.close(() => done())),
      }),
    );
  });
}

function text(result: CallToolResult): string {
  const first = result.content[0];
  if (!first || first.type !== "text") throw new Error("expected a text content block");
  return first.text;
}

describe("the agent socket client", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "rabta-mcp-agent-"));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("derives the socket and secret from the database's folder", () => {
    const paths = agentPathsFor("/Users/x/Library/Application Support/com.omnibus.dev/omnibus.db");
    expect(paths.socket).toBe("/Users/x/Library/Application Support/com.omnibus.dev/agent.sock");
    expect(paths.secret).toBe("/Users/x/Library/Application Support/com.omnibus.dev/agent.secret");
  });

  it("says agent access is off when there is no secret file", async () => {
    const paths = agentPathsFor(join(dir, "none", "omnibus.db"));
    await expect(agentCall(paths, "ping", {})).rejects.toThrow(AGENT_ACCESS_OFF);
  });

  it("says agent access is off when the secret exists but nothing listens", async () => {
    const paths = agentPathsFor(join(dir, "omnibus.db"));
    writeFileSync(paths.secret, SECRET);
    await expect(agentCall(paths, "ping", {})).rejects.toThrow(AGENT_ACCESS_OFF);
  });

  it("authenticates and relays a call, then hangs up", async () => {
    const paths = agentPathsFor(join(dir, "omnibus.db"));
    writeFileSync(paths.secret, SECRET);
    const app = await startFakeApp(paths.socket);
    try {
      const result = await agentCall(paths, "capture", { task_id: "t1" });
      expect(result).toEqual({ captured: ["vscode", "git"], skipped: ["chrome: not running"] });
      expect(app.calls).toEqual([{ method: "capture", params: { task_id: "t1" } }]);
    } finally {
      await app.close();
    }
  });

  it("reports a refused secret in plain words", async () => {
    const paths = agentPathsFor(join(dir, "omnibus.db"));
    writeFileSync(paths.secret, "wrong");
    const app = await startFakeApp(paths.socket);
    try {
      await expect(agentCall(paths, "capture", { task_id: "t1" })).rejects.toThrow(/refused the agent secret/);
    } finally {
      await app.close();
    }
  });
});

describe("capture_capsule and restore_capsule", () => {
  let dir: string;
  let client: Client;
  let db: ReturnType<typeof buildFixtureDb>;
  let app: FakeApp | null = null;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "rabta-mcp-tools-"));
    db = buildFixtureDb();
    const paths = agentPathsFor(join(dir, "omnibus.db"));
    const server = buildServer(db, { agent: paths });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: "rabta-mcp-agent-tests", version: "0.0.0" });
    await client.connect(clientTransport);
  });
  afterEach(async () => {
    if (app) await app.close();
    app = null;
    rmSync(join(dir, "agent.secret"), { force: true });
  });
  afterAll(async () => {
    await client.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const call = async (name: string, args: Record<string, unknown>) =>
    (await client.callTool({ name, arguments: args })) as CallToolResult;

  it("lists both tools as writes, with restore marked destructive", async () => {
    const { tools } = await client.listTools();
    const capture = tools.find((t) => t.name === "capture_capsule");
    const restore = tools.find((t) => t.name === "restore_capsule");
    expect(capture?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(restore?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(capture?.description).toContain("Does NOT restore");
    expect(restore?.description).toContain("Does NOT capture");
  });

  it("explains how to turn agent access on when the app is not listening", async () => {
    const result = await call("capture_capsule", { task_id: FIXTURE.openTaskId });
    expect(result.isError).toBe(true);
    expect(text(result)).toBe(AGENT_ACCESS_OFF);
  });

  it("rejects an unknown capsule before touching the socket", async () => {
    const result = await call("restore_capsule", { task_id: "nope" });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('No capsule with id "nope"');
  });

  it("captures through the app and returns what was captured and skipped", async () => {
    const paths = agentPathsFor(join(dir, "omnibus.db"));
    writeFileSync(paths.secret, SECRET);
    app = await startFakeApp(paths.socket);
    const result = await call("capture_capsule", { task_id: FIXTURE.openTaskId });
    expect(result.isError ?? false).toBe(false);
    expect(JSON.parse(text(result))).toEqual({ captured: ["vscode", "git"], skipped: ["chrome: not running"] });
    expect(app.calls).toEqual([{ method: "capture", params: { task_id: FIXTURE.openTaskId } }]);
  });

  it("restores through the app and returns the app's receipt untouched", async () => {
    const paths = agentPathsFor(join(dir, "omnibus.db"));
    writeFileSync(paths.secret, SECRET);
    app = await startFakeApp(paths.socket);
    const result = await call("restore_capsule", { task_id: FIXTURE.openTaskId, focus: true });
    expect(result.isError ?? false).toBe(false);
    expect(JSON.parse(text(result))).toEqual(RECEIPT);
    expect(result.structuredContent).toEqual(RECEIPT);
    expect(app.calls).toEqual([{ method: "restore", params: { task_id: FIXTURE.openTaskId, focus: true } }]);
  });

  it("keeps the same off-text on the server and in the client", () => {
    expect(AGENT_ACCESS_OFF_TEXT).toBe(AGENT_ACCESS_OFF);
  });
});
