import { describe, it, expect } from "vitest";
import {
  describeEvent,
  formatDuration,
  humanizeCapsule,
  relativeTime,
} from "@/lib/humanize";
import type { TaskResource } from "@/store";

const NOW = new Date(2024, 2, 10, 12, 0, 0).getTime(); // Sun Mar 10 2024, 12:00:00 local

function iso(offsetMs: number): string {
  return new Date(NOW - offsetMs).toISOString();
}

describe("formatDuration", () => {
  it("formats honest compact durations", () => {
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(59)).toBe("<1m");
    expect(formatDuration(60)).toBe("1m");
    expect(formatDuration(2 * 3600 + 17 * 60)).toBe("2h 17m");
  });

  it("normalizes invalid, negative, and fractional input", () => {
    expect(formatDuration(Number.NaN)).toBe("0m");
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("0m");
    expect(formatDuration(-90)).toBe("0m");
    expect(formatDuration(3600.9)).toBe("1h");
  });
});

describe("relativeTime", () => {
  it("returns 'just now' for under 45 seconds", () => {
    expect(relativeTime(iso(10_000), NOW)).toBe("just now");
  });

  it("returns 'just now' right at the boundary (under 45s)", () => {
    expect(relativeTime(iso(44_000), NOW)).toBe("just now");
  });

  it("returns minutes ago for under an hour", () => {
    expect(relativeTime(iso(5 * 60_000), NOW)).toBe("5m ago");
  });

  it("returns hours ago for under a day", () => {
    expect(relativeTime(iso(3 * 60 * 60_000), NOW)).toBe("3h ago");
  });

  it("returns '59m ago' just below the hour boundary", () => {
    expect(relativeTime(iso(59 * 60_000), NOW)).toBe("59m ago");
  });

  it("rounds 59.6 minutes up into the hour bucket, not '60m ago'", () => {
    // diffMin = 59.6 rounds to 60, which must promote to the hour bucket
    // (round-then-branch), not print the invalid "60m ago".
    expect(relativeTime(iso(59.6 * 60_000), NOW)).toBe("1h ago");
  });

  it("returns '2h ago' for 90 minutes", () => {
    expect(relativeTime(iso(90 * 60_000), NOW)).toBe("2h ago");
  });

  it("rounds 23.6 hours up past the day boundary into 'yesterday', not '24h ago'", () => {
    // diffHour = 23.6 rounds to 24, which must promote out of the hour
    // bucket entirely (round-then-branch), landing on the calendar-day rule.
    expect(relativeTime(iso(23.6 * 60 * 60_000), NOW)).toBe("yesterday");
  });

  it("returns 'yesterday' for the previous calendar day", () => {
    // Mar 9 2024, 10:00 — previous calendar day, even though it's >24h... no,
    // it's under 26h but crosses midnight so it's "yesterday" not "1h ago".
    const then = new Date(2024, 2, 9, 10, 0, 0).getTime();
    expect(relativeTime(new Date(then).toISOString(), NOW)).toBe("yesterday");
  });

  it("returns a short date for older days", () => {
    const then = new Date(2024, 2, 4, 9, 0, 0).getTime();
    expect(relativeTime(new Date(then).toISOString(), NOW)).toBe("Mar 4");
  });

  it("never throws and returns a consistent sentinel for invalid dates", () => {
    expect(relativeTime("not-a-date", NOW)).toBe("unknown");
    expect(relativeTime("", NOW)).toBe("unknown");
  });
});

// humanizeCapsule takes only `r: TaskResource` (no `now` override, per the
// brief's exact signature) — it always resolves savedAgo against the real
// clock. So these fixtures must be relative to the *actual* current time,
// not the pretend NOW used for the relativeTime bucket tests above.
function resource(overrides: Partial<TaskResource>): TaskResource {
  return {
    id: "r1",
    taskId: "t1",
    connectorKind: "vscode",
    resourceType: "workspace",
    payload: {},
    createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    ...overrides,
  };
}

