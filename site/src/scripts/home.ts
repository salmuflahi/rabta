/* Rabta: the homepage's motion.
 *
 * Three things happen here and nowhere else: the hero's opening sequence,
 * the pinned three-move sequence, and the focus-mode switch. Everything
 * scroll-driven goes through GSAP's ScrollTrigger. Nothing listens to the
 * scroll event.
 *
 * The page ships finished. Every rule below opts an element into motion by
 * setting an attribute, and removes it on teardown.
 */

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { drawMark } from "./brand.ts";
import { DUR, reducedMotion, type MotionEnv, type Teardown } from "./motion.ts";

gsap.registerPlugin(ScrollTrigger);

interface HomeEnv extends MotionEnv {
  matchMedia: (query: string) => { matches: boolean };
}

/* ---- the opening ---------------------------------------------------------- */

function initHero(root: ParentNode, env: HomeEnv): Teardown {
  const hero = root.querySelector<HTMLElement>("[data-hero]");
  if (!hero) return () => {};
  const mark = hero.querySelector("[data-hero-mark]");
  const word = hero.querySelector<HTMLElement>("[data-hero-word]");
  const lines = [...hero.querySelectorAll<HTMLElement>(".rise > span")];
  const lede = hero.querySelector(".hero__lede");
  const actions = hero.querySelector(".hero__actions");
  const stage = hero.querySelector<HTMLElement>("[data-hero-window]");
  const navBrand = root.querySelector<HTMLElement>("[data-nav] .brand");
  if (!mark || !word || reducedMotion(env)) return () => {};

  hero.dataset.hero = "pending";
  if (navBrand) navBrand.style.opacity = "0";

  const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
  const landed = drawMark(tl, mark, 120) / 1000;
  const slide = parseFloat(getComputedStyle(word).fontSize) * 0.35 || 24;

  tl.fromTo(word, { opacity: 0, x: -slide }, { opacity: 1, x: 0, duration: 0.72 }, landed - 0.26);
  tl.fromTo(lines, { yPercent: 110 }, { yPercent: 0, duration: 0.9, stagger: 0.11 }, landed - 0.12);
  tl.fromTo([lede, actions], { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.09 }, landed + 0.24);
  if (stage) {
    tl.fromTo(stage, { opacity: 0, y: 40, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 1.1 }, landed + 0.32);
  }
  if (navBrand) {
    tl.to(navBrand, { opacity: 1, duration: 0.5, ease: "power2.out" }, landed + 0.5);
  }
  /* Every fromTo above has rendered its start values inline by now, so the
     stylesheet's pending state has done its job: hand over to the timeline. */
  delete hero.dataset.hero;

  /* The window drifts up a little as the hero leaves: a scrubbed 40px, never
     more, so the shot reads as a thing on the desk rather than a layer. */
  let drift: gsap.core.Tween | null = null;
  const frame = stage?.querySelector(".window");
  if (frame) {
    drift = gsap.to(frame, {
      y: -40,
      ease: "none",
      scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true },
    });
  }

  return () => {
    tl.revert();
    drift?.scrollTrigger?.kill();
    drift?.revert();
    delete hero.dataset.hero;
    if (navBrand) navBrand.style.opacity = "";
  };
}

/* ---- three moves ------------------------------------------------------------ */

const MOVE_TITLES = ["Rabta — Capsules", "Rabta — Overview", "Rabta — Restoring"];

interface MoveLoops {
  setActive: (index: number) => void;
  off: () => void;
}

/**
 * The three loops behind the moves. They are not `data-product-media`
 * blocks: only the current beat's loop should play, and which one that is
 * belongs to the sequence below, not to the viewport. Sources attach when
 * the stage first comes near, never under reduced motion or Save-Data (the
 * posters stand in), and only the active loop plays.
 */
function initMoveLoops(root: ParentNode, env: HomeEnv): MoveLoops {
  const scroller = root.querySelector<HTMLElement>("[data-moves]");
  if (!scroller) return { setActive: () => {}, off: () => {} };
  const shots = [...scroller.querySelectorAll<HTMLVideoElement>("[data-move-shot]")];
  const saveData = Boolean(env.navigator?.connection?.saveData);
  const allowed = !reducedMotion(env) && !saveData && typeof env.IntersectionObserver === "function";
  const mobile = env.matchMedia("(max-width: 599px)").matches;
  let attached = false;
  let active = shots.findIndex((shot) => shot.hasAttribute("data-active"));
  if (active < 0) active = 0;

  const sync = () => {
    if (!attached) return;
    shots.forEach((shot, i) => {
      if (i === active) shot.play().catch(() => {});
      else shot.pause();
    });
  };
  const attach = () => {
    if (attached || !allowed) return;
    attached = true;
    shots.forEach((shot) => {
      shot.src = (mobile ? shot.dataset.srcMobile : shot.dataset.srcDesktop) || "";
      shot.load();
    });
    sync();
  };
  const setActive = (index: number) => {
    active = index;
    shots.forEach((shot, i) => {
      if (i === index) shot.setAttribute("data-active", "");
      else shot.removeAttribute("data-active");
    });
    sync();
  };

  let observer: IntersectionObserver | null = null;
  if (allowed && env.IntersectionObserver) {
    observer = new env.IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) attach();
          else if (attached) shots.forEach((shot) => shot.pause());
          if (entry.isIntersecting && attached) sync();
        });
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(scroller);
  }

  return {
    setActive,
    off: () => {
      observer?.disconnect();
      shots.forEach((shot) => shot.pause());
    },
  };
}

