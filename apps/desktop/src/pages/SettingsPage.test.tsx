import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/smoke-utils";
import { SettingsPage } from "./SettingsPage";

describe("SettingsPage", () => {
  it("renders without throwing (catches missing-provider crashes)", async () => {
    renderWithProviders(<SettingsPage />);
    expect(await screen.findByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Appearance")).toBeInTheDocument();
    expect(screen.getByText("Privacy")).toBeInTheDocument();
    expect(screen.getByText("Advanced")).toBeInTheDocument();
    expect(screen.getByText("Send Command")).toBeInTheDocument();
  });
});
