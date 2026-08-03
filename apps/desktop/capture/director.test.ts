import { describe, expect, it } from "vitest";
import { DEMO_TIMELINES, parseCaptureMode } from "./director";

describe("capture director", () => {
  it("keeps static screenshots and demos explicit", () => {
    expect(parseCaptureMode("#capture=restore")).toEqual({
      kind: "screen",
      name: "restore",
    });
    expect(parseCaptureMode("#demo=hero-return")).toEqual({
      kind: "demo",
      name: "hero-return",
    });
    expect(parseCaptureMode("#demo=honest-return")).toEqual({
      kind: "demo",
      name: "honest-return",
    });
  });

  it("locks the approved durations and truthful final state", () => {
    expect(DEMO_TIMELINES["hero-return"].durationMs).toBe(8000);
    expect(DEMO_TIMELINES["honest-return"].durationMs).toBe(5000);
    expect(DEMO_TIMELINES["honest-return"].finalLabel).toBe(
      "Workspace partially restored",
    );
  });
});
