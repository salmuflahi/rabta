import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { expectAtMostOneAccent } from "@/test/accent";
import { mockInvoke, renderWithProviders } from "@/test/smoke-utils";
import { useStore } from "@/store";
import { SettingsPage } from "./SettingsPage";

function sections() {
  return within(document.querySelector("[data-settings-sections]") as HTMLElement);
}
function detail() {
  return within(document.querySelector("[data-settings-detail]") as HTMLElement);
}

/** Settings is a section list now — most rows only exist once their
 * section is open. */
function openSection(label: string) {
  fireEvent.click(sections().getByRole("tab", { name: label }));
}

describe("SettingsPage", () => {
  beforeEach(() => {
    // The store is a module singleton shared across tests; start each case
    // from default preferences so Developer mode (etc.) doesn't leak between.
    useStore.getState().resetPrefs();
    useStore.setState({ settingsSection: "general" });
  });

  // The Toolbar owns the view's <h1>; the detail pane names the open
  // section within it.
  it("does not own the document's top heading", () => {
    renderWithProviders(<SettingsPage />);
    expect(document.querySelector("h1")).not.toBeInTheDocument();
    expect(detail().getByRole("heading", { level: 2, name: "General" })).toBeInTheDocument();
  });

  it("lists every section and opens the one you pick", () => {
    renderWithProviders(<SettingsPage />);
    for (const label of [
      "General",
      "Appearance",
      "Capsules",
      "Connectors",
      "Privacy & data",
      "Migrate",
      "Developer",
      "Shortcuts",
    ]) {
      expect(sections().getByRole("tab", { name: label })).toBeInTheDocument();
    }

    openSection("Privacy & data");
    expect(useStore.getState().settingsSection).toBe("privacy");
    expect(detail().getByRole("heading", { level: 2, name: "Privacy & data" })).toBeInTheDocument();
  });

  // Migrate arrived with Phase 3, so the handoff's eighth section is here
  // now — and it opens a sheet that really exists.
  it("offers Migrate, with both doors into the flow", () => {
    renderWithProviders(<SettingsPage />);
    openSection("Migrate");
    expect(detail().getByRole("heading", { level: 2, name: "Migrate" })).toBeInTheDocument();

    fireEvent.click(detail().getByRole("button", { name: "Send…" }));
    expect(useStore.getState().mig?.role).toBe("send");

    useStore.getState().closeMigrate();
    fireEvent.click(detail().getByRole("button", { name: "Receive…" }));
    expect(useStore.getState().mig?.role).toBe("receive");
    useStore.getState().closeMigrate();
  });

  it("keeps the selected section neutral, not accent-filled", () => {
    renderWithProviders(<SettingsPage />);
    const tab = sections().getByRole("tab", { name: "General" });
    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(tab.className.split(/\s+/)).toContain("bg-secondary");
    expect(tab.className.split(/\s+/)).not.toContain("bg-primary");
  });

  it("tolerates a persisted section id that no longer exists", () => {
    useStore.setState({ settingsSection: "a-section-from-a-later-build" });
    renderWithProviders(<SettingsPage />);
    expect(detail().getByRole("heading", { level: 2, name: "General" })).toBeInTheDocument();
  });

  it("carries no primary-accent fill anywhere — Settings has no primary action", () => {
    const { container } = renderWithProviders(<SettingsPage />);
    for (const label of ["General", "Appearance", "Capsules", "Privacy & data", "Developer"]) {
      openSection(label);
      expect(container.querySelector(".bg-primary")).toBeNull();
      expectAtMostOneAccent(container);
    }
  });
});

describe("SettingsPage live preferences", () => {
  beforeEach(() => {
    useStore.getState().resetPrefs();
    useStore.setState({ settingsSection: "appearance" });
  });

  it("wires Theme to the pref", () => {
    renderWithProviders(<SettingsPage />);
    fireEvent.click(detail().getByRole("radio", { name: "Dark" }));
    expect(useStore.getState().prefs.theme).toBe("dark");
  });

  it("wires Accent to the pref", () => {
    renderWithProviders(<SettingsPage />);
    const swatch = detail().getByRole("radiogroup", { name: "Accent colour" });
    fireEvent.click(within(swatch).getAllByRole("radio")[1]);
    expect(useStore.getState().prefs.accent).not.toBe("tangerine");
  });

  it("wires Status bar to the pref", () => {
    renderWithProviders(<SettingsPage />);
    fireEvent.click(detail().getByLabelText("Status bar"));
    expect(useStore.getState().prefs.statusbar).toBe(false);
  });

  it("wires Motion to the pref", () => {
    renderWithProviders(<SettingsPage />);
    fireEvent.click(detail().getByRole("radio", { name: "Reduced" }));
    expect(useStore.getState().prefs.motion).toBe("reduced");
  });
});

