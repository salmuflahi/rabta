import { describe, expect, it } from "vitest";
import { HISTORY_LIMIT, pushLocation, type Location } from "./history";

const at = (view: Location["view"], selection: Location["selection"] = null): Location => ({
  view,
  selection,
});

describe("pushLocation", () => {
  it("pushes a new entry when the view changes", () => {
    const start = { history: [at("overview")], index: 0 };
    const next = pushLocation(start.history, start.index, at("capsules"));
    expect(next.history).toEqual([at("overview"), at("capsules")]);
    expect(next.index).toBe(1);
  });

  // The rule that makes Back usable: arrow-keying down a 40-row list must
  // not create 40 entries, but Back from another view must still land on
  // the row you were reading.
  it("rewrites in place when only the selection changes", () => {
    const start = { history: [at("overview"), at("capsules", "a")], index: 1 };
    const next = pushLocation(start.history, start.index, at("capsules", "b"));
    expect(next.history).toEqual([at("overview"), at("capsules", "b")]);
    expect(next.index).toBe(1);
  });

  it("discards forward entries on a new navigation", () => {
    const start = { history: [at("overview"), at("capsules"), at("projects")], index: 0 };
    const next = pushLocation(start.history, start.index, at("activity"));
    expect(next.history).toEqual([at("overview"), at("activity")]);
    expect(next.index).toBe(1);
  });

  it("drops the oldest entry past the cap and keeps the index on the newest", () => {
    const history: Location[] = [];
    let index = -1;
    // Alternate views so every step pushes rather than rewrites.
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) {
      const result = pushLocation(history, index, at(i % 2 ? "capsules" : "projects", i));
      history.length = 0;
      history.push(...result.history);
      index = result.index;
    }
    expect(history).toHaveLength(HISTORY_LIMIT);
    expect(index).toBe(HISTORY_LIMIT - 1);
    expect(history[index].selection).toBe(HISTORY_LIMIT + 9);
  });

  it("treats an empty history as a first visit", () => {
    const next = pushLocation([], -1, at("overview"));
    expect(next.history).toEqual([at("overview")]);
    expect(next.index).toBe(0);
  });
});
