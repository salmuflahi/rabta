import type { IconName } from "@/components/ui/icon";

export interface SettingsSectionMeta {
  id: string;
  /** Short label for the 216px section list. */
  label: string;
  /** The 22/640 heading over the section's card. Usually the label, but the
   * list has to stay short where the heading can be fuller. */
  title: string;
  icon: IconName;
}

/**
 * The Settings sections, as data.
 *
 * Separate from SettingsPage so the command palette can offer them as
 * search targets without importing the page (and its whole render tree)
 * into the shell. The page owns what each section *renders*; this owns what
 * each section *is*.
 *
 * All eight of the handoff's sections. Migrate arrived with Phase 3.
 */
export const SETTINGS_SECTIONS: SettingsSectionMeta[] = [
  { id: "general", label: "General", title: "General", icon: "settings" },
  { id: "appearance", label: "Appearance", title: "Appearance", icon: "appearance" },
  { id: "capsules", label: "Capsules", title: "Capsules", icon: "capsule" },
  { id: "connectors", label: "Connectors", title: "Connectors", icon: "connectors" },
  { id: "privacy", label: "Privacy & data", title: "Privacy & data", icon: "shield" },
  { id: "migrate", label: "Migrate", title: "Migrate", icon: "archive" },
  { id: "developer", label: "Developer", title: "Developer", icon: "code" },
  { id: "shortcuts", label: "Shortcuts", title: "Keyboard shortcuts", icon: "keyboard" },
];
