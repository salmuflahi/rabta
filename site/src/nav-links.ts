/** The primary navigation, in order. The compact menu and the footer reuse it. */
export const NAV_LINKS = [
  { href: "/why/", label: "Why" },
  { href: "/#product", label: "Product" },
  { href: "/setup/", label: "Setup" },
  { href: "/faq/", label: "FAQ" },
  { href: "/changelog/", label: "Changelog" },
  { href: "/contact/", label: "Contact" },
] as const;

/** Links the compact menu adds beyond the primary set. */
export const MENU_EXTRA = [{ href: "/brand/", label: "Brand" }] as const;

/**
 * Where `aria-current="page"` lands for a route: the first place the route is
 * linked, in document order. Primary nav, then the compact menu, then the
 * footer. Exactly one link on a page carries it.
 */
export function currentScope(pathname: string): "nav" | "menu" | "foot" | "none" {
  if (pathname === "/") return "none";
  if (NAV_LINKS.some((l) => l.href === pathname)) return "nav";
  if (MENU_EXTRA.some((l) => l.href === pathname)) return "menu";
  return "foot";
}
