/* ==========================================================================
   Rabta — motion primitives

   No dependencies. The Web Animations API does all the work; there is no
   animation library in this repo and none is needed.

   Three things live here:

   1. createRunner() — cancellation. Every chapter owns exactly ONE runner, so
      there is exactly one place to look when something will not stop. A new
      run aborts the previous one before it begins; a long choreography checks
      `scope.stale` between awaits and bails without try/catch noise.

   2. buildSequence() -> Timeline — build first, then play OR scrub. play() and
      scrub() drive the SAME Animation objects, which is what keeps a debug
      scrub honest: it cannot diverge from the shipped path.

   3. travel() — origin-to-destination movement measured from real DOM rects.
      Nothing moves from an invented coordinate.
   ========================================================================== */

export const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
export const EASE_GATHER = "cubic-bezier(0.55, 0, 0.1, 1)";
export const REDUCED_MS = 110;

export function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/* ---- cancellation ------------------------------------------------------ */

export class Cancelled extends Error {
  constructor() {
    super("cancelled");
    this.name = "Cancelled";
  }
}

/** Swallow only OUR cancellation. A real error still throws. */
export function ignoreCancelled(err) {
  if (err instanceof Cancelled) return;
  if (err instanceof DOMException && err.name === "AbortError") return;
  throw err;
}

export function createRunner() {
  let seq = 0;
  let ctrl = null;

  const abort = () => {
    if (ctrl) ctrl.abort();
    ctrl = null;
  };

  return {
    get current() {
      return seq;
    },
    abort,
    destroy() {
      abort();
      seq = -1;
    },
    begin() {
      abort();
      const id = ++seq;
      const ac = (ctrl = new AbortController());
      return {
        id,
        signal: ac.signal,
        get stale() {
          return ac.signal.aborted || id !== seq;
        },
        wait(ms) {
          return new Promise((resolve, reject) => {
            if (ac.signal.aborted) return reject(new Cancelled());
            if (prefersReducedMotion()) return resolve();
            const t = setTimeout(resolve, ms);
            ac.signal.addEventListener(
              "abort",
              () => {
                clearTimeout(t);
                reject(new Cancelled());
              },
              { once: true }
            );
          });
        },
        onAbort(fn) {
          ac.signal.addEventListener("abort", fn, { once: true });
        },
      };
    },
  };
}

/* ---- sequences --------------------------------------------------------- */

/**
 * Steps are declarative. `verb` is required and closed: an animation that
 * cannot name one of the product's motion verbs should not exist.
 */
export const VERBS = [
  "gather",
  "align",
  "stack",
  "fold",
  "preserve",
  "switch",
  "reconnect",
  "unfold",
  "return",
  "settle",
];

export function buildSequence(steps, reduced) {
  const anims = [];
  const marks = [];
  let cursor = 0;

  for (const step of steps) {
    if (!VERBS.includes(step.verb)) {
      throw new Error("motion step needs a product verb, got: " + step.verb);
    }
    const els = Array.isArray(step.el) ? step.el : [step.el];
    const d = reduced ? REDUCED_MS : step.duration;
    const stagger = reduced ? 0 : step.stagger || 0;
    const at = cursor + (step.delay || 0);
    let end = at + d;

    els.forEach((el, i) => {
      if (!el) return;
      const delay = at + i * stagger;
      const a = el.animate(step.keyframes, {
        duration: d,
        delay,
        easing: step.easing || EASE,
        fill: "both",
      });
      a.pause();
      anims.push({ a, persist: !!step.persist });
      end = Math.max(end, delay + d);
    });

    marks.push({ label: step.label, verb: step.verb, at, end });
    cursor = end;
  }

  return {
    total: cursor,
    marks,
    async play(scope) {
      scope.onAbort(() => {
        for (const { a } of anims) {
          try {
            a.cancel();
          } catch {}
        }
      });
      if (scope.stale) throw new Cancelled();
      for (const { a } of anims) a.play();

      /* Watchdog. A browser does not advance animations in a hidden document,
         so `finished` can hang indefinitely if the tab is backgrounded
         mid-sequence. These animations are decoration over DOM state that the
         caller changes authoritatively, so skipping the travel and proceeding
         is strictly better than stalling the machine forever. */
      const settled = Promise.all(anims.map(({ a }) => a.finished)).catch(
        ignoreCancelled
      );
      const watchdog = new Promise((resolve) => {
        const t = setTimeout(resolve, cursor + 600);
        scope.onAbort(() => clearTimeout(t));
      });
      await Promise.race([settled, watchdog]);
      if (scope.stale) throw new Cancelled();
      /* Commit anything a later measurement will read: a live fill:both
         animation makes getBoundingClientRect() return the ANIMATED box,
         which is correct mid-flight and poison at rest. */
      for (const { a, persist } of anims) {
        if (!persist) continue;
        try {
          a.commitStyles();
          a.cancel();
        } catch {}
      }
    },
    scrub(t) {
      for (const { a } of anims) a.currentTime = t;
    },
    dispose() {
      for (const { a } of anims) {
        try {
          a.cancel();
        } catch {}
      }
    },
  };
}

