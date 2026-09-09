/* Rabta: the thread.
 *
 * رابطة means the tie. One ember line runs down the homepage, drawn by the
 * reader's own scrolling, touching each chapter on its way: the window, the
 * three moves, the capsule, the receipt, the switch, the terminal. It ends
 * on the wordmark's baseline, at the foot of its first letter, and the
 * wordmark arrives as it does. The whole page is one stroke.
 *
 * Markup contract: an <svg data-thread> with one <path data-thread-path> as
 * the first child of <main>, `[data-thread-anchor="bottom|gutter"]` on the
 * elements it visits in page order, and `[data-thread-end]` on the wordmark
 * it finishes at. The path's geometry is measured from the page, written as
 * attributes (never styles), and rebuilt when ScrollTrigger refreshes.
 *
 * Without script, or under reduced motion, the CSS shows the finished
 * stroke at rest and the wordmark simply there.
 */

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { reducedMotion, type MotionEnv, type Teardown } from "./motion.ts";

gsap.registerPlugin(ScrollTrigger, DrawSVGPlugin);

interface Point {
  x: number;
  y: number;
}

/** How far into the gutter the thread sits beside an anchor, in px. */
const GUTTER = 44;

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * A page-space point for an anchor. "bottom" hangs from the element's bottom
 * centre; "gutter" sits in the margin to its left, level with its top.
 */
function anchorPoint(el: HTMLElement, origin: DOMRect): Point {
  const box = el.getBoundingClientRect();
  const kind = el.dataset.threadAnchor;
  if (kind === "bottom") {
    return { x: box.left + box.width / 2 - origin.left, y: box.bottom - origin.top };
  }
  return { x: box.left - GUTTER - origin.left, y: box.top + 28 - origin.top };
}

/** Where the letters stand in the wordmark's 293-unit-tall viewBox: the
 *  baseline is at 277. */
const BASELINE = 277 / 293;

/**
 * Where the thread hands over: the wordmark's left edge, on its baseline,
 * mapped from the element's box into page space.
 */
function markStart(mark: Element, origin: DOMRect): Point {
  const box = mark.getBoundingClientRect();
  return { x: box.left - origin.left, y: box.top + box.height * BASELINE - origin.top };
}

/** Cubic segments with vertical tangents, so the line reads as one stroke. */
function pathData(points: Point[], end: Point | null): string {
  if (points.length === 0) return "M0 0";
  let d = `M${round(points[0].x)} ${round(points[0].y)}`;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const dy = (b.y - a.y) * 0.5;
    d += ` C${round(a.x)} ${round(a.y + dy)} ${round(b.x)} ${round(b.y - dy)} ${round(b.x)} ${round(b.y)}`;
  }
  if (end) {
    /* The last leg arrives from the left, level with the baseline, so the
       thread reads as the line the word stands on. */
    const a = points[points.length - 1];
    const dy = (end.y - a.y) * 0.6;
    d += ` C${round(a.x)} ${round(a.y + dy)} ${round(end.x - 140)} ${round(end.y)} ${round(end.x)} ${round(end.y)}`;
  }
  return d;
}

export function initThread(root: Document = document, env: MotionEnv = window as MotionEnv): Teardown {
  const svg = root.querySelector<SVGSVGElement>("[data-thread]");
  const path = svg?.querySelector<SVGPathElement>("[data-thread-path]");
  const main = svg?.closest("main");
  if (!svg || !path || !main) return () => {};
  const anchors = [...main.querySelectorAll<HTMLElement>("[data-thread-anchor]")];
  const mark = main.querySelector<SVGSVGElement>("[data-thread-end]");
  const wide = env.matchMedia?.("(min-width: 900px)").matches ?? true;

  const build = () => {
    const origin = main.getBoundingClientRect();
    svg.setAttribute("viewBox", `0 0 ${round(origin.width)} ${round(origin.height)}`);
    const points = anchors.map((el) => anchorPoint(el, origin));
    path.setAttribute("d", pathData(points, mark ? markStart(mark, origin) : null));
  };

  build();
  if (!wide || reducedMotion(env)) {
    /* At rest: the stroke is there, quietly, and the wordmark with it. */
    svg.dataset.thread = "rest";
    return () => {
      delete svg.dataset.thread;
    };
  }

  svg.dataset.thread = "live";
  const draw = gsap.fromTo(
    path,
    { drawSVG: "0%" },
    {
      drawSVG: "100%",
      ease: "none",
      scrollTrigger: {
        trigger: main,
        start: "top top",
        endTrigger: mark ?? main,
        end: mark ? "center 58%" : "bottom bottom",
        scrub: 0.6,
      },
    },
  );

  /* The wordmark arrives as the thread does: it surfaces and settles from
     the point the thread hands it, the foot of its first letter, so that
     corner never moves under the thread's end. */
  let markTl: gsap.core.Timeline | null = null;
  if (mark) {
    markTl = gsap.timeline({
      scrollTrigger: { trigger: mark, start: "top 88%", end: "center 52%", scrub: 0.6 },
    });
    markTl.fromTo(
      mark,
      { opacity: 0, scale: 0.985 },
      { opacity: 1, scale: 1, ease: "none", duration: 1, transformOrigin: `0% ${BASELINE * 100}%` },
      0,
    );
  }

  const onRefresh = () => build();
  ScrollTrigger.addEventListener("refreshInit", onRefresh);
  root.fonts?.ready.then(() => {
    build();
    ScrollTrigger.refresh();
  });

  return () => {
    ScrollTrigger.removeEventListener("refreshInit", onRefresh);
    draw.scrollTrigger?.kill();
    draw.revert();
    markTl?.scrollTrigger?.kill();
    markTl?.revert();
    delete svg.dataset.thread;
  };
}
