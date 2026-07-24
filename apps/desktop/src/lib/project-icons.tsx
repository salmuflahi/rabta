import {
  Blocks,
  Code2,
  Database,
  Folder,
  FolderGit2,
  Globe2,
  Rocket,
  Terminal,
  Wrench,
  type LucideProps,
} from "lucide-react";
import type { ComponentType } from "react";
import type { ProjectIconKey } from "@/store";

export const PROJECT_ICON_OPTIONS: ReadonlyArray<{
  key: ProjectIconKey;
  label: string;
}> = [
  { key: "code", label: "Code" },
  { key: "globe", label: "Web" },
  { key: "database", label: "Database" },
  { key: "terminal", label: "Terminal" },
  { key: "blocks", label: "Modules" },
  { key: "rocket", label: "Launch" },
  { key: "wrench", label: "Tools" },
  { key: "folder", label: "Folder" },
];

const ICONS = {
  code: Code2,
  globe: Globe2,
  database: Database,
  terminal: Terminal,
  blocks: Blocks,
  rocket: Rocket,
  wrench: Wrench,
  folder: Folder,
} satisfies Record<ProjectIconKey, ComponentType<LucideProps>>;

export function ProjectIcon({
  icon,
  ...props
}: { icon: ProjectIconKey | null } & LucideProps) {
  const Icon = (icon && ICONS[icon]) || FolderGit2;
  return <Icon {...props} />;
}
