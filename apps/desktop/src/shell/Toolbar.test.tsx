import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Toolbar } from "./Toolbar";
import { useStore } from "@/store";
import { renderWithProviders } from "@/test/smoke-utils";

describe("Toolbar", () => {
  // The title moves here so pages stop restating what the sidebar says.
  it("names the current view", () => {
    useStore.setState({ view: "capsules" });
    renderWithProviders(<Toolbar />);
    expect(screen.getByRole("heading", { name: "Capsules" })).toBeInTheDocument();
  });

  it("follows the view as it changes", () => {
    useStore.setState({ view: "settings" });
    renderWithProviders(<Toolbar />);
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
  });
});
