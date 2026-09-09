export const TOOLS = [
  {
    id: "scratchpad",
    name: "Scratchpad",
    category: "Everyday",
    icon: "note",
    description: "A place for the thought you don't want to lose.",
    hint: "notes markdown writing",
  },
  {
    id: "snippets",
    name: "Text snippets",
    category: "Everyday",
    icon: "snippet",
    description: "Keep the replies and fragments you type again and again.",
    hint: "templates email clipboard",
  },
  {
    id: "clipboard",
    name: "Clipboard shelf",
    category: "Everyday",
    icon: "clipboard",
    description: "Collect text on purpose. Copy it again when you need it.",
    hint: "paste history plain text",
  },
  {
    id: "clean-links",
    name: "Clean links",
    category: "Everyday",
    icon: "link",
    description: "Remove tracking from a link—or a whole list.",
    hint: "utm url tracking parameters",
  },
  {
    id: "focus",
    name: "Focus timer",
    category: "Everyday",
    icon: "timer",
    description: "Make room for one thing. Pick a duration and start.",
    hint: "pomodoro countdown break",
  },
  {
    id: "calculator",
    name: "Calculator",
    category: "Everyday",
    icon: "calculator",
    description: "Work out an expression, with parentheses and powers.",
    hint: "math arithmetic percentage",
  },
  {
    id: "units",
    name: "Unit converter",
    category: "Everyday",
    icon: "measure",
    description: "Length, weight, temperature, time and data sizes.",
    hint: "cm inches feet kg lb celsius fahrenheit bytes",
  },
  {
    id: "text",
    name: "Text tools",
    category: "Developer",
    icon: "text",
    description: "Change case, clean whitespace, sort and deduplicate lines.",
    hint: "uppercase lowercase word count sentence",
  },
  {
    id: "json",
    name: "JSON workbench",
    category: "Developer",
    icon: "code",
    description: "Validate, format and compact JSON, with errors you can fix.",
    hint: "prettify minify validate",
  },
  {
    id: "csv",
    name: "CSV ↔ JSON",
    category: "Developer",
    icon: "table",
    description:
      "Move flat records between CSV and JSON without losing quoted fields.",
    hint: "spreadsheet csv json convert",
  },
  {
    id: "encode",
    name: "Encode & decode",
    category: "Developer",
    icon: "code",
    description: "Unicode-safe Base64, URL components and HTML entities.",
    hint: "base64 url html unicode",
  },
  {
    id: "hash",
    name: "SHA-256 checksum",
    category: "Developer",
    icon: "hash",
    description: "Fingerprint text or a file and compare an expected checksum.",
    hint: "digest integrity file hash",
  },
  {
    id: "generate",
    name: "Passwords & UUIDs",
    category: "Developer",
    icon: "key",
    description: "Generate a random password or UUID on your device.",
    hint: "secure random token identifier",
  },
  {
    id: "color",
    name: "Color lab",
    category: "Creative",
    icon: "color",
    description: "Convert colors and check text contrast against a background.",
    hint: "hex rgb hsl wcag contrast color picker",
  },
  {
    id: "rename",
    name: "Batch rename",
    category: "Creative",
    icon: "files",
    description:
      "Preview new filenames. Download renamed copies together as a ZIP.",
    hint: "files rename sequence batch zip",
  },
] as const;
export type ToolId = (typeof TOOLS)[number]["id"];
export type ToolIconName =
  | (typeof TOOLS)[number]["icon"]
  | "star"
  | "search"
  | "x"
  | "arrow"
  | "mac";
export function isToolId(id: string): id is ToolId {
  return TOOLS.some((tool) => tool.id === id);
}
