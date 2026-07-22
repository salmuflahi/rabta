import {
  Activity,
  FolderGit2,
  LayoutGrid,
  Layers,
  Plug,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { NavKey } from "@/store";

export interface NavItem {
  key: NavKey;
  label: string;
  icon: LucideIcon;
  shortcut: string;
}

/** Top nav group, in display order. */
export const NAV_ITEMS: NavItem[] = [
  { key: "overview", label: "Overview", icon: LayoutGrid, shortcut: "⌘1" },
  { key: "capsules", label: "Capsules", icon: Layers, shortcut: "⌘2" },
  { key: "projects", label: "Projects", icon: FolderGit2, shortcut: "⌘3" },
  { key: "connectors", label: "Connectors", icon: Plug, shortcut: "⌘4" },
  { key: "activity", label: "Activity", icon: Activity, shortcut: "⌘5" },
];

/** Bottom-of-sidebar item, kept separate from NAV_ITEMS since it renders
 * below the "Local only" badge rather than in the main nav group. */
export const SETTINGS_ITEM: NavItem = {
  key: "settings",
  label: "Settings",
  icon: Settings,
  shortcut: "⌘,",
};
