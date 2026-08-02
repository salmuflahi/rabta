# Rabta Living Instrument Download Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current long, static Rabta homepage with the approved Living Instrument download experience: an airy petrol-and-cool visual world, two honest real-product loops, and the Return Receipt closing fold, while preserving the factual depth of Setup and Privacy.

**Architecture:** Keep the deployed site as framework-free HTML/CSS/ES modules. The homepage is rebuilt as one semantic narrative; shared shell, landing composition, media behavior, and fold geometry stay in separate files. The existing real-app capture rig gains deterministic demo modes, and committed H.264 assets are checked by a dependency-free Node contract suite plus `ffprobe` in CI.

**Tech Stack:** Static HTML5, layered CSS, browser-native ES modules, Node 18 `node:test`, React 18/Vite capture rig, Vitest, Google Chrome, macOS `screencapture`/`avconvert`, CI `ffprobe`.

## Global Constraints

- The approved source of truth is `docs/superpowers/specs/2026-08-01-rabta-living-instrument-download-site-design.md`.
- Scope is the `website/` experience and the capture tooling/assets it consumes; do not redesign the desktop app.
- Runtime remains hand-authored HTML/CSS/JS with no framework, bundler, analytics, embed, or third-party subresource.
- Color tokens are exactly petrol `#102526`, orange `#ff6b2c`, ivory `#f3f0e8`, cool panel `#173239`, cool mid `#66858c`, cool soft `#a9bec2`, and cool field `#d9e3e3`.
- Inter Variable remains the only downloaded font; system monospace is used only for machine-verifiable values.
- Hero type is 72px desktop, 46px tablet, and 36px mobile at `line-height: 0.98`.
- Homepage section spacing is chosen from 96–160px desktop, 72–112px tablet, and 56–88px mobile; it must not collapse back to one universal rhythm.
- The product visual appears directly below the hero copy.
- Exactly two product videos may autoplay: hero `8.0s ±0.5s`, honest return `5.0s ±0.4s`; both are silent, muted, inline, poster-backed, and in-view only.
- Desktop hero video is at most 2.5 MB; desktop honest-return video is at most 1.5 MB; each mobile variant is at most 75% of its desktop counterpart.
- Reduced motion, data saver, autoplay rejection, video error, missing JavaScript, keyboard, touch, and 320px-wide paths remain complete.
- Footer receipt uses desktop `--fold-size: 56px` / `--fold-half: 28px` and mobile `40px` / `20px`; the flap rotates `-180deg` around the `(1,1,0)` hinge over `520ms` after a `100ms` delay.
- The restore result stays honest: `Workspace partially restored`, VS Code `Restored`, Chrome `On next reload`, Git `Restored`.
- Release facts stay exact: `0.1.0`, `5.5 MB`, macOS 11+, Apple Silicon only, no Intel build, signed and notarized.
- Detailed SHA-256, Team ID, manual installation, connector caveats, and legacy bundle-ID material remain on `/setup/`; full lifecycle/privacy material remains on `/privacy/`.
- Do not invent customers, testimonials, ratings, download counts, or product capabilities.
- Preserve the user’s current dirty website work before overwriting overlapping files. Do not stage or delete `website/__cap.html`.

## File Structure

| Path | Responsibility |
|---|---|
| `website/index.html` | Complete homepage semantics, approved copy, product media markup, and download links |
| `website/css/tokens.css` | Palette, type, spacing, layout, fold, and motion constants |
| `website/css/shell.css` | Reset, type primitives, rails, buttons, navigation, shared footer, focus, and no-JS behavior |
| `website/css/landing.css` | Homepage hero, Return Field, chapters, product composition, privacy, download, and responsive layout |
| `website/css/receipt-fold.css` | Isolated receipt geometry, exact hinge transform, interaction states, and reduced-motion state |
| `website/css/doc.css` | Setup, Privacy, and 404 document-only layout |
| `website/js/main.js` | Safe boot of copy, media, and receipt modules |
| `website/js/media.js` | Source selection, save-data/reduced-motion policy, viewport playback, manual play, and failure state |
| `website/js/receipt-fold.js` | Accessible click/touch toggle for receipt; hover/focus remain CSS |
| `website/assets/demos/*.m4v` | Four committed H.264 loops: desktop/mobile hero and desktop/mobile honest return |
| `website/assets/demos/*.png` | Explicit hero and honest-return poster frames |
| `website/assets/demos/manifest.json` | Expected dimensions, durations, file budgets, and corresponding fixture text |
| `website/assets/brand/og-card.html` | Social-card source using the Living Instrument headline and palette |
| `website/assets/brand/og-cover.png` | Generated 1200×630 social preview |
| `apps/desktop/capture/director.ts` | Pure capture-hash parser and deterministic demo timelines |
| `apps/desktop/capture/director.test.ts` | Timeline/parser contract tests |
| `apps/desktop/capture/main.tsx` | Drives the real React app through screenshot or demo mode |
| `apps/desktop/capture/record-demos.mjs` | Boots capture Vite, opens a fixed Chrome app window, records four variants, and converts them to H.264 |
| `apps/desktop/capture/README.md` | Reproducible screenshot and demo recording instructions |
| `tests/site/helpers.mjs` | Shared static-file, route, attribute, and local-reference helpers |
| `tests/site/site-contract.test.mjs` | Copy, semantics, dependency, route, asset, video-count, and fold-geometry assertions |
| `scripts/verify-media.mjs` | `ffprobe`-backed codec, duration, dimension, audio, and byte-budget verification |
| `.github/workflows/pages.yml` | Runs the site contract and media verifier before Pages deployment |

---

### Task 0: Preserve the approved starting point

**Files:**
- Stage existing: tracked changes under `website/`
- Stage existing: `docs/site-design-plan.md`
- Exclude: `website/__cap.html`

**Interfaces:**
- Consumes: the current dirty `launch-site` working tree created by the previous site iteration
- Produces: a recoverable baseline commit before overlapping files are replaced

- [ ] **Step 1: Confirm the exact branch and dirty scope**

Run:

```bash
git branch --show-current
git status --short
```

Expected: branch `launch-site`; the only dirty paths are the existing website redesign, `docs/site-design-plan.md`, and `website/__cap.html`.

- [ ] **Step 2: Stage the existing site without the temporary probe**

```bash
git add -u website
git add docs/site-design-plan.md website/css/components.css website/css/doc.css website/css/sections.css website/css/shell.css
git status --short
```

Expected: `website/__cap.html` remains `??`; all other current website work and the old design plan are staged.

- [ ] **Step 3: Commit the recoverable baseline**

```bash
git commit -m "chore(site): checkpoint instrument redesign base"
```

Expected: commit succeeds and `git status --short` shows only `?? website/__cap.html` before new implementation files are created.

### Task 1: Establish the Living Instrument contract and shared foundation

