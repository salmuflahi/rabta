# Console v2 — Phase 1: design system and chrome

Date: 2026-08-09
Status: approved design, ready for planning
Scope: `apps/desktop` only
Source: `design_handoff_rabta_console/` — `Rabta - Console v2.dc.html`, `README.md`, `icons/`

## What this is

A second pass over the desktop app, from a high-fidelity design handoff. It is
**not** a replacement for the Mac-native redesign that shipped on
`design/app-ui-mac-native-redesign` — it is built directly on top of it. The
handoff's palette is identical to the one we shipped, value for value, in both
themes:

| | Handoff | Shipped |
| --- | --- | --- |
| Light sidebar / canvas / raised / grouped / secondary | `#EFEFEF` `#FAFAFA` `#FFFFFF` `#F5F5F5` `#EBEBEB` | same |
| Dark sidebar / canvas / raised / grouped / secondary | `#141A1B` `#1D2122` `#272C2D` `#232829` `#2F3637` | same |
| Text / secondary / tertiary / border, both themes | identical | identical |

It even carries the phrases "clean neutral (zero saturation, deliberately)" and
"whisper petrol (petrol survives at ~6% saturation)" from our spec. Nothing built
in the previous arc is discarded; the primitives, the accent gate, the shared
metric modules and the test suite all carry forward.

The handoff states its own fidelity bar: *"Colors, typography, spacing, radii,
timings and copy are final and should be matched exactly."* Treat every value in
it as authoritative unless this spec records a deliberate divergence.

The handoff also says, of the privacy copy: *"Keep that copy. It is the product's
positioning, not decoration."* That copy is a requirement, not a suggestion.

## Phasing

| Phase | Contents | Status |
| --- | --- | --- |
| **1 — this spec** | Tokens, accents, typography, metrics, elevation, the macOS control set, the icon sprite, and the window chrome (sidebar, toolbar, status bar) | approved |
| 2 | The five master/detail screens — Capsules, Projects, Connectors, Activity, Settings | not yet specced |
| 3 | **Migrate** — send/receive a whole setup to another Mac | not yet specced; needs a Rust backend that does not exist |

Migrate is separated deliberately. Its sheet is the small part; behind it sit
bundle export/import, passphrase encryption, a nearby-transfer pairing protocol,
path remapping across projects, git cloning and collision resolution. That is a
backend project with its own spec, not a design port.

## Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Selected nav row | **Neutral surface, not an accent fill** | The handoff fills it with the accent, which puts two permanent oranges on every screen alongside the toolbar's contextual action. Compared side by side, the neutral version sends the eye to the action rather than the navigation. Our one-accent rule and its test stand unchanged. |
| Elevation model | **Adopt the handoff's hairline ring** | Supersedes our lit-edge model. See below. |
| Accounts | **No** | The handoff states it outright — *"The app has no account and must never greet the user by name"* — and repeats the promise in five places. Migrate exists precisely because there is no cloud; adding accounts would make the handoff's largest feature pointless. |
| Subscription | **Deferred**, seam already in place | `src/lib/entitlements.ts` (commit `a28c081`) answers "is this capability available?" in one place and returns true for everything. |
| Icons | **Adopt the 35-glyph sprite**, drop lucide from chrome | The handoff ships a purpose-drawn sprite on a 16×16 grid, coloured via `currentColor`. |

### The elevation model changes

Phase 1 **supersedes** the lit-edge elevation from the previous arc. The handoff
specifies:

```
card:  0 0 0 0.5px <border>, 0 1px 2px <shadow>
modal: 0 0 0 0.5px <border>, 0 24–30px 70px <shadow-lg>
```

and gives the reason: *"Cards do not use `border`; the hairline is the first
shadow ring. This keeps borders from doubling where cards sit next to hairline
dividers."*

