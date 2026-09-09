import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/smoke-utils";
import { TeamWorkspace } from "./TeamWorkspace";
import { clearRememberedTeamConnection } from "./useTeamRoom";
import { teamRequest, TeamRequestError, watchTeam, type TeamState } from "./client";

vi.mock("./client", async importOriginal => ({ ...await importOriginal<typeof import("./client")>(), teamRequest: vi.fn(), watchTeam: vi.fn() }));
const request = vi.mocked(teamRequest);
const watch = vi.mocked(watchTeam);
let server: TeamState;
let notify = () => {};
let saveConflict = false;
beforeEach(() => {
  clearRememberedTeamConnection(); vi.clearAllMocks(); saveConflict = false;
  server = {
    room: { id: "room-1", name: "Release room", createdAt: "2026-09-09T12:00:00Z" },
    me: { id: "me", displayName: "Sammy", role: "owner" },
    members: [{ id: "me", displayName: "Sammy", role: "owner", status: "offline", lastSeenAt: null }, { id: "other", displayName: "Test teammate", role: "member", status: "working", lastSeenAt: "2026-09-09T12:00:00Z" }],
    lanes: [{ memberId: "me", revision: 0, title: "My work", content: "", updatedAt: "2026-09-09T12:00:00Z", publishedAt: null, private: true }, { memberId: "other", revision: 2, title: "Draft launch copy", content: "A visible published idea", updatedAt: "2026-09-09T12:00:00Z", publishedAt: "2026-09-09T12:00:00Z", private: false }],
    proposals: [], assets: [], revision: 3,
  };
  request.mockImplementation(async (_endpoint, path, _key, options = {}) => {
    const body = options.body as Record<string, unknown> | undefined;
    if (path === "/v1/invitations/accept") return { roomId: "room-1", memberId: "me", memberKey: "member-secret" };
    if (path.endsWith("/state")) return structuredClone(server);
    if (path.endsWith("/lane") && options.method === "PUT") {
      if (saveConflict) { saveConflict = false; server.lanes[0] = { ...server.lanes[0], revision: 1, title: "Latest title", content: "Newer server draft" }; server.revision++; throw new TeamRequestError(409, "revision_conflict", "A newer version exists."); }
      if (body?.expectedRevision !== server.lanes[0].revision) throw new TeamRequestError(409, "revision_conflict", "A newer version exists.");
      server.lanes[0] = { ...server.lanes[0], title: String(body.title), content: String(body.content), revision: server.lanes[0].revision + 1 };
      server.revision++; return { lane: structuredClone(server.lanes[0]) };
    }
    if (path.endsWith("/lane/publish")) { server.lanes[0].publishedAt = new Date().toISOString(); server.revision++; return { lane: structuredClone(server.lanes[0]) }; }
    if (path.endsWith("/review")) { server.proposals[0] = { ...server.proposals[0], status: "accepted", revision: 1 }; server.revision++; return { proposal: structuredClone(server.proposals[0]) }; }
    if (path.endsWith("/apply")) { server.lanes[0] = { ...server.lanes[0], title: server.proposals[0].title, content: server.proposals[0].content, revision: 1 }; server.proposals[0].status = "applied"; server.revision++; return { lane: structuredClone(server.lanes[0]) }; }
    return {};
  });
  watch.mockImplementation(async (_connection, signal, onChange) => {
    notify = onChange; onChange();
    return new Promise<void>(resolve => signal.addEventListener("abort", () => resolve(), { once: true }));
  });
});
afterEach(() => { cleanup(); clearRememberedTeamConnection(); });
async function join() {
  renderWithProviders(<TeamWorkspace />);
  fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Sammy" } });
  fireEvent.change(screen.getByLabelText("Invitation", { selector: "input" }), { target: { value: "private-invite" } });
  fireEvent.click(screen.getByRole("button", { name: "Join workspace" }));
  await screen.findByRole("heading", { name: "Release room" });
  await screen.findByText("Live updates connected");
}

