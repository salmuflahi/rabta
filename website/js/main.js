/* ==========================================================================
   Rabta — boot

   This is the ENTIRE runtime for the homepage: one copy-to-clipboard control.

   Everything else on the page is HTML and CSS. The screens switcher in §8.10
   is three radio inputs and a `:checked ~` selector, so it works with
   scripting disabled and moves under the arrow keys natively. There is no
   scroll listener, no IntersectionObserver, no rAF and no animation code —
   see docs/site-design-plan.md §4.6.
   ========================================================================== */

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

function boot() {
  try {
    initCopy();
  } catch (err) {
    if (window.console && console.warn) console.warn("[rabta] copy failed:", err);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
