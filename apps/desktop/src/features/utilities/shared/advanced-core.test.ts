import { describe, expect, it } from "vitest";
import {
  calendarExport,
  diffLines,
  parsePlan,
  parseTimestamp,
  quizOptions,
  scheduledInstant,
  studyCards,
  validatePost,
  type PlannedPost,
} from "./advanced-core";
import { TOOLS } from "./catalog";
import { MODES, modeTools } from "./modes";

describe("Line comparison", () => {
  it("preserves duplicate lines and both sides of a replacement", () => {
    const result = diffLines("one\nsame\nsame\nold", "one\nsame\nnew\nsame");
    expect(
      result
        .filter((x) => x.kind !== "add")
        .map((x) => x.text)
        .join("\n"),
    ).toBe("one\nsame\nsame\nold");
    expect(
      result
        .filter((x) => x.kind !== "remove")
        .map((x) => x.text)
        .join("\n"),
    ).toBe("one\nsame\nnew\nsame");
    expect(result.filter((x) => x.kind === "add").map((x) => x.text)).toEqual([
      "new",
    ]);
    expect(
      result.filter((x) => x.kind === "remove").map((x) => x.text),
    ).toEqual(["old"]);
  });
  it("distinguishes empty content and trailing newline but normalizes CRLF", () => {
    expect(diffLines("", "")).toEqual([]);
    expect(diffLines("a\r\n", "a\n").every((x) => x.kind === "same")).toBe(
      true,
    );
    expect(diffLines("a", "a\n").at(-1)).toEqual({ kind: "add", text: "" });
  });
  it("bounds work before allocating the comparison matrix", () => {
    expect(() => diffLines("x\n".repeat(1501), "y")).toThrow("1,500");
    expect(() => diffLines("x".repeat(500001), "")).toThrow("500,000");
  });
});
describe("Timestamps and scheduling", () => {
  it("treats units explicitly and accepts negative epochs", () => {
    expect(parseTimestamp("1000", "seconds").getTime()).toBe(1000000);
    expect(parseTimestamp("1000", "milliseconds").getTime()).toBe(1000);
    expect(parseTimestamp("-1", "seconds").toISOString()).toBe(
      "1969-12-31T23:59:59.000Z",
    );
    expect(
      parseTimestamp("2026-09-09T14:30:00-04:00", "ISO").toISOString(),
    ).toBe("2026-09-09T18:30:00.000Z");
  });
  it("rejects missing offsets, rollovers and unsafe numeric input", () => {
    expect(() => parseTimestamp("2026-09-09T14:30", "ISO")).toThrow("timezone");
    expect(() => parseTimestamp("2026-02-30T00:00:00Z", "ISO")).toThrow(
      "does not exist",
    );
    expect(() => parseTimestamp("2026-09-09T24:00:00Z", "ISO")).toThrow();
    expect(() => parseTimestamp("9007199254740992", "milliseconds")).toThrow(
      "precision",
    );
    expect(() => parseTimestamp("1e3", "seconds")).toThrow("whole");
  });
  it("resolves fractional timezone offsets and observes summer/winter offsets", () => {
    expect(scheduledInstant("2026-09-09 12:00", "Asia/Kathmandu")).toBe(
      "2026-09-09T06:15:00.000Z",
    );
    expect(scheduledInstant("2026-07-01 12:00", "America/New_York")).toBe(
      "2026-07-01T16:00:00.000Z",
    );
    expect(scheduledInstant("2026-01-01 12:00", "America/New_York")).toBe(
      "2026-01-01T17:00:00.000Z",
    );
  });
  it("rejects skipped and repeated DST wall times instead of silently shifting them", () => {
    expect(() =>
      scheduledInstant("2026-03-08 02:30", "America/New_York"),
    ).toThrow("skipped");
    expect(() =>
      scheduledInstant("2026-11-01 01:30", "America/New_York"),
    ).toThrow("twice");
    expect(() =>
      scheduledInstant("2026-10-04 02:15", "Australia/Lord_Howe"),
    ).toThrow("skipped");
    expect(() => scheduledInstant("2026-09-09 12:00", "Fake/Zone")).toThrow(
      "valid timezone",
    );
  });
});
describe("Study cards", () => {
  it("derives definitions and cloze answers only from source notes", () => {
    const cards = studyCards(
      "# Biology\nCell: The basic unit of life.\nWater evaporates when it absorbs enough energy.\nCell: The basic unit of life.",
    );
    expect(cards).toHaveLength(2);
    expect(cards[0]).toEqual({
      question: "Explain: Cell",
      answer: "The basic unit of life.",
      source: "Cell: The basic unit of life.",
    });
    expect(cards[1].source).toContain(cards[1].answer);
    expect(cards[1].question).toContain("_____");
    expect(quizOptions(cards, 0)).toContain(cards[0].answer);
  });
  it("handles Unicode notes, invalid input and bounded decks", () => {
    expect(studyCards("الخلية: الوحدة الأساسية للحياة")[0].answer).toBe(
      "الوحدة الأساسية للحياة",
    );
    expect(() => studyCards("\n# heading\n")).toThrow("term and definition");
    expect(
      studyCards(
        Array.from(
          { length: 120 },
          (_, i) => `Term ${i}: Definition ${i}`,
        ).join("\n"),
      ),
    ).toHaveLength(100);
    expect(() => studyCards("x".repeat(50001))).toThrow("50,000");
  });
  it("does not manufacture distractors when a deck has only one answer", () => {
    const cards = studyCards("A: Same answer.\nB: Same answer.");
    expect(quizOptions(cards, 1)).toEqual(["Same answer."]);
  });
});
const post: PlannedPost = {
  id: "post-1",
  title: "Rabta launch",
  channel: "Instagram",
  caption: "Keep a useful draft.",
  wallTime: "2026-09-15 14:30",
  timezone: "America/New_York",
  instant: "",
};
describe("Content plan export and recovery", () => {
  it("exports UTC instants with stable identity, alarms and explicit reminder wording", () => {
    const calendar = calendarExport([post], "2026-09-09T12:00:00Z");
    expect(calendar).toContain("UID:post-1@rabta.local\r\n");
    expect(calendar).toContain("DTSTART:20260915T183000Z\r\n");
    expect(calendar).toContain("TRIGGER:-PT15M");
    expect(calendar.replace(/\r\n /g, "")).toContain(
      "Rabta reminder only. Publish the post yourself.",
    );
  });
  it("escapes calendar injection and folds Unicode lines by octets", () => {
    const calendar = calendarExport(
      [{ ...post, title: "A, B; C\nBEGIN:VEVENT", caption: "😀".repeat(200) }],
      "2026-09-09T12:00:00Z",
    );
    expect(
      calendar.split("\r\n").filter((line) => line === "BEGIN:VEVENT"),
    ).toHaveLength(1);
    expect(calendar).toContain("A\\, B\\; C\\nBEGIN:VEVENT");
    expect(
      calendar
        .split("\r\n")
        .every((line) => new TextEncoder().encode(line).length <= 75),
    ).toBe(true);
    expect(calendar.replace(/\r\n /g, "")).toContain("😀".repeat(200));
  });
  it("rejects damaged saved records and invalid schedules without overwriting them", () => {
    expect(parsePlan(null)).toEqual([]);
    expect(parsePlan(JSON.stringify([post]))[0].instant).toBe(
      "2026-09-15T18:30:00.000Z",
    );
    expect(() => parsePlan("invalid")).toThrow();
    expect(() => parsePlan('[{"title":"Draft"}]')).toThrow("unreadable");
    expect(() => parsePlan(JSON.stringify([post, post]))).toThrow("duplicate");
    expect(() => validatePost({ ...post, title: " " })).toThrow("title");
    expect(() => calendarExport([])).toThrow("draft");
  });
});
it("every mode recommends unique real tools while the full catalog remains available", () => {
  expect(TOOLS).toHaveLength(28);
  for (const mode of MODES) {
    const ids = modeTools(mode).map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(0);
  }
});
