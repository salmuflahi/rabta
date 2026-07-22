import { invoke } from "@tauri-apps/api/core";
import { Box, Check, Code2, GitBranch, Globe, Terminal } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BRAND_EASE,
  FADE_MS,
  FOLD_MS,
  MAX_RESTORE_MS,
  RESTORE_MIN_MS,
  STAGGER_MS,
  UNFOLD_MS,
  prefersReducedMotion,
} from "@/lib/motion";
import { cn } from "@/lib/utils";
import { FoldMark, type FoldMarkState } from "@/shell/FoldMark";

/**
 * Result of `activate_task`, mirrored from the backend's ActivateSummary
 * shape (same fields as `ActivationSummary` in `@/lib/toast` — kept as a
 * separate local type here since this module must not import page-level
 * concerns like toast wiring).
 */
export interface ActivateSummary {
  applied: string[];
  pending: string[];
  skipped: string[];
  savedPrevious: string | null;
  errors: string[];
}

type Phase = "idle" | "folding" | "restoring" | "unfolding" | "done";

interface CeremonyTask {
  id: string;
  title: string;
}

type RowTone = "applied" | "pending" | "skipped";

/** connector kind -> friendly label + icon for the tool checklist. */
const KIND_META: Record<string, { label: string; Icon: typeof Box }> = {
  vscode: { label: "VS Code", Icon: Code2 },
  cursor: { label: "VS Code", Icon: Code2 },
  chrome: { label: "Chrome", Icon: Globe },
  git: { label: "Git", Icon: GitBranch },
  terminal: { label: "Terminal", Icon: Terminal },
};

function kindMeta(kind: string): { label: string; Icon: typeof Box } {
  return KIND_META[kind] ?? { label: kind.charAt(0).toUpperCase() + kind.slice(1), Icon: Box };
}

interface Row {
  key: string;
  index: number;
  icon: typeof Box;
  label: string;
  tone: RowTone;
}

function summaryToRows(summary: ActivateSummary): Row[] {
  const rows: Row[] = [];
  for (const kind of summary.applied) {
    const { label, Icon } = kindMeta(kind);
    rows.push({ key: `applied-${kind}`, index: rows.length, icon: Icon, label, tone: "applied" });
  }
  for (const kind of summary.pending) {
    const { label, Icon } = kindMeta(kind);
    rows.push({ key: `pending-${kind}`, index: rows.length, icon: Icon, label, tone: "pending" });
  }
  for (const kind of summary.skipped) {
    const { label, Icon } = kindMeta(kind);
    rows.push({ key: `skipped-${kind}`, index: rows.length, icon: Icon, label, tone: "skipped" });
  }
  return rows;
}

/** A single checklist row, staggered in on mount via a transform/opacity
 * transition (`transition-delay` = `index * STAGGER_MS`) so the global
 * reduced-motion rule neutralizes it the same way FoldMark's does. */
function ChecklistRow({ index, icon: Icon, label, tone }: Row) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 text-sm",
        tone === "applied" && "text-foreground",
        tone === "pending" && "text-muted-foreground",
        tone === "skipped" && "text-muted-foreground/60"
      )}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(4px)",
        transition: `opacity ${FOLD_MS}ms ${BRAND_EASE}, transform ${FOLD_MS}ms ${BRAND_EASE}`,
        transitionDelay: `${index * STAGGER_MS}ms`,
      }}
    >
      {tone === "applied" ? <Check className="size-3.5 shrink-0 text-success" /> : <Icon className="size-3.5 shrink-0" />}
      <span>{label}</span>
      {tone === "pending" && <span className="text-xs">· on next reload</span>}
      {tone === "skipped" && <span className="text-xs">· not connected</span>}
    </div>
  );
}

