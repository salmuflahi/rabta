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

/**
 * A best-effort stand-in for a connector's real declared capabilities, for
 * the one screen that has to describe a connector before it has any: the
 * pairing sheet. The `pair` frame that parks a pairing request carries only
 * `name` and `kind` (`Pair` in crates/omnibus-hub/src/protocol.rs; see
 * `handle_pairing` in hub.rs) — real capabilities only arrive later, on
 * `hello`, after the user has already approved or denied. So this answers a
 * narrower question than `canSee`/`neverSees` normally do: not "what did
 * this request declare" but "what does a connector of this *kind* typically
 * ask for", grounded in the same facts this module's header documents
 * (Chrome's tabs capability; VS Code/Cursor's workspace+editor+terminal) —
 * confirmed against connectors/chrome/src/background.ts,
 * connectors/vscode/src/extension.ts and connectors/fake/src/main.ts's own
 * `capabilities: [...]` literals, not invented here. `fake` is included for
 * the same reason as the other two, even though it's `"private": true` and
 * dev-only (excluded from packaging, so no end user's pairing sheet ever
 * shows it) — there was real data to ground it in, in the same tree already
 * being read for the other two, so there was no reason to leave it as an
 * ungrounded default instead.
 *
 * Forwarding real capabilities on the `pair` frame would let the sheet show
 * the actual request instead of the kind's usual one, and would let it flag
 * a connector asking for more than its kind normally does — which this
 * stand-in structurally cannot do, since it only ever knows the kind. That's
 * a protocol change, logged as a follow-up for the security audit rather
 * than made here. Any caller using this instead of a real capability list
 * must say so in its copy — see PairingSheet's line under the two cards.
 *
 * An empty result now means exactly one thing: a kind this build doesn't
 * recognize at all. `ConnectorKind` is presently a closed three-variant
 * enum (`fake | vscode | chrome`), so that can't happen today — this is
 * forward-compatibility for a kind a future protocol version adds, running
 * against a build of this app that predates it. Callers must not render
 * that empty result as an empty affirmative list — see PairingSheet's
 * unrecognized-kind branch.
 */
export function capabilitiesForKind(kind: string): string[] {
  if (kind === "chrome") return ["tabs"];
  if (kind === "vscode" || kind === "cursor") return ["workspace", "editor", "terminal"];
  if (kind === "fake") return ["workspace", "editor"];
  return [];
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