describe("humanizeCapsule", () => {
  it("summarizes a git capsule by branch", () => {
    const r = resource({ connectorKind: "git", payload: { branch: "main" } });
    const out = humanizeCapsule(r);
    expect(out).toEqual({ kind: "git", icon: "git", summary: "on main", savedAgo: "5m ago" });
  });

  it("summarizes an editor capsule with no files/terminals", () => {
    const r = resource({ connectorKind: "vscode", payload: { openFiles: [], terminals: [] } });
    const out = humanizeCapsule(r);
    expect(out.icon).toBe("editor");
    expect(out.summary).toBe("no files · no terminals");
  });

  it("summarizes an editor capsule with 1 file and 1 terminal (singular)", () => {
    const r = resource({
      connectorKind: "cursor",
      payload: { openFiles: ["a.ts"], terminals: ["t1"] },
    });
    const out = humanizeCapsule(r);
    expect(out.icon).toBe("editor");
    expect(out.summary).toBe("1 file · 1 terminal");
  });

  it("summarizes an editor capsule with many files/terminals (plural)", () => {
    const r = resource({
      connectorKind: "vscode",
      payload: { openFiles: ["a.ts", "b.ts", "c.ts"], terminals: ["t1", "t2"] },
    });
    const out = humanizeCapsule(r);
    expect(out.summary).toBe("3 files · 2 terminals");
  });

  it("summarizes a browser capsule's tabs when present", () => {
    const r = resource({
      connectorKind: "chrome",
      payload: { tabs: [{ url: "https://a.test" }, { url: "https://b.test" }] },
    });
    const out = humanizeCapsule(r);
    expect(out.icon).toBe("browser");
    expect(out.summary).toBe("2 tabs");
  });

  it("degrades a browser capsule with no tabs field to a generic summary", () => {
    const r = resource({ connectorKind: "browser", payload: {} });
    const out = humanizeCapsule(r);
    expect(out.icon).toBe("browser");
    expect(out.summary).toBeTruthy();
  });

  it("never throws on a resource with missing/malformed payload fields", () => {
    const r = resource({
      connectorKind: "vscode",
      payload: { openFiles: "not-an-array", terminals: null } as unknown as Record<
        string,
        unknown
      >,
      createdAt: "not-a-date",
    });
    expect(() => humanizeCapsule(r)).not.toThrow();
    const out = humanizeCapsule(r);
    expect(out.summary).toBe("no files · no terminals");
    expect(out.savedAgo).toBe("unknown");
  });

  it("degrades an unrecognized connector kind to a generic icon without throwing", () => {
    const r = resource({ connectorKind: "docker", payload: {} });
    expect(() => humanizeCapsule(r)).not.toThrow();
    expect(humanizeCapsule(r).icon).toBe("generic");
  });

  it("summarizes a terminal capsule", () => {
    const r = resource({ connectorKind: "terminal", payload: { terminals: ["t1", "t2"] } });
    const out = humanizeCapsule(r);
    expect(out.icon).toBe("terminal");
    expect(out.summary).toBe("2 terminals");
  });

  it("falls back to 'on unknown branch' for a git capsule with a missing branch", () => {
    const r = resource({ connectorKind: "git", payload: {} });
    const out = humanizeCapsule(r);
    expect(out.summary).toBe("on unknown branch");
  });

  it("falls back to 'on unknown branch' for a git capsule with an empty branch", () => {
    const r = resource({ connectorKind: "git", payload: { branch: "" } });
    const out = humanizeCapsule(r);
    expect(out.summary).toBe("on unknown branch");
  });
});

