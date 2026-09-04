#!/usr/bin/env node
/* Rabta — the site's product loops, from the rendered compositions.
 *
 *   node scripts/build-site-media.mjs
 *
 * Input   marketing-videos/site-demos/<name>/renders/<name>.mp4  (2560x1600, 30fps)
 * Output  site/public/assets/demos/<name>-desktop.mp4   1920x1200, for laptops and 2x phones
 *         site/public/assets/demos/<name>-mobile.mp4     720x450, for narrow viewports on a budget
 *         site/public/assets/demos/<name>.png            the poster, from a frame past the opening veil
 *         site/public/assets/demos/manifest.json         what shipped, probed, for scripts/verify-media.mjs
 *
 * The loops are silent by contract (autoplay would be blocked otherwise), so
 * every output drops audio. H.264 High profile with `+faststart`, so the
 * first frame paints before the file finishes downloading.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEMOS = join(ROOT, "marketing-videos/site-demos");
const OUT = join(ROOT, "site/public/assets/demos");

/** The loops the site plays, in the order they appear on the page. */
export const LOOPS = [
  "hero-return",
  "move-capture",
  "move-leave",
  "move-return",
  "cell-files",
  "cell-terminals",
  "cell-tabs",
  "cell-branch",
  "agents-connect",
  "capsule-anatomy",
];

const VARIANTS = {
  desktop: { width: 1920, height: 1200, crf: "21" },
  mobile: { width: 720, height: 450, crf: "24" },
};

/** The poster is taken after the opening veil has lifted. */
const POSTER_AT = 0.6;

function ffmpeg(args) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
}

function probe(file) {
  const out = execFileSync("ffprobe", [
    "-v", "error", "-print_format", "json", "-show_streams", "-show_format", file,
  ]).toString();
  return JSON.parse(out);
}

function pngSize(file) {
  const fd = execFileSync("head", ["-c", "24", file]);
  return { width: fd.readUInt32BE(16), height: fd.readUInt32BE(20) };
}

mkdirSync(OUT, { recursive: true });
// The previous loops are replaced wholesale; nothing else lives in this folder.
for (const f of readdirSync(OUT)) {
  if (/\.(m4v|mp4|png|json)$/.test(f)) rmSync(join(OUT, f));
}

const manifest = { schemaVersion: 2, videos: [], posters: [] };

for (const name of LOOPS) {
  const src = join(DEMOS, name, "renders", `${name}.mp4`);
  if (!existsSync(src)) {
    console.error(`missing render: ${src}\n  cd marketing-videos/site-demos/${name} && npx hyperframes render --quality high --output renders/${name}.mp4`);
    process.exit(1);
  }
  for (const [variant, v] of Object.entries(VARIANTS)) {
    const file = `${name}-${variant}.mp4`;
    ffmpeg([
      "-i", src, "-an",
      "-vf", `scale=${v.width}:${v.height}:flags=lanczos,format=yuv420p`,
      "-c:v", "libx264", "-profile:v", "high", "-preset", "slow", "-crf", v.crf,
      "-movflags", "+faststart", join(OUT, file),
    ]);
    const p = probe(join(OUT, file));
    const video = p.streams.find((s) => s.codec_type === "video");
    manifest.videos.push({
      file,
      demo: name,
      variant,
      durationSeconds: Number(Number(p.format.duration).toFixed(3)),
      width: video.width,
      height: video.height,
      bytes: statSync(join(OUT, file)).size,
      codec: video.codec_name,
      audioStreams: p.streams.filter((s) => s.codec_type === "audio").length,
      poster: `${name}.png`,
    });
    console.log(`  ${file.padEnd(28)} ${(statSync(join(OUT, file)).size / 1024).toFixed(0)} KB`);
  }
  const poster = join(OUT, `${name}.png`);
  ffmpeg(["-ss", String(POSTER_AT), "-i", src, "-frames:v", "1", "-vf", "scale=1920:1200:flags=lanczos", poster]);
  const size = pngSize(poster);
  manifest.posters.push({ file: `${name}.png`, ...size, bytes: statSync(poster).size });
}

writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`\n${manifest.videos.length} videos, ${manifest.posters.length} posters -> site/public/assets/demos/`);
