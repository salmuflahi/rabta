import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components/ui/sonner";
import { useDeferredDelete } from "./useDeferredDelete";

// The hook calls the sonner `toast` function directly (for the Undo action
// button), not the toastOk/toastErr wrappers. Replace it with a plain mock so
// tests can inspect the message/options without rendering an actual <Toaster/>
// (sonner's toasts are a global queue that only becomes visible DOM once a
// <Toaster/> is mounted — asserting on the mock call is the deterministic,
// non-flaky equivalent for these hook-level tests).
vi.mock("@/components/ui/sonner", () => {
  const fn = vi.fn();
  return { toast: Object.assign(fn, { success: vi.fn(), error: vi.fn() }) };
});

function mockedToast() {
  return toast as unknown as ReturnType<typeof vi.fn>;
}

interface Item {
  id: string;
  name: string;
}

describe("useDeferredDelete", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedToast().mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("requestDelete hides the item, shows an Undo toast, and does not commit immediately", () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useDeferredDelete<Item>({ commit, labelOf: (i) => i.name, delayMs: 5000 })
    );

    act(() => {
      result.current.requestDelete({ id: "a", name: "Alpha" });
    });

    expect(result.current.pendingIds.has("a")).toBe(true);
    expect(commit).not.toHaveBeenCalled();

    expect(mockedToast()).toHaveBeenCalledTimes(1);
    const [message, options] = mockedToast().mock.calls[0];
    expect(message).toBe("Alpha deleted");
    expect(options.action.label).toBe("Undo");
    expect(options.duration).toBe(5000);
  });

  it("clicking the toast's Undo action cancels the timer and un-hides the item; commit never fires", async () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useDeferredDelete<Item>({ commit, labelOf: (i) => i.name })
    );

    act(() => {
      result.current.requestDelete({ id: "a", name: "Alpha" });
    });
    expect(result.current.pendingIds.has("a")).toBe(true);

    const [, options] = mockedToast().mock.calls[0];
    act(() => {
      options.action.onClick();
    });

    expect(result.current.pendingIds.has("a")).toBe(false);

    // Even if time elapses afterwards, the cancelled timer must not fire.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(commit).not.toHaveBeenCalled();
  });

  it("letting the timer elapse commits exactly once with the right item and stays hidden", async () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const onCommitted = vi.fn();
    const { result } = renderHook(() =>
      useDeferredDelete<Item>({ commit, labelOf: (i) => i.name, onCommitted, delayMs: 5000 })
    );

    act(() => {
      result.current.requestDelete({ id: "a", name: "Alpha" });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith({ id: "a", name: "Alpha" });
    expect(onCommitted).toHaveBeenCalledTimes(1);
    expect(result.current.pendingIds.has("a")).toBe(false);
  });

  it("a failed commit restores the item (removes it from pendingIds) instead of leaving it hidden", async () => {
    const commit = vi.fn().mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() =>
      useDeferredDelete<Item>({ commit, labelOf: (i) => i.name, delayMs: 5000 })
    );

    act(() => {
      result.current.requestDelete({ id: "a", name: "Alpha" });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(commit).toHaveBeenCalledTimes(1);
    expect(result.current.pendingIds.has("a")).toBe(false);
  });

  it("multiple concurrent pending deletes are independent of each other", async () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useDeferredDelete<Item>({ commit, labelOf: (i) => i.name, delayMs: 5000 })
    );

    act(() => {
      result.current.requestDelete({ id: "a", name: "Alpha" });
      result.current.requestDelete({ id: "b", name: "Beta" });
    });
    expect(result.current.pendingIds.has("a")).toBe(true);
    expect(result.current.pendingIds.has("b")).toBe(true);

    // Undo only "a".
    const undoA = mockedToast().mock.calls[0][1].action.onClick;
    act(() => undoA());
    expect(result.current.pendingIds.has("a")).toBe(false);
    expect(result.current.pendingIds.has("b")).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith({ id: "b", name: "Beta" });
    expect(result.current.pendingIds.has("b")).toBe(false);
  });

  it("unmounting with a pending delete flushes it (commits immediately)", () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() =>
      useDeferredDelete<Item>({ commit, labelOf: (i) => i.name, delayMs: 5000 })
    );

    act(() => {
      result.current.requestDelete({ id: "a", name: "Alpha" });
    });
    expect(commit).not.toHaveBeenCalled();

    unmount();

    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith({ id: "a", name: "Alpha" });
  });
});
