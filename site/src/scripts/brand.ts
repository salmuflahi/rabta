/* Rabta: the wordmark, arriving.
 *
 * The brand is one word in one colour, so there is nothing to draw stroke by
 * stroke. The wordmark arrives instead: it rises into place with a fade and
 * settles on the same spring the app uses. It takes the 1100 ms the timing
 * module allows (MARK_DRAW.total), so that module and its twin in the app
 * stay equal.
 *
 * Markup contract: an inline <svg class="mark"> holding the wordmark's one
 * path, complete at rest; this module only takes over the arrival.
 */

import { gsap } from "gsap";
import { MARK_DRAW } from "./mark-draw.ts";
import { reducedMotion, type MotionEnv, type Teardown } from "./motion.ts";

/**
 * The spring the wordmark lands on: stiffness 260, damping 18, unit mass, the
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

/** How far the wordmark rises from, as a share of its own height. */
const RISE = 12;
/** The landing spring's length, in milliseconds. It starts 100 ms before the
 *  rise ends, so the two read as one movement. */
const SETTLE = 600;

/**
 * Adds the wordmark's arrival to `tl` starting at `at` (milliseconds, like
 * the constants): the rise with its fade, then the landing spring. Returns
 * the time at which the wordmark has landed, for whatever follows it.
 */
export function revealMark(tl: gsap.core.Timeline, mark: Element, at = 0): number {
  const s = at / 1000;
  const sec = (ms: number) => ms / 1000;
  tl.fromTo(
    mark,
    { opacity: 0, yPercent: RISE },
    { opacity: 1, yPercent: 0, duration: sec(MARK_DRAW.total - 100), ease: "expo.out", immediateRender: true },
    s,
  );
  tl.fromTo(mark, { scale: 0.985 }, { scale: 1, duration: sec(SETTLE), ease: LANDED, transformOrigin: "50% 50%" }, s + sec(MARK_DRAW.total - 100));
  return at + MARK_DRAW.total;
}

/**
 * Every standalone `[data-mark="draw"]` on the page arrives once, when it
 * first scrolls into view. The hero's wordmark is composed by home.ts
 * instead, because it leads a longer sequence.
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
        revealMark(tl, entry.target, 0);
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
 * A wordmark that arrives again on demand: the brand page's "show it again"
 * control, and any `[data-mark-replay]` button that names a mark by
 * `aria-controls`.
 */
export function initMarkReplays(root: Document = document, env: MotionEnv = window as MotionEnv): Teardown {
  const buttons = [...root.querySelectorAll<HTMLElement>("[data-mark-replay]")];
  if (buttons.length === 0) return () => {};
  const handlers = buttons.map((button) => {
    const mark = root.getElementById(button.getAttribute("aria-controls") || "");
    const onClick = () => {
      if (!mark) return;
      if (reducedMotion(env)) return;
      revealMark(gsap.timeline(), mark, 0);
    };
    button.addEventListener("click", onClick);
    return () => button.removeEventListener("click", onClick);
  });
  return () => handlers.forEach((off) => off());
}
