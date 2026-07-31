/* ==========================================================================
   Rabta — chapter 3, the playable demo

   The same product contract as the hero, driven by the visitor at their own
   pace on a full product surface: activate_task auto-saves the OUTGOING task
   before restoring the selected one.

   States:
     ready -> saving -> saved -> restoring -> ready

   The visitor selects a task; the one they are leaving is saved first and
   keeps its fold; the selected one restores row by row. Selecting the first
   task again runs the same sequence in reverse, which is the proof that the
   previous task came back intact.

   Row statuses use the product's real labels and its real reveal behaviour:
   every row goes Waiting -> final with a 40ms stagger. There is no per-row
   spinner in the shipped app, so there is none here.
   ========================================================================== */

import { createRunner, prefersReducedMotion, ignoreCancelled } from "./motion.js";

const TASKS = {
  reconnect: {
    id: "reconnect",
    title: "Reconnect browser session",
    project: "rabta",
    branch: "feat/reconnect",
    file: "src/hub.rs",
    rows: [
      { name: "VS Code", detail: "src/hub.rs · 4 files · 3 terminals" },
      { name: "Chrome", detail: "5 tabs" },
      { name: "Git", detail: "feat/reconnect" },
    ],
  },
  timeout: {
    id: "timeout",
    title: "Fix restore timeout",
    project: "rabta",
    branch: "fix/restore-timeout",
    file: "src/restore.rs",
    rows: [
      { name: "VS Code", detail: "src/restore.rs · 6 files · 2 terminals" },
      { name: "Chrome", detail: "3 tabs" },
      { name: "Git", detail: "fix/restore-timeout" },
    ],
  },
};

/* Verbatim from the app's statusLabel(). */
const STATUS_LABEL = {
  waiting: "Waiting",
  applied: "Restored",
  skipped: "Skipped",
  failed: "Couldn't restore",
};

/* Short, integrated, and only at the moment each becomes true. */
const SAY = {
  idle: {
    tone: "ready",
    status: "Workspace ready",
    text: "Pick the task you are not in. Rabta saves the one you are leaving before it restores the one you chose.",
  },
  saving: {
    tone: "saving",
    status: "Saving outgoing task…",
    text: "The task you are leaving is captured first — files, tabs and branch.",
  },
  saved: {
    tone: "saved",
    status: "Context saved",
    text: "That context is kept. It is still there when you come back to it.",
  },
  restoring: {
    tone: "restoring",
    status: "Restoring selected task…",
    text: "Git goes first, because switching a branch changes files on disk.",
  },
  ready: {
    tone: "ready",
    status: "Workspace ready",
    text: "You're back. Every tool returned to where this task left it.",
  },
};

