import { expect } from "vitest";

/** Elements that establish their own accent budget. A modal layer sits
 * *over* the page rather than competing with it, so a sheet's one accent and
 * the page's one accent are not two accents on one screen. Introduced when
 * the pairing sheet's Approve button began overlaying pages that already
 * spend their own accent on Resume/Restore. */
const LAYER_SELECTOR = "[data-sheet], [role='dialog']";

/**
 * Asserts a rendered view spends the orange accent at most once.
 *
 * Orange means one thing only: the live thing, or the primary action, and a
 * page has one primary action. This is the rule most likely to erode as
 * screens grow, so it is checked rather than remembered. Only accent *fills*
 * count — a live-state dot or rail is a mark, not a competing action. Live
 * markers opt out of this count by setting the `data-accent-mark` attribute.
 *
 * A screen is the chrome *plus* the page, and both can hold a real primary
 * action — Overview's hero "Resume" against the Toolbar's "New capsule". They
 * do not race for it: pages declare their spend through `useOwnsViewAccent`
 * (src/shell/viewAccent.ts) and the Toolbar's contextual action goes neutral
 * while a claim is held (src/shell/Toolbar.tsx). If this assertion fires on a
 * page-plus-toolbar render, a missing or mis-scoped claim is the first thing
 * to check. Note that rendering a page *without* the toolbar cannot catch
 * that class of failure at all — App.test.tsx renders both together.
 *
 * The budget is per layer, not per container. A `[data-sheet]` or
 * `[role="dialog"]` element overlays the page rather than competing with
 * it, so it gets its own budget separate from the page beneath it — one
 * accent in the sheet and one on the page is not two accents on one screen.
 * Two accents inside the *same* layer (including two on the bare page) are
 * still rejected: each accented element is attributed to its nearest
 * enclosing layer, or to the page itself when it has none, and every group
 * is checked independently.
 */
export function expectAtMostOneAccent(container: HTMLElement): void {
  const accented = Array.from(container.querySelectorAll<HTMLElement>("*"))
    .filter((el) => {
      // Get class list in a way that works for both HTML and SVG elements
      const classStr = el.getAttribute("class") || "";
      return /(^|\s)bg-primary(\s|$)/.test(classStr);
    })
    .filter((el) => !el.hasAttribute("data-accent-mark"));

  // Bucket by the nearest enclosing layer element itself (not just "in a
  // layer or not"), so two separate sheets — were that ever possible — would
  // also be budgeted independently rather than pooled together.
  const byLayer = new Map<Element | null, HTMLElement[]>();
  for (const el of accented) {
    const layer = el.closest(LAYER_SELECTOR);
    const group = byLayer.get(layer);
    if (group) group.push(el);
    else byLayer.set(layer, [el]);
  }

  for (const group of byLayer.values()) {
    const labels = group.map((el) => el.textContent?.trim() || "(unlabelled)");
    expect(
      group.length,
      `expected at most one accent action, found ${group.length}: ${labels.join(", ")}`,
    ).toBeLessThanOrEqual(1);
  }
}