**Files:**
- Create: `tests/site/helpers.mjs`
- Create: `tests/site/site-contract.test.mjs`
- Modify: `package.json`
- Modify: `website/css/tokens.css`
- Modify: `website/css/shell.css`
- Delete: `website/css/components.css`
- Delete: `website/css/sections.css`
- Create: `website/css/landing.css`
- Create: `website/css/receipt-fold.css`
- Modify: `website/index.html`
- Modify: `website/setup/index.html`
- Modify: `website/privacy/index.html`
- Modify: `website/404.html`

**Interfaces:**
- Consumes: the approved palette, route list, and file boundaries from the design spec
- Produces: `readRoute(path)`, `localReferences(html)`, the canonical CSS imports, and stable shared tokens used by every later task

- [ ] **Step 1: Write the failing static contract test**

Create `tests/site/helpers.mjs` with these exports:

```js
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, "../..");
export const SITE = resolve(ROOT, "website");

export function routeFile(route) {
  if (route === "/") return resolve(SITE, "index.html");
  if (route === "/404.html") return resolve(SITE, "404.html");
  return resolve(SITE, route.slice(1), "index.html");
}

export async function readRoute(route) {
  return readFile(routeFile(route), "utf8");
}

export function localReferences(html) {
  return [...html.matchAll(/(?:src|href|poster)="(\/[^"]+)"/g)]
    .map((match) => match[1].split(/[?#]/, 1)[0]);
}
```

Create the first section of `tests/site/site-contract.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ROOT, SITE, localReferences, readRoute } from "./helpers.mjs";

const routes = ["/", "/setup/", "/privacy/", "/404.html"];

test("all routes use the Living Instrument responsibility boundaries", async () => {
  for (const route of routes) {
    const html = await readRoute(route);
    assert.match(html, /\/css\/tokens\.css/);
    assert.match(html, /\/css\/shell\.css/);
    assert.match(html, /\/css\/(?:landing|doc)\.css/);
    assert.match(html, /\/css\/receipt-fold\.css/);
    assert.doesNotMatch(html, /\/css\/(?:components|sections)\.css/);
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1, route);
  }
});

test("the approved palette is canonical", async () => {
  const css = await readFile(resolve(SITE, "css/tokens.css"), "utf8");
  for (const value of ["#102526", "#ff6b2c", "#f3f0e8", "#173239", "#66858c", "#a9bec2", "#d9e3e3"]) {
    assert.match(css.toLowerCase(), new RegExp(value));
  }
});

test("all root-relative assets exist", async () => {
  for (const route of routes) {
    const html = await readRoute(route);
    for (const ref of localReferences(html)) {
      if (ref === "/") continue;
      await access(resolve(SITE, `.${ref}`));
    }
  }
});

test("no third-party subresource is loaded", async () => {
  for (const route of routes) {
    const html = await readRoute(route);
    const external = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
    const subresources = external.filter((url) => /\.(?:js|css|woff2?|png|jpe?g|avif|webp|svg|m4v)(?:[?#]|$)/i.test(url));
    assert.deepEqual(subresources, [], route);
  }
});
```

- [ ] **Step 2: Run the contract and verify it fails**

Run:

```bash
node --test tests/site/site-contract.test.mjs
```

Expected: FAIL because the cool palette and `landing.css` / `receipt-fold.css` imports do not exist yet.

- [ ] **Step 3: Replace the token contract and wire the responsibility files**

In `website/css/tokens.css`, retain the existing `@font-face` and layer declaration, then make the canonical aliases explicit:

```css
:root {
  --petrol: #102526;
  --orange: #ff6b2c;
  --ivory: #f3f0e8;
  --cool-panel: #173239;
  --cool-mid: #66858c;
  --cool-soft: #a9bec2;
  --cool-field: #d9e3e3;
  --ink-on-orange: #102526;
  --sans: "Inter Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  --rail: 1180px;
  --gutter: 40px;
  --section-wide: 160px;
  --section-standard: 128px;
  --section-close: 96px;
  --fold-size: 56px;
  --fold-half: 28px;
  --fold-duration: 520ms;
  --fold-delay: 100ms;
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
}

@media (max-width: 899px) {
  :root {
    --gutter: 24px;
    --section-wide: 112px;
    --section-standard: 92px;
    --section-close: 72px;
  }
}

@media (max-width: 599px) {
  :root {
    --gutter: 18px;
    --section-wide: 88px;
    --section-standard: 72px;
    --section-close: 56px;
    --fold-size: 40px;
    --fold-half: 20px;
  }
}
```

Create `website/css/landing.css` with `@layer section {}` and `website/css/receipt-fold.css` with `@layer component, state {}`. Replace page stylesheet imports so `/` uses `landing.css` and all other routes use `doc.css`; all four routes also use `receipt-fold.css` after their page stylesheet. Delete `components.css` and `sections.css` after their still-needed shared rules have moved to `shell.css`; do not leave unreferenced parallel responsibility files.

- [ ] **Step 4: Update the root test script**

Change `package.json` scripts to:

```json
{
  "scripts": {
    "test": "pnpm -r --if-present test && pnpm test:site",
    "test:site": "node --test tests/site/*.test.mjs",
    "verify:media": "node scripts/verify-media.mjs",
    "build": "pnpm -r --if-present build"
  }
}
```

- [ ] **Step 5: Run the contract and full existing tests**

```bash
pnpm test:site
pnpm -r --if-present test
```

Expected: the site contract passes; existing package tests pass unchanged.

- [ ] **Step 6: Commit the foundation**

```bash
git add package.json tests/site website/css/tokens.css website/css/shell.css website/css/landing.css website/css/receipt-fold.css website/css/components.css website/css/sections.css website/index.html website/setup/index.html website/privacy/index.html website/404.html
git commit -m "test(site): lock living instrument foundation"
```

### Task 2: Rebuild the homepage narrative and static Return Field

**Files:**
- Modify: `tests/site/site-contract.test.mjs`
- Rewrite: `website/index.html`
- Modify: `website/css/shell.css`
- Modify: `website/css/landing.css`

**Interfaces:**
- Consumes: shared tokens and `readRoute()` from Task 1
- Produces: final semantic section IDs `how-it-works`, `pieces`, `return`, `local`, and `download`; `data-product-media` containers for Task 4; `data-receipt-fold` markup for Task 6

- [ ] **Step 1: Add failing homepage copy and structure assertions**

Append:

```js
test("homepage has the approved narrative and removes the stale architecture", async () => {
  const html = await readRoute("/");
  for (const copy of [
    "Workspace memory for macOS",
    "Pick up the task.",
    "Not the pieces.",
    "A task is more than a folder.",
    "The pieces you usually reconstruct by hand.",
    "The return, shown honestly.",
    "Local is not a privacy setting.",
    "Come back to the work."
  ]) assert.ok(html.includes(copy), copy);

  for (const id of ["how-it-works", "pieces", "return", "local", "download"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  for (const removed of ["class=\"rack", "class=\"evidence", "class=\"switch", "class=\"ledger"]) {
    assert.doesNotMatch(html, new RegExp(removed));
  }

  assert.ok(html.includes("no Intel build"));
  assert.ok(html.includes("Workspace partially restored"));
  assert.ok(html.includes("On next reload"));
});
```

- [ ] **Step 2: Run the test and verify the old homepage fails**

