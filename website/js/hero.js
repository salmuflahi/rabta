/* ==========================================================================
   Rabta — hero interaction

   The product's real behaviour, made visible. `activate_task` auto-saves the
   OUTGOING task's capsule before restoring the incoming one and returns it as
   `savedPrevious` — so context is caught on the way OUT, not merely handed
   back on the way in. That is the whole idea, and this is it choreographed.

   State machine (explicit, cancellable, no queued input):

     settled -> arming -> capturing -> gathering -> sealing
             -> transferring -> restoring -> stilling -> settled

   `arming` exists so a second press during a run is absorbed as an INTERRUPT
   rather than queued. `interrupted` unwinds to the settled pose WITHOUT
   replaying, so a mid-flight abort can never leave an object stranded.

   Every travelling object is measured from a real origin element inside the
   app frame and lands on a real destination row inside the capsule. Nothing
   moves from an invented coordinate; see data-origin / data-slot in the HTML.
   ========================================================================== */

import {
  createRunner,
  buildSequence,
  travelStep,
  returnStep,
  prefersReducedMotion,
  observeVisibility,
  onHidden,
  ignoreCancelled,
  EASE,
} from "./motion.js";

/* Deterministic representative data. Contents are what a capsule actually
   holds: file paths, a branch name, terminal name+cwd counts, tab URLs. */
const TASKS = {
  reconnect: {
    id: "reconnect",
    title: "Reconnect browser session",
    branch: "feat/reconnect",
    file: "src/hub.rs",
    files: 4,
    terminals: 3,
    tabs: 5,
    rows: [
      { kind: "vscode", detail: "src/hub.rs · 4 files · 3 terminals", status: "applied" },
      { kind: "chrome", detail: "5 tabs", status: "applied" },
      { kind: "git", detail: "feat/reconnect", status: "applied" },
    ],
  },
  timeout: {
    id: "timeout",
    title: "Fix restore timeout",
    branch: "fix/restore-timeout",
    file: "src/restore.rs",
    files: 6,
    terminals: 1,
    tabs: 3,
    rows: [
      { kind: "vscode", detail: "src/restore.rs · 6 files · 1 terminal", status: "applied" },
      { kind: "chrome", detail: "3 tabs", status: "applied" },
      { kind: "git", detail: "fix/restore-timeout", status: "applied" },
    ],
  },
};

/* Row status labels, verbatim from the app's statusLabel(). */
const STATUS_LABEL = {
  waiting: "Waiting",
  applied: "Restored",
  skipped: "Skipped",
  failed: "Couldn't restore",
};

const ORDER = ["settled", "arming", "capturing", "gathering", "sealing",
  "transferring", "restoring", "stilling"];

