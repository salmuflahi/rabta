# rabta.build — site design plan

**Status:** contract. This is followed literally during the rebuild. Anything not
in here does not get built. Anything in here that turns out to be wrong gets
changed *here first*, then in the code.

**Supersedes:** the scroll-scrubbed / choreographed direction. That direction is
dead. No pinned sections, no scroll-driven animation, no multi-second sequences,
no HTML re-creations of the app UI anywhere on the site.

---

## 0. How to use this document

1. §1–§3 are why. §4–§7 are the system. §8 is the page. §9–§11 are the material.
   §12–§14 are how you know you are finished.
2. **Every value used in CSS comes from §4.** A number not in §4 does not go in
   the CSS. This is checkable with a grep and it will be checked.
3. §8 gives each section a fixed id, a wireframe, exact layout and type, and the
   **final copy verbatim**. Do not improvise copy.
4. §9 is the source of truth for every task name, project, branch and count on
   the site. All of it is real fixture data from the shipped app, so the words
   and the screenshots agree exactly.

---

## 1. What this page is for

One job: **get a macOS developer to download Rabta 0.1.0.** A section that does
not move someone toward that, or remove a reason not to, does not belong.

Secondary job: be checkable. Rabta is a v0.1.0 tool from an unknown author
asking to put a binary on someone's machine. It has no users to point at. The
only credibility available is **evidence the visitor can verify in a terminal**,
so the page leans on that and never fakes the other kind.

---

## 2. What was studied

Both references were measured live — computed styles from the rendered pages,
plus full-height captures at 1440px and 390px.

### 2.1 superlist.com — measured

| | |
|---|---|
| Background | `#181824` indigo-black |
| Display face | Haffer XH SemiBold, 600 |
| Body face | Inter 400/500 |
| Scale (px) | 88 · 48 · 30 · 24 · 18 · 16 · 14 · 12 |
| Display leading | 0.95 @88 · 1.10 @48 · 1.20 @30/24 |
| Body leading | 1.40 (18/25.2) |
| Tracking | −2% display, −2% body |
| Text | `#FFFFFF` · `#696F81` muted · `#8E8DA0` footer |
| Accent | `#FF4A36` |
| Height | 8,776px |

Structure: sticky nav → **centred** hero, 88px two-line headline with line two in
the accent, 18px muted sub-copy, one accent pill → big product shot in a rounded
frame on a gradient → centred 30px statement at ~50% measure → logo wall →
alternating image-forward chapters → testimonial masonry → centred closing
statement + pill → five-column footer with **a different colour per column
heading**.

Its personality comes from: **two-tone headings** (first clause white, remainder
muted, same size); **saturated colour fields** under every product image;
hand-drawn squiggle eyebrows; cards that are always image-on-field → 24px
heading → muted two-line description.

### 2.2 linear.app — measured

| | |
|---|---|
| Background | `#08090A` neutral near-black |
| Face | Inter Variable **only** |
| Weights | 300 · 400 · 510 · 590 |
| Scale (px) | 72 · 64 · 48 · 32 · 24 · 20 · 17 · 16 · 15 · 14 |
| Display leading | **exactly 1.0** |
| Body leading | 1.50 (16/24) · 1.60 (15/24) · 1.33 (24/32) |
| Tracking | −2.2% at 72/64/48 · −1.2% at 15 |
| Text | `#F7F8F8` · `#D0D6E0` · `#8A8F98` |
| Section padding | **128px**, unvarying |
| Container | 1436px outer; text columns 480 / 512 / 560 |
| Borders | `0.5px rgba(255,255,255,0.05)` |
| Height | 10,890px |

Its repeating chapter is the most useful thing on either site:

```
[128px]
  48px heading (2 lines, lh 1.0)  │  24px muted paragraph (3 lines)
  cols 1–5                        │  cols 7–12
                                  │  3.0  Build →      ← numbered primary link
  [~72px]
  ┌──────── full-width product visual, r12, hairline ────────┐
  └──────────────────────────────────────────────────────────┘
  [~56px]
            3.1  Issues      │  3.2  Agents        ← numbered sub-index,
            3.3  Linear MCP  │  3.4  Git automations  2 cols, hairline between
[128px]
────────────────── full-bleed hairline ──────────────────
```

Also: left-aligned hero with **no CTA button in the body** (it lives in the nav);
closing testimonials as large saturated colour cards with black text; one quiet
stat line with a right-aligned arrow link; centred 72px closing statement.

### 2.3 What both do, that we do

1. Dark page, one or two sans faces, **no serif**.
2. Tight negative tracking; display leading at or near 1.0.
3. Real product imagery is the hero content.
4. Sub-copy stays small (15–24px) and muted.
5. Left-aligned section heads; unvarying vertical rhythm.
6. Hairlines at very low alpha; low-saturation surfaces.
7. Motion is incidental. Neither scroll-jacks. Neither has a choreographed
   sequence.
8. **On mobile, product imagery crops rather than shrinks.** Linear lets shots
   and card rows run off the right edge at full size instead of scaling to
   illegibility. We copy this exactly.

### 2.4 What both do, that we refuse

- **Logo walls.** Superlist: 8 companies. Linear: Vercel/Cursor/OpenAI/Coinbase/
  Ramp. Rabta has none and will not invent them. §8.4 fills the slot with real
  release evidence.
- **Testimonial walls.** Superlist: App Store masonry. Linear: two quote cards +
  "37,000 product teams". Rabta has zero users. The slot is **deleted**.
- **Squiggles** (Superlist's voice) and **isometric line-art** (Linear's voice).
  We have six real screenshots, which are better than both.

---

## 3. The direction — "Instrument"

### 3.1 Thesis

> Rabta reads the working context around a task, writes it down, and puts it
> back. The page is that instrument's own panel and spec sheet — cold, gridded,
> numbered, entirely checkable — and it makes its central argument **in layout
> rather than in adjectives**.

### 3.2 The signature — the Return Pair

**One screen, printed twice, in two byte-identical boxes.**

`capsules` closes chapter 1.0 Capture, labelled *the task as you left it*.
`restore` opens chapter 2.0 Restore, labelled *as it came back*. Both sit in a
960px box with identical inset, padding, radius and x-position. Between them
sits the interruption, narrated in four words.

Rabta is the only product whose entire value proposition is that **two moments
in time look the same**. Sameness is a layout property, not a copy property — so
the page states the claim with two `<picture>` elements and a shared class, and
never has to write the sentence.

The pair carries one more thing: frame two's caption and the ledger beneath it
**quote the shipped restore panel verbatim**, including that the restore is only
partial and that Chrome comes back on the next reload. Admitting the limit in
the signature moment is worth more than any testimonial this page is forbidden
to run.

### 3.3 The second rule — monospace is what is checkable

