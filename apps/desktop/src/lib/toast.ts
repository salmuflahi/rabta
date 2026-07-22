import { toast } from "@/components/ui/sonner";

/** Result of `activate_task`, mirrored from the backend's ActivateSummary shape. */
export interface ActivationSummary {
  applied: string[];
  pending: string[];
  skipped: string[];
  savedPrevious: string | null;
  errors: string[];
}

/** Success toast for a completed action, e.g. `toastOk("Task added")`. */
export function toastOk(message: string, description?: string) {
  toast.success(message, description ? { description } : undefined);
}

/** Error toast for a caught `catch (e)` — mirrors the prior `String(e)` display. */
export function toastErr(e: unknown) {
  toast.error(typeof e === "string" ? e : String(e));
}

/** Titled toast summarizing a task activation (applied/pending/skipped/savedPrevious/errors). */
export function toastActivation(summary: ActivationSummary) {
  const parts = [
    summary.applied.length ? `applied: ${summary.applied.join(", ")}` : "",
    summary.pending.length ? `pending editor reload: ${summary.pending.join(", ")}` : "",
    summary.skipped.length ? `not connected: ${summary.skipped.join(", ")}` : "",
    summary.savedPrevious ? "previous task saved" : "",
    ...summary.errors,
  ].filter(Boolean);

  const hasNotes = summary.pending.length > 0 || summary.skipped.length > 0 || summary.errors.length > 0;
  const title = hasNotes ? "Resumed with notes" : "Resumed";
  const description = parts.join(" · ") || "No capsule yet";

  if (summary.errors.length > 0) {
    toast.error(title, { description });
  } else {
    toast.success(title, { description });
  }
}
