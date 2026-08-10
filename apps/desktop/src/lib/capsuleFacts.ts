import type { IconName } from "@/components/ui/icon";
import type { TaskResource } from "@/store";

/** One "what's inside" chip: a glyph and a count, e.g. `12 files`.
 *
 * The handoff's Overview hero shows a row of these under the capsule title —
 * "The chips exist so you can see what is inside without opening it." Every
 * count here is read off a real captured payload; a tool that captured
 * nothing produces no chip rather than a zero, because "0 tabs" and "Chrome
 * wasn't running" are different facts and only one of them is true. */
export interface CapsuleChip {
  /** Stable react key / test handle. */
  key: string;
  icon: IconName;
  count: number;
  /** Already pluralised: "1 file", "12 files". */
  label: string;
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

const EDITOR_KINDS = new Set(["vscode", "cursor"]);
const BROWSER_KINDS = new Set(["chrome", "browser"]);

/**
 * Everything a capsule's resources say about its contents, totalled across
 * connectors — two editors open on the same task contribute to one `files`
 * chip rather than two.
 *
 * Kept out of the pages that render it because Overview's hero and the
 * Capsules detail pane both need the same numbers, and the one thing worse
 * than a fabricated count is two screens fabricating different ones.
 */
export function capsuleChips(resources: TaskResource[]): CapsuleChip[] {
  let files = 0;
  let tabs = 0;
  let terminals = 0;
  let branches = 0;
  const folders = new Set<string>();

  for (const r of resources) {
    const kind = (r?.connectorKind ?? "").toLowerCase();
    const payload = (r?.payload ?? {}) as Record<string, unknown>;

    if (EDITOR_KINDS.has(kind)) {
      files += arrayLength(payload.openFiles);
      terminals += arrayLength(payload.terminals);
      if (typeof payload.workspaceFolder === "string" && payload.workspaceFolder) {
        folders.add(payload.workspaceFolder);
      }
    } else if (BROWSER_KINDS.has(kind)) {
      tabs += arrayLength(payload.tabs);
    } else if (kind === "terminal") {
      terminals += arrayLength(payload.terminals);
    } else if (kind === "git") {
      if (typeof payload.branch === "string" && payload.branch) branches += 1;
    }
  }

  const chips: CapsuleChip[] = [];
  if (files) chips.push({ key: "files", icon: "code", count: files, label: plural(files, "file") });
  if (tabs) chips.push({ key: "tabs", icon: "globe", count: tabs, label: plural(tabs, "tab") });
  if (branches) {
    chips.push({ key: "branches", icon: "branch", count: branches, label: plural(branches, "branch").replace("branchs", "branches") });
  }
  if (terminals) {
    chips.push({ key: "terminals", icon: "terminal", count: terminals, label: plural(terminals, "terminal") });
  }
  if (folders.size) {
    chips.push({
      key: "folders",
      icon: "folder-open",
      count: folders.size,
      label: plural(folders.size, "folder"),
    });
  }
  return chips;
}

/** The branch a capsule was saved on, or null if git wasn't part of it.
 * Rendered in mono next to the project name throughout Console v2. */
export function capsuleBranch(resources: TaskResource[]): string | null {
  for (const r of resources) {
    if ((r?.connectorKind ?? "").toLowerCase() !== "git") continue;
    const branch = (r.payload as Record<string, unknown> | undefined)?.branch;
    if (typeof branch === "string" && branch) return branch;
  }
  return null;
}

/** ISO timestamp of the most recent thing captured into this capsule, or
 * null for a capsule that has never been captured — a real state in this
 * app (the handoff gives it its own empty state), not an error. */
export function capsuleSavedAt(resources: TaskResource[]): string | null {
  let latest: string | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const r of resources) {
    const ms = Date.parse(r?.createdAt ?? "");
    if (Number.isFinite(ms) && ms > latestMs) {
      latestMs = ms;
      latest = r.createdAt;
    }
  }
  return latest;
}
