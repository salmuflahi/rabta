import spriteMarkup from "@/assets/icons/rabta-icons.svg?raw";
import { cn } from "@/lib/utils";

/**
 * The Console v2 icon sprite (design_handoff_rabta_console/icons/rabta-icons.svg,
 * copied verbatim to src/assets/icons/) — 35 glyphs on a 16×16 grid as
 * `<symbol id="ic-*">`, every fill/stroke `currentColor`. Names below are the
 * symbol ids with their `ic-` prefix stripped.
 *
 * This list is the single source of truth for `IconName` — if the sprite
 * ever gains or loses a glyph, update it here and `icon.test.tsx`'s sprite
 * round-trip test will catch any drift against the shipped asset.
 */
export const ICON_NAMES = [
  "overview",
  "capsule",
  "projects",
  "connectors",
  "activity",
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

/**
 * A closed union of every glyph the sprite ships. Passing a literal that
 * isn't one of these fails to compile — the strongest form of "fail loudly"
 * for the common case where the name is known at the call site (this is
 * every call site until Phase 2 wires icons into screens).
 */
export type IconName = (typeof ICON_NAMES)[number];

const ICON_NAME_SET: ReadonlySet<string> = new Set(ICON_NAMES);

/**
 * Injects the sprite's `<symbol>` defs into the document once, so any
 * `<Icon>`'s `<use href="#ic-*">` can resolve. Render this exactly once,
 * at the app root (see main.tsx) — not inside a page or panel, so a screen
 * unmounting can never pull the defs out from under an `<Icon>` still
 * mounted elsewhere.
 *
 * `dangerouslySetInnerHTML` with the raw asset (via Vite's `?raw` import)
 * rather than hand-transcribing 35 `<symbol>`s into JSX keeps this file a
 * faithful mirror of the design handoff's rabta-icons.svg — regenerating
 * the sprite and re-copying the file is the only way to update glyphs,
 * there's no second copy to fall out of sync.
 *
 * Deliberately NOT rendered via `<img src=...>`: an SVG loaded that way is
 * an isolated document where `currentColor` resolves to black, which is
 * exactly the bug this component exists to avoid (see the brand mark in
 * shell/Sidebar.tsx for the same constraint on a single glyph).
 */
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

/**
 * Renders one glyph from the Console v2 sprite as `<svg><use href="#ic-…">`.
 * Colour comes entirely from CSS `color` inheritance (every symbol paints
 * with `currentColor`) — this component sets no fill and no color of its
 * own, so it always follows whatever text colour it's placed in.
 *
 * `name` is typed as the closed `IconName` union, so a typo'd literal is a
 * compile error. The runtime check below exists for the case that escapes
 * that guarantee: a name arriving as a plain string forced past the union
 * (external config, a migrated lucide name, `as IconName`). Without it, an
 * unresolvable `<use>` renders nothing — an empty box with no error, the
 * failure mode that survives code review and ships. Throwing surfaces it
 * immediately instead, in dev and in production alike, the same way React
 * itself throws on an invalid element type rather than rendering silently.
 */
export function Icon({ name, className, ...props }: IconProps) {
  if (!ICON_NAME_SET.has(name)) {
    throw new Error(
      `Icon: unknown icon name "${name}" — not one of the ${ICON_NAMES.length} symbols in rabta-icons.svg.`
    );
  }
  return (
    <svg aria-hidden="true" className={cn("h-4 w-4", className)} {...props}>
      <use href={`#ic-${name}`} />
    </svg>
  );
}