Inter carries the argument. The system monospace carries every fact with a
verifiable referent: version, byte count, branch names, file and terminal
counts, connector capability names, the Apple team id, the SHA-256. Nothing
decorative is ever mono, and nothing checkable is ever Inter.

True to the app (its UI already sets exactly these things in mono), and it gives
the page a second voice neither reference has.

### 3.4 The risk

Every hue on the page is lifted **verbatim from `rabta-mark.svg`**, which
contains exactly three colours: `#102526`, `#F3F0E8`, `#FF6B2C`. The risk is
that a page built from a three-colour logo, with the accent hard-capped at five
instances and zero gradients, is too austere to be liked.

The justification: austerity is the product's argument. And the one warm gesture
— a single band of bone under the hero with the mark's folded corner cut into it
in ember — is enough to stop six dark-teal captures on a dark page reading as a
monolith. If it reads as cold rather than precise, the fix is to widen the bone
band, not to add a second colour.

### 3.5 Hard constraints

- Static hand-authored HTML/CSS/JS in `website/`. **No build step.** Pages
  uploads the folder verbatim.
- **CI fails on any third-party subresource.** Every byte self-hosted.
- Correct and complete **with JavaScript disabled**.
- `prefers-reduced-motion` honoured everywhere.
- `/`, `/setup/`, `/privacy/`, `404.html` keep working.

---

## 4. Tokens

### 4.1 Colour — twelve tokens, no thirteenth

| token | hex | role | limit / contrast |
|---|---|---|---|
| `--ground` | `#0A1314` | The only page background, edge to edge, plus nav and footer. A half-step darker and cooler than the mark's plate so panels read as raised without a shadow. | No gradient, mesh, noise, glow, vignette or aurora anywhere. |
| `--panel` | `#102526` | The mark's own rect, verbatim. The single elevation device below the fold: screenshot beds, evidence band, contents block, locked boxes, ledgers, fact table, demo frame. | Exactly two elevation levels sitewide. No third. **No panel nested in a panel.** |
| `--field-bone` | `#EAE4D5` | The hero field only. The mark's `#F3F0E8` warmed and dropped 4%. | Exactly once, above the fold, full shell width. Never a section background. **No text is ever set on it** — the caption sits below it, on ground. |
| `--text-1` | `#F3F0E8` | The mark's glyph, verbatim. Headings, key values, active labels, filled status markers. The page's only warm tone: warm numerals on a cold panel. | 17.5:1 on ground · 13.4:1 on panel |
| `--text-2` | `#A9BCBA` | Lead paragraphs, chapter-head right column, body, footer links. | 9.5:1 on ground · 7.2:1 on panel |
| `--text-3` | `#7C8F8E` | Captions, chapter and index numerals, table keys, caveats, eyebrows, hollow pending ring. | 5.6:1 on ground · 4.7:1 on panel. **Never below 13px. Never a heading.** |
| `--accent` | `#FF6B2C` | The mark's fold, verbatim. | **Hard cap of five instances per document:** (1) nav pill, (2) hero download anchor, (3) hero dog-ear underside, (4) the 1px underline under the active switcher label, (5) the 6.0 Install download anchor. Focus rings and `::selection` are system affordances and are not counted, and neither is the ember triangle inside `rabta-mark.svg` — that is the logo, not a painted instance, and it appears wherever the mark does. Never body text, never a link colour, never a hover state, never a border, never a status marker, never beneath a screenshot. 6.6:1 on ground. |
| `--accent-hi` | `#FF8452` | The accent's one derived value: the hover fill for the three accent anchors. | Never a resting colour, never text, never a border. It is the twelfth token and the only hue not lifted verbatim from the mark. |
| `--ink-on-accent` | `#102526` | The **only** text colour permitted on accent. | 5.6:1. White on `#FF6B2C` is 3.34:1 and is forbidden outright, at any size. |
| `--hairline` | `rgba(243,240,232,0.08)` | Every border, row rule, panel outline, section rule. | Authored at **1px, never 0.5px** — 0.5px is a Linear tell and it disappears on 1× displays. Never doubled. |
| `--hairline-strong` | `rgba(243,240,232,0.14)` | The standing axis rule; hovered and active row borders. | Two uses only. |
| `--hairline-dark` | `rgba(0,0,0,0.28)` | The inner hairline on the screenshot inside the bone field — the only dark-on-light border on the page. | One use only. |

**Banned surfaces — this is a build-time grep, not a preference.**
`box-shadow` (all of it, including inset), `backdrop-filter`, `filter`, gradients
of any kind, gradient borders, tinted glass, noise or grain overlays, glows,
tilts, perspective, fake browser chrome, device mocks. **The page has zero
gradients.**

### 4.2 Type

**Face — Inter Variable only.** One `@font-face` at
`/assets/fonts/inter-latin-variable.woff2` (latin subset, already in repo),
`font-weight: 400 600; font-display: swap; font-synthesis: none;`, preloaded
with `crossorigin`. **Permitted weights: 400, 500, 600.** 300 and 700 are
forbidden. No second face, no italics, no uppercase-with-tracking, no small caps.

**Monospace — the local system stack only**:
`ui-monospace, SFMono-Regular, Menlo, monospace`. Never a downloaded mono face
(CI fails on third-party subresources). Machine data only.

**Tracking is a pure function of size**, applied by a size class, never per
component:

```
≥40px → −0.022em   28–39 → −0.018em   20–27 → −0.012em
15–19 → −0.011em   13–14 → 0          mono 12 → +0.02em
```

| px | leading | tracking | weight | colour | role |
|---|---|---|---|---|---|
| 68 | 71 (1.04) | −1.50px | 600 | `--text-1` / clause 2 `--text-3` | Closing statement. **Once.** The page's only two-tone heading. |
| 56 | 58 (1.04) | −1.23px | 600 | `--text-1` | Hero headline. **Once.** Exactly two authored lines. |
| 40 | 42 (1.05) | −0.88px | 600 | `--text-1` | The six chapter heads and the statement. Exactly two lines, forced by a 520px measure plus an authored `<br>`. |
| 28 | 34 (1.21) | −0.50px | 600 | `--text-1` | Download heading; 4.0 panel titles; mobile hero. |
| 21 | 32 (1.52) | −0.25px | 400 | `--text-2` | Hero subcopy; chapter-head paragraph (max 3 lines, 440px). |
| 17 | 26 (1.53) | −0.19px | 400 / 500 labels | `--text-2` / labels `--text-1` | Body; index row labels; channel names; ledger lines. |
| 15 | 24 (1.60) | −0.17px | 400 / 500 links | `--text-3` / table values `--text-1` | Secondary and caveat sentences; nav and footer links; fact-table values; requirement strip. |
| 13 | 18 (1.38) | 0 | 500 | `--text-3` | Chapter numerals, index numbers, captions, eyebrows, status words, footer meta. |
| **12 mono** | 18 (1.50) | +0.24px | 400 | `--text-1` | Every machine numeral. `font-variant-numeric: tabular-nums`, selectable, `overflow-wrap: anywhere`, **never truncated, never ellipsised**. |

