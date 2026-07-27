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
