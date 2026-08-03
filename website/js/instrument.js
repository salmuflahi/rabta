/* Rabta — the instrument's live behaviour.
 *
 * Three effects, all adapted rather than imported: the library they came from
 * ships Vue components and Tailwind, and this site serves every byte itself.
 * Each one is rebuilt flat, in the approved palette, and each reports
 * something true rather than decorating.
 *
 * Every one is safe by default: the markup and CSS are complete and correct
 * with no JavaScript at all, and this module only opts elements into being
 * animated. A failure here means "no animation", never "no content".
 */

const REDUCED = "(prefers-reduced-motion: reduce)";

/* ---------------------------------------------------------------------------
   Direction-aware cut
   The sweep used to always enter from the left. Now it enters from the edge
   the pointer actually crossed, so the gesture answers the cursor instead of
   ignoring it. Keyboard focus has no direction and keeps the default.
   ------------------------------------------------------------------------ */

export function initDirectionalCut(root = document) {
  const onEnter = (event) => {
    const el = event.target.closest?.(".sweep, .cut-link");
    if (!el || !root.contains(el)) return;
    const box = el.getBoundingClientRect();
    if (box.width === 0) return;
    /* On pointerenter the cursor sits on the edge it crossed. The whole
       offset is set rather than a sign, because calc() will not re-resolve a
       percentage multiplied by a substituted number. */
    const fromLeft = event.clientX - box.left < box.width / 2;
    el.style.setProperty("--cut-x", fromLeft ? "-130%" : "130%");
  };

  root.addEventListener("pointerover", onEnter);
  return () => root.removeEventListener("pointerover", onEnter);
}

/* ---------------------------------------------------------------------------
   Counting machine values
   The manifest numbers are the page's most machine-like register, and a
   readout that arrives at its value reads like an instrument settling. The
   markup already holds the final number, so a scriptless page shows it.
   ------------------------------------------------------------------------ */

function countTo(el, target, duration, env) {
  const start = env.performance?.now?.() ?? 0;
  const ease = (t) => 1 - (1 - t) ** 3;

  const step = (now) => {
    const elapsed = Math.max(0, now - start);
    const t = Math.min(1, elapsed / duration);
    el.textContent = String(Math.round(ease(t) * target));
    if (t < 1) env.requestAnimationFrame(step);
    else el.textContent = String(target);
  };

  el.textContent = "0";
  env.requestAnimationFrame(step);
}

export function initCounters(root = document, env = window) {
  const counters = [...root.querySelectorAll("[data-count]")];
  if (counters.length === 0) return () => {};

  /* Reduced motion keeps the number; only the counting goes. */
  if (env.matchMedia?.(REDUCED).matches) return () => {};
  if (typeof env.IntersectionObserver !== "function") return () => {};

  const observer = new env.IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        observer.unobserve(el);
        const target = Number.parseInt(el.textContent.trim(), 10);
        if (!Number.isFinite(target)) return;
        countTo(el, target, 620, env);
      });
    },
    { threshold: 0.9 },
  );

  counters.forEach((el) => observer.observe(el));
  return () => observer.disconnect();
}

/* ---------------------------------------------------------------------------
   The restore, resolving
   The honest-return caption lists what came back and what did not. Resolving
   those rows one after another is the product's own gesture — the page
   performing the thing the chapter describes — rather than an effect borrowed
   from somewhere else.
   ------------------------------------------------------------------------ */

export function initRestoreSequence(root = document, env = window) {
  const groups = [...root.querySelectorAll("[data-resolve]")];
  if (groups.length === 0) return () => {};
  if (env.matchMedia?.(REDUCED).matches) return () => {};
  if (typeof env.IntersectionObserver !== "function") return () => {};

  groups.forEach((group) => {
    group.dataset.resolve = "pending";
  });

  const observer = new env.IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.dataset.resolve = "shown";
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.4 },
  );

  groups.forEach((group) => observer.observe(group));

  /* Only rescue what is on screen and unreported. A blanket timer resolved
     everything the visitor had not scrolled to yet, so the sequence played to
     an empty room and they arrived to a finished caption. */
  const onScreen = (el) => {
    const box = el.getBoundingClientRect();
    return box.top < (env.innerHeight ?? 0) && box.bottom > 0;
  };

  const failsafe = env.setTimeout?.(() => {
    groups.forEach((group) => {
      if (group.dataset.resolve === "pending" && onScreen(group)) {
        group.dataset.resolve = "shown";
      }
    });
  }, 4000);

  return () => {
    observer.disconnect();
    env.clearTimeout?.(failsafe);
    groups.forEach((group) => {
      group.dataset.resolve = "shown";
    });
  };
}
