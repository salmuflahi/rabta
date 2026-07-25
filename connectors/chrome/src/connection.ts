import { Envelope, PROTOCOL_VERSION } from "@rabta/protocol";

/** The subset of WebSocket the connection uses; injectable for tests. */
export interface SocketLike {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((data: string) => void) | null;
  onclose: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
}

/** Minimal shape of a native browser WebSocket constructor, sufficient for
 * adapting to SocketLike. `onmessage` receives a MessageEvent-like object
 * whose payload lives on `.data`, not a raw string. */
interface NativeSocketCtor {
  new (url: string): {
    send(data: string): void;
    close(): void;
    onopen: ((ev: unknown) => void) | null;
    onmessage: ((ev: { data: unknown }) => void) | null;
    onclose: ((ev: unknown) => void) | null;
    onerror: ((ev: unknown) => void) | null;
  };
}

/** Adapts a browser WebSocket to SocketLike, translating MessageEvent → string.
 * `ctor` is injectable so the adaptation is testable without a real browser.
 * The default cast to `NativeSocketCtor` is a deliberate, narrow lie: the
 * real global `WebSocket` satisfies this shape but TS doesn't know that
 * without DOM lib types wired up here. */
export function nativeSocket(
  url: string,
  ctor: NativeSocketCtor = WebSocket as unknown as NativeSocketCtor,
): SocketLike {
  const raw = new ctor(url);
  const sock: SocketLike = {
    send: (d) => raw.send(d),
    close: () => raw.close(),
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  };
  raw.onopen = () => sock.onopen?.();
  raw.onmessage = (ev) => sock.onmessage?.(typeof ev.data === "string" ? ev.data : String(ev.data));
  raw.onclose = () => sock.onclose?.();
  raw.onerror = (ev) => sock.onerror?.(ev);
  return sock;
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
  /** The extension's own version (from the manifest), distinct from the
   * protocol version. Reported in `hello`; omitted if unset. */
  version?: string;
  port: number;
  makeSocket: (url: string) => SocketLike;
  store: TokenStore;
  onCommand: (name: string, args: unknown) => unknown | Promise<unknown>;
  onStatus?: (s: "connecting" | "pairing" | "connected" | "denied" | "disconnected") => void;
}

const INITIAL_BACKOFF = 1_000;
const MAX_BACKOFF = 30_000;
let uid = 0;

/**
 * Browser-side transport for the Rabta protocol. Discovers the hub at a
 * fixed port, pairs on first run (token persisted), and thereafter
 * authenticates with the stored token. Diverges from the Node SDK on one
 * point: `auth_failed` clears the stored token and re-pairs (a browser can't
 * re-read a secret), rate-limited by the reconnect backoff.
 */
export class Connection {
  private ws: SocketLike | null = null;
  private token: string | null = null;
  private closed = false;
  private connected = false;
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
    this.connected = false;
    if (this.redialTimer !== null) {
      clearTimeout(this.redialTimer);
      this.redialTimer = null;
    }
    this.ws?.close();
  }

  /** Emits a fire-and-forget event frame while connected; dropped otherwise
   * (no queueing — events are best-effort, not commands). */
  emit(name: string, data: unknown): void {
    if (!this.connected) return;
    this.send("event", { name, data });
  }

  private send(kind: string, payload: unknown): void {
    this.ws?.send(JSON.stringify({ v: PROTOCOL_VERSION, id: `m${uid++}`, kind, payload }));
  }

  private async dial(): Promise<void> {
    if (this.closed) return;
    if (!Number.isInteger(this.opts.port) || this.opts.port <= 0) {
      // A corrupted/invalid stored port would otherwise be handed straight
      // to makeSocket (e.g. `ws://127.0.0.1:NaN`), which can throw
      // synchronously before onclose is ever wired up — stranding the
      // "connecting" guard in background.ts forever (it's only cleared on
      // "disconnected"). Treat it exactly like a failed dial: log, signal
      // disconnected, and redial rather than constructing a socket.
      console.warn(`invalid port: ${JSON.stringify(this.opts.port)}`);
      this.opts.onStatus?.("disconnected");
      this.scheduleRedial();
      return;
    }
    // Socket creation and handler wiring must be fully synchronous (a
    // reconnect swaps in a fresh socket instance that callers may observe
    // immediately); the token lookup is async (chrome.storage.local) and is
    // resolved inside the onopen handler instead of gating socket creation.
    let ws: SocketLike;
    try {
      ws = this.opts.makeSocket(`ws://127.0.0.1:${this.opts.port}`);
      this.ws = ws;
      ws.onopen = () => void this.handleOpen();
      ws.onmessage = (data) => void this.onFrame(data);
      ws.onclose = () => {
        this.connected = false;
        // Only signal "disconnected" for a socket drop that will actually be
        // retried (an internal redial or a hub-forced reconnect cycle). A
        // permanent close() already set `closed`; don't report a disconnect
        // for that path — it can race a caller that's already establishing a
        // fresh connection (e.g. background.ts swapping connections) and
        // stomp its state right after it reports "connected".
        if (!this.closed) this.opts.onStatus?.("disconnected");
        this.scheduleRedial();
      };
      ws.onerror = () => {
        /* a close follows; redial happens there */
      };
    } catch (e) {
      // Any synchronous throw from makeSocket/handler wiring (malformed
      // input, environment quirks, etc.) is the same failure class as the
      // invalid-port case above: no onclose ever gets wired, so we must
      // signal disconnected and redial ourselves rather than stranding the
      // caller's "connecting" guard.
      console.warn(`makeSocket threw during dial: ${String(e)}`);
      this.opts.onStatus?.("disconnected");
      this.scheduleRedial();
      return;
    }
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
        ...(this.opts.version ? { version: this.opts.version } : {}),
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
        this.connected = true;
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
