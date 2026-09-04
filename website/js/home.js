/* Rabta — the homepage's motion.
 *
 * Three things happen here and nowhere else: the hero's opening sequence,
 * the pinned three-move sequence, and the focus-mode switch. Everything
 * scroll-driven goes through Anime's scroll observer. Nothing listens to the
 * scroll event.
 *
 * The page ships finished. Every rule below opts an element into motion by
 * setting an attribute, and removes it on teardown.
 */

import { animate, createTimeline, onScroll, stagger, utils } from "./vendor/anime.esm.min.js";
import { drawMark } from "./brand.js";
import { DUR, reducedMotion } from "./motion.js";

/* ---- the opening ---------------------------------------------------------- */

function initHero(root, env) {
  const hero = root.querySelector("[data-hero]");
  if (!hero) return () => {};
  const mark = hero.querySelector("[data-hero-mark]");
  const word = hero.querySelector("[data-hero-word]");
  const lines = [...hero.querySelectorAll(".rise > span")];
  const lede = hero.querySelector(".hero__lede");
  const actions = hero.querySelector(".hero__actions");
  const stage = hero.querySelector("[data-hero-window]");
  const navBrand = root.querySelector("[data-nav] .brand");
  if (!mark || !word || reducedMotion(env)) return () => {};

  hero.dataset.hero = "pending";
  if (navBrand) navBrand.style.opacity = "0";

  const tl = createTimeline({ autoplay: true, defaults: { ease: "outExpo" } });
  const landed = drawMark(tl, mark, 120);

  tl.set(word, { opacity: 1, translateX: "-0.35em" }, 0);
  tl.add(word, { opacity: [0, 1], translateX: ["-0.35em", "0em"], duration: 720 }, landed - 260);

  tl.set(lines, { opacity: 1, translateY: "110%" }, 0);
  tl.add(lines, { translateY: ["110%", "0%"], duration: 900, delay: stagger(110) }, landed - 120);

  tl.set([lede, actions], { opacity: 1, translateY: 14 }, 0);
  tl.add([lede, actions], { opacity: [0, 1], translateY: [14, 0], duration: 700, delay: stagger(90) }, landed + 240);

  if (stage) {
    tl.set(stage, { opacity: 1, translateY: 40, scale: 0.97 }, 0);
    tl.add(stage, { opacity: [0, 1], translateY: [40, 0], scale: [0.97, 1], duration: 1100 }, landed + 320);
  }
  if (navBrand) {
    tl.add(navBrand, { opacity: [0, 1], duration: 500, ease: "outQuad" }, landed + 500);
  }

  /* The window drifts up a little as the hero leaves: a scrubbed 40px, never
     more, so the shot reads as a thing on the desk rather than a layer. */
  let drift = null;
  if (stage) {
    drift = animate(stage.querySelector(".window"), {
      translateY: [0, -40],
      ease: "linear",
      autoplay: onScroll({ target: hero, enter: "top top", leave: "top bottom", sync: true }),
    });
  }

  return () => {
    tl.revert();
    drift?.revert();
    delete hero.dataset.hero;
    if (navBrand) navBrand.style.opacity = "";
  };
}

/* ---- three moves ------------------------------------------------------------ */

const MOVE_TITLES = ["Rabta — Capsules", "Rabta — Overview", "Rabta — Restoring"];

/**
 * The three loops behind the moves. They are not `data-product-media`
 * blocks: only the current beat's loop should play, and which one that is
 * belongs to the sequence below, not to the viewport. Sources attach when
 * the stage first comes near, never under reduced motion or Save-Data (the
 * posters stand in), and only the active loop plays.
 */
function initMoveLoops(root, env) {
  const scroller = root.querySelector("[data-moves]");
  if (!scroller) return { setActive: () => {}, off: () => {} };
  const shots = [...scroller.querySelectorAll("[data-move-shot]")];
  const saveData = Boolean(env.navigator?.connection?.saveData);
  const allowed = !reducedMotion(env) && !saveData && typeof env.IntersectionObserver === "function";
  const mobile = env.matchMedia("(max-width: 599px)").matches;
  let attached = false;
  let active = shots.findIndex((shot) => shot.hasAttribute("data-active"));
  if (active < 0) active = 0;

  const attach = () => {
    if (attached || !allowed) return;
    attached = true;
    shots.forEach((shot) => {
      shot.src = mobile ? shot.dataset.srcMobile : shot.dataset.srcDesktop;
      shot.load();
    });
    sync();
  };
  const sync = () => {
    if (!attached) return;
    shots.forEach((shot, i) => {
      if (i === active) shot.play().catch(() => {});
      else shot.pause();
    });
  };
  const setActive = (index) => {
    active = index;
    shots.forEach((shot, i) => {
      if (i === index) shot.setAttribute("data-active", "");
      else shot.removeAttribute("data-active");
    });
    sync();
  };

  let observer = null;
  if (allowed) {
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

function initMoves(root, env) {
  const scroller = root.querySelector("[data-moves]");
  if (!scroller) return () => {};
  const loops = initMoveLoops(root, env);
  const moves = [...scroller.querySelectorAll(".move")];
  const title = scroller.querySelector("[data-moves-title]");
  const wide = env.matchMedia("(min-width: 900px)");
  if (!wide.matches || reducedMotion(env)) return () => loops.off();

  scroller.dataset.moves = "live";
  let current = -1;

  const beat = (index) => {
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
  const observer = onScroll({
    target: scroller,
    enter: "top top",
    leave: "bottom bottom",
    onUpdate: (self) => beat(Math.min(2, Math.floor(self.progress * 3))),
  });

  return () => {
    observer.revert();
    loops.off();
    delete scroller.dataset.moves;
    moves.forEach((move, i) => {
      if (i === 0) move.setAttribute("aria-current", "step");
      else move.removeAttribute("aria-current");
    });
  };
}

/* ---- focus mode --------------------------------------------------------------- */

/** What the receipt says in each state. Off is not "zero everything": with
 *  focus mode off, restoring is purely additive, so the same twelve things
 *  come back and nothing is put away or kept. */
const STATES = {
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
function countTo(el, from, to, reduced) {
  if (reduced || from === to) {
    el.textContent = String(to);
    return;
  }
  const state = { n: from };
  animate(state, {
    n: to,
    duration: DUR.reveal,
    ease: "outCubic",
    modifier: utils.round(0),
    onUpdate: () => {
      el.textContent = String(Math.round(state.n));
    },
  });
}

export function initFocusSwitch(root = document, env = window) {
  const toggle = root.querySelector("[data-focus-toggle]");
  if (!toggle) return () => {};

  const labels = [...root.querySelectorAll("[data-focus-label]")];
  const tallies = new Map(
    [...root.querySelectorAll("[data-tally]")].map((el) => [el.dataset.tally, el]),
  );
  const head = root.querySelector("[data-away-head]");
  const list = root.querySelector("[data-away-list]");
  const foot = root.querySelector("[data-away-foot]");
  const reduced = reducedMotion(env);

  const apply = (on) => {
    const next = on ? STATES.on : STATES.off;
    toggle.setAttribute("aria-checked", String(on));
    labels.forEach((el) => {
      el.textContent = next.label;
    });
    for (const [key, el] of tallies) {
      countTo(el, Number(el.textContent) || 0, next.tally[key], reduced);
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

export function initHome(root = document, env = window) {
  if (!root.querySelector("[data-hero]")) return () => {};
  const offs = [initHero(root, env), initMoves(root, env), initFocusSwitch(root, env)];
  return () => offs.forEach((off) => off());
}
