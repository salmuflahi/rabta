/* Rabta — the motion foundation every page shares.
 *
 * Three things, and a rule. Reduced motion is read once and honoured by
 * everything below; the scroll reveal only ever hides what is off screen at
 * boot; and nothing here listens to the scroll event directly — reveals use
 * IntersectionObserver, scrubbed timelines use Anime's scroll observer.
 *
 * The rule: CSS ships the finished page. A module that never runs, or throws,
 * leaves the reader with everything visible. Motion is opt-in, per element,
 * by this file.
 */

export const REDUCED = "(prefers-reduced-motion: reduce)";

/** True when the visitor asked for less motion. Guarded so a test double
 *  without matchMedia reads as "motion allowed". */
export function reducedMotion(env = window) {
  try {
    return typeof env.matchMedia === "function" && env.matchMedia(REDUCED).matches;
  } catch {
    return false;
  }
}

/** The brand's one settling curve and its durations, mirrored from
 *  css/tokens.css so a timeline and a transition land the same way. */
export const EASE = "cubicBezier(0.16, 1, 0.3, 1)";
export const DUR = { hover: 120, state: 240, reveal: 480, ceremony: 900 };

/**
 * Reveal: `[data-reveal]` elements below the fold at boot are marked pending
 * and released as they scroll into view. Elements already on screen are left
 * alone, so the first paint is never interrupted. `data-reveal-delay="120"`
 * staggers siblings through the `--reveal-delay` custom property.
 */
export function initReveal(root = document, env = window) {
  const items = [...root.querySelectorAll("[data-reveal]")];
  if (items.length === 0) return () => {};
  if (reducedMotion(env) || typeof env.IntersectionObserver !== "function") {
    items.forEach((el) => {
      el.dataset.reveal = "in";
    });
    return () => {};
  }

  const fold = (env.innerHeight || 0) * 0.92;
  const pending = items.filter((el) => {
    const box = el.getBoundingClientRect();
    if (box.top < fold) {
      el.dataset.reveal = "in";
      return false;
    }
    const delay = el.dataset.revealDelay;
    if (delay) el.style.setProperty("--reveal-delay", `${Number(delay)}ms`);
    el.dataset.reveal = "pending";
    return true;
  });

  const observer = new env.IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.dataset.reveal = "in";
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
  );
  pending.forEach((el) => observer.observe(el));

  /* An element that is on screen and somehow never reported must not stay
     hidden. Three seconds is longer than any scroll-in takes. */
  const failsafe = env.setTimeout?.(() => {
    pending.forEach((el) => {
      if (el.dataset.reveal !== "pending") return;
      const box = el.getBoundingClientRect();
      if (box.top < (env.innerHeight || 0) && box.bottom > 0) el.dataset.reveal = "in";
    });
  }, 3000);

  return () => {
    observer.disconnect();
    env.clearTimeout?.(failsafe);
    pending.forEach((el) => {
      el.dataset.reveal = "in";
    });
  };
}

/**
 * The nav turns solid once the page has scrolled under it. A sentinel at the
 * top of the document is watched rather than the scroll position, so this
 * costs nothing per frame.
 */
export function initNav(root = document, env = window) {
  const nav = root.querySelector("[data-nav]");
  if (!nav || typeof env.IntersectionObserver !== "function") return () => {};
  const sentinel = root.createElement("div");
  sentinel.setAttribute("aria-hidden", "true");
  sentinel.style.cssText = "position:absolute;top:0;left:0;width:1px;height:24px;pointer-events:none;";
  root.body.prepend(sentinel);
  const observer = new env.IntersectionObserver(
    ([entry]) => {
      nav.classList.toggle("nav--solid", !entry.isIntersecting);
    },
    { threshold: 0 },
  );
  observer.observe(sentinel);

  /* The compact menu closes itself after a choice, and on Escape. */
  const menu = nav.querySelector(".nav__menu");
  const onClick = (event) => {
    if (menu && menu.open && event.target.closest("a")) menu.open = false;
  };
  const onKey = (event) => {
    if (event.key === "Escape" && menu && menu.open) menu.open = false;
  };
  menu?.addEventListener("click", onClick);
  root.addEventListener("keydown", onKey);

  return () => {
    observer.disconnect();
    sentinel.remove();
    menu?.removeEventListener("click", onClick);
    root.removeEventListener("keydown", onKey);
  };
}
