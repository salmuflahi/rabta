#!/usr/bin/env node
/**
 * Deterministic screenshot driver for the Rabta website.
 *
 *   node capture/capture.mjs [--out <dir>]
 *
 * Boots the capture Vite server (mocked Tauri bridge + frozen fixture),
 * then drives headless Chrome once per screen and writes a 2560x1600 PNG
 * (1280x800 CSS px at DPR 2).
 *
 * Reproducibility notes:
 *   - TZ is pinned to UTC and the app's clock is frozen in main.tsx, so all
 *     relative labels are stable.
 *   - A throwaway Chrome profile per run means no cached state leaks in.
 *   - --virtual-time-budget advances timers deterministically rather than
 *     waiting on the wall clock, so animations land in the same settled
 *     state every run.
 *   - Chrome does not reliably self-exit after --screenshot with a virtual
 *     time budget, so the driver waits for the PNG to stabilise on disk and
 *     then reaps the process. This is a Chrome quirk, not a timing race:
 *     the file is complete before it is read.
 *
 * Requirements: Google Chrome, and `pnpm install` already run in apps/desktop.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, "..");
const repoRoot = resolve(appDir, "../..");

const outFlag = process.argv.indexOf("--out");
const OUT_DIR =
  outFlag !== -1 && process.argv[outFlag + 1]
    ? resolve(process.argv[outFlag + 1])
    : join(repoRoot, "website/assets/shots/src");

const PORT = 5199;
const VIEWPORT = { width: 1280, height: 800 };
const DPR = 2;
const VIRTUAL_TIME_MS = 6000;

/** The screens to capture. `id` becomes the output filename and is also the
 *  `#capture=` hash the entry point reads. */
const SCREENS = [
  { id: "overview", label: "Overview" },
  { id: "capsules", label: "Capsules" },
  { id: "restore", label: "Restore" },
  { id: "projects", label: "Projects" },
  { id: "connectors", label: "Connectors" },
  { id: "activity", label: "Activity" },
];

const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  const hit = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!hit) {
    console.error(
      "No Chrome-family browser found. Install Google Chrome, or add its path\n" +
        "to CHROME_CANDIDATES in capture/capture.mjs.",
    );
    process.exit(1);
  }
  return hit;
}

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error(`capture server did not start at ${url}`);
}

/** Waits until `file` exists and its size has stopped changing, which means
 *  Chrome has finished writing the PNG. */
async function waitForStableFile(file, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastSize = -1;
  let stableFor = 0;
  while (Date.now() < deadline) {
    await sleep(300);
    if (!existsSync(file)) continue;
    const size = statSync(file).size;
    if (size > 0 && size === lastSize) {
      stableFor += 1;
      if (stableFor >= 2) return size;
    } else {
      stableFor = 0;
    }
    lastSize = size;
  }
  throw new Error(`timed out waiting for ${file}`);
}

async function captureScreen(chrome, screen, index) {
  const out = join(OUT_DIR, `${screen.id}.png`);
  rmSync(out, { force: true });

  const profile = join(OUT_DIR, `.chrome-profile-${index}`);
  rmSync(profile, { recursive: true, force: true });

  const args = [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-color-profile=srgb",
    "--disable-lcd-text",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    `--user-data-dir=${profile}`,
    `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
    `--force-device-scale-factor=${DPR}`,
    `--virtual-time-budget=${VIRTUAL_TIME_MS}`,
    `--screenshot=${out}`,
    `http://localhost:${PORT}/#capture=${screen.id}`,
  ];

  const proc = spawn(chrome, args, {
    stdio: "ignore",
    env: { ...process.env, TZ: "UTC", LANG: "en_US.UTF-8" },
  });

  try {
    const size = await waitForStableFile(out);
    return { out, size };
  } finally {
    proc.kill("SIGKILL");
    rmSync(profile, { recursive: true, force: true });
  }
}

async function main() {
  const chrome = findChrome();
  mkdirSync(OUT_DIR, { recursive: true });

  console.log(`chrome    ${chrome}`);
  console.log(`out       ${OUT_DIR}`);
  console.log(
    `viewport  ${VIEWPORT.width}x${VIEWPORT.height} @${DPR}x ` +
      `-> ${VIEWPORT.width * DPR}x${VIEWPORT.height * DPR}\n`,
  );

  const vite = spawn(
    join(appDir, "node_modules/.bin/vite"),
    ["--config", join(here, "vite.config.ts")],
    { cwd: appDir, stdio: "ignore", env: { ...process.env, TZ: "UTC" } },
  );

  let failed = 0;
  try {
    await waitForServer(`http://localhost:${PORT}/`);
    for (const [i, screen] of SCREENS.entries()) {
      process.stdout.write(`  ${screen.label.padEnd(12)}`);
      try {
        const { size } = await captureScreen(chrome, screen, i);
        console.log(`ok   ${(size / 1024).toFixed(0)} KB`);
      } catch (err) {
        failed += 1;
        console.log(`FAIL ${err.message}`);
      }
    }
  } finally {
    vite.kill("SIGKILL");
  }

  console.log(
    failed === 0
      ? `\n${SCREENS.length} screens captured.`
      : `\n${failed} of ${SCREENS.length} screens failed.`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
