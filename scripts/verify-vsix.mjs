#!/usr/bin/env node
/**
 * Check that a built .vsix contains what its package.json promises.
 *
 *   ./scripts/verify-vsix.mjs dist-artifacts/rabta-vscode-0.1.1.vsix
 *
 * Written after 0.1.0 shipped to Open VSX with no icon. package.json declared
 * `"icon": "icon.png"` and the archive simply did not contain the file — the
 * icon was added two days after that vsix was cut, and nothing re-checked. The
 * listing has shown a blank placeholder ever since, which is invisible from
 * inside the repo, where the file is right there.
 *
 * Same failure as popup.css missing from the Chrome zip: a declared asset that
 * no build step reads, so nothing fails until a stranger installs it.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const vsix = process.argv[2];
if (!vsix) {
  console.error("usage: verify-vsix.mjs <path to .vsix>");
  process.exit(1);
}

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const pkg = JSON.parse(readFileSync(`${ROOT}/connectors/vscode/package.json`, "utf8"));
const listing = execFileSync("unzip", ["-Z1", vsix], { encoding: "utf8" }).split("\n");
const has = (p) => listing.includes(`extension/${p}`);

/* Everything package.json points at by path. `main` is the one a build would
   have caught on its own; the rest are the quiet ones. */
const required = [
  ["main", pkg.main?.replace(/^\.\//, "")],
  ["icon", pkg.icon],
].filter(([, p]) => p);

const missing = required.filter(([, p]) => !has(p));

for (const [field, p] of required) {
  console.log(`  ${missing.some(([, m]) => m === p) ? "MISSING" : "ok     "}  ${field}: ${p}`);
}

if (missing.length) {
  console.error(
    `\n!! ${vsix} is missing ${missing.length} declared file(s). ` +
      `Check connectors/vscode/.vscodeignore and that the file exists on disk.`,
  );
  process.exit(1);
}
console.log(`  ${listing.filter(Boolean).length} entries, all declared files present`);
