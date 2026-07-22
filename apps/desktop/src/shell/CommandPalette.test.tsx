import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useStore } from "@/store";
import { renderWithProviders } from "@/test/smoke-utils";
import { CommandPalette } from "./CommandPalette";

describe("CommandPalette", () => {
  it("renders nav commands when opened via the store", async () => {
    useStore.setState({ commandOpen: true });

    renderWithProviders(<CommandPalette />);

    expect(await screen.findByText("Register Project")).toBeInTheDocument();
    expect(screen.getByText("New Task")).toBeInTheDocument();
    expect(screen.getAllByText("Settings").length).toBeGreaterThan(0);
  });
});