```bash
pnpm test:site
```

Expected: FAIL on the new hero and narrative copy.

- [ ] **Step 3: Replace `website/index.html` with the approved semantic narrative**

Use this exact order inside `<main>`:

```html
<section class="hero rail" aria-labelledby="hero-title">
  <p class="eyebrow">Workspace memory for macOS</p>
  <h1 id="hero-title">Pick up the task.<br><span>Not the pieces.</span></h1>
  <p class="hero__lede">Rabta remembers the files, terminals, browser tabs and Git branch around each task—then puts that working context back when you return.</p>
  <a class="button button--primary" href="https://github.com/salmuflahi/rabta/releases/download/v0.1.0/Rabta_0.1.0_aarch64.dmg">Download for macOS</a>
  <p class="requirement">Free · 5.5 MB · macOS 11+ · Apple Silicon · no Intel build</p>
</section>

<figure class="return-field shell" data-product-media="hero">
  <div class="return-field__stage">
    <img src="/assets/shots/overview-1024.png" width="1024" height="640" fetchpriority="high" alt="Rabta showing the active task Wire the connector SDK reconnect and the working context attached to it.">
  </div>
  <figcaption>Real Rabta interface · deterministic representative data</figcaption>
</figure>

<div class="release-strip rail" aria-label="Release facts">
  <span>0.1.0 · signed + notarized</span><span>no account · nothing uploaded</span><span>macOS 11+ · no Intel build</span>
</div>

<section class="thesis rail" id="how-it-works" aria-labelledby="thesis-title">
  <h2 id="thesis-title">A task is more than a folder.<br><span>It is everything you had open around it.</span></h2>
  <p>Rabta keeps those pieces attached to the task, so changing direction does not mean reconstructing the workspace when you return.</p>
</section>

<section class="pieces rail" id="pieces" aria-labelledby="pieces-title">
  <h2 id="pieces-title">The pieces you usually reconstruct by hand.</h2>
  <div class="pieces__composition">
    <dl class="pieces__manifest">
      <div><dt>Files</dt><dd>4 open · cursor positions kept</dd></div>
      <div><dt>Terminals</dt><dd>3 sessions · working directories kept</dd></div>
      <div><dt>Browser tabs</dt><dd>5 URLs + titles · no page content</dd></div>
      <div><dt>Git branch</dt><dd>feat/connector-reconnect · restored first</dd></div>
    </dl>
    <img src="/assets/shots/capsules-1024.png" width="1024" height="640" loading="lazy" alt="The real Capsules view for Wire the connector SDK reconnect, showing four files, three terminals, five browser tabs and its Git branch.">
  </div>
</section>

<section class="honest-return rail" id="return" aria-labelledby="return-title">
  <div class="chapter-copy"><h2 id="return-title">The return, shown honestly.</h2><p>Rabta restores what it can now and tells you what is waiting on another app.</p></div>
  <figure class="return-demo" data-product-media="return">
    <img src="/assets/shots/restore-1024.png" width="1024" height="640" loading="lazy" alt="Workspace partially restored: VS Code restored, Chrome on next reload, and Git restored.">
    <figcaption>Workspace partially restored · VS Code — Restored · Chrome — On next reload · Git — Restored</figcaption>
  </figure>
</section>

<section class="local rail" id="local" aria-labelledby="local-title">
  <h2 id="local-title">Local is not a privacy setting.</h2>
  <p>There is no Rabta account, Rabta server, telemetry, analytics, or uploaded project code. Connectors use 127.0.0.1; Chrome reads tab URLs and titles only.</p>
  <p class="availability">Editor connector: published on Open VSX · Browser connector: in review</p>
  <p><a href="/privacy/">Read the full privacy policy</a></p>
</section>

<section class="download rail" id="download" aria-labelledby="download-title">
  <h2 id="download-title">Come back to the work.<br><span>Not the setup.</span></h2>
  <a class="button button--primary" href="https://github.com/salmuflahi/rabta/releases/download/v0.1.0/Rabta_0.1.0_aarch64.dmg">Download Rabta 0.1.0</a>
  <p>5.5 MB · macOS 11+ · Apple Silicon only · no Intel build · signed and notarized</p>
  <nav aria-label="Download details"><a href="/setup/">Setup</a><a href="https://github.com/salmuflahi/rabta/releases/tag/v0.1.0">GitHub release</a><a href="https://github.com/salmuflahi/rabta">Source</a></nav>
</section>
```

Use one minimal sticky navigation: brand, `How it works`, Privacy, Setup, and Download. On mobile, hide the three text links and retain brand plus Download; do not add a drawer.

- [ ] **Step 4: Build the static visual hierarchy**

Implement in `shell.css` and `landing.css`:

```css
.hero { padding-block: 144px 64px; }
.hero h1 { max-width: 980px; font-size: 72px; line-height: .98; letter-spacing: -.055em; }
.hero h1 span, .thesis h2 span, .download h2 span { color: var(--cool-mid); }
.hero__lede { max-width: 680px; margin-top: 32px; color: var(--cool-soft); font-size: 20px; line-height: 1.55; }
.return-field { position: relative; margin-top: 24px; background: var(--cool-field); color: var(--petrol); clip-path: polygon(0 0, calc(100% - 72px) 0, 100% 72px, 100% 100%, 0 100%); }
.return-field::after { content: ""; position: absolute; inset: 0 0 auto auto; width: 72px; height: 72px; background: var(--orange); clip-path: polygon(0 0, 100% 100%, 100% 0); }
.return-field__stage { margin: clamp(28px, 5vw, 72px); overflow: hidden; background: var(--cool-panel); }
.thesis { padding-block: var(--section-wide); }
.pieces { padding-block: var(--section-standard) var(--section-wide); }
.honest-return { padding-block: var(--section-wide); }
.local { padding-block: var(--section-standard); background: var(--ivory); color: var(--petrol); }
.download { padding-block: var(--section-wide); }

@media (max-width: 899px) {
  .hero h1 { font-size: 46px; }
  .pieces__composition, .honest-return { grid-template-columns: 1fr; }
}

@media (max-width: 599px) {
  .hero { padding-block: 88px 40px; }
  .hero h1 { font-size: 36px; }
  .return-field { clip-path: polygon(0 0, calc(100% - 42px) 0, 100% 42px, 100% 100%, 0 100%); }
  .return-field::after { width: 42px; height: 42px; }
}
```

Finish the composition without card grids, repeated folded corners, gradients, shadows, or equal section padding. Use `128px` for thesis/honest-return, `96px` for the local reset, and `160px` for the download close on desktop; use the mapped token equivalents at tablet/mobile.

- [ ] **Step 5: Verify the first visual checkpoint**

Run:

```bash
python3 -m http.server 4174 --directory website
```

Inspect `/` at 1440×900 and 390×844. Expected: hero copy → CTA → wide cool Return Field is visible in that order; the field is not a card; the page has no horizontal overflow; the later sections read as separate chapters rather than a dashboard.

- [ ] **Step 6: Run tests and commit the narrative**

