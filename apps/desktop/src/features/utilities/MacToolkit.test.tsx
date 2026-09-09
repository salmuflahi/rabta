import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { AppBehaviors, CameraPreview, Cleaner, DiskImageInstaller, HomebrewPanel, InputService, ProcessManager, QuickLauncher, ScreenRecorder, Uninstaller, UpdateChecker, defaultInputConfig } from "./MacToolkit";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const invokeMock = vi.mocked(invoke);
const calls = (name: string) => invokeMock.mock.calls.filter(([command]) => command === name);
const inputState = (overrides: Partial<{ running: boolean; error: string | null; cleaning: boolean }> = {}) => ({ status: { running: false, error: null, cleaning: false, expansions: 0, lastEvent: null, accessibilityTrusted: true, inputMonitoring: true, ...overrides }, config: defaultInputConfig(), supported: true });
beforeEach(() => { invokeMock.mockReset(); localStorage.clear(); Object.defineProperty(document, "hidden", { configurable: true, value: false }); });
afterEach(() => { vi.useRealTimers(); });

describe("input service", () => {
  it("asks for consent before the first filter is applied and sends the full configuration afterwards", async () => {
    invokeMock.mockImplementation(async (command, args) => command === "utility_input_configure" ? { ...inputState({ running: true }), config: (args as { config: unknown }).config } : inputState());
    render(<InputService />);
    expect(await screen.findByText(/Filter off/)).toBeVisible();
    fireEvent.click(screen.getByRole("switch", { name: "Reverse mouse wheel vertically" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply input settings" }));
    expect(calls("utility_input_configure")).toHaveLength(0);
    expect(screen.getByRole("dialog")).toHaveTextContent("Accessibility access");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Allow and apply" }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("utility_input_configure", { config: expect.objectContaining({ scroll: { invertVertical: true, invertHorizontal: false }, snippets: [], mouseNavigation: false }) }));
    expect(await screen.findByText("Input service running with your settings.")).toBeVisible();
    expect(localStorage.getItem("rabta.utility.input-consent")).toBe("1");
  });
  it("stops everything through the stop command and keeps a refused configuration visible", async () => {
    localStorage.setItem("rabta.utility.input-consent", "1");
    invokeMock.mockImplementation(async (command) => {
      if (command === "utility_input_configure") throw new Error("Click debounce needs a window between 5 and 500 milliseconds.");
      if (command === "utility_input_stop") return inputState();
      return inputState({ running: true });
    });
    render(<InputService />);
    expect(await screen.findByText(/Filter running/)).toBeVisible();
    fireEvent.click(screen.getByRole("switch", { name: "Filter double clicks from a bouncing mouse" }));
    fireEvent.change(screen.getByLabelText("Ignore a repeat click within · 5–500 ms"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply input settings" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("between 5 and 500");
    fireEvent.click(screen.getByRole("button", { name: "Turn everything off" }));
    await waitFor(() => expect(calls("utility_input_stop")).toHaveLength(1));
    expect(await screen.findByText(/macOS delivers every event unchanged/)).toBeVisible();
  });
  it("locks the keyboard only after confirmation", async () => {
    localStorage.setItem("rabta.utility.input-consent", "1");
    invokeMock.mockImplementation(async (command, args) => command === "utility_input_configure" ? { ...inputState({ running: true, cleaning: true }), config: (args as { config: unknown }).config } : inputState());
    render(<InputService />);
    fireEvent.click(await screen.findByRole("button", { name: "Lock keyboard" }));
    expect(calls("utility_input_configure")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(calls("utility_input_configure")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Lock keyboard" }));
    fireEvent.click(screen.getByRole("button", { name: "Lock keyboard" }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("utility_input_configure", { config: expect.objectContaining({ cleaningMode: { enabled: true } }) }));
    expect(await screen.findByRole("button", { name: "Unlock keyboard" })).toBeVisible();
  });
});

describe("app behaviors", () => {
  const status = { settings: { autoQuit: { enabled: false, graceSeconds: 20, excludedApps: [] }, musicBlock: { enabled: false, allowUntil: null } }, events: [], active: false, error: null };
  it("turns auto-quit on only after confirmation and sends normalized settings", async () => {
    invokeMock.mockImplementation(async (command, args) => command === "utility_watchers_configure" ? { ...status, settings: (args as { settings: typeof status.settings }).settings, active: true } : status);
    render(<AppBehaviors />);
    const toggle = await screen.findByRole("switch", { name: "Quit apps after their last window closes" });
    fireEvent.change(screen.getByLabelText("Never quit · bundle IDs, one per line"), { target: { value: "com.apple.Safari\n\n" } });
    fireEvent.click(toggle);
    expect(calls("utility_watchers_configure")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(calls("utility_watchers_configure")).toHaveLength(0);
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: "Turn on auto-quit" }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("utility_watchers_configure", { settings: { autoQuit: { enabled: true, graceSeconds: 20, excludedApps: ["com.apple.Safari"] }, musicBlock: { enabled: false, allowUntil: null } } }));
  });
  it("only offers a Music allowance while the block is on", async () => {
    invokeMock.mockResolvedValue({ ...status, settings: { ...status.settings, musicBlock: { enabled: true, allowUntil: null } }, active: true });
    render(<AppBehaviors />);
    fireEvent.click(await screen.findByRole("button", { name: "Allow Music for 10 minutes" }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("utility_watchers_configure", { settings: expect.objectContaining({ musicBlock: { enabled: true, allowUntil: expect.any(Number) } }) }));
  });
});

describe("processes", () => {
  const list = [
    { pid: 1, parent: 0, cpu: 0, memoryBytes: 1024, user: "root", command: "/sbin/launchd", name: "launchd", protected: true, app: false },
    { pid: 500, parent: 1, cpu: 12.5, memoryBytes: 200 * 1024 * 1024, user: "sam", command: "/Applications/Editor.app/Contents/MacOS/Editor", name: "Editor", protected: false, app: true },
  ];
  it("hides actions for system processes and confirms before ending one", async () => {
    invokeMock.mockImplementation(async (command) => command === "utility_processes" ? list : { name: "Editor", method: "quit", requested: true });
    render(<ProcessManager />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh processes" }));
    const rows = await screen.findAllByRole("row");
    expect(within(rows[1]).queryByRole("button")).toBeNull();
    fireEvent.click(within(rows[2]).getByRole("button", { name: "Force quit" }));
    expect(calls("utility_end_process")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(within(rows[2]).getByRole("button", { name: "Quit" }));
    fireEvent.click(screen.getByRole("button", { name: "Ask to quit" }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("utility_end_process", { pid: 500, force: false }));
  });
});

describe("quick launcher and uninstaller", () => {
  const apps = [{ path: "/Applications/Editor.app", name: "Editor", bundleId: "com.example.editor", version: "2.0", system: false }, { path: "/System/Applications/Calculator.app", name: "Calculator", bundleId: "com.apple.calculator", version: "", system: true }];
  it("opens an app by its path and remembers pins on this device", async () => {
    invokeMock.mockImplementation(async (command) => command === "utility_installed_apps" ? apps : { pid: 9 });
    render(<QuickLauncher />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh apps" }));
    expect(await screen.findByText(/Editor · 2.0/)).toBeVisible();
    fireEvent.click(screen.getAllByRole("button", { name: "Pin" })[0]);
    expect(JSON.parse(localStorage.getItem("rabta.utility.launcher") ?? "[]")).toEqual(["/Applications/Editor.app"]);
    fireEvent.click(screen.getByRole("button", { name: "Open Editor" }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("utility_launch_app", { path: "/Applications/Editor.app" }));
  });
  it("lists related files unchecked and removes only the chosen ones after confirmation", async () => {
    invokeMock.mockImplementation(async (command) => {
      if (command === "utility_installed_apps") return [apps[0]];
      if (command === "utility_app_related_files") return [{ label: "Caches", path: "/Users/sam/Library/Caches/com.example.editor", bytes: 2048, directory: true }, { label: "Preferences", path: "/Users/sam/Library/Preferences/com.example.editor.plist", bytes: 100, directory: false }];
      return [{ path: "/Applications/Editor.app", ok: true, error: null }, { path: "/Users/sam/Library/Preferences/com.example.editor.plist", ok: true, error: null }];
    });
    render(<Uninstaller />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh apps" }));
    fireEvent.click(await screen.findByRole("button", { name: "Inspect" }));
    const boxes = await screen.findAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    expect(boxes.every((box) => !(box as HTMLInputElement).checked)).toBe(true);
    fireEvent.click(boxes[1]);
    fireEvent.click(screen.getByRole("button", { name: /Move Editor and 1 item to Trash/ }));
    expect(calls("utility_uninstall_app")).toHaveLength(0);
    expect(screen.getByRole("dialog")).toHaveTextContent("com.example.editor.plist");
    fireEvent.click(screen.getByRole("button", { name: "Move to Trash" }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("utility_uninstall_app", { path: "/Applications/Editor.app", bundleId: "com.example.editor", name: "Editor", related: ["/Users/sam/Library/Preferences/com.example.editor.plist"] }));
    expect(await screen.findByText("2 items moved to the Trash.")).toBeVisible();
  });
});

describe("disk images", () => {
  it("does nothing after a cancelled chooser and installs the chosen app with its options", async () => {
    let chooser = { cancelled: true } as { cancelled: boolean; path?: string };
    invokeMock.mockImplementation(async (command) => {
      if (command === "utility_choose_file") return chooser;
      if (command === "utility_disk_image_open") return { image: "/Users/sam/Downloads/Tool.dmg", mountPoint: "/Volumes/Tool", apps: [{ name: "Tool.app", path: "/Volumes/Tool/Tool.app", installedAt: null }], packages: [] };
      return { installedPath: "/Applications/Tool.app", ejected: true, imageTrashed: false, warnings: [] };
    });
    render(<DiskImageInstaller />);
    fireEvent.click(screen.getByRole("button", { name: "Choose disk image…" }));
    expect(await screen.findByText("No disk image chosen.")).toBeVisible();
    expect(calls("utility_disk_image_open")).toHaveLength(0);
    chooser = { cancelled: false, path: "/Users/sam/Downloads/Tool.dmg" };
    fireEvent.click(screen.getByRole("button", { name: "Choose disk image…" }));
    fireEvent.click(await screen.findByRole("button", { name: "Install Tool.app" }));
    expect(calls("utility_disk_image_install")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("utility_disk_image_install", { app: "/Volumes/Tool/Tool.app", destination: "applications", replace: false, eject: true, trashImage: false }));
    expect(await screen.findByText(/installed at \/Applications\/Tool.app/)).toBeVisible();
  });
});

describe("cleaner", () => {
  it("removes only selected items after confirmation and reports freed space", async () => {
    invokeMock.mockImplementation(async (command, args) => {
      if (command === "utility_cleaner_scan") return [{ id: "caches", label: "App caches", description: "Files apps rebuild.", root: "/Users/sam/Library/Caches", present: true, permanentOnly: false, entries: [{ category: "caches", name: "com.example.a", path: "/Users/sam/Library/Caches/com.example.a", bytes: 3 * 1024 * 1024, directory: true, modified: null }, { category: "caches", name: "com.example.b", path: "/Users/sam/Library/Caches/com.example.b", bytes: 1024, directory: true, modified: null }], totalBytes: 3 * 1024 * 1024 + 1024, truncated: false }];
      const paths = (args as { paths: string[] }).paths;
      return { results: paths.map((path) => ({ path, ok: true, error: null, bytes: 3 * 1024 * 1024 })), freedBytes: 3 * 1024 * 1024, method: "trash" };
    });
    render(<Cleaner />);
    fireEvent.click(screen.getByRole("button", { name: "Scan" }));
    expect(await screen.findByText(/Scan finished/)).toBeVisible();
    expect(invokeMock).toHaveBeenCalledWith("utility_cleaner_scan", { categories: ["caches", "logs", "installers"] });
    const boxes = screen.getAllByRole("checkbox").filter((box) => (box as HTMLInputElement).checked === false && box.closest("details"));
    fireEvent.click(boxes[0]);
    expect(screen.getByText(/1 selected · 3.0 MiB/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Move selected to Trash" }));
    expect(calls("utility_cleaner_remove")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Move to Trash" }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("utility_cleaner_remove", { paths: ["/Users/sam/Library/Caches/com.example.a"], permanent: false }));
    expect(await screen.findByText("3.0 MiB moved to the Trash.")).toBeVisible();
    expect(screen.queryByText(/com.example.a ·/)).toBeNull();
  });
});

describe("homebrew and updates", () => {
  it("shows the exact command and requires confirmation for removals", async () => {
    invokeMock.mockImplementation(async (command, args) => {
      if (command === "utility_brew_status") return { installed: true, path: "/opt/homebrew/bin/brew", version: "Homebrew 4.3.0", busy: false };
      if (command === "utility_brew_list") return [{ name: "wget", versions: ["1.21.4"], kind: "formula" }];
      const request = args as { action: string; name: string | null; cask: boolean };
      return { command: `brew ${request.action}${request.cask ? " --cask" : ""} ${request.name}`, ok: true, output: "Uninstalling wget" };
    });
    render(<HomebrewPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Check Homebrew" }));
    fireEvent.click(await screen.findByRole("button", { name: "List installed" }));
    fireEvent.click(await screen.findByRole("button", { name: "Uninstall" }));
    expect(calls("utility_brew_action")).toHaveLength(0);
    expect(screen.getByRole("dialog")).toHaveTextContent("brew uninstall wget");
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("utility_brew_action", { action: "uninstall", name: "wget", cask: false }));
    expect(await screen.findByLabelText("Homebrew output")).toHaveTextContent("Uninstalling wget");
  });
  it("lists updates by source and reports check failures as alerts", async () => {
    invokeMock.mockResolvedValue({ updates: [{ source: "macOS", name: "macOS 14.6.1", detail: "restart" }, { source: "Homebrew", name: "wget", detail: "1.21.3 → 1.21.4" }], errors: ["App Store updates could not be checked."], sources: ["macOS", "Homebrew", "App Store"] });
    render(<UpdateChecker />);
    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(await screen.findByText("2 updates found across macOS, Homebrew, App Store.")).toBeVisible();
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getByRole("alert")).toHaveTextContent("App Store");
  });
});

describe("recorder and camera", () => {
  it("starts a display recording with the chosen options and stops it", async () => {
    let recording = false;
    invokeMock.mockImplementation(async (command) => {
      if (command === "utility_displays") return { displays: [{ id: "1", index: 1, name: "Built-in Display", primary: true, scale: 2, frame: { x: 0, y: 0, width: 1440, height: 900 } }] };
      if (command === "utility_recorder_start") { recording = true; return { recording: true, path: "/Users/sam/Movies/Rabta/x.mov", startedAt: 100, options: null, last: null }; }
      if (command === "utility_recorder_stop") { recording = false; return { recording: false, path: null, startedAt: null, options: null, last: { path: "/Users/sam/Movies/Rabta/x.mov", bytes: 2048, seconds: 4, ok: true, error: null } }; }
      return { recording, path: recording ? "/Users/sam/Movies/Rabta/x.mov" : null, startedAt: recording ? 100 : null, options: null, last: null };
    });
    render(<ScreenRecorder />);
    fireEvent.click(await screen.findByRole("button", { name: "Refresh displays" }));
    expect(await screen.findByText("1 display connected.")).toBeVisible();
    fireEvent.click(screen.getByRole("switch", { name: "Highlight clicks" }));
    fireEvent.change(screen.getByLabelText("Stop after · seconds, 0 for manual"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Start recording" }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("utility_recorder_start", { options: { display: 1, cursor: true, clicks: true, audio: false, seconds: 30 } }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop recording" }));
    expect(await screen.findByText(/Recording saved: \/Users\/sam\/Movies\/Rabta\/x.mov/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Show last recording in Finder" })).toBeVisible();
  });
  it("starts the preview for the selected camera", async () => {
    invokeMock.mockImplementation(async (command) => command === "utility_camera_devices" ? { devices: [{ id: "cam-1", name: "FaceTime HD", connected: true }], authorization: "authorized", running: false } : { running: true, name: "FaceTime HD" });
    render(<CameraPreview />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh cameras" }));
    fireEvent.click(await screen.findByRole("button", { name: "Start preview" }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("utility_camera_start", { deviceId: "cam-1" }));
    expect(await screen.findByText("FaceTime HD preview open.")).toBeVisible();
  });
});
