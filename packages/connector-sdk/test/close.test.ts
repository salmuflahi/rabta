import { afterEach, describe, expect, it, vi } from "vitest";

// Regression test for: close() must cancel a scheduled redial timer.
//
// node:fs's readFileSync is a non-configurable builtin export, so it can't
// be spied on directly with vi.spyOn — we replace the whole module via
// vi.mock (hoisted above these imports) so we can count real dial attempts.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});

import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Connector } from "../src/index";

const readSpy = vi.mocked(readFileSync);

// Uses a hub discovery file that never exists, so dial() always fails at the
// `readFileSync` step and falls straight into scheduleRedial() — no
// WebSocket is ever constructed on this path, so we don't need the Rust
// hub (or a socket server) to exercise the timer-cancellation bug at all.
describe("Connector.close() cancels a pending redial", () => {
  afterEach(() => {
    vi.useRealTimers();
    readSpy.mockClear();
  });

  it("stops attempting to dial once closed, even across the backoff window", () => {
    vi.useFakeTimers();

    const hubFile = join(tmpdir(), "omnibus-close-test-" + Date.now(), "hub.json");
    const connector = new Connector({
      name: "close-test",
      kind: "fake",
      capabilities: [],
      hubFile,
    });

    // start() calls the private dial() synchronously inside the Promise
    // executor. The hub file doesn't exist, so dial() throws, catches, and
    // arms a redial timer via scheduleRedial() before start() returns —
    // all before any fake-timer advancement, and without an `await`.
    connector.start().catch(() => {
      /* never resolves nor rejects on this path; avoid unhandled rejection noise */
    });

    expect(readSpy).toHaveBeenCalledTimes(1);

    // Close before the armed timer fires. The documented contract is
    // "close() = permanent, no reconnect" — the timer must never fire.
    connector.close();

    // Advance well past MAX_BACKOFF_MS (30s), covering many multiples of
    // the full backoff schedule. If close() failed to cancel the timer,
    // dial() would keep firing and re-reading the hub file on every
    // expired backoff step.
    vi.advanceTimersByTime(120_000);

    expect(readSpy).toHaveBeenCalledTimes(1);
  });
});
