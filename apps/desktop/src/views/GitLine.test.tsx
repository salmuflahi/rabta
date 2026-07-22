import { screen } from "@testing-library/react";
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
});
