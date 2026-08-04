import { describe, expect, it } from "vitest";
import { stateFrom } from "../src/popup-state";

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
