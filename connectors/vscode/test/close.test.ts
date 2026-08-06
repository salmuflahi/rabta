import { describe, expect, it } from "vitest";
import { terminalCloseVerdict } from "../src/state";

describe("terminalCloseVerdict", () => {
  it("closes an idle terminal", () => {
    expect(terminalCloseVerdict({ busy: false })).toEqual({ close: true });
  });

  it("never closes a terminal running something", () => {
    // A running process is not in the capsule. Closing it destroys work that
    // nothing can restore — the one action in this design that could.
    expect(terminalCloseVerdict({ busy: true })).toEqual({
      close: false,
      reason: "running something",
    });
  });
});
