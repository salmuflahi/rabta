# Rabta download site — continuation handoff for Claude

You are continuing an in-progress redesign of the Rabta download site. Do not restart the design process, replace it with a generic SaaS page, or redesign the desktop app. The product direction is approved; the work below is the source of truth for continuing safely.

## What the owner wants

The old landing page felt technically competent but stale, dry, overly petrol, compact, and repetitive. The goal is a download site that makes a developer *want* Rabta while staying real about what it does and does not restore.

The intended quality bar borrows only the useful lessons from Linear, Superlist, Raycast, and CleanShot:

- Linear: one monumental promise and one product scene per chapter.
- Superlist: a continuous, authored color atmosphere rather than disconnected sections.
- Raycast: one unmistakable brand signature.
- CleanShot: product proof and download intent visible together.

Do **not** imitate their visual language or add generic startup proof. No gradients, neon, glass, fake testimonials, customer logos, ratings, download counts, invented features, or decorative bento grids.

## Approved concept: Living Instrument

Rabta is **workspace memory for macOS**. Its job is to preserve the working context around a task—files, terminals, browser tabs, and the Git branch—so a developer can return without rebuilding their setup.

The approved visual system is **Living Instrument**:

- Petrol is the world, not a repeated flat background.
- Cool tones make light, depth, and relief inside that world.
- Ivory is a single deliberate reset, not alternating section paint.
- Orange means action and the underside of Rabta's fold; it is not general decoration.
- The real product is shown large, directly beneath the hero copy.
- Two short, silent real-product loops give the page life.
- A physical **Return Receipt** and its folded corner become the brand signature.

The page should feel airy and intentional. Each viewport-height chapter should contain one dominant thought. It should feel shorter because repetition is removed, not because content is crammed together.

## Non-negotiable visual and product rules

### Palette

Only use these canonical hues (transparent versions using `rgba()` are fine when derived from them):

```css
--petrol: #102526;
--orange: #ff6b2c;
--ivory: #f3f0e8;
--cool-panel: #173239;
--cool-mid: #66858c;
--cool-soft: #a9bec2;
--cool-field: #d9e3e3;
```

### Type and shape

- Inter Variable is the only downloaded font. System monospace is reserved for machine-verifiable values.
- Hero is exactly 72px desktop, 46px tablet, 36px mobile, with `line-height: 0.98`.
- The top-right 45° fold belongs only to the Return Field, Return Receipt, and Rabta mark—not ordinary cards, buttons, or lists.
- Keep ordinary content unboxed. Use CSS Grid only where it expresses a genuine relationship.

### Truth and release facts

Never soften or hide the honest restore result:

- `Workspace partially restored`
- VS Code: `Restored`
- Chrome: `On next reload`
- Git: `Restored`

Facts that must remain exact:

- version `0.1.0`
- `5.5 MB`
- macOS 11+
- Apple Silicon only
- no Intel build
- signed and notarized
- no Rabta account, no Rabta server, no telemetry/analytics, no uploaded project code
- connectors use `127.0.0.1`; Chrome connector reads tab URLs and titles only

Detailed SHA-256, Team ID, manual install, and connector caveats stay on `/setup/`. Full privacy/lifecycle detail stays on `/privacy/`.

## Approved homepage narrative

1. Minimal petrol navigation: Rabta, How it works, Privacy, Setup, Download. Mobile keeps brand + Download; no drawer/hamburger.
2. Hero:
   - eyebrow: `Workspace memory for macOS`
   - headline: `Pick up the task. Not the pieces.` (the second line uses cool-mid, never orange)
   - supporting copy: Rabta remembers files, terminals, browser tabs, and Git branch around each task, then puts working context back when you return.
   - direct Download CTA and requirements: `Free · 5.5 MB · macOS 11+ · Apple Silicon · no Intel build`
3. **Return Field** immediately under the hero copy: a wide cool-field scene with the real hero loop; it is not a card or browser mockup. Quiet metadata follows.
4. Thesis: `A task is more than a folder. It is everything you had open around it.`
5. Attached pieces: one large composition, not four cards—Files, Terminals, Browser tabs, Git branch—plus one static product crop.
6. Honest return: real loop that ends visibly on `Workspace partially restored`.
7. Local means local: plain-language privacy explanation and a quiet connector-status line.
8. Download close: `Come back to the work. Not the setup.` with direct download and concise requirements/facts.
9. Footer: Return Receipt followed by compact links and `v0.1.0 · MIT · Sammy Almuflahi`.

