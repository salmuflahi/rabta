/* ==========================================================================
   Rabta — chapter 2, the scroll-scrubbed context-switch story

   Progress comes from native scroll position only. Nothing here listens to
   wheel, touch or key events, so browser scrolling, the back button, keyboard
   paging and find-in-page all behave normally.

   Seven zones, UNEQUAL by design. Five equal scenes across the track would
   give each less than one trackpad flick, so the three content scenes
   (fragmentation, gather, return) get real budgets and the two transitional
   ones are short. The table is the single source of truth for pacing.

   One rAF, and only while the pin is on screen and the tab is visible.
   Progress is computed from a CACHED track offset plus live scrollY — never
   getBoundingClientRect per frame.
   ========================================================================== */

import { observeVisibility, prefersReducedMotion } from "./motion.js";

/* Zone edges as fractions of the track. Widths, in order:
   .10 stable · .16 interrupt · .18 fragment · .18 gather · .08 seal
   .16 unfold · .14 return */
const EDGES = [0, 0.1, 0.26, 0.44, 0.62, 0.7, 0.86, 1];

/* Which statement is on screen in each zone. */
const ZONE_SCENE = [0, 0, 1, 2, 2, 3, 4];

/* Where each layer sits when the workspace comes apart. Deliberately uneven —
   a symmetric scatter reads as decoration rather than as fragmentation. */
const SCATTER = [
  { x: -0.42, y: -0.30, r: -7 },
  { x: 0.44, y: -0.14, r: 5.5 },
  { x: -0.30, y: 0.34, r: 8 },
  { x: 0.36, y: 0.32, r: -5 },
];

/* Where each layer docks when the workspace is whole. */
const DOCK = [
  { x: -0.30, y: -0.20 },
  { x: 0.31, y: -0.09 },
  { x: -0.22, y: 0.23 },
  { x: 0.26, y: 0.22 },
];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const range = (v, a, b) => clamp((v - a) / (b - a), 0, 1);
const smooth = (t) => t * t * (3 - 2 * t);
const mix = (a, b, t) => a + (b - a) * t;