export function initDemo(root) {
  if (!root) return;

  const el = {
    tasks: Array.from(root.querySelectorAll("[data-demo-task]")),
    rows: Array.from(root.querySelectorAll("[data-demo-row]")),
    title: root.querySelector("[data-demo-title]"),
    branch: root.querySelector("[data-demo-branch]"),
    project: root.querySelector("[data-demo-project]"),
    status: root.querySelector("[data-demo-status]"),
    statusText: root.querySelector("[data-demo-statustext]"),
    rail: root.querySelector("[data-demo-rail]"),
    say: root.querySelector("[data-demo-say]"),
    now: root.querySelector("[data-demo-now]"),
    before: root.querySelector("[data-demo-before]"),
    reset: root.querySelector("[data-demo-reset]"),
    live: root.querySelector("[data-demo-live]"),
  };

  if (!el.tasks.length || !el.rows.length) return;

  const runner = createRunner();
  let activeId = "reconnect";
  let state = "ready";
  let touched = false;

  const active = () => TASKS[activeId];
  const other = () => TASKS[activeId === "reconnect" ? "timeout" : "reconnect"];

  /* ---- painting ------------------------------------------------------- */

  function paintTasks() {
    el.tasks.forEach((btn) => {
      const isActive = btn.dataset.demoTask === activeId;
      btn.setAttribute("aria-current", isActive ? "true" : "false");
      btn.dataset.state = isActive ? "active" : "saved";
      const s = btn.querySelector("[data-demo-taskstate]");
      if (s) s.textContent = isActive ? "Active" : "Saved";
    });
  }

  function paintDetail(task) {
    if (el.title) el.title.textContent = task.title;
    if (el.branch) el.branch.textContent = task.branch;
    if (el.project) el.project.textContent = task.project;
    task.rows.forEach((r, i) => {
      const row = el.rows[i];
      if (!row) return;
      const name = row.querySelector("[data-demo-name]");
      const detail = row.querySelector("[data-demo-detail]");
      if (name) name.textContent = r.name;
      if (detail) detail.textContent = r.detail;
    });
  }

  function paintRow(i, status) {
    const row = el.rows[i];
    if (!row) return;
    const s = row.querySelector("[data-demo-status-cell]");
    if (!s) return;
    s.dataset.status = status;
    s.textContent = STATUS_LABEL[status];
  }

  function paintHistory() {
    if (el.now) el.now.textContent = active().title;
    if (el.before) el.before.textContent = other().title;
  }

  function speak(key) {
    const c = SAY[key];
    if (!c) return;
    if (el.status) el.status.dataset.tone = c.tone;
    if (el.statusText) el.statusText.textContent = c.status;
    if (el.say) el.say.textContent = c.text;
  }

  function setRail(on) {
    if (el.rail) el.rail.classList.toggle("is-on", !!on);
  }

  function lock(on) {
    el.tasks.forEach((b) => {
      b.disabled = on;
    });
    if (el.reset) el.reset.disabled = on;
  }

  function announce(msg) {
    if (el.live) el.live.textContent = msg;
  }

  /* ---- the sequence --------------------------------------------------- */

  async function select(nextId) {
    if (nextId === activeId) return;
    if (state !== "ready") {
      /* A press mid-run resolves the current one rather than queueing. */
      finish();
      return;
    }
    const scope = runner.begin();
    const reduced = prefersReducedMotion();
    const leaving = active();
    const arriving = TASKS[nextId];
    touched = true;

    try {
      lock(true);

      /* 1 — the outgoing task is captured FIRST. */
      state = "saving";
      speak("saving");
      setRail(true);
      announce("Saving " + leaving.title + ".");
      await scope.wait(reduced ? 0 : 520);
      if (scope.stale) return;

      /* 2 — it is kept, and keeps its fold. */
      state = "saved";
      speak("saved");
      announce(leaving.title + " saved.");
      await scope.wait(reduced ? 0 : 420);
      if (scope.stale) return;

      /* 3 — the selected task takes the workspace. */
      state = "restoring";
      activeId = arriving.id;
      paintTasks();
      paintDetail(arriving);
      paintHistory();
      el.rows.forEach((_, i) => paintRow(i, "waiting"));
      speak("restoring");
      announce("Restoring " + arriving.title + ".");
      await scope.wait(reduced ? 0 : 380);
      if (scope.stale) return;

      /* 4 — rows resolve one at a time, Waiting straight to final. */
      for (let i = 0; i < el.rows.length; i += 1) {
        if (scope.stale) return;
        paintRow(i, "applied");
        if (!reduced && i < el.rows.length - 1) await scope.wait(40);
      }
      await scope.wait(reduced ? 0 : 260);
      if (scope.stale) return;

      /* 5 — stillness. */
      setRail(false);
      state = "ready";
      speak("ready");
      announce("You're back in " + arriving.title + ".");
      lock(false);
      if (el.reset) el.reset.hidden = false;
    } catch (err) {
      ignoreCancelled(err);
    }
  }

  /** Resolve immediately to a valid ready state, without replaying. */
  function finish() {
    runner.abort();
    paintTasks();
    paintDetail(active());
    paintHistory();
    el.rows.forEach((_, i) => paintRow(i, "applied"));
    setRail(false);
    state = "ready";
    speak("ready");
    lock(false);
  }

  function reset() {
    runner.abort();
    activeId = "reconnect";
    touched = false;
    paintTasks();
    paintDetail(active());
    paintHistory();
    el.rows.forEach((_, i) => paintRow(i, "applied"));
    setRail(false);
    state = "ready";
    speak("idle");
    announce("Demo reset.");
    if (el.reset) el.reset.hidden = true;
  }

  /* ---- wiring --------------------------------------------------------- */

  el.tasks.forEach((btn) => {
    btn.addEventListener("click", () => select(btn.dataset.demoTask));
  });

  if (el.reset) {
    el.reset.hidden = true;
    el.reset.addEventListener("click", reset);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && state !== "ready") finish();
  });

  paintTasks();
  paintDetail(active());
  paintHistory();
  speak("idle");
}
