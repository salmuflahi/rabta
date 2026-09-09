#!/usr/bin/env node
/**
 * Generate every Rabta brand raster from the vector sources.
 *
 *     node scripts/generate-brand-assets.mjs
 *
 * Source of truth
 * ---------------
 * `site/public/assets/brand/wordmark.svg`   the approved outlined "Rabta"
 *                                           wordmark, one path, currentColor.
 *                                           The same path lives in
 *                                           apps/desktop/src/components/brand/ApprovedWordmark.tsx.
 *
 * Everything else is derived from that one path on each run: the ink and
 * paper colourways, the ember tile (Dock icon, favicon, avatar), the
 * maskable PWA icon, every favicon/app/connector raster, the .icns and .ico
 * containers, and the social card. There is no fallback artwork: a missing
 * source stops the script instead of drawing something else.
 *
 * Requirements
 * ------------
 * Node 20+ and a Chrome-family browser for rasterising. The browser is found
 * from `RABTA_CHROME`, a Playwright browsers directory
 * (`PLAYWRIGHT_BROWSERS_PATH`, default ~/.cache/ms-playwright or
 * /opt/pw-browsers), the usual macOS application paths, or PATH. `.icns` and
 * `.ico` are packed here without platform tools, so the script runs the same
 * on macOS, Linux and CI.
 *
 * Outputs are listed on stdout. Re-running is idempotent.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BRAND = join(ROOT, "site/public/assets/brand");
const WEB = join(ROOT, "site/public");
const TAURI = join(ROOT, "apps/desktop/src-tauri/icons");
const APP_BRAND = join(ROOT, "apps/desktop/src/assets/brand");
const CHROME_EXT = join(ROOT, "connectors/chrome/icons");
const VSCODE = join(ROOT, "connectors/vscode");
const HANDOFF = join(ROOT, "handoff/claude-design/brand");

const WORDMARK_SOURCE = join(BRAND, "wordmark.svg");
const OG_CARD_HTML = join(BRAND, "og-card.html");
const OG_CARD_PNG = join(BRAND, "og-cover.png");
const OG_SIZE = [1200, 630];

// The brand's colours, as the spec names them. The only literals here.
const EMBER = "#FF6B2C";
const INK = "#0A0B0E";
const PAPER = "#F5F5F7";

const WORDMARK_VIEWBOX = [961, 293];
const SQUIRCLE = "M50 0C87 0 100 13 100 50S87 100 50 100 0 87 0 50 13 0 50 0Z";

const written = [];
function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}
function note(path) {
  written.push(path);
  console.log(`  ${path.slice(ROOT.length + 1)}`);
}

// --------------------------------------------------------------- sources

function readWordmark() {
  if (!existsSync(WORDMARK_SOURCE)) fail(`missing brand source: ${WORDMARK_SOURCE.slice(ROOT.length + 1)}`);
  const svg = readFileSync(WORDMARK_SOURCE, "utf8");
  const paths = [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map((m) => m[1]);
  if (paths.length !== 1) fail(`expected the wordmark's single outline path in wordmark.svg, found ${paths.length}`);
  const viewBox = svg.match(/\bviewBox="([^"]+)"/);
  if (!viewBox || viewBox[1] !== `0 0 ${WORDMARK_VIEWBOX.join(" ")}`) fail("wordmark.svg must keep the 0 0 961 293 viewBox");
  return paths[0];
}
const WORDMARK = readWordmark();

/** The wordmark alone, in one colour. `fill` may be currentColor. */
function svgWordmark(fill) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WORDMARK_VIEWBOX.join(" ")}" fill="${fill}"><path fill="${fill}" fill-rule="evenodd" d="${WORDMARK}"/></svg>\n`;
}
/** The wordmark placed inside a 100-unit square at `width` units wide. */
function placedWordmark(fill, width) {
  const scale = width / WORDMARK_VIEWBOX[0];
  const height = WORDMARK_VIEWBOX[1] * scale;
  const x = (100 - width) / 2;
  const y = (100 - height) / 2;
  return `<g transform="translate(${x.toFixed(3)} ${y.toFixed(3)}) scale(${scale.toFixed(6)})"><path fill="${fill}" fill-rule="evenodd" d="${WORDMARK}"/></g>`;
}
/** The tile: the ink wordmark on an ember squircle. Dock icon, favicon, avatar. */
function svgTile() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="${EMBER}" d="${SQUIRCLE}"/>${placedWordmark(INK, 80)}</svg>\n`;
}
/** Full-bleed ember square with the wordmark inside the platform safe zone,
 * so a circular or squircle mask never clips it. */
function svgMaskable() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${EMBER}"/>${placedWordmark(INK, 66)}</svg>\n`;
}

// ------------------------------------------------------------ rasterising

