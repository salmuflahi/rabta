/* Rabta — the mark, drawn.
 *
 * An R whose leg is the Arabic ر. Three strokes, drawn in the order the
 * product happens: the stem (you start), the bowl (you capture), the leg
 * (you leave and come back). The choreography is the same numbers the
 * desktop app uses in src/lib/motion.ts, so the logo draws identically on
 * the page and in the app.
 *
 * Markup contract: an inline <svg data-mark> holding three <path> elements
 * with classes .stem, .bowl and .leg. The paths are complete at rest; this
 * module only takes over the drawing.
 */

import { createTimeline, svg, spring } from "./vendor/anime.esm.min.js";
import { reducedMotion } from "./motion.js";

export const MARK_DRAW = {
  stem: { delay: 0, duration: 420 },
  bowl: { delay: 180, duration: 560 },
  leg: { delay: 560, duration: 640 },
  total: 1100,
};

/** The spring the mark lands on. */
export const LANDED = () => spring({ stiffness: 260, damping: 18 });

/**
 * Adds the mark's three strokes to `tl` starting at `at` (ms). Returns the
 * time at which the mark has landed, for whatever follows it.
 */
export function drawMark(tl, mark, at = 0) {
  const stem = svg.createDrawable(mark.querySelector(".stem"));
  const bowl = svg.createDrawable(mark.querySelector(".bowl"));
  const leg = svg.createDrawable(mark.querySelector(".leg"));
  tl.set([stem, bowl, leg], { draw: "0 0" }, at);
  tl.add(stem, { draw: "0 1", duration: MARK_DRAW.stem.duration, ease: "outExpo" }, at + MARK_DRAW.stem.delay);
  tl.add(bowl, { draw: "0 1", duration: MARK_DRAW.bowl.duration, ease: "outQuart" }, at + MARK_DRAW.bowl.delay);
  tl.add(leg, { draw: "0 1", duration: MARK_DRAW.leg.duration, ease: "outExpo" }, at + MARK_DRAW.leg.delay);
  tl.add(mark, { scale: [0.985, 1], duration: 600, ease: LANDED() }, at + MARK_DRAW.total - 100);
  return at + MARK_DRAW.total;
}

/**
 * Every standalone `[data-mark="draw"]` on the page draws itself once, when
 * it first scrolls into view. The hero's mark is composed by js/home.js
 * instead, because it leads a longer sequence.
 */
export function initMarks(root = document, env = window) {
  const marks = [...root.querySelectorAll('[data-mark="draw"]')];
  if (marks.length === 0 || reducedMotion(env)) return () => {};
  if (typeof env.IntersectionObserver !== "function") return () => {};

  const timelines = [];
  const observer = new env.IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        const tl = createTimeline({ autoplay: true });
        drawMark(tl, entry.target, 0);
        timelines.push(tl);
      });
    },
    { threshold: 0.4 },
  );
  marks.forEach((mark) => observer.observe(mark));

  return () => {
    observer.disconnect();
    timelines.forEach((tl) => tl.revert());
  };
}

/**
 * A mark that replays on demand: the brand page's "draw it again" control,
 * and any `[data-mark-replay]` button that names a mark by `aria-controls`.
 */
export function initMarkReplays(root = document, env = window) {
  const buttons = [...root.querySelectorAll("[data-mark-replay]")];
  if (buttons.length === 0) return () => {};
  const handlers = buttons.map((button) => {
    const mark = root.getElementById(button.getAttribute("aria-controls") || "");
    const onClick = () => {
      if (!mark) return;
      if (reducedMotion(env)) return;
      const tl = createTimeline({ autoplay: true });
      drawMark(tl, mark, 0);
    };
    button.addEventListener("click", onClick);
    return () => button.removeEventListener("click", onClick);
  });
  return () => handlers.forEach((off) => off());
}
