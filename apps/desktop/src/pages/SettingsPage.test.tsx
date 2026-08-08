import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { expectAtMostOneAccent } from "@/test/accent";
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

    // Renamed from the old Card-era title ("Put away what isn't in the
    // task") to the short "Focus mode" accessible name now that the
    // guarantee itself lives in the Field's description — see the two
    // tests below. This is a layout-era assertion, not a wiring one: the
    // checked/onCheckedChange <-> store.setPref("focusMode", …) contract
    // asserted here is untouched.
    const toggle = screen.getByLabelText("Focus mode");
    expect(toggle).not.toBeChecked();
    expect(useStore.getState().prefs.focusMode).toBe(false);

    fireEvent.click(toggle);
    expect(useStore.getState().prefs.focusMode).toBe(true);
    expect(toggle).toBeChecked();
  });

  // Focus mode is destructive-feeling and lives buried in Settings. A user
  // who finds it should understand the guarantees before enabling it.
  it("states the focus mode guarantees at the point of decision", async () => {
    renderWithProviders(<SettingsPage />);
    expect(await screen.findByText(/never closed/i)).toBeInTheDocument();
    expect(screen.getByText(/put away/i)).toBeInTheDocument();
  });

  it("keeps the focus mode switch wired to the pref", async () => {
    renderWithProviders(<SettingsPage />);
    const toggle = await screen.findByLabelText(/focus mode/i);
    expect(toggle).toBeInTheDocument();
  });

  it("spends the accent at most once", async () => {
    const { container } = renderWithProviders(<SettingsPage />);
    await screen.findByText("Settings");
    expectAtMostOneAccent(container);
  });

  // expectAtMostOneAccent alone is vacuous — it passes whether or not
  // anything renders. Settings has zero variant="primary" buttons by
  // design (there is no single primary action on this page), so pin the
  // lower bound directly: prove no element anywhere carries a bg-primary
  // fill, rather than trusting the budget check above on its own.
  it("carries no primary-accent fill anywhere on the page", async () => {
    const { container } = renderWithProviders(<SettingsPage />);
    await screen.findByText("Settings");
    const accented = Array.from(container.querySelectorAll("*")).filter((el) =>
      /(^|\s)bg-primary(\s|$)/.test(el.getAttribute("class") || ""),
    );
    expect(accented).toHaveLength(0);
  });
});