Nothing may be introduced between 40 and 56, or between 56 and 68.

**Display leading rules.** 1.04/1.05 applies at **40px and above only** — it never
leaks below 28px. Every display block gets 6px internal vertical padding so a
sub-1.1 leading cannot clip caps or descenders. Display headings carry an
authored `<br>` so the break is deterministic.

**Mobile ladder** — fixed steps, never a percentage shrink:

- `<900px`: 68→38/40 · 56→32/34 · 40→26/28 · 28→22/28 · 21→19/29.
  Authored breaks are neutralised (`br { display: none }`) and display leading
  relaxes to 1.06 so descenders clear.
- `<390px`: hero 32→28/30.
- **17, 15, 13 and mono 12 do not scale at any breakpoint.**

**Two-tone** is one element with two inline spans — identical size, weight and
tracking, only the colour differs. Two elements would create two line boxes and
two wrap points. Used **once**, on the closing statement. Repeating it on every
section is the fastest way to read as a Superlist clone.

**Measure** — hard cap 560px / ~68 characters everywhere, captions included.
Sub-columns: heading 520 · chapter paragraph 440 · prose and checksum 496 ·
statement 680 · fact-table value 296.

### 4.3 Space — 4px base

```
4  8  12  16  24  32  40  56  72  96  128
```

4px increments are permitted **inside** a component, never between components.

| value | use |
|---|---|
| **128** | Section padding, top and bottom, **every** top-level section without exception — padding, not margin. 96 below 900px, 72 below 600px. This is Linear's number and it is used because it is right, not adjusted by 8px so a document could claim it was not. |
| 96 | Chapter-head column gap; footer top padding; row rhythm inside a chapter. |
| 72 | Hero top padding below the nav. |
| 56 | Chapter head → chapter visual. |
| 40 | Visual → sub-index; body → download anchor; evidence-band padding. |
| 32 | Grid column gap between panels; headline → subcopy. |
| 24 | Panel padding (desktop); rail gutter; paragraph → numbered link; index row padding. |
| 16 | Numeral → heading; heading → body; panel padding (mobile). |
| 12 | Anchor → requirement strip; caption → panel; dot → text. |
| 8 | Label → description; axis tick. |
| 4 | Numeric tag padding; marker geometry. |

Separation between adjacent sections is that 128px padding **plus at most one**
of {a full-shell 1px hairline, a `--panel` background}. Never both. With no
colour and one typeface, the beat is most of what holds the page together —
section padding drift is the single fastest way it reads as sloppy.

### 4.4 The fold — the one shape that is ours

`rabta-mark.svg` is a square with its **top-right corner cut at 45°**. That cut
is the only piece of geometry on this site that belongs to nobody else, so it
does structural work rather than decorating the hero.

**The rule: a chamfered top-right corner means "this holds context."** Nothing
else may carry it.

| Element | Chamfer | Accent underside |
|---|---|---|
| Hero field (§8.3) | 56px | yes — accent instance #3 |
| Capsule tags in the rack (§8.5) | 12px | no |
| Return Pair locked boxes (§8.6, §8.8) | 18px | no |
| The 4.0 screens frame (§8.10) | 18px | no |

**Never chamfered:** the evidence band, the ledgers, the fact table, the status
rows, the footer, buttons, the nav. Those carry facts *about* context, not
context itself — and a chamfer on everything is a texture, not a system.

Implementation is `clip-path: polygon(0 0, calc(100% - Npx) 0, 100% Npx, 100% 100%, 0 100%)`.
A chamfered element may not also carry a `border` (the clip cuts it); it gets a
1px inset ring drawn by a `::before` instead, or sits on a parent that carries
the hairline.

### 4.5 Radii — a closed set of five

`4` numeric tags · `8` buttons, anchors, every screenshot · `12` panels, boxes,
ledgers · `16` the demo frame · `20` the hero field.

An inner box inside a container of radius R with padding P uses R − P snapped to
the set.

### 4.6 Motion — exhaustive

The page contains no choreography. The only thing that changes state is
something a finger or a keyboard is currently on.

**Permitted**

- Transitions on interactive elements only — links, download anchors, nav pill,
  switcher labels, index rows, status rows.
- Properties: `color`, `background-color`, `border-color`, `opacity`, and a
  single `transform: translateX(2px)` on the `→` glyph in a numbered index row.
  Nothing else.
- Duration **120ms, ease-out, no delay.** Maximum displacement 2px.
- The 4.0 switcher panel change: a 120ms opacity change, nothing more.
- `position: sticky` on the nav and the axis numeral. Sticky is layout, not
  animation.

**Forbidden, exhaustively**

- Scroll-triggered anything: IntersectionObserver fade-ups, scrubbed images,
  pinned sections, parallax, progress-driven colour or scale.
- Entrance animation of any kind, including a staggered hero.
- Counters that tick, typewriter taglines, word-by-word reveals.
- Marquees, tickers, logo belts, auto-rotating tabs, autoplay anything.
- Cursor spotlights, tilt-on-mousemove, magnetic buttons, hover lift, hover
  scale, hover glow.
- `@keyframes` on anything that is not `:hover`, `:focus-visible` or `:active`.
  **In practice: no `@keyframes` at all.**

