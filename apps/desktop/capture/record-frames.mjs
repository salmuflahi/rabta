#!/usr/bin/env node
// Frame-exact recording of a directed demo of the real app.
//
//   node capture/record-frames.mjs <demo> [outDir] [width] [height] [fps] [seconds] [dpr] [flags]
//
//   --region=app|sheet   what the frame shows: the whole app (default) or only
//                        the restore sheet, everything else invisible
//   --alpha              capture with a transparent page background, so the
//                        PNGs (and a webm) carry alpha where nothing painted
//   --out=mp4|webm|png   the encode: H.264 (default), VP9 yuva420p WebM
//                        (default with --alpha), or keep the PNG directory
//
// The capture rig must be serving on :5199 (pnpm exec vite --config
// capture/vite.config.ts --port 5199, or the "capture-rig" launch config).
// Headless Chrome opens `#demo=<name>`, waits for the director, then freezes
// virtual time and advances it in exact 1/fps steps, screenshotting each one,
// so every frame of the mark's draw, the sheet's spring and the rows' stagger
// is a real frame rather than whatever a real-time screencast managed to
// encode. No macOS screen-recording permission is needed: the pixels come
// from the renderer itself.
//
// Beside the footage it writes a cue sidecar, `<demo>.json` (`<demo>-sheet.json`
// for the sheet region): the director's cues with the Capture button's and the
// restore sheet's bounding boxes measured in the app's own CSS pixels at each
// cue, so the loops' cursor targets and sheet placement come from the DOM
// rather than from a ruler.
//
// The site's product loops (marketing-videos/site-demos) are built from
// these recordings; see build-projects.mjs there.
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, copyFileSync, cpSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const flags = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => {
    const [k, v] = a.slice(2).split("=");
    return [k, v ?? "true"];
  }),
);
const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const [demo, outArg, w = "1280", h = "800", fpsArg = "30", secondsArg, dprArg = "2"] = positional;
if (!demo) {
  console.error("usage: node capture/record-frames.mjs <demo> [outDir] [w] [h] [fps] [seconds] [dpr] [--region=app|sheet] [--alpha] [--out=mp4|webm|png]");
  process.exit(2);
}
const REGION = flags.region === "sheet" ? "sheet" : "app";
const ALPHA = flags.alpha === "true";
const OUT = flags.out ?? (ALPHA ? "webm" : "mp4");
if (!["mp4", "webm", "png"].includes(OUT)) throw new Error(`--out must be mp4, webm or png, not ${OUT}`);
if (OUT === "webm" && !ALPHA) console.warn("note: --out=webm without --alpha encodes an opaque VP9; the sheet loops expect --alpha");

const DEFAULT_SECONDS = { "hero-return": 8.5, "honest-return": 5.5, capture: 4, leave: 4, return: 5.5 };
const outDir = outArg ?? new URL("../../../marketing-videos/site-demos/_recordings", import.meta.url).pathname;
const W = Number(w), H = Number(h), FPS = Number(fpsArg), SECONDS = Number(secondsArg ?? DEFAULT_SECONDS[demo] ?? 8), DPR = Number(dprArg);
mkdirSync(outDir, { recursive: true });
const framesDir = mkdtempSync(join(tmpdir(), "rabta-det-"));
const stem = REGION === "sheet" ? `${demo}-sheet` : demo;

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9455;
const profile = mkdtempSync(join(tmpdir(), "rabta-detp-"));
const proc = spawn(CHROME, [
  "--headless=new", `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`,
  "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--force-color-profile=srgb",
  "--run-all-compositor-stages-before-draw", "--disable-new-content-rendering-timeout",
  "--disable-threaded-animation", "--disable-threaded-scrolling", "--disable-checker-imaging",
  "--disable-image-animation-resync", "--disable-features=PaintHolding",
  `--window-size=${W},${H}`, "about:blank",
], { stdio: "ignore" });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function wsUrl() {
  for (let i = 0; i < 60; i++) {
    await wait(250);
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const page = (await res.json()).find((t) => t.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
  }
  throw new Error("no devtools");
}

function cdp(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  const waiters = new Map();
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(typeof ev.data === "string" ? ev.data : ev.data.toString());
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method && waiters.has(m.method)) { const fns = waiters.get(m.method); waiters.delete(m.method); fns.forEach((f) => f(m.params)); }
  });
  const ready = new Promise((r) => ws.addEventListener("open", r));
  return {
    ready,
    once: (method) => new Promise((r) => waiters.set(method, [...(waiters.get(method) ?? []), r])),
    close: () => ws.close(),
    send: (method, params = {}) => new Promise((res, rej) => {
      const i = ++id;
      pending.set(i, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
      ws.send(JSON.stringify({ id: i, method, params }));
    }),
  };
}

const evalJs = (client, expression) =>
  client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }).then((r) => r.result?.value);