function ResumeOverlay({
  phase,
  task,
  summary,
  errorTint,
}: {
  phase: Phase;
  task: CeremonyTask | null;
  summary: ActivateSummary | null;
  errorTint: boolean;
}) {
  // Mount-in flip so the scrim's opacity transition actually plays (rather
  // than rendering already-at-rest, which would skip the fold-in fade).
  const [scrimIn, setScrimIn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setScrimIn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const foldState: FoldMarkState = phase === "folding" ? "folding" : phase === "restoring" ? "closed" : "open";
  const fadingOut = phase === "done";
  const rows = summary ? summaryToRows(summary) : [];

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center",
        errorTint ? "bg-destructive/10" : "bg-background/70"
      )}
      style={{
        opacity: fadingOut ? 0 : scrimIn ? 1 : 0,
        transition: `opacity ${fadingOut ? FADE_MS : FOLD_MS}ms ${BRAND_EASE}`,
      }}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-4">
        <FoldMark state={foldState} size={88} />
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm font-medium text-foreground">Resuming {task?.title ?? ""}</p>
          {!summary ? (
            <p className="text-xs text-muted-foreground">Restoring…</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {rows.map((r) => (
                <ChecklistRow key={r.key} index={r.index} icon={r.icon} label={r.label} tone={r.tone} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type Settled = { ok: true; summary: ActivateSummary } | { ok: false; error: unknown };

/**
 * The signature Resume ceremony: fold -> restore (checklist from the real
 * `activate_task` result) -> unfold -> fade, or an instant pass-through under
 * `prefers-reduced-motion`.
 *
 * Presentation-only: does not call `setActiveTaskId` / `bumpActivation` /
 * `toastActivation` itself — those remain the page's responsibility inside
 * `onComplete`/`onError`, so every existing post-activate side effect stays
 * exactly where it is (this hook does not own it, it just gates *when* it
 * fires).
 */
export function useResumeCeremony(opts: {
  onComplete: (summary: ActivateSummary) => void;
  onError: (e: unknown) => void;
}): {
  start: (task: CeremonyTask) => void;
  overlay: ReactNode;
  active: boolean;
} {
  const [phase, setPhase] = useState<Phase>("idle");
  const [task, setTask] = useState<CeremonyTask | null>(null);
  const [summary, setSummary] = useState<ActivateSummary | null>(null);
  const [errorTint, setErrorTint] = useState(false);
  const [active, setActive] = useState(false);

  // Latest callbacks in refs so `start` (memoized once) always calls the
  // current handlers without needing to be recreated on every render.
  const onCompleteRef = useRef(opts.onComplete);
  const onErrorRef = useRef(opts.onError);
  onCompleteRef.current = opts.onComplete;
  onErrorRef.current = opts.onError;

  const mountedRef = useRef(true);
  const runningRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const id of timersRef.current) clearTimeout(id);
      timersRef.current = [];
    };
  }, []);

  const scheduledWait = useCallback((ms: number) => {
    return new Promise<void>((resolve) => {
      const id = setTimeout(resolve, ms);
      timersRef.current.push(id);
    });
  }, []);

  const start = useCallback(
    (t: CeremonyTask) => {
      // Re-entrancy guard: a ceremony is already running. The page is
      // expected to disable Resume while busy, but never freeze on a
      // double-invoke here either.
      if (runningRef.current) return;
      runningRef.current = true;
      setActive(true);

      const invokePromise = invoke<ActivateSummary>("activate_task", { taskId: t.id });

      if (prefersReducedMotion()) {
        // Exactly reproduces today's instant behavior: no overlay, just
        // await the real invoke and hand the result straight through.
        invokePromise.then(
          (s) => {
            runningRef.current = false;
            if (!mountedRef.current) return;
            setActive(false);
            onCompleteRef.current(s);
          },
          (e) => {
            runningRef.current = false;
            if (!mountedRef.current) return;
            setActive(false);
            onErrorRef.current(e);
          }
        );
        return;
      }

      setTask(t);
      setSummary(null);
      setErrorTint(false);
      setPhase("folding");

      const isCancelled = () => !mountedRef.current;

      void (async () => {
        await scheduledWait(FOLD_MS);
        if (isCancelled()) return;
        setPhase("restoring");

        const restoringStart = Date.now();

        const settleP: Promise<Settled> = invokePromise.then(
          (s): Settled => ({ ok: true, summary: s }),
          (e): Settled => ({ ok: false, error: e })
        );

        // Hold until the invoke settles, capped so a hung invoke can't
        // freeze the ceremony forever — if the cap wins the race, the
        // overlay proceeds to unfold/done and the real result (whenever it
        // eventually arrives) is awaited again just before firing
        // onComplete/onError below.
        const raceResult = await Promise.race<Settled | "pending">([
          settleP,
          scheduledWait(MAX_RESTORE_MS).then((): "pending" => "pending"),
        ]);
        if (isCancelled()) return;

        const elapsed = Date.now() - restoringStart;
        if (elapsed < RESTORE_MIN_MS) {
          await scheduledWait(RESTORE_MIN_MS - elapsed);
          if (isCancelled()) return;
        }

        if (raceResult !== "pending") {
          if (raceResult.ok) {
            setSummary(raceResult.summary);
            setErrorTint(raceResult.summary.errors.length > 0);
          } else {
            setErrorTint(true);
          }
        }

        setPhase("unfolding");
        await scheduledWait(UNFOLD_MS);
        if (isCancelled()) return;

        setPhase("done");
        await scheduledWait(FADE_MS);
        if (isCancelled()) return;

        setPhase("idle");
        setTask(null);
        setSummary(null);
        setErrorTint(false);
        setActive(false);
        runningRef.current = false;

        const final: Settled = raceResult !== "pending" ? raceResult : await settleP;
        if (final.ok) {
          if (final.summary.errors.length > 0) {
            // Errors present in an otherwise-resolved summary are treated as
            // the error branch too (per the ceremony spec): still surface
            // via onError, passing the summary through (not stringified) so
            // the caller retains applied/pending/skipped context.
            onErrorRef.current(final.summary);
          } else {
            onCompleteRef.current(final.summary);
          }
        } else {
          onErrorRef.current(final.error);
        }
      })();
    },
    [scheduledWait]
  );

  const overlay =
    phase === "idle" ? null : <ResumeOverlay phase={phase} task={task} summary={summary} errorTint={errorTint} />;

  return { start, overlay, active };
}
