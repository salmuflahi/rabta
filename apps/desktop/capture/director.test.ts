import { describe, expect, it } from "vitest";
import { DEMO_TIMELINES, parseCaptureMode, parseCaptureRegion } from "./director";

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

  it("keeps the cues where the site's loops cut", () => {
    const at = (demo: keyof typeof DEMO_TIMELINES, action: string) =>
      DEMO_TIMELINES[demo].cues.find((c) => c.action === action)?.atMs;
    // A 700ms push starting at 300ms lands on the click frame.
    expect(at("hero-return", "save-state")).toBe(1000);
    expect(at("capture", "save-state")).toBe(1000);
    // Shot A of the hero is a 3s tilted take before the Overview switch; the
    // sheet must be up before shot C's footage begins at 4.45s.
    expect(at("hero-return", "leave-task")).toBe(3000);
    expect(at("hero-return", "resume-task")).toBe(4300);
    expect(at("leave", "leave-task")).toBe(900);
    expect(at("return", "resume-task")).toBe(900);
  });

  it("reads the recording region off the hash, defaulting to the app", () => {
    expect(parseCaptureRegion("#demo=return")).toBe("app");
    expect(parseCaptureRegion("#demo=return&region=sheet")).toBe("sheet");
    expect(parseCaptureRegion("#region=sheet&demo=hero-return")).toBe("sheet");
    expect(parseCaptureRegion("#demo=return&region=sheets")).toBe("app");
  });
});