**Reduced motion** — applied globally:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
  }
}
```

Nothing on the page conveys meaning through motion, so removing all of it costs
nothing.

---

## 5. Grid

**Four container widths, never a fifth.**

| container | width | used by |
|---|---|---|
| Shell | 1320px max | The hero bone field and full-shell hairlines. **Nothing else is ever this wide**, which is what makes the page settle down after the fold. |
| Rail | 1120px max, centred. Gutters 40px ≥1024, 24px <768. | Every section below the hero. |
| Axis column | **96px**, reserved at the rail's left | The standing axis rule and its sticky numerals. Reserved even where a chapter has no numeral, so headings across chapters start at the same x. **Deleted below 900px.** |
| Content column | 944px (rail − gutters − axis) | All chapter content. |
| Locked box | 960px, centred on the content column (48px inset each side) | The Return Pair, both frames, identically. |

**Grid** — 12 columns, 24px gutters, on the 1056px content column at ≥1024px
(column width 66px). **Only five occupancies are legal.** No 8/4, no 5/7, no
offsets, no bento, no mosaic:

- `12` — hero, hero field, locked boxes, loop strip, switcher frame, statement, closing
- `7+5` (80px gap) — chapter head: 40px heading left, 21px paragraph + numbered link right
- `6+6` (32px gap) — the 4.0 panel pair; the 6.0 download / fact-table split
- `4+4+4` (32px gap) — the loop strip; any future triptych
- `3+3+3+3` (24px gap) — the evidence band's four cells

**Breakpoints — three, and only three.**

| Name | Range | What changes |
|---|---|---|
| wide | ≥1024 | The grid above. |
| mid | 768–1023 | Chapter head stacks. `4+4+4` → 2-up. Axis deleted below 900. |
| narrow | ≤767 | Single column. Product images **crop, never shrink** (§7.4). Nav sheds its centre group. |

No 1440px+ behaviour. The shell caps and centres.

---

## 6. The page

| # | id | Section | Job |
|---|---|---|---|
| — | — | Nav | Hold a persistent download path so the hero can be a sentence, not a button cluster. |
| 01 | `hero` | Hero | The product sentence and the mechanism. Nothing else. |
| 02 | `plate` | Hero plate | Put the product on screen at page scale; break the dark-on-dark silhouette in one move. |
| 03 | `evidence` | Evidence band | The logo-wall slot, filled with facts. |
| 04 | `contents` | Contents | The real index, printed at the top so every numeral has a home. |
| 05 | `capture` | Capture | What a capsule holds. Closes with **Return Pair frame one**. |
| 06 | `loop` | The loop | The interruption, narrated. The only thing between the two frames. |
| 07 | `restore` | Restore | Opens with **frame two**. Admits exactly how much came back. |
| 08 | `connectors` | Connectors | The true shipping state of all three channels. |
| 09 | `screens` | Screens | The clickable demo, merged with its own sub-index. |
| 10 | `privacy` | Privacy | List the absences as absences. |
| 11 | `install` | Install | Hand over the artefact and everything needed to verify it. |
| 12 | `closing` | Closing statement | End inside the facts. |
| — | — | Footer | One modest ledger. |

**There is no decimal numbering anywhere on this page.** Chapters are named, and
the recurring object that carries navigation is the capsule (§8.5), not a
numeral. A numbered index is Linear's device and Rabta's six chapters are not a
catalogue that needs one.

The one place a sequence is genuinely asserted is the loop strip (§8.7), and it
uses four words rather than four numbers.

---

## 7. Components

### 7.1 `btn` / anchor

| Variant | Fill | Text | Border | Height | Radius |
|---|---|---|---|---|---|
| `--accent` | `--accent` | `--ink-on-accent` | none | 48 (40 in nav) | 8 |
| `--quiet` | transparent | `--text-1` | 1px `--hairline-strong` | 48 | 8 |

Padding-inline 24. Label 15px/500. Hover: accent → `background-color` +6%
lightness; quiet → border `--hairline-strong` → `--text-3`.
Active: no transform. Focus-visible: `outline: 2px solid var(--accent);
outline-offset: 3px`.

There are exactly **five** accent instances on the page (§4.1), and only three
of them are anchors — nav, hero, install. Count them before shipping.

### 7.2 `frame` — the screenshot bed

```
┌─ --panel, r12, 24px padding, 1px --hairline ─┐
│  ┌────────────────────────────────────────┐  │  ← r8, 1px --hairline
│  │           <img> (the capture)          │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

`<img>` always carries explicit `width`/`height` and `loading="lazy"` — except
the hero capture, which is `fetchpriority="high"` and not lazy.

### 7.3 `locked box` — the Return Pair unit

A `frame` at **exactly 960px**, centred on the content column, with identical
inset, padding, radii and x-position in both instances. A 13px `--text-3` label
sits above the box; the manifest (§7.5) sits beneath it as text, so the section
survives with images off.

The two instances **must** share one class and differ only in `<img>` and label.
If a later change makes them differ in width, padding or radius, the signature
is gone and the section is pointless.

### 7.4 Product image rules

- `<picture>` with AVIF → WebP → PNG from
  `/assets/shots/<name>-{640,1024,1600}.{avif,webp,png}`. Native 1024×640.
- **Narrow (≤767px): crop, do not shrink.** The frame keeps a minimum image
  width of 720px and clips overflow on the right. A 1024px app UI scaled to
  350px is unreadable and makes the product look like a toy; cropping keeps the
  left ~70% at full fidelity, which is where the sidebar and the list are.
- Alt text describes **what the screen shows**, never "screenshot of Rabta".

### 7.5 `manifest` — the mono data line

One line of 12px mono, `--text-1`, `·` separated, directly beneath a capture:

```
4 files · 3 terminals · 5 tabs · feat/connector-reconnect
```

Its contents are always **the literal contents of the thing pictured above it**.
Never a summary, never a claim.

### 7.6 `status row`

Grid `12px / 1fr / auto`, 1px `--hairline` top border, 20px vertical padding.
Filled `--text-1` disc = available/restored. Hollow `--text-3` ring = pending/not
restored. State word 14px/500. **No colour is used**, so a partial state cannot
read as a warning.

### 7.7 `chapter`

```
────────────────── full-shell hairline ──────────────────
[136]
 │1.0│  Save the task you're      │  Rabta records what a task had open —
 │   │  leaving.                  │  the files, the terminals, the tabs,
 │ ↑ │  (40px, cols 1–7, 520px)   │  the branch — and keeps it as a capsule.
 │axis                            │  (21px --text-2, cols 8–12, 440px)
 │   │                            │
 │   │                            │  1.0  Capture →
 [56]
 │   ┌──────── visual, content column or locked box ────────┐
 │   └──────────────────────────────────────────────────────┘
 [40]
 │   1.1  Editor files and terminals  │  1.2  Browser tabs
 │   1.3  Git branch                  │
[136]
```

The sub-index is a **real index**: each entry resolves to a body anchor that
states the fact. A chapter with fewer than three true sub-items gets no
sub-index.

---

## 8. Sections

### 8.1 Nav

56px tall, solid `--ground`, 1px `--hairline` bottom rule, **no backdrop blur**.

- Left: `rabta-mark.svg` at 20px + "Rabta" 15px/500 `--text-1`.
- Centre: three 15px `--text-3` links, 24px apart — **Capture · Connectors ·
  Privacy** — hovering to `--text-1` in 120ms. Each resolves to a real id.
- Right: "Setup" 15px text link, 16px gap, then the accent download anchor at
  40px tall, radius 8, label "Download for macOS".

Centre group dropped below 768px. No hamburger, no drawer — the footer carries
every link and the page is a single scroll.

Sticky. **With JS off it is identical**, because it has no scroll-dependent
state: the background is solid from the first pixel.

### 8.2 `#hero`

Left-aligned on the rail, 72px below the nav.

**Copy — verbatim.**

> # Leave the task.<br>Keep your place.
>
> Rabta saves the files, terminals, browser tabs and git branch a task had open,
> and puts them back when you return to it. It runs locally on macOS.
>
> `[ Download for macOS ]`
>
> `macOS 11.0 or later · Apple Silicon (arm64) · no Intel build · 5.5 MB`

