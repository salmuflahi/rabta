import { describe, expect, it } from "vitest";
import type { TeamEntry, TeamMember } from "./client";
import { acknowledgements, handoffAnswer, initials, nextLamport, orderEntries, PERSON_COLORS, personColor, placeLabel, taskIdFor, threadMarkdown, waitingFor } from "./thread";

const members: TeamMember[] = [
  { id: "sam", displayName: "Sam Al", role: "owner", status: "working", lastSeenAt: null },
  { id: "alina", displayName: "Alina", role: "member", status: "working", lastSeenAt: null },
];
const entry = (over: Partial<TeamEntry>): TeamEntry => ({ hash: "h", seq: 1, task: "t", author: "sam", lamport: 1, kind: "knot", text: "", place: null, snapshot: null, target: null, to: null, parents: [], prev: null, createdAt: "2026-09-10T10:00:00Z", ...over });

describe("thread helpers", () => {
  it("gives every member a stable colour that is never ember", () => {
    expect(personColor("alina", members)).toBe(PERSON_COLORS[0]);
    expect(personColor("sam", members)).toBe(PERSON_COLORS[1]);
    expect(personColor("sam", [...members].reverse())).toBe(PERSON_COLORS[1]);
    expect(PERSON_COLORS).not.toContain("#FF6B2C");
    expect(personColor("gone", members)).toBe(PERSON_COLORS[2]);
  });
  it("orders by lamport, then author, then sequence, and knows the next clock", () => {
    const entries = [entry({ hash: "c", lamport: 2, author: "sam", seq: 3 }), entry({ hash: "b", lamport: 2, author: "alina", seq: 4 }), entry({ hash: "a", lamport: 1, seq: 9 })];
    expect(orderEntries(entries).map(e => e.hash)).toEqual(["a", "b", "c"]);
    expect(nextLamport(entries)).toBe(2);
    expect(nextLamport([])).toBe(0);
  });
  it("labels places without leaking credentials or noise", () => {
    expect(placeLabel({ type: "file", path: "src/a.ts", line: 12 })).toBe("src/a.ts:12");
    expect(placeLabel({ type: "folder", path: "packages/sdk" })).toBe("packages/sdk/");
    expect(placeLabel({ type: "link", url: "https://example.com/docs/x" })).toBe("example.com/docs/x");
    expect(placeLabel({ type: "commit", sha: "abcdef1234567" })).toBe("abcdef1");
    expect(placeLabel({ type: "file", path: "x", label: "The reconnect" })).toBe("The reconnect");
    expect(placeLabel(null)).toBe("");
  });
  it("derives initials, task ids and relative times", () => {
    expect(initials("Sam Al")).toBe("SA");
    expect(initials("alina")).toBe("AL");
    expect(initials("")).toBe("?");
    expect(taskIdFor("Wire the reconnect: v2!")).toBe("Wire-the-reconnect-v2");
    expect(taskIdFor("!!!")).toBe("task");
    const now = Date.parse("2026-09-10T12:00:00Z");
    expect(waitingFor(entry({ createdAt: "2026-09-10T11:59:50Z" }), now)).toBe("just now");
    expect(waitingFor(entry({ createdAt: "2026-09-10T11:30:00Z" }), now)).toBe("30 min");
    expect(waitingFor(entry({ createdAt: "2026-09-10T09:00:00Z" }), now)).toBe("3 h");
    expect(waitingFor(entry({ createdAt: "2026-09-01T09:00:00Z" }), now)).toBe("9 d");
  });
  it("exports the thread as Markdown with acknowledgements and hand-off answers", () => {
    const decision = entry({ hash: "d", kind: "decision", text: "Ship without the banner.", lamport: 1 });
    const ack = entry({ hash: "k", kind: "acknowledge", target: "d", author: "alina", lamport: 2 });
    const handoff = entry({ hash: "o", kind: "handoff", to: "alina", text: "Wire the reconnect", snapshot: "s", lamport: 3, place: { type: "file", path: "src/sdk.ts", line: 4 } });
    const accept = entry({ hash: "a", kind: "accept", target: "o", author: "alina", lamport: 4 });
    const entries = [accept, handoff, ack, decision];
    expect(acknowledgements(entries, decision)).toEqual(["alina"]);
    expect(handoffAnswer(entries, handoff)?.kind).toBe("accept");
    const markdown = threadMarkdown("Reconnect", entries, members);
    expect(markdown).toContain("# Reconnect");
    expect(markdown).toContain("**Sam Al** decided · 2026-09-10 10:00");
    expect(markdown).toContain("Acknowledged by Alina.");
    expect(markdown).toContain("**Sam Al** handed off to Alina · `src/sdk.ts:4`");
    expect(markdown).toContain("Alina stepped in.");
    expect(markdown).not.toContain("acknowledged ·");
    expect(markdown.split("\n").filter(line => line.startsWith("- ")).length).toBe(2);
  });
});