function findChrome() {
  const candidates = [];
  if (process.env.RABTA_CHROME) candidates.push(process.env.RABTA_CHROME);
  const playwright = [process.env.PLAYWRIGHT_BROWSERS_PATH, join(process.env.HOME || "", ".cache/ms-playwright"), "/opt/pw-browsers"].filter(Boolean);
  for (const base of playwright) {
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base).sort().reverse()) {
      if (entry.startsWith("chromium_headless_shell-")) candidates.push(join(base, entry, "chrome-linux/headless_shell"), join(base, entry, "chrome-mac/headless_shell"), join(base, entry, "chrome-mac-arm64/headless_shell"));
      if (entry.startsWith("chromium-")) candidates.push(join(base, entry, "chrome-linux/chrome"), join(base, entry, "chrome-mac/Chromium.app/Contents/MacOS/Chromium"), join(base, entry, "chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium"));
    }
  }
  candidates.push(
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  );
  for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  for (const name of ["google-chrome", "chromium", "chromium-browser", "chrome"]) {
    try {
      const found = execFileSync("which", [name], { encoding: "utf8" }).trim();
      if (found) return found;
    } catch {
      /* not on PATH */
    }
  }
  return null;
}
const CHROME = findChrome();
if (!CHROME) fail("no Chrome-family browser found. Set RABTA_CHROME to a Chrome/Chromium executable.");

/** Screenshot `url` at `width`x`height` CSS pixels into `out`, transparent
 * where the page paints nothing. Chrome exits on its own after --screenshot;
 * the deadline only guards against a hung renderer. */
function screenshot(url, width, height, out, { scale = 1, profile } = {}) {
  mkdirSync(dirname(out), { recursive: true });
  const args = [
    "--headless",
    "--disable-gpu",
    "--no-sandbox",
    "--hide-scrollbars",
    "--force-color-profile=srgb",
    "--no-first-run",
    "--no-default-browser-check",
    "--default-background-color=00000000",
    `--user-data-dir=${profile}`,
    `--force-device-scale-factor=${scale}`,
    `--window-size=${width},${height}`,
    "--virtual-time-budget=4000",
    `--screenshot=${out}`,
    url,
  ];
  return new Promise((done, reject) => {
    const child = spawn(CHROME, args, { stdio: "ignore" });
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`render timed out: ${out}`)); }, 90_000);
    child.on("exit", () => {
      clearTimeout(timer);
      if (!existsSync(out) || statSync(out).size === 0) reject(new Error(`render produced no output: ${out}`));
      else done(out);
    });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
  });
}
async function rasterise(svgText, size, out, tmp) {
  const page = join(tmp, `svg-${size}-${Math.random().toString(36).slice(2)}.html`);
  writeFileSync(page, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent;width:${size}px;height:${size}px;overflow:hidden}svg{display:block;width:${size}px;height:${size}px}</style></head><body>${svgText}</body></html>`);
  await screenshot(pathToFileURL(page).href, size, size, out, { profile: join(tmp, "profile") });
  return out;
}

function pngSize(data) {
  if (data.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
}

/** Pack PNGs into an .ico. Windows Vista onward reads PNG-compressed entries
 * directly, so no BMP re-encoding is needed. */
function writeIco(pngs, out) {
  const entries = pngs.map((path) => { const data = readFileSync(path); const [w, h] = pngSize(data); return { w: w >= 256 ? 0 : w, h: h >= 256 ? 0 : h, data }; });
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(entries.length, 4);
  let offset = 6 + 16 * entries.length;
  const directory = [], images = [];
  for (const entry of entries) {
    const row = Buffer.alloc(16);
    row.writeUInt8(entry.w, 0); row.writeUInt8(entry.h, 1); row.writeUInt8(0, 2); row.writeUInt8(0, 3);
    row.writeUInt16LE(1, 4); row.writeUInt16LE(32, 6); row.writeUInt32LE(entry.data.length, 8); row.writeUInt32LE(offset, 12);
    directory.push(row); images.push(entry.data); offset += entry.data.length;
  }
  writeFileSync(out, Buffer.concat([header, ...directory, ...images]));
}

/** Pack PNGs into a macOS .icns. Every modern type holds PNG data directly;
 * Finder, the Dock and Tauri read these without iconutil. */
const ICNS_TYPES = { 16: "icp4", 32: "icp5", 64: "icp6", 128: "ic07", 256: "ic08", 512: "ic09", 1024: "ic10" };
const ICNS_RETINA = { 32: "ic11", 64: "ic12", 256: "ic13", 512: "ic14" };
function writeIcns(pngsBySize, out) {
  const chunks = [];
  const push = (type, data) => { const head = Buffer.alloc(8); head.write(type, 0, "ascii"); head.writeUInt32BE(8 + data.length, 4); chunks.push(head, data); };
  for (const [size, type] of Object.entries(ICNS_TYPES)) if (pngsBySize[size]) push(type, readFileSync(pngsBySize[size]));
  for (const [size, type] of Object.entries(ICNS_RETINA)) if (pngsBySize[size]) push(type, readFileSync(pngsBySize[size]));
  const body = Buffer.concat(chunks);
  const head = Buffer.alloc(8); head.write("icns", 0, "ascii"); head.writeUInt32BE(8 + body.length, 4);
  writeFileSync(out, Buffer.concat([head, body]));
}

/** Render the 1200x630 social card from its HTML source at 2x, then let the
 * browser downsample it, so text and the wordmark stay crisp. */
async function renderOgCard(tmp) {
  if (!existsSync(OG_CARD_HTML)) fail(`missing social card source: ${OG_CARD_HTML.slice(ROOT.length + 1)}`);
  const raw = join(tmp, "og-2x.png");
  await screenshot(pathToFileURL(OG_CARD_HTML).href, OG_SIZE[0], OG_SIZE[1], raw, { scale: 2, profile: join(tmp, "profile") });
  const page = join(tmp, "og-1x.html");
  writeFileSync(page, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;width:${OG_SIZE[0]}px;height:${OG_SIZE[1]}px;overflow:hidden;background:${INK}}img{display:block;width:${OG_SIZE[0]}px;height:${OG_SIZE[1]}px;image-rendering:high-quality}</style></head><body><img src="${pathToFileURL(raw).href}"></body></html>`);
  await screenshot(pathToFileURL(page).href, OG_SIZE[0], OG_SIZE[1], OG_CARD_PNG, { profile: join(tmp, "profile") });
  note(OG_CARD_PNG);
}

