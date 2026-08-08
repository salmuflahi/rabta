import { expect } from "vitest";

/**
 * Asserts a rendered view spends the orange accent at most once.
 *
 * Orange means one thing only: the live thing, or the primary action, and a
 * page has one primary action. This is the rule most likely to erode as
 * screens grow, so it is checked rather than remembered. Only accent *fills*
 * count — a live-state dot or rail is a mark, not a competing action.
 */
export function expectAtMostOneAccent(container: HTMLElement): void {
  const accented = Array.from(container.querySelectorAll<HTMLElement>("*")).filter((el) =>
    /(^|\s)bg-primary(\s|$)/.test(el.className),
  );
  const labels = accented.map((el) => el.textContent?.trim() || "(unlabelled)");
  expect(
    accented.length,
    `expected at most one accent action, found ${accented.length}: ${labels.join(", ")}`,
  ).toBeLessThanOrEqual(1);
}
