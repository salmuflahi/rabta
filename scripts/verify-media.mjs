#!/usr/bin/env node
/* Rabta — product media verification.
 *
 * The committed loops are the only thing on the site that a code review
 * cannot read. A wrong codec, a stray audio track, a re-encode at the wrong
 * size or a file that quietly doubled in weight all look identical in a diff,
 * so they are checked against site/public/assets/demos/manifest.json before the
 * site can deploy.
 *
 *   node scripts/verify-media.mjs
 *   FFPROBE_BIN=/opt/homebrew/bin/ffprobe node scripts/verify-media.mjs
 *
 * The comparison is a pure function of (manifest, probes, sizes) so it can be
 * exercised without ffprobe installed; only `main()` touches the filesystem.
 */

import { execFile } from "node:child_process";
import { access, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, "..");
export const DEMOS = resolve(ROOT, "site/public/assets/demos");

/* The design's own numbers, not the manifest's — the manifest is the thing
   being audited, so it cannot also be the standard it is audited against. */
export const TARGETS = {
  // The hero: capture, leave, return, in one take.
  "hero-return": { seconds: 8.5, tolerance: 0.3, desktopBytes: 2_800_000 },
  // The three moves, one beat each.
  "move-capture": { seconds: 4.0, tolerance: 0.3, desktopBytes: 1_600_000 },
  "move-leave": { seconds: 4.0, tolerance: 0.3, desktopBytes: 1_600_000 },
  "move-return": { seconds: 5.5, tolerance: 0.3, desktopBytes: 1_900_000 },
  // The bento's four loops, from stills under a camera.
  "cell-files": { seconds: 4.0, tolerance: 0.3, desktopBytes: 1_400_000 },
  "cell-terminals": { seconds: 4.0, tolerance: 0.3, desktopBytes: 1_400_000 },
  "cell-tabs": { seconds: 4.0, tolerance: 0.3, desktopBytes: 1_400_000 },
  "cell-branch": { seconds: 4.0, tolerance: 0.3, desktopBytes: 1_400_000 },
  // The two inner-page loops: an authored terminal and the capsule in planes.
  "agents-connect": { seconds: 5.0, tolerance: 0.3, desktopBytes: 1_400_000 },
  "capsule-anatomy": { seconds: 6.0, tolerance: 0.3, desktopBytes: 1_800_000 },
}

/** A mobile variant may not exceed this share of its desktop pair. */
export const MOBILE_SHARE = 0.75;

/**
 * Compare one manifest entry against what ffprobe actually found.
 *
 * @param {object} entry     manifest `videos[]` row
 * @param {object} probe     `{ streams: [...], format: {...} }` from ffprobe
 * @param {number} bytes     actual size on disk
 * @returns {string[]}       one line per violation, empty when the asset is good
 */
export function checkVideo(entry, probe, bytes) {
  const problems = [];
  const say = (message) => problems.push(`${entry.file}: ${message}`);

  const target = TARGETS[entry.demo];
  if (!target) {
    say(`unknown demo "${entry.demo}" — no duration or weight budget exists for it`);
    return problems;
  }

  if (!probe) {
    say("ffprobe returned nothing");
    return problems;
  }

  const streams = probe.streams ?? [];
  const video = streams.filter((s) => s.codec_type === "video");
  const audio = streams.filter((s) => s.codec_type === "audio");

  if (video.length !== 1) say(`expected 1 video stream, found ${video.length}`);
  /* The loops are silent by contract: an audio track would autoplay-block them
     in every browser and contradict the caption that says they are silent. */
  if (audio.length !== 0) say(`expected 0 audio streams, found ${audio.length}`);

  if (video[0] && video[0].codec_name !== "h264") {
    say(`expected codec h264, found ${video[0].codec_name}`);
  }
  if (video[0]) {
    if (video[0].width !== entry.width || video[0].height !== entry.height) {
      say(
        `expected ${entry.width}x${entry.height}, found ${video[0].width}x${video[0].height}`,
      );
    }
  }

  /* Two duration checks, because they catch different lies. The first says the
     manifest still describes the design; the second says the file still
     matches the manifest. */
  const declared = Number(entry.durationSeconds);
  if (!Number.isFinite(declared)) {
    say(`manifest duration is not a number: ${entry.durationSeconds}`);
  } else if (Math.abs(declared - target.seconds) > target.tolerance) {
    say(
      `manifest duration ${declared}s is outside ${target.seconds}s ±${target.tolerance}s`,
    );
  }

  const actual = Number(probe.format?.duration);
  if (!Number.isFinite(actual)) {
    say("ffprobe reported no duration");
  } else if (Math.abs(actual - target.seconds) > target.tolerance) {
    say(`duration ${actual.toFixed(3)}s is outside ${target.seconds}s ±${target.tolerance}s`);
  } else if (Number.isFinite(declared) && Math.abs(actual - declared) > 0.05) {
    say(`duration ${actual.toFixed(3)}s does not match the manifest's ${declared}s`);
  }

  if (bytes !== entry.bytes) {
    say(`is ${bytes} bytes, manifest says ${entry.bytes}`);
  }
  if (entry.variant === "desktop" && bytes > target.desktopBytes) {
    say(`is ${bytes} bytes, over the ${target.desktopBytes} budget`);
  }

  return problems;
}