// ------------------------------------------------------------------ main

async function main() {
  console.log(`source    ${WORDMARK_SOURCE.slice(ROOT.length + 1)}`);
  console.log(`browser   ${CHROME}`);
  console.log("writing:");
  const tmp = mkdtempSync(join(tmpdir(), "rabta-brand-"));
  try {
    const TILE = svgTile();
    // --- vector colourways, re-emitted from the canonical geometry -------
    for (const [path, text] of [
      [join(BRAND, "wordmark-ink.svg"), svgWordmark(INK)],
      [join(BRAND, "wordmark-paper.svg"), svgWordmark(PAPER)],
      [join(BRAND, "favicon.svg"), TILE],
      [join(APP_BRAND, "wordmark.svg"), svgWordmark("currentColor")],
      [join(APP_BRAND, "app-icon.svg"), TILE],
      [join(HANDOFF, "wordmark.svg"), svgWordmark("currentColor")],
      [join(HANDOFF, "wordmark-ink.svg"), svgWordmark(INK)],
      [join(HANDOFF, "wordmark-paper.svg"), svgWordmark(PAPER)],
      [join(HANDOFF, "favicon.svg"), TILE],
    ]) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
      note(path);
    }
    // --- website favicons and app icons ----------------------------------
    for (const size of [16, 32]) note(await rasterise(TILE, size, join(BRAND, `favicon-${size}.png`), tmp));
    note(await rasterise(TILE, 180, join(BRAND, "apple-touch-icon.png"), tmp));
    note(await rasterise(TILE, 192, join(BRAND, "icon-192.png"), tmp));
    note(await rasterise(TILE, 512, join(BRAND, "icon-512.png"), tmp));
    note(await rasterise(svgMaskable(), 512, join(BRAND, "icon-512-maskable.png"), tmp));
    const icoSources = [];
    for (const size of [16, 32, 48]) icoSources.push(await rasterise(TILE, size, join(tmp, `ico-${size}.png`), tmp));
    writeIco(icoSources, join(WEB, "favicon.ico"));
    note(join(WEB, "favicon.ico"));
    // --- Tauri bundle ----------------------------------------------------
    note(await rasterise(TILE, 32, join(TAURI, "32x32.png"), tmp));
    note(await rasterise(TILE, 64, join(TAURI, "64x64.png"), tmp));
    note(await rasterise(TILE, 128, join(TAURI, "128x128.png"), tmp));
    note(await rasterise(TILE, 256, join(TAURI, "128x128@2x.png"), tmp));
    note(await rasterise(TILE, 512, join(TAURI, "icon.png"), tmp));
    writeIco([...icoSources, await rasterise(TILE, 256, join(tmp, "ico-256.png"), tmp)], join(TAURI, "icon.ico"));
    note(join(TAURI, "icon.ico"));
    const icns = {};
    for (const size of [16, 32, 64, 128, 256, 512, 1024]) icns[size] = await rasterise(TILE, size, join(tmp, `icns-${size}.png`), tmp);
    writeIcns(icns, join(TAURI, "icon.icns"));
    note(join(TAURI, "icon.icns"));
    // --- connectors ------------------------------------------------------
    for (const size of [16, 32, 48, 128]) note(await rasterise(TILE, size, join(CHROME_EXT, `icon${size}.png`), tmp));
    note(await rasterise(TILE, 128, join(VSCODE, "icon.png"), tmp));
    // --- social card -----------------------------------------------------
    await renderOgCard(tmp);
    writeFileSync(join(HANDOFF, "og-cover.png"), readFileSync(OG_CARD_PNG));
    note(join(HANDOFF, "og-cover.png"));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`\n${written.length} assets written.`);
}

main().catch((error) => fail(error.message));
