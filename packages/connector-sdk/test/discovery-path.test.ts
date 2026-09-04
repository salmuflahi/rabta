import { describe, expect, it } from "vitest";
import { hubDiscoveryCandidates, pickHubFile } from "../src/index";

// The Mac App Store build runs under App Sandbox, so its hub.json lands in
// the app container rather than the user's Application Support. A connector
// has to find the hub either way, and when both builds have left a file
// behind it has to pick the one a hub is actually listening behind.

describe("hubDiscoveryCandidates", () => {
  it("lists the direct-download path first and the sandbox container second", () => {
    expect(hubDiscoveryCandidates("/Users/alice")).toEqual([
      "/Users/alice/Library/Application Support/com.omnibus.dev/hub.json",
      "/Users/alice/Library/Containers/com.omnibus.dev/Data/Library/Application Support/com.omnibus.dev/hub.json",
    ]);
  });
});

describe("pickHubFile", () => {
  const [direct, container] = hubDiscoveryCandidates("/Users/alice");

  it("falls back to the first candidate when nothing exists", () => {
    expect(pickHubFile([direct, container], () => null)).toBe(direct);
  });

  it("returns the only file that exists", () => {
    expect(pickHubFile([direct, container], (p) => (p === container ? 100 : null))).toBe(container);
    expect(pickHubFile([direct, container], (p) => (p === direct ? 100 : null))).toBe(direct);
  });

  it("prefers the most recently written file when both exist", () => {
    const mtimes: Record<string, number> = { [direct]: 1_000, [container]: 2_000 };
    expect(pickHubFile([direct, container], (p) => mtimes[p] ?? null)).toBe(container);
    mtimes[direct] = 3_000;
    expect(pickHubFile([direct, container], (p) => mtimes[p] ?? null)).toBe(direct);
  });

  it("keeps candidate order on an exact tie", () => {
    expect(pickHubFile([direct, container], () => 5)).toBe(direct);
  });
});
