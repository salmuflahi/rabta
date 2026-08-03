/* Rabta — chapter index marks.
 *
 * Each chapter opens with a short rule beside its eyebrow. CSS draws every one
 * of them at rest, and this module only takes over the drawing: it marks a
 * chapter pending, then releases it when the chapter comes into view. A script
 * that never runs, or throws, leaves the page with all its marks — the failure
 * mode is "no animation", never "no content".
 *
 * There is no fade or rise here on purpose. A section-wide reveal is the reflex
 * of a generic page; the chapters already earn their entrance through spacing.
 */

export function initChapterMarks(root = document, env = window) {
  const chapters = [...root.querySelectorAll("[data-chapter]")];
  if (chapters.length === 0) return () => {};

  /* No observer, no opt-in: leaving the marks drawn is the correct outcome. */
  if (typeof env.IntersectionObserver !== "function") return () => {};

  chapters.forEach((chapter) => {
    chapter.dataset.reveal = "pending";
  });

  const observer = new env.IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.dataset.reveal = "shown";
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0 },
  );

  chapters.forEach((chapter) => observer.observe(chapter));

  /* A chapter that somehow never intersects — a hidden ancestor, a browser that
     reports nothing — must not keep its mark undrawn forever. */
  const failsafe = env.setTimeout?.(() => {
    chapters.forEach((chapter) => {
      if (chapter.dataset.reveal === "pending") chapter.dataset.reveal = "shown";
    });
  }, 3000);

  return () => {
    observer.disconnect();
    env.clearTimeout?.(failsafe);
    chapters.forEach((chapter) => {
      chapter.dataset.reveal = "shown";
    });
  };
}