```bash
pnpm test:site
git add website/index.html website/css/shell.css website/css/landing.css tests/site/site-contract.test.mjs
git commit -m "feat(site): rebuild the living instrument narrative"
```

### Task 3: Add deterministic real-product demo direction and recording

**Files:**
- Create: `apps/desktop/capture/director.ts`
- Create: `apps/desktop/capture/director.test.ts`
- Modify: `apps/desktop/capture/main.tsx`
- Create: `apps/desktop/capture/record-demos.mjs`
- Modify: `apps/desktop/capture/README.md`
- Create: `website/assets/demos/manifest.json`
- Create: `website/assets/demos/hero-return-desktop.m4v`
- Create: `website/assets/demos/hero-return-mobile.m4v`
- Create: `website/assets/demos/honest-return-desktop.m4v`
- Create: `website/assets/demos/honest-return-mobile.m4v`
- Create: `website/assets/demos/hero-return.png`
- Create: `website/assets/demos/honest-return.png`

**Interfaces:**
- Consumes: `useStore.setView`, `useStore.requestResume`, task ID `task_reconnect`, and the existing frozen fixture
- Produces: `parseCaptureMode(hash): CaptureMode`, `DEMO_TIMELINES`, four silent H.264 videos, two final-state posters, and a truthful media manifest

- [ ] **Step 1: Write failing parser and timeline tests**

Create `director.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEMO_TIMELINES, parseCaptureMode } from "./director";

describe("capture director", () => {
  it("keeps static screenshots and demos explicit", () => {
    expect(parseCaptureMode("#capture=restore")).toEqual({ kind: "screen", name: "restore" });
    expect(parseCaptureMode("#demo=hero-return")).toEqual({ kind: "demo", name: "hero-return" });
    expect(parseCaptureMode("#demo=honest-return")).toEqual({ kind: "demo", name: "honest-return" });
  });

  it("locks the approved durations and truthful final state", () => {
    expect(DEMO_TIMELINES["hero-return"].durationMs).toBe(8000);
    expect(DEMO_TIMELINES["honest-return"].durationMs).toBe(5000);
    expect(DEMO_TIMELINES["honest-return"].finalLabel).toBe("Workspace partially restored");
  });
});
```

- [ ] **Step 2: Run the targeted test and verify it fails**

```bash
pnpm --filter desktop exec vitest run capture/director.test.ts
```

Expected: FAIL because `director.ts` does not exist.

- [ ] **Step 3: Implement the pure timeline contract**

Create `director.ts`:

```ts
export type ScreenName = "overview" | "capsules" | "projects" | "connectors" | "activity" | "settings" | "restore";
export type DemoName = "hero-return" | "honest-return";
export type CaptureMode = { kind: "screen"; name: ScreenName } | { kind: "demo"; name: DemoName };

export const DEMO_TIMELINES = {
  "hero-return": {
    durationMs: 8000,
    finalLabel: "Workspace partially restored",
    cues: [
      { atMs: 0, action: "show-active-task" },
      { atMs: 500, action: "save-state" },
      { atMs: 2000, action: "leave-task" },
      { atMs: 4000, action: "resume-task" }
    ]
  },
  "honest-return": {
    durationMs: 5000,
    finalLabel: "Workspace partially restored",
    cues: [
      { atMs: 0, action: "show-capsule" },
      { atMs: 700, action: "resume-task" }
    ]
  }
} as const;

export function parseCaptureMode(hash: string): CaptureMode {
  const demo = /(?:^|[#&])demo=(hero-return|honest-return)/.exec(hash)?.[1] as DemoName | undefined;
  if (demo) return { kind: "demo", name: demo };
  const requested = /(?:^|[#&])capture=([a-z]+)/.exec(hash)?.[1] as ScreenName | undefined;
  const valid: ScreenName[] = ["overview", "capsules", "projects", "connectors", "activity", "settings", "restore"];
  return { kind: "screen", name: requested && valid.includes(requested) ? requested : "overview" };
}
```

- [ ] **Step 4: Drive the real app through each timeline**

Refactor `main.tsx` to use `parseCaptureMode`. Static screen mode keeps its current behavior. Demo mode must render the same `<App/>`, use the store’s public navigation/resume actions, and click the real `Save State` button by accessible text rather than recreating app UI. Expose deterministic readiness markers:

```ts
document.documentElement.dataset.demo = mode.name;
document.documentElement.dataset.demoReady = "true";
window.setTimeout(() => {
  document.documentElement.dataset.demoComplete = "true";
}, DEMO_TIMELINES[mode.name].durationMs);
```

For `hero-return`, show the active `task_reconnect`, activate the real Save State control by `500ms`, cut to the Overview/other-task state at `2000ms`, then call `setView("capsules")` and `requestResume("task_reconnect")` at `4000ms`. For `honest-return`, show Capsules at `0ms` and call `requestResume("task_reconnect")` at `700ms`. Do not add presentation-only components to `apps/desktop/src/`.

- [ ] **Step 5: Implement the macOS recording driver**

`record-demos.mjs` must:

1. boot the existing capture Vite config on port 5199;
2. open Chrome in app mode at a fixed screen location;
3. record the content rectangle with `/usr/sbin/screencapture -v -V<seconds> -R<x,y,w,h>`;
4. write raw movies to a temporary directory from `mkdtempSync`;
5. convert with `/usr/bin/avconvert` to H.264 `.m4v`;
6. run all four jobs serially so the fixed screen rectangle is never shared;
7. refuse to overwrite committed outputs unless `--replace` is present;
8. exit with a clear permission error if Screen Recording access is denied.

Use these locked jobs:

```js
const JOBS = [
  { demo: "hero-return", variant: "desktop", width: 1280, height: 720, seconds: 8.0, preset: "PresetAppleM4V720pHD" },
  { demo: "hero-return", variant: "mobile", width: 390, height: 700, seconds: 8.0, preset: "PresetAppleM4VCellular" },
  { demo: "honest-return", variant: "desktop", width: 1280, height: 720, seconds: 5.0, preset: "PresetAppleM4V720pHD" },
  { demo: "honest-return", variant: "mobile", width: 390, height: 700, seconds: 5.0, preset: "PresetAppleM4VCellular" }
];
```

The mobile capture page must focus the task row and restore sheet through viewport crop/positioning in capture-only CSS; it must not scale the full 1280px interface into 390px.

- [ ] **Step 6: Record, inspect, and commit the assets**

```bash
cd apps/desktop
node capture/record-demos.mjs --replace
```

Expected: four silent `.m4v` files and two final-state PNG posters exist under `website/assets/demos/`; hero ends on the real partial restore, and honest return holds that readable result for at least 2 seconds. Enter the observed duration, dimensions, bytes, and fixture strings into `manifest.json`; never estimate these values.

- [ ] **Step 7: Document and test the capture rig**

Add the recording command, Screen Recording requirement, exact job outputs, fixture truth warning, and regeneration procedure to `capture/README.md`, then run:

```bash
pnpm --filter desktop exec vitest run capture/director.test.ts
pnpm --filter desktop build
```

Expected: both commands pass.

