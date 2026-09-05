/* Rabta: the thread.
 *
 * رابطة means the tie. One ember line runs down the homepage, drawn by the
 * reader's own scrolling, touching each chapter on its way: the window, the
 * three moves, the capsule, the receipt, the switch, the terminal. It ends
 * where the mark's leg begins, and the leg draws on from there. The whole
 * page is one stroke.
 *
 * Markup contract: an <svg data-thread> with one <path data-thread-path> as
 * the first child of <main>, `[data-thread-anchor="bottom|gutter"]` on the
 * elements it visits in page order, and `[data-thread-end]` on the mark it
 * finishes in. The path's geometry is measured from the page, written as
 * attributes (never styles), and rebuilt when ScrollTrigger refreshes.
 *
 * Without script, or under reduced motion, the CSS shows the finished
 * stroke at rest and the mark complete.
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

/** The leg's first point, mapped from mark space into page space. */
function legStart(leg: SVGPathElement, origin: DOMRect): Point | null {
  const ctm = leg.getScreenCTM();
  if (!ctm) return null;
  const p = leg.getPointAtLength(0).matrixTransform(ctm);
  return { x: p.x - origin.left, y: p.y - origin.top };
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
    /* The last leg arrives into the mark from the left, on the leg's own
       heading, so the two strokes read as one. */
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
  const leg = mark?.querySelector<SVGPathElement>(".leg");
  const stem = mark?.querySelector<SVGPathElement>(".stem");
  const bowl = mark?.querySelector<SVGPathElement>(".bowl");
  const wide = env.matchMedia?.("(min-width: 900px)").matches ?? true;

  const build = () => {
    const origin = main.getBoundingClientRect();
    svg.setAttribute("viewBox", `0 0 ${round(origin.width)} ${round(origin.height)}`);
    const points = anchors.map((el) => anchorPoint(el, origin));
    path.setAttribute("d", pathData(points, leg ? legStart(leg, origin) : null));
  };

  build();
  if (!wide || reducedMotion(env)) {
    /* At rest: the stroke is there, quietly, and the mark is complete. */
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

  /* The mark draws itself as the thread arrives: the leg first, from the
     point the thread hands it, then the stem and the bowl. */
  let markTl: gsap.core.Timeline | null = null;
  if (mark && leg && stem && bowl) {
    markTl = gsap.timeline({
      scrollTrigger: { trigger: mark, start: "top 88%", end: "center 52%", scrub: 0.6 },
    });
    markTl
      .fromTo(leg, { drawSVG: "0%" }, { drawSVG: "100%", ease: "none", duration: 0.5 }, 0)
      .fromTo(stem, { drawSVG: "0%" }, { drawSVG: "100%", ease: "none", duration: 0.3 }, 0.45)
      .fromTo(bowl, { drawSVG: "0%" }, { drawSVG: "100%", ease: "none", duration: 0.35 }, 0.65)
      .fromTo(mark, { scale: 0.985 }, { scale: 1, ease: "none", duration: 0.3 }, 0.7);
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