## Current implementation state

Branch: `launch-site`  
Current HEAD: `ffa753b fix(site): gate hero autoplay by visibility`

The only intentionally untracked file is `website/__cap.html`. It belongs to the owner. **Never edit, stage, delete, or “clean up” that file.**

The working tree is otherwise clean at this checkpoint.

### Completed and reviewed work

| Task | Status | Key result |
|---|---|---|
| 0 | Complete | Existing site work checkpointed safely; `website/__cap.html` excluded. |
| 1 | Complete + reviewed | Static site contracts, canonical tokens, CSS responsibility split, no third-party subresources. |
| 2 | Complete + reviewed | Homepage rebuilt into the Living Instrument narrative, factual copy, Return Field, responsive baseline. |
| 3 | Complete + reviewed | Deterministic real-app capture director, four real silent H.264 videos, two posters, truthful manifest. |
| 4 | Complete + reviewed | Progressive, in-view-only product media with reduced-motion/save-data/autoplay-error fallbacks. |
| 5 | Not started | Finish page compositions and responsive rhythm. |
| 6 | Not started | Build the Return Receipt and exact Closing Fold. |
| 7 | Not started | Carry the new shell across Setup, Privacy, and 404. |
| 8 | Not started | Enforce media/link/deploy integrity in CI. |
| 9 | Not started | Full visual, accessibility, motion, and release QA. |

### Important completed commits

```text
ffa753b fix(site): gate hero autoplay by visibility
66b84c1 feat(site): add resilient product loops
58c771c fix(site): preserve exact mobile demo dimensions
ecd96b4 feat(site): record real product return loops
4a1cd82 fix(site): restore homepage design contracts
6b91e2f fix(site): enforce living instrument palette contract
4e228b4 feat(site): rebuild the living instrument narrative
887a4c1 test(site): lock living instrument foundation
891d6cc chore(site): checkpoint instrument redesign base
```

### Review fixes already made — do not regress them

- Removed stray colors and added contracts guarding the approved palette.
- Locked hero type to 72/46/36px at 0.98 line height.
- Corrected contrast for small metadata on petrol and ivory.
- Restored exact factual Release footer link.
- Recorded real media rather than simulated UI.
- Fixed mobile video exports from an accidental 168×300 output to exact 390×700 H.264.
- Media behavior has 12 focused tests and 25 site-contract tests at the last checkpoint.
- Explicitly guard hero autoplay so it cannot start while offscreen—even after its deferred two-animation-frame attachment.

## Media behavior that must remain intact

There are exactly two autoplay-capable product videos: hero (about 8 seconds) and honest return (about 5 seconds).

- Both are muted, inline, looped, poster-backed, and only autoplay while in view.
- No `<source>` appears in initial HTML. Sources are attached by JavaScript after policy checks.
- Reduced motion or Save Data must attach **no video source** until the visitor presses the local Play control.
- Manual Play is always permitted—even under reduced motion/data saver.
- Rejected autoplay exposes a local Play button.
- A video error leaves poster, caption, and prose intact; it disables the play control and never claims it is playing.
- Before playback, pause every other product video.
- Use mobile source below 600px. The mobile 390×700 assets must be displayed as deliberate portrait crops, not a shrunken desktop UI.
- JavaScript-off remains complete: posters, captions, and prose explain the product without motion.

## Remaining roadmap

### Task 5 — composition and responsive rhythm (next task)

Files: `website/css/landing.css`, `website/css/shell.css`, `website/index.html`, `tests/site/site-contract.test.mjs`.

1. Add/retain guards for exactly two videos, one `h1`, one static crop in `#pieces`, no radio screen switcher, and no checksum/Team ID on the homepage.
2. Finish wide compositions:
   - manifest beside the single attached-pieces crop above 900px;
   - copy beside the honest-return product stage above 900px;
   - product scenes near the full rail;
   - cool field only for the hero; cool panel for lower demo; ivory once for privacy reset.
3. Use this exact rhythm:

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

4. At <600px, use `aspect-ratio: 390 / 700`, `object-fit: cover`, and per-loop `object-position` so active task and restore sheet stay readable.
5. Inspect 1440×900, 1024×768, 768×1024, 390×844, and 320×800. Each should have no horizontal overflow, readable machine values, clean console, and one dominant chapter thought.
6. Run `pnpm test:site` and commit as `style(site): give the homepage depth and breathing room`.

### Task 6 — Return Receipt / Closing Fold signature

