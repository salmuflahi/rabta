// Stable app API; sprite generated from @rabta/ui by sync-rabta-ui.mjs.
import spriteMarkup from "@/assets/icons/rabta-icons.svg?raw";
import { cn } from "@/lib/utils";


export const ICON_NAMES = [
  "overview",
  "capsule",
  "projects",
  "connectors",
  "activity",
  "utilities",
  "settings",
  "shield",
  "search",
  "plus",
  "minus",
  "check",
  "x",
  "chevron-down",
  "chevron-up",
  "chevron-right",
  "chevron-left",
  "sidebar-on",
  "sidebar-off",
  "play",
  "capture",
  "ellipsis",
  "lock",
  "code",
  "globe",
  "terminal",
  "branch",
  "database",
  "folder-open",
  "archive",
  "appearance",
  "keyboard",
  "wifi",
  "alert",
  "check-circle",
  "circle",
] as const;


export type IconName = (typeof ICON_NAMES)[number];

const ICON_NAME_SET: ReadonlySet<string> = new Set(ICON_NAMES);


export function IconSprite() {
  return (
    <div
      aria-hidden="true"
      style={{ display: "none" }}
      dangerouslySetInnerHTML={{ __html: spriteMarkup }}
    />
  );
}

export interface IconProps extends React.SVGAttributes<SVGSVGElement> {
  name: IconName;
  className?: string;
}


export function Icon({ name, className, ...props }: IconProps) {
  const iconName = ICON_NAME_SET.has(name) ? name : "alert";
  if (!ICON_NAME_SET.has(name)) {
    console.error(
      `Icon: unknown icon name "${name}" — not one of the ${ICON_NAMES.length} symbols in rabta-icons.svg.`
    );
  }
  return (
    <svg aria-hidden="true" className={cn("h-4 w-4", className)} {...props}>
      <use href={`#ic-${iconName}`} />
    </svg>
  );
}