export function initStory(root) {
  if (!root) return;

  const track = root.querySelector("[data-story-track]");
  const pin = root.querySelector("[data-story-pin]");
  const stage = root.querySelector("[data-story-stage]");
  const frame = root.querySelector("[data-story-frame]");
  const capsule = root.querySelector("[data-story-capsule]");
  /* Scoped to the STAGE. The stacked fallback contains its own copy of the
     layer set, and querying from the root would animate those hidden nodes
     too — and index them past DOCK/SCATTER. */
  const layers = Array.from(
    (root.querySelector("[data-story-stage]") || root).querySelectorAll(
      "[data-story-layer]"
    )
  );
  const lines = Array.from(root.querySelectorAll("[data-story-line]"));

  /* Stacked is the complete story, not a degraded one. It is also what a
     narrow viewport and a JS failure both render. */
  const stacked = () =>
    prefersReducedMotion() || window.innerWidth < 900;

  if (stacked()) {
    root.classList.add("story--stacked");
    lines.forEach((l) => l.classList.add("is-on"));
    return;
  }

  if (!track || !pin || !stage || !layers.length) return;

  let trackTop = 0;
  let trackH = 0;
  let stageW = 0;
  let stageH = 0;

  function measure() {
    const r = track.getBoundingClientRect();
    trackTop = r.top + window.scrollY;
    trackH = track.offsetHeight - window.innerHeight;
    const s = stage.getBoundingClientRect();
    stageW = s.width;
    stageH = s.height;
  }

  let raf = 0;
  let onScreen = false;
  let visible = document.visibilityState !== "hidden";
  let lastScene = -1;

  function zoneOf(p) {
    for (let i = EDGES.length - 2; i >= 0; i -= 1) {
      if (p >= EDGES[i]) return i;
    }
    return 0;
  }

  function apply() {
    if (trackH <= 0) return;
    const p = clamp((window.scrollY - trackTop) / trackH, 0, 1);

    /* Local eased progress through the four transformations. */
    const interrupt = smooth(range(p, EDGES[1], EDGES[2]));
    const fragment = smooth(range(p, EDGES[2], EDGES[3]));
    const gather = smooth(range(p, EDGES[3], EDGES[4]));
    const unfold = smooth(range(p, EDGES[5], EDGES[6]));
    const back = smooth(range(p, EDGES[6], EDGES[7]));

    /* The frame recedes as the workspace comes apart and returns whole. */
    if (frame) {
      const away = Math.max(fragment, gather) * (1 - back);
      frame.style.setProperty("--fsc", (1 - 0.07 * away).toFixed(3));
      frame.style.setProperty("--fty", (10 * away).toFixed(1) + "px");
      frame.style.setProperty("--fop", (1 - 0.62 * away).toFixed(3));
    }

    layers.forEach((el, i) => {
      const dock = DOCK[i] || DOCK[0];
      const scat = SCATTER[i] || SCATTER[0];

      /* dock -> scattered -> converged on the capsule -> back to dock */
      const lift = interrupt * (1 - fragment);
      let x = mix(dock.x, scat.x, fragment);
      let y = mix(dock.y, scat.y, fragment) - lift * 0.03;
      let r = mix(0, scat.r, fragment);
      let s = mix(1, 0.94, fragment);
      let o = 1;

      /* Gather: everything converges on the centre, where the capsule is. */
      x = mix(x, 0, gather);
      y = mix(y, 0, gather);
      r = mix(r, 0, gather);
      s = mix(s, 0.3, gather);
      o = 1 - gather;

      /* Unfold: the NEXT task's context emerges from the capsule. */
      if (unfold > 0) {
        x = mix(0, dock.x, unfold);
        y = mix(0, dock.y, unfold);
        s = mix(0.3, 1, unfold);
        o = unfold;
        r = 0;
      }

      el.style.setProperty("--lx", (x * stageW).toFixed(1) + "px");
      el.style.setProperty("--ly", (y * stageH).toFixed(1) + "px");
      el.style.setProperty("--lr", r.toFixed(2) + "deg");
      el.style.setProperty("--ls", s.toFixed(3));
      el.style.setProperty("--lop", clamp(o, 0, 1).toFixed(3));
    });

    if (capsule) {
      /* Present while the context is held: appears as the gather completes,
         seals, then hands off as the next task unfolds. */
      const inC = smooth(range(p, EDGES[3] + 0.06, EDGES[4]));
      const outC = smooth(range(p, EDGES[5], EDGES[5] + 0.08));
      const cop = clamp(inC - outC, 0, 1);
      capsule.style.setProperty("--cop", cop.toFixed(3));
      capsule.style.setProperty("--csc", mix(0.88, 1, inC).toFixed(3));
      capsule.dataset.capState = p >= EDGES[4] ? "saved" : "saving";
    }

    const scene = ZONE_SCENE[zoneOf(p)];
    if (scene !== lastScene) {
      lastScene = scene;
      lines.forEach((l, i) => l.classList.toggle("is-on", i === scene));
    }
  }

  function frameLoop() {
    raf = 0;
    apply();
    if (onScreen && visible) raf = requestAnimationFrame(frameLoop);
  }

  function sync() {
    if (onScreen && visible) {
      if (!raf) raf = requestAnimationFrame(frameLoop);
    } else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  measure();
  apply();

  observeVisibility(
    pin,
    (isIn) => {
      onScreen = isIn;
      sync();
    },
    { rootMargin: "120px 0px" }
  );

  document.addEventListener("visibilitychange", () => {
    visible = document.visibilityState !== "hidden";
    sync();
  });

  /* Width changes can flip the whole chapter into stacked mode; height-only
     changes (mobile URL bar) must NOT re-quantise the track. */
  let lastW = window.innerWidth;
  window.addEventListener(
    "resize",
    () => {
      if (window.innerWidth !== lastW) {
        lastW = window.innerWidth;
        if (stacked()) {
          root.classList.add("story--stacked");
          lines.forEach((l) => l.classList.add("is-on"));
          if (raf) cancelAnimationFrame(raf);
          raf = 0;
          return;
        }
      }
      measure();
      apply();
    },
    { passive: true }
  );
}
