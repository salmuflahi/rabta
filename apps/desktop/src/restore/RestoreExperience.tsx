import { Check, Circle, GitBranch, Globe, Minus, TriangleAlert, Code2, Terminal as TerminalIcon, Box } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AnimatedMark } from "@/components/AnimatedMark";
import { Button } from "@/components/ui/button";
import { Row } from "@/components/ui/row";
import { Section } from "@/components/ui/section";
import { Surface } from "@/components/ui/surface";
import { announce } from "@/lib/announce";
import { RESTORE_SHEET_EASE, SPRING_EASE, prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { RestoreResult, RestoreStage, RestoreTool, ToolRestoreStatus } from "./types";

/**
 * The Restore Experience — Rabta's signature "compact, truthful restore
 * sheet" shown when a task is Resumed. See
 * docs/superpowers/specs/2026-07-22-restore-experience-spec.md for the full
 * product spec this file implements.
 *
 * ISOLATED / not yet wired to the real Resume flow — see `useRestore` below
 * for the public API a future integration will call with a `run` that
 * invokes `activate_task` and normalizes the result via
 * `./normalize`'s `activateSummaryToResult`. The dev playground
 * (`SettingsPage.tsx`, DEV-only) exercises every scenario with scripted
 * `run`s in the meantime.
 */

// ---- timing (ms) — see spec's FRAME 3/4 and row sections ----
const SHEET_DELAY_MS = 50; // sheet begins ~40-60ms after the backdrop
const SHEET_MS = 200;
const ROW_MS = 155;
const ROW_STAGGER_MS = 30;
const EMIT_REVEAL_STAGGER_MS = 40; // PATH-B: 35-50ms stagger revealing finals
// Ink redesign (2026-08, recorded divergence): the completed state holds
// long enough for the check draw (240ms, immediate) and the bloom's peak
// to land before the close begins — roughly double the handoff's 220ms,
// still short enough that Resume never feels gated on theatre.
const HOLD_MS = 480;
const CLOSE_MS = 170;
const MIN_VISIBLE_MS = 450; // dismissal-only minimum; never delays the real restore
const REDUCED_MS = 110; // reduced-motion: simple ~100-120ms opacity

function sleepViaTimer(ms: number, timersRef: React.MutableRefObject<ReturnType<typeof setTimeout>[]>): Promise<void> {
  return new Promise((resolve) => {
    const id = setTimeout(() => {
      timersRef.current = timersRef.current.filter((t) => t !== id);
      resolve();
    }, ms);
    timersRef.current.push(id);
  });
}

// connector kind -> left-of-row icon. Falls back to a generic box for any
// kind not in this small known set (never hard-code which tools exist).
const KIND_ICON: Record<string, typeof Box> = {
  vscode: Code2,
  cursor: Code2,
  chrome: Globe,
  git: GitBranch,
  terminal: TerminalIcon,
};
function kindIcon(kind: string): typeof Box {
  return KIND_ICON[kind.toLowerCase()] ?? Box;
}

function headingFor(stage: RestoreStage, title: string): string {
  switch (stage) {
    case "success":
      return "Workspace restored";
    case "partial":
      return "Workspace partially restored";
    case "failure":
      return "Couldn't restore workspace";
    default:
      return title;
  }
}

function statusLabel(status: ToolRestoreStatus, message?: string): string {
  switch (status) {
    case "waiting":
      return "Waiting";
    case "restoring":
      return "Restoring…";
    case "applied":
      return "Restored";
    case "skipped":
      return message ?? "Skipped";
    case "failed":
      return message ?? "Couldn't restore";
  }
}

/** Right-aligned status icon+text for a single row. Only opacity/transform
 * are animated (per spec's performance constraints); a short pulse plays
 * whenever `status` changes so restoring->applied reads as a crossfade
 * rather than an instant swap. Exported so tests can render it standalone
 * (see the "restoring status" suite in RestoreExperience.test.tsx). */
export function ToolStatus({
  status,
  message,
  reducedMotion,
}: {
  status: ToolRestoreStatus;
  message?: string;
  reducedMotion: boolean;
}) {
  const prevStatusRef = useRef(status);
  const [settled, setSettled] = useState(true);

  useEffect(() => {
    if (prevStatusRef.current === status) return;
    prevStatusRef.current = status;
    if (reducedMotion) return;
    setSettled(false);
    const id = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(id);
  }, [status, reducedMotion]);

  const toneClass =
    status === "applied"
      ? "text-ok"
      : status === "failed"
        ? "text-bad"
        : status === "restoring"
          ? "text-foreground"
          : "text-muted-foreground";

  // "Applied" is the terminal good news — it lands with a small overshoot
  // pop (SPRING_EASE) where every other change keeps the settling curve.
  const transformEase = status === "applied" ? SPRING_EASE : RESTORE_SHEET_EASE;
  const unsettledScale = status === "applied" ? "scale(0.7)" : "scale(0.8)";

  let icon: ReactNode;
  if (status === "waiting") icon = <Circle className="size-3.5" />;
  else if (status === "restoring")
    // The same "live" motion a connected connector's dot uses — one
    // vocabulary for "this is working" across the app, instead of a
    // bootstrap-era spinner here and a ping over there. Gated at the call
    // site rather than by the global reduced-motion rule so the dot renders
    // solid and still, not a halo frozen mid-expansion.
    icon = (
      <span className="relative grid size-3.5 place-items-center">
        {!reducedMotion && (
          <span className="absolute size-2 animate-live-ping rounded-full bg-foreground" />
        )}
        <span className="size-2 rounded-full bg-foreground" />
      </span>
    );
  else if (status === "applied") icon = <Check className="size-3.5" />;
  else if (status === "skipped") icon = <Minus className="size-3.5" />;
  else icon = <TriangleAlert className="size-3.5" />;

  // The terminal states land as tinted pills — good news is green material,
  // not just green letters. In-flight states stay quiet, unchipped text.
  const pillClass =
    status === "applied"
      ? "rounded-full bg-ok-soft px-2 py-[3px]"
      : status === "failed"
        ? "rounded-full bg-bad-soft px-2 py-[3px]"
        : status === "skipped"
          ? "rounded-full bg-muted px-2 py-[3px]"
          : "";

  return (
    <span
      className={cn("flex items-center gap-1.5 text-label", toneClass, pillClass)}
      style={{
        opacity: reducedMotion ? 1 : settled ? 1 : 0.35,
        transform: reducedMotion ? "none" : settled ? "scale(1)" : unsettledScale,
        transition: `opacity ${ROW_MS}ms ${RESTORE_SHEET_EASE}, transform ${ROW_MS}ms ${transformEase}`,
      }}
    >
      {icon}
      <span>{statusLabel(status, message)}</span>
    </span>
  );
}

function ToolRestoreRow({
  tool,
  status,
  message,
  index,
  reducedMotion,
}: {
  tool: RestoreTool;
  status: ToolRestoreStatus;
  message?: string;
  index: number;
  reducedMotion: boolean;
}) {
  const [visible, setVisible] = useState(reducedMotion);
  useEffect(() => {
    if (reducedMotion) {
      setVisible(true);
      return;
    }
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const Icon = kindIcon(tool.kind);

  return (
    <div
      className="flex min-h-[40px] items-center justify-between gap-3 border-b-[0.5px] border-border py-2 last:border-b-0"
      style={{
        opacity: reducedMotion ? 1 : visible ? 1 : 0,
        transform: reducedMotion ? "none" : visible ? "translateY(0)" : "translateY(4px)",
        transition: `opacity ${ROW_MS}ms ${RESTORE_SHEET_EASE}, transform ${ROW_MS}ms ${RESTORE_SHEET_EASE}`,
        transitionDelay: reducedMotion ? "0ms" : `${index * ROW_STAGGER_MS}ms`,
      }}
    >
      <span className="flex min-w-0 items-center gap-2.5 text-body text-foreground">
        {/* Icon chip: the tool sits in its own small surface, tinted by its
            terminal outcome so the row's news reads at a glance. */}
        <span className="grid size-7 shrink-0 place-items-center rounded-[7px] bg-muted text-muted-foreground">
          <Icon className="size-3.5" />
        </span>
        <span className="truncate">{tool.name}</span>
      </span>
      <ToolStatus status={status} message={message} reducedMotion={reducedMotion} />
    </div>
  );
}

/** The crown — the restore's progress as the sheet's top edge, not a
 * buried underline. Ember shimmer while indeterminate; on resolve the tone
 * fill sweeps closed left-to-right (transform-only). */
function RestoreProgress({ stage, reducedMotion }: { stage: RestoreStage; reducedMotion: boolean }) {
  const resolved = stage === "success" || stage === "partial" || stage === "failure" || stage === "closing";
  const toneClass =
    stage === "success"
      ? "bg-ok"
      : stage === "partial"
        ? "bg-warn"
        : stage === "failure"
          ? "bg-bad"
          : "bg-primary";

  const [swept, setSwept] = useState(false);
  useEffect(() => {
    if (!resolved || reducedMotion) return;
    const id = requestAnimationFrame(() => setSwept(true));
    return () => cancelAnimationFrame(id);
  }, [resolved, reducedMotion]);

  return (
    <div
      className="absolute inset-x-0 top-0 h-[3px] overflow-hidden rounded-t-2xl bg-muted/70"
      aria-hidden="true"
    >
      {resolved ? (
        <div
          className={cn("h-full", toneClass)}
          style={{
            width: "100%",
            transformOrigin: "0 50%",
            transform: reducedMotion ? "none" : swept ? "scaleX(1)" : "scaleX(0.35)",
            transition: reducedMotion
              ? `background-color ${REDUCED_MS}ms ${RESTORE_SHEET_EASE}`
              : `transform 320ms ${RESTORE_SHEET_EASE}, background-color 160ms ${RESTORE_SHEET_EASE}`,
          }}
        />
      ) : reducedMotion ? (
        // Reduced-motion indeterminate: a neutral full-width track with a
        // gentle opacity-only pulse — never a fixed partial fill, which
        // could be misread as measured (and stalled) progress.
        <div className="h-full w-full bg-muted-foreground/50 animate-restore-pulse" />
      ) : (
        <div className="absolute inset-y-0 w-1/3 animate-restore-shimmer rounded-full" style={{ background: "var(--ember-line)" }} />
      )}
    </div>
  );
}

/** The success badge: the check draws itself (stroke-dashoffset) while the
 * badge pops in with a slight overshoot — the ceremony's "it landed"
 * gesture. Reduced motion renders the finished badge outright. */
function SuccessBadge({ reducedMotion }: { reducedMotion: boolean }) {
  const [drawn, setDrawn] = useState(reducedMotion);
  useEffect(() => {
    if (reducedMotion) return;
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, [reducedMotion]);
  // The check path is ~12.1 units long at this geometry; 13 covers it.
  const DASH = 13;
  return (
    <span
      className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-ok text-card"
      style={{
        opacity: reducedMotion ? 1 : drawn ? 1 : 0,
        transform: reducedMotion ? "none" : drawn ? "scale(1)" : "scale(0.5)",
        transition: reducedMotion ? "none" : `opacity 200ms ${RESTORE_SHEET_EASE}, transform 260ms ${SPRING_EASE}`,
      }}
    >
      <svg viewBox="0 0 12 12" className="size-2.5" fill="none" aria-hidden="true">
        <path
          d="M2.5 6.5 L5 9 L9.5 3.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={DASH}
          strokeDashoffset={reducedMotion ? 0 : drawn ? 0 : DASH}
          style={reducedMotion ? undefined : { transition: `stroke-dashoffset 240ms ${RESTORE_SHEET_EASE}` }}
        />
      </svg>
    </span>
  );
}

function RestoreHeader({
  title,
  subtitle,
  stage,
  titleId,
  reducedMotion,
}: {
  title: string;
  subtitle?: string;
  stage: RestoreStage;
  titleId: string;
  reducedMotion: boolean;
}) {
  const showCheck = stage === "success";
  return (
    <div className="relative flex items-center gap-3">
      {/* Success bloom — one brand-warm breath radiating from the mark.
          Behind the header content, opacity/transform only, plays once. */}
      {showCheck && !reducedMotion && (
        <span
          className="pointer-events-none absolute -left-16 -top-16 size-40 animate-restore-bloom rounded-full"
          style={{ background: "radial-gradient(circle, #FF6B2C 0%, transparent 65%)" }}
          aria-hidden="true"
        />
      )}
      <span className="relative inline-flex shrink-0">
        {/* The Bond on its ink badge — Rabta's orange link draws and
            un-draws while tools re-link, and completes when the work does.
            The badge is always ink, in both themes: it is the brand object,
            not a themed surface. */}
        <span
          className="grid size-9 place-items-center rounded-[9px]"
          style={{ background: "#0C0E12" }}
        >
          <AnimatedMark
            mode={reducedMotion ? "static" : stage === "opening" || stage === "restoring" ? "enter" : "complete"}
            size={26}
            stroke="#F3F0E8"
          />
        </span>
        {showCheck && <SuccessBadge reducedMotion={reducedMotion} />}
      </span>
      <span className="min-w-0">
        <h2 id={titleId} className="truncate text-sheet font-semibold leading-tight text-foreground">
          {headingFor(stage, title)}
        </h2>
        {subtitle && <p className="truncate text-meta text-muted-foreground">{subtitle}</p>}
      </span>
    </div>
  );
}

function RestoreActions({
  stage,
  resultError,
  detailsOpen,
  onToggleDetails,
  onClose,
  onRetry,
}: {
  stage: RestoreStage;
  resultError?: string;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  onClose: () => void;
  onRetry: () => void;
}) {
  if (stage === "failure") {
    return (
      <div className="mt-4 flex flex-col gap-2">
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button size="sm" variant="primary" onClick={onRetry}>
            Try again
          </Button>
        </div>
        {resultError && (
          <div className="text-meta text-muted-foreground">
            <button
              type="button"
              onClick={onToggleDetails}
              aria-expanded={detailsOpen}
              className="underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Technical details
            </button>
            {detailsOpen && (
              <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-2 font-mono text-label">
                {resultError}
              </pre>
            )}
          </div>
        )}
      </div>
    );
  }
  if (stage === "partial") {
    return (
      <div className="mt-4 flex flex-col gap-2">
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button size="sm" variant="secondary" onClick={onToggleDetails} aria-expanded={detailsOpen}>
            View details
          </Button>
        </div>
        {detailsOpen && (
          <div className="rounded-md bg-muted p-2 text-meta text-muted-foreground">
            {resultError ?? "Some tools were skipped or couldn't be restored — see the list above."}
          </div>
        )}
      </div>
    );
  }
  return null;
}

function RestoreOverlay({
  stage,
  title,
  subtitle,
  tools,
  statuses,
  resultError,
  closed,
  kept,
  reducedMotion,
  detailsOpen,
  onToggleDetails,
  onClose,
  onRetry,
  sheetRef,
  titleId,
}: {
  stage: RestoreStage;
  title: string;
  subtitle?: string;
  tools: RestoreTool[];
  statuses: Record<string, { status: ToolRestoreStatus; message?: string }>;
  resultError?: string;
  /** Items focus mode closed / left alone this run. Always arrays (never
   * undefined) — `useRestore` defaults a scripted result that omits them. */
  closed: string[];
  kept: [string, string][];
  reducedMotion: boolean;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  onClose: () => void;
  onRetry: () => void;
  sheetRef: React.RefObject<HTMLDivElement>;
  titleId: string;
}) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (stage === "opening") {
      sheetRef.current?.focus();
    }
  }, [stage, sheetRef]);

  const closing = stage === "closing";
  const backdropOpacity = closing ? 0 : entered ? 1 : 0;
  const sheetOpacity = closing ? 0 : entered ? 1 : 0;
  const sheetTransform = closing
    ? reducedMotion
      ? "none"
      : "translateY(-4px) scale(0.99)"
    : entered
      ? "translateY(0) scale(1)"
      : reducedMotion
        ? "none"
        : "translateY(8px) scale(0.985)";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* RestoreBackdrop */}
      <div
        className="absolute inset-0"
        style={{
          // --scrim, not --foreground: in dark theme --foreground is
          // near-WHITE, so tinting with it washed the whole app grey behind
          // the sheet. --scrim is the theme-correct dim (black .5 dark /
          // black .18 light) and exists for exactly this.
          backgroundColor: "var(--scrim)",
          opacity: backdropOpacity,
          transition: `opacity ${reducedMotion ? REDUCED_MS : 160}ms ${RESTORE_SHEET_EASE}`,
        }}
        aria-hidden="true"
      />

      {/* RestoreSheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative w-full max-w-[440px] outline-none focus-visible:ring-0"
        // min(): the inline style must never widen past the class's 440px —
        // a bare calc(100vw - 32px) overrides max-w-[440px] outright and
        // stretched the "compact sheet" across wide windows.
        style={{ maxWidth: "min(440px, calc(100vw - 32px))" }}
      >
        <div
          className="surface-rich relative rounded-2xl p-6 shadow-modal"
          style={{
            opacity: sheetOpacity,
            transform: sheetTransform,
            transition: reducedMotion
              ? `opacity ${REDUCED_MS}ms ${RESTORE_SHEET_EASE}`
              : `opacity ${SHEET_MS}ms ${RESTORE_SHEET_EASE} ${SHEET_DELAY_MS}ms, transform ${SHEET_MS}ms ${RESTORE_SHEET_EASE} ${SHEET_DELAY_MS}ms`,
          }}
        >
          <RestoreProgress stage={stage} reducedMotion={reducedMotion} />

          <RestoreHeader title={title} subtitle={subtitle} stage={stage} titleId={titleId} reducedMotion={reducedMotion} />

          <div role="status" aria-live="polite" className="mt-4">
            {tools.length === 0 ? (
              <p className="py-2 text-body text-muted-foreground">Nothing to restore for this task.</p>
            ) : (
              tools.map((tool, index) => {
                const entry = statuses[tool.id] ?? { status: "waiting" as ToolRestoreStatus };
                return (
                  <ToolRestoreRow
                    key={tool.id}
                    tool={tool}
                    status={entry.status}
                    message={entry.message}
                    index={index}
                    reducedMotion={reducedMotion}
                  />
                );
              })
            )}
          </div>

          {(closed.length > 0 || kept.length > 0) && (
            // Each half of the receipt is conditional on its own data: a
            // count is only ever stated for the side that actually
            // happened (never "0 put away"), and the Surface of kept
            // reasons only renders when there's something to put in it
            // (never an empty rounded, shadowed box). Either way the
            // Section still carries a truthful label, so this never reads
            // as a headerless box or a heading with nothing under it.
            <Section
              label={closed.length > 0 ? `${closed.length} put away` : `${kept.length} kept`}
              className="mt-3"
            >
              {kept.length > 0 && (
                <Surface>
                  {[...new Set(kept.map(([, reason]) => reason))].map((reason) => (
                    <Row
                      key={reason}
                      title={kept
                        .filter(([, r]) => r === reason)
                        .map(([item]) => item)
                        .join(", ")}
                      subtitle={reason}
                    />
                  ))}
                </Surface>
              )}
            </Section>
          )}

          <RestoreActions
            stage={stage}
            resultError={resultError}
            detailsOpen={detailsOpen}
            onToggleDetails={onToggleDetails}
            onClose={onClose}
            onRetry={onRetry}
          />
        </div>

      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// useRestore()

export interface StartOptions {
  title?: string;
  subtitle?: string;
  tools: RestoreTool[];
  run: (emit: (toolId: string, status: ToolRestoreStatus, message?: string) => void) => Promise<RestoreResult>;
  canRetry?: boolean;
  /** For the dev playground's reduced-motion preview; also honors the real
   * `prefers-reduced-motion` media query regardless of this prop. */
  forceReducedMotion?: boolean;
}

type ToolStatusMap = Record<string, { status: ToolRestoreStatus; message?: string }>;

/**
 * The one-line aggregate outcome announced once a restore's result is
 * known — shared by both places `runOnce` (below) reaches an ending: the
 * normal resolved path, and `opts.run()`'s promise rejecting outright.
 *
 * Counts a genuinely errored tool (`"failed"`) separately from everything
 * merely not-yet-applied (`"skipped"`, folded into "waiting" — the same
 * word the per-row `ToolStatus` label never uses for a real failure
 * either). Folding `"failed"` into "waiting" would understate a tool that
 * actually errored — the same misleading-toward-success shape Task 12's
 * review caught in the capture announcement, so this task's own second
 * finding gets the same fix. The "N waiting" clause is dropped entirely
 * when there's nothing left waiting (every tool either applied or failed),
 * and the "N failed" clause is dropped when nothing failed — the exact
 * wording the brief specified for the common case, unchanged.
 */
function restoreOutcomeAnnouncement(statuses: { status: ToolRestoreStatus }[]): string {
  const total = statuses.length;
  const applied = statuses.filter((t) => t.status === "applied").length;
  const failed = statuses.filter((t) => t.status === "failed").length;
  const waiting = total - applied - failed;
  const headline = `Restored ${applied} of ${total}.`;
  if (failed === 0) return `${headline} ${waiting} waiting.`;
  if (waiting === 0) return `${headline} ${failed} failed.`;
  return `${headline} ${waiting} waiting, ${failed} failed.`;
}

export function useRestore(): { start: (opts: StartOptions) => void; node: ReactNode; active: boolean } {
  const [stage, setStage] = useState<RestoreStage>("idle");
  const [title, setTitle] = useState("Restoring workspace");
  const [subtitle, setSubtitle] = useState<string | undefined>(undefined);
  const [toolsMeta, setToolsMeta] = useState<RestoreTool[]>([]);
  const [toolStatuses, setToolStatuses] = useState<ToolStatusMap>({});
  const [resultError, setResultError] = useState<string | undefined>(undefined);
  // Items focus mode closed / left alone this run — carried alongside
  // `resultError` from the resolved `RestoreResult`, same reset-per-run
  // lifecycle. Default empty so a scripted result that omits them (the dev
  // playground) renders no receipt line at all, not a crash.
  const [closed, setClosed] = useState<string[]>([]);
  const [kept, setKept] = useState<[string, string][]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);

  const runIdRef = useRef(0);
  const runningRef = useRef(false);
  const mountedRef = useRef(true);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const optsRef = useRef<StartOptions | null>(null);
  const triggerElRef = useRef<HTMLElement | null>(null);
  const openedAtRef = useRef(0);
  const emittedRef = useRef(false);
  // Set by the `!outcome.ok` branch below (run() itself rejecting) to the
  // run id whose forced-"failed" merge into `toolStatuses` needs an
  // aggregate announcement once it actually lands — see the effect right
  // after this declaration for why it can't announce inline.
  const pendingFailureAnnounceRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const id of timersRef.current) clearTimeout(id);
      timersRef.current = [];
    };
  }, []);

  // Companion to `pendingFailureAnnounceRef`. The `!outcome.ok` branch
  // merges every not-yet-resolved tool to "failed" via a `setToolStatuses`
  // updater, then needs to announce an aggregate count of the *result* of
  // that merge — but a `useState` updater function is not guaranteed to run
  // synchronously when `setState` is called (confirmed empirically: it
  // doesn't, reliably enough to build on), so capturing the merged map out
  // of the updater's own closure and reading it back immediately after
  // produced an empty, pre-merge snapshot in testing. Reading the
  // *committed* `toolStatuses` from here instead — an effect keyed on it,
  // gated on the pending flag — is the version that's actually correct.
  // The run-id guard rejects a stale flag: if a retry's fresh run has
  // already started by the time this fires, `runIdRef.current` has moved
  // on, and this pending announcement belongs to a run that's no longer
  // current.
  useEffect(() => {
    const pendingRunId = pendingFailureAnnounceRef.current;
    if (pendingRunId === null || pendingRunId !== runIdRef.current) return;
    pendingFailureAnnounceRef.current = null;
    announce(restoreOutcomeAnnouncement(Object.values(toolStatuses)));
  }, [toolStatuses]);

  const wait = useCallback((ms: number) => sleepViaTimer(ms, timersRef), []);

  const closeInternal = useCallback(
    async (myRunId: number, reduced: boolean) => {
      if (myRunId !== runIdRef.current || !mountedRef.current) return;
      setStage("closing");
      await wait(reduced ? REDUCED_MS : CLOSE_MS);
      if (myRunId !== runIdRef.current || !mountedRef.current) return;
      setStage("idle");
      setDetailsOpen(false);
      runningRef.current = false;
      const el = triggerElRef.current;
      triggerElRef.current = null;
      el?.focus?.();
    },
    [wait]
  );

  const runOnce = useCallback(
    (opts: StartOptions, myRunId: number) => {
      const reduced = Boolean(opts.forceReducedMotion) || prefersReducedMotion();
      setReducedMotion(reduced);
      emittedRef.current = false;

      const emit = (toolId: string, status: ToolRestoreStatus, message?: string) => {
        if (myRunId !== runIdRef.current || !mountedRef.current) return;
        emittedRef.current = true;
        setToolStatuses((prev) => ({ ...prev, [toolId]: { status, message } }));
      };

      void (async () => {
        const runPromise = opts.run(emit).then(
          (result): { ok: true; result: RestoreResult } => ({ ok: true, result }),
          (error): { ok: false; error: unknown } => ({ ok: false, error })
        );

        await wait(reduced ? 0 : SHEET_DELAY_MS + SHEET_MS);
        if (myRunId !== runIdRef.current || !mountedRef.current) return;
        setStage("restoring");
        openedAtRef.current = Date.now();

        const outcome = await runPromise;
        if (myRunId !== runIdRef.current || !mountedRef.current) return;

        if (!outcome.ok) {
          const message = outcome.error instanceof Error ? outcome.error.message : String(outcome.error);
          setResultError(message);
          setToolStatuses((prev) => {
            const next: ToolStatusMap = { ...prev };
            for (const t of opts.tools) {
              const current = next[t.id]?.status;
              if (!current || current === "waiting" || current === "restoring") {
                next[t.id] = { status: "failed", message: "Couldn't restore" };
              }
            }
            return next;
          });
          // Same aggregate voice as the resolved path below — a screen-
          // reader user should hear one outcome sentence regardless of how
          // the restore concluded, not silence just because this ending
          // came from run() throwing rather than resolving. (Task 12
          // review, Finding 2: this branch previously announced nothing.)
          // Deferred to the `pendingFailureAnnounceRef` effect above rather
          // than announced right here: it needs the *result* of the merge
          // just above, and a `setState` updater's own closure isn't a
          // reliable way to read that back synchronously — see that
          // effect's comment.
          pendingFailureAnnounceRef.current = myRunId;
          runningRef.current = false;
          setStage("failure");
          return;
        }

        const result = outcome.result;
        if (!emittedRef.current) {
          for (const toolResult of result.tools) {
            await wait(reduced ? 0 : EMIT_REVEAL_STAGGER_MS);
            if (myRunId !== runIdRef.current || !mountedRef.current) return;
            setToolStatuses((prev) => ({
              ...prev,
              [toolResult.id]: { status: toolResult.status, message: toolResult.message },
            }));
          }
        } else {
          setToolStatuses(() => {
            const next: ToolStatusMap = {};
            for (const toolResult of result.tools) {
              next[toolResult.id] = { status: toolResult.status, message: toolResult.message };
            }
            return next;
          });
        }
        setResultError(result.error);
        setClosed(result.closed ?? []);
        setKept(result.kept ?? []);
        runningRef.current = false;
        setStage(result.overall);

        // One summary line once the outcome is known, alongside the
        // per-row `role="status"` region above (which already speaks each
        // tool's status as it lands) — the thing a screen-reader user
        // otherwise has to reconstruct by listening to every row in turn.
        // `result.tools` — not `toolStatuses` — is the source: it's the
        // value actually driving this render, with no dependency on
        // whichever async reveal path (staggered emit vs. all-at-once,
        // just above) got there. Covers success, partial, AND failure:
        // `activateSummaryToResult` (restore/normalize.ts) can resolve with
        // `overall: "failure"` without ever rejecting, so this is the one
        // place that sees most real outcomes — the separate `!outcome.ok`
        // branch below covers the remaining one, run() itself throwing,
        // with the same announcement in the same voice.
        announce(restoreOutcomeAnnouncement(result.tools));

        if (result.overall === "success") {
          const elapsed = Date.now() - openedAtRef.current;
          if (elapsed < MIN_VISIBLE_MS) {
            await wait(MIN_VISIBLE_MS - elapsed);
            if (myRunId !== runIdRef.current || !mountedRef.current) return;
          }
          await wait(reduced ? REDUCED_MS : HOLD_MS);
          if (myRunId !== runIdRef.current || !mountedRef.current) return;
          void closeInternal(myRunId, reduced);
        }
      })();
    },
    [wait, closeInternal]
  );

  const start = useCallback(
    (opts: StartOptions) => {
      if (runningRef.current) return;
      runningRef.current = true;
      const myRunId = ++runIdRef.current;
      optsRef.current = opts;
      triggerElRef.current = typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;

      setTitle(opts.title ?? "Restoring workspace");
      setSubtitle(opts.subtitle);
      setToolsMeta(opts.tools);
      setToolStatuses(Object.fromEntries(opts.tools.map((t) => [t.id, { status: "waiting" as ToolRestoreStatus }])));
      setResultError(undefined);
      setClosed([]);
      setKept([]);
      setDetailsOpen(false);
      setStage("opening");

      // Announced here, not from the "restoring" stage runOnce reaches a
      // beat later: this is the moment the user's own action (clicking
      // Resume) actually kicks the run off, which is when a screen-reader
      // user should hear it — the gap between here and "restoring" is only
      // sheet-entrance animation timing, which has nothing to say to
      // someone who isn't watching it.
      announce(`Restoring ${opts.tools.length} items`);

      runOnce(opts, myRunId);
    },
    [runOnce]
  );

  const handleClose = useCallback(() => {
    void closeInternal(runIdRef.current, Boolean(optsRef.current?.forceReducedMotion) || prefersReducedMotion());
  }, [closeInternal]);

  const handleRetry = useCallback(() => {
    if (!optsRef.current || runningRef.current) return;
    start(optsRef.current);
  }, [start]);

  // Escape + Tab-trap while the sheet is up. Escape is swallowed (not a
  // dismiss) while a restore is actively in flight — the op can't be
  // cancelled — but works once the sheet has resolved to success / partial
  // / failure (or is already closing, where it's a no-op).
  useEffect(() => {
    if (stage === "idle") return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        if (stage === "opening" || stage === "restoring" || stage === "closing") return;
        handleClose();
        return;
      }
      if (e.key === "Tab" && sheetRef.current) {
        const focusables = Array.from(
          sheetRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  const node: ReactNode =
    stage === "idle" ? null : (
      <RestoreOverlay
        stage={stage}
        title={title}
        subtitle={subtitle}
        tools={toolsMeta}
        statuses={toolStatuses}
        resultError={resultError}
        closed={closed}
        kept={kept}
        reducedMotion={reducedMotion}
        detailsOpen={detailsOpen}
        onToggleDetails={() => setDetailsOpen((d) => !d)}
        onClose={handleClose}
        onRetry={handleRetry}
        sheetRef={sheetRef}
        titleId={titleId}
      />
    );

  return { start, node, active: stage !== "idle" };
}