That is a better answer to a real problem than ours was, and it is flatter and
more literally macOS. `Surface` keeps its API (`variant="raised" | "grouped"`)
and stays the only owner of elevation; only the values behind
`--shadow-raised` / `--shadow-grouped` change. The `inset 0 1px 0` lit edge is
removed.

**`Surface` still draws no `border` utility.** The hairline now arrives as a
shadow ring, so `expectNoBorder` continues to hold and its tests stay valid.

## Tokens

### Accents — four, user-selectable

New. Each has light and dark variants so it stays legible on both surfaces.
Default is Tangerine, which is today's `--primary`.

| Accent | Light base / hover / text | Dark base / hover / text |
| --- | --- | --- |
| Tangerine | `#FF6B2C` / `#F0561A` / `#C2501B` | `#FF6B2C` / `#FF7F45` / `#FF8A5C` |
| Petrol | `#14494C` / `#0E3739` / `#14494C` | `#2E8286` / `#379A9E` / `#67BFC2` |
| Sky | `#2E6F88` / `#245A70` / `#2E6F88` | `#3E8DAB` / `#4A9DBC` / `#7FC2DB` |
| Sand | `#9A6A12` / `#7E560D` / `#8A5F10` | `#C08A2A` / `#D19A36` / `#DFB259` |

- `accent-soft` — the base at **14% alpha in light, 20% in dark**. Chip and
  selection-tint backgrounds.
- `accent-text` — accent-coloured text on a soft background. **Never use the base
  for small text on light.**

Selecting an accent writes four custom properties onto the document root.

### Semantic

| Role | Light | Dark | Used for |
| --- | --- | --- | --- |
| ok | `#178F79` | `#46B79E` | connected, done, "restores now", "can see" |
| warn | `#B07B1E` | `#D6A342` | uncommitted git, "on next reload", missing app |
| bad | `#B3402E` | `#E27A66` | "never sees", disconnect |
| ok-soft | `rgba(23,143,121,.12)` | `rgba(70,183,158,.16)` | Done chip |
| warn-soft | `rgba(176,123,30,.14)` | `rgba(214,163,66,.16)` | dirty-git chip |

### Surfaces and overlays

Light: field `#FFFFFF`, hover `rgba(0,0,0,.05)`, shadow `rgba(0,0,0,.05)`,
shadow-lg `rgba(0,0,0,.28)`, scrim `rgba(0,0,0,.18)`.

Dark: field `#232829`, hover `rgba(255,255,255,.07)`, shadow `rgba(0,0,0,.4)`,
shadow-lg `rgba(0,0,0,.6)`, scrim `rgba(0,0,0,.5)`.

**Binding constraint carried forward:** `index.css` applies
`* { @apply border-border; }`, so `--border` is the default border-colour for
every element and must stay a bare HSL triplet. `tailwind.config.js` binds
`hsl(var(--border))`.

## Typography

System font throughout: `-apple-system, BlinkMacSystemFont, "SF Pro Text"`.
Mono is `ui-monospace, "SF Mono", Menlo` and is used **only** for paths, branch
names, URLs, JSON payloads, capability names, keyboard shortcuts and the
migration code — **never for UI labels**.

| Use | Size / weight / tracking |
| --- | --- |
| Body, list rows, nav | 13 / 400 / −0.003em |
| Selected nav + list rows | 13 / 510 |
| Toolbar title | 13 / 590 / −0.005em |
| Screen title (h1) | 22 / 640 / −0.02em |
| Overview date (h1) | 24 / 640 / −0.02em |
| Sheet title | 16 / 640 / −0.015em |
| Card title | 14–15 / 590 |
| Section label | 12 / 600 / text-secondary |
| Group header | 11 / 600 / text-tertiary |
| Secondary text | 12–12.5 / 400 / text-secondary |
| Meta, timestamps | 11.5 / 400 / text-tertiary |
| Status bar | 11 / text-secondary |
| Mono inline | 11.5 |
| Payload `<pre>` | 10.5 / line-height 1.6 |

