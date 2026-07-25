import { afterEach, describe, expect, it, vi } from "vitest";

// Same module-mock rationale as auth.test.ts: replace node:fs so we control
// hub.json, and script `ws` — here to CAPTURE the hello frame the SDK sends
// and reply with a welcome so start() resolves.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});

const wsState = vi.hoisted(() => ({ sent: [] as Array<Record<string, unknown>> }));

vi.mock("ws", async () => {
  const { EventEmitter } = await import("node:events");

  class FakeWebSocket extends EventEmitter {
    static readonly OPEN = 1;
    readyState = FakeWebSocket.OPEN;

    constructor(public url: string) {
      super();
      queueMicrotask(() => this.emit("open"));
    }

    send(data: string): void {
      const frame = JSON.parse(data) as Record<string, unknown>;
      wsState.sent.push(frame);
      if (frame.kind === "hello") {
        queueMicrotask(() =>
          this.emit(
            "message",
            JSON.stringify({ v: 1, id: "w", kind: "welcome", payload: { connectorId: "c1" } })
          )
        );
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
const helloPayload = () =>
  (wsState.sent.find((f) => f.kind === "hello")?.payload ?? {}) as Record<string, unknown>;

describe("hello reports the connector's own version", () => {
  afterEach(() => {
    readSpy.mockReset();
    wsState.sent.length = 0;
  });

  it("includes version in the hello payload when the connector provides one", async () => {
    readSpy.mockReturnValue(JSON.stringify({ port: 4242, secret: "s" }));
    const connector = new Connector({
      name: "v",
      kind: "fake",
      capabilities: [],
      version: "0.4.2",
      hubFile: join(tmpdir(), `omnibus-ver-a-${Date.now()}`, "hub.json"),
    });
    await connector.start();
    connector.close();
    expect(helloPayload().version).toBe("0.4.2");
  });

  it("omits version entirely when the connector provides none", async () => {
    readSpy.mockReturnValue(JSON.stringify({ port: 4242, secret: "s" }));
    const connector = new Connector({
      name: "v",
      kind: "fake",
      capabilities: [],
      hubFile: join(tmpdir(), `omnibus-ver-b-${Date.now()}`, "hub.json"),
    });
    await connector.start();
    connector.close();
    expect(helloPayload()).not.toHaveProperty("version");
  });
});
