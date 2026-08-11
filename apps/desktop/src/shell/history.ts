import type { NavKey } from "@/store";

/**
 * A place in the app: which view, and what was selected inside it.
 *
 * `selection` is the per-view selected id already held in the store —
 * `selectedCapsuleId`, `selectedProjectId`, `selectedConnectorId`,
 * `selectedEventSeq` (a number), or `settingsSection`. Overview has no
 * selection and always carries `null`.
 */
export interface Location {
  view: NavKey;
  selection: string | number | null;
}

/** Entries kept before the oldest is dropped. Session-scoped; history is
 * never persisted across launches. */
export const HISTORY_LIMIT = 50;

/**
 * Push a location, applying the replace-in-place rule.
 *
 * A change of *view* pushes a new entry. A change of *selection* inside the
 * current view rewrites the current entry instead — otherwise arrow-keying
 * down a long list would fill history with near-identical entries and make
 * Back useless. Rewriting still preserves the useful case: Back from another
 * view returns to the row you were last reading, not to a bare list.
 *
 * Forward entries are always discarded, as in a browser. Past the cap the
 * oldest entries are dropped and the index is rebased so it still points at
 * the newest entry.
 */
export function pushLocation(
  history: Location[],
  index: number,
  next: Location,
): { history: Location[]; index: number } {
  const current = index >= 0 ? history[index] : undefined;

  if (current && current.view === next.view) {
    const rewritten = history.slice(0, index + 1);
    rewritten[index] = next;
    return { history: rewritten, index };
  }

  const truncated = history.slice(0, index + 1);
  truncated.push(next);

  if (truncated.length > HISTORY_LIMIT) {
    const dropped = truncated.length - HISTORY_LIMIT;
    const capped = truncated.slice(dropped);
    return { history: capped, index: capped.length - 1 };
  }

  return { history: truncated, index: truncated.length - 1 };
}
