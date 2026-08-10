import type { IconName } from "@/components/ui/icon";
import type { NavKey } from "@/store";

/** The two sidebar section headers a NavItem can fall under (Task 9). This
 * is static data about the item — like its label or shortcut, it never
 * changes at runtime — so it lives here rather than being inferred from
 * position in Sidebar.tsx (which would silently re-derive group boundaries
 * from array indices, exactly the kind of implicit number this codebase has
 * learned to distrust). Sidebar.tsx still owns *aggregating* NAV_ITEMS into
 * named groups for rendering — that's presentation, and specific to how the
 * sidebar happens to lay itself out — this field only says which group each
 * item belongs to. */
export type NavGroupName = "Workspace" | "This Mac";

export interface NavItem {
  key: NavKey;
  label: string;
  /** A symbol id from the Console v2 sprite (src/components/ui/icon.tsx),
   * not a lucide component — Task 9 moves nav glyphs onto the shared sprite
   * so they render as `currentColor` line icons matching the handoff. */
  icon: IconName;
  shortcut: string;
  /** Absent on SETTINGS_ITEM, which is pinned below both groups rather than
   * belonging to either. */
  group?: NavGroupName;
}

/** Top nav group, in display order. */
export const NAV_ITEMS: NavItem[] = [
  { key: "overview", label: "Overview", icon: "overview", shortcut: "⌘1", group: "Workspace" },
  { key: "capsules", label: "Capsules", icon: "capsule", shortcut: "⌘2", group: "Workspace" },
  { key: "projects", label: "Projects", icon: "projects", shortcut: "⌘3", group: "Workspace" },
  { key: "connectors", label: "Connectors", icon: "connectors", shortcut: "⌘4", group: "This Mac" },
  { key: "activity", label: "Activity", icon: "activity", shortcut: "⌘5", group: "This Mac" },
];

/** Bottom-of-sidebar item, kept separate from NAV_ITEMS since it renders
 * below the nav groups rather than inside either one — it has no `group`
 * of its own. */
export const SETTINGS_ITEM: NavItem = {
  key: "settings",
  label: "Settings",
  icon: "settings",
  shortcut: "⌘,",
};
