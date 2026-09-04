/* Rabta — independent boot paths for every enhancement on the site.
 *
 * Each module is opt-in by markup and fails on its own: a thrown error in one
 * leaves the others running and the page complete, because CSS already ships
 * the finished state of everything here.
 */

import { initMarks, initMarkReplays } from "./brand.js";
import { initHome } from "./home.js";
import { initProductMedia } from "./media.js";
import { initNav, initReveal } from "./motion.js";

/**
 * The checksum copy control on /setup/. It is `hidden` in the markup and
 * revealed here, so a scriptless page never shows a dead button.
 */
function initCopy() {
  document.querySelectorAll("[data-copy]").forEach((btn) => {
    const label = btn.querySelector("[data-copy-label]");
    const original = label ? label.textContent : "";
    const status = btn.parentElement
      ? btn.parentElement.querySelector("[data-copy-status]")
      : null;
    let revert = 0;

    btn.hidden = false;

    btn.addEventListener("click", async () => {
      const say = (text, spoken) => {
        if (label) label.textContent = text;
        if (status) status.textContent = spoken;
        window.clearTimeout(revert);
        revert = window.setTimeout(() => {
          if (label) label.textContent = original;
          if (status) status.textContent = "";
        }, 2000);
      };
      try {
        await navigator.clipboard.writeText(btn.dataset.copy || "");
        say("Copied", "Checksum copied to the clipboard");
      } catch {
        say("Select it", "Could not copy. Select the checksum and copy it yourself.");
      }
    });
  });
}

function safely(label, init) {
  try {
    init();
  } catch (error) {
    console.warn(`[rabta] ${label} failed:`, error);
  }
}

function boot() {
  safely("nav", initNav);
  safely("reveal", initReveal);
  safely("marks", initMarks);
  safely("mark replays", initMarkReplays);
  safely("copy", initCopy);
  safely("media", initProductMedia);
  safely("home", initHome);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
