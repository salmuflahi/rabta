#!/usr/bin/env node
import type { DatabaseSync } from "node:sqlite";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DatabaseMissingError, openDatabase, warnIfNewerSchema } from "./db.js";
import { agentPathsFor } from "./ipc.js";
import { resolveDbPath } from "./paths.js";
import { buildServer } from "./server.js";

// Stdout carries the MCP protocol. Everything the server has to say goes to stderr.
const log = (line: string): void => {
  process.stderr.write(`${line}\n`);
};

const dbPath = resolveDbPath({ env: process.env, argv: process.argv.slice(2) });

let db: DatabaseSync;
try {
  db = openDatabase(dbPath);
} catch (error) {
  if (error instanceof DatabaseMissingError) {
    log(error.message);
    process.exit(1);
  }
  throw error;
}

warnIfNewerSchema(db, log);

const server = buildServer(db, { agent: agentPathsFor(dbPath) });
await server.connect(new StdioServerTransport());
log(`rabta-mcp: serving ${dbPath} over stdio; capture and restore go through the app's agent socket when it is on`);
