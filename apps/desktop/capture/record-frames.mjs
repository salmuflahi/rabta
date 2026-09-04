#!/usr/bin/env node
// Frame-exact recording of a directed demo of the real app.
//
//   node capture/record-frames.mjs <demo> [outDir] [width] [height] [fps] [seconds] [dpr]
//
// The capture rig must be serving on :5199 (pnpm exec vite --config
// capture/vite.config.ts --port 5199, or the "capture-rig" launch config).
// Headless Chrome opens `#demo=<name>`, waits for the director, then freezes
// virtual time and advances it in exact 1/fps steps, screenshotting each one,
// so every frame of the mark's draw, the sheet's spring and the rows' stagger
// is a real frame rather than whatever a real-time screencast managed to
// encode. The frames become a constant-rate H.264 in <outDir>, plus the
// first and last frames as PNGs. No macOS screen-recording permission is
// needed: the pixels come from the renderer itself.
//
// The site's product loops (marketing-videos/site-demos) are built from
// these recordings; see build-projects.mjs there.
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const [demo, outArg, w = "1280", h = "800", fpsArg = "30", secondsArg, dprArg = "2"] = process.argv.slice(2);
const DEFAULT_SECONDS = { "hero-return": 8.5, "honest-return": 5.5, capture: 4, leave: 4, return: 5.5 };
const outDir = outArg ?? new URL("../../../marketing-videos/site-demos/_recordings", import.meta.url).pathname;
const W = Number(w), H = Number(h), FPS = Number(fpsArg), SECONDS = Number(secondsArg ?? DEFAULT_SECONDS[demo] ?? 8), DPR = Number(dprArg);
mkdirSync(outDir, { recursive: true });
const framesDir = mkdtempSync(join(tmpdir(), "rabta-det-"));

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

try {
  const client = cdp(await wsUrl());
  await client.ready;
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DPR, mobile: false });

  await client.send("Page.navigate", { url: `http://localhost:5199/#demo=${demo}` });
  // Let the app boot on real time: modules, fonts, the first paint.
  for (let i = 0; i < 100; i++) {
    if (await evalJs(client, "document.documentElement.dataset.demoReady === 'true'")) break;
    await wait(200);
  }
  await evalJs(client, "document.fonts.ready.then(() => true)");
  // A moment of real time so the shell has settled visually before time freezes.
  await wait(900);

  // From here on, time only moves when we say so.
  await client.send("Emulation.setVirtualTimePolicy", { policy: "pause" });
  await evalJs(client, "document.dispatchEvent(new Event('rabta-demo-start')); true");

  const total = Math.round(SECONDS * FPS);
  const step = 1000 / FPS;
  let last = null;
  let drawn = 0;
  for (let i = 0; i < total; i++) {
    const expired = client.once("Emulation.virtualTimeBudgetExpired");
    await client.send("Emulation.setVirtualTimePolicy", { policy: "advance", budget: step });
    await expired;
    // The screenshot itself forces a composite at the new virtual time.
    const frame = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const file = join(framesDir, `f${String(i).padStart(5, "0")}.png`);
    writeFileSync(file, Buffer.from(frame.data, "base64"));
    last = file;
    drawn += 1;
  }
  client.close();

  const out = join(outDir, `${demo}-${W}x${H}.mp4`);
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(framesDir, "f%05d.png"),
    "-vf", "format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-movflags", "+faststart", "-an", out,
  ], { stdio: "inherit" });
  copyFileSync(join(framesDir, `f${String(total - 1).padStart(5, "0")}.png`), join(outDir, `${demo}-last.png`));
  copyFileSync(join(framesDir, "f00000.png"), join(outDir, `${demo}-first.png`));
  console.log(`${out}  frames=${total} drawn=${drawn}  ${SECONDS}s @ ${FPS}fps, ${W * DPR}x${H * DPR}`);
} finally {
  proc.kill();
  await wait(800);
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 }); } catch {}
  try { rmSync(framesDir, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 }); } catch {}
}
