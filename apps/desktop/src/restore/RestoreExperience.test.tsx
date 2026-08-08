import { act, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/smoke-utils";
import { useRestore, type StartOptions } from "./RestoreExperience";
import type { RestoreResult } from "./types";

const TOOLS: StartOptions["tools"] = [
  { id: "vscode-1", name: "VS Code", kind: "vscode" },
  { id: "chrome-1", name: "Chrome", kind: "chrome" },
];

function stubMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches }) as unknown as typeof window.matchMedia;
}

/** Advances fake timers in small steps (flushing microtasks between each via
 * `act`) until `predicate` is true, or throws after `maxSteps`. Using
 * `@testing-library`'s `waitFor`/`findBy*` here would hang: those poll via
 * real timers, which never fire while `vi.useFakeTimers()` is active — this
 * is the fake-timer-safe equivalent, and it doesn't require pre-computing
 * exact millisecond offsets through the run's several internal waits. */
async function advanceUntil(predicate: () => boolean, stepMs = 50, maxSteps = 100) {
  for (let i = 0; i < maxSteps; i++) {
    if (predicate()) return;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(stepMs);
    });
  }
  throw new Error(`advanceUntil: predicate never became true within ${stepMs * maxSteps}ms`);
}

/** Tiny harness: exposes `start` via a ref-less trigger button so a test can
 * kick off a run after render (mirrors how a real Resume button would call
 * `start`), and renders whatever `node` the hook hands back. */
