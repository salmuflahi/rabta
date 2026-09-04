import { randomUUID } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { Envelope, PROTOCOL_VERSION } from "@rabta/protocol";

export interface ConnectOptions {
  name: string;
  kind: "fake" | "vscode" | "chrome";
  capabilities: string[];
  /** The connector's own product/build version, distinct from the protocol
   * version. Reported to the hub in `hello`; omitted entirely if unset. */
  version?: string;
  /** Override the discovery file path (tests). Left unset, the SDK looks in
   * every place the desktop app can write it — see `hubDiscoveryCandidates`. */
  hubFile?: string;
  /** Persistent token for browser-class connectors; wins over the secret. */
  token?: string;
}

export type CommandHandler = (args: unknown) => unknown | Promise<unknown>;

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

/** Every path the desktop app can write `hub.json` to, most common first.
 *
 * There are two because the app ships two ways. The direct-download build
 * writes to `~/Library/Application Support/com.omnibus.dev/`. The Mac App
 * Store build runs under App Sandbox, where the very same `app_data_dir()`
 * call resolves inside the app's container — the sandbox rewrites `$HOME`
 * for that process, and nothing in the app knows or cares. Connectors are
 * not sandboxed, so they can read either; they just have to look in both. */
export function hubDiscoveryCandidates(home: string = homedir()): string[] {
  const tail = ["Library", "Application Support", "com.omnibus.dev", "hub.json"];
  return [
    join(home, ...tail),
    join(home, "Library", "Containers", "com.omnibus.dev", "Data", ...tail),
  ];
}

/** Modification time of `path` in ms, or `null` if it cannot be stat'ed. */
function mtimeMs(path: string): number | null {
  try {
    return statSync(path, { throwIfNoEntry: false })?.mtimeMs ?? null;
  } catch {
    return null;
  }
}

/** Picks the discovery file to read: the candidate written most recently.
 *
 * A machine that has run both builds has both files, and the stale one
 * describes a hub that is no longer listening (or worse, a port something
 * else now owns). The hub rewrites `hub.json` on every start, so the newest
 * file is the live hub. With nothing on disk the first candidate is
 * returned, so the caller's read fails and redials exactly as before. */
export function pickHubFile(
  candidates: string[],
  mtimeOf: (path: string) => number | null = mtimeMs,
): string {
  let best: string | null = null;
  let bestMtime = -Infinity;
  for (const candidate of candidates) {
    const mtime = mtimeOf(candidate);
    if (mtime !== null && mtime > bestMtime) {
      best = candidate;
      bestMtime = mtime;
    }
  }
  return best ?? candidates[0];
}

/** A live connection to the OmniBus hub that survives hub restarts. */
export class Connector {
  connectorId: string | null = null;
  private handlers = new Map<string, CommandHandler>();
  private ws: WebSocket | null = null;
  private secret: string | undefined;
  private closed = false;
  private backoff = INITIAL_BACKOFF_MS;
  private redialTimer: NodeJS.Timeout | null = null;

  constructor(private opts: ConnectOptions) {}

  /** Registers a handler for a command name. Survives reconnects. */
  onCommand(name: string, handler: CommandHandler): void {
    this.handlers.set(name, handler);
  }

  /** Emits an unsolicited event to the hub. Dropped if not connected. */
  emit(name: string, data: unknown): void {
    this.sendFrame({ kind: "event", payload: { name, data } });
  }

  /** Closes the connection permanently (no reconnect). */
  close(): void {
    this.closed = true;
    if (this.redialTimer !== null) {
      clearTimeout(this.redialTimer);
      this.redialTimer = null;
    }
    this.ws?.close();
  }

  private hubFile(): string {
    // Resolved on every dial, like the read itself: the live build can change
    // between attempts (quit the DMG app, launch the Store one).
    return this.opts.hubFile ?? pickHubFile(hubDiscoveryCandidates());
  }

