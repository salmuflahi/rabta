import { describe, expect, it } from "vitest";
import { nextState, stateFrom } from "../src/popup-state";

/* The popup used to read the pairing token off disk and call that "paired".
   A token is a fact about storage, not about the socket — so the old popup
   said "paired" with the hub closed, which is precisely the situation a
   confused user is in when they open it. These pin the distinction. */

const base = { connected: false, connecting: false, paired: false, port: 17872 };

describe("popup state", () => {
  it("reports connected only when the socket is actually up", () => {
    expect(stateFrom({ ...base, connected: true, paired: true })).toBe("connected");
  });

  it("does not call a stored token a connection", () => {
    // The exact case the old popup got wrong: paired on disk, hub not running.
    expect(stateFrom({ ...base, paired: true, connected: false })).toBe("offline");
  });

  it("distinguishes never-paired from paired-but-offline", () => {
    expect(stateFrom({ ...base, paired: false })).toBe("unpaired");
    expect(stateFrom({ ...base, paired: true })).toBe("offline");
  });

  it("shows pairing only while a first pairing is in flight", () => {
    expect(stateFrom({ ...base, paired: false, connecting: true })).toBe("pairing");
    // Reconnecting an already-paired browser is not a pairing prompt.
    expect(stateFrom({ ...base, paired: true, connecting: true })).toBe("offline");
  });

  it("prefers the live connection over every other signal", () => {
    expect(
      stateFrom({ connected: true, connecting: true, paired: false, port: 1 }),
    ).toBe("connected");
  });
});

/* Loaded unpacked against a running hub, the popup showed "Not paired yet"
   while the worker was three seconds into a pairing — because it read the
   worker once, at the instant the popup opened, which is the instant the worker
   is still waking up. These pin the reading, not just the mapping. */

describe("what one reading shows", () => {
  it("takes a real answer over whatever is on screen", () => {
    const pairing = { ...base, connecting: true };
    expect(nextState(pairing, "offline")).toBe("pairing");
  });

  it("does not invent an outage when a single reply goes missing", () => {
    // The worker sleeps between messages; one dropped reply is not an outage.
    expect(nextState(undefined, "connected")).toBe("connected");
    expect(nextState(undefined, "pairing")).toBe("pairing");
  });

  it("treats silence as offline only before it has ever had an answer", () => {
    expect(nextState(undefined, null)).toBe("offline");
  });

  it("follows the worker from waking to paired to connected", () => {
    // The exact sequence a first-run browser walks through while the popup is
    // open — every step of which the read-once popup used to miss.
    let shown: ReturnType<typeof nextState> | null = null;
    const seen = [
      undefined, // worker still waking
      { ...base, connecting: true }, // dialing, no token yet
      { ...base, connecting: true, paired: true }, // approved in Rabta
      { ...base, connected: true, paired: true }, // socket up
    ].map((status) => (shown = nextState(status, shown)));

    expect(seen).toEqual(["offline", "pairing", "offline", "connected"]);
  });
});
