# Rabta download site — Living Instrument design

**Date:** 1 August 2026

**Status:** approved design; implementation not started

**Scope:** `website/` only; the desktop app may adopt this system later, but app changes are explicitly out of scope
**Supersedes:** `docs/site-design-plan.md` for the homepage direction, palette rules, motion rules, information architecture, and footer. Existing factual requirements and verified release data remain authoritative unless this document changes them explicitly.

## 1. Outcome

The site has one job: make a macOS developer understand Rabta, trust it, and want to download it.

The current site is competent but reads like a 9,846px technical specification. It uses one dark environment, identical section rhythm, static screenshots, repeated evidence, and almost no motion. Its rigor becomes monotony. The redesign keeps Rabta honest and developer-specific while giving the product an authored visual world and a signature interaction.

The approved direction is **Living Instrument**:

- Petrol remains the primary environment.
- Ivory and the new cool palette create light, depth, and relief.
- Orange marks action and the physical fold.
- The real product is shown at architectural scale.
- Two short, silent product loops provide the page's life.
- Rabta's fold and the act of returning context become the brand signature.

Success means a visitor can answer these questions from the first screen:

1. What is Rabta? Workspace memory for macOS.
2. What does it do? It keeps the files, terminals, tabs, and Git branch around a task and restores them later.
3. Can I trust it? It is local, direct about its limitations, signed, notarized, and checkable.
4. Can I get it now? Yes: a direct macOS download with requirements visible before the click.

## 2. Reference study and what Rabta borrows

