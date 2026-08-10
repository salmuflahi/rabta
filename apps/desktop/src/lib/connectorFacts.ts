/**
 * What a connector can and cannot see, in plain language.
 *
 * Every line here is a claim the app makes about itself on the Connectors
 * screen, so every line is checked against what the connectors actually
 * send — not against what would be reassuring:
 *
 *  - Chrome (`connectors/chrome/src/tabs.ts`) captures `{ url, title }` for
 *    http/https, non-incognito tabs only, deduped. "Never touches page
 *    content" is that file's own comment and its own behaviour.
 *  - VS Code / Cursor (`connectors/vscode/src/state.ts`) capture the first
 *    workspace folder, open *file paths*, the active file path, terminal
 *    name + cwd + busy flag, and which open files are dirty. No contents.
 *
 * If a connector's capture ever widens, these strings have to widen with
 * it. That is the point of keeping them in one module instead of inline in
 * the page.
 */

export interface CapabilityFact {
  /** The raw capability token, as the connector declares it on the wire. */
  name: string;
  /** What it is used for, in a sentence. */
  use: string;
}

/** The family a capability token belongs to.
 *
 * Connectors declare capabilities at two granularities in this codebase:
 * the coarse family the extensions actually send today (`["workspace",
 * "editor", "terminal"]`, `["tabs"]`) and the dotted command form the
 * design handoff writes (`tabs.list`, `workspace.snapshot`). Both mean the
 * same thing to a reader, so both resolve to the same description — the
 * table still prints the exact token the connector declared. */
function family(capability: string): string {
  return capability.split(".")[0];
}

const CAPABILITY_USE: Record<string, string> = {
  // Exact command tokens first. Two commands in the same family do
  // different things, and falling both back to the family description
  // makes the table say the same sentence twice next to two different
  // names — which reads as a bug even when the family answer is close.
  "workspace.open": "Opens a saved folder in the editor on restore",
  "workspace.snapshot": "Reads the open folder and file paths on capture",
  "editor.openFiles": "Reads the paths of the files you have open",
  "terminal.list": "Reads terminal names and working directories",
  "tabs.list": "Reads open tab addresses on capture",
  "tabs.open": "Reopens saved tabs on restore",

  // Family fallbacks, for the coarse tokens the extensions declare today.
  workspace: "Reads which folder is open, to reopen it on restore",
  editor: "Reads the paths of open files and which one is focused",
  terminal: "Reads terminal names and working directories",
  tabs: "Reads open tab addresses on capture, and reopens them on restore",
};

/** One row per declared capability for the "What it does" table. An
 * unrecognised capability is listed rather than hidden — a connector
 * declaring something this app doesn't have words for is exactly what the
 * user should be able to see. */
export function capabilityFacts(capabilities: string[]): CapabilityFact[] {
  return capabilities.map((name) => ({
    name,
    use:
      CAPABILITY_USE[name] ??
      CAPABILITY_USE[family(name)] ??
      "Declared by this connector; Rabta has no description for it",
  }));
}

const CAN_SEE: Record<string, string[]> = {
  workspace: ["Which folder is open"],
  editor: ["The paths of your open files", "Which file has unsaved changes"],
  terminal: ["Terminal names and working directories"],
  tabs: ["The addresses and titles of open tabs"],
};

/** The "Can see" column — derived from the capabilities the connector
 * actually declared, so a connector that never asked for terminals is not
 * described as reading them. */
export function canSee(capabilities: string[]): string[] {
  const out: string[] = [];
  for (const c of capabilities) {
    for (const line of CAN_SEE[c] ?? CAN_SEE[family(c)] ?? []) {
      if (!out.includes(line)) out.push(line);
    }
  }
  return out;
}

const NEVER_SEES_ALL = ["Passwords, tokens or keychain items"];

const NEVER_SEES_BY_CAPABILITY: Record<string, string[]> = {
  editor: ["The contents of your files"],
  terminal: ["Terminal output or command history"],
  tabs: ["Page contents, form data or cookies", "Incognito tabs, or anything that isn't http(s)"],
};

/** The "Never sees" column. Deliberately concrete: "never your files" is
 * only worth printing next to the specific thing it is denying. */
export function neverSees(capabilities: string[]): string[] {
  const out: string[] = [];
  for (const c of capabilities) {
    for (const line of NEVER_SEES_BY_CAPABILITY[c] ?? NEVER_SEES_BY_CAPABILITY[family(c)] ?? []) {
      if (!out.includes(line)) out.push(line);
    }
  }
  for (const line of NEVER_SEES_ALL) if (!out.includes(line)) out.push(line);
  return out;
}
