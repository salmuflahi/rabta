// Connector display helpers shared across the app so the same friendly names
// show everywhere a connector kind is surfaced (Connectors cards, Overview
// summary, pairing prompts) — never the raw kind token.

/** Friendly display names for the raw connector kind. */
export const KIND_LABEL: Record<string, string> = {
  vscode: "VS Code",
  cursor: "Cursor",
  chrome: "Chrome",
  fake: "Fake",
};

/** The user-facing label for a connector kind, falling back to the raw kind
 * for any kind we don't have a friendly name for. */
export function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind;
}

/** What KIND of thing a connector is, as a plain noun — for sentences that
 * already name the connector elsewhere and would otherwise repeat it
 * mid-sentence. A pairing prompt titled "Chrome wants to connect" gains
 * nothing from a subtitle that says "A Chrome on this Mac..." — it needs
 * the category the name belongs to, not the name again.
 *
 * Wire kinds today are exactly `"fake" | "vscode" | "chrome"` (`ConnectorKind`
 * in crates/omnibus-hub/src/protocol.rs, `#[serde(rename_all = "lowercase")]`).
 * `"cursor"` is handled anyway, for the same reason it's a `KIND_LABEL` entry
 * above even though the hub never sends it today. Unlike `kindLabel`, this
 * never falls back to the raw token — an unknown kind still reads as a
 * sentence, just a generic one, rather than surfacing an internal string. */
const KIND_CATEGORY: Record<string, string> = {
  chrome: "browser extension",
  vscode: "editor extension",
  cursor: "editor extension",
  fake: "test connector",
};

export function kindCategory(kind: string): string {
  return KIND_CATEGORY[kind] ?? "connector";
}