describe("SettingsPage capsules section", () => {
  beforeEach(() => {
    useStore.getState().resetPrefs();
    useStore.setState({ settingsSection: "capsules" });
  });

  it("toggles focus mode, off by default", () => {
    renderWithProviders(<SettingsPage />);
    const toggle = detail().getByLabelText("Put away what isn't in the task");
    expect(toggle).not.toBeChecked();
    expect(useStore.getState().prefs.focusMode).toBe(false);

    fireEvent.click(toggle);
    expect(useStore.getState().prefs.focusMode).toBe(true);
    expect(toggle).toBeChecked();
  });

  // Focus mode is destructive-feeling and lives buried in Settings. A user
  // who finds it must understand the guarantees before enabling it — this
  // copy survives every redesign.
  it("states the focus mode guarantees at the point of decision", () => {
    renderWithProviders(<SettingsPage />);
    expect(detail().getByText(/never closed/i)).toBeInTheDocument();
    expect(detail().getByText(/what it does not want/i)).toBeInTheDocument();
  });

  it("toggles keep-completed", () => {
    renderWithProviders(<SettingsPage />);
    const toggle = detail().getByLabelText("Keep completed capsules");
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(useStore.getState().prefs.keepCompleted).toBe(false);
  });
});

describe("SettingsPage developer section", () => {
  beforeEach(() => {
    useStore.getState().resetPrefs();
    useStore.setState({ settingsSection: "developer" });
  });

  it("hides the raw command console until Developer mode is enabled", async () => {
    renderWithProviders(<SettingsPage />);
    expect(screen.queryByText("Send command")).not.toBeInTheDocument();

    fireEvent.click(detail().getByLabelText("Developer mode"));
    expect(await screen.findByText("Send command")).toBeInTheDocument();
  });
});

describe("SettingsPage privacy section", () => {
  beforeEach(() => {
    useStore.getState().resetPrefs();
    useStore.setState({ settingsSection: "privacy" });
  });

  it("states the local-only guarantee", () => {
    renderWithProviders(<SettingsPage />);
    expect(detail().getByText(/no cloud account and no telemetry/)).toBeInTheDocument();
  });

  it("offers a reset that says what it does not touch", () => {
    renderWithProviders(<SettingsPage />);
    expect(detail().getByText(/capsules and projects aren't touched/)).toBeInTheDocument();
    expect(detail().getByRole("button", { name: "Reset" })).toBeInTheDocument();
  });
});

describe("SettingsPage agents section", () => {
  const SOCKET = "/Users/me/Library/Application Support/com.omnibus.dev/agent.sock";
  beforeEach(() => {
    useStore.getState().resetPrefs();
    useStore.setState({ settingsSection: "agents" });
    mockInvoke.mockImplementation((async (cmd: string, args?: unknown) => {
      const a = (args ?? {}) as Record<string, unknown>;
      if (cmd === "agent_access_status") return { enabled: false, socketPath: SOCKET };
      if (cmd === "set_agent_access") return { enabled: Boolean(a.enabled), socketPath: SOCKET };
      return [];
    }) as unknown as Parameters<typeof mockInvoke.mockImplementation>[0]);
  });

  it("shows the socket, off, and turns it on through the bridge", async () => {
    renderWithProviders(<SettingsPage />);
    expect(detail().getByRole("heading", { level: 2, name: "Agent access" })).toBeInTheDocument();
    expect(await detail().findByText(SOCKET)).toBeInTheDocument();
    expect(detail().getByText("Closed")).toBeInTheDocument();

    const toggle = detail().getByLabelText("Agent access");
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("set_agent_access", { enabled: true }));
    expect(await detail().findByText("Listening")).toBeInTheDocument();
    expect(toggle).toBeChecked();
  });

  it("says what the socket is, in the words the site uses", () => {
    renderWithProviders(<SettingsPage />);
    expect(detail().getByText(/Nothing here listens on a network port/)).toBeInTheDocument();
    expect(detail().getByText("claude mcp add rabta -- npx -y @rabta/mcp")).toBeInTheDocument();
  });
});
