import type { CapsuleView } from "./shapes.js";

/** The briefing is meant to be pasted into an agent's context, so it stays small. */
export const BRIEFING_MAX_BYTES = 4096;

export const CLOSING_LINE =
  "Restore it from the Rabta app or, once agent access ships, through restore_capsule.";

interface Caps {
  files: number;
  terminals: number;
  tabs: number;
  pins: number;
}

const INITIAL_CAPS: Caps = { files: 40, terminals: 12, tabs: 30, pins: 20 };
const MAX_ITEM_CHARS = 200;

/** Collapses whitespace so a value never breaks a Markdown line. */
function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function clip(value: string, max = MAX_ITEM_CHARS): string {
  const flat = oneLine(value);
  return flat.length > max ? `${flat.slice(0, max - 3)}...` : flat;
}

function listSection<T>(lines: string[], heading: string, items: T[], cap: number, format: (item: T) => string): void {
  if (items.length === 0) return;
  lines.push(heading);
  const shown = items.slice(0, cap);
  for (const item of shown) lines.push(`- ${format(item)}`);
  const rest = items.length - shown.length;
  if (rest > 0) lines.push(`- and ${rest} more`);
  lines.push("");
}

function render(view: CapsuleView, caps: Caps): string {
  const lines: string[] = [`# ${clip(view.title)}`, ""];

  let where = `Project ${clip(view.project)}`;
  if (view.branch) where += ` on branch ${clip(view.branch)}`;
  where += view.savedAt ? `, saved ${clip(view.savedAt)}.` : ", nothing captured yet.";
  if (view.status === "done") where += " Marked done.";
  lines.push(where, "");

  const editor = view.editor;
  if (editor && editor.files.length > 0) {
    const dirty = new Set(editor.dirtyFiles);
    const heading = editor.folder ? `## Files\nFolder: ${clip(editor.folder)}\n` : "## Files";
    listSection(lines, heading, editor.files, caps.files, (file) => {
      let line = clip(file);
      if (file === editor.activeFile) line += " (active)";
      if (dirty.has(file)) line += " (unsaved changes)";
      return line;
    });
  }

  if (editor && editor.terminals.length > 0) {
    listSection(lines, "## Terminals", editor.terminals, caps.terminals, (t) => {
      let line = t.name ? clip(t.name) : "terminal";
      if (t.cwd) line += ` in ${clip(t.cwd)}`;
      if (t.busy) line += " (busy)";
      return line;
    });
  }

  if (view.browser && view.browser.tabs.length > 0) {
    listSection(lines, "## Browser tabs", view.browser.tabs, caps.tabs, (tab) =>
      tab.title ? `${clip(tab.title, 120)} <${clip(tab.url)}>` : `<${clip(tab.url)}>`,
    );
  }

  if (view.pins.length > 0) {
    listSection(lines, "## Pins", view.pins, caps.pins, (pin) => `${clip(pin.connectorKind, 40)}: ${clip(pin.identity)}`);
  }

  lines.push(CLOSING_LINE);
  return `${lines.join("\n")}\n`;
}

/**
 * Renders the Markdown briefing for one capsule. Sections appear only for
 * tools that captured something; long lists end with "and N more", and the
 * caps shrink until the whole document fits in maxBytes.
 */
export function renderBriefing(view: CapsuleView, maxBytes = BRIEFING_MAX_BYTES): string {
  let caps: Caps = { ...INITIAL_CAPS };
  let text = render(view, caps);
  while (Buffer.byteLength(text, "utf8") > maxBytes && Object.values(caps).some((cap) => cap > 1)) {
    caps = {
      files: Math.max(1, Math.floor(caps.files / 2)),
      terminals: Math.max(1, Math.floor(caps.terminals / 2)),
      tabs: Math.max(1, Math.floor(caps.tabs / 2)),
      pins: Math.max(1, Math.floor(caps.pins / 2)),
    };
    text = render(view, caps);
  }
  return text;
}
