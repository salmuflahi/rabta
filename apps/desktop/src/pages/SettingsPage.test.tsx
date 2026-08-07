import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/smoke-utils";
import { useStore } from "@/store";
import { SettingsPage } from "./SettingsPage";

describe("SettingsPage", () => {
  beforeEach(() => {
    // The store is a module singleton shared across tests; start each case
    // from default preferences so Developer mode (etc.) doesn't leak between.
    useStore.getState().resetPrefs();
  });

  it("renders every product section without throwing", async () => {
    renderWithProviders(<SettingsPage />);
    expect(await screen.findByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Appearance")).toBeInTheDocument();
    expect(screen.getByText("Behavior")).toBeInTheDocument();
    expect(screen.getByText("Connectors")).toBeInTheDocument();
    expect(screen.getByText("Privacy & data")).toBeInTheDocument();
    expect(screen.getByText("Keyboard shortcuts")).toBeInTheDocument();
    expect(screen.getByText("Developer")).toBeInTheDocument();
  });

  it("hides the raw command console until Developer mode is enabled", async () => {
    renderWithProviders(<SettingsPage />);
    await screen.findByText("Settings");

    // Console is gated off by default.
    expect(screen.queryByText("Send command")).not.toBeInTheDocument();

    // Enabling Developer mode reveals it.
    fireEvent.click(screen.getByLabelText("Developer mode"));
    expect(await screen.findByText("Send command")).toBeInTheDocument();
  });

  it("toggles focus mode, off by default", async () => {
    renderWithProviders(<SettingsPage />);
    await screen.findByText("Settings");

    const toggle = screen.getByLabelText("Put away what isn't in the task");
    expect(toggle).not.toBeChecked();
    expect(useStore.getState().prefs.focusMode).toBe(false);

    fireEvent.click(toggle);
    expect(useStore.getState().prefs.focusMode).toBe(true);
    expect(toggle).toBeChecked();
  });
});
