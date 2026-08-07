// Pure types for the Restore Experience sheet — no React, no invoke, no
// side effects at import (mirrors the discipline in `@/lib/motion`).
//
// See docs/superpowers/specs/2026-07-22-restore-experience-spec.md for the
// full product spec this module implements.

/**
 * One authoritative status value for the whole sheet — a real state
 * machine, not scattered booleans.
 *
 *   idle -> opening -> restoring -> success|partial|failure -> closing -> idle
 */
export type RestoreStage =
  | "idle"
  | "opening"
  | "restoring"
  | "success"
  | "partial"
  | "failure"
  | "closing";

/** Per-tool row status. Never show "applied" until the backend confirms. */
export type ToolRestoreStatus = "waiting" | "restoring" | "applied" | "skipped" | "failed";

/** A restorable tool from the task's capsule resources (not hard-coded). */
export interface RestoreTool {
  id: string;
  name: string;
  kind: string;
}

/** Final (or incrementally emitted) status for a single tool row. */
export interface RestoreToolResult {
  id: string;
  status: ToolRestoreStatus;
  /** Optional short row subtext, e.g. "On next reload" for a pending tool. */
  message?: string;
}

/**
 * The outcome of a restore run, produced OUTSIDE the visual rows by
 * normalization (see `normalize.ts` for the real `ActivateSummary` mapping;
 * the dev playground constructs `RestoreResult`s directly).
 */
export interface RestoreResult {
  overall: "success" | "partial" | "failure";
  tools: RestoreToolResult[];
  /** Concise, human-readable error surfaced in the sheet when one or more
   * `errors` couldn't be attributed to a specific tool. A collapsible
   * "Technical details" section may show this verbatim. */
  error?: string;
  /** Items focus mode closed. Optional (like `error`) so a hand-built result
   * — e.g. the dev playground's scripted scenarios — need not set it;
   * absence reads the same as empty. */
  closed?: string[];
  /** Items focus mode left alone, as [item, reason]. A refusal, not a
   * failure. Optional for the same reason as `closed`. */
  kept?: [string, string][];
}
