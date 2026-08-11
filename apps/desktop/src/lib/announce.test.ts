import { beforeEach, describe, expect, it, vi } from "vitest";
import { announce, subscribeToAnnouncements } from "./announce";

describe("announce", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));

  it("delivers a polite message to subscribers", () => {
    const seen: Array<{ message: string; assertive: boolean }> = [];
    const stop = subscribeToAnnouncements((a) => seen.push(a));
    announce("Capsule captured");
    expect(seen).toEqual([{ message: "Capsule captured", assertive: false }]);
    stop();
  });

  it("marks assertive messages", () => {
    const seen: Array<{ assertive: boolean }> = [];
    const stop = subscribeToAnnouncements((a) => seen.push(a));
    announce("Chrome wants to connect", { assertive: true });
    expect(seen[0].assertive).toBe(true);
    stop();
  });

  // Screen readers ignore a live region whose text has not changed — the
  // same message twice must still be spoken twice.
  it("re-announces an identical message", () => {
    const seen: string[] = [];
    const stop = subscribeToAnnouncements((a) => seen.push(a.message));
    announce("Restored");
    announce("Restored");
    expect(seen).toHaveLength(2);
    stop();
  });

  it("stops delivering after unsubscribe", () => {
    const seen: string[] = [];
    const stop = subscribeToAnnouncements((a) => seen.push(a.message));
    stop();
    announce("ignored");
    expect(seen).toHaveLength(0);
  });
});
