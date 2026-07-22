import { Check, Circle, GitBranch, Globe, Loader2, Minus, TriangleAlert, Code2, Terminal as TerminalIcon, Box } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import markUrl from "@/assets/brand/rabta-mark.svg";
import { Button } from "@/components/ui/button";
import { RESTORE_SHEET_EASE, prefersReducedMotion } from "@/lib/motion";
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

// ---- timing (ms) — see spec's FRAME 3/4 and row/fold sections ----
const SHEET_DELAY_MS = 50; // sheet begins ~40-60ms after the backdrop
const SHEET_MS = 200;
const FOLD_DELAY_MS = 100; // fold starts ~100ms after the sheet enters
const FOLD_MS = 180;
const ROW_MS = 155;
const ROW_STAGGER_MS = 30;
const EMIT_REVEAL_STAGGER_MS = 40; // PATH-B: 35-50ms stagger revealing finals
const HOLD_MS = 220; // hold ~180-250ms in the completed state before closing
const CLOSE_MS = 170;
const MIN_VISIBLE_MS = 450; // dismissal-only minimum; never delays the real restore
const REDUCED_MS = 110; // reduced-motion: simple ~100-120ms opacity
const FOLD_SIZE = 28;

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
 * rather than an instant swap. */
function StatusIndicator({
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
      ? "text-success"
      : status === "failed"
        ? "text-warning"
        : status === "restoring"
          ? "text-foreground"
          : "text-muted-foreground";

  let icon: ReactNode;
  if (status === "waiting") icon = <Circle className="size-3.5" />;
  else if (status === "restoring")
    icon = <Loader2 className={cn("size-3.5", !reducedMotion && "animate-spin")} />;
  else if (status === "applied") icon = <Check className="size-3.5" />;
  else if (status === "skipped") icon = <Minus className="size-3.5" />;
  else icon = <TriangleAlert className="size-3.5" />;

  return (
    <span
      className={cn("flex items-center gap-1.5 text-xs", toneClass)}
      style={{
        opacity: reducedMotion ? 1 : settled ? 1 : 0.35,
        transform: reducedMotion ? "none" : settled ? "scale(1)" : "scale(0.8)",
        transition: `opacity ${ROW_MS}ms ${RESTORE_SHEET_EASE}, transform ${ROW_MS}ms ${RESTORE_SHEET_EASE}`,
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
      className="flex min-h-[40px] items-center justify-between gap-3 border-b border-border/60 py-2 last:border-b-0"
      style={{
        opacity: reducedMotion ? 1 : visible ? 1 : 0,
        transform: reducedMotion ? "none" : visible ? "translateY(0)" : "translateY(4px)",
        transition: `opacity ${ROW_MS}ms ${RESTORE_SHEET_EASE}, transform ${ROW_MS}ms ${RESTORE_SHEET_EASE}`,
        transitionDelay: reducedMotion ? "0ms" : `${index * ROW_STAGGER_MS}ms`,
      }}
    >
      <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{tool.name}</span>
      </span>
      <StatusIndicator status={status} message={message} reducedMotion={reducedMotion} />
    </div>
  );
}

function RestoreProgress({ stage, reducedMotion }: { stage: RestoreStage; reducedMotion: boolean }) {
  const resolved = stage === "success" || stage === "partial" || stage === "failure" || stage === "closing";
  const toneClass =
    stage === "success"
      ? "bg-success"
      : stage === "partial"
        ? "bg-warning"
        : stage === "failure"
          ? "bg-destructive"
          : "bg-primary";

  return (
    <div className="relative mt-4 h-[2px] w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
      {resolved ? (
        <div
          className={cn("h-full rounded-full", toneClass)}
          style={{ width: "100%", transition: `background-color ${reducedMotion ? REDUCED_MS : 160}ms ${RESTORE_SHEET_EASE}` }}
        />
      ) : reducedMotion ? (
        // Reduced-motion indeterminate: a neutral full-width track with a
        // gentle opacity-only pulse — never a fixed partial fill, which
        // could be misread as measured (and stalled) progress. No
        // width/transform movement, no percentage. Completes to the
        // resolved (tangerine) branch above exactly as full-motion does.
        <div className="h-full w-full rounded-full bg-muted-foreground/50 animate-restore-pulse" />
      ) : (
        <div className="absolute inset-y-0 w-1/3 animate-restore-shimmer rounded-full bg-primary/80" />
      )}
    </div>
  );
}

function RestoreHeader({ title, subtitle, stage, titleId }: { title: string; subtitle?: string; stage: RestoreStage; titleId: string }) {
  const showCheck = stage === "success";
  return (
    <div className="flex items-center gap-3">
      <span className="relative inline-flex shrink-0">
        <img src={markUrl} width={32} height={32} alt="" className="rounded-[7px]" />
        {showCheck && (
          <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-success text-success-foreground">
            <Check className="size-2.5" />
          </span>
        )}
      </span>
      <span className="min-w-0">
        <h2 id={titleId} className="truncate text-base font-semibold leading-tight text-foreground">
          {headingFor(stage, title)}
        </h2>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
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
          <Button size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
        {resultError && (
          <div className="text-xs text-muted-foreground">
            <button
              type="button"
              onClick={onToggleDetails}
              className="underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Technical details
            </button>
            {detailsOpen && (
              <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-2 font-mono text-[11px]">
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
          <Button size="sm" variant="secondary" onClick={onToggleDetails}>
            View details
          </Button>
        </div>
        {detailsOpen && (
          <div className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
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
  reducedMotion: boolean;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  onClose: () => void;
  onRetry: () => void;
  sheetRef: React.RefObject<HTMLDivElement>;
  titleId: string;
}) {
  const [entered, setEntered] = useState(false);
  const [foldIn, setFoldIn] = useState(reducedMotion);

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      setFoldIn(true);
      return;
    }
    const id = setTimeout(() => setFoldIn(true), SHEET_DELAY_MS + FOLD_DELAY_MS);
    return () => clearTimeout(id);
  }, [reducedMotion]);

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

  const clipPath = `polygon(0 0, calc(100% - ${FOLD_SIZE}px) 0, 100% ${FOLD_SIZE}px, 100% 100%, 0 100%)`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* RestoreBackdrop */}
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: "rgba(16,37,38,0.18)",
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
        className="relative w-full max-w-[440px] outline-none"
        style={{ maxWidth: "calc(100vw - 32px)" }}
      >
        <div
          className="relative rounded-2xl border border-foreground/10 bg-card p-6 shadow-[0_18px_50px_rgba(16,37,38,0.18)]"
          style={{
            clipPath,
            opacity: sheetOpacity,
            transform: sheetTransform,
            transition: reducedMotion
              ? `opacity ${REDUCED_MS}ms ${RESTORE_SHEET_EASE}`
              : `opacity ${SHEET_MS}ms ${RESTORE_SHEET_EASE} ${SHEET_DELAY_MS}ms, transform ${SHEET_MS}ms ${RESTORE_SHEET_EASE} ${SHEET_DELAY_MS}ms`,
          }}
        >
          <RestoreHeader title={title} subtitle={subtitle} stage={stage} titleId={titleId} />

          <div role="status" aria-live="polite" className="mt-4">
            {tools.map((tool, index) => {
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
            })}
          </div>

          <RestoreProgress stage={stage} reducedMotion={reducedMotion} />

          <RestoreActions
            stage={stage}
            resultError={resultError}
            detailsOpen={detailsOpen}
            onToggleDetails={onToggleDetails}
            onClose={onClose}
            onRetry={onRetry}
          />
        </div>

        {/* Folded-corner brand detail: the clip-path above is STATIC (a
            fixed cut of the sheet's top-right corner); only this separate
            tangerine fold element's opacity+scale animate in, per spec
            ("keep the clip STATIC ... reliability > complexity"). */}
        <div
          className="pointer-events-none absolute right-0 top-0 bg-primary"
          style={{
            width: FOLD_SIZE,
            height: FOLD_SIZE,
            clipPath: "polygon(100% 0, 0 0, 100% 100%)",
            opacity: closing ? 0 : foldIn ? 1 : 0,
            transform: closing ? undefined : foldIn ? "scale(1)" : reducedMotion ? "scale(1)" : "scale(0.65)",
            transformOrigin: "100% 0%",
            transition: reducedMotion
              ? `opacity ${REDUCED_MS}ms ${RESTORE_SHEET_EASE}`
              : `opacity ${FOLD_MS}ms ${RESTORE_SHEET_EASE}, transform ${FOLD_MS}ms ${RESTORE_SHEET_EASE}`,
            boxShadow: "inset 1px 1px 0 rgba(16,37,38,0.15)",
          }}
          aria-hidden="true"
        />
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

export function useRestore(): { start: (opts: StartOptions) => void; node: ReactNode; active: boolean } {
  const [stage, setStage] = useState<RestoreStage>("idle");
  const [title, setTitle] = useState("Restoring workspace");
  const [subtitle, setSubtitle] = useState<string | undefined>(undefined);
  const [toolsMeta, setToolsMeta] = useState<RestoreTool[]>([]);
  const [toolStatuses, setToolStatuses] = useState<ToolStatusMap>({});
  const [resultError, setResultError] = useState<string | undefined>(undefined);
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

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const id of timersRef.current) clearTimeout(id);
      timersRef.current = [];
    };
  }, []);

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
        runningRef.current = false;
        setStage(result.overall);

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
      setDetailsOpen(false);
      setStage("opening");

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