describe("Rabta Teams working lanes", () => {
  it("joins a real room without publishing a preview or enabling presence", async () => {
    await join();
    expect(screen.getByText("A visible published idea")).toBeInTheDocument();
    expect(screen.getByLabelText("Share edits as I type")).not.toBeChecked();
    expect(screen.getByLabelText("Show when I’m working here")).not.toBeChecked();
    expect(request.mock.calls.some(call => call[1].endsWith("/lane/publish"))).toBe(false);
    const call = request.mock.calls.find(call => call[1] === "/v1/invitations/accept");
    expect(call?.[3]?.body).toMatchObject({ invitationKey: "private-invite", memberKey: expect.stringMatching(/^[\w-]{43,}$/), idempotencyKey: expect.any(String) });
    expect(Object.values(localStorage)).not.toContain("member-secret");
  });
  it("saves a private draft and shares only after the explicit publish action", async () => {
    await join();
    fireEvent.change(screen.getByLabelText("Your working draft"), { target: { value: "Private planning text" } });
    fireEvent.click(screen.getByRole("button", { name: "Save private draft" }));
    await screen.findByText("Draft saved privately to your workspace host.");
    expect(server.lanes[0].content).toBe("Private planning text");
    expect(request.mock.calls.some(call => call[1].endsWith("/lane/publish"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Publish preview" }));
    await screen.findByText("Preview shared with the workspace.");
    expect(request.mock.calls.filter(call => call[1].endsWith("/lane") && call[3]?.method === "PUT")).toHaveLength(1);
  });
  it("receives a teammate’s new preview without overwriting local edits", async () => {
    await join();
    fireEvent.change(screen.getByLabelText("Your working draft"), { target: { value: "My unsaved thought" } });
    server.lanes[1].content = "A new shared idea"; server.revision++;
    notify();
    await screen.findByText("A new shared idea");
    expect(screen.getByLabelText("Your working draft")).toHaveValue("My unsaved thought");
  });
  it("keeps both versions on conflict and requires an explicit choice before the next save", async () => {
    await join(); saveConflict = true;
    fireEvent.change(screen.getByLabelText("Your working draft"), { target: { value: "My local version" } });
    fireEvent.click(screen.getByRole("button", { name: "Save private draft" }));
    fireEvent.click(await screen.findByRole("button", { name: "Compare latest version" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Newer server draft")).toBeInTheDocument();
    expect(within(dialog).getByText("My local version")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep my text for next save" }));
    fireEvent.click(screen.getByRole("button", { name: "Save private draft" }));
    await screen.findByText("Draft saved privately to your workspace host.");
    expect(server.lanes[0].content).toBe("My local version");
    expect(server.lanes[0].revision).toBe(2);
  });
  it("separates accepting a suggestion from replacing the owner’s draft", async () => {
    server.proposals = [{ id: "proposal-1", sourceMemberId: "other", targetMemberId: "me", targetRevision: 0, title: "Reviewed title", content: "Reviewed content", status: "pending", revision: 0, createdAt: "2026-09-09T12:00:00Z", updatedAt: "2026-09-09T12:00:00Z" }];
    await join();
    fireEvent.click(screen.getByRole("button", { name: "Accept for review" }));
    const apply = await screen.findByRole("button", { name: "Apply to my draft" });
    expect(server.lanes[0].content).toBe("");
    fireEvent.click(apply);
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Apply suggested version" }));
    await waitFor(() => expect(screen.getByLabelText("Your working draft")).toHaveValue("Reviewed content"));
    expect(server.lanes[0].publishedAt).toBeNull();
  });
  it("only shares typing after consent, and saves the changed text to the current revision", async () => {
    await join();
    fireEvent.click(screen.getByLabelText("Share edits as I type"));
    await screen.findByText("Preview shared with the workspace.");
    fireEvent.change(screen.getByLabelText("Your working draft"), { target: { value: "Live shared writing" } });
    await waitFor(() => expect(server.lanes[0].content).toBe("Live shared writing"), { timeout: 2000 });
    await waitFor(() => expect(request.mock.calls.filter(call => call[1].endsWith("/lane/publish"))).toHaveLength(2));
  });
});