Baseline-aligned to the right of the headline row: the **release chip** — hollow
4px ring, `0.1.0`, 1px hairline divider, `Published 29 July 2026`, linking to
the GitHub release.

The requirement strip states the exclusion (**no Intel build**) rather than
hiding it. Someone on an Intel Mac discovering that after downloading is a worse
outcome than not downloading.

**Nothing animates.** The hero is static from first paint. This is the largest
single departure from the previous direction and it is deliberate.

### 8.3 `#plate` — the hero plate

Full shell (1320px), `--field-bone`, radius 20, **top-right corner cut by a 56px
dog-ear with an `--accent` underside** — `rabta-mark.svg` drawn at page width,
the document's one literal branding moment and accent instance #3.

Inside: the `overview` capture, inset 48px left and right, 32px from the top,
radius 8, 1px `--hairline-dark`, capped at 1024 CSS px, **bleeding off the
field's bottom edge** so the app reads as continuing.

**No text is set on the field.** The caption sits below it, on ground.

Alt: *"The Rabta Overview screen: three registered projects, one connected app,
four open tasks, and the active task 'Wire the connector SDK reconnect' with a
Resume button."*

This is the widest element on the page and nothing after it is ever this wide.

### 8.4 `#evidence` — the evidence band

Full rail, 40px vertical padding, 1px hairline above and below, four `3+3+3+3`
cells split by vertical hairlines. Load-bearing nouns `--text-1`, the rest
`--text-3`, machine numerals 12px mono tabular.

| | |
|---|---|
| Version `0.1.0` · published 29 July 2026 | `Rabta_0.1.0_aarch64.dmg` · 5.5 MB (`5,495,778` bytes) |
| Developer ID · Apple team `86M2X6MUA3` · notarized, ticket stapled | MIT licence · source on GitHub |

2×2 below 768px, 1-col below 600px.

**Nothing here implies adoption, popularity, endorsement or scale.** If a future
version has real numbers they *replace* this band; they are never added
alongside it.

### 8.5 `#contents` — the capsule rack

**This replaces the `1.0 / 1.1` decimal index.** That system is the single most
Linear-identifiable device available, and Rabta's content is not a catalogue —
it is a product with one recurring object. So the contents block is a **rack of
capsules**, which is the app's own Capsules screen doing navigation.

Six chamfered tags (12px fold, §4.4) in a `3+3` grid at ≥1024px, 2-up at mid,
1-up at narrow. Each tag:

```
┌──────────────────────────────╱
│ CAPTURE                      │   ← 13px/500 --text-1
│ what a capsule holds         │   ← 15px --text-3
│                              │
│ 4 files · 3 terminals · 5 …  │   ← 12px mono --text-3, the chapter's own
└──────────────────────────────┘      manifest line
```

`--panel`, 24px padding, 1px inset hairline ring, whole tag is the anchor.
Hover: ring → `--hairline-strong`, label → `--text-1`. No arrow glyph, no
number.

Chapters are identified **by name**, not by numeral. Every tag resolves to an id
that exists, and each chapter repeats its own name as its eyebrow.

The six: **Capture · Restore · Connectors · Screens · Privacy · Install.**

### 8.6 `#capture` — 1.0 Capture

**Heading.** *Save the task you're<br>leaving.*
**Paragraph.** *Rabta records what a task had open — the files and cursor
position, the terminal sessions, the browser tabs, the git branch — and keeps it
as a capsule. It stores pointers, not contents: paths and names, never your
code.*
**Numbered link.** `1.0 Capture →`
**Sub-index.** `1.1 Editor files and terminals` · `1.2 Browser tabs` ·
`1.3 Git branch`

**Closes with Return Pair frame one.** Locked box, label above:
*the task as you left it*. Capture: `capsules`.

Manifest beneath: `4 files · 3 terminals · 5 tabs · feat/connector-reconnect`

Alt: *"The Capsules screen listing four open tasks across the atlas-api and
mercury-web projects, each with its file, terminal, tab and branch counts and a
Resume button."*

### 8.7 `#loop` — the interruption

Four items across under a **single 1px hairline that spans the strip** rather
than dividing it:

```
capture   →   leave   →   return   →   restore
```

Each a 17px/500 `--text-1` label with a 15px `--text-3` line beneath. 2×2 below
768px. **Unnumbered** (§6).

| | |
|---|---|
| capture | Rabta writes down what the task had open. |
| leave | Something else needs doing. The windows close. |
| return | You come back to the task, days later. |
| restore | The workspace is put back around it. |

### 8.8 `#restore` — 2.0 Restore

**Heading.** *Pick it up exactly<br>where it was.*
**Paragraph.** *Choose a task and Rabta puts the workspace back around it. Some
things return immediately; some, like browser tabs, come back on the next reload
— and it tells you which is which.*
**Numbered link.** `2.0 Restore →`

**Opens with frame two**, in a box byte-identical to frame one's. Label:
*as it came back*. Capture: `restore`.

Directly beneath, the **restore ledger, quoting the shipped panel verbatim**
(§7.6 status rows, no colour):

| | |
|---|---|
| ● VS Code | Restored |
| ○ Chrome | On next reload |
| ● Git | Restored |

Caption: `Workspace partially restored — Wire the connector SDK reconnect`

**Sub-index.** `2.1 Editor files reopen in place` · `2.2 Terminals return with
their cwd` · `2.3 The branch is checked out first`

`2.3` is true and load-bearing: git is restored first because switching a branch
changes files on disk.

### 8.9 `#connectors` — 3.0 Connectors

**Heading.** *Your tools reconnect<br>to the task.*
**Paragraph.** *Rabta talks to your editor and browser through small connectors
that run locally. They pair with the app once, over `127.0.0.1`, and between
them they are allowed to do exactly five things.*

**No product image and no mock drawn to fill the hole.** The channel status list
is the visual — three `status row`s on a 720px column:

| | | |
|---|---|---|
| ● | macOS `.dmg` — signed and notarized | **Available** |
| ● | Editor connector — published on Open VSX; works in Cursor, VSCodium and Windsurf | **Published** |
| ○ | Browser connector — submitted to the Chrome Web Store | **In review** |

Manifest beneath:
`workspace.open · workspace.snapshot · terminal.list · tabs.list · tabs.open`

That line is the entire privacy argument for connectors, expressed as data
instead of a promise. It is the five capability names the shipped app displays.

**Sub-index → body anchors carrying the caveats:**
`3.1` Not on the Microsoft VS Code Marketplace — stock VS Code installs the
`.vsix` by hand · `3.2` Connectors talk only to `127.0.0.1` · `3.3` The Chrome
extension reads tab URLs and titles only, with no host permissions and no
content scripts.

