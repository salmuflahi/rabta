import { afterEach, describe, expect, it, vi } from "vitest";

// Regression test for: a malformed hub.json (missing/non-numeric/zero port)
// must not throw synchronously out of dial() — it should be treated exactly
// like a failed discovery read (log + scheduleRedial), not crash the
// reconnect loop.
//
// Same rationale as close.test.ts/auth.test.ts: node:fs's readFileSync is a
// non-configurable builtin export, so we replace the whole module via
// vi.mock (hoisted above these imports) to control hub.json's contents and
// count dial attempts.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});

import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Connector } from "../src/index";

const readSpy = vi.mocked(readFileSync);

describe("malformed hub.json port is handled like a failed discovery read", () => {
  afterEach(() => {
    vi.useRealTimers();
    readSpy.mockReset();
  });

  it("does not throw when port is non-numeric, and schedules a redial", () => {
    vi.useFakeTimers();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const hubFile = join(tmpdir(), "omnibus-bad-port-test-" + Date.now(), "hub.json");
    readSpy.mockReturnValue(JSON.stringify({ port: "nope", secret: "s" }));

    const connector = new Connector({
      name: "bad-port-test",
      kind: "fake",
      capabilities: [],
      hubFile,
    });

    // Must not throw synchronously out of start()/dial() — this is the bug:
    // `new WebSocket("ws://127.0.0.1:undefined")` would throw here.
    expect(() => {
      connector.start().catch(() => {
        /* never resolves nor rejects on this path; avoid unhandled rejection noise */
      });
    }).not.toThrow();

    expect(readSpy).toHaveBeenCalledTimes(1);

    // A redial must be scheduled (same as a bad/missing file): advancing past
    // the initial backoff causes another read attempt.
    vi.advanceTimersByTime(2_000);
    expect(readSpy).toHaveBeenCalledTimes(2);

    errSpy.mockRestore();
  });

  it("does not throw when port is missing entirely, and schedules a redial", () => {
    vi.useFakeTimers();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const hubFile = join(tmpdir(), "omnibus-bad-port-test-" + Date.now(), "hub.json");
    readSpy.mockReturnValue(JSON.stringify({ secret: "s" }));

    const connector = new Connector({
      name: "bad-port-test-2",
      kind: "fake",
      capabilities: [],
      hubFile,
    });

    expect(() => {
      connector.start().catch(() => {
        /* never resolves nor rejects on this path */
      });
    }).not.toThrow();

    expect(readSpy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2_000);
    expect(readSpy).toHaveBeenCalledTimes(2);

    errSpy.mockRestore();
  });

  it("does not throw when port is zero, and schedules a redial", () => {
    vi.useFakeTimers();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const hubFile = join(tmpdir(), "omnibus-bad-port-test-" + Date.now(), "hub.json");
    readSpy.mockReturnValue(JSON.stringify({ port: 0, secret: "s" }));

    const connector = new Connector({
      name: "bad-port-test-3",
      kind: "fake",
      capabilities: [],
      hubFile,
    });

    expect(() => {
      connector.start().catch(() => {
        /* never resolves nor rejects on this path */
      });
    }).not.toThrow();

    expect(readSpy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2_000);
    expect(readSpy).toHaveBeenCalledTimes(2);

    errSpy.mockRestore();
  });
});
