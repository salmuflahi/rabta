import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/smoke-utils";
import { TeamAssets } from "./TeamAssets";
import { teamRequest } from "./client";
vi.mock("./client", async importOriginal => ({ ...await importOriginal<typeof import("./client")>(), teamRequest: vi.fn() }));
const connection = { endpoint: "https://teams.example.com", roomId: "room", memberId: "me", memberKey: "key" };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(teamRequest).mockResolvedValue({}); });
afterEach(cleanup);
it("never uploads a selected file until Share file is activated", async () => {
  const refresh = vi.fn().mockResolvedValue(undefined);
  renderWithProviders(<TeamAssets connection={connection} assets={[]} canWrite onChange={refresh} />);
  fireEvent.change(screen.getByLabelText("Choose a file to share"), { target: { files: [new File(["Shared note"], "note.txt", { type: "text/plain" })] } });
  expect(teamRequest).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Share file" }));
  await screen.findByText("note.txt shared with the workspace.");
  expect(teamRequest).toHaveBeenCalledWith(connection.endpoint, "/v1/rooms/room/assets", "key", expect.objectContaining({ method: "POST", body: { name: "note.txt", mimeType: "text/plain", contentBase64: btoa("Shared note") } }));
  expect(refresh).toHaveBeenCalledOnce();
});
it("keeps the selected file available when the upload fails", async () => {
  vi.mocked(teamRequest).mockRejectedValue(new Error("Workspace unavailable."));
  renderWithProviders(<TeamAssets connection={connection} assets={[]} canWrite onChange={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Choose a file to share"), { target: { files: [new File(["Draft"], "draft.txt", { type: "text/plain" })] } });
  fireEvent.click(screen.getByRole("button", { name: "Share file" }));
  await screen.findByText("Workspace unavailable.");
  expect(screen.getByRole("button", { name: "Share file" })).toBeEnabled();
  expect(screen.getByText("draft.txt · 0 KB")).toBeInTheDocument();
});
it("requires confirmation to remove an explicitly shared file", async () => {
  renderWithProviders(<TeamAssets connection={connection} assets={[{ id: "asset", name: "plan.txt", mimeType: "text/plain", size: 100, ownerId: "me", createdAt: "2026-09-09T12:00:00Z" }]} canWrite onChange={vi.fn().mockResolvedValue(undefined)} />);
  fireEvent.click(screen.getByRole("button", { name: "Remove plan.txt" }));
  expect(teamRequest).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Remove shared file" }));
  await screen.findByText("plan.txt removed from the workspace.");
  expect(teamRequest).toHaveBeenCalledWith(connection.endpoint, "/v1/rooms/room/assets/asset", "key", { method: "DELETE" });
});
