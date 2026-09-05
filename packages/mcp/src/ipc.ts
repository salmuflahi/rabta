/**
 * The agent socket: how this server asks the Rabta app to do something.
 *
 * Reading capsules needs no app at all (the database is a file). Capturing
 * and restoring do, because they drive live connectors, so the app offers a
 * Unix socket in its data folder when "Agent access" is on in Settings. The
 * protocol is newline-delimited JSON: one `auth` with the secret from the
 * file beside the socket, then one request per line.
 *
 * Every call here opens its own connection and closes it afterwards. A
 * capture or a restore is one exchange; keeping a socket open between them
 * would only add state to get wrong.
 */
import { readFile } from "node:fs/promises";
import { createConnection, type Socket } from "node:net";
import { dirname, join } from "node:path";

export interface AgentPaths {
  socket: string;
  secret: string;
}

export const SOCKET_FILE = "agent.sock";
export const SECRET_FILE = "agent.secret";

/** The socket and secret live beside the database the app writes. */
export function agentPathsFor(dbPath: string): AgentPaths {
  const dir = dirname(dbPath);
  return { socket: join(dir, SOCKET_FILE), secret: join(dir, SECRET_FILE) };
}

export const AGENT_ACCESS_OFF =
  "Agent access is off. In the Rabta app open Settings, Agents and turn on Agent access; " +
  "the app then listens on a local socket file that only your user can open. " +
  "Reading capsules works without it.";

export class AgentAccessOffError extends Error {
  constructor() {
    super(AGENT_ACCESS_OFF);
    this.name = "AgentAccessOffError";
  }
}

interface Reply {
  id: unknown;
  ok: boolean;
  result?: unknown;
  error?: unknown;
}

/** Reads newline-delimited replies off a socket, one at a time, in order. */
class LineReader {
  private buffer = "";
  private readonly queue: string[] = [];
  private waiter: ((line: string) => void) | null = null;
  private closed: Error | null = null;

  constructor(socket: Socket) {
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      this.buffer += chunk;
      let index: number;
      while ((index = this.buffer.indexOf("\n")) >= 0) {
        const line = this.buffer.slice(0, index);
        this.buffer = this.buffer.slice(index + 1);
        if (this.waiter) {
          const waiter = this.waiter;
          this.waiter = null;
          waiter(line);
        } else {
          this.queue.push(line);
        }
      }
    });
    const close = (error?: Error) => {
      this.closed = error ?? new Error("the agent socket closed before replying");
      if (this.waiter) {
        const waiter = this.waiter;
        this.waiter = null;
        waiter("");
      }
    };
    socket.on("error", close);
    socket.on("close", () => close());
  }

  next(): Promise<string> {
    const queued = this.queue.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    if (this.closed) return Promise.reject(this.closed);
    return new Promise((resolve, reject) => {
      this.waiter = (line) => {
        if (line === "" && this.closed) reject(this.closed);
        else resolve(line);
      };
    });
  }
}

function connect(path: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(path);
    socket.once("connect", () => resolve(socket));
    socket.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT" || error.code === "ECONNREFUSED") reject(new AgentAccessOffError());
      else reject(error);
    });
  });
}

async function exchange(socket: Socket, reader: LineReader, request: Record<string, unknown>): Promise<Reply> {
  socket.write(`${JSON.stringify(request)}\n`);
  const line = await reader.next();
  try {
    return JSON.parse(line) as Reply;
  } catch {
    throw new Error(`the agent socket sent something that is not JSON: ${line.slice(0, 120)}`);
  }
}

/**
 * One authenticated call: connect, present the secret, send the request,
 * return its result. Throws `AgentAccessOffError` when the app is not
 * listening, and a plain Error carrying the app's message otherwise.
 */
export async function agentCall(
  paths: AgentPaths,
  method: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  let secret: string;
  try {
    secret = (await readFile(paths.secret, "utf8")).trim();
  } catch {
    throw new AgentAccessOffError();
  }
  const socket = await connect(paths.socket);
  const reader = new LineReader(socket);
  try {
    const auth = await exchange(socket, reader, { id: 1, method: "auth", params: { secret } });
    if (!auth.ok) throw new Error(`the app refused the agent secret: ${String(auth.error)}`);
    const reply = await exchange(socket, reader, { id: 2, method, params });
    if (!reply.ok) throw new Error(String(reply.error));
    return reply.result;
  } finally {
    socket.end();
    socket.destroy();
  }
}
