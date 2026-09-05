# Rabta, the brand: site and app redesign

**Status:** design spec, 2026-09-03. Written to be built from, and to double as the brand's own "why" document. The `/brand/` page on the site is this document in public.

**Supersedes:** the Living Instrument site system (`docs/site-design-plan.md`, petrol, the fold, the receipt), the Console v2 app palette, and every earlier mark. None of it carries forward. This is a new identity built around the one thing that already worked in the marketing videos: the `r`.

---

## 1. Why

### 1.1 The name

Rabta is رابطة: a bond, a link, the thing that ties things together. The product is exactly that. Your editor, your terminal, your browser and git each remember their own piece of a task; none of them remembers the arrangement. Rabta is the bond between them, so a task can be put down and picked up whole.

### 1.2 The mark: an R that is also a ر

The mark is a capital R whose leg is not a diagonal. It is the Arabic ر of رابطة, drawn as a descender that sweeps out and curls back left. Two alphabets, one glyph, three strokes.

The three strokes are the product:

1. **The stem.** You start a task. Something comes down to rest.
2. **The bowl.** You capture. The loop closes around what is open.
3. **The leg.** You leave, and you come back. The stroke goes out and returns.

That third stroke is the brand. It is the one that gets the colour, it is the shape the motion system is built from, and it is what the animations draw last.

### 1.3 What the brand has to say without words

- **It is quiet until it moves.** Paper, ink, a lot of air. Then one ember. The calm is the point: the product exists to remove noise.
- **It is local.** No cloud imagery, no networks-of-dots, no globes. The Mac is the whole world.
- **It is honest.** Every number on the site is a real number from the shipped build. Every screenshot is the real app. If a demo shows a partial restore, the site says "partial".
- **It does not sell.** The product is shown, flat, in a window, the way it looks on your own machine. Nothing is tilted in perspective.

---

## 2. Palette: paper, ink, one ember

Petrol is gone, on every surface, in every file. Both worlds are neutral with a cool cast (hue ~225°). The site is ink first: `ink-0` is the canvas, and paper appears as an alternate (`.paper`) for one bento cell, one brand specimen and the paper lockup. Footage of the dark app therefore sits in its own world, the way it does in Raylight's and Linear's product pages, and the ember reads as the only warm thing on the page.

| Token | Value | Use |
| --- | --- | --- |
| `paper-0` | `#FFFFFF` | site canvas, app light canvas |
| `paper-1` | `#F5F5F7` | alternate bands, app light sidebar |
| `paper-2` | `#EAEAEE` | fields, hairline-strong on paper |
| `ink-0` | `#0A0B0E` | night canvas, app dark sidebar |
| `ink-1` | `#14161B` | night raised, app dark canvas |
| `ink-2` | `#1E2128` | night hover, fields on ink |
| `text` (on paper) | `#0E0F12` | body and display |
| `text-mute` (on paper) | `#4A4D57` | secondary, 7.9:1 |
| `text-faint` (on paper) | `#6F7380` | metadata, 4.6:1 |
| `text` (on ink) | `#F5F5F7` | body and display |
| `text-mute` (on ink) | `#B4B8C2` | secondary |
| `text-faint` (on ink) | `#7C808B` | metadata, 4.9:1 on ink-0 |
| `ember` | `#FF6B2C` | the accent, the leg, the one CTA |
| `ember-deep` | `#C2501B` | ember as small text on paper, 4.6:1 |
| `ember-glow` | `rgba(255,107,44,α)` | the bloom under a live thing |

Hairlines: `rgba(14,15,18,.08)` on paper, `rgba(245,245,247,.08)` on ink. Never a solid grey line.

Rules:

- **One ember per view.** A page or app screen spends the accent once: the primary action, or the live thing. Never both.
- **Ember is never text under 24px on paper.** Use `ember-deep`.
- **No third hue.** Status uses the app's ok/warn/bad set inside the app only; the site never shows a green or a red except macOS's own traffic lights on a window frame.

---

## 3. Type

**Inter 4, variable, with optical sizing.** Self-hosted, latin subset, `wght` 400–700 and `opsz` 14–32. The browser picks the Display cut above ~20px on its own (`font-optical-sizing: auto`), which is what makes big Inter read like a display face rather than a stretched UI font. This is the wordmark's face, so the brand and the copy are set in one family.

Scale (px) and tracking, fluid between the two ends:

