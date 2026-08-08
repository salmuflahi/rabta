import { invoke } from "@tauri-apps/api/core";
import { Pin, PinOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Row } from "@/components/ui/row";
import { Section } from "@/components/ui/section";
import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";
import { toastErr } from "@/lib/toast";
import type { TaskResource } from "@/store";

export interface CapsuleItem {
  kind: "chrome" | "vscode";
  identity: string;
  label: string;
  payload: unknown;
  pinned: boolean;
  /** Present in the task's most recently captured payload. A pinned item can
   * still be `false` here — closed since capture, or the capsule was
   * re-saved without it — and must keep rendering anyway: a pin that
   * vanished from this list would still fire on every resume with no
   * control left to stop it. */
  captured: boolean;
  /** Whether "always open this" is offered at all. False only for a vscode
   * terminal with no known cwd (opened with ctrl+backtick, never given an
   * explicit directory) — `restore_vscode` on the Rust side can't recreate
   * a terminal without one, so pinning it would silently do nothing,
   * forever. Chrome tabs and vscode files are always pinnable. */
  pinnable: boolean;
}

export interface CapsuleItemsProps {
  taskId: string;
  resources: TaskResource[];
  /** Straight from the `task_pins` command; camelCase, like every other record type. */
  pins: { connectorKind: string; identity: string; payload: unknown }[];
  onChanged: () => void;
}

/** Identity must match capsules::identity_of on the Rust side exactly — a
 * chrome tab is its url, a vscode file is the bare path string itself, and a
 * vscode terminal is its name and cwd joined by NUL (the same separator the
 * Rust side uses, since NUL can't occur in either field). If these two ever
 * disagree, pinning silently stops matching what was captured. Every kind
 * gets its own explicit arm, including the "anything else" case at the
 * bottom — `itemsOf` below happens to only ever call this with "chrome" or
 * "vscode", but that upstream filter shouldn't be the only thing keeping an
 * unrecognized kind from being parsed as a vscode item; the Rust
 * `identity_of` returns `None` for an unknown kind on its own, and this
 * should too. */
export function identityOf(kind: string, item: unknown): string | null {
  if (kind === "chrome") {
    const url = (item as { url?: unknown } | null)?.url;
    return typeof url === "string" ? url : null;
  }
  if (kind === "vscode") {
    if (typeof item === "string") return item;
    const t = item as { name?: unknown; cwd?: unknown } | null;
    if (typeof t?.name !== "string") return null;
    const cwd = typeof t.cwd === "string" ? t.cwd : "";
    return `${t.name}\0${cwd}`;
  }
  return null;
}

/** A vscode terminal can only be restored if it has a known cwd: VS Code
 * only reports one for a terminal it created with an explicit directory, so
 * one opened with ctrl+backtick has `cwd: null`. `restore_vscode` on the
 * Rust side silently drops any terminal without a usable cwd — it has
 * nothing to pass `terminal.create` — so pinning one would look like it
 * worked and then just never fire. Chrome tabs and vscode files (bare path
 * strings) are always pinnable. */
function isPinnable(kind: string, item: unknown): boolean {
  if (kind !== "vscode" || typeof item === "string") return true;
  const cwd = (item as { cwd?: unknown } | null)?.cwd;
  return typeof cwd === "string";
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
 * whether it's pinned — then unions in every pin whose item isn't among
 * them. Pins survive auto-save and outlive the tab/file/terminal they were
 * pinned from (see `merge_pins` on the Rust side), so the curate list has to
 * keep showing — and offering to unpin — a pin even after its item is gone
 * from the captured payload; otherwise it becomes an invisible, permanent
 * "always open" with no control left to stop it. A resource (or pin) of any
 * other connector kind (e.g. git, which has no per-item identity)
 * contributes nothing here. */
function itemsOf(resources: TaskResource[], pins: CapsuleItemsProps["pins"]): CapsuleItem[] {
  const pinned = new Set(pins.map((p) => `${p.connectorKind}\0${p.identity}`));
  const out: CapsuleItem[] = [];
  const capturedKeys = new Set<string>();
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
      capturedKeys.add(`${kind}\0${identity}`);
      out.push({
        kind,
        identity,
        label: labelOf(item, identity),
        payload: item,
        pinned: pinned.has(`${kind}\0${identity}`),
        captured: true,
        pinnable: isPinnable(kind, item),
      });
    }
  }

  for (const p of pins) {
    const kind = p.connectorKind;
    if (kind !== "chrome" && kind !== "vscode") continue;
    if (capturedKeys.has(`${kind}\0${p.identity}`)) continue;
    out.push({
      kind,
      identity: p.identity,
      label: labelOf(p.payload, p.identity),
      payload: p.payload,
      pinned: true,
      captured: false,
      pinnable: isPinnable(kind, p.payload),
    });
  }
  return out;
}

/** The four pin states a curate row can be in, each with its own non-colour
 * cue (an icon shape, not a hue) so the state reads even without colour:
 *  - "pinned": part of the workspace definition — filled `Pin`.
 *  - "loose": captured because it was open, never pinned — no icon.
 *  - "gone": the pin outlived its captured item — outline `PinOff`, muted.
 *  - "unpinnable": no reconstructable command — disabled pin + a tooltip
 *    (and an accessible description) giving the reason.
 * Pinned takes priority over unpinnable: pinning a vscode terminal is only
 * blocked going forward — an item that's already pinned always keeps its
 * (enabled) unpin control regardless of `pinnable`, matching `pinDisabled`
 * below (`!pinned && !pinnable`). */
