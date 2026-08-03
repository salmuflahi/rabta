# The Cut — a hover and detail system for the Rabta site

**Date:** 2026-08-03
**Status:** approved
**Applies to:** `website/` — all four routes

## Problem

The site has exactly one piece of authored motion: the Return Receipt's 520ms
hinged fold. Everything else snaps. Several hovers — the nav links, the footer
links, the download row — change colour with no transition declared at all, and
a keyboard user gets a focus ring where a mouse user gets feedback.

There is no shared motion vocabulary to extend, so this establishes one.

## The gesture

The site's geometry is a 45° cut. The Receipt *turns* that cut over; that
gesture stays reserved to the Return Field, the Return Receipt and the Rabta
mark. Interactive elements *draw* it instead: a skewed block sweeps in from the
leading edge, its front face a genuine 45° diagonal, on the fold's own easing.

The diagonal reads on elements with height. On a 1px underline it is
imperceptible, so links share the system's direction and timing rather than a
visible diagonal. This is a deliberate limit, not an oversight.

## Governing rule

**Hover feedback means "this does something."** Only interactive elements
respond to the cursor. Scenery — the Return Field, the attached-pieces
manifest, product stages — does not, because a scene that reacts to the cursor
teaches an affordance that is not there.

Every `:hover` rule is written `:hover, :focus-visible`. There is no mouse-only
feedback anywhere on the site.

## Components

### 1. Motion tokens (`css/tokens.css`)

    --hover-dur: 180ms;

Reuses the existing `--ease-out`. One duration and one curve, so hover motion
cannot drift the way the current per-rule values have.

### 2. The sweep (`css/shell.css`)

A pseudo-element inset past the element's edges, skewed and translated out of
frame, translated to rest on hover or focus. `overflow: hidden` clips it to the
element's radius; `isolation: isolate` with `z-index: -1` keeps it behind the
label.

Sweep colours, chosen so the label's contrast rises rather than falls:

| element | resting | sweep | label |
|---|---|---|---|
| `.button--primary` | orange | ivory at 0.22 | petrol |
| `.button--quiet` | transparent | cool-panel | ivory |
| `.media-play` | petrol | orange | petrol on hover |
| `.copy` | transparent | cool-panel | ivory |

### 3. The underline sweep (links)

An orange 1px bar scaled from `scaleX(0)` at the left origin. Applies to
`.text-link`, `.text-link--dark`, `.nav__links a`, `.foot__links a`,
`.download__links a`, `.prose a` and `.toc a`.

Orange is legal here: this is action feedback, not decoration.

### 4. Current-route indicator

`.nav__links a[aria-current="page"]` holds that same orange bar at
`scaleX(1)` with no transition. The attribute already ships on `/setup/` and
`/privacy/` and currently has no visual expression at all — the markup says
"you are here" and the design says nothing.

### 5. Release-strip hairlines (`css/landing.css`)

Vertical hairlines between the three release facts, so they read as one
instrument panel rather than three floating strings. Removed at the mobile
breakpoint, where the strip becomes a single column. Static; no motion.

### 6. Tabular numerals

`font-variant-numeric: tabular-nums` on every monospace machine-value register:
the requirement line, the release strip, both figcaptions, the receipt
manifest, the availability line, the footer metadata and the copy control.
Numerals in a machine register should not jitter.

### 7. Download affordance

`.button--primary svg` translates 2px down on hover and focus — the arrow
depicts the action rather than decorating the button.

## Reduced motion

No special handling. `css/shell.css` already collapses every transition to
0.01ms under `prefers-reduced-motion: reduce`, including on `::before` and
`::after`. The sweep's rest position *is* the correct hover appearance, so the
feedback survives and only the travel disappears.

## Where the idea met the contract

Three ideas collided with a rule. None is dropped; each is rebuilt so the rule
and the intent both survive.

### 8. The loop playhead — instead of a cursor-tracked highlight

A cursor glow needs a radial gradient, and gradients are banned. The intent
behind it — the product stage feeling alive under attention — is better served
by showing something true rather than something decorative.

Both stages carry a 1px track along the bottom of the frame with a cool-field
fill following the loop's real position. It tells you the loop is eight seconds
rather than a gif, it gives the Play/Pause control a context, and it is flat
colour reporting actual state — which is the same reason the restore result is
shown honestly rather than summarised.

Driven by `timeupdate`; the track is absent until a source is attached, so a
scriptless or data-saver visitor never sees an empty gauge.

### 9. The chapter index rule — instead of a scroll-reveal

A fade-and-rise on every section is the reflex of the generic startup page the
brief exists to avoid, and the chapters already earn their entrance through
spacing. What the idea was reaching for is a sense of a chapter *opening*.

Each chapter eyebrow gains a short orange rule that draws itself once as the
chapter enters — the hover system's own direction and timing, at chapter scale,
marking an opening the way an instrument marks an index. One 28px line per
chapter, not a page-wide fade.

Safe by default: the rule is drawn at rest in CSS, and JavaScript opts elements
into being animated. A script failure leaves every rule present.

### The diagonal stays motion-only

A static 45° corner *is* the reserved shape, so no ordinary element gains one.
The cut appears as the leading edge of a sweep and disappears when the sweep
finishes — the fold's geometry without spending the fold.

### Not built: receipt texture

Grain fights "flat surfaces, no third hue", and the flat alternative — a
perforation rule — would be a sixth horizontal line on the one element that is
already the strongest thing on the site. This is addition for its own sake.

## Verification

- Contracts pinning the shared duration and curve, that no `:hover` rule exists
  without a `:focus-visible` partner, and that the current-route indicator is
  styled.
- Contrast recomputed for every sweep end state.
- No horizontal overflow introduced at any of the eight audited widths.