- [ ] **Step 8: Commit the deterministic media**

```bash
git add apps/desktop/capture website/assets/demos
git commit -m "feat(site): record real product return loops"
```

### Task 4: Implement resilient, viewport-aware product media

**Files:**
- Create: `website/js/media.js`
- Create: `tests/site/media.test.mjs`
- Modify: `website/js/main.js`
- Modify: `website/index.html`
- Modify: `website/css/landing.css`

**Interfaces:**
- Consumes: `data-product-media`, `data-src-desktop`, `data-src-mobile`, and committed Task 3 assets
- Produces: `getMediaPolicy()`, `chooseSource()`, `initProductMedia()`, and one-playing-video behavior

- [ ] **Step 1: Write failing media policy tests**

Create `tests/site/media.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { chooseSource, getMediaPolicy } from "../../website/js/media.js";

test("autoplay is disabled for reduced motion and data saver", () => {
  assert.deepEqual(getMediaPolicy({ reducedMotion: true, saveData: false }), { attach: false, autoplay: false });
  assert.deepEqual(getMediaPolicy({ reducedMotion: false, saveData: true }), { attach: false, autoplay: false });
  assert.deepEqual(getMediaPolicy({ reducedMotion: false, saveData: false }), { attach: true, autoplay: true });
});

test("mobile receives the dedicated small source", () => {
  const dataset = { srcDesktop: "/desktop.m4v", srcMobile: "/mobile.m4v" };
  assert.equal(chooseSource(dataset, false), "/desktop.m4v");
  assert.equal(chooseSource(dataset, true), "/mobile.m4v");
});
```

- [ ] **Step 2: Verify the tests fail**

```bash
node --test tests/site/media.test.mjs
```

Expected: FAIL because `media.js` does not exist.

- [ ] **Step 3: Implement policy and initialization**

Use these public functions in `website/js/media.js`:

```js
export function getMediaPolicy({ reducedMotion, saveData }) {
  const autoplay = !reducedMotion && !saveData;
  return { attach: autoplay, autoplay };
}

export function chooseSource(dataset, mobile) {
  return mobile ? dataset.srcMobile : dataset.srcDesktop;
}

export function initProductMedia(root = document, env = window) {
  const blocks = [...root.querySelectorAll("[data-product-media]")];
  const videos = blocks.map((block) => block.querySelector("video")).filter(Boolean);
  const reducedMotion = env.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const saveData = Boolean(env.navigator?.connection?.saveData);
  const mobile = env.matchMedia("(max-width: 599px)").matches;
  const policy = getMediaPolicy({ reducedMotion, saveData });
  const cleanups = [];

  function buttonFor(block) { return block.querySelector("[data-media-play]"); }
  function attach(video) {
    if (video.src) return;
    video.src = chooseSource(video.dataset, mobile);
    video.load();
  }
  function pauseOthers(current) {
    videos.forEach((video) => { if (video !== current) video.pause(); });
  }
  async function play(block, explicit = false) {
    const video = block.querySelector("video");
    const button = buttonFor(block);
    if (!video || block.dataset.mediaState === "failed") return;
    if (explicit || policy.attach) attach(video);
    if (!video.src) { if (button) button.hidden = false; return; }
    if (!explicit && video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return;
    pauseOthers(video);
    try {
      await video.play();
      block.dataset.mediaState = "playing";
      if (button) button.hidden = true;
    } catch {
      block.dataset.mediaState = "blocked";
      if (button) button.hidden = false;
    }
  }

  blocks.forEach((block) => {
    const video = block.querySelector("video");
    const button = buttonFor(block);
    if (!video) return;
    const onError = () => {
      video.pause();
      video.removeAttribute("src");
      block.dataset.mediaState = "failed";
      if (button) { button.hidden = true; button.disabled = true; }
    };
    const onClick = () => void play(block, true);
    video.addEventListener("error", onError);
    button?.addEventListener("click", onClick);
    if (!policy.autoplay && button) button.hidden = false;
    cleanups.push(() => {
      video.removeEventListener("error", onError);
      button?.removeEventListener("click", onClick);
    });
  });

  let observer;
  if (policy.autoplay) {
    observer = new env.IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const block = entry.target;
        const video = block.querySelector("video");
        if (!video) return;
        if (entry.isIntersecting && block.dataset.productMedia !== "hero") attach(video);
        block.dataset.inView = String(entry.intersectionRatio >= 0.55);
        if (entry.intersectionRatio >= 0.55) {
          if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) void play(block);
          else video.addEventListener("canplay", () => {
            if (block.dataset.inView === "true") void play(block);
          }, { once: true });
        } else {
          video.pause();
          if (block.dataset.mediaState !== "failed") block.dataset.mediaState = "paused";
        }
      });
    }, { rootMargin: "300px 0px", threshold: [0, 0.55] });
    blocks.forEach((block) => observer.observe(block));

    const hero = blocks.find((block) => block.dataset.productMedia === "hero");
    if (hero) {
      env.requestAnimationFrame(() => env.requestAnimationFrame(() => {
        const video = hero.querySelector("video");
        if (!video) return;
        attach(video);
        video.addEventListener("canplay", () => {
          if (hero.dataset.inView === "true") void play(hero);
        }, { once: true });
      }));
    }
  }

  return () => {
    observer?.disconnect();
    cleanups.forEach((cleanup) => cleanup());
    videos.forEach((video) => video.pause());
  };
}
```

The initializer must use `matchMedia("(prefers-reduced-motion: reduce)")`, `navigator.connection?.saveData`, two `requestAnimationFrame` ticks before attaching the hero source, and one `IntersectionObserver` with `rootMargin: "300px 0px"` and thresholds `[0, 0.55]`. A lower video attaches near the viewport and plays only at intersection ratio ≥0.55. Before any `play()`, pause every other product video. A rejected play promise reveals the local manual Play control. `error` leaves the poster/caption, disables the control, and sets `data-media-state="failed"`. A manual click may attach/play even in reduced-motion or save-data mode because it is explicit user intent.

- [ ] **Step 4: Replace static media images with progressive video markup**

Use this pattern for both figures, with the correct source/poster pair:

```html
<video width="1280" height="720" muted playsinline loop preload="none"
  poster="/assets/demos/hero-return.png"
  data-src-desktop="/assets/demos/hero-return-desktop.m4v"
  data-src-mobile="/assets/demos/hero-return-mobile.m4v"
  aria-label="Rabta captures a task, leaves it, then restores the workspace with an honest partial result."></video>
<button class="media-play" type="button" data-media-play hidden>Play demo</button>
```

Do not place `<source>` elements in the initial HTML: that would fetch video before save-data policy runs. The poster, alt-equivalent label, caption, and adjacent prose must be complete with JavaScript disabled.

- [ ] **Step 5: Boot media without coupling failures**

Update `main.js` to import `initProductMedia`; keep each initializer in its own `try/catch` so a media failure cannot break Setup copy:

```js
import { initProductMedia } from "./media.js";

function safely(label, init) {
  try { init(); } catch (error) { console.warn(`[rabta] ${label} failed:`, error); }
}

function boot() {
  safely("copy", initCopy);
  safely("media", initProductMedia);
}
```

