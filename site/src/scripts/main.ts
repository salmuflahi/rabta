/* Rabta: independent boot paths for every enhancement on the site.
 *
 * Each module is opt-in by markup and fails on its own: a thrown error in one
 * leaves the others running and the page complete, because CSS already ships
 * the finished state of everything here. Pages are separate documents (the
 * transitions between them are the browser's own), so this runs once per
 * page and tears down on pagehide for the back-forward cache.
 */

import { initAgents } from "./agents.ts";
import { initMarks, initMarkReplays } from "./brand.ts";
import { initCopy } from "./copy.ts";
import { initHome } from "./home.ts";
import { initMagnetic } from "./magnetic.ts";
import { initProductMedia } from "./media.ts";
import { initNav, initReveal } from "./motion.ts";
import { initReceipts } from "./receipts.ts";
import { initThread } from "./thread.ts";

type Teardown = () => void;
const teardowns: Teardown[] = [];

function safely(label: string, init: () => Teardown | void): void {
  try {
    const off = init();
    if (typeof off === "function") teardowns.push(off);
  } catch (error) {
    console.warn(`[rabta] ${label} failed:`, error);
  }
}

function boot(): void {
  safely("nav", () => initNav());
  safely("reveal", () => initReveal());
  safely("marks", () => initMarks());
  safely("mark replays", () => initMarkReplays());
  safely("copy", () => initCopy());
  safely("media", () => initProductMedia());
  safely("home", () => initHome());
  safely("thread", () => initThread());
  safely("receipts", () => initReceipts());
  safely("agents", () => initAgents());
  safely("magnetic", () => initMagnetic());
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
addEventListener("pagehide", () => teardowns.splice(0).forEach((off) => off()), { once: true });
