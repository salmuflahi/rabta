import { afterEach, describe, expect, it, vi } from "vitest";

// Regression test for spec success criterion 6: a wrong secret must be
// fatal — the SDK surfaces `auth_failed` and never redials, rather than
// hammering the hub forever with the same bad credentials.
//
// Same rationale as close.test.ts: node:fs's readFileSync is a
// non-configurable builtin export, so we replace the whole module via
// vi.mock (hoisted above these imports) to control hub.json's contents and
// count dial attempts.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});

// `ws` is scripted: it responds to any `hello` frame with an `auth_failed`
// error frame and then closes, and records every constructed instance so
// the test can assert exactly one dial ever happened.
const wsState = vi.hoisted(() => ({ instances: [] as unknown[] }));

vi.mock("ws", async () => {
  const { EventEmitter } = await import("node:events");

  class FakeWebSocket extends EventEmitter {
    static readonly OPEN = 1;
    readyState = FakeWebSocket.OPEN;

    constructor(public url: string) {
      super();
      wsState.instances.push(this);
      // Defer past the synchronous `.on(...)` registrations dial() does
      // right after constructing the socket — a real WebSocket's "open"
      // is always async too.
      queueMicrotask(() => this.emit("open"));
    }

    send(data: string): void {
      const frame = JSON.parse(data) as { kind: string };
      if (frame.kind === "hello") {
        queueMicrotask(() => {
          this.emit(
            "message",
            JSON.stringify({
              v: 1,
              id: "e",
              kind: "error",
              payload: { code: "auth_failed", message: "invalid credentials" },
            })
          );
          this.emit("close");
        });
      }
    }

    close(): void {
      this.emit("close");
    }
  }

  return { default: FakeWebSocket };
});

import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Connector } from "../src/index";

const readSpy = vi.mocked(readFileSync);

describe("auth_failed is fatal", () => {
  afterEach(() => {
    vi.useRealTimers();
    readSpy.mockReset();
    wsState.instances.length = 0;
  });

  it("rejects start() and never dials again, even across the backoff window", async () => {
    vi.useFakeTimers();

    const hubFile = join(tmpdir(), "omnibus-auth-test-" + Date.now(), "hub.json");
    readSpy.mockReturnValue(JSON.stringify({ port: 4242, secret: "wrong" }));

    const connector = new Connector({
      name: "auth-test",
      kind: "fake",
      capabilities: [],
      hubFile,
    });

    // start() must reject once the hub replies auth_failed to our hello.
    await expect(connector.start()).rejects.toThrow(/credentials/);

    expect(wsState.instances).toHaveLength(1);
    expect(readSpy).toHaveBeenCalledTimes(1);

    // Advance well past MAX_BACKOFF_MS (30s) — spanning several multiples
    // of the full backoff schedule. If the SDK failed to mark itself
    // closed on auth_failed, scheduleRedial() would still arm a timer and
    // a second WebSocket/dial would appear here.
    vi.advanceTimersByTime(120_000);

    expect(wsState.instances).toHaveLength(1);
    expect(readSpy).toHaveBeenCalledTimes(1);
  });
});