// Realistic wire payloads, matching `HubEvent` in crates/omnibus-hub/src/hub.rs
// (`#[serde(tag = "type", rename_all = "camelCase", rename_all_fields =
// "camelCase")]`): only `connectorConnected`/`pairingRequested` inline a name
// (`connector: { name }` / `name`) — every other variant carries just a
// `connectorId` session id, never a `connector.name` object.
describe("describeEvent", () => {
  it("describes connectorConnected", () => {
    const e = {
      type: "connectorConnected",
      connector: { id: "sess-1", name: "VS Code", kind: "vscode", capabilities: [] },
    };
    expect(describeEvent(e)).toEqual({ icon: "connector", sentence: "VS Code connected" });
  });

  it("describes connectorDisconnected without a resolver, falling back to a generic", () => {
    const e = { type: "connectorDisconnected", connectorId: "sess-1" };
    // No name is ever sent on disconnect (only connectorId) — falls back
    // instead of surfacing the raw session id.
    expect(describeEvent(e)).toEqual({ icon: "connector", sentence: "a connector disconnected" });
  });

  it("describes connectorDisconnected with a resolver that maps the id to a name", () => {
    const e = { type: "connectorDisconnected", connectorId: "sess-1" };
    const resolveName = (id: string) => (id === "sess-1" ? "VS Code" : undefined);
    expect(describeEvent(e, resolveName)).toEqual({
      icon: "connector",
      sentence: "VS Code disconnected",
    });
  });

  it("describes commandSent without a resolver, falling back to a generic", () => {
    const e = {
      type: "commandSent",
      connectorId: "sess-1",
      requestId: "req-1",
      name: "git.status",
      args: {},
    };
    expect(describeEvent(e)).toEqual({
      icon: "command",
      sentence: "Sent git.status to a connector",
    });
  });

  it("describes commandSent with a resolver", () => {
    const e = {
      type: "commandSent",
      connectorId: "sess-1",
      requestId: "req-1",
      name: "git.status",
      args: {},
    };
    const resolveName = (id: string) => (id === "sess-1" ? "VS Code" : undefined);
    expect(describeEvent(e, resolveName)).toEqual({
      icon: "command",
      sentence: "Sent git.status to VS Code",
    });
  });

  it("describes responseReceived without a resolver, never leaking the raw session id", () => {
    const e = { type: "responseReceived", connectorId: "sess-4f2a", requestId: "req-1", ok: true, result: {} };
    expect(describeEvent(e)).toEqual({ icon: "response", sentence: "a connector responded" });
  });

  it("describes responseReceived with a resolver mapping the id to a name", () => {
    const e = { type: "responseReceived", connectorId: "sess-4f2a", requestId: "req-1", ok: true, result: {} };
    const resolveName = (id: string) => (id === "sess-4f2a" ? "Chrome" : undefined);
    expect(describeEvent(e, resolveName)).toEqual({ icon: "response", sentence: "Chrome responded" });
  });

  it("describes eventReceived without a resolver, falling back to a generic", () => {
    const e = { type: "eventReceived", connectorId: "sess-2", name: "file.saved", data: {} };
    expect(describeEvent(e)).toEqual({ icon: "event", sentence: "a connector sent file.saved" });
  });

  it("describes eventReceived with a resolver", () => {
    const e = { type: "eventReceived", connectorId: "sess-2", name: "file.saved", data: {} };
    const resolveName = (id: string) => (id === "sess-2" ? "VS Code" : undefined);
    expect(describeEvent(e, resolveName)).toEqual({
      icon: "event",
      sentence: "VS Code sent file.saved",
    });
  });

  it("describes pairingRequested", () => {
    const e = { type: "pairingRequested", pairingId: "p1", name: "Chrome", kind: "browser" };
    expect(describeEvent(e)).toEqual({
      icon: "pairing",
      sentence: "Chrome requested to connect",
    });
  });

  it("humanizes an unknown event type as a fallback", () => {
    const e = { type: "someWeirdThingHappened" };
    expect(describeEvent(e)).toEqual({ icon: "generic", sentence: "Some weird thing happened" });
  });

  it("humanizes an unknown snake_case event type", () => {
    const e = { type: "another_thing_happened" };
    expect(describeEvent(e).sentence).toBe("Another thing happened");
  });

  it("never throws and falls back sensibly on a missing-payload event", () => {
    const e = { type: "connectorConnected" };
    expect(() => describeEvent(e)).not.toThrow();
    expect(describeEvent(e)).toEqual({ icon: "connector", sentence: "A connector connected" });
  });

  it("a resolver that returns undefined for an unrecognized id still falls back to a generic", () => {
    const e = { type: "responseReceived", connectorId: "sess-9", requestId: "req-1", ok: true, result: {} };
    const resolveName = () => undefined;
    expect(describeEvent(e, resolveName)).toEqual({ icon: "response", sentence: "a connector responded" });
  });

  it("never throws when e.type is not a string", () => {
    const e = { type: 42 as unknown as string };
    expect(() => describeEvent(e)).not.toThrow();
    expect(describeEvent(e)).toEqual({ icon: "generic", sentence: "42" });
  });
});