Weights now reach **640**, above the 400–600 band the previous arc held to. That
constraint is lifted for this phase.

Columned numbers — counts, timestamps, the port stepper — use
`font-variant-numeric: tabular-nums`.

## Metrics

| Token | Value | Today |
| --- | --- | --- |
| Sidebar width | **216px** | 208 |
| Toolbar height | **52px** | 38 |
| Status bar height | **26px** | none |
| Nav row height | **28px** | 25 |
| List column width | 296px (Settings 216px) | n/a |
| Activity inspector | 320px | n/a |
| Content max width | 720 detail · 660 Overview · 640 Settings | none |
| Content padding | 30–40px top, 32px sides | 16 |
| Hairline | 0.5px, always the `border` token | 1px |
| Radius | cards/grouped 10 · buttons/fields 6 (7 at 28px tall) · sidebar rows 6 · list rows 7 · palette 14 · chips 999 | mixed |

**Extend the existing shared-metric modules rather than hardcoding.**
`src/shell/titlebar.ts` and `src/shell/navRow.ts` already export paired
`_PX`/`_CLASS` constants pinned by DOM-reading tests. Both exist because those
exact numbers drifted apart twice in the previous arc — once leaving the titlebar
hairline 22px out of alignment, once leaving the sidebar selection pill 12px off
by the last nav row. Every metric that two files must agree on goes there.

### Traffic lights must be re-tuned

`trafficLightPosition` is currently `{ x: 18, y: 17 }`, measured and centred
against the **38px** titlebar. The handoff specifies 12px circles, 8px gap, first
light **13px from the window edge**, in a **52px** strip.

Both values change. Note from the last tuning: **macOS applies its own offset on
top of the config value** — at `y: 17` the light's top edge measured 13pt, not 17.
The number is a relative dial, not a coordinate. Re-tune by measuring the running
window, not by arithmetic.

### The sidebar toggle is pinned

Its left edge sits at exactly **73px** from the window edge, and it occupies the
same coordinates whether it renders in the sidebar strip (open) or the toolbar
(collapsed). The handoff calls this an explicit requirement. It must not move
between states.

Sidebar collapse is **instant, not animated** — the handoff records that
animating it was tried and cut.

## Controls

Six macOS-shaped controls, all new. Each ships with tests.

| Control | Specification |
| --- | --- |
| **Segmented** | 2px-padded track on secondary, 7px radius; selected segment is the raised surface with `0 1px 2px shadow, 0 0 0 0.5px border`, weight 510 |
| **Switch** | 36×21 track, 17px knob, 15px travel via `translateX`, 170ms `cubic-bezier(.32,.72,0,1)`; track fades accent ↔ text-tertiary over 170ms |
| **Swatch** | 18px circles; selected gets a 1.5px surface-coloured ring plus a 3.5px ring in its own colour |
| **Stepper** | value in tabular mono, then stacked up/down chevrons (17×11 each) sharing a hairline |
| **Kbd** | 20px pill on secondary, mono 11px |
| **Push button** | 28px tall, 7px radius |

## Chrome

**Sidebar** — 216px, sidebar colour, 0.5px right hairline. A 52px top strip holds
the traffic lights and the pinned toggle. Below: the Rabta mark (19px, 5px
radius) plus wordmark. Then nav groups — **Workspace** (Overview, Capsules,
Projects) and **This Mac** (Connectors, Activity). Settings is pinned at the
bottom with a `⌘,` hint, and beneath it a shield line: **"Everything stays on
this Mac"**.

