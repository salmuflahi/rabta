import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { Envelope, PROTOCOL_VERSION } from "@omnibus/protocol";

export interface ConnectOptions {
  name: string;
  kind: "fake" | "vscode" | "chrome";
  capabilities: string[];
  /** Override the discovery file path (tests). */
  hubFile?: string;
}

export type CommandHandler = (args: unknown) => unknown | Promise<unknown>;

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

/** A live connection to the OmniBus hub that survives hub restarts. */
export class Connector {
  connectorId: string | null = null;
  private handlers = new Map<string, CommandHandler>();
  private ws: WebSocket | null = null;
  private closed = false;
  private backoff = INITIAL_BACKOFF_MS;

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
    this.ws?.close();
  }

  private hubFile(): string {
    return (
      this.opts.hubFile ??
      join(homedir(), "Library", "Application Support", "com.omnibus.dev", "hub.json")
    );
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
    let port: number;
    try {
      // Re-read on every attempt: a restarted hub writes a fresh port.
      port = JSON.parse(readFileSync(this.hubFile(), "utf8")).port;
    } catch {
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
        if (env.payload.code === "version_mismatch") {
          // Spec: surface clearly and do NOT retry.
          this.closed = true;
          const err = new Error(
            "hub requires a different protocol version — update this connector"
          );
          if (onFatal) onFatal(err);
          else console.error(err.message);
        }
        break;
    }
  }

  private scheduleRedial(onWelcome?: () => void, onFatal?: (e: Error) => void): void {
    if (this.closed) return;
    setTimeout(() => this.dial(onWelcome, onFatal), this.backoff);
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