| Role | Size | Weight | Leading | Tracking |
| --- | --- | --- | --- | --- |
| display | 72–120 | 600 | 0.94 | -0.045em |
| h1 inner | 48–64 | 600 | 1.0 | -0.04em |
| h2 | 34–44 | 600 | 1.06 | -0.03em |
| h3 | 22–26 | 560 | 1.2 | -0.02em |
| lede | 19–22 | 400 | 1.45 | -0.012em |
| body | 17 | 400 | 1.55 | -0.011em |
| small | 15 | 400 | 1.5 | 0 |
| caption | 13 | 500 | 1.4 | 0 |
| mono | 13 | 400 | 1.5 | 0 |

Mono is the system stack (SF Mono on a Mac). It is reserved for things a reader can check: hashes, paths, branch names, commands. Never for labels, never as decoration.

No serif anywhere. No uppercase-tracked eyebrows as a habit: at most one per three sections, and only where a section genuinely needs to be named.

---

## 4. The mark and the lockup

Source geometry (`site/public/assets/brand/mark.svg`, currentColor):

```
viewBox 0 0 100 100, translate(4.5,-5), stroke 12, round joins
stem  M25 22V84
bowl  M25 28H46a16 16 0 0 1 0 32H25
leg   M44 60c14 4 22 10 22 16 0 5-6 8-13 6
```

Colourways:

- **Two-tone (default on paper and ink):** stem and bowl in the text colour, leg in ember. This is the lockup, the nav, the sidebar, the hero.
- **Tile (icon):** ember squircle, ink glyph at 64% of the tile. Dock icon, favicon, social avatar, the app's `rabta-mark.svg`. Monochrome, because it has to survive 16px.
- **Mono:** whole glyph in one colour, for embossing, watermarks and any place two colours are not available.

Lockup: glyph at 1.25em of the wordmark size, then `abta` in Inter 560 with -0.02em tracking, baselines aligned, gap 0.12em. The wordmark is shipped as outlines (`lockup.svg`) so it never depends on a font being loaded. Clear space around the lockup is one glyph-stem width. Minimum sizes: lockup 22px tall, tile 16px.

Never: outline the mark, rotate it, put it in a circle, add a drop shadow, or render the leg in anything but ember or the mark's own colour.

---

## 5. Motion: "the return"

One vocabulary for the site and the app.

