/* ==========================================================================
   Rabta — boot

   Guard-first and wrapped: the baseline HTML is already the complete, settled,
   readable composition, so a module failure must never be able to hide it.
   ========================================================================== */

import { initHero } from "./hero.js";
import { observeVisibility } from "./motion.js";

/** The nav separates itself only once content has passed behind it. */
function initNav() {
  const nav = document.querySelector("[data-nav]");
  if (!nav) return;
  const sentinel = document.createElement("div");
  sentinel.setAttribute("aria-hidden", "true");
  sentinel.style.cssText = "position:absolute;top:0;height:1px;width:1px";
  document.body.prepend(sentinel);
  observeVisibility(sentinel, (isIn) => nav.classList.toggle("is-stuck", !isIn));
}

function safely(name, fn) {
  try {
    fn();
  } catch (err) {
    if (window.console && console.warn) {
      console.warn("[rabta] " + name + " failed:", err);
    }
  }
}

function boot() {
  document.documentElement.classList.add("js");
  safely("nav", initNav);
  safely("hero", () => initHero(document.querySelector("[data-hero]")));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
