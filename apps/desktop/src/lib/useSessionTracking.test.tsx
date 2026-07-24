import { act, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockInvoke } from "@/test/smoke-utils";
import { useSessionTracking } from "./useSessionTracking";

const HEARTBEAT_MS = 15_000;
const IDLE_MS = 60_000;

describe("useSessionTracking", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("reports initial focus, heartbeats, enters idle, and resumes on keyboard activity", async () => {
    renderHook(() => useSessionTracking());

    expect(mockInvoke).toHaveBeenCalledWith("session_update", {
      focused: true,
      idle: false,
    });

    await act(() => vi.advanceTimersByTimeAsync(HEARTBEAT_MS));
    expect(mockInvoke).toHaveBeenCalledWith("session_heartbeat");

    await act(() => vi.advanceTimersByTimeAsync(IDLE_MS - HEARTBEAT_MS));
    expect(mockInvoke).toHaveBeenCalledWith("session_update", {
      focused: true,
      idle: true,
    });

    await act(async () => {
      fireEvent.keyDown(window, { key: "a" });
      await Promise.resolve();
    });
    expect(mockInvoke).toHaveBeenLastCalledWith("session_update", {
      focused: true,
      idle: false,
    });
  });

  it("reports window focus changes and current document visibility", async () => {
    const hidden = vi.spyOn(document, "hidden", "get");
    renderHook(() => useSessionTracking());
    await act(async () => Promise.resolve());
    mockInvoke.mockClear();

    await act(async () => {
      fireEvent.blur(window);
      await Promise.resolve();
    });
    expect(mockInvoke).toHaveBeenLastCalledWith("session_update", {
      focused: false,
      idle: false,
    });

    hidden.mockReturnValue(true);
    await act(async () => {
      fireEvent(document, new Event("visibilitychange"));
      await Promise.resolve();
    });
    expect(mockInvoke).toHaveBeenLastCalledWith("session_update", {
      focused: false,
      idle: false,
    });

    hidden.mockReturnValue(false);
    await act(async () => {
      fireEvent.focus(window);
      await Promise.resolve();
    });
    expect(mockInvoke).toHaveBeenLastCalledWith("session_update", {
      focused: true,
      idle: false,
    });
  });

  it("resets the idle deadline without reporting ordinary pointer movement", async () => {
    renderHook(() => useSessionTracking());
    mockInvoke.mockClear();

    await act(() => vi.advanceTimersByTimeAsync(IDLE_MS - 1_000));
    fireEvent.pointerMove(window);

    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(mockInvoke).not.toHaveBeenCalledWith("session_update", {
      focused: true,
      idle: true,
    });

    await act(() => vi.advanceTimersByTimeAsync(IDLE_MS - 1_000));
    expect(mockInvoke).toHaveBeenCalledWith("session_update", {
      focused: true,
      idle: true,
    });

    mockInvoke.mockClear();
    await act(async () => {
      fireEvent.pointerMove(window);
      await Promise.resolve();
    });
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith("session_update", {
      focused: true,
      idle: false,
    });
  });

  it("serializes lifecycle updates in the order transitions were observed", async () => {
    let resolveFirstUpdate: (() => void) | undefined;
    let updateCount = 0;
    mockInvoke.mockImplementation((command) => {
      if (command !== "session_update") {
        return Promise.resolve(undefined);
      }
      updateCount += 1;
      if (updateCount === 1) {
        return new Promise<void>((resolve) => {
          resolveFirstUpdate = resolve;
        });
      }
      return Promise.resolve(undefined);
    });

    renderHook(() => useSessionTracking());
    fireEvent.blur(window);
    fireEvent.focus(window);

    expect(
      mockInvoke.mock.calls.filter(([command]) => command === "session_update")
    ).toHaveLength(1);

    await act(async () => {
      resolveFirstUpdate?.();
      for (let flush = 0; flush < 5; flush += 1) {
        await Promise.resolve();
      }
    });

    expect(
      mockInvoke.mock.calls.filter(([command]) => command === "session_update")
    ).toEqual([
      ["session_update", { focused: true, idle: false }],
      ["session_update", { focused: false, idle: false }],
      ["session_update", { focused: true, idle: false }],
    ]);
  });

  it("resumes from idle on nested scrolling and pointer activity", async () => {
    const scroller = document.createElement("main");
    document.body.appendChild(scroller);
    renderHook(() => useSessionTracking());

    await act(() => vi.advanceTimersByTimeAsync(IDLE_MS));
    mockInvoke.mockClear();
    await act(async () => {
      fireEvent.scroll(scroller);
      await Promise.resolve();
    });
    expect(mockInvoke).toHaveBeenCalledWith("session_update", {
      focused: true,
      idle: false,
    });

    await act(() => vi.advanceTimersByTimeAsync(IDLE_MS));
    mockInvoke.mockClear();
    await act(async () => {
      fireEvent.pointerDown(scroller);
      await Promise.resolve();
    });
    expect(mockInvoke).toHaveBeenCalledWith("session_update", {
      focused: true,
      idle: false,
    });

    scroller.remove();
  });

  it("removes listeners and timers when unmounted", async () => {
    const { unmount } = renderHook(() => useSessionTracking());
    mockInvoke.mockClear();

    unmount();
    fireEvent.keyDown(window, { key: "a" });
    fireEvent.pointerDown(window);
    fireEvent.pointerMove(window);
    fireEvent.scroll(window);
    fireEvent.blur(window);
    fireEvent.focus(window);
    fireEvent(document, new Event("visibilitychange"));
    await act(() => vi.advanceTimersByTimeAsync(IDLE_MS));

    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("logs rejected lifecycle invokes without leaking an unhandled rejection", async () => {
    const error = new Error("backend unavailable");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockInvoke.mockRejectedValue(error);

    renderHook(() => useSessionTracking());
    await act(async () => Promise.resolve());

    expect(consoleError).toHaveBeenCalledWith("session update failed:", error);

    consoleError.mockClear();
    await act(() => vi.advanceTimersByTimeAsync(HEARTBEAT_MS));
    expect(consoleError).toHaveBeenCalledWith("session heartbeat failed:", error);
  });
});
