import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { ClipboardHistory, NativeSystemMonitor, ScreenTextCapture } from "./MacControls";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const invokeMock = vi.mocked(invoke);
const history = { settings: { enabled: false, paused: false, retentionHours: 1, excludedApps: ["com.1password.1password"] }, entries: [], error: null };
beforeEach(() => { invokeMock.mockReset(); Object.defineProperty(document, "hidden", { configurable: true, value: false }); });
afterEach(() => { vi.useRealTimers(); });

describe("native toolkit consent and lifecycle", () => {
  it("only reads history settings until the enable dialog is confirmed", async () => {
    invokeMock.mockImplementation(async (command, args) => {
      if (command === "utility_clipboard_configure") return { ...history, settings: (args as { settings: unknown }).settings };
      return history;
    });
    render(<ClipboardHistory />);
    fireEvent.click(await screen.findByRole("button", { name: "Enable text history" }));
    expect(invokeMock.mock.calls.some(([name]) => name === "utility_clipboard_configure")).toBe(false);
    expect(screen.getByRole("dialog")).toHaveTextContent("unmarked secrets");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Enable history" }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("utility_clipboard_configure", expect.objectContaining({ settings: expect.objectContaining({ enabled: true, paused: false, retentionHours: 1 }) })));
    expect(await screen.findByRole("button", { name: "Pause history" })).toBeVisible();
  });
  it("never clears remembered copies when the confirmation is cancelled", async () => {
    invokeMock.mockResolvedValue({ ...history, entries: [{ id: "entry", text: "My draft", frontmostApp: "com.example.Editor", capturedAt: 100, pinned: false }] });
    render(<ClipboardHistory />);
    fireEvent.click(await screen.findByRole("button", { name: "Clear history" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(invokeMock.mock.calls.some(([name]) => name === "utility_clipboard_action")).toBe(false);
    expect(screen.getByText("My draft")).toBeVisible();
  });
  it("saves exclusions while paused without resuming collection", async () => {
    const paused = { ...history, settings: { ...history.settings, enabled: true, paused: true } };
    invokeMock.mockImplementation(async (command, args) => command === "utility_clipboard_configure" ? { ...paused, settings: (args as { settings: unknown }).settings } : paused);
    render(<ClipboardHistory />);
    fireEvent.change(await screen.findByLabelText("Excluded application bundle IDs · one per line"), { target: { value: "com.example.Editor" } });
    fireEvent.click(screen.getByRole("button", { name: "Save history settings" }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("utility_clipboard_configure", expect.objectContaining({ updatePreferences: true, settings: expect.objectContaining({ paused: true, excludedApps: ["com.example.Editor"] }) })));
    expect(await screen.findByText("History settings saved. Collection remains paused.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Resume history" })).toBeVisible();
  });
  it("preserves a recognized result when a later capture is cancelled", async () => {
    invokeMock.mockResolvedValueOnce({ text: "Saved result", codes: ["https://example.com"] }).mockResolvedValueOnce(null);
    render(<ScreenTextCapture />);
    fireEvent.click(screen.getByRole("button", { name: "Extract screen text" }));
    expect(await screen.findByLabelText("Recognized text · select to copy")).toHaveValue("Saved result");
    fireEvent.click(screen.getByRole("button", { name: "Extract screen text" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Capture cancelled"));
    expect(screen.getByLabelText("Recognized text · select to copy")).toHaveValue("Saved result");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
  it("does not poll metrics until started and ignores a result after pause", async () => {
    let resolve: (value: unknown) => void = () => {};
    invokeMock.mockImplementation(() => new Promise((done) => { resolve = done; }));
    render(<NativeSystemMonitor />);
    expect(invokeMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Start monitor" }));
    expect(invokeMock).toHaveBeenCalledWith("utility_live_metrics");
    fireEvent.click(screen.getByRole("button", { name: "Pause monitor" }));
    await act(async () => resolve({ cpuPercent: 88, interfaces: [] }));
    expect(screen.queryByText("88.0%")).not.toBeInTheDocument();
  });
});