- [ ] **Step 6: Test playback states in the browser**

At `/`, verify normal, reduced-motion, and blocked-autoplay modes. Expected: only the visible loop plays; reduced motion fetches neither video until Play is pressed; the lower video is not requested before it nears the viewport; a deliberately invalid source leaves a complete poster and no fake playing state.

- [ ] **Step 7: Run tests and commit**

```bash
node --test tests/site/media.test.mjs
pnpm test:site
git add website/index.html website/css/landing.css website/js/main.js website/js/media.js tests/site/media.test.mjs
git commit -m "feat(site): add resilient product loops"
```

### Task 5: Finish the page compositions and responsive rhythm

**Files:**
- Modify: `website/css/landing.css`
- Modify: `website/css/shell.css`
- Modify: `website/index.html`
- Modify: `tests/site/site-contract.test.mjs`

**Interfaces:**
- Consumes: final semantic homepage and media states
- Produces: polished Return Field, attached-pieces composition, honest-return stage, ivory privacy reset, download close, and overflow-safe responsive behavior

- [ ] **Step 1: Add failing composition guardrails**

Append assertions that the homepage has exactly two `<video>` elements, exactly one static product crop in `#pieces`, exactly one `h1`, no radio screen switcher, and no homepage checksum or Team ID:

```js
test("homepage is a focused download narrative", async () => {
  const html = await readRoute("/");
  assert.equal((html.match(/<video\b/g) ?? []).length, 2);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  const pieces = html.match(/<section\b[^>]*id="pieces"[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.equal((pieces.match(/<img\b/g) ?? []).length, 1);
  assert.doesNotMatch(html, /type="radio"/);
  assert.doesNotMatch(html, /3978ec57|86M2X6MUA3/);
});
```

- [ ] **Step 2: Complete the wide compositions**

Use CSS Grid only where it expresses the relationships: manifest beside one crop above 900px, copy beside the honest-return field above 900px, and link/meta rows. Keep the product stages near the full rail. Use cool field once for the hero, cool panel for the lower demo, and ivory once for the privacy reset. Ordinary content must remain unboxed.

Apply these fixed spacing choices:

```css
.thesis { padding-block: 160px; }
.pieces { padding-block: 128px 160px; }
.honest-return { padding-block: 160px; }
.local { padding-block: 96px; }
.download { padding-block: 160px; }

@media (max-width: 899px) {
  .thesis, .honest-return, .download { padding-block: 112px; }
  .pieces { padding-block: 92px 112px; }
  .local { padding-block: 72px; }
}

@media (max-width: 599px) {
  .thesis, .honest-return, .download { padding-block: 88px; }
  .pieces { padding-block: 72px 88px; }
  .local { padding-block: 56px; }
}
```

- [ ] **Step 3: Make mobile media a deliberate crop**

At widths below 600px, give videos a portrait stage with `aspect-ratio: 390 / 700`, preserve their intrinsic `width`/`height` attributes, and use `object-fit: cover` plus per-loop `object-position` so the active task and restore sheet remain legible. Do not shrink a full desktop screenshot into the phone width.

- [ ] **Step 4: Perform the page-rhythm checkpoint**

Inspect 1440×900, 1024×768, 768×1024, 390×844, and 320×800. Expected: each viewport-height chapter has one dominant thought; no horizontal overflow; machine values wrap; the cool palette reads as light/depth within petrol; the page does not become a bento grid.

- [ ] **Step 5: Run tests and commit**

```bash
pnpm test:site
git add website/index.html website/css/landing.css website/css/shell.css tests/site/site-contract.test.mjs
git commit -m "style(site): give the homepage depth and breathing room"
```

### Task 6: Build the Return Receipt and mathematically correct fold

**Files:**
- Create: `website/js/receipt-fold.js`
- Create: `tests/site/receipt-fold.test.mjs`
- Create: `tests/site/fixtures/receipt-fold.html`
- Modify: `website/index.html`
- Modify: `website/css/receipt-fold.css`
- Modify: `website/css/shell.css`

**Interfaces:**
- Consumes: `--fold-size`, `--fold-half`, shared footer links, and `main.js` boot
- Produces: `setReceiptFolded(button, folded)`, `initReceiptFolds(root)`, and deterministic `--fold-progress` visual-QA state

- [ ] **Step 1: Write failing state and geometry tests**

Create `tests/site/receipt-fold.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { SITE } from "./helpers.mjs";
import { setReceiptFolded } from "../../website/js/receipt-fold.js";

test("receipt toggle exposes the real state", () => {
  const attrs = new Map([["aria-pressed", "false"]]);
  const button = {
    dataset: {},
    setAttribute(name, value) { attrs.set(name, value); }
  };
  setReceiptFolded(button, true);
  assert.equal(attrs.get("aria-pressed"), "true");
  assert.equal(button.dataset.folded, "true");
});

test("desktop and mobile hinge halves are exact", async () => {
  const css = await readFile(resolve(SITE, "css/receipt-fold.css"), "utf8");
  assert.match(css, /--fold-size:\s*56px/);
  assert.match(css, /--fold-half:\s*28px/);
  assert.match(css, /--fold-size:\s*40px/);
  assert.match(css, /--fold-half:\s*20px/);
  assert.match(css, /rotate3d\(1,\s*1,\s*0,\s*calc\(-180deg \* var\(--fold-progress\)\)\)/);
  assert.match(css, /calc\(100% - var\(--fold-half\)\) var\(--fold-half\)/);
});
```

- [ ] **Step 2: Verify the tests fail**

```bash
node --test tests/site/receipt-fold.test.mjs
```

Expected: FAIL because the receipt module and geometry do not exist.

- [ ] **Step 3: Implement the accessible toggle**

Create `website/js/receipt-fold.js`:

```js
export function setReceiptFolded(button, folded) {
  button.dataset.folded = String(folded);
  button.setAttribute("aria-pressed", String(folded));
}

export function initReceiptFolds(root = document) {
  const cleanups = [];
  root.querySelectorAll("[data-receipt-fold]").forEach((button) => {
    const onClick = () => setReceiptFolded(button, button.dataset.folded !== "true");
    button.addEventListener("click", onClick);
    cleanups.push(() => button.removeEventListener("click", onClick));
  });
  return () => cleanups.forEach((cleanup) => cleanup());
}
```

Use a native `<button>` for the receipt, so Space/Enter work without custom keyboard handlers and touch does not trap footer links.

- [ ] **Step 4: Add the final receipt markup**

Place the large receipt before the compact link/meta footer:

```html
<button class="receipt" type="button" data-receipt-fold data-folded="false" aria-pressed="false" aria-label="Fold the saved workspace receipt" aria-describedby="receipt-summary">
  <span class="visually-hidden" id="receipt-summary">Saved workspace receipt: 4 files, 3 terminals, 5 browser tabs, branch feat/connector-reconnect, restore result partial.</span>
  <span class="receipt__kept" aria-hidden="true">YOUR PLACE IS KEPT</span>
  <span class="receipt__manifest" aria-hidden="true">
    <span><b>FILES</b><i>4</i></span>
    <span><b>TERMINALS</b><i>3</i></span>
    <span><b>BROWSER TABS</b><i>5</i></span>
    <span><b>BRANCH</b><i>FEAT/CONNECTOR-RECONNECT</i></span>
    <span><b>RESTORE RESULT</b><i>PARTIAL</i></span>
  </span>
  <span class="receipt__target" aria-hidden="true"></span>
  <span class="receipt__flap" aria-hidden="true"></span>
</button>
```

Follow the receipt with one compact footer navigation containing Setup, Privacy, GitHub repository, Release, Open VSX editor connector, and Report an issue. End with the exact metadata `v0.1.0 · MIT · Sammy Almuflahi`.

- [ ] **Step 5: Implement exact fold geometry and timing**

Use the same custom properties to derive clipping and origin:

```css
.receipt {
  --fold-size: 56px;
  --fold-half: 28px;
  --fold-progress: 0;
  position: relative;
  background: transparent;
  color: var(--petrol);
  overflow: visible;
}
.receipt::before {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--cool-field);
  clip-path: polygon(0 0, calc(100% - var(--fold-size)) 0, 100% var(--fold-size), 100% 100%, 0 100%);
}
.receipt__flap {
  position: absolute;
  inset: 0 0 auto auto;
  width: var(--fold-size);
  height: var(--fold-size);
  transform-origin: calc(100% - var(--fold-half)) var(--fold-half);
  transform: rotate3d(1, 1, 0, calc(-180deg * var(--fold-progress)));
  transition: transform 520ms var(--ease-out) 0ms;
  transform-style: preserve-3d;
}
.receipt__flap::before, .receipt__flap::after {
  content: "";
  position: absolute;
  inset: 0;
  clip-path: polygon(0 0, 100% 100%, 100% 0);
  backface-visibility: hidden;
}
.receipt__flap::before { background: var(--cool-field); }
.receipt__flap::after { background: var(--orange); transform: rotateY(180deg); }
.receipt__target {
  position: absolute;
  inset: 0 0 auto auto;
  width: var(--fold-size);
  height: var(--fold-size);
  background: var(--orange);
  clip-path: polygon(0 0, 100% 100%, 0 100%);
  opacity: 0;
  z-index: 1;
  transition: opacity 0ms linear 0ms;
}
.receipt__manifest, .receipt__kept { position: relative; z-index: 2; }
.receipt__flap { z-index: 3; }
.receipt:hover, .receipt:focus-visible, .receipt[data-folded="true"] { --fold-progress: 1; }
.receipt:hover .receipt__flap, .receipt:focus-visible .receipt__flap, .receipt[data-folded="true"] .receipt__flap { transition-delay: 100ms; }
.receipt:hover .receipt__target, .receipt:focus-visible .receipt__target, .receipt[data-folded="true"] .receipt__target { opacity: 1; transition-delay: 620ms; }
.receipt__kept { opacity: 0; transition: opacity 180ms var(--ease-out) 520ms; }
.receipt:hover .receipt__kept, .receipt:focus-visible .receipt__kept, .receipt[data-folded="true"] .receipt__kept { opacity: 1; transition-delay: 0ms; }

@media (max-width: 599px) {
  .receipt { --fold-size: 40px; --fold-half: 20px; }
}

@media (prefers-reduced-motion: reduce) {
  .receipt__flap { transition: none; transform: none; }
  .receipt__target, .receipt__kept { opacity: 1; }
}
```

The target triangle occupies the reflected point `(width−N,N)` and the orange flap underside must land fully inside the sheet. Reverse timing opens the flap before the message retracts.

Update `website/js/main.js` in this task to import `initReceiptFolds` from `./receipt-fold.js` and call `safely("receipt", initReceiptFolds)` after media initialization.

- [ ] **Step 6: Create deterministic fold-frame QA**

Create `tests/site/fixtures/receipt-fold.html` as a standalone page importing `/website/css/tokens.css`, `/website/css/shell.css`, and `/website/css/receipt-fold.css`. Read `?progress=0`, `.25`, `.5`, `.75`, or `1` and set that numeric value on `--fold-progress`; render the exact production receipt markup, not a second approximation.

Capture 0%, 25%, 50%, 75%, and 100%. Expected: the flap stays attached to the 45° hinge throughout, the final orange triangle lands at `(width−56,56)` on desktop, and no phase covers receipt text.

- [ ] **Step 7: Verify interaction variants**

Test hover, Shift+Tab/Tab focus, Space/Enter, touch/click, reverse motion, and reduced motion. Expected: visible focus, correct `aria-pressed`, no stuck state, no footer-link obstruction, and an immediately readable static receipt if JS fails.

- [ ] **Step 8: Run tests and commit**

```bash
node --test tests/site/receipt-fold.test.mjs
pnpm test:site
git add website/index.html website/css/receipt-fold.css website/css/shell.css website/js/receipt-fold.js tests/site
git commit -m "feat(site): add the return receipt signature"
```

### Task 7: Carry the new shell across Setup, Privacy, and 404

**Files:**
- Modify: `website/setup/index.html`
- Modify: `website/privacy/index.html`
- Modify: `website/404.html`
- Modify: `website/assets/brand/og-card.html`
- Regenerate: `website/assets/brand/og-cover.png`
- Modify: `website/css/doc.css`
- Modify: `website/css/shell.css`
- Modify: `tests/site/site-contract.test.mjs`

**Interfaces:**
- Consumes: shared navigation/footer/receipt, `initCopy`, and canonical route facts
- Produces: visually consistent document routes with no homepage media behavior

- [ ] **Step 1: Add failing route assertions**

```js
test("document routes keep detail but never load product media", async () => {
  const setup = await readRoute("/setup/");
  const privacy = await readRoute("/privacy/");
  const notFound = await readRoute("/404.html");
  assert.ok(setup.includes("3978ec57af7d37ab32670033d679c21a28cf74cebb0435ce011049e05635c655"));
  assert.ok(setup.includes("86M2X6MUA3"));
  assert.ok(privacy.includes("127.0.0.1"));
  for (const html of [setup, privacy, notFound]) {
    assert.doesNotMatch(html, /<video\b/);
    assert.match(html, /data-receipt-fold/);
  }
  assert.ok(notFound.includes("Home"));
  assert.ok(notFound.includes("Download"));
  assert.ok(notFound.includes("Setup"));
});
```

- [ ] **Step 2: Verify the route contract fails**

```bash
pnpm test:site
```

Expected: FAIL until all routes use the new shared footer receipt and 404 actions.

- [ ] **Step 3: Port the shell without rewriting factual prose**

Retain Setup and Privacy body copy verbatim. Replace their header/footer markup with the same shared nav, link list, receipt, and concise metadata used by the homepage. Restyle only document containers, markers, tables, code, notes, and headings in `doc.css`. Do not bring `landing.css`, video markup, Return Field, or homepage chapter layout into these routes.

- [ ] **Step 4: Finish 404 as a useful exit**

