import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { mockInvoke, renderWithProviders } from "@/test/smoke-utils";
import { useStore } from "@/store";
import { FamilyLauncher } from "./FamilyLauncher";

it("opens the integrated Utilities view from the family menu", async () => {
  useStore.setState({ view: "overview" });
  renderWithProviders(<FamilyLauncher />);
  fireEvent.keyDown(screen.getByRole("button", { name: "Rabta products" }), {
    key: "ArrowDown",
  });
  const item = await screen.findByRole("menuitem", {
    name: "Utilities Local tools & Mac controls",
  });
  fireEvent.click(item);
  await waitFor(() => expect(useStore.getState().view).toBe("utilities"));
  expect(mockInvoke).not.toHaveBeenCalledWith("open_url", expect.anything());
});
