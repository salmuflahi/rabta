import type { TaskResource } from "@/store";

// Pure presentation helpers: turn raw capsule/event data into short, human
// phrasing for the UI. No React, no invoke, no side effects beyond reading
// the arguments passed in (and `Date.now()` as a default clock).

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const JUST_NOW_MS = 45_000;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * "just now" / "5m ago" / "3h ago" / "yesterday" / "Mar 4".
 * Deterministic when `now` is passed (defaults to `Date.now()`).
 * Invalid/unparseable `iso` never throws — returns "unknown".
 */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unknown";

  const diffMs = now - then;
  if (diffMs < JUST_NOW_MS) return "just now";

  const mins = Math.round(diffMs / MINUTE_MS);
  if (mins < 60) return mins <= 0 ? "just now" : `${mins}m ago`;

  const hours = Math.round(diffMs / HOUR_MS);
  if (hours < 24) return `${hours}h ago`;

  const dayDiff = Math.round((startOfDay(now) - startOfDay(then)) / DAY_MS);
  if (dayDiff === 1) return "yesterday";

  const d = new Date(then);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function pluralize(n: number, word: string): string {
  if (n === 0) return `no ${word}s`;
  if (n === 1) return `1 ${word}`;
  return `${n} ${word}s`;
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

type CapsuleIcon = "editor" | "browser" | "git" | "terminal" | "generic";

const EDITOR_KINDS = new Set(["vscode", "cursor"]);
const BROWSER_KINDS = new Set(["chrome", "browser"]);

export interface HumanizedCapsule {
  kind: string;
  icon: CapsuleIcon;
  summary: string;
  savedAgo: string;
}

/**
 * Human-readable capsule summary, replacing the old raw `summarize()`
 * phrasing (`"git: main"`, `"vscode: 3 files, 1 terminals · 3:04:12 PM"`)
 * with sentences and pluralization. Never throws on missing/malformed
 * fields — degrades to a sensible generic summary instead.
 */
export function humanizeCapsule(r: TaskResource): HumanizedCapsule {
  const kind = r?.connectorKind ?? "unknown";
  const payload = (r?.payload ?? {}) as Record<string, unknown>;
  const savedAgo = relativeTime(r?.createdAt ?? "");

  if (kind === "git") {
    const branch = typeof payload.branch === "string" && payload.branch ? payload.branch : "unknown branch";
    return { kind, icon: "git", summary: `on ${branch}`, savedAgo };
  }

  if (EDITOR_KINDS.has(kind)) {
    const files = arrayLength(payload.openFiles);
    const terms = arrayLength(payload.terminals);
    return {
      kind,
      icon: "editor",
      summary: `${pluralize(files, "file")} · ${pluralize(terms, "terminal")}`,
      savedAgo,
    };
  }

  if (BROWSER_KINDS.has(kind)) {
    if (Array.isArray(payload.tabs)) {
      return { kind, icon: "browser", summary: pluralize(payload.tabs.length, "tab"), savedAgo };
    }
    return { kind, icon: "browser", summary: "browser capsule", savedAgo };
  }

  if (kind === "terminal") {
    const terms = arrayLength(payload.terminals);
    return { kind, icon: "terminal", summary: pluralize(terms, "terminal"), savedAgo };
  }

  return { kind, icon: "generic", summary: `${kind} capsule`, savedAgo };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

/** The "what" — a command/event/pairing name. Never an opaque id. */
function pickName(e: Record<string, unknown>): string {
  if (typeof e.name === "string" && e.name) return e.name;
  const connector = asRecord(e.connector);
  if (connector && typeof connector.name === "string" && connector.name) return connector.name;
  if (typeof e.command === "string" && e.command) return e.command;
  return "A connector";
}

/**
 * The "who" — a connector's display name. The real hub wire shape only
 * inlines a `connector: { name, ... }` object on `connectorConnected`; every
 * other event (`connectorDisconnected`, `commandSent`, `responseReceived`,
 * `eventReceived`) carries just a `connectorId` session id (see
 * `HubEvent` in crates/omnibus-hub/src/hub.rs). Callers may pass a
 * `resolveName` lookup (e.g. backed by the connectors list) to turn that id
 * into a display name; without one, or if it can't resolve, this degrades to
 * a readable generic instead of ever surfacing the raw session id.
 */
function pickConnector(
  e: Record<string, unknown>,
  resolveName?: (id: string) => string | undefined,
): string {
  const connector = asRecord(e.connector);
  if (connector && typeof connector.name === "string" && connector.name) return connector.name;
  if (typeof e.connectorId === "string" && e.connectorId) {
    const resolved = resolveName?.(e.connectorId);
    if (resolved) return resolved;
  }
  return "a connector";
}

function humanizeType(type: unknown): string {
  const raw = typeof type === "string" ? type : type == null ? "" : String(type);
  const spaced = raw
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .trim();
  if (!spaced) return "Unknown";
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export interface DescribedEvent {
  icon: string;
  sentence: string;
}

/**
 * Plain-English sentence for an activity-log event. Field names/shapes
 * come from the hub's `HubEvent` enum (camelCase over the wire) but are
 * pulled defensively — this never throws, even given a bare `{ type }`.
 *
 * `resolveName` is an optional pure lookup (id -> display name) the caller
 * supplies for events that only carry a `connectorId` session id on the
 * wire; see `pickConnector` for why. Omitting it still works — it just
 * degrades those sentences to a generic "a connector" instead of a name.
 */
export function describeEvent(
  e: { type: string; at?: string; [k: string]: unknown },
  resolveName?: (id: string) => string | undefined,
): DescribedEvent {
  const type = e?.type ?? "";

  switch (type) {
    case "connectorConnected":
      return { icon: "connector", sentence: `${pickName(e)} connected` };
    case "connectorDisconnected":
      return { icon: "connector", sentence: `${pickConnector(e, resolveName)} disconnected` };
    case "commandSent":
      return {
        icon: "command",
        sentence: `Sent ${pickName(e)} to ${pickConnector(e, resolveName)}`,
      };
    case "responseReceived":
      return { icon: "response", sentence: `${pickConnector(e, resolveName)} responded` };
    case "eventReceived":
      return { icon: "event", sentence: `${pickConnector(e, resolveName)} sent ${pickName(e)}` };
    case "pairingRequested":
      return { icon: "pairing", sentence: `${pickName(e)} requested to connect` };
    default:
      return { icon: "generic", sentence: humanizeType(type || "unknown") };
  }
}