Keep one `h1` and provide visible Home, Download, and Setup actions. Use the same petrol shell and footer receipt; do not create a separate illustration or autoplay region.

- [ ] **Step 5: Align page metadata and the social preview**

Change the homepage title and Open Graph text to `Rabta — Pick up the task. Not the pieces.` and update `og-card.html` to the same headline, petrol/cool-field composition, orange fold, and `Workspace memory for macOS` descriptor. Regenerate the 1200×630 output from the existing source-of-truth script:

```bash
python3 scripts/generate-brand-assets.py
```

Expected: `website/assets/brand/og-cover.png` changes; generated logo/icon files remain byte-identical because the mark source did not change.

- [ ] **Step 6: Test JavaScript-off and clipboard failure**

Load all four routes with JavaScript disabled. Expected: complete content and posters; receipt readable and open; no dead media button. On Setup, deny clipboard permission and click Copy. Expected label/status: `Select it` and an instruction to select the checksum manually.

- [ ] **Step 7: Run tests and commit**

```bash
pnpm test:site
git add website/setup/index.html website/privacy/index.html website/404.html website/assets/brand/og-card.html website/assets/brand/og-cover.png website/css/doc.css website/css/shell.css tests/site/site-contract.test.mjs
git commit -m "style(site): unify the supporting routes"
```

### Task 8: Enforce media, link, and deployment integrity

**Files:**
- Create: `scripts/verify-media.mjs`
- Modify: `tests/site/site-contract.test.mjs`
- Modify: `.github/workflows/pages.yml`
- Modify: `website/assets/demos/manifest.json`

**Interfaces:**
- Consumes: committed demo files and manifest, all route HTML, and CI-provided `ffprobe`
- Produces: a deterministic pre-deploy failure for missing/bloated/wrong-codec/wrong-duration media or broken local assets

- [ ] **Step 1: Extend static integrity tests**

Add assertions that every `data-src-desktop` / `data-src-mobile` target exists, every link with `target="_blank"` includes `noopener`, all four routes have canonical titles and one `main`, the homepage has exactly two `data-product-media` regions, and no route references `website/__cap.html`.

- [ ] **Step 2: Write the media verifier**

`scripts/verify-media.mjs` must read `manifest.json`, locate `ffprobe` from `FFPROBE_BIN` or `PATH`, and run:

```bash
ffprobe -v error -show_streams -show_format -of json <asset>
```

For each manifest entry, assert:

- one video stream and zero audio streams;
- codec name `h264`;
- width and height equal the manifest;
- actual duration is within `±0.5s` for hero or `±0.4s` for honest return;
- desktop hero bytes ≤2,500,000;
- desktop honest-return bytes ≤1,500,000;
- each mobile file is ≤75% of its desktop pair;
- the corresponding poster exists and has nonzero bytes.

Exit nonzero with one line per violated asset. Exit nonzero with an install hint if `ffprobe` is unavailable; do not silently skip media validation.

- [ ] **Step 3: Verify a deliberate manifest failure**

Temporarily set hero duration to `1` in the working tree and run:

```bash
FFPROBE_BIN="$(command -v ffprobe)" node scripts/verify-media.mjs
```

Expected: FAIL naming `hero-return-desktop.m4v` and its duration mismatch. Restore the observed manifest value immediately with `apply_patch`.

- [ ] **Step 4: Replace the workflow’s shell-only checks**

Keep the CNAME guard, install `ffmpeg` on the Ubuntu runner, then run the shared checks:

```yaml
- name: Install media probe
  run: sudo apt-get update && sudo apt-get install -y ffmpeg

- name: Verify site contract
  run: node --test tests/site/*.test.mjs

- name: Verify product media
  run: node scripts/verify-media.mjs
```

The shared Node contract replaces the current piped `while` asset check so local and CI behavior cannot drift.

- [ ] **Step 5: Run integrity checks and commit**

```bash
pnpm test:site
pnpm verify:media
git add scripts/verify-media.mjs tests/site/site-contract.test.mjs .github/workflows/pages.yml website/assets/demos/manifest.json
git commit -m "ci(site): verify landing assets and product media"
```

### Task 9: Complete visual, accessibility, and release verification

**Files:**
- Modify if defects are found: `website/index.html`
- Modify if defects are found: `website/css/landing.css`
- Modify if defects are found: `website/css/shell.css`
- Modify if defects are found: `website/css/receipt-fold.css`
- Modify if defects are found: `website/js/media.js`
- Modify if defects are found: `website/js/receipt-fold.js`
- Modify if defects are found: document route files/CSS

**Interfaces:**
- Consumes: the complete implementation
- Produces: verified release-ready static site with captured review evidence

- [ ] **Step 1: Run the full automated suite**

```bash
pnpm test
pnpm build
pnpm verify:media
```

Expected: all package tests, site contracts, production builds, and media checks pass.

- [ ] **Step 2: Check every required viewport**

Serve `website/` locally and inspect `/`, `/setup/`, `/privacy/`, and `/404.html` at 320, 375, 390, 768, 1024, 1280, 1440, and 1920px widths. For each page, assert `document.documentElement.scrollWidth === document.documentElement.clientWidth`. Capture hero and footer screenshots at 1440×900 and 390×844.

- [ ] **Step 3: Check motion and fallbacks**

Verify normal autoplay, off-screen pause, lower lazy attachment, reduced motion, save data, autoplay rejection, invalid video URL, and JavaScript disabled. Expected: exactly one visible loop plays; every failure leaves complete copy/poster; no meaning depends on motion.

- [ ] **Step 4: Check the signature in Chromium and Safari**

Verify receipt states at 0%, 25%, 50%, 75%, and 100%, plus hover, visible keyboard focus, Space/Enter, touch, reverse, and reduced motion. Expected: no detached flap, no covered text, correct orange underside, and identical resting geometry in both engines.

- [ ] **Step 5: Check accessibility and truth**

Keyboard through skip link, nav, media buttons, download links, receipt, and footer. Confirm one `h1` per route, ordered headings, labeled landmarks, visible focus, WCAG AA contrast for every used pair, and the exact fixture/release strings. Confirm no fabricated social proof and `no Intel build` is visible before both homepage download actions.

- [ ] **Step 6: Review the two design checkpoints with the user**

Present desktop/mobile captures of:

1. hero copy plus Return Field with the final hero poster;
2. Return Receipt at rest and fully folded.

Apply only review changes that preserve the approved palette, architecture, truth, motion limits, and geometry contract.

- [ ] **Step 7: Re-run verification after any visual fixes**

```bash
pnpm test
pnpm build
pnpm verify:media
git diff --check
git status --short
```

Expected: every command passes; `website/__cap.html` remains the only pre-existing untracked probe unless the user separately asks to keep or remove it.

- [ ] **Step 8: Commit final polish**

```bash
git add website apps/desktop/capture scripts tests package.json .github/workflows/pages.yml
git commit -m "feat(site): finish the living instrument download experience"
```

Do not stage `website/__cap.html`. If Step 6 required no fixes, skip this empty commit.
