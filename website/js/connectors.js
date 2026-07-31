/* ==========================================================================
   Rabta — chapter 4, the connector assembly

   Tools reconnect around the task the visitor chose. One sequence, played
   once when the chapter comes into view, then complete stillness — no loop,
   no idle pulse, and no rAF at all.

   ORDER IS THE PRODUCT'S OWN. activate_task restores git FIRST, because
   switching a branch changes files on disk, and only then the workspace
   resources in resource order. So: branch, editor, browser.

   Status labels are the restore row's real ones — Waiting / Restoring… /
   Restored. The spec asked for "Connecting", but no such state exists: a
   connector's status on the wire is a boolean, and the three-beat the product
   actually shows belongs to the restore row.
   ========================================================================== */

import { createRunner, prefersReducedMotion, observeVisibility, ignoreCancelled } from "./motion.js";

const STATUS_LABEL = {
  waiting: "Waiting",
  restoring: "Restoring…",
  applied: "Restored",
};

/* Branch first — git leads, because it changes files on disk. */
const ORDER = ["branch", "editor", "browser"];

export function initConnectors(root) {
  if (!root) return;

  const panels = {};
  root.querySelectorAll("[data-conn-panel]").forEach((n) => {
    panels[n.dataset.connPanel] = n;
  });
  const live = root.querySelector("[data-conn-live]");
  if (!Object.keys(panels).length) return;

  const runner = createRunner();
  let played = false;

  function setStatus(key, status) {
    const panel = panels[key];
    if (!panel) return;
    const el = panel.querySelector("[data-conn-status]");
    if (!el) return;
    el.dataset.status = status;
    const label = el.querySelector("[data-conn-statustext]");
    if (label) label.textContent = STATUS_LABEL[status];
  }

  function settleAll() {
    ORDER.forEach((key) => {
      const p = panels[key];
      if (p) p.classList.remove("is-armed");
      setStatus(key, "applied");
    });
  }

  /** Take the composition to its pre-animation pose, synchronously. */
  function arm() {
    ORDER.forEach((key) => {
      const p = panels[key];
      if (p) p.classList.add("is-armed");
      setStatus(key, "waiting");
    });
    /* Flush the armed styles so the first un-arm actually transitions
       rather than collapsing into the same frame. */
    void root.offsetHeight;
  }

  async function play() {
    if (played) return;
    played = true;

    /* Reduced motion gets the finished composition immediately — the
       information is identical, only the travel is gone. */
    if (prefersReducedMotion()) {
      settleAll();
      return;
    }

    const scope = runner.begin();
    try {
      arm();

      /* Panels arrive first, staggered, still Waiting. */
      for (const key of ORDER) {
        if (scope.stale) return;
        const p = panels[key];
        if (p) p.classList.remove("is-armed");
        await scope.wait(110);
      }
      await scope.wait(260);
      if (scope.stale) return;

      /* Then each resolves in the product's own order and stops. */
      for (const key of ORDER) {
        if (scope.stale) return;
        setStatus(key, "restoring");
        await scope.wait(320);
        if (scope.stale) return;
        setStatus(key, "applied");
        await scope.wait(180);
      }

      if (live) live.textContent = "Editor, browser and branch reconnected.";
    } catch (err) {
      ignoreCancelled(err);
    }
  }

  /* Never mid-flight on a hidden tab: resolve rather than stall. */
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && played) {
      runner.abort();
      settleAll();
    }
  });

  const stop = observeVisibility(
    root,
    (isIn) => {
      if (!isIn) return;
      play();
      stop();
    },
    { threshold: 0.35 }
  );
}
