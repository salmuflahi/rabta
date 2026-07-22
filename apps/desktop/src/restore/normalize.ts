// Pure ActivateSummary -> RestoreResult normalization. Lives OUTSIDE the
// visual rows (per the spec's component architecture) so RestoreExperience
// never has to know about the backend's connector-kind lists directly, and
// so this mapping can be unit tested without rendering anything.
import type { RestoreResult, RestoreTool, RestoreToolResult } from "./types";

/**
 * Result of `activate_task`, mirrored from the backend's ActivateSummary
 * shape. This is the canonical `ActivateSummary` type — callers (e.g.
 * `CapsulesPage`) import it from here rather than declaring their own copy.
 */
export interface ActivateSummary {
  applied: string[];
  pending: string[];
  skipped: string[];
  savedPrevious: string | null;
  errors: string[];
}

/** True when `error` clearly starts with `<kind>:` (case-insensitive) —
 * the only attribution the spec calls "clearly attributable". Anything
 * looser risks mis-blaming an unrelated tool. */
function attributedTool(error: string, tools: RestoreTool[]): RestoreTool | undefined {
  const lower = error.trim().toLowerCase();
  return tools.find((t) => lower.startsWith(`${t.kind.toLowerCase()}:`));
}

/**
 * Maps a resolved `activate_task` summary + the task's known restorable
 * tools to a `RestoreResult`.
 *
 * - applied kind -> tool `applied` ("Restored").
 * - pending kind -> tool `skipped`, message "On next reload" (not a failure).
 * - skipped kind -> tool `skipped` ("Skipped").
 * - a tool whose kind isn't mentioned in any list has no truthful basis for
 *   a status — treated as `skipped` rather than fabricating "applied".
 * - an error string clearly attributable to a tool's kind (starts with
 *   `"<kind>:"`) makes that tool `failed` ("Couldn't restore"); attribution
 *   takes priority over whatever bucket the kind also appears in.
 * - unattributed errors are joined into `RestoreResult.error` for the
 *   sheet's general/technical-details surface.
 * - overall: `failure` when nothing applied and errors are present;
 *   `success` when something applied and nothing else is off (no
 *   pending/skipped/errors/failed); `partial` otherwise.
 */
export function activateSummaryToResult(summary: ActivateSummary, tools: RestoreTool[]): RestoreResult {
  const appliedSet = new Set(summary.applied.map((k) => k.toLowerCase()));
  const pendingSet = new Set(summary.pending.map((k) => k.toLowerCase()));
  const skippedSet = new Set(summary.skipped.map((k) => k.toLowerCase()));

  const attributedByToolId = new Map<string, string>();
  const unattributedErrors: string[] = [];
  for (const err of summary.errors) {
    const tool = attributedTool(err, tools);
    if (tool) {
      attributedByToolId.set(tool.id, err);
    } else {
      unattributedErrors.push(err);
    }
  }

  const toolResults: RestoreToolResult[] = tools.map((tool): RestoreToolResult => {
    if (attributedByToolId.has(tool.id)) {
      return { id: tool.id, status: "failed", message: "Couldn't restore" };
    }
    const kind = tool.kind.toLowerCase();
    if (appliedSet.has(kind)) {
      return { id: tool.id, status: "applied" };
    }
    if (pendingSet.has(kind)) {
      return { id: tool.id, status: "skipped", message: "On next reload" };
    }
    if (skippedSet.has(kind)) {
      return { id: tool.id, status: "skipped" };
    }
    return { id: tool.id, status: "skipped" };
  });

  const anyApplied = summary.applied.length > 0;
  const anyIssue =
    summary.pending.length > 0 ||
    summary.skipped.length > 0 ||
    summary.errors.length > 0 ||
    toolResults.some((t) => t.status === "failed");

  let overall: RestoreResult["overall"];
  if (!anyApplied && summary.errors.length > 0) {
    overall = "failure";
  } else if (anyApplied && !anyIssue) {
    overall = "success";
  } else {
    overall = "partial";
  }

  return {
    overall,
    tools: toolResults,
    error: unattributedErrors.length > 0 ? unattributedErrors.join("; ") : undefined,
  };
}
