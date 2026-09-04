import type { PinRow, ResourceRow, TaskRow } from "./db.js";

/**
 * Connector kinds whose workspace payload describes an editor. "fake" is the
 * development connector; its payload is a subset of the VS Code one.
 */
export const EDITOR_KINDS: ReadonlySet<string> = new Set(["vscode", "cursor", "fake"]);
export const BROWSER_KINDS: ReadonlySet<string> = new Set(["chrome", "browser"]);

export type JsonObject = Record<string, unknown>;

export interface TerminalView {
  name: string | null;
  cwd: string | null;
  /** null when the connector did not report it (older rows). */
  busy: boolean | null;
}

export interface EditorView {
  folder: string | null;
  /** In the order the editor reported them. */
  files: string[];
  activeFile: string | null;
  dirtyFiles: string[];
  terminals: TerminalView[];
}

export interface TabView {
  title: string | null;
  url: string;
}

export interface BrowserView {
  tabs: TabView[];
}

export interface PinView {
  id: string;
  connectorKind: string;
  identity: string;
  payload: unknown;
  createdAt: string;
}

/** The JSON read_capsule returns and the resource template serves. */
export interface CapsuleView {
  id: string;
  title: string;
  project: string;
  status: string;
  savedAt: string | null;
  branch: string | null;
  /** null when no editor connector captured anything for this task. */
  editor: EditorView | null;
  /** null when no browser connector captured anything for this task. */
  browser: BrowserView | null;
  pins: PinView[];
}

/** One list_capsules row. */
export interface CapsuleSummary {
  id: string;
  title: string;
  project: string;
  status: string;
  branch: string | null;
  savedAt: string | null;
  summary: string;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/** Parses payload text into an object; anything else becomes an empty object. */
export function parseJsonObject(text: string): JsonObject {
  try {
    const parsed: unknown = JSON.parse(text);
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Parses payload text, keeping the raw text when it is not JSON. */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/**
 * Milliseconds since the epoch for a Rabta timestamp, or null when it does
 * not parse. Rabta writes RFC 3339 with microseconds
 * ("2026-07-31T03:39:51.718318+00:00"); Date.parse wants at most three
 * fractional digits, so the rest are dropped first.
 */
export function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value.replace(/(\.\d{3})\d+/, "$1"));
  return Number.isFinite(ms) ? ms : null;
}

/** Editor state from a vscode, cursor or fake workspace payload; missing keys are tolerated. */
export function decodeEditor(payload: JsonObject): EditorView {
  const terminals: TerminalView[] = Array.isArray(payload.terminals)
    ? payload.terminals.filter(isObject).map((t) => ({
        name: str(t.name),
        cwd: str(t.cwd),
        busy: typeof t.busy === "boolean" ? t.busy : null,
      }))
    : [];
  return {
    folder: str(payload.workspaceFolder) ?? str(payload.folder) ?? str(payload.root),
    files: strings(payload.openFiles),
    activeFile: str(payload.activeFile),
    dirtyFiles: strings(payload.dirtyFiles),
    terminals,
  };
}

/** Browser tabs from a chrome workspace payload. Entries without a url are dropped. */
export function decodeBrowser(payload: JsonObject): BrowserView {
  const tabs: TabView[] = Array.isArray(payload.tabs)
    ? payload.tabs.filter(isObject).flatMap((t) => {
        const url = str(t.url);
        return url ? [{ title: str(t.title), url }] : [];
      })
    : [];
  return { tabs };
}

export function decodeBranch(payload: JsonObject): string | null {
  return str(payload.branch);
}

function mergeEditor(current: EditorView | null, next: EditorView): EditorView {
  if (!current) return next;
  return {
    folder: current.folder ?? next.folder,
    files: [...current.files, ...next.files],
    activeFile: current.activeFile ?? next.activeFile,
    dirtyFiles: [...current.dirtyFiles, ...next.dirtyFiles],
    terminals: [...current.terminals, ...next.terminals],
  };
}

/**
 * When the most recent thing in this capsule was captured, or null for a
 * task nothing has been captured into yet. That is a real state, not an
 * error.
 */
export function capsuleSavedAt(resources: ResourceRow[]): string | null {
  let latest: string | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const r of resources) {
    const ms = parseTime(r.created_at);
    if (ms !== null && ms > latestMs) {
      latestMs = ms;
      latest = r.created_at;
    } else if (ms === null && latest === null && r.created_at) {
      latest = r.created_at;
    }
  }
  return latest;
}

/** Assembles the capsule document from its rows. Two editors on one task merge into one editor. */
export function buildCapsuleView(task: TaskRow, resources: ResourceRow[], pins: PinRow[]): CapsuleView {
  // Declared through assertions so control-flow narrowing starts from the
  // union, not from `null`; otherwise `browser?.tabs` inside the loop is a
  // property read on `never`.
  let editor = null as EditorView | null;
  let browser = null as BrowserView | null;
  let branch = null as string | null;

  for (const r of resources) {
    const kind = r.connector_kind.toLowerCase();
    const payload = parseJsonObject(r.payload);
    if (EDITOR_KINDS.has(kind)) {
      editor = mergeEditor(editor, decodeEditor(payload));
    } else if (BROWSER_KINDS.has(kind)) {
      browser = { tabs: [...(browser?.tabs ?? []), ...decodeBrowser(payload).tabs] };
    } else if (kind === "git") {
      branch = branch ?? decodeBranch(payload);
    }
  }

  return {
    id: task.id,
    title: task.title,
    project: task.project_name,
    status: task.status,
    savedAt: capsuleSavedAt(resources),
    branch,
    editor,
    browser,
    pins: pins.map((p) => ({
      id: p.id,
      connectorKind: p.connector_kind,
      identity: p.identity,
      payload: parseJson(p.payload),
      createdAt: p.created_at,
    })),
  };
}

export function plural(count: number, noun: string, pluralForm = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : pluralForm}`;
}

/**
 * "4 files, 3 terminals, 5 tabs": only the tools that captured something
 * appear. "0 tabs" and "Chrome was not running" are different facts, and
 * only one of them is true, so a zero is never printed.
 */
export function summarize(view: CapsuleView): string {
  const parts: string[] = [];
  const files = view.editor?.files.length ?? 0;
  const terminals = view.editor?.terminals.length ?? 0;
  const tabs = view.browser?.tabs.length ?? 0;
  if (files) parts.push(plural(files, "file"));
  if (terminals) parts.push(plural(terminals, "terminal"));
  if (tabs) parts.push(plural(tabs, "tab"));
  if (view.pins.length) parts.push(plural(view.pins.length, "pin"));
  if (parts.length) return parts.join(", ");
  return view.branch ? "branch only" : "nothing captured yet";
}

export function toSummary(view: CapsuleView): CapsuleSummary {
  return {
    id: view.id,
    title: view.title,
    project: view.project,
    status: view.status,
    branch: view.branch,
    savedAt: view.savedAt,
    summary: summarize(view),
  };
}
