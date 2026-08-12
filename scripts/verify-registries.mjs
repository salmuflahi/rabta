#!/usr/bin/env node
/**
 * Does the site describe the extensions as they are actually published?
 *
 * WHY THIS EXISTS: `rabta-connect.rabta-vscode` went live on the Visual Studio
 * Marketplace on 28 July. Four pages went on saying it was "not published yet"
 * for a fortnight, and a test in tests/site/ actively *required* one of them to
 * keep saying so — it pinned a fact nobody re-checked, so it preserved the fact
 * after it stopped being true.
 *
 * No test in tests/site/ can catch that class: they read files on disk, and the
 * truth lives on two registries. This does the only thing that would have
 * worked — asks the registries.
 *
 * It is deliberately NOT part of `pnpm test:site`. It needs the
 * network, so in CI it would be a flake generator, and a guard that fails for
 * reasons unrelated to the change is a guard people learn to ignore. Run it
 * before a release, or any time the distribution story changes:
 *
 *     node scripts/verify-registries.mjs
 *
 * Exit code 1 means the site and a registry disagree about something a reader
 * would act on.
 */

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NAMESPACE = "rabta-connect";
const EXTENSION = "rabta-vscode";

const problems = [];
const notes = [];

/** Fetch with a timeout, so a hanging registry fails loudly rather than never. */
async function get(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---- Open VSX --------------------------------------------------------------

async function openVsx() {
  const res = await get(`https://open-vsx.org/api/${NAMESPACE}/${EXTENSION}`);
  if (!res.ok) {
    problems.push(`Open VSX: ${EXTENSION} returned ${res.status}`);
    return null;
  }
  const data = await res.json();

  const ns = await get(`https://open-vsx.org/api/${NAMESPACE}`);
  const namespace = ns.ok ? await ns.json() : {};

  notes.push(
    `Open VSX      ${data.version}  (${data.downloadCount ?? 0} downloads, ` +
      `namespace ${namespace.verified ? "verified" : "UNVERIFIED"})`,
  );

  // An unverified namespace is not a defect — the extension installs fine — but
  // the listing carries no publisher badge, and the site says so on /roadmap/.
  // If that ever flips, the roadmap entry becomes the stale claim.
  if (!namespace.verified) {
    const roadmap = await readFile(resolve(ROOT, "website/roadmap/index.html"), "utf8");
    if (!/unverified namespace on Open VSX/i.test(roadmap)) {
      problems.push(
        "Open VSX namespace is unverified but /roadmap/ no longer says so",
      );
    }
  }

  return data.version;
}

// ---- Visual Studio Marketplace ---------------------------------------------

async function marketplace() {
  const res = await get(
    "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery",
    {
      method: "POST",
      headers: {
        Accept: "application/json;api-version=3.0-preview.1",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filters: [
          { criteria: [{ filterType: 7, value: `${NAMESPACE}.${EXTENSION}` }] },
        ],
        flags: 914,
      }),
    },
  );
  if (!res.ok) {
    problems.push(`Marketplace: query returned ${res.status}`);
    return null;
  }
  const found = (await res.json()).results?.[0]?.extensions ?? [];
  if (found.length === 0) {
    problems.push(`Marketplace: ${NAMESPACE}.${EXTENSION} is not listed`);
    return null;
  }
  const ext = found[0];
  const version = ext.versions?.[0]?.version;
  notes.push(
    `Marketplace   ${version}  (publisher ${ext.publisher?.flags ?? "?"})`,
  );
  return version;
}

// ---- the site --------------------------------------------------------------

async function site(published) {
  const setup = await readFile(resolve(ROOT, "website/setup/index.html"), "utf8");

  // The page may be in either of two states, and both are legitimate:
  //
  //   unified — both registries serve the same version, and the prose names it
  //             once: "rabta-connect.rabta-vscode, version X".
  //   split   — they disagree, which happens for as long as it takes the second
  //             upload to land, and the prose names both explicitly.
  //
  // A checker that only understood the unified case would flag the split as an
  // error and push toward hiding it, which is the opposite of what the page
  // should do.
  const unified = setup.match(/rabta-vscode<\/code>, version ([\d.]+)\)/)?.[1];
  const splitOpenVsx = setup.match(/Open VSX serves\s*<strong>([\d.]+)<\/strong>/)?.[1];
  const splitMarket = setup.match(
    /Marketplace still serves\s*<strong>([\d.]+)<\/strong>/,
  )?.[1];

  if (unified) {
    notes.push(`/setup/ says   ${unified} (both registries)`);
    for (const [registry, version] of Object.entries(published)) {
      if (version && version !== unified) {
        problems.push(
          `/setup/ says version ${unified}, but ${registry} serves ${version}`,
        );
      }
    }
    // If the registries have since diverged, the unified sentence is no longer
    // true no matter which number it names.
    const distinct = new Set(Object.values(published).filter(Boolean));
    if (distinct.size > 1) {
      problems.push(
        `/setup/ names one version but the registries serve ${[...distinct].join(" and ")}`,
      );
    }
  } else if (splitOpenVsx || splitMarket) {
    notes.push(`/setup/ says   Open VSX ${splitOpenVsx}, Marketplace ${splitMarket}`);
    if (splitOpenVsx && splitOpenVsx !== published["Open VSX"]) {
      problems.push(
        `/setup/ says Open VSX serves ${splitOpenVsx}, but it serves ${published["Open VSX"]}`,
      );
    }
    if (splitMarket && splitMarket !== published.Marketplace) {
      problems.push(
        `/setup/ says the Marketplace serves ${splitMarket}, but it serves ${published.Marketplace}`,
      );
    }
    // Once they agree again, the split note is stale and should come out.
    if (published["Open VSX"] && published["Open VSX"] === published.Marketplace) {
      problems.push(
        "the registries agree again — /setup/ still carries the split note",
      );
    }
  } else {
    problems.push("/setup/: states no extension version at all");
  }

  // The pinned .vsix follows Open VSX, which is where that file is served from.
  for (const [, pinned] of setup.matchAll(
    /open-vsx\.org\/api\/rabta-connect\/rabta-vscode\/([\d.]+)\//g,
  )) {
    if (published["Open VSX"] && pinned !== published["Open VSX"]) {
      problems.push(
        `/setup/ pins .vsix ${pinned}, but Open VSX serves ${published["Open VSX"]}`,
      );
    }
  }

  // The repo's own version, so "packaged but unpublished" is visible rather
  // than something you discover from dist-artifacts/ months later.
  const pkg = JSON.parse(
    await readFile(resolve(ROOT, "connectors/vscode/package.json"), "utf8"),
  );
  const chrome = JSON.parse(
    await readFile(resolve(ROOT, "connectors/chrome/manifest.json"), "utf8"),
  );
  notes.push(`repo vscode    ${pkg.version}`);
  notes.push(`repo chrome    ${chrome.version}`);

  for (const [registry, version] of Object.entries(published)) {
    if (version && version !== pkg.version) {
      notes.push(
        `  \u2192 ${registry} is behind the repo (${version} vs ${pkg.version}) — packaged, not published`,
      );
    }
  }
}

// ---- run -------------------------------------------------------------------

const published = {
  "Open VSX": await openVsx(),
  Marketplace: await marketplace(),
};
await site(published);

for (const note of notes) console.log(note);

if (problems.length > 0) {
  console.error("\nThe site and the registries disagree:");
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  process.exit(1);
}
console.log("\n✓ the site describes the extensions as they are published.");