Files: add `website/js/receipt-fold.js`, receipt tests and fixture; modify homepage, `website/css/receipt-fold.css`, `website/css/shell.css`, and `website/js/main.js`.

- Use a native button with `data-receipt-fold`, `data-folded`, and real `aria-pressed`; Space/Enter/touch must work naturally.
- Receipt copy includes `YOUR PLACE IS KEPT`, files/terminals/browser tabs/branch/partial restore manifest, and accessible hidden summary.
- Desktop fold is `--fold-size: 56px`, `--fold-half: 28px`; mobile is 40px/20px.
- Flap rotates `rotate3d(1, 1, 0, -180deg)` around the mathematically correct `(width − half, half)` hinge.
- Timing: 520ms easing, 100ms flap delay; the orange underside lands inside the reflected target triangle without covering receipt text.
- Hover, focus-visible, persistent click/touch state, reverse motion, reduced motion, and JS-off all need validation.
- Capture deterministic 0/25/50/75/100% fold frames. The fold should become the site’s subtle, memorable signature—not a gimmick.

### Task 7 — supporting routes and social preview

- Keep Setup and Privacy factual prose verbatim. Restyle only their shell/document presentation.
- Setup, Privacy, and 404 receive the same nav/footer/receipt but never homepage media, Return Field, or chapter layout.
- 404 has one `h1` plus visible Home, Download, and Setup actions.
- Homepage title/OG text: `Rabta — Pick up the task. Not the pieces.`
- Update `website/assets/brand/og-card.html`, then regenerate the 1200×630 `og-cover.png` with the existing brand script. Use petrol/cool-field/orange-fold composition and `Workspace memory for macOS`.
- Verify every route with JavaScript off; on Setup, verify checksum-copy failure gives a usable manual-select instruction.

### Task 8 — integrity and CI

- Add `scripts/verify-media.mjs` using `ffprobe` (from `FFPROBE_BIN` or PATH).
- Assert H.264, one video / zero audio, exact manifest dimensions, duration tolerance, desktop/mobile byte budgets, and non-empty posters.
- Extend site contracts: all media sources exist, blank-target links use `noopener`, each route has canonical title and one `main`, exactly two homepage media regions, and no reference to `website/__cap.html`.
- Update `.github/workflows/pages.yml` to install ffmpeg, run all site tests, then media verification.
- Deliberately prove verifier failure with a temporary wrong manifest duration, then restore observed values immediately.

### Task 9 — final release verification

- Run `pnpm test`, `pnpm build`, and `pnpm verify:media`.
- Inspect `/`, `/setup/`, `/privacy/`, `/404.html` at 320, 375, 390, 768, 1024, 1280, 1440, and 1920px; assert no horizontal overflow on each.
- Verify normal autoplay, offscreen pause, lazy lower attachment, reduced motion, Save Data, rejected play, invalid source, and JS-disabled behavior.
- Validate receipt at 0/25/50/75/100%, hover/focus/keyboard/touch/reverse/reduced motion in Chromium and Safari.
- Confirm keyboard flow, landmarks, heading order, focus visibility, AA contrast, exact truth strings, and no fabricated social proof.
- Present the owner two checkpoints before final polish: hero + Return Field at desktop/mobile, then Return Receipt at rest/fully folded.
- Re-run all verification after any visual fixes. Do not commit `website/__cap.html`.

## Process and verification discipline

- Follow the implementation plan at `docs/superpowers/plans/2026-08-01-rabta-living-instrument-download-site.md` literally for detailed task commands and acceptance criteria.
- Design source: `docs/superpowers/specs/2026-08-01-rabta-living-instrument-download-site-design.md`.
- Task status/review record: `.superpowers/sdd/2026-08-01-rabta-living-instrument-download-site/ledger.md`.
- Preserve the hand-authored HTML/CSS/ES module architecture; do not introduce a framework, bundler, analytics, embeds, or third-party subresources.
- Start each remaining task with a focused test/contract where the plan calls for it. Run focused tests during iteration and the full relevant suite before each commit.
- Before claiming a task done, perform real browser checks, inspect console state, and verify responsive overflow rather than only trusting code.
- Keep commits task-focused; never sweep unrelated files into a commit.

## First action for continuation

Begin at **Task 5**. Do a quick read-only status check first:

```bash
git branch --show-current
git log -1 --oneline
git status --short
pnpm test:site
```

Expected: branch `launch-site`, HEAD `ffa753b`, and only `?? website/__cap.html` in status. Then continue Task 5 exactly as above and in the approved plan.