The live homepages of [Linear](https://linear.app/), [Superlist](https://www.superlist.com/), [Raycast](https://www.raycast.com/), and [CleanShot X](https://www.cleanshot.com/) were reviewed visually on 1 August 2026.

The transferable lessons are:

- **Linear — monument:** one promise and one enormous product scene per chapter. Space makes the interface feel important.
- **Superlist — atmosphere:** color behaves as a continuous world behind the content rather than a sequence of unrelated section backgrounds.
- **Raycast — signature:** one unmistakable visual motif owns the first impression before feature explanation begins.
- **CleanShot — proof:** the benefit, buying action, and literal product demonstration coexist above the fold.

Rabta borrows their scale, atmosphere, singularity, and direct proof. It does not borrow Linear's decimal chapter system, Superlist's gradients and social proof, Raycast's abstract 3D art, CleanShot's testimonial-led conversion, or any competitor's component geometry.

## 3. The signature scene — The Return Field

The page's primary visual idea is **The Return Field**.

Directly beneath the hero copy, a wide cool field holds a real Rabta product loop. The field uses the mark's top-right fold at page scale. The loop shows one task being captured, left, and restored. The field is not a card, browser mockup, or device frame. It is the visual environment around the real app.

The Return Field combines four things in one composition:

- the product interface;
- the capture → leave → return narrative;
- Rabta's fold geometry;
- the cool palette as light inside the petrol world.

The page does not repeat the Return Field shape on ordinary panels. The large fold is reserved for the hero scene and the footer receipt.

## 4. Visual system

### 4.1 Color

```css
--petrol:     #102526;
--orange:     #ff6b2c;
--ivory:      #f3f0e8;

--cool-panel: #173239;
--cool-mid:   #66858c;
--cool-soft:  #a9bec2;
--cool-field: #d9e3e3;
```

Usage:

- **Petrol** is the page world: navigation, hero, major pauses, and final footer.
- **Cool panel** provides depth for product stages and secondary dark surfaces.
- **Cool mid** is technical metadata and low-emphasis text.
- **Cool soft** is readable supporting copy on petrol.
- **Cool field** is the primary light field behind product imagery and the receipt.
- **Ivory** is used for major text and one deliberate light reset, not as a repeating alternating-section background.
- **Orange** is used for direct actions, active playback markers, and the fold underside. It is not a general link color or decorative wash.

The cool colors must feel like light moving through petrol, not four arbitrary website section colors. No generic purple/blue SaaS gradients, neon glows, glass panels, or mesh backgrounds.

### 4.2 Type

Inter Variable remains the only downloaded face. System monospace remains reserved for machine-verifiable values.

- Hero: 72px desktop, 46px tablet, 36px mobile; tight tracking and 0.98 line height.
- Major statements: 48–60px desktop.
- Chapter headings: 34–44px desktop.
- Body: 17–20px with relaxed 1.5–1.6 leading.
- Metadata: 12–13px monospace or 13–15px sans.

The design uses fewer type blocks at larger scale. It does not compensate for empty space by adding labels.

### 4.3 Space and composition

- One idea should dominate each viewport-height chapter.
- Product scenes are wide and monumental, not nested inside small cards.
- Section spacing follows the composition instead of one universal value: 96–160px desktop, 72–112px tablet, and 56–88px mobile. Each section chooses one value from its range in the implementation plan and uses it consistently across its top and bottom edge unless the visual deliberately bleeds into the next section.
- Text measures remain narrow enough to read in one pass.
- Full-width visuals appear directly beneath their related headline instead of beside a dense grid of proof.
- The page should feel shorter because repetition is removed, not because content is compressed.

### 4.4 Shape

The top-right 45° fold remains Rabta's unique geometry.

It appears structurally in:

1. The Return Field.
2. The footer task receipt.
3. The Rabta mark itself.

Ordinary buttons, fact rows, document panels, and footer link groups are not folded.

## 5. Approved homepage architecture and copy

### 5.1 Navigation

Minimal sticky navigation on petrol:

- Rabta mark and wordmark.
- `How it works` → the thesis/product chapters.
- `Privacy` → `/privacy/`.
- `Setup` → `/setup/`.
- Primary `Download` action.

The mobile navigation keeps only the brand and Download action. Setup and Privacy remain available in the footer; there is no hamburger or drawer for a page with one primary action.

### 5.2 Hero

**Eyebrow**

> Workspace memory for macOS

**Headline**

> Pick up the task.
>
> Not the pieces.

The second line uses `--cool-mid`, not orange.

**Supporting copy**

> Rabta remembers the files, terminals, browser tabs and Git branch around each task—then puts that working context back when you return.

**Primary action**

> Download for macOS

**Requirement line**

> Free · 5.5 MB · macOS 11+ · Apple Silicon · no Intel build

The Return Field follows the hero copy directly. Beneath it, one quiet metadata row carries:

- `0.1.0 · signed + notarized`
- `no account · nothing uploaded`
- `macOS 11+ · no Intel build`

### 5.3 Thesis pause

**Statement**

> A task is more than a folder.
>
> It is everything you had open around it.

The second sentence uses `--cool-mid`. Supporting copy explains that Rabta keeps those pieces attached to the task so changing direction does not require reconstructing the workspace later.

### 5.4 What stays attached

**Heading**

> The pieces you usually reconstruct by hand.

The section presents four real items as one large composition, not four feature cards:

- Files — `4 open · cursor positions kept`
- Terminals — `3 sessions · working directories kept`
- Browser tabs — `5 URLs + titles · no page content`
- Git branch — `feat/connector-reconnect · restored first`

One static product crop accompanies the composition. It uses the real fixture and is not another autoplay region.

### 5.5 Honest return

**Heading**

> The return, shown honestly.

The second product loop shows the real restore ceremony and deliberately ends on:

> Workspace partially restored

The visible result remains:

- VS Code — Restored
- Chrome — On next reload
- Git — Restored

The partial state is a trust moment, not a caveat hidden in a fact table.

### 5.6 Local means local

**Heading**

> Local is not a privacy setting.

The section explains, in plain language:

- no Rabta account;
- no Rabta server;
- no telemetry or analytics;
- no uploaded project code;
- connectors use `127.0.0.1`;
- the Chrome connector reads tab URLs and titles only.

Connector availability appears as one quiet line: the editor connector is published on Open VSX; the browser connector is still in review. Detailed installation and capability information remains on `/setup/` and `/privacy/`.

### 5.7 Download

**Heading**

> Come back to the work.
>
> Not the setup.

The section includes:

- direct `.dmg` download;
- version `0.1.0`;
- `5.5 MB`;
- macOS 11+;
- Apple Silicon only;
- no Intel build;
- signed and notarized;
- links to Setup, GitHub release, and source.

The complete checksum, Team ID, and manual installation details move to `/setup/`. The homepage remains verifiable without behaving like an integrity report.

### 5.8 Footer and signature

The footer carries the modest route and project links expected of the product:

- Setup
- Privacy
- GitHub repository
- Release
- Open VSX editor connector
- Report an issue

Metadata remains concise: `v0.1.0 · MIT · Sammy Almuflahi`.

The signature combines the previously approved **Return Receipt** with the corrected **Closing Fold**:

1. Resting state: a large cool-field receipt showing the real task manifest.
2. Hover/focus/touch engagement: `YOUR PLACE IS KEPT` reveals.
3. The top-right receipt corner folds inward along its exact 45° hinge.
4. The orange underside lands inside the sheet and the receipt remains readable.
5. On disengagement, the fold reverses and the receipt returns to rest.

The receipt contains:

```text
FILES           4
TERMINALS       3
BROWSER TABS    5
BRANCH          FEAT/CONNECTOR-RECONNECT
RESTORE RESULT  PARTIAL
```

It is the final gesture of the site: the page leaves a receipt and folds it closed.

## 6. Motion system

### 6.1 Hero loop

Duration target: 8.0 seconds ±0.5 seconds, silent, autoplay, looping.

Storyboard:

1. `00:00–00:02` — Capture the real task `Wire the connector SDK reconnect`.
2. `00:02–00:04` — Leave it; the active task changes with one quiet cut.
3. `00:04–00:08` — Return; the real restore sheet resolves to the partial state.

The recording uses the shipped React interface against the frozen capture fixture. It does not recreate the UI in homepage HTML.

### 6.2 Honest-return loop

Duration target: 5.0 seconds ±0.4 seconds, silent, autoplay, looping.

Storyboard:

1. `00:00–00:01` — Resume the saved capsule.
2. `00:01–00:03` — The existing restore ceremony runs.
3. `00:03–00:05` — The partial result remains legible before reset.

### 6.3 Playback behavior

- Only these two videos autoplay.
- Videos are `muted`, `playsinline`, and have explicit posters.
- The hero loop starts automatically after the poster paints and the video reaches `canplay`, provided reduced-motion and data-saver modes are off.
- The lower loop loads near the viewport and plays only when visible.
- When the lower loop plays, the hero loop is off-screen and paused.
- No scroll scrubbing, parallax, entrance choreography, autoplay tabs, or background particles.
- A mobile-specific crop follows the active task and restore sheet instead of shrinking the whole desktop UI.

### 6.4 Reduced motion and failure

- Reduced motion shows the complete final poster and a manual Play demo control.
- Data-saver mode does not fetch autoplay video.
- If autoplay is blocked, the poster and manual Play control remain.
- If video loading fails, the poster and adjacent copy remain complete.
- With JavaScript disabled, both poster images and captions remain correct.
- No meaning exists only inside motion.

## 7. Footer fold geometry

For a receipt corner of size `N`:

- outer flap points: `(width−N, 0)`, `(width, N)`, `(width, 0)`;
- hinge midpoint: `(width−N/2, N/2)`;
- hinge direction: `(1, 1, 0)`;
- final reflected point: `(width−N, N)`.

The approved desktop receipt uses `--fold-size: 56px` and `--fold-half: 28px`. The moving flap uses:

```css
transform-origin: calc(100% - var(--fold-half)) var(--fold-half);
transform: rotate3d(1, 1, 0, -180deg);
```

The implementation must derive the clipping polygons and target from `--fold-size`, use `--fold-half` for the origin, and include a geometry test asserting that `--fold-half` is exactly half of `--fold-size`. Below 600px, the receipt uses the locked pair `--fold-size: 40px` and `--fold-half: 20px`.

Approved motion:

1. `YOUR PLACE IS KEPT` begins revealing over 180ms.
2. The fold begins 100ms later.
3. The flap rotates over 520ms using `cubic-bezier(0.22, 1, 0.36, 1)`.
4. The reverse transition opens the receipt before retracting the message.

Reduced motion removes the 3D transform and reveals the orange target plus message instantly.

## 8. Technical architecture

The website remains hand-authored static HTML/CSS/JS with no runtime framework or build step.

Required responsibility boundaries:

- `css/tokens.css` — expanded palette, type, spacing, and motion tokens.
- `css/shell.css` — reset, shared layout, navigation, footer, accessibility.
- `css/landing.css` — homepage compositions and responsive behavior.
- `css/receipt-fold.css` — isolated geometry-driven footer signature.
- `css/doc.css` — Setup, Privacy, and 404 document layouts.
- `js/main.js` — boot and small feature initialization.
- `js/media.js` — video source selection, viewport playback, failure and data-saver handling.
- `js/receipt-fold.js` — touch/click toggle and accessible state; hover/focus remain CSS-driven.

Existing filenames may be retained only when they already express the same responsibility boundary. Responsibilities may not be tangled back into a single large site file.

### 8.1 Product capture flow

```text
apps/desktop/capture/seed.ts
        ↓
real React app + mocked Tauri bridge
        ↓
deterministic demo director
        ↓
desktop/mobile video loops + poster frames
        ↓
homepage <video> + written manifest/captions
```

The recording pipeline must use the same fixture as existing screenshots. Site copy and video content must agree exactly.

## 9. Responsive behavior

### Desktop

- Hero copy appears first; the wide Return Field sits directly underneath.
- Product stages use the rail at near-full width.
- Chapters have enough vertical space for one dominant idea.

### Tablet

- Hero sizes step down without changing the narrative order.
- Two-column text compositions stack below 900px.
- Product stages remain wide and legible.

### Mobile

- Hero remains copy → CTA → Return Field.
- Mobile-specific video crops focus on the active task and restore result.
- Machine values wrap; none are ellipsized.
- Footer receipt stays readable as a single-column object.
- Touch toggles the folded state without trapping focus or blocking footer links.
- The page has no horizontal document overflow at 320px.

## 10. Accessibility

- One `h1`; heading levels follow document order.
- Every interactive control has a visible focus state.
- The footer receipt control exposes a clear accessible name and pressed/expanded state.
- Videos are silent and accompanied by equivalent adjacent text; no audio transcript is required.
- Manual Play controls remain keyboard accessible.
- Contrast is verified for every actual text/background pair.
- Reduced motion disables nonessential transforms and autoplay.
- JavaScript-off content remains complete.
- Skip link, landmark labels, alt text, and route titles remain correct.

## 11. Performance budgets

- The hero poster is the visual LCP candidate and must paint before video playback.
- Desktop hero loop target: ≤2.5 MB.
- Desktop honest-return loop target: ≤1.5 MB.
- Mobile variants should be materially smaller than desktop variants.
- The lower video source is not fetched until near the viewport.
- Every video has explicit dimensions to prevent layout shift.
- No third-party font, script, image, video, analytics, or embed request.

Budgets may be tightened after visual QA. They may not be loosened silently to preserve an inefficient export.

## 12. Error and fallback behavior

- Video error → poster and caption remain; manual Play is removed or disabled honestly.
- Autoplay rejection → poster plus manual Play.
- Clipboard failure on Setup → `Select it`, never fake success.
- Missing JavaScript → static complete page.
- Missing image/video asset → automated integrity test fails the build.
- Download/release URL failure → link integrity test fails before release.
- Footer fold script failure → readable open receipt; no broken control.

## 13. Routes

- `/` receives the complete Living Instrument redesign.
- `/setup/` keeps the detailed installation, verification, connector caveats, checksum, and legacy bundle-ID explanation.
- `/privacy/` keeps the full policy and data-lifecycle detail.
- `404.html` shares the new shell and offers Home, Download, and Setup.

The sub-routes inherit palette, typography, navigation, footer, and focus behavior. They do not inherit product autoplay, the Return Field, or homepage chapter compositions.

## 14. Removed from the homepage

- Capsule-rack table of contents.
- Repeated evidence band.
- Screenshot tab switcher/gallery.
- Long connector status chapter.
- Repeated status tables and manifests.
- Giant install ledger.
- Full checksum presentation.
- Decorative closing statement separate from the download and footer.
- Equal padding on every section.
- Static screenshot repetition for every app screen.

No existing truth is deleted from the site; detailed material moves to the route where a visitor needs it.

## 15. Out of scope

- Redesigning the desktop app to match the site.
- New Rabta functionality.
- Analytics, accounts, pricing, newsletter, blog, changelog feed, or waitlist.
- Invented users, testimonials, customer logos, ratings, download counts, or adoption metrics.
- New external dependencies solely for page animation.
- Deploying or changing GitHub Pages settings.

## 16. Verification and acceptance

### Truth

- Every task name, count, branch, connector status, version, size, platform requirement, and restore result matches the frozen fixture or verified release facts.
- `No Intel build` remains visible before download.
- Chrome remains `On next reload` in the restore result.
- No fabricated social proof.

### Visual

- Petrol clearly remains the primary environment.
- The cool palette creates depth rather than arbitrary alternating sections.
- The product visual sits directly beneath the hero headline.
- Each major chapter has one dominant thought and enough air.
- The page no longer reads as a grid, dashboard, or technical specification.

### Motion

- Exactly two autoplay product loops.
- Only an in-view loop plays.
- Reduced motion, data saver, autoplay rejection, video error, and JavaScript-off paths are complete.
- Footer fold screenshots are captured at 0%, 25%, 50%, 75%, and 100%.
- The final flap triangle matches its mathematically reflected target.
- Footer interaction works with hover, keyboard focus, touch, and reduced motion.

### Build

- No third-party subresources.
- No horizontal overflow at 320, 375, 390, 768, 1024, 1280, 1440, and 1920px.
- No unexpected layout shift.
- Link and asset integrity passes.
- Video codec, dimensions, duration, poster, and file-size checks pass.
- All four routes render with JavaScript disabled.

### Access

- Keyboard path is complete and logical.
- Focus is visible everywhere.
- Contrast passes for every used pair.
- One `h1` per route; heading levels do not skip.
- Video and fold interactions never gate essential content.

## 17. Review checkpoints during implementation

1. Hero copy plus Return Field at desktop and mobile.
2. Completed hero loop with poster and fallback.
3. Page rhythm through the honest-return chapter.
4. Footer receipt resting state.
5. Footer fold at all five captured progress frames.
6. Full route and accessibility verification.

Do not build the entire page before reviewing the hero and signature motion. Those two moments carry the design.