Nav rows are 28px, 6px radius, 8px horizontal padding, 15px icon + 13px label +
right-aligned count. **Selected uses the neutral secondary surface at weight
510** (this spec's divergence — the handoff fills it with the accent). Unselected
counts are text-tertiary; Connectors shows its live count in `ok`.

**Toolbar** — 52px, chrome colour with `backdrop-filter: saturate(180%)
blur(24px)`, 0.5px bottom hairline. Left to right: traffic lights and toggle when
the sidebar is collapsed, back/forward chevrons (back disabled at 50% opacity),
the view title, spacer, a 196px search field that opens the command palette, and
a contextual accent action — "New capsule" on Overview and Capsules, "Add
project" on Projects, "Add connector" on Connectors, nothing on Activity or
Settings.

**Status bar** — 26px, chrome colour, 0.5px top hairline. Left: green dot +
"Cursor and Chrome connected". Right: "Last capture 12m ago". Hidden when
Appearance › Status bar is off.

## Motion

| What | Timing |
| --- | --- |
| Pane change | 150ms ease-out, opacity + 2px rise |
| Palette open | 120ms `cubic-bezier(.2,.7,.3,1)`, opacity + scale .97→1 |
| Sheet open | 300ms `cubic-bezier(.32,.72,0,1)` slide from above |
| Scrim | 100–140ms fade |
| Button hover | 110ms |
| Button press | `filter: brightness(.94)` |
| Switch knob | 170ms `cubic-bezier(.32,.72,0,1)` |
| Live dot | 2.2s infinite ping |

All of it collapses under `prefers-reduced-motion: reduce`. The existing
`data-motion="reduced"` path in `ThemeProvider` continues to govern.

## Other behaviour

- `cursor: default` on every control — macOS does not use a pointer cursor for
  buttons.
- All chrome is `user-select: none`; payloads and inputs are selectable.
- Scrollbars: 12px overlay-style, 7px-radius thumb inset by a 3.5px transparent
  border.
- Inputs take a 3px `accent-soft` focus ring.

## Store

`src/store.ts` was on the previous arc's do-not-edit list. **That constraint is
lifted for this phase**, narrowly: `prefs` gains `accent` and `statusbar`, and
both must be persisted and wired live (theme already is). No other store change
is in scope.

## Out of scope

- The five master/detail screens — Phase 2
- Migrate, in any form including UI-only — Phase 3
- Everything the handoff lists under **"Not yet designed"**: restore report,
  capture confirmation, drift warning, empty/first-run state, connector pairing
  approval, menu bar extra, real macOS menu bar. The handoff is explicit: *"Do
  not invent them — they need design first."*

### One reconciliation needed before Phase 2

The handoff lists **"Restore report"** as its biggest undesigned gap, but we
shipped exactly that last night — the restore sheet with the put-away receipt
promoted out of a footnote (`RestoreExperience.tsx`). The handoff predates it.
Phase 2 must decide whether the shipped sheet stands, is restyled to the new
system, or is replaced by a designed report. **Nothing in Phase 1 touches it.**

## Testing

The suite is 317 cases and must stay green.

- `expectAtMostOneAccent` is unchanged, and the neutral-selection decision is
  what keeps it valid. Any later move to an accent-filled nav row requires
  amending the helper deliberately, not incidentally.
- `titlebar.test.tsx` and `navRow.test.tsx` read the real rendered DOM and will
  fail on the 38→52 and 25→28 changes. That is correct — update the constants,
  and the tests follow.
- `expectNoBorder` still holds: the hairline is a shadow ring, not a border
  utility.
- New tests: one per control, accent switching repaints the root custom
  properties, the status bar honours its preference, and the sidebar toggle sits
  at 73px in both states.
- `pnpm test` **and** `pnpm exec tsc -b --noEmit` must both be clean. The
  previous arc left the typechecker red for three tasks by only running tests.

## Screenshots

Regenerate after Phase 1 lands:

```sh
cd apps/desktop && node capture/capture.mjs
cd /Users/sammy/rabta && python3 scripts/optimize-shots.py
```

`capture/seed.ts` and `capture/mock-tauri.ts` render the same components, so any
prop-signature change must be mirrored there. A missing mock handler silently
renders the app's error panel into the screenshots — that happened last arc and
was only caught by looking at the images.
