import { expect } from "vitest";

/**
 * Asserts a rendered view spends the orange accent at most once.
 *
 * Orange means one thing only: the live thing, or the primary action, and a
 * page has one primary action. This is the rule most likely to erode as
 * screens grow, so it is checked rather than remembered. Only accent *fills*
 * count — a live-state dot or rail is a mark, not a competing action. Live
 * markers opt out of this count by setting the `data-accent-mark` attribute.
 */
export function expectAtMostOneAccent(container: HTMLElement): void {
  const accented = Array.from(container.querySelectorAll<HTMLElement>("*"))
    .filter((el) => {
      // Get class list in a way that works for both HTML and SVG elements
      const classStr = el.getAttribute("class") || "";
      return /(^|\s)bg-primary(\s|$)/.test(classStr);
    })
    .filter((el) => !el.hasAttribute("data-accent-mark"));
  const labels = accented.map((el) => el.textContent?.trim() || "(unlabelled)");
  expect(
    accented.length,
    `expected at most one accent action, found ${accented.length}: ${labels.join(", ")}`,
  ).toBeLessThanOrEqual(1);
}