**This section is the site's most likely place to lie. Never link to the
Microsoft VS Code Marketplace.**

### 8.10 `#screens` — 4.0 Screens, the clickable demo

The demo and its sub-index are **one object**.

A `--panel` frame on the rail with a label strip above it: three visually-hidden
radio inputs and three labels that **are** the sub-index rows —

```
4.1  Projects      4.2  Connectors      4.3  Activity
```

15px/500, 20px apart. Checked label `--text-1` with a 1px `--accent` underline
(accent instance #4); unchecked `--text-3`.

`:checked ~` swaps one full 1024px capture at a time, 8:5, default `4.1`. Each
panel also carries an id and is reachable by `:target`, so a deep link works.
Each caption reprints its own number and names the actual view.

**CSS only.** Works with scripting disabled. Arrow keys move between radios
natively. Focus ring on the label. Panel change is a 120ms opacity change and
nothing else.

**It switches screens and does nothing else** — no cursor simulation, no typing,
no tour, no autoplay.

Below the frame, a `6+6` pair of 28px titles and 17px bodies explains what the
projects and activity views are for.

**Assets.** `projects`, `connectors`, `activity` — all three already exist. **No
new captures are required.**

### 8.11 `#privacy` — 5.0 Privacy

**Heading.** *It never leaves<br>your Mac.*
**Paragraph.** *There is no Rabta account and no Rabta server. Your capsules
live in one folder on your own disk, and your project code is never uploaded —
Rabta stores the path to a file, not the file.*

A `--panel` ledger, single column, each line prefixed by a 12px em-dash in
`--text-3`, 10px row gap:

```
— no account          — no telemetry        — no analytics
— no crash reporting  — no update checks    — no cloud
```

Then a 1px hairline and three 15px lines: data lives in one folder on your Mac ·
connectors talk only to `127.0.0.1` · the Chrome extension reads tab URLs and
titles only, with no host permissions and no content scripts.

Closes with a 15px link to `/privacy/`.

**No green ticks, no shield icons, no seals.** List the absences as absences and
never convert one into a feature.

**Explicitly not on this page:** the storage path
`~/Library/Application Support/com.omnibus.dev` and the explanation of the
legacy `com.omnibus.dev` bundle identifier. Both are correct and both matter,
and both belong on `/setup/` and `/privacy/`. A homepage that opens its privacy
chapter by explaining a rename is apologising.

### 8.12 `#install` — 6.0 Install

`6+6`.

**Left, 520px column.** 28px heading, a 15px requirement line, the accent
download anchor pointing **straight at the release `.dmg` URL** — no email gate,
no modal, no waitlist, no "get started free" on a free MIT app — a 12px mono
caption `Rabta_0.1.0_aarch64.dmg · 5.5 MB · macOS 11.0+ · Apple Silicon`, and a
15px `View the release on GitHub →`.

**Right, 496px column.** The fact table: rows of `200px key / 1fr value`, 16px
vertical padding, 1px `--hairline` between rows, keys 14px/500 `--text-3`,
values 15px `--text-1` tabular.

| key | value |
|---|---|
| File | `Rabta_0.1.0_aarch64.dmg` |
| Size | 5.5 MB (`5,495,778` bytes) |
| Requires | macOS 11.0 or later, Apple Silicon (arm64) |
| Intel | No build |
| Signing | Developer ID · Apple team `86M2X6MUA3` · notarized, ticket stapled |
| Licence | MIT |
| Author | Sammy Almuflahi |
| SHA-256 | `3978ec…` full 64 chars, 12px mono, wrapping, selectable, **never elided** |

Closes with a link to `/setup/`.

A copy-to-clipboard control for the checksum is **inserted by script**, so there
is no dead control with JS off. On failure it says `Select it`, never a fake
success.

### 8.13 `#closing`

Left-aligned on a 680px measure, 68px/71 in two authored lines, clause one
`--text-1` and clause two `--text-3` at identical size, weight and tracking —
the page's **only** two-tone moment.

> **Get your place back.** It is already written down.

**No button.** §8.12 sits directly above this and has already handed over the
download, the requirements and the checksum; a second call to action 100px later
is not emphasis, it is a page that does not trust its own conversion. The
statement is a full stop.

The standing axis has ended; this section sits on plain ground with no panel.

### 8.14 Footer

One modest block, **not the mega-footer of a company that does not exist yet.**
1px hairline top rule, 96px top / 64px bottom padding, three columns on the rail.

1. Mark, wordmark, one 15px line describing what Rabta is.
2. Links limited to routes and URLs that exist: `/`, `/setup/`, `/privacy/`, the
   repository, the release.
3. 13px `--text-3` meta, tabular: `v0.1.0 · published 29 July 2026 · MIT ·
   Sammy Almuflahi`, plus the two connector channels named **as text only** —
   Open VSX, and Chrome Web Store (in review).

---

## 9. Product vocabulary — the source of truth

**Every task name, project, branch and count on the site comes from this table.**
It is the frozen demo fixture the six captures were taken from
(`apps/desktop/capture/seed.ts`), so the copy and the images agree exactly.
Inventing a nicer-sounding task name breaks that agreement and is not allowed.

### 9.1 Projects

| Project | Path | Dev server | Git |
|---|---|---|---|
| `atlas-api` | `~/code/atlas-api` | `http://localhost:8080` | `main` · 4 changed · ↑2 |
| `mercury-web` | `~/code/mercury-web` | `http://localhost:3000` | `main` |
| `ledger-cli` | `~/code/ledger-cli` | — | `main` · ↓1 |

### 9.2 Tasks

| Task | Project | Contents | Branch |
|---|---|---|---|
| Wire the connector SDK reconnect | atlas-api | 4 files · 3 terminals · 5 tabs | `feat/connector-reconnect` |
| Fix token refresh race in auth | atlas-api | 2 files · 1 terminal | `fix/token-refresh-race` |
| Track down the flaky restore test | atlas-api | 3 files · 2 terminals | `chore/flaky-restore-test` |
| Ship the settings redesign *(done)* | mercury-web | 2 files · 1 terminal · 2 tabs | `feat/settings-redesign` |
| Audit focus states across dialogs | mercury-web | 1 file · no terminals | — |

### 9.3 Connectors

| Connector | Version | State in fixture | Capabilities |
|---|---|---|---|
| VS Code | `v0.1.0` | Connected · since just now | `workspace.open` `workspace.snapshot` `terminal.list` |
| Chrome | `v0.1.0` | Offline · last seen 3h ago | `tabs.list` `tabs.open` |

The Connectors screen also shows a live pairing request — *"Chrome (Chrome) wants
to connect"* with **Deny / Approve** — which is why §8.9 can say pairing is
approved in the app.

### 9.4 The restore sheet — quote verbatim

> **Workspace partially restored** — Wire the connector SDK reconnect
> VS Code — ✓ Restored
> Chrome — On next reload
> Git — ✓ Restored

**Use this including the partial state.** It is the most trust-building thing in
the fixture: the product tells you what it could not do.

### 9.5 Release facts

| | |
|---|---|
| Version | 0.1.0 |
| Published | 29 July 2026 |
| File | `Rabta_0.1.0_aarch64.dmg` |
| Size | 5,495,778 bytes = **5.5 MB** decimal (5.24 MiB binary). Use the decimal figure: it is what macOS Finder and the GitHub release page report, and this page's whole argument is that its numbers match the thing you are checking. |
| Requires | macOS 11.0+, Apple Silicon (arm64). **No Intel build.** |
| SHA-256 | `3978ec57af7d37ab32670033d679c21a28cf74cebb0435ce011049e05635c655` |
| Signing | Developer ID, Apple team `86M2X6MUA3`, notarized, stapled |
| Licence | MIT |
| Author | Sammy Almuflahi |
| DMG | `https://github.com/salmuflahi/rabta/releases/download/v0.1.0/Rabta_0.1.0_aarch64.dmg` |
| Release | `https://github.com/salmuflahi/rabta/releases/tag/v0.1.0` |
| Repo | `https://github.com/salmuflahi/rabta` |
| Open VSX | `https://open-vsx.org/extension/rabta-connect/rabta-vscode` |

---

## 10. Sub-routes

`/setup/`, `/privacy/` and `404.html` share the nav, footer, tokens and rail.
What changes:

- **Measure.** Prose column `max-width: 68ch`, on the content column.
- **Type.** 17px/1.53 for paragraphs; 28px for h2 with 72px above; 12px mono for
  every path, command and identifier.
- **Left rail.** A sticky 13px section marker in the axis column — the pattern
  these pages already use. Keep it.
- **Code blocks.** `--panel`, radius 12, 16px padding, 12px mono,
  `overflow-x: auto`.
- **No bone field, no product images, no chapter numbering.** These are
  documents.

Content that moves **into** these pages from the homepage:

- The storage path `~/Library/Application Support/com.omnibus.dev` → both.
- The `com.omnibus.dev` legacy-identifier explanation → both.
- The VS Code `.vsix` install route → `/setup/#vsix`.

---

## 11. Assets

### 11.1 All six captures are used. None need re-taking.

`website/assets/shots/<name>-{640,1024,1600}.{avif,webp,png}`, native 1024×640,
captured from the real React app against the frozen fixture:

| Name | Shows | Used in |
|---|---|---|
| `overview` | 3 projects, 1 connected app, 4 open tasks, active task + Resume | §8.3 hero plate |
| `capsules` | Capsules list, four open tasks with their counts | §8.6 Return Pair frame one |
| `restore` | Restore sheet: partially restored, VS Code ✓, Chrome on next reload, Git ✓ | §8.8 Return Pair frame two |
| `projects` | Three registered projects with paths and git status | §8.10 panel 4.1 |
| `connectors` | Pairing banner + two connector cards with capabilities | §8.10 panel 4.2 |
| `activity` | Local activity log | §8.10 panel 4.3 |

Regenerate only if the app UI changes:

```sh
cd apps/desktop && node capture/capture.mjs
python3 scripts/optimize-shots.py
```

### 11.2 Brand

`website/assets/brand/rabta-mark.svg` is the single vector source for every
favicon, app icon and social image, generated by
`scripts/generate-brand-assets.py`. **Never hand-edit a raster.** The three
colours in that file are the page's entire palette (§4.1).

---

## 12. Definition of done

**Truth**
- [ ] Every task name, branch and count on the site appears in §9.
- [ ] No testimonial, logo, user count, rating or "trusted by" anywhere.
- [ ] No link to the Microsoft VS Code Marketplace.
- [ ] "No Intel build" appears in both §8.2 and §8.12.
- [ ] The SHA-256 on the page matches `shasum -a 256` on the real DMG.
- [ ] The restore ledger says *On next reload* for Chrome.
- [ ] The storage path and `com.omnibus.dev` explanation are on `/setup/` and
      `/privacy/`, and **not** on `/`.

**System**
- [ ] Every colour, size, space and radius in the CSS appears in §4. Grep it.
- [ ] `grep -c` for `box-shadow`, `gradient`, `backdrop-filter`, `@keyframes`
      across `website/css/` returns **0**.
- [ ] Exactly five `--accent` instances on the page — three of them anchors
      (nav, hero, install). Count them.
- [ ] Section padding is 128/96/72 in every section, unvaried.
- [ ] Display leading is 1.04/1.05 at ≥40px and never leaks below 28px.
- [ ] No paragraph exceeds 560px / 68ch.
- [ ] The two Return Pair boxes share one class and differ only in image and label.

**Build**
- [ ] No build step. No third-party subresource. CI's guard passes.
- [ ] Page renders complete and correct **with JS disabled**, including the 4.0
      switcher.
- [ ] No horizontal scrollbar at 320, 375, 390, 768, 900, 1024, 1280, 1440, 1920.
- [ ] No layout shift when the switcher changes panel.
- [ ] Every `<img>` has `width`, `height` and real alt text; all but the hero lazy.

**Motion**
- [ ] The only transitions are §4.6's permitted list, all 120ms.
- [ ] Nothing animates on scroll. Nothing autoplays. Nothing loops.
- [ ] `prefers-reduced-motion` verified.

**Access**
- [ ] Contrast verified for every text/background pair actually used.
- [ ] Full keyboard pass: skip link → nav → hero → … → footer, visible focus on
      every stop; the switcher operable with arrow keys.
- [ ] One `<h1>`; heading levels never skip.
- [ ] Every `1.0`–`6.0` numeral resolves to an id that exists.

**Evidence**
- [ ] Desktop (1440) and mobile (390) captures of every section.
- [ ] A reduced-motion capture and a JS-disabled capture.
- [ ] Link and asset integrity check passes with zero problems.

---

## 13. Forbidden

1. Scroll-driven anything.
2. Any section pinned or sticky except the nav and the axis numeral.
3. **HTML re-creations of the app UI.** Use the captures. The old site
   hand-built an app frame in the DOM; that markup and its CSS are deleted.
4. Invented social proof of any kind.
5. Gradients, shadows, glass, glows, animated borders, bento grids, marquees.
6. Icon-per-feature grids using generic icon sets.
7. A second accent colour, or a sixth accent instance.
8. Serif type. Italics. Uppercase-with-tracking. Small caps.
9. Numbered markers on anything that is not genuinely a sequence.
10. Copy that describes a feeling instead of a behaviour.

---

## 14. Build order

1. **Delete the homepage's dead direction only.**
   `css/{hero,story,demo,connectors,local,close,continuity,appframe}.css` and
   `js/{hero,story,demo,connectors,motion}.js`, plus every HTML app-frame block
   in `index.html`.
   **Leave `css/base.css`, `css/site.css` and `js/site.js` alone for now** —
   `/setup/` and `/privacy/` still load them and must keep working while the
   homepage is rebuilt. They are deleted at step 11, not before.
2. `css/tokens.css` — §4 verbatim. (This replaces the current tokens file; it is
   the one file from the old direction that survives, rewritten.)
3. `css/shell.css` — reset, the eight type size classes, rail/shell/axis, `btn`,
   focus ring, skip link. Named `shell`, not `base`, so it cannot be confused
   with the legacy `base.css` that is still serving the sub-routes.
4. `css/components.css` — `frame`, `locked box`, `manifest`, `status row`,
   `chapter`, `index row`.
5. Nav + footer (§8.1, §8.14) on the homepage. The sub-routes keep their
   existing header and footer until step 11 — do not half-migrate them.
6. §8.2 + §8.3 hero and plate → **screenshot and review before continuing.**
7. §8.4, §8.5.
8. §8.6, §8.7, §8.8 — the Return Pair. **Screenshot and review**: if the two
   frames do not read as the same box, stop and fix it before going on.
9. §8.9, §8.11, §8.12, §8.13, §8.14.
10. §8.10 last — the only section with a state machine, and by then everything
    around it is settled.
11. Sub-routes (§10) — port `/setup/`, `/privacy/` and `404.html` onto
    `tokens.css` + `shell.css` + `components.css`, **then** delete
    `css/base.css`, `css/site.css` and `js/site.js`.
12. §12 in full.

Review after steps 6 and 8. Do not build all twelve sections and then look.


---

## 15. Build log — deviations from this document

The homepage is built. Three values changed during the build; the reason is
recorded here rather than silently in the CSS.

| § | Was | Is | Why |
|---|---|---|---|
| §5 axis column | 64px | **96px** | The longest chapter mark, "connectors", measures ~71px at 13px and overflowed a 64px track straight into the heading column. 96 is the next step on the spacing scale. |
| §8.13 closing | "Get your place back. / It is already written down." | "You should not have to remember / where you were." | Two short declaratives split on the sentence boundary with the second muted is the exact cadence both reference sites close on. One sentence running across the tone break is a move neither makes. |
| §8.2 release chip | bordered pill: ring · version · hairline · date | one unboxed mono line | The chip was linear.app's "New \| Coding Sessions" component reproduced part-for-part. Borrowing a grid is fair; reproducing a component is not. |

Two bugs found by verification, both fixed:

- **`.switch__stage` needed an explicit `minmax(0, 1fr)` track.** An implicit
  `auto` track sized itself to the widest content, and at ≤767px the crop rule
  gives the image a 720px min-width — so the track grew to 754px, the panels
  grew with it, and **the whole document scrolled sideways on a phone.** The
  frame's own `overflow: hidden` was clipping the image but could not shrink a
  track that had already been sized around it. Verified clean at 320, 360, 375,
  390, 414, 600, 768, 900, 1024, 1280, 1440 and 1920.
- **Authored `<br>` needed a preceding space.** Below 900px the break is
  neutralised with `br { display: none }`, and with no whitespace around it the
  hero rendered as "Leave the task.Keep your place."

Verified on the built page:

- 18 distinct rendered text/background pairs, **zero contrast failures**.
- `box-shadow`, `gradient`, `backdrop-filter`, `@keyframes`: **zero** in the
  four new stylesheets.
- Exactly **five** `--accent` instances: nav pill, hero anchor, hero fold
  underside, active switcher underline, install anchor.
- The 4.0 switcher renders and operates **identically with JavaScript
  disabled**; exactly one panel is visible at a time and the accent underline
  follows the checked label.
- No third-party subresource. Link and asset integrity: zero problems.
- Heading outline: one `h1`, then six chapter `h2`s. No heading is set in
  `--text-3`.

### §10 — the sub-routes, done

`/setup/`, `/privacy/` and `404.html` now share the shell. `css/base.css`,
`css/site.css` and `js/site.js` are **deleted**; the site is five stylesheets
and one 60-line script.

The prose was **not rewritten.** `css/doc.css` restyles the class names those
documents already used — `.wrap`, `.railed`, `.rail`, `.marker`, `.prose`,
`.toc`, `.note`, `.code`, `.cmt`, `.lede` — under the new tokens. That moved
~1,000 lines of verified policy and setup copy between design systems without
touching a word of it, which is the only safe way to migrate a privacy policy.

What changed on those pages beyond the shell:

| | |
|---|---|
| `js/site.js` | Deleted. It carried scroll-reveal, a scroll-stuck nav, a tablist, an FAQ accordion and a copy button — **none of which the sub-routes used** (zero `data-*` attributes between them). Scroll-reveal is forbidden by §4.6 anyway. |
| The `no-js` class and its 2.5s timer | Deleted. It existed for the old homepage's JS-dependent states. These pages have none. |
| `<em>` | Weight and colour, not italic — §4.2 bans italics, and inline emphasis in a document is real enough to keep, just not slanted. |
| `.note` | A left rule and an indent, not a tinted box. There is no third surface. |
| TOC label | Demoted from `<h2>` to `<p id="toc-title">` — `--text-3` is never a heading, the same call the homepage's rack makes. |

Two further corrections found while porting:

- **The nav and footer lived in `sections.css`, which only the homepage loads.**
  The sub-routes rendered an unstyled brand SVG at full page width. Both blocks
  moved to `shell.css`, where shared page chrome belongs.
- **The file size was wrong on the homepage.** 5,495,778 bytes is **5.5 MB**
  decimal and 5.24 MiB binary. The homepage said 5.2 MB — the MiB figure —
  while `/setup/` said 5.5 MB. macOS Finder and the GitHub release page both
  report decimal, so 5.5 MB is what a visitor checking the download actually
  sees. Corrected in four places on the homepage and five in this document.

Verified across all four routes:

- **Zero contrast failures** — 18 rendered text/background pairs on `/`, 17 on
  `/setup/`, 16 on `/privacy/`, 7 on `404`.
- **No horizontal overflow** at 320, 375, 390, 768, 1024 and 1440 on every
  route. `pre.code` scrolls inside its own box, which is intended.
- One `<h1>` per route; no heading set in `--text-3` anywhere.
- No third-party subresource. Link and asset integrity: zero problems.

**Note on testing method:** `overflow-x: clip` on `html` means a page with real
overflow still reports `scrollX === 0`, so a scroll test gives false negatives.
Overflow must be checked with `documentElement.scrollWidth` against
`clientWidth`, or by measuring element rects — never by trying to scroll.
