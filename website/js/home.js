/* Rabta — the focus-mode switch.
 *
 * The only stateful control on the homepage, and the only thing here that
 * genuinely needs script. Everything else the design expressed as component
 * state is CSS: the three-move rows expand on `:hover`, the marquee is one
 * keyframe, the contribution graph is 140 spans written into the markup.
 *
 * The page ships with focus mode ON — `aria-checked="true"` and the receipt
 * already showing what it put away — so a visitor with no JavaScript sees the
 * state that makes the section worth reading, rather than an inert toggle
 * beside an empty result. This module only makes it switchable.
 */

/** What the receipt says in each state. Off is not "zero everything": with
 *  focus mode off, restoring is purely additive, so the same twelve things
 *  come back and nothing is put away or kept — which is exactly the point the
 *  section is making. */
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
    foot: "Restoring is additive with focus mode off — it opens things and closes nothing.",
  },
};

/** Count from one number to another over `ms`, easing out.
 *
 *  The design animates each digit column independently, sliding changed
 *  columns in the direction of travel. That is a lot of DOM for a number that
 *  moves between 0 and 12, and it reads as the same thing: a value that
 *  travelled rather than cut. This counts, and respects reduced motion by
 *  landing immediately. */
function countTo(el, from, to, reduced) {
  if (reduced || from === to) {
    el.textContent = String(to);
    return;
  }
  const start = performance.now();
  const ms = 420;
  const step = (now) => {
    const t = Math.min(1, (now - start) / ms);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = String(Math.round(from + (to - from) * eased));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function initFocusSwitch(root = document) {
  const toggle = root.querySelector("[data-focus-toggle]");
  if (!toggle) return () => {};

  const labels = [...root.querySelectorAll("[data-focus-label]")];
  const tallies = new Map(
    [...root.querySelectorAll("[data-tally]")].map((el) => [el.dataset.tally, el]),
  );
  const head = root.querySelector("[data-away-head]");
  const list = root.querySelector("[data-away-list]");
  const foot = root.querySelector("[data-away-foot]");

  const reduced =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
          const li = document.createElement("li");
          const num = document.createElement("span");
          num.className = "away__n";
          num.textContent = n;
          const reason = document.createElement("span");
          reason.className = "away__why";
          reason.textContent = why;
          li.append(num, ` ${text} — `, reason);
          return li;
        }),
      );
    }
  };

  const onClick = () => apply(toggle.getAttribute("aria-checked") !== "true");
  toggle.addEventListener("click", onClick);

  return () => toggle.removeEventListener("click", onClick);
}