/**
 * Whole-manifest audit.
 *
 * @param {object} manifest
 * @param {Map<string, object>} probes  file name → ffprobe json
 * @param {Map<string, number>} sizes   file name → bytes on disk
 * @returns {string[]}
 */
export function checkManifest(manifest, probes, sizes) {
  const problems = [];
  const videos = manifest.videos ?? [];

  for (const entry of videos) {
    const bytes = sizes.get(entry.file);
    if (bytes === undefined) {
      problems.push(`${entry.file}: missing from disk`);
      continue;
    }
    problems.push(...checkVideo(entry, probes.get(entry.file), bytes));
  }

  /* A mobile variant that is not meaningfully smaller than its desktop pair is
     a desktop file with a mobile name, and data-saver visitors pay for it. */
  for (const entry of videos.filter((v) => v.variant === "mobile")) {
    const pair = videos.find(
      (v) => v.demo === entry.demo && v.variant === "desktop",
    );
    if (!pair) {
      problems.push(`${entry.file}: has no desktop counterpart to be smaller than`);
      continue;
    }
    const mobileBytes = sizes.get(entry.file);
    const desktopBytes = sizes.get(pair.file);
    if (mobileBytes === undefined || desktopBytes === undefined) continue;
    const ceiling = desktopBytes * MOBILE_SHARE;
    if (mobileBytes > ceiling) {
      problems.push(
        `${entry.file}: ${mobileBytes} bytes is over ${MOBILE_SHARE * 100}% of ${pair.file} (${Math.round(ceiling)})`,
      );
    }
  }

  for (const poster of manifest.posters ?? []) {
    const bytes = sizes.get(poster.file);
    if (bytes === undefined) {
      problems.push(`${poster.file}: missing from disk`);
    } else if (bytes === 0) {
      problems.push(`${poster.file}: is empty`);
    }
  }

  /* Every video must name a poster that the manifest also describes, or a
     failed load would leave an empty black rectangle. */
  const posterNames = new Set((manifest.posters ?? []).map((p) => p.file));
  for (const entry of videos) {
    if (!posterNames.has(entry.poster)) {
      problems.push(`${entry.file}: names poster ${entry.poster}, which the manifest does not describe`);
    }
  }

  return problems;
}

async function findFfprobe() {
  const explicit = process.env.FFPROBE_BIN;
  if (explicit) {
    try {
      await access(explicit);
      return explicit;
    } catch {
      throw new Error(`FFPROBE_BIN is set to ${explicit}, which does not exist`);
    }
  }
  try {
    const { stdout } = await run("command", ["-v", "ffprobe"], { shell: "/bin/sh" });
    const found = stdout.trim();
    if (found) return found;
  } catch {
    /* fall through to the install hint */
  }
  throw new Error(
    "ffprobe was not found. Install it (macOS: `brew install ffmpeg`, Ubuntu: " +
      "`sudo apt-get install -y ffmpeg`) or set FFPROBE_BIN. Media verification " +
      "is never skipped silently — an unchecked video ships as easily as a checked one.",
  );
}

async function probeOne(ffprobe, file) {
  const { stdout } = await run(ffprobe, [
    "-v",
    "error",
    "-show_streams",
    "-show_format",
    "-of",
    "json",
    file,
  ]);
  return JSON.parse(stdout);
}

async function main() {
  const manifest = JSON.parse(
    await readFile(resolve(DEMOS, "manifest.json"), "utf8"),
  );

  const ffprobe = await findFfprobe();

  const sizes = new Map();
  const probes = new Map();
  const named = [
    ...(manifest.videos ?? []).map((v) => v.file),
    ...(manifest.posters ?? []).map((p) => p.file),
  ];

  for (const name of named) {
    try {
      sizes.set(name, (await stat(resolve(DEMOS, name))).size);
    } catch {
      /* left absent; checkManifest reports it */
    }
  }

  for (const entry of manifest.videos ?? []) {
    if (!sizes.has(entry.file)) continue;
    probes.set(entry.file, await probeOne(ffprobe, resolve(DEMOS, entry.file)));
  }

  const problems = checkManifest(manifest, probes, sizes);

  if (problems.length > 0) {
    for (const line of problems) console.error(`✗ ${line}`);
    console.error(`\n${problems.length} media problem(s).`);
    process.exit(1);
  }

  const count = (manifest.videos ?? []).length;
  const posters = (manifest.posters ?? []).length;
  console.log(`✓ ${count} videos and ${posters} posters match the manifest.`);
}

/* Only run when invoked directly, so the tests can import the pure checks. */
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(`✗ ${error.message}`);
    process.exit(1);
  });
}