/* ---- origin -> destination --------------------------------------------- */

/**
 * Screen-space delta between two elements' centres, plus the scale that maps
 * `from` onto `to`. Both rects are measured live, so a resize between runs
 * simply produces a different (correct) delta rather than a stale path.
 */
export function delta(fromEl, toEl) {
  const a = fromEl.getBoundingClientRect();
  const b = toEl.getBoundingClientRect();
  return {
    dx: b.left + b.width / 2 - (a.left + a.width / 2),
    dy: b.top + b.height / 2 - (a.top + a.height / 2),
    scale: a.width > 0 ? Math.max(0.18, Math.min(1, b.width / a.width)) : 0.3,
  };
}

/**
 * A travel step: an object leaves its real origin and lands on its real
 * destination. `depth` preserves the object's resting translateZ so it does
 * not visually pop out of the layer stack as it departs.
 */
export function travelStep(el, toEl, opts) {
  const o = opts || {};
  const { dx, dy, scale } = delta(el, toEl);
  const z = o.depth == null ? 0 : o.depth;
  return {
    el,
    label: o.label || "travel",
    verb: o.verb || "gather",
    duration: o.duration || 560,
    delay: o.delay || 0,
    easing: o.easing || EASE_GATHER,
    persist: false,
    keyframes: [
      { transform: `translate3d(0,0,${z}px) scale(1)`, opacity: 1, offset: 0 },
      {
        transform: `translate3d(${dx * 0.55}px, ${dy * 0.42}px, ${z}px) scale(${
          (1 + scale) / 2
        })`,
        opacity: 0.92,
        offset: 0.55,
      },
      {
        transform: `translate3d(${dx}px, ${dy}px, 0) scale(${scale})`,
        opacity: 0,
        offset: 1,
      },
    ],
  };
}

/** The reverse: an object emerges from the capsule and returns to its place. */
export function returnStep(el, fromEl, opts) {
  const o = opts || {};
  const { dx, dy, scale } = delta(el, fromEl);
  const z = o.depth == null ? 0 : o.depth;
  return {
    el,
    label: o.label || "return",
    verb: o.verb || "return",
    duration: o.duration || 520,
    delay: o.delay || 0,
    easing: o.easing || EASE,
    persist: false,
    keyframes: [
      {
        transform: `translate3d(${dx}px, ${dy}px, 0) scale(${scale})`,
        opacity: 0,
        offset: 0,
      },
      {
        transform: `translate3d(${dx * 0.3}px, ${dy * 0.22}px, ${z}px) scale(${
          (1 + scale) / 2
        })`,
        opacity: 0.9,
        offset: 0.6,
      },
      { transform: `translate3d(0,0,${z}px) scale(1)`, opacity: 1, offset: 1 },
    ],
  };
}

/* ---- lifecycle --------------------------------------------------------- */

/** Runs cb(true/false) as the element enters and leaves the viewport. */
export function observeVisibility(el, cb, options) {
  if (!el || typeof IntersectionObserver !== "function") {
    cb(true);
    return () => {};
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) cb(e.isIntersecting);
    },
    Object.assign({ threshold: 0 }, options)
  );
  io.observe(el);
  return () => io.disconnect();
}

/** Fires cb() when the tab becomes hidden. */
export function onHidden(cb) {
  const h = () => {
    if (document.visibilityState === "hidden") cb();
  };
  document.addEventListener("visibilitychange", h);
  return () => document.removeEventListener("visibilitychange", h);
}
