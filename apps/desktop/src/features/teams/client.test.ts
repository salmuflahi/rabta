import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeEndpoint, prepareTeamAsset, teamRequest, watchTeam } from "./client";

afterEach(() => { vi.unstubAllGlobals(); });
describe("workspace connection boundaries", () => {
  it("accepts secure hosts and loopback while refusing credentials or insecure remote hosts", () => {
    expect(normalizeEndpoint("https://teams.example.com/")).toBe("https://teams.example.com");
    expect(normalizeEndpoint("http://127.0.0.1:47831")).toBe("http://127.0.0.1:47831");
    for (const endpoint of ["http://192.168.1.10", "https://key@example.com", "https://example.com?key=secret", "file:///private/file"]) expect(() => normalizeEndpoint(endpoint)).toThrow();
  });
  it("keeps member keys out of URLs and rejects credential-bearing redirects", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", request);
    await teamRequest("https://teams.example.com", "/v1/rooms/room/state", "private-member-key");
    expect(request).toHaveBeenCalledWith("https://teams.example.com/v1/rooms/room/state", expect.objectContaining({
      headers: { Authorization: "Bearer private-member-key" }, credentials: "omit", redirect: "error",
    }));
  });
  it("preserves revision conflicts instead of reporting a successful save", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: { code: "revision_conflict", message: "The lane has changed." } }) }));
    await expect(teamRequest("https://teams.example.com", "/lane", "key", { method: "PUT", body: {} })).rejects.toMatchObject({ status: 409, code: "revision_conflict" });
  });
  it("parses split stream notifications without putting auth in the event URL", async () => {
    const abort = new AbortController();
    const encoder = new TextEncoder();
    const stream = new ReadableStream({ start(controller) {
      controller.enqueue(encoder.encode("event: rea"));
      controller.enqueue(encoder.encode("dy\ndata: {\"revision\":0}\n\nevent: change\ndata: {\"revision\":1}\n\n"));
      controller.close();
    } });
    const request = vi.fn().mockResolvedValue({ ok: true, body: stream });
    vi.stubGlobal("fetch", request);
    const changed = vi.fn();
    await expect(watchTeam({ endpoint: "https://teams.example.com", memberKey: "key", roomId: "room", memberId: "me" }, abort.signal, changed)).rejects.toThrow("Live updates stopped");
    expect(changed).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][0]).toBe("https://teams.example.com/v1/rooms/room/events");
  });
});
describe("explicit shared files", () => {
  it("rejects active markup and oversized files before reading their contents", async () => {
    await expect(prepareTeamAsset(new File(["<svg />"], "work.svg", { type: "image/svg+xml" }))).rejects.toThrow("Choose a PNG");
    await expect(prepareTeamAsset(new File([new Uint8Array(2 * 1024 * 1024 + 1)], "large.txt", { type: "text/plain" }))).rejects.toThrow("up to 2 MB");
  });
  it("encodes Unicode text as bytes, without losing content", async () => {
    const file = new File(["Hello مرحبا 🌿"], "note.txt", { type: "text/plain" });
    const result = await prepareTeamAsset(file);
    expect(new TextDecoder().decode(Uint8Array.from(atob(result.contentBase64), char => char.charCodeAt(0)))).toBe("Hello مرحبا 🌿");
  });
});
