/* Rabta: the mark, drawn.
 *
 * An R whose leg is the Arabic ر. Three strokes, drawn in the order the
 * product happens: the stem (you start), the bowl (you capture), the leg
 * (you leave and come back). The choreography lives in mark-draw.ts and is
 * the same numbers the desktop app uses, so the logo draws identically on
 * the page and in the app.
 *
 * Markup contract: an inline <svg data-mark> holding three <path> elements
 * with classes .stem, .bowl and .leg. The paths are complete at rest; this
 * module only takes over the drawing.
 */

import { gsap } from "gsap";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { MARK_DRAW } from "./mark-draw.ts";
import { reducedMotion, type MotionEnv, type Teardown } from "./motion.ts";

gsap.registerPlugin(DrawSVGPlugin);

/**
 * The spring the mark lands on: stiffness 260, damping 18, unit mass, the
 * same spring the app uses. Sampled as a plain easing function over the
 * 600ms landing, so GSAP can run it without a physics plugin. Underdamped
 * (zeta 0.56): one small overshoot, then rest.
 */
export function springEase(stiffness: number, damping: number, seconds: number): (p: number) => number {
  const w0 = Math.sqrt(stiffness);
  const zeta = damping / (2 * w0);
  const wd = w0 * Math.sqrt(1 - zeta * zeta);
  const at = (t: number) => 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  const end = at(seconds);
  return (p: number) => (p >= 1 ? 1 : at(p * seconds) / end);
}

export const LANDED = springEase(260, 18, 0.6);

/**
 * Adds the mark's three strokes to `tl` starting at `at` (milliseconds, like
 * the constants). Returns the time at which the mark has landed, for whatever
 * follows it.
 */
export function drawMark(tl: gsap.core.Timeline, mark: Element, at = 0): number {
  const stem = mark.querySelector(".stem");
  const bowl = mark.querySelector(".bowl");
  const leg = mark.querySelector(".leg");
  const s = at / 1000;
  const sec = (ms: number) => ms / 1000;
  tl.set([stem, bowl, leg], { drawSVG: "0%" }, s);
  tl.to(stem, { drawSVG: "100%", duration: sec(MARK_DRAW.stem.duration), ease: "expo.out" }, s + sec(MARK_DRAW.stem.delay));
  tl.to(bowl, { drawSVG: "100%", duration: sec(MARK_DRAW.bowl.duration), ease: "power4.out" }, s + sec(MARK_DRAW.bowl.delay));
  tl.to(leg, { drawSVG: "100%", duration: sec(MARK_DRAW.leg.duration), ease: "expo.out" }, s + sec(MARK_DRAW.leg.delay));
  tl.fromTo(mark, { scale: 0.985 }, { scale: 1, duration: 0.6, ease: LANDED, transformOrigin: "50% 50%" }, s + sec(MARK_DRAW.total - 100));
  return at + MARK_DRAW.total;
}

/**
 * Every standalone `[data-mark="draw"]` on the page draws itself once, when
 * it first scrolls into view. The hero's mark is composed by home.ts instead,
 * because it leads a longer sequence.
 */
export function initMarks(root: ParentNode = document, env: MotionEnv = window as MotionEnv): Teardown {
  const marks = [...root.querySelectorAll<SVGElement>('[data-mark="draw"]')];
  if (marks.length === 0 || reducedMotion(env)) return () => {};
  if (typeof env.IntersectionObserver !== "function") return () => {};

  const timelines: gsap.core.Timeline[] = [];
  const observer = new env.IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        const tl = gsap.timeline();
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
export function initMarkReplays(root: Document = document, env: MotionEnv = window as MotionEnv): Teardown {
  const buttons = [...root.querySelectorAll<HTMLElement>("[data-mark-replay]")];
  if (buttons.length === 0) return () => {};
  const handlers = buttons.map((button) => {
    const mark = root.getElementById(button.getAttribute("aria-controls") || "");
    const onClick = () => {
      if (!mark) return;
      if (reducedMotion(env)) return;
      drawMark(gsap.timeline(), mark, 0);
    };
    button.addEventListener("click", onClick);
    return () => button.removeEventListener("click", onClick);
  });
  return () => handlers.forEach((off) => off());
}
