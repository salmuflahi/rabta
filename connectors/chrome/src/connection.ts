import { Envelope, PROTOCOL_VERSION } from "@omnibus/protocol";

/** The subset of WebSocket the connection uses; injectable for tests. */
export interface SocketLike {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((data: string) => void) | null;
  onclose: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
}

/** Persistent token storage (chrome.storage.local in the browser). */
export interface TokenStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  remove(): Promise<void>;
}

export interface ConnectionOptions {
  name: string;
  kind: "chrome";
  capabilities: string[];
  port: number;
  makeSocket: (url: string) => SocketLike;
  store: TokenStore;
  onCommand: (name: string, args: unknown) => unknown | Promise<unknown>;
  onStatus?: (s: "connecting" | "pairing" | "connected" | "denied") => void;
}

const INITIAL_BACKOFF = 1_000;
const MAX_BACKOFF = 30_000;
let uid = 0;

/**
 * Browser-side transport for the OmniBus protocol. Discovers the hub at a
 * fixed port, pairs on first run (token persisted), and thereafter
 * authenticates with the stored token. Diverges from the Node SDK on one
 * point: `auth_failed` clears the stored token and re-pairs (a browser can't
 * re-read a secret), rate-limited by the reconnect backoff.
 */
export class Connection {
  private ws: SocketLike | null = null;
  private token: string | null = null;
  private closed = false;
  private backoff = INITIAL_BACKOFF;
  private redialTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private opts: ConnectionOptions) {}

  /** Begins connecting and keeps reconnecting until `close()`. */
  start(): void {
    void this.dial();
  }

  /** Permanently stops (no reconnect). */
  close(): void {
    this.closed = true;
    if (this.redialTimer !== null) {
      clearTimeout(this.redialTimer);
      this.redialTimer = null;
    }
    this.ws?.close();
  }

  private send(kind: string, payload: unknown): void {
    this.ws?.send(JSON.stringify({ v: PROTOCOL_VERSION, id: `m${uid++}`, kind, payload }));
  }

  private async dial(): Promise<void> {
    if (this.closed) return;
    // Socket creation and handler wiring must be fully synchronous (a
    // reconnect swaps in a fresh socket instance that callers may observe
    // immediately); the token lookup is async (chrome.storage.local) and is
    // resolved inside the onopen handler instead of gating socket creation.
    const ws = this.opts.makeSocket(`ws://127.0.0.1:${this.opts.port}`);
    this.ws = ws;
    ws.onopen = () => void this.handleOpen();
    ws.onmessage = (data) => void this.onFrame(data);
    ws.onclose = () => this.scheduleRedial();
    ws.onerror = () => {
      /* a close follows; redial happens there */
    };
  }

  private async handleOpen(): Promise<void> {
    this.token = await this.opts.store.get();
    if (this.token) {
      this.opts.onStatus?.("connecting");
      this.send("hello", {
        name: this.opts.name,
        kind: this.opts.kind,
        protocolVersion: PROTOCOL_VERSION,
        capabilities: this.opts.capabilities,
        token: this.token,
      });
    } else {
      this.opts.onStatus?.("pairing");
      this.send("pair", { name: this.opts.name, kind: this.opts.kind });
    }
  }

  private async onFrame(data: string): Promise<void> {
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }
    const parsed = Envelope.safeParse(json);
    if (!parsed.success) return;
    const env = parsed.data;
    switch (env.kind) {
      case "welcome":
        this.backoff = INITIAL_BACKOFF;
        this.opts.onStatus?.("connected");
        break;
      case "paired":
        // First-run pairing approved: persist the token and reconnect to
        // authenticate with it (the parked pairing connection is now closed
        // by the hub).
        await this.opts.store.set(env.payload.token);
        this.token = env.payload.token;
        this.ws?.close();
        break;
      case "ping":
        this.send("pong", {});
        break;
      case "command": {
        let payload: unknown;
        try {
          payload = {
            requestId: env.id,
            ok: true,
            result: await this.opts.onCommand(env.payload.name, env.payload.args),
          };
        } catch (e) {
          payload = { requestId: env.id, ok: false, error: String(e) };
        }
        this.send("response", payload);
        break;
      }
      case "error":
        if (env.payload.code === "auth_failed") {
          // Stored token no longer valid (e.g. hub db reset): drop it and
          // re-pair. Backoff rate-limits any pathological loop.
          await this.opts.store.remove();
          this.token = null;
          this.ws?.close();
        } else if (env.payload.code === "pairing_denied" || env.payload.code === "pairing_timeout") {
          this.opts.onStatus?.("denied");
          this.ws?.close();
        }
        break;
    }
  }

  private scheduleRedial(): void {
    if (this.closed) return;
    this.redialTimer = setTimeout(() => {
      this.redialTimer = null;
      void this.dial();
    }, this.backoff);
    this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF);
  }
}
