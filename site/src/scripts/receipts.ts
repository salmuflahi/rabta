/* Rabta: the receipt, tried.
 *
 * Three switches describe what is true on the Mac when a task is resumed:
 * Chrome is closed, a file has unsaved changes, the branch has uncommitted
 * work. The receipt re-reads itself for each case, in the words the app's
 * restore sheet actually uses: Restored, On next reload, Skipped. The site
 * ships the first case in the markup; this module only re-types it.
 */

import { gsap } from "gsap";
import { SplitText } from "gsap/SplitText";
import { reducedMotion, type MotionEnv, type Teardown } from "./motion.ts";

gsap.registerPlugin(SplitText);

export type Case = "chrome" | "dirty" | "branch";
export type Status = "ok" | "wait" | "skip";

export interface Row {
  status: Status;
  label: string;
  why: string;
}

export interface Receipt {
  title: string;
  sub: string;
  rows: Record<"git" | "vscode" | "chrome", Row>;
}

/** The app's vocabulary, from its restore sheet. */
const LABEL: Record<Status, string> = { ok: "Restored", wait: "On next reload", skip: "Skipped" };

/** What the sheet says for a given state of the Mac. Pure, and tested. */
export function receiptFor(state: Record<Case, boolean>): Receipt {
  const git: Row = state.branch
    ? { status: "skip", label: LABEL.skip, why: "uncommitted changes, never forced" }
    : { status: "ok", label: LABEL.ok, why: "feat/connector-reconnect" };
  const vscode: Row = state.dirty
    ? { status: "ok", label: LABEL.ok, why: "4 files, 1 kept open with unsaved changes" }
    : { status: "ok", label: LABEL.ok, why: "4 files, 3 terminals" };
  const chrome: Row = state.chrome
    ? { status: "wait", label: LABEL.wait, why: "Chrome is not running" }
    : { status: "ok", label: LABEL.ok, why: "5 tabs" };
  const rows = { git, vscode, chrome };
  const restored = Object.values(rows).filter((r) => r.status === "ok").length;
  return {
    title: restored === 3 ? "Workspace restored" : "Workspace partially restored",
    sub: `Restored ${restored} of 3.`,
    rows,
  };
}

export function initReceipts(root: ParentNode = document, env: MotionEnv = window as MotionEnv): Teardown {
  const demo = root.querySelector<HTMLElement>("[data-receipt-demo]");
  if (!demo) return () => {};
  const cases = [...demo.querySelectorAll<HTMLButtonElement>("[data-receipt-case]")];
  const title = demo.querySelector<HTMLElement>("[data-receipt-title]");
  const sub = demo.querySelector<HTMLElement>("[data-receipt-sub]");
  const rows = new Map(
    [...demo.querySelectorAll<HTMLElement>("[data-receipt-row]")].map((row) => [row.dataset.receiptRow!, row]),
  );
  const quiet = reducedMotion(env);
  const state: Record<Case, boolean> = { chrome: false, dirty: false, branch: false };
  cases.forEach((button) => {
    state[button.dataset.receiptCase as Case] = button.getAttribute("aria-checked") === "true";
  });

  const splits: SplitText[] = [];
  const retype = (el: HTMLElement, text: string) => {
    if (el.textContent === text) return;
    el.textContent = text;
    if (quiet) return;
    const split = SplitText.create(el, { type: "chars" });
    splits.push(split);
    gsap.fromTo(
      split.chars,
      { autoAlpha: 0, y: 5 },
      { autoAlpha: 1, y: 0, duration: 0.24, stagger: 0.03, ease: "power2.out", onComplete: () => split.revert() },
    );
  };

  const render = () => {
    const receipt = receiptFor(state);
    if (title) retype(title, receipt.title);
    if (sub) retype(sub, receipt.sub);
    for (const [key, row] of Object.entries(receipt.rows)) {
      const el = rows.get(key);
      if (!el) continue;
      el.dataset.receiptStatus = row.status;
      const label = el.querySelector<HTMLElement>("[data-receipt-label]");
      const why = el.querySelector<HTMLElement>("[data-receipt-why]");
      if (label) retype(label, row.label);
      if (why) retype(why, row.why);
    }
  };

  const onClick = (event: Event) => {
    const button = (event.currentTarget as HTMLButtonElement) ?? null;
    const key = button?.dataset.receiptCase as Case | undefined;
    if (!button || !key) return;
    state[key] = !state[key];
    button.setAttribute("aria-checked", String(state[key]));
    render();
  };
  cases.forEach((button) => button.addEventListener("click", onClick));

  return () => {
    cases.forEach((button) => button.removeEventListener("click", onClick));
    splits.forEach((split) => split.revert());
  };
}
