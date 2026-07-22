import { describe, it, expect } from "vitest";
import { relativeTime, humanizeCapsule, describeEvent } from "@/lib/humanize";
import type { TaskResource } from "@/store";

const NOW = new Date(2024, 2, 10, 12, 0, 0).getTime(); // Sun Mar 10 2024, 12:00:00 local

function iso(offsetMs: number): string {
  return new Date(NOW - offsetMs).toISOString();
}

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
});

describe("describeEvent", () => {
  it("describes connectorConnected", () => {
    const e = { type: "connectorConnected", connector: { name: "VS Code", kind: "vscode" } };
    expect(describeEvent(e)).toEqual({ icon: "connector", sentence: "VS Code connected" });
  });

  it("describes connectorDisconnected", () => {
    const e = { type: "connectorDisconnected", connectorId: "sess-1" };
    // No name is ever sent on disconnect (only connectorId) — falls back.
    expect(describeEvent(e)).toEqual({ icon: "connector", sentence: "A connector disconnected" });
  });

  it("describes commandSent", () => {
    const e = { type: "commandSent", connectorId: "sess-1", name: "git.status", args: {} };
    expect(describeEvent(e)).toEqual({
      icon: "command",
      sentence: "Sent git.status to sess-1",
    });
  });

  it("describes responseReceived", () => {
    const e = {
      type: "responseReceived",
      connector: { name: "Chrome" },
      ok: true,
      result: {},
    };
    expect(describeEvent(e)).toEqual({ icon: "response", sentence: "Chrome responded" });
  });

  it("describes eventReceived", () => {
    const e = { type: "eventReceived", connectorId: "sess-2", name: "file.saved", data: {} };
    expect(describeEvent(e)).toEqual({ icon: "event", sentence: "sess-2 sent file.saved" });
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
});
