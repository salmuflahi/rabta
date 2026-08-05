import { invoke } from "@tauri-apps/api/core";
import { Pin, PinOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toastErr } from "@/lib/toast";
import type { TaskResource } from "@/store";

export interface CapsuleItem {
  kind: "chrome" | "vscode";
  identity: string;
  label: string;
  payload: unknown;
  pinned: boolean;
}

export interface CapsuleItemsProps {
  taskId: string;
  resources: TaskResource[];
  /** Straight from the `task_pins` command; camelCase, like every other record type. */
  pins: { connectorKind: string; identity: string }[];
  onChanged: () => void;
}

/** Identity must match capsules::identity_of on the Rust side exactly — a
 * chrome tab is its url, a vscode file is the bare path string itself, and a
 * vscode terminal is its name and cwd joined by NUL (the same separator the
 * Rust side uses, since NUL can't occur in either field). If these two ever
 * disagree, pinning silently stops matching what was captured. */
function identityOf(kind: string, item: unknown): string | null {
  if (kind === "chrome") {
    const url = (item as { url?: unknown } | null)?.url;
    return typeof url === "string" ? url : null;
  }
  if (typeof item === "string") return item;
  const t = item as { name?: unknown; cwd?: unknown } | null;
  if (typeof t?.name !== "string") return null;
  const cwd = typeof t.cwd === "string" ? t.cwd : "";
  return `${t.name}\0${cwd}`;
}

/** A vscode file's item IS its path (a bare string) — the tail after the last
 * slash reads better than a full path in a narrow popover row. Everything
 * else carries a title/name field; identity is the last-resort fallback. */
function labelOf(item: unknown, identity: string): string {
  if (typeof item === "string") return item.split("/").pop() || item;
  const t = item as { title?: unknown; name?: unknown } | null;
  if (typeof t?.title === "string") return t.title;
  if (typeof t?.name === "string") return t.name;
  return identity;
}

/** Flattens a task's captured resources into individual chrome tabs / vscode
 * files / vscode terminals, cross-referenced against `pins` so each knows
 * whether it's pinned. A resource of any other connector kind (e.g. git, which
 * has no per-item identity) contributes nothing here. */
function itemsOf(resources: TaskResource[], pins: CapsuleItemsProps["pins"]): CapsuleItem[] {
  const pinned = new Set(pins.map((p) => `${p.connectorKind}\0${p.identity}`));
  const out: CapsuleItem[] = [];
  for (const r of resources) {
    const kind = r.connectorKind;
    if (kind !== "chrome" && kind !== "vscode") continue;
    const groups: unknown[] = [
      ...((r.payload.tabs as unknown[] | undefined) ?? []),
      ...((r.payload.openFiles as unknown[] | undefined) ?? []),
      ...((r.payload.terminals as unknown[] | undefined) ?? []),
    ];
    for (const item of groups) {
      const identity = identityOf(kind, item);
      if (!identity) continue;
      out.push({
        kind,
        identity,
        label: labelOf(item, identity),
        payload: item,
        pinned: pinned.has(`${kind}\0${identity}`),
      });
    }
  }
  return out;
}

/** The curate list inside a task's capsule popover (see CapsulesPage.tsx's
 * CapsuleSummary): one row per captured chrome tab / vscode file / vscode
 * terminal, each with a pin toggle — "always open this on Resume, even if
 * it's since been closed or the capsule is re-saved without it" — and a
 * remove control, which drops the item from the captured payload only (a
 * separate, deliberate choice from unpinning; see remove_task_item). Renders
 * nothing when the capsule has no chrome/vscode items to curate (e.g. a
 * git-only capsule, or none saved yet). */
export function CapsuleItems({ taskId, resources, pins, onChanged }: CapsuleItemsProps) {
  const items = itemsOf(resources, pins);
  if (items.length === 0) return null;

  async function run(cmd: string, args: Record<string, unknown>) {
    try {
      await invoke(cmd, args);
      onChanged();
    } catch (e) {
      toastErr(e);
    }
  }

  return (
    <ul className="mt-3 flex flex-col gap-1 border-t pt-3">
      {items.map((it) => (
        <li key={`${it.kind}\0${it.identity}`} className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-xs text-popover-foreground" title={it.identity}>
            {it.label}
          </span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={it.pinned ? `stop always opening ${it.label}` : `always open ${it.label}`}
            onClick={() =>
              it.pinned
                ? run("unpin_task_item", { taskId, connectorKind: it.kind, identity: it.identity })
                : run("pin_task_item", { taskId, connectorKind: it.kind, payload: it.payload })
            }
          >
            {it.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`remove ${it.label} from this capsule`}
            onClick={() => run("remove_task_item", { taskId, connectorKind: it.kind, identity: it.identity })}
          >
            <X className="size-4" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
