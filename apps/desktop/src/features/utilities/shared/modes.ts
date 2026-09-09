import { TOOLS, type ToolId } from "./catalog";
export const MODES = ["Everyday", "Developer", "Creator", "Student"] as const;
export type UtilityMode = (typeof MODES)[number];
const recommendations: Record<UtilityMode, readonly ToolId[]> = {
  Everyday: [
    "scratchpad",
    "clipboard",
    "clean-links",
    "focus",
    "calculator",
    "units",
  ],
  Developer: [
    "json",
    "diff",
    "timestamp",
    "creative-svg",
    "encode",
    "hash",
    "generate",
    "snippets",
  ],
  Creator: [
    "creative-resize",
    "creative-compress",
    "creative-media",
    "planner",
    "color",
    "rename",
    "creative-svg",
    "snippets",
  ],
  Student: ["study", "scratchpad", "focus", "calculator", "units", "text"],
};
export function modeTools(mode: UtilityMode) {
  return recommendations[mode].map(
    (id) => TOOLS.find((tool) => tool.id === id)!,
  );
}
