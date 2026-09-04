#!/usr/bin/env node
/**
 * Render the Mac App Store screenshots into docs/app-store/screenshots/.
 *
 *   ./scripts/make-appstore-shots.mjs
 *   CHROME=/path/to/chrome ./scripts/make-appstore-shots.mjs
 *
 * Six listing images at 2560x1600 — one of the four sizes App Store Connect
 * accepts for Mac (1280x800, 1440x900, 2560x1600, 2880x1800; all 16:10).
 * Composed the same way as the Chrome Web Store set (make-store-shots.mjs):
 * a caption band over the real product UI, so the two listings read as one
 * product. The app images are the capture rig's own 2560x1600 PNGs in
 * website/assets/shots/src/, so they change when the site's do and never
 * show a build that did not ship.
 *
 * Output is committed (like the shot sources are) so a listing can be filled
 * in from a checkout without Chrome; rerun after `node capture/capture.mjs`.
 *
 * Copy holds to claims already made on rabta.build and in
 * docs/store-listings.md. Every screen is the real app on the frozen demo
 * fixture (apps/desktop/capture/README.md); none is a mock-up.
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { tmpdir, homedir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const OUT = join(ROOT, "docs", "app-store", "screenshots");
const BUILD = join(ROOT, "dist-artifacts", "app-store-screenshots", ".build");
const PORT = 8772;

/* Source shots are 2560x1600 = 1280 CSS px wide, shown 1168 wide. */
const SCALE = 1168 / 1280;

/* ---- the listing, in order ------------------------------------------------ */
const FRAMES = [
  {
    name: "1-overview",
    eyebrow: "Rabta",
    h1: "Your dev tools, saved as tasks.",
    sub: "Editor files, terminals, git branch and browser tabs, captured together and brought back when you switch.",
    shot: "overview",
    alt: "Rabta's Overview: projects, connected apps and open tasks",
  },
  {
    name: "2-capsules",
    eyebrow: "Capsules",
    h1: "Save it. Leave. Come back.",
    sub: "Every task holds a capsule of what was open. Switching tasks saves the one you leave and restores the one you pick.",
    shot: "capsules",
    alt: "Rabta's task list, each task showing the files, tabs and branch it holds",
  },
  {
    name: "3-restore",
    eyebrow: "Honest restore",
    h1: "What came back, and what is waiting.",
    sub: "A restore reports itself: the editor and branch land at once, and tabs that need a reload say so instead of pretending.",
    shot: "restore",
    alt: "Rabta's restore sheet reporting a partially restored workspace",
  },
  {
    name: "4-projects",
    eyebrow: "Safe git",
    h1: "Switch branches without losing work.",
    sub: "Fetch, check out and create branches from the project row. Rabta never forces, resets or stashes; a dirty tree is refused, not overwritten.",
    shot: "projects",
    alt: "Rabta's Projects screen with git status and branch controls per project",
  },
  {
    name: "5-connectors",
    eyebrow: "Pairing",
    h1: "You approve every connection.",
    sub: "Editors connect through a local secret; a browser asks first, and captures nothing until you save.",
    shot: "connectors",
    alt: "Rabta's Connectors screen asking to approve a Chrome connection",
  },
  {
    name: "6-activity",
    eyebrow: "Local-first",
    h1: "Everything flows through one local hub.",
    sub: "Apps talk to Rabta on 127.0.0.1 and to nothing else. No cloud, no account, no telemetry: the activity log is the whole story.",
    shot: "activity",
    alt: "Rabta's Activity log of connector events on the local hub",
  },
];

const page = (body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Rabta</title>
<link rel="stylesheet" href="/scripts/store-shots/frame.css" />
<link rel="stylesheet" href="/scripts/store-shots/appstore.css" />
</head>
<body>
${body}
</body>
</html>
`;

function frameHtml(f) {
  const src = join(ROOT, "website/assets/shots/src", `${f.shot}.png`);
  if (!existsSync(src)) {
    throw new Error(`missing ${src} — run \`node capture/capture.mjs\` in apps/desktop first`);
  }
  const art =
    `<div class="crop">` +
    `<img style="--shift: ${-Math.round((f.srcY ?? 0) * SCALE)}px" ` +
    `src="/website/assets/shots/src/${f.shot}.png" alt="${f.alt}" /></div>`;

  return page(`<div class="stack">
  <div class="head">
    <div>
      <p class="eyebrow">${f.eyebrow}</p>
      <h1>${f.h1}</h1>
    </div>
    <p class="sub">${f.sub}</p>
  </div>
  <div class="shotwrap">${art}</div>
</div>`);
}

/* ---- a static server over the repo, so every path above is the real file --- */

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