// The two things the loops aim at, measured in the app's CSS pixels. The
// button is matched by its visible label, the same way a person finds it;
// the sheet is the restore dialog. Either may be absent at a given cue.
const MEASURE = `(() => {
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: +r.left.toFixed(2), y: +r.top.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) };
  };
  const button = Array.from(document.querySelectorAll("button")).find((b) =>
    /^(Capture|Capturing…|Save State)$/.test((b.textContent || "").replace(/\\s+/g, " ").trim()));
  const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
  return { button: rect(button), dialog: rect(dialog) };
})()`;

try {
  const client = cdp(await wsUrl());
  await client.ready;
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DPR, mobile: false });
  if (ALPHA) {
    // Before navigation, so the very first paint already composites onto
    // nothing: with the rig's transparent-body CSS for the sheet region, a PNG
    // screenshot then carries real alpha outside the sheet.
    await client.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
  }

  const hash = `#demo=${demo}${REGION === "sheet" ? "&region=sheet" : ""}`;
  await client.send("Page.navigate", { url: `http://localhost:5199/${hash}` });
  // Let the app boot on real time: modules, fonts, the first paint.
  for (let i = 0; i < 100; i++) {
    if (await evalJs(client, "document.documentElement.dataset.demoReady === 'true'")) break;
    await wait(200);
  }
  await evalJs(client, "document.fonts.ready.then(() => true)");
  // A moment of real time so the shell has settled visually before time freezes.
  await wait(900);

  // The director's contract, as the page sees it, so the sidecar can never
  // disagree with what was actually recorded.
  const timeline = await evalJs(client, "JSON.stringify(window.__rabtaDemo || null)");
  const cues = timeline ? JSON.parse(timeline).cues.map((c) => ({ ...c, rect: null })) : [];

  // From here on, time only moves when we say so.
  await client.send("Emulation.setVirtualTimePolicy", { policy: "pause" });
  await evalJs(client, "document.dispatchEvent(new Event('rabta-demo-start')); true");

  const total = Math.round(SECONDS * FPS);
  const step = 1000 / FPS;
  let drawn = 0;
  let next = 0; // the next cue to measure
  for (let i = 0; i < total; i++) {
    const expired = client.once("Emulation.virtualTimeBudgetExpired");
    await client.send("Emulation.setVirtualTimePolicy", { policy: "advance", budget: step });
    await expired;
    // The first frame at or past a cue: the cue's timer has fired by now, so a
    // click cue measures the button the cursor must land on and a resume cue
    // sees the dialog the sheet layer will stand in for.
    while (next < cues.length && i * step >= cues[next].atMs) {
      cues[next].rect = await evalJs(client, `JSON.stringify(${MEASURE})`).then((s) => JSON.parse(s));
      cues[next].frame = i;
      next += 1;
    }
    // The screenshot itself forces a composite at the new virtual time.
    const frame = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    writeFileSync(join(framesDir, `f${String(i).padStart(5, "0")}.png`), Buffer.from(frame.data, "base64"));
    drawn += 1;
  }
  const last = JSON.parse(await evalJs(client, `JSON.stringify(${MEASURE})`));
  client.close();

  const sidecar = {
    demo, region: REGION, alpha: ALPHA, fps: FPS, w: W, h: H, dpr: DPR, seconds: SECONDS,
    durationMs: timeline ? JSON.parse(timeline).durationMs : null,
    cues,
    // The sheet's box on the last frame: where the restore dialog rests once
    // it has landed, or null when this demo never opens it.
    sheet: last.dialog,
    button: last.button,
  };
  writeFileSync(join(outDir, `${stem}.json`), JSON.stringify(sidecar, null, 2) + "\n");

  const pattern = join(framesDir, "f%05d.png");
  let out;
  if (OUT === "mp4") {
    out = join(outDir, `${stem}-${W}x${H}.mp4`);
    execFileSync("ffmpeg", [
      "-y", "-loglevel", "error", "-framerate", String(FPS), "-i", pattern,
      "-vf", "format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-movflags", "+faststart", "-an", out,
    ], { stdio: "inherit" });
  } else if (OUT === "webm") {
    out = join(outDir, `${stem}-${W}x${H}.webm`);
    execFileSync("ffmpeg", [
      "-y", "-loglevel", "error", "-framerate", String(FPS), "-i", pattern,
      "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-b:v", "0", "-crf", "20",
      "-deadline", "good", "-cpu-used", "2", "-row-mt", "1", "-an", out,
    ], { stdio: "inherit" });
  } else {
    out = join(outDir, `${stem}-${W}x${H}`);
    rmSync(out, { recursive: true, force: true });
    cpSync(framesDir, out, { recursive: true });
  }
  copyFileSync(join(framesDir, `f${String(total - 1).padStart(5, "0")}.png`), join(outDir, `${stem}-last.png`));
  copyFileSync(join(framesDir, "f00000.png"), join(outDir, `${stem}-first.png`));
  console.log(`${out}  frames=${total} drawn=${drawn}  ${SECONDS}s @ ${FPS}fps, ${W * DPR}x${H * DPR}  region=${REGION} alpha=${ALPHA} cues=${cues.length}`);
} finally {
  proc.kill();
  await wait(800);
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 }); } catch {}
  try { rmSync(framesDir, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 }); } catch {}
}
