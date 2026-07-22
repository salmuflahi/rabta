import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mockInvoke, renderWithProviders } from "@/test/smoke-utils";
import { GitLine } from "./GitLine";

describe("GitLine", () => {
  it("renders compact status + action menu without throwing", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "git_status") {
        return { branch: "main", dirty: true, changedCount: 2, ahead: 1, behind: 0 };
      }
      if (cmd === "git_branches") return ["main", "feature/x"];
      return [];
    });

    renderWithProviders(<GitLine projectId="proj-1" />);

    expect(await screen.findByText("main")).toBeInTheDocument();
    expect(screen.getByText("2 changed")).toBeInTheDocument();
    expect(screen.getByText("Git")).toBeInTheDocument();
  });

  // NOTE: Radix's DropdownMenuTrigger opens on `onPointerDown` (not
  // `onClick`), and happy-dom's PointerEvent support isn't reliable enough
  // to drive that path deterministically without `@testing-library/user-event`
  // (not a dependency of this package). Radix's trigger also opens on
  // Enter/Space/ArrowDown keydown, which is a plain synthetic KeyboardEvent
  // happy-dom handles the same way real browsers do, so this test drives
  // the menu open/select via keyboard rather than a flaky pointer-click chain.
  it("opens the New Branch dialog from the Git menu", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "git_status") {
        return { branch: "main", dirty: false, changedCount: 0, ahead: 0, behind: 0 };
      }
      if (cmd === "git_branches") return [];
      return [];
    });

    renderWithProviders(<GitLine projectId="proj-1" />);

    const trigger = await screen.findByRole("button", { name: /git/i });
    fireEvent.keyDown(trigger, { key: "Enter" });

    const newBranchItem = await screen.findByText("New Branch…");
    fireEvent.keyDown(newBranchItem, { key: "Enter" });

    expect(await screen.findByText("Create a new branch from the current one.")).toBeInTheDocument();
    expect(screen.getByLabelText("Branch Name")).toBeInTheDocument();
  });
});
