import { act, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockInvoke, renderWithProviders } from "@/test/smoke-utils";
import { useResumeCeremony, type ActivateSummary } from "./ResumeCeremony";

function stubMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches }) as unknown as typeof window.matchMedia;
}

const TASK = { id: "t1", title: "Fix login" };

/** Tiny harness: calls `start` once on mount and renders whatever overlay
 * the hook hands back (null when idle). */
function Harness({
  onComplete,
  onError,
}: {
  onComplete: (s: ActivateSummary) => void;
  onError: (e: unknown) => void;
}) {
  const { start, overlay } = useResumeCeremony({ onComplete, onError });
  useEffect(() => {
    start(TASK);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <>{overlay}</>;
}

describe("useResumeCeremony", () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    if (originalMatchMedia) {
      window.matchMedia = originalMatchMedia;
    } else {
      // @ts-expect-error - test cleanup restoring an absent global
      delete window.matchMedia;
    }
    vi.restoreAllMocks();
  });

  it("full motion: shows the overlay driven by the real summary, then completes and unmounts", async () => {
    stubMatchMedia(false);
    const summary: ActivateSummary = {
      applied: ["vscode", "git"],
      pending: [],
      skipped: [],
      savedPrevious: null,
      errors: [],
    };
    mockInvoke.mockResolvedValueOnce(summary);

    const onComplete = vi.fn();
    const onError = vi.fn();
    renderWithProviders(<Harness onComplete={onComplete} onError={onError} />);

    // Overlay appears immediately (folding phase), titled with the real task.
    expect(await screen.findByText("Resuming Fix login")).toBeInTheDocument();

    // Eventually the checklist rows (from the real summary) render.
    await waitFor(() => expect(screen.getByText("VS Code")).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText("Git")).toBeInTheDocument();

    // The ceremony completes with the exact real summary and tears itself down.
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(summary), { timeout: 3000 });
    expect(onError).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText("Resuming Fix login")).not.toBeInTheDocument());
  });

  it("reduced motion: renders no overlay and completes instantly with the real summary", async () => {
    stubMatchMedia(true);
    const summary: ActivateSummary = {
      applied: [],
      pending: [],
      skipped: [],
      savedPrevious: null,
      errors: [],
    };
    mockInvoke.mockResolvedValueOnce(summary);

    const onComplete = vi.fn();
    const onError = vi.fn();
    renderWithProviders(<Harness onComplete={onComplete} onError={onError} />);

    expect(screen.queryByText(/Resuming/)).not.toBeInTheDocument();

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(summary), { timeout: 3000 });
    expect(onError).not.toHaveBeenCalled();
    expect(screen.queryByText(/Resuming/)).not.toBeInTheDocument();
  });

  it("error path: invoke rejects, onError fires and the overlay settles back to idle", async () => {
    stubMatchMedia(false);
    const boom = new Error("activate_task failed");
    mockInvoke.mockRejectedValueOnce(boom);

    const onComplete = vi.fn();
    const onError = vi.fn();
    renderWithProviders(<Harness onComplete={onComplete} onError={onError} />);

    expect(await screen.findByText("Resuming Fix login")).toBeInTheDocument();

    await waitFor(() => expect(onError).toHaveBeenCalledWith(boom), { timeout: 3000 });
    expect(onComplete).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText("Resuming Fix login")).not.toBeInTheDocument());
  });

  it("resolved-with-errors: onComplete fires (not onError) with the full summary", async () => {
    stubMatchMedia(false);
    // A resolved `activate_task` whose summary carries non-empty `errors`
    // (e.g. a connector wobble) still resolved successfully — that always
    // routes to onComplete so the page's toastActivation can surface the
    // "Resumed with notes" toast with full applied/pending/skipped/errors
    // detail. onError is reserved for a rejected/thrown invoke promise.
    const summary: ActivateSummary = {
      applied: ["git"],
      pending: [],
      skipped: ["vscode"],
      savedPrevious: null,
      errors: ["chrome: connector timed out"],
    };
    mockInvoke.mockResolvedValueOnce(summary);

    const onComplete = vi.fn();
    const onError = vi.fn();
    renderWithProviders(<Harness onComplete={onComplete} onError={onError} />);

    expect(await screen.findByText("Resuming Fix login")).toBeInTheDocument();

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(summary), { timeout: 3000 });
    expect(onError).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText("Resuming Fix login")).not.toBeInTheDocument());
  });

  it("hang/cap: a never-resolving invoke still tears the overlay down after MAX_RESTORE_MS", async () => {
    vi.useFakeTimers();
    try {
      stubMatchMedia(false);
      // Never resolves/rejects — simulates a hung `activate_task`.
      mockInvoke.mockReturnValueOnce(new Promise<ActivateSummary>(() => {}));

      const onComplete = vi.fn();
      const onError = vi.fn();
      renderWithProviders(<Harness onComplete={onComplete} onError={onError} />);

      // Drain the ceremony's full sequence of internal timers (fold, the
      // MAX_RESTORE_MS cap race, the restore-min top-up, unfold, fade) in
      // small steps, flushing microtasks between each so chained promises
      // (the `Promise.race`, `.then`s) actually settle.
      for (let i = 0; i < 20; i++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1000);
        });
      }

      // The overlay tears itself down (phase -> idle) even though the
      // underlying invoke never settled — it never freezes the UI. Neither
      // callback fires because the real result never arrives.
      expect(screen.queryByText(/Resuming/)).not.toBeInTheDocument();
      expect(onComplete).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
