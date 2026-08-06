import { describe, expect, it } from "vitest";
import { fileClosePlan, terminalCloseVerdict } from "../src/state";

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

describe("fileClosePlan", () => {
  it("keeps a path that is not open in any tab", () => {
    expect(fileClosePlan([])).toEqual({ close: false, reason: "no longer open" });
  });

  it("closes a single clean tab", () => {
    expect(fileClosePlan([{ isDirty: false }])).toEqual({ close: true });
  });

  it("closes every tab when a path is open in several clean copies", () => {
    // An ordinary split view: the same path open in three tabs at once.
    // All three are clean, so all three must close together.
    expect(fileClosePlan([{ isDirty: false }, { isDirty: false }, { isDirty: false }])).toEqual({
      close: true,
    });
  });

  it("closes nothing when one of several copies is dirty", () => {
    // The motivating bug: closing the clean copy while a dirty copy stays
    // open, then reporting the file closed, would destroy the guarantee
    // that unsaved work is never silently abandoned.
    expect(fileClosePlan([{ isDirty: false }, { isDirty: true }])).toEqual({
      close: false,
      reason: "unsaved changes",
    });
  });

  it("keeps a path where every open copy is dirty", () => {
    expect(fileClosePlan([{ isDirty: true }, { isDirty: true }])).toEqual({
      close: false,
      reason: "unsaved changes",
    });
  });
});
