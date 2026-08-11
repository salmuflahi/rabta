/* Rabta — independent boot paths for enhancement-only homepage controls. */

import { initProductMedia } from "./media.js";
import { initReceiptFolds } from "./receipt-fold.js";
import { initChapterMarks } from "./reveal.js";
import { initFocusSwitch } from "./home.js";
import { initCounters, initDirectionalCut, initRestoreSequence } from "./instrument.js";

/**
 * The checksum copy control. It is `hidden` in the markup and revealed here,
 * so a scriptless page never shows a dead button. The hex itself is
 * `user-select: all`, so selecting it by hand is one click either way.
 */
function initCopy() {
  document.querySelectorAll("[data-copy]").forEach((btn) => {
    const label = btn.querySelector("[data-copy-label]");
    const original = label ? label.textContent : "";
    /* The button's accessible name is a fixed aria-label, which wins over its
       contents — so the outcome is announced through a sibling status region
       rather than by mutating a name nobody would hear change. */
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
        /* Denied, insecure context, or no API. Say so rather than lying with
           a success state. */
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
  safely("copy", initCopy);
  safely("media", initProductMedia);
  safely("receipt", initReceiptFolds);
  safely("chapter marks", initChapterMarks);
  safely("focus switch", initFocusSwitch);
  safely("directional cut", initDirectionalCut);
  safely("counters", initCounters);
  safely("restore sequence", initRestoreSequence);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