  private sendFrame(frame: { kind: string; payload: unknown }): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ v: PROTOCOL_VERSION, id: randomUUID(), ...frame }));
    }
  }

  /** Resolves after the first successful welcome; keeps reconnecting after that. */
  start(): Promise<void> {
    return new Promise((resolve, reject) => this.dial(resolve, reject));
  }

  private dial(onWelcome?: () => void, onFatal?: (e: Error) => void): void {
    if (this.closed) return;
    let port: number;
    try {
      // Re-read on every attempt: a restarted hub writes a fresh port (and,
      // on restart, a fresh secret).
      const disco = JSON.parse(readFileSync(this.hubFile(), "utf8"));
      port = disco.port;
      this.secret = typeof disco.secret === "string" ? disco.secret : undefined;
    } catch {
      this.scheduleRedial(onWelcome, onFatal);
      return;
    }
    if (!Number.isInteger(port) || port <= 0) {
      // A malformed discovery file (missing/non-numeric/zero port) is
      // treated exactly like a failed read: log and redial rather than
      // handing `WebSocket` a value that makes it throw synchronously
      // (e.g. `ws://127.0.0.1:undefined`), which would otherwise kill the
      // reconnect loop outright.
      console.error(`invalid hub discovery port: ${JSON.stringify(port)}`);
      this.scheduleRedial(onWelcome, onFatal);
      return;
    }
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    this.ws = ws;
    ws.on("open", () => {
      this.sendFrame({
        kind: "hello",
        payload: {
          name: this.opts.name,
          kind: this.opts.kind,
          protocolVersion: PROTOCOL_VERSION,
          capabilities: this.opts.capabilities,
          ...(this.opts.version ? { version: this.opts.version } : {}),
          ...(this.opts.token ? { token: this.opts.token } : this.secret ? { secret: this.secret } : {}),
        },
      });
    });
    ws.on("message", (raw) => void this.handleFrame(raw.toString(), onWelcome, onFatal));
    ws.on("close", () => this.scheduleRedial(onWelcome, onFatal));
    ws.on("error", () => {
      /* a close event follows; redial happens there */
    });
  }

  private async handleFrame(
    raw: string,
    onWelcome?: () => void,
    onFatal?: (e: Error) => void
  ): Promise<void> {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return;
    }
    const parsed = Envelope.safeParse(json);
    if (!parsed.success) return;
    const env = parsed.data;
    switch (env.kind) {
      case "welcome":
        this.connectorId = env.payload.connectorId;
        this.backoff = INITIAL_BACKOFF_MS;
        onWelcome?.();
        break;
      case "ping":
        this.sendFrame({ kind: "pong", payload: {} });
        break;
      case "command": {
        const handler = this.handlers.get(env.payload.name);
        let payload;
        try {
          if (!handler) throw new Error(`no handler for ${env.payload.name}`);
          payload = { requestId: env.id, ok: true, result: await handler(env.payload.args) };
        } catch (e) {
          payload = { requestId: env.id, ok: false, error: String(e) };
        }
        this.sendFrame({ kind: "response", payload });
        break;
      }
      case "error":
        if (env.payload.code === "version_mismatch" || env.payload.code === "auth_failed") {
          // Spec: surface clearly and do NOT retry. Always log to the
          // console — this can happen well after the first `welcome` (e.g.
          // on a reconnect to a since-upgraded or since-restarted hub), at
          // which point the `start()` promise this `onFatal` closes over has
          // already settled and calling it again is a silent no-op.
          // Additionally still call `onFatal` so a first dial that hasn't
          // resolved yet (this is the very first frame received) rejects
          // `start()`.
          this.closed = true;
          const err = new Error(
            env.payload.code === "auth_failed"
              ? "hub rejected this connector's credentials — restart the hub or re-pair"
              : "hub requires a different protocol version — update this connector"
          );
          console.error(err.message);
          onFatal?.(err);
        }
        break;
    }
  }

  private scheduleRedial(onWelcome?: () => void, onFatal?: (e: Error) => void): void {
    if (this.closed) return;
    this.redialTimer = setTimeout(() => {
      this.redialTimer = null;
      this.dial(onWelcome, onFatal);
    }, this.backoff);
    this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
  }
}

/**
 * Connects to the hub. `setup` runs before dialing so command handlers are
 * registered before the first command can arrive.
 */
export async function connect(
  opts: ConnectOptions,
  setup?: (c: Connector) => void
): Promise<Connector> {
  const connector = new Connector(opts);
  setup?.(connector);
  await connector.start();
  return connector;
}