type PinState = "pinned" | "loose" | "gone" | "unpinnable";

function pinStateOf(it: CapsuleItem): PinState {
  if (it.pinned) return it.captured ? "pinned" : "gone";
  return it.pinnable ? "loose" : "unpinnable";
}

/** kind + payload shape -> which curate group a row belongs in. A vscode
 * item's payload is a bare path string for a file, or a {name, cwd} object
 * for a terminal — see identityOf's own kind split above. */
function groupOf(it: CapsuleItem): "Tabs" | "Files" | "Terminals" {
  if (it.kind === "chrome") return "Tabs";
  return typeof it.payload === "string" ? "Files" : "Terminals";
}

const GROUP_ORDER = ["Tabs", "Files", "Terminals"] as const;

/** The curate list inside a task's capsule popover (see CapsulesPage.tsx's
 * CapsuleSummary): one row per captured chrome tab / vscode file / vscode
 * terminal, plus one row for any pin that has outlived its captured item,
 * each with a pin toggle — "always open this on Resume, even if it's since
 * been closed or the capsule is re-saved without it" — and a remove
 * control, which drops the item from the captured payload only (a separate,
 * deliberate choice from unpinning; see remove_task_item). The pin toggle is
 * disabled, with an explanation in its accessible name, for an item that
 * can't be pinned at all (a vscode terminal with no known cwd). Renders
 * nothing when there is nothing to curate at all (e.g. a git-only capsule,
 * or none saved yet and nothing pinned). */
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

  const groups = GROUP_ORDER.map((label) => ({
    label,
    rows: items.filter((it) => groupOf(it) === label),
  })).filter((g) => g.rows.length > 0);

  return (
    <div className="mt-3 flex flex-col gap-4 border-t pt-3">
      {groups.map((group) => (
        <Section key={group.label} label={group.label}>
          <Surface>
            {group.rows.map((it, idx) => {
              const state = pinStateOf(it);
              // "unpin" appears alongside the existing "stop always
              // opening X" phrasing (rather than replacing it) so the
              // accessible name still reads naturally and keeps matching
              // every existing "stop always opening X" assertion.
              const pinLabel = it.pinned
                ? `stop always opening ${it.label} (unpin)`
                : it.pinnable
                  ? `always open ${it.label}`
                  : `can't always open ${it.label} — no saved folder to restore it in`;
              const pinDisabled = state === "unpinnable";
              // Qualified by taskId (not just group + idx): two different
              // tasks' capsule views can be open at once, each with an
              // unpinnable item at the same group/index, and a duplicate DOM
              // id would break aria-describedby's mapping — which is what
              // tells a screen-reader user why the pin is refused.
              const descId = `capsule-item-pin-desc-${taskId}-${group.label}-${idx}`;
              return (
                <Row
                  key={`${it.kind}\0${it.identity}`}
                  data-pin-state={state}
                  className="group px-3 py-1.5"
                  leading={
                    <>
                      {pinDisabled && (
                        <span id={descId} className="sr-only">
                          This terminal has no command to reopen it, so pinning it would never do
                          anything.
                        </span>
                      )}
                      {/* aria-disabled rather than disabled: the base button class
                          carries disabled:pointer-events-none, so a truly disabled
                          button can never fire its title tooltip, and it drops out
                          of tab order too — which means the one thing this control
                          has to say ("why can't I pin this?") reaches nobody who is
                          looking at it. Left focusable and hoverable, refusing the
                          click instead. */}
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className={cn("size-7", pinDisabled && "cursor-not-allowed opacity-50")}
                        aria-disabled={pinDisabled || undefined}
                        aria-describedby={pinDisabled ? descId : undefined}
                        aria-label={pinLabel}
                        title={pinDisabled ? pinLabel : undefined}
                        onClick={() => {
                          if (pinDisabled) return;
                          return it.pinned
                            ? run("unpin_task_item", { taskId, connectorKind: it.kind, identity: it.identity })
                            : run("pin_task_item", { taskId, connectorKind: it.kind, payload: it.payload });
                        }}
                      >
                        {state === "pinned" && <Pin className="size-4 fill-current" />}
                        {state === "gone" && <PinOff className="size-4 text-muted-foreground" />}
                        {state === "unpinnable" && <Pin className="size-4" />}
                        {/* "loose" (captured, never pinned): no icon is the cue
                            itself — a faint pin only appears on hover/focus so the
                            control stays reachable without competing with the
                            pinned column at rest. */}
                        {state === "loose" && (
                          <Pin className="size-4 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100" />
                        )}
                      </Button>
                    </>
                  }
                  title={
                    <span
                      className={cn(state === "gone" && "italic text-muted-foreground")}
                      title={it.captured ? it.identity : `${it.identity} — pinned, not currently open`}
                    >
                      <span>{it.label}</span>
                      {!it.captured && <span className="ml-1 text-muted-foreground">(not open)</span>}
                    </span>
                  }
                  trailing={
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      aria-label={`remove ${it.label} from this capsule`}
                      onClick={() =>
                        run("remove_task_item", { taskId, connectorKind: it.kind, identity: it.identity })
                      }
                    >
                      <X className="size-4" />
                    </Button>
                  }
                />
              );
            })}
          </Surface>
        </Section>
      ))}
    </div>
  );
}