function initMoves(root: ParentNode, env: HomeEnv): Teardown {
  const scroller = root.querySelector<HTMLElement>("[data-moves]");
  if (!scroller) return () => {};
  const loops = initMoveLoops(root, env);
  const moves = [...scroller.querySelectorAll<HTMLElement>(".move")];
  const title = scroller.querySelector("[data-moves-title]");
  const wide = env.matchMedia("(min-width: 900px)");
  if (!wide.matches || reducedMotion(env)) return () => loops.off();

  scroller.dataset.moves = "live";
  let current = -1;

  const beat = (index: number) => {
    if (index === current) return;
    current = index;
    moves.forEach((move, i) => {
      if (i === index) move.setAttribute("aria-current", "step");
      else move.removeAttribute("aria-current");
    });
    loops.setActive(index);
    if (title) title.textContent = MOVE_TITLES[index] ?? title.textContent;
  };

  beat(0);
  const trigger = ScrollTrigger.create({
    trigger: scroller,
    start: "top top",
    end: "bottom bottom",
    onUpdate: (self) => beat(Math.min(2, Math.floor(self.progress * 3))),
  });

  return () => {
    trigger.kill();
    loops.off();
    delete scroller.dataset.moves;
    moves.forEach((move, i) => {
      if (i === 0) move.setAttribute("aria-current", "step");
      else move.removeAttribute("aria-current");
    });
  };
}

/* ---- focus mode --------------------------------------------------------------- */

interface FocusState {
  label: string;
  tally: Record<string, number>;
  head: string;
  kept: Array<[string, string, string]>;
  foot: string;
}

/** What the receipt says in each state. Off is not "zero everything": with
 *  focus mode off, restoring is purely additive, so the same twelve things
 *  come back and nothing is put away or kept. */
const STATES: Record<"on" | "off", FocusState> = {
  on: {
    label: "focus mode on",
    tally: { back: 12, away: 6, kept: 4 },
    head: "6 tabs closed · 4 kept",
    kept: [
      ["2", "tabs kept", "pinned in the browser"],
      ["1", "file kept", "unsaved changes"],
      ["1", "terminal left running", "npm run dev"],
    ],
    foot: "Closed items are held in the task you left. Resume it to get them back.",
  },
  off: {
    label: "focus mode off",
    tally: { back: 12, away: 0, kept: 0 },
    head: "Nothing was put away",
    kept: [],
    foot: "Restoring is additive with focus mode off. It opens things and closes nothing.",
  },
};

/** Count from one number to another, easing out; lands immediately under
 *  reduced motion. */
function countTo(el: Element, from: number, to: number, reduced: boolean): void {
  if (reduced || from === to) {
    el.textContent = String(to);
    return;
  }
  const state = { n: from };
  gsap.to(state, {
    n: to,
    duration: DUR.reveal / 1000,
    ease: "power3.out",
    onUpdate: () => {
      el.textContent = String(Math.round(state.n));
    },
  });
}

export function initFocusSwitch(root: Document = document, env: MotionEnv = window as MotionEnv): Teardown {
  const toggle = root.querySelector<HTMLElement>("[data-focus-toggle]");
  if (!toggle) return () => {};

  const labels = [...root.querySelectorAll("[data-focus-label]")];
  const tallies = new Map(
    [...root.querySelectorAll<HTMLElement>("[data-tally]")].map((el) => [el.dataset.tally ?? "", el] as const),
  );
  const head = root.querySelector("[data-away-head]");
  const list = root.querySelector("[data-away-list]");
  const foot = root.querySelector("[data-away-foot]");
  const reduced = reducedMotion(env);

  const apply = (on: boolean) => {
    const next = on ? STATES.on : STATES.off;
    toggle.setAttribute("aria-checked", String(on));
    labels.forEach((el) => {
      el.textContent = next.label;
    });
    for (const [key, el] of tallies) {
      countTo(el, Number(el.textContent) || 0, next.tally[key] ?? 0, reduced);
    }
    if (head) head.textContent = next.head;
    if (foot) foot.textContent = next.foot;
    if (list) {
      list.replaceChildren(
        ...next.kept.map(([n, text, why]) => {
          const li = root.createElement("li");
          const num = root.createElement("b");
          num.textContent = n;
          const reason = root.createElement("i");
          reason.textContent = why;
          li.append(num, ` ${text} `, reason);
          return li;
        }),
      );
    }
  };

  const onClick = () => apply(toggle.getAttribute("aria-checked") !== "true");
  toggle.addEventListener("click", onClick);
  return () => toggle.removeEventListener("click", onClick);
}

/* ---- boot ----------------------------------------------------------------------- */

export function initHome(root: Document = document, env: HomeEnv = window as unknown as HomeEnv): Teardown {
  if (!root.querySelector("[data-hero]")) return () => {};
  const offs = [initHero(root, env), initMoves(root, env), initFocusSwitch(root, env)];
  /* Web fonts change line lengths, and with them where every trigger sits. */
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
  return () => offs.forEach((off) => off());
}
