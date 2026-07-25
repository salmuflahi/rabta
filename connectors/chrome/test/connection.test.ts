import { beforeEach, describe, expect, it, vi } from "vitest";
import { Connection, nativeSocket, type SocketLike, type TokenStore } from "../src/connection";

/** A fake socket the test drives directly. */
class FakeSocket implements SocketLike {
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((data: string) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.onclose?.();
  }
  // test helpers
  open() {
    this.onopen?.();
  }
  deliver(frame: object) {
    this.onmessage?.(JSON.stringify(frame));
  }
  lastKind() {
    return JSON.parse(this.sent[this.sent.length - 1]).kind;
  }
  lastPayload() {
    return JSON.parse(this.sent[this.sent.length - 1]).payload;
  }
}

class MemStore implements TokenStore {
  constructor(public value: string | null = null) {}
  async get() {
    return this.value;
  }
  async set(v: string) {
    this.value = v;
  }
  async remove() {
    this.value = null;
  }
}

function connectionWith(
  store: TokenStore,
  onStatus?: (s: "connecting" | "pairing" | "connected" | "denied" | "disconnected") => void,
) {
  const sockets: FakeSocket[] = [];
  const conn = new Connection({
    name: "chrome",
    kind: "chrome",
    capabilities: ["tabs"],
    port: 17872,
    makeSocket: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    store,
    onStatus,
    onCommand: (name, args) => ({ echoed: { name, args } }),
  });
  return { conn, sockets };
}

