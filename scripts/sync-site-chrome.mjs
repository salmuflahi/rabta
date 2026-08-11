#!/usr/bin/env node
// Writes the canonical nav and footer into every site page.
//
// The site has no build step and eight pages now share chrome. Hand-maintaining
// eight copies is how a stale link survives on one page for a month, so the
// copies are generated instead: `website/_chrome/*.html` is the source, and this
// script stamps it between marker comments in each page.
//
// The pages stay plain static HTML — this runs at authoring time, not at serve
// time. `--check` verifies every page is already in sync and exits non-zero
// otherwise, which is what CI runs.
//
// Per-page state that can't be shared lives in `data-nav` on the page's <body>:
// the matching nav link gets `aria-current="page"`. That is the only difference
// permitted between two pages' chrome.

import { readFileSync, writeFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(ROOT, "website");

const NAV = readFileSync(join(SITE, "_chrome/nav.html"), "utf8").trimEnd();
const FOOT = readFileSync(join(SITE, "_chrome/foot.html"), "utf8").trimEnd();

const BLOCKS = [
  { name: "nav", body: NAV },
  { name: "foot", body: FOOT },
];

/** Every .html under website/, minus the chrome fragments themselves and the
 * capture/OG scratch pages, which are not real site pages. */
function pages(dir = SITE) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "_chrome" || entry === "assets" || entry === "node_modules") continue;
      out.push(...pages(full));
    } else if (entry.endsWith(".html") && !entry.startsWith("__")) {
      out.push(full);
    }
  }
  return out;
}

/** Replace the content between `<!-- chrome:NAME -->` and `<!-- /chrome:NAME -->`.
 * Returns null when the page carries no such marker, so a page can opt out
 * (404.html has no nav by design). */
function stamp(html, name, body) {
  const open = `<!-- chrome:${name} -->`;
  const close = `<!-- /chrome:${name} -->`;
  const a = html.indexOf(open);
  const b = html.indexOf(close);
  if (a === -1 || b === -1) return null;
  if (b < a) throw new Error(`chrome:${name} markers are inverted`);
  return html.slice(0, a + open.length) + "\n" + body + "\n" + html.slice(b);
}

/** Mark the nav link matching this page's `data-nav`. Applied after stamping,
 * so the canonical fragment stays free of per-page state. */
function markCurrent(html) {
  const m = html.match(/<body[^>]*\sdata-nav="([a-z-]+)"/);
  if (!m) return html;
  return html.replace(
    new RegExp(`(<a href="[^"]*" data-nav="${m[1]}")`),
    `$1 aria-current="page"`,
  );
}

const check = process.argv.includes("--check");
const stale = [];

for (const file of pages()) {
  const before = readFileSync(file, "utf8");
  let after = before;
  let touched = false;

  for (const { name, body } of BLOCKS) {
    const next = stamp(after, name, body);
    if (next !== null) {
      after = next;
      touched = true;
    }
  }
  if (!touched) continue;

  after = markCurrent(after);
  if (after === before) continue;

  stale.push(relative(ROOT, file));
  if (!check) writeFileSync(file, after);
}

if (check) {
  if (stale.length) {
    console.error(`Site chrome is stale in ${stale.length} file(s):`);
    for (const f of stale) console.error(`  ${f}`);
    console.error("\nRun: node scripts/sync-site-chrome.mjs");
    process.exit(1);
  }
  console.log("Site chrome is in sync.");
} else {
  console.log(stale.length ? `Updated ${stale.length} file(s).` : "Already in sync.");
}
