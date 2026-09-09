import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/smoke-utils";
import { ConnectionForm } from "./ConnectionForm";
import { teamRequest } from "./client";
vi.mock("./client", async importOriginal => ({ ...await importOriginal<typeof import("./client")>(), teamRequest: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
it("retries a consumed invitation with the same generated identity after a lost response", async () => {
  vi.mocked(teamRequest).mockRejectedValueOnce(new Error("The workspace took too long to respond."))
    .mockResolvedValueOnce({ roomId: "room", memberId: "me", memberKey: "recovered-key" });
  const connect = vi.fn();
  renderWithProviders(<ConnectionForm onConnect={connect} />);
  fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Sammy" } });
  fireEvent.change(screen.getByLabelText("Invitation", { selector: "input" }), { target: { value: "invite" } });
  fireEvent.click(screen.getByRole("button", { name: "Join workspace" }));
  await screen.findByText("The workspace took too long to respond.");
  fireEvent.click(screen.getByRole("button", { name: "Join workspace" }));
  await waitFor(() => expect(connect).toHaveBeenCalledOnce());
  expect(vi.mocked(teamRequest).mock.calls[0][3]?.body).toEqual(vi.mocked(teamRequest).mock.calls[1][3]?.body);
});
it("places focus on the missing name without attempting a network request", () => {
  renderWithProviders(<ConnectionForm onConnect={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Join workspace" }));
  expect(screen.getByLabelText("Your name")).toHaveFocus();
  expect(teamRequest).not.toHaveBeenCalled();
});