describe("Connection token lifecycle", () => {
  beforeEach(() => vi.useRealTimers());

  it("first run pairs, persists the token, then hellos with it", async () => {
    const store = new MemStore(null);
    const { conn, sockets } = connectionWith(store);
    conn.start();
    sockets[0].open();
    // The pair/hello decision depends on the async TokenStore.get() lookup,
    // which needs a microtask tick after onopen fires before it sends.
    await vi.waitFor(() => expect(sockets[0].sent.length).toBeGreaterThan(0));
    expect(sockets[0].lastKind()).toBe("pair");

    sockets[0].deliver({ v: 1, id: "p", kind: "paired", payload: { token: "tok-1" } });
    await vi.waitFor(() => expect(store.value).toBe("tok-1"));
    // reconnect (new socket) hellos with the stored token. The redial is
    // scheduled via setTimeout(…, INITIAL_BACKOFF) (1000ms), which sits right
    // at vi.waitFor's default 1000ms timeout, so give this one explicit
    // headroom instead of racing the boundary.
    await vi.waitFor(() => expect(sockets.length).toBe(2), { timeout: 3000 });
    sockets[1].open();
    // Same async-token-lookup gap as the first connect.
    await vi.waitFor(() => expect(sockets[1].sent.length).toBeGreaterThan(0));
    expect(sockets[1].lastKind()).toBe("hello");
    expect(sockets[1].lastPayload().token).toBe("tok-1");
  });

  it("with a stored token, hellos immediately (no pair)", async () => {
    const { conn, sockets } = connectionWith(new MemStore("tok-existing"));
    conn.start();
    sockets[0].open();
    // Same async-token-lookup gap as above.
    await vi.waitFor(() => expect(sockets[0].sent.length).toBeGreaterThan(0));
    expect(sockets[0].lastKind()).toBe("hello");
    expect(sockets[0].lastPayload().token).toBe("tok-existing");
  });

  it("reports its own version in the hello payload when configured", async () => {
    const sockets: FakeSocket[] = [];
    const conn = new Connection({
      name: "chrome",
      kind: "chrome",
      capabilities: ["tabs"],
      port: 17872,
      version: "2.0.0",
      makeSocket: () => {
        const s = new FakeSocket();
        sockets.push(s);
        return s;
      },
      store: new MemStore("tok-existing"),
      onCommand: () => ({}),
    });
    conn.start();
    sockets[0].open();
    await vi.waitFor(() => expect(sockets[0].sent.length).toBeGreaterThan(0));
    expect(sockets[0].lastKind()).toBe("hello");
    expect(sockets[0].lastPayload().version).toBe("2.0.0");
  });

  it("auth_failed clears the token and falls back to pairing", async () => {
    const store = new MemStore("stale");
    const { conn, sockets } = connectionWith(store);
    conn.start();
    sockets[0].open();
    // Same async-token-lookup gap as above.
    await vi.waitFor(() => expect(sockets[0].sent.length).toBeGreaterThan(0));
    expect(sockets[0].lastKind()).toBe("hello");
    sockets[0].deliver({ v: 1, id: "e", kind: "error", payload: { code: "auth_failed", message: "no" } });
    await vi.waitFor(() => expect(store.value).toBeNull());
    // Same 1000ms backoff-vs-default-timeout boundary as above.
    await vi.waitFor(() => expect(sockets.length).toBe(2), { timeout: 3000 });
    sockets[1].open();
    // Same async-token-lookup gap as the first connect.
    await vi.waitFor(() => expect(sockets[1].sent.length).toBeGreaterThan(0));
    expect(sockets[1].lastKind()).toBe("pair");
  });

  it("answers ping with pong and dispatches commands", async () => {
    const { conn, sockets } = connectionWith(new MemStore("t"));
    conn.start();
    sockets[0].open();
    sockets[0].deliver({ v: 1, id: "w", kind: "welcome", payload: { connectorId: "c1" } });
    sockets[0].deliver({ v: 1, id: "pi", kind: "ping", payload: {} });
    expect(sockets[0].lastKind()).toBe("pong");
    sockets[0].deliver({
      v: 1,
      id: "cmd1",
      kind: "command",
      payload: { target: "c1", name: "tabs.open", args: { url: "https://x.test" } },
    });
    await vi.waitFor(() => expect(sockets[0].lastKind()).toBe("response"));
    const resp = sockets[0].lastPayload();
    expect(resp.requestId).toBe("cmd1");
    expect(resp.ok).toBe(true);
    expect(resp.result).toEqual({ echoed: { name: "tabs.open", args: { url: "https://x.test" } } });
  });

  it("close() during backoff cancels the pending redial", async () => {
    vi.useFakeTimers();
    try {
      const { conn, sockets } = connectionWith(new MemStore("t"));
      conn.start();
      // let the async dial() create the first socket
      await vi.waitFor(() => expect(sockets.length).toBe(1), { timeout: 100 });
      sockets[0].open();
      sockets[0].close(); // drop → schedules a redial (backoff ~1s)
      conn.close(); // must cancel that scheduled redial
      await vi.advanceTimersByTimeAsync(60_000);
      expect(sockets.length).toBe(1); // no second socket ever created
    } finally {
      vi.useRealTimers();
    }
  });

  it('emits onStatus("disconnected") when the socket drops', async () => {
    const statuses: string[] = [];
    const { conn, sockets } = connectionWith(new MemStore("t"), (s) => statuses.push(s));
    conn.start();
    sockets[0].open();
    sockets[0].deliver({ v: 1, id: "w", kind: "welcome", payload: { connectorId: "c1" } });
    expect(statuses).toEqual(["connected"]);

    sockets[0].close(); // simulate the socket dropping (not an explicit conn.close())

    expect(statuses).toEqual(["connected", "disconnected"]);
  });

  it('does not emit "disconnected" for an explicit close() (permanent, no reconnect)', async () => {
    const statuses: string[] = [];
    const { conn, sockets } = connectionWith(new MemStore("t"), (s) => statuses.push(s));
    conn.start();
    sockets[0].open();
    sockets[0].deliver({ v: 1, id: "w", kind: "welcome", payload: { connectorId: "c1" } });
    statuses.length = 0;

    conn.close(); // internally closes the socket too, but this is permanent

    expect(statuses).toEqual([]);
  });

  it("invalid port does not throw and schedules a retry while firing disconnected", async () => {
    vi.useFakeTimers();
    try {
      const statuses: string[] = [];
      const makeSocket = vi.fn(() => new FakeSocket());
      const conn = new Connection({
        name: "chrome",
        kind: "chrome",
        capabilities: ["tabs"],
        port: NaN,
        makeSocket,
        store: new MemStore("t"),
        onStatus: (s) => statuses.push(s),
        onCommand: () => undefined,
      });

      expect(() => conn.start()).not.toThrow();
      await vi.waitFor(() => expect(statuses).toEqual(["disconnected"]));
      expect(makeSocket).not.toHaveBeenCalled();

      // Advance past the backoff: the redial loop should still be alive
      // (dial() re-runs, hits the same invalid-port guard, and fires
      // "disconnected" again) rather than having died silently.
      await vi.advanceTimersByTimeAsync(2_000);
      expect(statuses).toEqual(["disconnected", "disconnected"]);
      expect(makeSocket).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("makeSocket throwing synchronously is treated as a failed dial", async () => {
    vi.useFakeTimers();
    try {
      const statuses: string[] = [];
      let calls = 0;
      const makeSocket = vi.fn(() => {
        calls++;
        if (calls === 1) throw new Error("boom");
        return new FakeSocket();
      });
      const conn = new Connection({
        name: "chrome",
        kind: "chrome",
        capabilities: ["tabs"],
        port: 17872,
        makeSocket,
        store: new MemStore("t"),
        onStatus: (s) => statuses.push(s),
        onCommand: () => undefined,
      });

      expect(() => conn.start()).not.toThrow();
      await vi.waitFor(() => expect(statuses).toEqual(["disconnected"]));
      expect(makeSocket).toHaveBeenCalledTimes(1);

      // The scheduled redial should retry and succeed the second time.
      await vi.advanceTimersByTimeAsync(2_000);
      expect(makeSocket).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

/** A fake *native* WebSocket constructor — fires onmessage with a
 * MessageEvent-like `{ data }` object, not a raw string, matching what a
 * real browser WebSocket does. Used to prove nativeSocket() adapts it to
 * SocketLike's `onmessage(data: string)` contract without a real browser. */
class FakeNativeWebSocket {
  static instances: FakeNativeWebSocket[] = [];
  sent: string[] = [];
  closed = false;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  constructor(public url: string) {
    FakeNativeWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
  }
}

describe("nativeSocket adapter", () => {
  beforeEach(() => {
    FakeNativeWebSocket.instances = [];
  });

  it("translates a MessageEvent-shaped onmessage into a raw string", () => {
    const sock = nativeSocket("ws://x", FakeNativeWebSocket as never);
    const raw = FakeNativeWebSocket.instances[0];
    const received: unknown[] = [];
    sock.onmessage = (data) => received.push(data);

    // Simulate what a real browser WebSocket does: onmessage fires with a
    // MessageEvent whose JSON string payload is on `.data`.
    raw.onmessage?.({ data: '{"v":1,"id":"m1","kind":"welcome","payload":{}}' });

    expect(received).toHaveLength(1);
    expect(typeof received[0]).toBe("string");
    expect(received[0]).toBe('{"v":1,"id":"m1","kind":"welcome","payload":{}}');
  });

  it("forwards onopen and onclose", () => {
    const sock = nativeSocket("ws://x", FakeNativeWebSocket as never);
    const raw = FakeNativeWebSocket.instances[0];
    let opened = false;
    let closed = false;
    sock.onopen = () => (opened = true);
    sock.onclose = () => (closed = true);

    raw.onopen?.(undefined);
    raw.onclose?.(undefined);

    expect(opened).toBe(true);
    expect(closed).toBe(true);
  });

  it("delegates send() and close() to the raw socket", () => {
    const sock = nativeSocket("ws://x", FakeNativeWebSocket as never);
    const raw = FakeNativeWebSocket.instances[0];

    sock.send('{"kind":"pair"}');
    sock.close();

    expect(raw.sent).toEqual(['{"kind":"pair"}']);
    expect(raw.closed).toBe(true);
  });

  it("stringifies non-string message payloads defensively", () => {
    const sock = nativeSocket("ws://x", FakeNativeWebSocket as never);
    const raw = FakeNativeWebSocket.instances[0];
    const received: unknown[] = [];
    sock.onmessage = (data) => received.push(data);

    raw.onmessage?.({ data: 42 });

    expect(received).toEqual(["42"]);
  });
});