function serve() {
  return new Promise((ready) => {
    const server = createServer((req, res) => {
      const rel = normalize(decodeURIComponent(req.url.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
      const file = join(ROOT, rel);
      if (!file.startsWith(ROOT) || !existsSync(file)) {
        res.writeHead(404).end("not found");
        return;
      }
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
      res.end(readFileSync(file));
    });
    server.listen(PORT, "127.0.0.1", () => ready(server));
  });
}

function chromeBinary() {
  if (process.env.CHROME) {
    if (!existsSync(process.env.CHROME)) throw new Error(`CHROME=${process.env.CHROME} does not exist`);
    return process.env.CHROME;
  }
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];
  // Playwright's browsers, wherever it keeps them on this machine.
  for (const base of [process.env.PLAYWRIGHT_BROWSERS_PATH, join(homedir(), "Library/Caches/ms-playwright"), join(homedir(), ".cache/ms-playwright")]) {
    if (!base || !existsSync(base)) continue;
    for (const dir of readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()) {
      candidates.push(
        join(base, dir, "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"),
        join(base, dir, "chrome-mac/Chromium.app/Contents/MacOS/Chromium"),
        join(base, dir, "chrome-linux/chrome"),
      );
    }
  }
  const found = candidates.find((c) => existsSync(c));
  if (!found) throw new Error(`no Chrome found (set CHROME=…). Looked in:\n  ${candidates.join("\n  ")}`);
  return found;
}

/* ---- capture over DevTools ------------------------------------------------ */

function websocket() {
  try {
    const req = createRequire(join(ROOT, "packages/connector-sdk/package.json"));
    return req("ws");
  } catch {
    throw new Error("cannot resolve 'ws' — run pnpm install first");
  }
}

function cdp(WebSocket, url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  ws.on("message", (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  });
  const ready = new Promise((r) => ws.on("open", r));
  return {
    ready,
    close: () => ws.close(),
    send: (method, params) =>
      new Promise((res, rej) => {
        const i = ++id;
        pending.set(i, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
        ws.send(JSON.stringify({ id: i, method, params }));
      }),
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* Chrome is started with --remote-debugging-port=0 and told which port it got
   through DevToolsActivePort in its profile: no fixed port to collide with a
   previous run's Chrome that is still shutting down. */
async function browserWsUrl(profileDir) {
  for (let i = 0; i < 40; i++) {
    await wait(500);
    try {
      const port = Number(readFileSync(join(profileDir, "DevToolsActivePort"), "utf8").split("\n")[0]);
      if (!Number.isInteger(port) || port <= 0) continue;
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const page = (await res.json()).find((t) => t.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* not listening yet */
    }
  }
  throw new Error("Chrome never opened its DevTools port");
}

/* ---- build ---------------------------------------------------------------- */

rmSync(BUILD, { recursive: true, force: true });
mkdirSync(BUILD, { recursive: true });
mkdirSync(OUT, { recursive: true });

for (const f of FRAMES) writeFileSync(join(BUILD, `${f.name}.html`), frameHtml(f));

const WebSocket = websocket();
const server = await serve();
const chrome = chromeBinary();
const profile = mkdtempSync(join(tmpdir(), "rabta-appstore-shots-"));
console.log(`==> ${chrome.split("/").pop()}`);

const proc = spawn(
  chrome,
  [
    "--headless=new",
    `--user-data-dir=${profile}`,
    "--remote-debugging-port=0",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "--force-color-profile=srgb",
    // Chrome refuses its own sandbox as root (CI containers); nothing here
    // loads untrusted content.
    ...(process.getuid?.() === 0 ? ["--no-sandbox"] : []),
    "about:blank",
  ],
  { stdio: "ignore" },
);

let client;
const written = [];
try {
  client = cdp(WebSocket, await browserWsUrl(profile));
  await client.ready;
  await client.send("Page.enable");
  // 1280x800 CSS px at 2x — exactly 2560x1600 device pixels, unscaled.
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 800,
    deviceScaleFactor: 2,
    mobile: false,
  });

  for (const f of FRAMES) {
    await client.send("Page.navigate", {
      url: `http://127.0.0.1:${PORT}/dist-artifacts/app-store-screenshots/.build/${f.name}.html`,
    });
    await wait(1500);
    await client.send("Runtime.evaluate", { expression: "document.fonts.ready", awaitPromise: true });
    await wait(600);
    const { data } = await client.send("Page.captureScreenshot", { format: "png" });
    const file = `rabta-${f.name}-2560x1600.png`;
    writeFileSync(join(OUT, file), Buffer.from(data, "base64"));
    written.push(file);
    console.log(`    ${file}`);
  }
} finally {
  client?.close();
  server.close();
  // Wait for Chrome to be gone before deleting its profile: killed while
  // still flushing, it leaves files behind mid-rm and the rm fails.
  const gone = new Promise((r) => proc.once("exit", r));
  proc.kill("SIGKILL");
  await gone;
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

console.log(`==> ${OUT}`);
console.log("    Upload in filename order; App Store Connect shows them in the order you add them.");
