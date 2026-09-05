#!/usr/bin/env node
/**
 * Build the Chrome Web Store screenshots into dist-artifacts/store-screenshots/.
 *
 *   ./scripts/make-store-shots.mjs
 *
 * Five listing images at 1280x800 — the size the Store accepts — composed from
 * the app screenshots the website already ships and from the extension's own
 * popup. Nothing here is a pasted picture that has to be remembered about:
 *
 *   - the app shots come from site/public/assets/shots/, so they change when the
 *     site's do;
 *   - the popup is the real connectors/chrome/popup.html, rendered live in an
 *     iframe with the chrome.* API stubbed, so it cannot drift from what
 *     actually ships. Changing popup.css changes this image.
 *
 * The alternative — four PNGs in a folder — goes stale silently, which is how
 * the listing ended up showing a screenshot of the desktop app on an extension
 * page, and how Google ended up serving a headline the site had stopped using.
 *
 * Needs Chrome, or Playwright's Chrome for Testing if that is what is on the
 * machine. Capture goes over DevTools rather than Chrome's own --screenshot
 * flag, which in Chrome for Testing 145 never exits and never writes a file.
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { tmpdir, homedir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const OUT = join(ROOT, "dist-artifacts", "store-screenshots");
const BUILD = join(OUT, ".build");
const PORT = 8771;

/* ---- the listing, in order ------------------------------------------------
 * Copy is held to claims already made in docs/store-listings.md, so a new
 * screenshot never quietly asserts something the listing was not reviewed for.
 */
const FRAMES = [
  {
    name: "1-popup",
    eyebrow: "The extension",
    h1: "One click tells you it&rsquo;s working.",
    sub: "Connected, with a live count of the tabs Rabta would capture &mdash; only real pages, never incognito.",
    art: `<iframe class="shot--popup" src="/dist-artifacts/store-screenshots/.build/popup.html" title="The Rabta Connector popup, connected"></iframe>`,
  },
  {
    name: "2-approve",
    eyebrow: "Pairing",
    h1: "You approve this browser. Once.",
    sub: "Rabta asks before the browser connects, and captures nothing until you save a capsule.",
    shot: "connectors",
    // Two connectors leave the lower half of this screen empty, so it is
    // cropped to the part that is the point: the approval banner.
    srcY: 60,
    cropH: 430,
    alt: "Rabta's Connectors screen asking to approve a Chrome connection",
  },
  {
    name: "3-tabs",
    eyebrow: "What it does",
    h1: "Tabs ride along with the task.",
    sub: "Save a capsule and the open tabs go with it &mdash; reopened when you resume that task.",
    shot: "capsules",
    srcY: 100,
    alt: "Rabta's task list, each task showing how many tabs it holds",
  },
  {
    name: "4-local",
    eyebrow: "Local-first",
    h1: "Nothing leaves your machine.",
    sub: "The extension talks only to the Rabta app on 127.0.0.1. No cloud account, no servers, no telemetry.",
    shot: "overview",
    // Same offset as the tabs shot, so the sidebar starts in the same place
    // and the mark is not sliced through the middle.
    srcY: 100,
    alt: "Rabta's Overview, showing projects, connected apps and open tasks",
  },
];

/* Source shots are 1600x1000 and are shown 1168 wide. */
const SCALE = 1168 / 1600;

/* What the popup is told, so it renders its connected state. Five restorable
   tabs, which is what the task in frame 3 is carrying — the two images are
   meant to be read one after the other. */
const POPUP_STUB = `
window.chrome = {
  runtime: {
    sendMessage: async () => ({ connected: true, connecting: false, paired: true, port: 17872 }),
    reload() {},
  },
  tabs: {
    query: async () => [
      { url: "https://github.com/salmuflahi/rabta/pull/48", incognito: false },
      { url: "https://developer.mozilla.org/en-US/docs/Web/API/WebSocket", incognito: false },
      { url: "https://docs.rs/tokio/latest/tokio/", incognito: false },
      { url: "http://localhost:5173/settings", incognito: false },
      { url: "https://rabta.build/setup/", incognito: false },
      { url: "chrome://extensions/", incognito: false },
    ],
  },
  storage: { local: { set: async () => {}, remove: async () => {} } },
};`;

const page = (body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Rabta Connector</title>
<link rel="stylesheet" href="/scripts/store-shots/frame.css" />
</head>
<body>
${body}
</body>
</html>
`;

function frameHtml(f) {
  const art =
    f.art ??
    `<div class="crop"${f.cropH ? ` style="--crop-h: ${f.cropH}px"` : ""}>` +
      `<img style="--shift: ${-Math.round(f.srcY * SCALE)}px" ` +
      `src="/site/public/assets/shots/${f.shot}-1600.webp" alt="${f.alt}" /></div>`;

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

/** The shipping popup, with the chrome.* API stubbed in ahead of its module. */
function popupHtml() {
  const src = readFileSync(join(ROOT, "connectors/chrome/popup.html"), "utf8");
  if (!src.includes('src="dist/popup.js"')) {
    throw new Error("popup.html no longer loads dist/popup.js — update the stub injection");
  }
  return src.replace(
    "<head>",
    `<head>\n<base href="/connectors/chrome/" />\n<script>${POPUP_STUB}</script>`,
  );
}

/* ---- a static server over the repo, so every path above is the real file --- */

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".webp": "image/webp",
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
  const candidates = [
    join(
      homedir(),
      "Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64",
      "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    ),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];
  const found = candidates.find((c) => existsSync(c));
  if (!found) throw new Error(`no Chrome found. Looked in:\n  ${candidates.join("\n  ")}`);
  return found;
}

/* ---- capture over DevTools ------------------------------------------------ */

/* ws belongs to @rabta/connector-sdk, which is where the workspace already
   pins it; reached from there rather than added as a second copy at the root. */
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

async function browserWsUrl(port) {
  for (let i = 0; i < 40; i++) {
    await wait(500);
    try {
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

writeFileSync(join(BUILD, "popup.html"), popupHtml());
for (const f of FRAMES) writeFileSync(join(BUILD, `${f.name}.html`), frameHtml(f));

const WebSocket = websocket();
const server = await serve();
const chrome = chromeBinary();
const profile = mkdtempSync(join(tmpdir(), "rabta-shots-"));
const CDP_PORT = 9224;
console.log(`==> ${chrome.split("/").pop()}`);

const proc = spawn(
  chrome,
  [
    "--headless=new",
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${CDP_PORT}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "about:blank",
  ],
  { stdio: "ignore" },
);

let client;
try {
  client = cdp(WebSocket, await browserWsUrl(CDP_PORT));
  await client.ready;
  await client.send("Page.enable");
  // Exactly 1280x800 device pixels — the size the Store accepts, unscaled.
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });

  for (const f of FRAMES) {
    await client.send("Page.navigate", {
      url: `http://127.0.0.1:${PORT}/dist-artifacts/store-screenshots/.build/${f.name}.html`,
    });
    await wait(1500);
    // Without waiting on the face, the first frame captures a fallback font.
    await client.send("Runtime.evaluate", { expression: "document.fonts.ready", awaitPromise: true });
    await wait(600);
    const { data } = await client.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(OUT, `rabta-${f.name}-1280x800.png`), Buffer.from(data, "base64"));
    console.log(`    rabta-${f.name}-1280x800.png`);
  }
} finally {
  client?.close();
  proc.kill("SIGKILL");
  server.close();
  rmSync(profile, { recursive: true, force: true });
}

console.log(`==> ${OUT}`);
console.log("    Upload in filename order; the Store shows them in the order you add them.");
