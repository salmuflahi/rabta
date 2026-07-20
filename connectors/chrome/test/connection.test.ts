import { beforeEach, describe, expect, it, vi } from "vitest";
import { Connection, type SocketLike, type TokenStore } from "../src/connection";

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

function connectionWith(store: TokenStore) {
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
});
