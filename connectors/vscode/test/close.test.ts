import { describe, expect, it } from "vitest";
import { fileClosePlan, terminalClosePlan, terminalCloseVerdict } from "../src/state";

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

describe("terminalClosePlan", () => {
  it("keeps an identity with no matching terminals", () => {
    expect(terminalClosePlan([])).toEqual({ close: false, reason: "no longer open" });
  });

  it("disposes a single idle terminal", () => {
    expect(terminalClosePlan([{ busy: false }])).toEqual({ close: true });
  });

  it("disposes every terminal when several share one name+cwd identity and all are idle", () => {
    // Two shells named "zsh" in the same folder are the same identity per
    // phase 1's rule, so both must go together.
    expect(terminalClosePlan([{ busy: false }, { busy: false }, { busy: false }])).toEqual({
      close: true,
    });
  });

  it("disposes nothing when one of several matches is busy", () => {
    // The motivating bug: disposing the idle one while a busy duplicate
    // keeps running, then reporting the identity closed, would silently
    // kill unrelated shells while claiming success on the one running
    // something — the same false-report shape fileClosePlan already guards
    // against for a dirty split-view copy.
    expect(terminalClosePlan([{ busy: false }, { busy: true }])).toEqual({
      close: false,
      reason: "running something",
    });
  });

  it("keeps an identity where every match is busy", () => {
    expect(terminalClosePlan([{ busy: true }, { busy: true }])).toEqual({
      close: false,
      reason: "running something",
    });
  });
});