- **Ease:** `cubic-bezier(0.16, 1, 0.3, 1)` for everything that settles. A spring (`stiffness 260, damping 18`) only for a landed moment: the mark's last stroke, a restore completing.
- **Durations:** hover 120ms, state 240ms, reveal 480ms, ceremony 900ms. The mark draws itself in 1100ms, in stroke order: stem 420ms, bowl 560ms from 180ms, leg 640ms from 560ms, then the spring.
- **The rule of the leg.** Anything that "comes back" moves the way the leg does: out, then a curl back to rest. Practically: a window returns by rising 24px and scaling from 0.96; a headline rises from behind its own baseline; a sheet enters from below with the spring.
- **Scroll is a timeline, not a trigger.** The homepage's product sequence is pinned and scrubbed; theme dips are scrubbed; parallax on the hero window is scrubbed and never more than 24px. Nothing fires once and disappears if the reader scrolls back.
- **Reduced motion** collapses everything to opacity. The mark renders already drawn. The scrubbed sequence becomes three stills in a row.
- **Libraries.** Anime.js v4 on the site (vendored, no third-party origin; timelines, SVG draw, scroll sync, text splitting). Motion (`motion/react`) in the app (layout springs, presence, the mark's `pathLength`). No hand-rolled requestAnimationFrame loops anywhere.

---

## 6. The site

Nine routes. Hand-written HTML, layered CSS, ES modules, zero third-party requests, the same CSP. The shell (nav and footer) is generated from `website/_chrome/` as before.

| Route | Job | Layout family |
| --- | --- | --- |
| `/` | get a macOS developer to download 0.1.0 | see 6.1 |
| `/why/` | the argument, the name, the commitments | manifesto: big statements, one window |
| `/brand/` | the mark, its story, colourways, downloads | gallery: living mark, specimens |
| `/setup/` | install, verify, connect | document with a sticky index |
| `/faq/` | the questions | question groups |
| `/roadmap/` | what is next, no dates | stage cards |
| `/changelog/` | what shipped | release cards |
| `/contact/` | reach a human | channel cards |
| `/privacy/` | what is stored, what never is | document with a sticky index |

Nav: Why · Product · Setup · FAQ · Changelog · Contact, then one Download button. Footer: four columns plus Brand and Privacy, the socials with `rel="me"`.

### 6.1 Home

1. **Hero (ink).** The mark draws itself once per session and settles into the lockup; the headline rises under it: "Pick up the task. Not the pieces." One sentence, two buttons (Download for macOS, See it work). Under them, the real app in a Mac window playing the hero loop (capture, leave, return in one 8.5s take), with a scrubbed 24px parallax.
2. **Works with.** One marquee of the ten apps a connector actually speaks to. The only marquee on the site.
3. **Three moves (pinned).** Capture, leave, return. A sticky stage holds the app window while the reader scrolls three beats; each beat has its own loop and its own line, and only the current beat's loop plays. Scrubbed, reversible.
4. **What a capsule holds.** Bento of four: files, terminals, tabs, the branch. Each cell plays its own loop of the real app with the lens on the thing the cell is about, one ember cell, one paper cell. Every loop has a pause control.
5. **Focus mode.** Split: the argument left, the working switch and its receipt right. The one stateful control on the page; ships on.
6. **Local: "There is no server."** The chapter is framed by hairlines on the same ink, with the big mark drawing itself and an ember glow behind it. The four guarantees, stated flat. The mark's ember is the only light.
7. **Close.** "Stop rebuilding the same workspace." Download, size, floor, licence, all real.

#### The loops

Nothing premade. Every loop is footage of the real app (the capture rig's frozen fixture, recorded frame by frame) placed under a camera and a lens, the grammar Raylight uses for its own product videos:

- **The lens.** A rounded rectangle of the frame stays sharp; everything outside it blurs (`blur(7px)`) and dims to half. It tells the eye what to look at before the copy does.
- **The camera.** A punch-in of 1.14 to 1.30 toward the lens, with a 3px drift while it holds, then a return to the open frame. Camera and lens move together on the brand ease.
- **The seam.** Every loop dips to ink for 300ms at its start and end, so looping never jumps.

| Loop | Footage | Beats |
| --- | --- | --- |
| `hero-return` (8.5s) | capture, leave, return | lens on the capsule's cards, on the resume row, on the restore sheet |
| `move-capture` (4s) | the Save State click | lens on "What's inside" |
| `move-leave` (4s) | switching to Overview | lens on the resume row |
| `move-return` (5.5s) | the restore sheet | lens on the sheet |
| `cell-files`, `cell-terminals`, `cell-tabs`, `cell-branch` (4s) | stills of the app | lens on the card, the counts, the tabs list, the branch row |

Copy stays factual and pinned by tests: no Intel build, macOS 11+, 5.5 MB, MIT, signed and notarized.

### 6.2 What is removed

The receipt fold, the cut sweep, the chapter marks, the contribution heatmap (illustrative data is a lie by another name), the petrol glows, every em-dash.

---

## 7. The app

Same palette, same mark, same motion, on the desktop app's existing structure. Tokens change; screens keep their layouts and gain the new primitives.

- **Themes.** Light: paper canvas, white cards, paper-1 sidebar. Dark: ink-1 canvas, ink-2 cards, ink-0 sidebar. The dark sidebar is darker than the canvas, the canvas darker than a card (the existing tests keep pinning this).
- **Accents.** Tangerine (default, the ember), Iris, Graphite, Sky. Petrol and Sand are retired; a persisted preference naming either migrates to Tangerine on read.
- **Motion tokens.** `DUR` fast 100 / standard 160 / sidebar 280 / switch 150 / sheet 260. `EASE` brand `(0.16,1,0.3,1)`, standard = brand, mac `(0.32,0.72,0,1)`. Motion for React drives presence, the sidebar's selection pill (a layout spring), and the mark.
- **The mark in the app.** `AnimatedMark`: `static`, `draw` (stroke order, 1100ms), `complete` (the leg turns ember with the spring). Sidebar brand row shows the lockup. Overview's hero card and the Restore sheet's header use the tile. The Restore sheet draws the mark while restoring and completes it on success.
- **Restore ceremony.** Sheet springs up from 12px below; rows stagger at 30ms; on success the leg completes and an ember bloom fades under the header; hold 700ms; close.
- **Chrome.** Toolbar and status bar keep their geometry; hairlines at 0.5px; radii 8 (controls), 12 (cards), 16 (sheets).
- **Icon.** The tile, regenerated from `rabta-mark.svg` by `scripts/generate-brand-assets.py`, which now parses stroke geometry rather than fills.

---

## 8. Assets and pipeline

- `site/public/assets/brand/mark.svg` (currentColor source), `rabta-mark.svg` (tile), `lockup.svg` (outlined wordmark), `favicon.svg`, PNG favicons, app icons, connector icons, `og-cover.png`: all regenerated by the script from the two SVG sources.
- `site/public/assets/fonts/inter-var.woff2`: Inter 4 subset with both axes.
- Product shots: recaptured from the redesigned app by `apps/desktop/capture/capture.mjs`, then `scripts/optimize-shots.py`.
- Footage: `apps/desktop/capture/record-frames.mjs <demo>` drives a directed demo of the real app in headless Chrome with virtual time paused and advanced 1/30s per frame, screenshotting each frame at 2x, so the mark's draw, the sheet's spring and the rows' stagger land on exact frames. No screen-recording permission, no dropped frames. Output: `marketing-videos/site-demos/_recordings/<demo>-1280x800.mp4` (2560x1600).
- Loops: `marketing-videos/site-demos/build-projects.mjs` writes one HyperFrames project per loop (camera, lens and veil as one GSAP timeline over two plates of the same footage); each project must pass `hyperframes check` before `hyperframes render --quality high`.
- Site media: `scripts/build-site-media.mjs` encodes every render into `site/public/assets/demos/<loop>-desktop.mp4` (1920x1200), `<loop>-mobile.mp4` (720x450) and a poster, and writes `manifest.json` (schema 2). `scripts/verify-media.mjs` audits the manifest against the files and the budgets in its `TARGETS`.

---

## 9. Testing

`tests/site/` keeps every fact-based guard (signing status, registries, network-call claims, metadata, CSP, dead links, media manifest) and replaces every guard that described the old design with one that describes this one: the palette tokens, the mark on every route, the nine routes, zero em-dashes in visible copy, reduced-motion coverage in every module that animates, the home narrative, and the eight loops (silent, inline, no preload, no autoplay attribute, sources attached at runtime, a poster and a desktop and mobile file each, all on disk). The app's vitest suite is updated where it pinned the old accent table, tokens and motion constants, and the happy-dom storage shim restores the forty tests that were failing before this work began.

---

## 10. Out of scope

Localisation, a CMS or framework, an Intel build, and any change to the hub, connectors or capsule format.

---

## Amendment, 4 September 2026: the second round

The first round shipped the brand. The second round, after review against Raylight's product pages, changes these decisions. Where this amendment and the sections above disagree, this amendment wins.

- **Stack.** The site is an Astro 7 project in `site/`, built to static HTML for GitHub Pages, with the same strict policy: Astro's `security.csp` hashes what it inlines, stylesheets are never inlined, and no page carries an inline style or script. GSAP 3.15 (core, ScrollTrigger, DrawSVG, SplitText) replaces Anime.js. Page transitions are the browser's own cross-document view transitions; there is no client router.
- **Perspective.** §1.3 said nothing is tilted. The hero window may rest leaned into the frame and settles flat as the reader scrolls, so it ends up looking exactly as it does on a Mac. The loops use resting tilt, committed push-ins, whip pans and rack focus, per the shot grammar in `marketing-videos/site-demos/build-projects.mjs`.
- **The thread.** رابطة is the tie. One ember line runs down the homepage, drawn by the reader's scrolling, touching the window, the three moves, the capsule, the receipt, the switch and the terminal, and ends where the mark's leg begins in the "no server" chapter. It is the site's signature; everything else stays quiet.
- **Type.** Inter stays the body and display face. Reem Kufi is added for the name only, where the name is the subject. Geist Mono is added for what is checkable: receipts, terminals, code, hashes, paths. Both are subset by `scripts/fonts/subset.sh` and shipped beside their licences.
- **The line.** "Pick up the task. Not the pieces." is retired everywhere. The claim is "Leave the task. Return to all of it." The title is "Rabta: leave the task, return to all of it", without a dash.
- **Home.** Ten chapters: hero, works with, three moves, capsule anatomy, the receipt (tried against three cases in the app's own words), focus mode, for agents, local, where this goes, close. No eyebrow labels anywhere on the site.
- **Routes.** Eleven: `/capsules/` (how it works) and `/agents/` (the MCP server) join the nine. The nav is Why, Product, Capsules, Agents, Setup, FAQ, plus Download; Changelog, Contact and Brand live in the compact menu and the footer. `/roadmap/` is titled "Where this goes."
- **No counting.** A first-party visitor counter was built and then dropped the same day, on the owner's call: the site makes no request beyond its own files, and the privacy page's promise stays the simple one.
- **Agents.** `packages/mcp` is a read-only MCP server over the app's database. Capture and restore from an agent are planned, through an opt-in local socket in the app, and the site says so as roadmap.