function Harness({ run, forceReducedMotion }: { run: StartOptions["run"]; forceReducedMotion?: boolean }) {
  const { start, node } = useRestore();
  useEffect(() => {
    start({
      subtitle: "Fix login",
      tools: TOOLS,
      run,
      forceReducedMotion,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <>{node}</>;
}

describe("useRestore / RestoreExperience", () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    if (originalMatchMedia) {
      window.matchMedia = originalMatchMedia;
    } else {
      // @ts-expect-error - test cleanup restoring an absent global
      delete window.matchMedia;
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("scripted success run: opens, tools reach Restored, heading flips, then closes", async () => {
    stubMatchMedia(false);
    vi.useFakeTimers();

    const result: RestoreResult = {
      overall: "success",
      tools: [
        { id: "vscode-1", status: "applied" },
        { id: "chrome-1", status: "applied" },
      ],
    };
    const run = vi.fn().mockResolvedValue(result);

    renderWithProviders(<Harness run={run} />);

    expect(screen.getByText("Restoring workspace")).toBeInTheDocument();
    expect(run).toHaveBeenCalledTimes(1);

    // Drain the run's internal timers (sheet-open delay, emit-reveal
    // stagger) until the resolved heading appears.
    await advanceUntil(() => screen.queryByText("Workspace restored") !== null);
    expect(screen.getAllByText("Restored")).toHaveLength(2);

    // Keep draining (min-visible top-up, hold, close fade) until it closes
    // back onto idle (the dialog unmounts).
    await advanceUntil(() => screen.queryByRole("dialog") === null);
    expect(screen.queryByText("Workspace restored")).not.toBeInTheDocument();
  });

  it("failure run: heading flips to the failure state, sheet stays open, Try again is present", async () => {
    stubMatchMedia(false);
    vi.useFakeTimers();

    const boom = new Error("connector crashed");
    const run = vi.fn().mockRejectedValue(boom);

    renderWithProviders(<Harness run={run} />);

    await advanceUntil(() => screen.queryByText("Couldn't restore workspace") !== null);
    expect(screen.getByText("Couldn't restore workspace")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    // Stays open — no auto-close for a failure.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("reduced motion: shows every status without throwing, using real timers", async () => {
    stubMatchMedia(true);

    const result: RestoreResult = {
      overall: "partial",
      tools: [
        { id: "vscode-1", status: "applied" },
        { id: "chrome-1", status: "skipped", message: "On next reload" },
      ],
    };
    const run = vi.fn().mockResolvedValue(result);

    renderWithProviders(<Harness run={run} forceReducedMotion />);

    expect(await screen.findByText("Restoring workspace")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("Workspace partially restored")).toBeInTheDocument());
    expect(screen.getByText("Restored")).toBeInTheDocument();
    expect(screen.getByText("On next reload")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View details" })).toBeInTheDocument();
  });

  it("PATH-B (no emit): rows stay Waiting through the restoring stage, finals reveal only on resolve", async () => {
    stubMatchMedia(false);
    vi.useFakeTimers();

    let resolveRun!: (result: RestoreResult) => void;
    const run = vi.fn(
      () =>
        new Promise<RestoreResult>((resolve) => {
          resolveRun = resolve;
        })
    );

    renderWithProviders(<Harness run={run} />);
    expect(run).toHaveBeenCalledTimes(1);

    // Advance well past the sheet-open delay (SHEET_DELAY_MS + SHEET_MS =
    // 250ms) so the stage is definitely "restoring" — the `run` promise
    // above never resolves on its own, so nothing else can advance it.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    // No `emit` has ever been called: every row must still read "Waiting" —
    // never a per-tool "Restoring…", never a premature "Restored".
    expect(screen.getAllByText("Waiting")).toHaveLength(TOOLS.length);
    expect(screen.queryByText("Restoring…")).not.toBeInTheDocument();
    expect(screen.queryByText("Restored")).not.toBeInTheDocument();

    // Now resolve — truthful finals should reveal via the staggered
    // (35-50ms) reveal path, since nothing was emitted during the run.
    const result: RestoreResult = {
      overall: "success",
      tools: [
        { id: "vscode-1", status: "applied" },
        { id: "chrome-1", status: "applied" },
      ],
    };
    await act(async () => {
      resolveRun(result);
    });

    await advanceUntil(() => screen.queryAllByText("Restored").length === TOOLS.length);
    expect(screen.getAllByText("Restored")).toHaveLength(TOOLS.length);
    expect(screen.queryByText("Waiting")).not.toBeInTheDocument();
  });

  it("lists what was put away and each distinct reason it kept something", async () => {
    stubMatchMedia(false);
    vi.useFakeTimers();

    const result: RestoreResult = {
      overall: "success",
      tools: [
        { id: "vscode-1", status: "applied" },
        { id: "chrome-1", status: "applied" },
      ],
      closed: ["https://stray.test/"],
      // Three kept items, only two distinct reasons — "unsaved changes" is
      // shared by two of them, so this is the pair that actually proves
      // dedupe: a naive one-row-per-item rendering would print it twice.
      kept: [
        ["draft.md", "unsaved changes"],
        ["notes.md", "unsaved changes"],
        ["zsh", "running something"],
      ],
    };
    const run = vi.fn().mockResolvedValue(result);

    renderWithProviders(<Harness run={run} />);
    await advanceUntil(() => screen.queryByText("Workspace restored") !== null);

    // `findByRole` polls via real timers and would hang under fake timers
    // (see the file-level comment on `advanceUntil`); the DOM has already
    // settled by this point, so a synchronous query is correct here.
    const receipt = screen.getByRole("region", { name: /put away/i });
    expect(receipt).toHaveTextContent("1 put away");
    // Three kept items, two distinct reasons — each reason listed once.
    expect(receipt).toHaveTextContent("unsaved changes");
    expect(receipt).toHaveTextContent("running something");
    expect(receipt.textContent!.match(/unsaved changes/g)).toHaveLength(1);
  });

  it("reads as a plain report, not an error", async () => {
    stubMatchMedia(false);
    vi.useFakeTimers();

    const result: RestoreResult = {
      overall: "success",
      tools: [
        { id: "vscode-1", status: "applied" },
        { id: "chrome-1", status: "applied" },
      ],
      closed: ["https://stray.test/"],
      kept: [
        ["draft.md", "unsaved changes"],
        ["notes.md", "unsaved changes"],
        ["zsh", "running something"],
      ],
    };
    const run = vi.fn().mockResolvedValue(result);

    renderWithProviders(<Harness run={run} />);
    await advanceUntil(() => screen.queryByText("Workspace restored") !== null);

    const receipt = screen.getByRole("region", { name: /put away/i });
    // Refusing is a correct outcome. Nothing here may look like a failure.
    expect(receipt.className).not.toMatch(/destructive|warning/);
    expect(receipt.querySelector(".bg-primary")).toBeNull();
  });

  it("renders nothing extra when focus mode closed and kept nothing", async () => {
    stubMatchMedia(false);
    vi.useFakeTimers();

    const result: RestoreResult = {
      overall: "success",
      tools: [
        { id: "vscode-1", status: "applied" },
        { id: "chrome-1", status: "applied" },
      ],
      closed: [],
      kept: [],
    };
    const run = vi.fn().mockResolvedValue(result);

    renderWithProviders(<Harness run={run} />);
    await advanceUntil(() => screen.queryByText("Workspace restored") !== null);

    expect(screen.queryByText(/put away/)).not.toBeInTheDocument();
    expect(screen.queryByText(/kept/)).not.toBeInTheDocument();
  });
});