export function initHero(root) {
  if (!root) return;

  const el = {
    hero: root,
    frame: root.querySelector("[data-frame]"),
    copy: root.querySelector(".hero__copy"),
    capsule: root.querySelector("[data-capsule]"),
    capTitle: root.querySelector("[data-cap-title]"),
    /* NOT [data-cap-state] — that attribute also lives on the figure as a
       state flag, and the prefix would match both. Writing the label into the
       figure wipes the capsule's children. */
    capState: root.querySelector("[data-cap-badge]"),
    capSlots: {
      branch: root.querySelector('[data-slot="branch"] b'),
      editor: root.querySelector('[data-slot="editor"] b'),
      browser: root.querySelector('[data-slot="browser"] b'),
    },
    capSlotEls: {
      branch: root.querySelector('[data-slot="branch"]'),
      editor: root.querySelector('[data-slot="editor"]'),
      browser: root.querySelector('[data-slot="browser"]'),
    },
    appTitle: root.querySelector("[data-app-title]"),
    appBranch: root.querySelector("[data-app-branch]"),
    appHeading: root.querySelector("[data-app-heading]"),
    rows: Array.from(root.querySelectorAll("[data-row]")),
    ctx: {},
    switchBtn: root.querySelector("[data-switch]"),
    replayBtn: root.querySelector("[data-replay]"),
    live: root.querySelector("[data-live]"),
  };

  root.querySelectorAll("[data-ctx]").forEach((n) => {
    el.ctx[n.dataset.ctx] = n;
  });

  if (!el.capsule || !el.switchBtn) return;

  const runner = createRunner();
  let state = "settled";
  /* Active task inside the frame; the capsule always shows the OTHER one —
     whichever task you are not in is the one being kept. */
  let activeId = "reconnect";
  let introPlayed = false;

  const active = () => TASKS[activeId];
  const other = () => TASKS[activeId === "reconnect" ? "timeout" : "reconnect"];

  /* ---- painting ------------------------------------------------------- */

  function paintApp(task) {
    if (el.appTitle) el.appTitle.textContent = task.title;
    if (el.appBranch) el.appBranch.textContent = task.branch;
    task.rows.forEach((r, i) => {
      const row = el.rows[i];
      if (!row) return;
      const detail = row.querySelector("[data-detail]");
      const status = row.querySelector("[data-status]");
      if (detail) detail.textContent = r.detail;
      if (status) {
        status.dataset.status = r.status;
        status.textContent = STATUS_LABEL[r.status];
      }
    });
  }

  function paintRowStatus(i, status) {
    const row = el.rows[i];
    if (!row) return;
    const s = row.querySelector("[data-status]");
    if (!s) return;
    s.dataset.status = status;
    s.textContent = STATUS_LABEL[status];
  }

  function paintCapsule(task, stateLabel) {
    if (el.capTitle) el.capTitle.textContent = task.title;
    if (el.capState) el.capState.textContent = stateLabel;
    if (el.capSlots.branch) el.capSlots.branch.textContent = task.branch;
    if (el.capSlots.editor) {
      el.capSlots.editor.textContent =
        task.files + " files · " + task.terminals +
        (task.terminals === 1 ? " terminal" : " terminals");
    }
    if (el.capSlots.browser) el.capSlots.browser.textContent = task.tabs + " tabs";
  }

  function paintCtx(task) {
    if (el.ctx.branch) {
      const t = el.ctx.branch.querySelector("[data-text]");
      if (t) t.textContent = task.branch;
    }
    if (el.ctx.file) {
      const t = el.ctx.file.querySelector("[data-text]");
      if (t) t.textContent = task.file;
    }
    if (el.ctx.tabs) {
      const t = el.ctx.tabs.querySelector("[data-text]");
      if (t) t.textContent = task.tabs + " browser tabs";
    }
    if (el.ctx.terminals) {
      const t = el.ctx.terminals.querySelector("[data-text]");
      if (t) {
        t.textContent = task.terminals +
          (task.terminals === 1 ? " terminal" : " terminals");
      }
    }
  }

  function setSwitchLabel() {
    const t = el.switchBtn.querySelector("[data-switch-label]");
    if (t) t.textContent = "Switch to “" + other().title + "”";
    el.switchBtn.setAttribute(
      "aria-label",
      "Switch to task " + other().title + ". Saves the current task first."
    );
  }

  function say(msg) {
    if (el.live) el.live.textContent = msg;
  }

  function setState(next) {
    state = next;
    el.hero.dataset.heroState = next;
    /* The composition dissolves only while the transformation owns it. */
    const owning = ["capturing", "gathering", "sealing", "transferring", "restoring"];
    el.hero.classList.toggle("is-transforming", owning.includes(next));
  }

  function lock(on) {
    el.switchBtn.disabled = on;
    if (el.replayBtn) el.replayBtn.disabled = on;
  }

  /** Clear every inline transform a run may have left behind. */
  function resetCtx() {
    Object.values(el.ctx).forEach((n) => {
      n.style.transform = "";
      n.style.opacity = "";
      n.getAnimations().forEach((a) => a.cancel());
    });
  }

  const depthOf = (node) => Number(node.dataset.depth || 0);
  const originOf = (node) =>
    root.querySelector(node.dataset.origin) || el.frame;

  /* ---- the sequence --------------------------------------------------- */

  async function activate() {
    if (state !== "settled") {
      /* A press mid-run interrupts rather than queues. */
      interrupt();
      return;
    }
    const scope = runner.begin();
    const leaving = active();
    const arriving = other();
    const reduced = prefersReducedMotion();

    try {
      setState("arming");
      lock(true);

      /* 1 — acknowledgement. Rabta registers that you are leaving. */
      setState("capturing");
      paintCapsule(leaving, "Saving");
      el.capsule.dataset.capState = "saving";
      say("Saving " + leaving.title + ".");
      await scope.wait(reduced ? 0 : 200);
      if (scope.stale) return;

      /* 2 — gather. Each object leaves its REAL origin inside the frame and
         lands on its REAL destination row inside the capsule, in the product's
         own order: branch, editor, tabs, terminals. */
      setState("gathering");
      const gather = [];
      const plan = [
        ["branch", "branch"],
        ["file", "editor"],
        ["tabs", "browser"],
        ["terminals", "editor"],
      ];
      plan.forEach(([ctxKey, slot], i) => {
        const node = el.ctx[ctxKey];
        const dest = el.capSlotEls[slot];
        if (!node || !dest) return;
        gather.push(
          travelStep(node, dest, {
            label: "gather:" + ctxKey,
            verb: "gather",
            duration: 560,
            delay: i * 70,
            depth: depthOf(node),
          })
        );
      });
      if (gather.length) {
        await buildSequence(gather, reduced).play(scope);
      }
      if (scope.stale) return;

      /* 3 — seal. The fold closes on the real 45° hinge. */
      setState("sealing");
      el.capsule.dataset.capState = "saved";
      paintCapsule(leaving, "Saved");
      say(leaving.title + " saved.");
      await scope.wait(reduced ? 0 : 380);
      if (scope.stale) return;

      /* 4 — transfer. The incoming task takes the workspace. */
      setState("transferring");
      activeId = arriving.id;
      paintApp(arriving);
      paintCtx(arriving);
      setSwitchLabel();
      if (el.appHeading) el.appHeading.textContent = "Restoring workspace";
      el.rows.forEach((_, i) => paintRowStatus(i, "waiting"));
      resetCtx();
      await scope.wait(reduced ? 0 : 260);
      if (scope.stale) return;

      /* 5 — restore. Rows go Waiting -> final with the product's own 40ms
         reveal stagger. There is no per-row spinner in production, so there
         is none here. Objects emerge from the capsule and return to place. */
      setState("restoring");
      say("Restoring " + arriving.title + ".");
      const back = [];
      plan.forEach(([ctxKey, slot], i) => {
        const node = el.ctx[ctxKey];
        const src = el.capSlotEls[slot];
        if (!node || !src) return;
        back.push(
          returnStep(node, src, {
            label: "return:" + ctxKey,
            verb: "return",
            duration: 520,
            delay: i * 60,
            depth: depthOf(node),
          })
        );
      });
      const rowReveal = buildSequence(back, reduced);
      const reveal = (async () => {
        for (let i = 0; i < el.rows.length; i += 1) {
          if (scope.stale) return;
          paintRowStatus(i, arriving.rows[i].status);
          if (!reduced && i < el.rows.length - 1) await scope.wait(40);
        }
      })();
      await Promise.all([rowReveal.play(scope), reveal]);
      if (scope.stale) return;

      if (el.appHeading) el.appHeading.textContent = "Workspace restored";
      paintCapsule(leaving, "Saved");

      /* 6 — stillness. The composition settles back. */
      setState("stilling");
      say("You're back in " + arriving.title + ".");
      await scope.wait(reduced ? 0 : 220);
      if (scope.stale) return;

      resetCtx();
      setState("settled");
      lock(false);
    } catch (err) {
      ignoreCancelled(err);
    }
  }

  /** Unwind to a valid settled pose without replaying anything. */
  function interrupt() {
    runner.abort();
    resetCtx();
    paintApp(active());
    paintCtx(active());
    paintCapsule(other(), "Saved");
    el.capsule.dataset.capState = "saved";
    if (el.appHeading) el.appHeading.textContent = "Workspace restored";
    el.rows.forEach((_, i) => paintRowStatus(i, active().rows[i].status));
    setSwitchLabel();
    setState("settled");
    lock(false);
  }

  /* ---- wiring --------------------------------------------------------- */

  el.switchBtn.addEventListener("click", activate);
  if (el.replayBtn) el.replayBtn.addEventListener("click", activate);

  /* Abort in flight rather than letting a throttled tab stretch the
     choreography into nonsense. */
  onHidden(() => {
    if (state !== "settled") interrupt();
  });

  const stopObserving = observeVisibility(
    el.hero,
    (isIn) => {
      if (!isIn && state !== "settled") interrupt();
      /* One guided run, once, on arrival — never a loop, and never again
         without a deliberate press. */
      if (isIn && !introPlayed && !prefersReducedMotion()) {
        introPlayed = true;
        window.setTimeout(() => {
          if (state === "settled") activate();
        }, 1400);
      }
    },
    { threshold: 0.45 }
  );

  window.addEventListener("resize", () => {
    if (state !== "settled") interrupt();
  });

  /* Restrained pointer response: ±2.2°, pointer devices only, never under
     reduced motion, and it stops entirely while a transformation owns the
     composition. */
  const stage = root.querySelector("[data-stage]");
  if (stage && el.frame && !prefersReducedMotion() &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    stage.addEventListener("pointermove", (e) => {
      if (state !== "settled") return;
      const r = stage.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.frame.style.setProperty("--px", (x * 4.4).toFixed(2) + "deg");
      el.frame.style.setProperty("--py", (-y * 3).toFixed(2) + "deg");
    });
    stage.addEventListener("pointerleave", () => {
      el.frame.style.setProperty("--px", "0deg");
      el.frame.style.setProperty("--py", "0deg");
    });
  }

  /* Paint the settled truth, then hand over. */
  paintApp(active());
  paintCtx(active());
  paintCapsule(other(), "Saved");
  setSwitchLabel();
  setState("settled");

  return { destroy: () => { runner.destroy(); stopObserving(); } };
}
