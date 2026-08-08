# Desktop app UI — Mac-native redesign

Date: 2026-08-07
Status: approved design, ready for planning
Scope: `apps/desktop` only

## Problem

The desktop app reads as a web dashboard rather than a Mac application, and
does not hold up next to premium desktop apps like Claude and ChatGPT. Six
concrete causes, in order of impact:

1. **Every group is a bordered box.** Cards use a visible 1px border over a
   filled surface — the shadcn/Vercel dashboard idiom. Premium Mac apps carry
   almost no card borders; separation comes from spacing and elevation.
2. **A brand colour is doing a system colour's job.** Petrol `#102526` fills
   the entire canvas. Mac apps keep the canvas near-neutral so content carries
   the colour.
3. **Too many accent hot spots.** Orange appears at full saturation on Approve,
   Resume, Restore, the active-task rail and the Context Fold. The Overview
   screen has five competing focal points.
4. **No material depth.** Surfaces are flat fills with drawn outlines, rather
   than lit, elevated planes.
5. **Web typography.** Inter at 16px/25px on a web type scale.
6. **Inconsistent density.** Connectors is two small cards in a mostly empty
   page; Capsules is a dense table. The rhythm does not hold across screens.

The existing code is not the problem. `shell/Sidebar.tsx` and `shell/AppShell.tsx`
contain deliberate, well-reasoned work (the collapse morph, traffic-light
alignment, the Context Fold motif, motion tokens). This is a change of aesthetic
direction, not a rescue.

## Decisions

Each was chosen explicitly during design. Rationale is recorded because the
reasoning matters more than the value if these are revisited.

| Decision | Choice | Why |
| --- | --- | --- |
| Canvas | Neutral, brand demoted to accent | A brand colour as canvas is what reads "branded web app" |
| Dark theme | Whisper petrol — trace tint at ~6% saturation | Sidebar and canvas must share a hue; a hue jump reads as two unrelated materials |
| Light theme | Clean neutral, no tint | Chosen over a matched cool tint; see *Known asymmetry* |
| Accent | Orange, at most one per view | Enforced by the primitive layer, not by discipline |
| Depth | CSS-simulated | Native vibrancy costs App Store eligibility and cannot appear in screenshots |
| Type | SF Pro via `-apple-system`, Mac scale | Highest-leverage single change for native feel |
| Sidebar mark | `rabta-mark-mono.svg` in ivory | The tiled mark is petrol-on-petrol in the sidebar, i.e. invisible |
| Structural depth | Restyle + surgical content edits | Nav, routes and store are sound; the visual system is the problem |
| Execution | Foundation → primitives → screens | The bordered-box problem is a primitive problem, not a screen problem |

### Why not native vibrancy

Tauri's `windowEffects` (macOS `sidebar` material) requires `transparent: true`,
which on macOS requires the `macos-private-api` feature flag, which per Tauri's
own documentation **prevents App Store distribution**. Separately, the screenshot
rig in `capture/capture.mjs` drives **headless Chrome** at 1280×800 @2x, not the
Tauri WebView — so native vibrancy could never appear in the marketing images
regardless. Cost on both sides, benefit on neither. `tauri.conf.json` and
`src-tauri/Cargo.toml` are untouched by this work.

### Known asymmetry

Dark mode carries a ~6% petrol tint; light mode carries none. This is a
deliberate, accepted inconsistency. At 6% saturation the tint sits near the
perceptual threshold, so the two themes still read as one application — unlike
the warm-cream-vs-cool-dark pairing that was rejected for this reason.

## Visual system

### Colour tokens

Replaces the palette in `src/index.css`. Format stays HSL triplets so the
existing Tailwind binding in `tailwind.config.js` keeps working unchanged.

**Dark — whisper petrol**

| Token | HSL | Hex |
| --- | --- | --- |
| `--sidebar` | `189 15% 9%` | `#141A1B` |
| `--background` | `192 8% 12%` | `#1D2122` |
| `--card` (raised) | `190 7% 16%` | `#272C2D` |
| `--muted` (grouped) | `190 8% 15%` | `#232829` |
| `--foreground` | `180 14% 95%` | `#EFF3F3` |
| `--muted-foreground` | `185 5% 56%` | `#8A9596` |
| `--tertiary-foreground` | `185 5% 45%` | `#6C7778` |
| `--border` | `180 50% 88%` | `#D2F0F0`, used at low alpha |
| `--primary` | `18 100% 59%` | `#FF6B2C` |
| `--primary-foreground` | `19 38% 8%` | `#1D120D` — existing value, unchanged |

**Light — clean neutral**

| Token | HSL | Hex |
| --- | --- | --- |
| `--sidebar` | `0 0% 94%` | `#EFEFEF` |
| `--background` | `0 0% 98%` | `#FAFAFA` |
| `--card` (raised) | `0 0% 100%` | `#FFFFFF` |
| `--foreground` | `240 3% 12%` | `#1D1D1F` |
| `--muted-foreground` | `240 2% 48%` | `#78787D` |
| `--tertiary-foreground` | `240 3% 61%` | `#99999E` |
| `--border` | `0 0% 0%` | black, used at low alpha |
| `--primary` | `18 100% 59%` | `#FF6B2C` |
| `--primary-foreground` | `0 0% 100%` | `#FFFFFF` |

**Two binding constraints on these tokens.**

`tailwind.config.js:25` binds `border: "hsl(var(--border))"`, so `--border`
**must stay an HSL triplet** — a raw `rgba()` value would compile to
`hsl(rgba(…))` and silently break every border utility in the app. Hairlines get
their transparency from Tailwind's opacity syntax at the call site instead:
`border-border/[0.055]` in dark, `border-border/[0.07]` in light.

`--tertiary-foreground` is a **new** token with no existing binding. It needs a
matching entry in `tailwind.config.js` alongside the other colour bindings, or
it will not be reachable from a utility class.

Semantic status colours (`--success`, `--warning`, `--info`, `--destructive`)
keep their current roles but must be re-checked for contrast against the new
canvases. They are no longer competing with a petrol background.

### Elevation

Depth is achieved differently per theme, because the technique that works in
dark mode does not work in light.

**Dark** — a lit top edge plus a two-stage shadow:

```css
box-shadow:
  inset 0 1px 0 rgba(210,240,240,.06),   /* lit edge, reads as light from above */
  0 1px 2px rgba(0,0,0,.35),
  0 4px 12px rgba(0,0,0,.22);
```

**Light** — shadow only. `inset 0 1px 0 rgba(255,255,255,…)` is invisible on a
white surface, so light mode leans entirely on soft two-stage shadows:

```css
box-shadow:
  0 1px 2px rgba(0,0,0,.09),
  0 4px 12px rgba(0,0,0,.06);
```

Two elevation levels only:

- **Raised** — the one hero surface per screen (active task, pending approval).
- **Grouped** — list containers, one step below raised, internal hairlines
  between rows.

No third level. No drawn borders on either.

### Typography

```
font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
font-mono:   ui-monospace, "SF Mono", Menlo, monospace;
```

| Role | Size / line-height | Weight | Notes |
| --- | --- | --- | --- |
| Toolbar title | 13 / 16 | 600 | `-0.01em` |
| Body | 13 / 16 | 400 | |
| Body emphasis | 13 / 16 | 590 | SF's semibold |
| Secondary | 11 / 14 | 400 | `--muted-foreground` |
| Section label | 11 / 14 | 600 | `--tertiary-foreground` |
| Large title | 17 / 22 | 600 | empty states only |
| Mono | 11 / 14 | 400 | branches, paths |

`@fontsource-variable/inter` is removed from `package.json` and from the
`src/index.css` import. Times and counts use `font-variant-numeric: tabular-nums`.

### Density

| Element | Now | New |
| --- | --- | --- |
| Nav row height | 40px | 25px |
| List row | ~44px | 32px min |
| Toolbar height | 60px | 38px |
| Workspace padding | 36px (`p-9`) | 16px |
| Sidebar, expanded | 280px | 208px |
| Sidebar, collapsed | 88px | 88px — unchanged, see below |

**Sidebar collapse constraint.** The collapsed rail must stay at 88px: macOS
overlays the traffic lights at x≈18 with a ~52px span, so anything narrower
clips them. With the tighter row metrics the icon tile no longer fills that
rail, which means the current "icons never shift horizontally between states"
invariant documented in `Sidebar.tsx` **cannot be preserved**. This design
deliberately trades it away — icons centre in the collapsed rail and shift
~17px during the transition, animated over `--motion-sidebar`. The implementer
should verify this reads acceptably; if it does not, the fallback is to increase
expanded-state left padding so the icon centre matches the collapsed centre,
at the cost of a more indented expanded rail.

### Motion

Existing tokens are correct and are kept unchanged: `--motion-fast` 120ms,
`--motion-standard` 180ms, `--motion-sidebar` 280ms, `--ease-standard`
`cubic-bezier(0.22, 1, 0.36, 1)`. The `data-motion="reduced"` path in
`ThemeProvider` continues to govern.

### Accent discipline

The house rule is already set by `docs/design-brief-pins-and-focus-mode.md`:
**orange means one thing only — the live thing, or the primary action. A page
has one primary action.** This spec adopts that verbatim and adds the
enforcement it was missing:

- Only `<Button variant="primary">` may paint the accent as a **fill**, and a
  test asserts at most one per page.
- The **live** indicator (active task, active capsule) may also carry orange,
  but as a mark — a dot or rail — never a fill competing with the button.
- Secondary actions render as plain text buttons; destructive actions use
  `--destructive` and are exempt from the count.

### Colour is never the only signal

Also from the brief, and binding on every state in this redesign: **every state
needs a non-colour cue too.** The mockups leaned on coloured dots alone for
capsule and connector status, which violates this. Every status must pair its
colour with a shape, icon, weight or text difference — a filled versus hollow
dot, an icon change, a label. This applies to item states, connector states,
and restore outcomes alike.

The Context Fold motif is retired from nav rows. It added a second orange
element to every screen and fought the new selection surface. The motif can
survive on the website, where it originated.

## Primitives

Built before any screen work. Each ships with its own tests.

| Primitive | Purpose |
| --- | --- |
| `Section` | Label + children. No border, no background. Optional trailing action link. |
| `Surface` | Elevated container. `variant="raised" \| "grouped"`. Owns all elevation CSS. |
| `Row` | List row inside a grouped `Surface`. Leading icon/dot, title, subtitle, trailing slot. Hairline between siblings, never on the last child. |
| `Field` | Settings row: label, optional description, trailing control. |
| `Card` | Existing `components/ui/card.tsx` is re-pointed at `Surface` and its border removed, so unmigrated call sites improve automatically rather than breaking. |

## Screens

Nav, routes, `NavKey` and the store are unchanged. All six destinations remain.

**Overview** — the one screen with real content edits.
- Remove the three stat tiles. Counts move to sidebar rows as small tabular
  numerals next to the destination that owns them.
- Remove the `WORKSPACE` eyebrow / 26px title / subtitle stack (~90px of chrome
  restating the sidebar). The title moves into the toolbar.
- Promote the active task to the single raised `Surface` at the top, carrying
  the screen's only orange button.
- "Continue Working", "Connected Apps" and "Recent Activity" survive as grouped
  `Surface` lists. Only the stat tiles are removed.

**Capsules** — structure kept; restyled to grouped `Surface` per project, mono
11px for branch and path, tabular-nums for saved times, one orange on the active
capsule's Restore. This screen also hosts the curate surface — see *Defined
workspaces* below.

**Projects** — grouped rows. `@dnd-kit` sorting behaviour unchanged.

**Connectors** — fixes the sparse page. The pending-approval banner becomes the
raised `Surface`; connected apps become grouped rows instead of two floating
cards in empty space.

**Activity** — grouped rows with a tabular-nums time column.

**Settings** — rebuilt on `Field` within `Section` groups.

**Toolbar** — 38px, title and status inline at the left, search to the right
with its ⌘K hint.

## Defined workspaces

The pins + focus mode feature (`docs/superpowers/specs/2026-08-04-defined-workspaces-design.md`,
`docs/design-brief-pins-and-focus-mode.md`) is **already implemented** —
`store.ts:79` holds `focusMode`, `SettingsPage.tsx:200` toggles it,
`CapsuleItems.tsx` carries the pin model, and `capsules.rs` has `merge_pins`.
Its brief names three things that still need design, all of which land inside
this redesign rather than beside it.

### 1. The curate surface

Four item states across three kinds (tabs, files, terminals), scannable at
**tens of items, not five**:

| State | Meaning | Cue |
| --- | --- | --- |
| Pinned | Part of the workspace definition; opens every switch | Filled pin icon + weight |
| Loose | Captured because it was open | No icon |
| Pinned but gone | Pin outlived its item (`merge_pins`) — must still render and still offer unpin, or it becomes "always open" with no way to stop it | Outline pin + muted title |
| Not pinnable | Terminal with no reconstructable command; pinning would silently never work | Disabled pin + tooltip giving the reason |

Built on the `Row` primitive inside grouped `Surface`s, one group per kind.
Pin state is a leading affordance, not a trailing one, so a column of pins is
scannable down the left edge. Per the brief, the disabled pin **must explain
why it is disabled**, and every state carries a non-colour cue.

### 2. The put-away receipt

Currently one muted line at `RestoreExperience.tsx:443`:
`text-xs text-muted-foreground` rendering `"6 put away · 2 kept — …"`. It is
the **only** place a user learns their tabs were closed, and a footnote is the
wrong weight for that.

Promote it to a grouped `Surface` inside the restore sheet, listing what was
put away and what was kept with each reason. The seven refusal reasons are
fixed and come back verbatim from the connectors: `pinned in the browser`,
`incognito`, `the last tab in its window`, `unsaved changes`,
`running something`, `no longer open`, `not an http(s) page`.

It must read as **calm and factual, not as an error** — refusing is the system
working correctly. So: no `--destructive`, no warning iconography, no orange.
Neutral foreground, same visual weight as any other grouped list.

### 3. Focus mode discoverability

A destructive-feeling setting that a user who wants it will never find, and
that a user who finds it should understand before enabling. The Settings
`Field` gains a short description of the guarantee (stash first, then close;
busy terminals never closed), so the promise is legible at the point of
decision. Beyond that, discoverability is a product question rather than a
restyling one, and is **deferred** — this redesign does not invent a new
surface for it.

### Superseded constraint

The brief states *"Existing type scale is Inter, 400–600 only."* That is
superseded by the SF Pro decision in this spec. Weights stay in the 400–600
band; only the family changes.

## Out of scope

- Navigation structure, routes, `store.ts`, Tauri commands, Rust code
- `tauri.conf.json`, `Cargo.toml`, native window effects
- The website — a separate project, sequenced after this one
- The support email address and new demo video — both belong to the website work
- A new discoverability surface for focus mode (see above — deferred)

**Explicitly do not design these.** The pins brief considered and rejected all
four; showing any of them would promise something the software cannot do:
hiding other applications' windows, Chrome tab groups, reusable workspace
templates, a "never reopen this" list.

## Copy style

From the pins brief, applied to all new and rewritten strings: sentence case,
no exclamation marks. Name what is true, then what to do about it. Never claim
more than the software does.

## Testing

The suite is 192 cases across 22 files. Most are behavioural and survive a
visual change untouched.

- `OverviewPage.test.tsx:34` — `"renders stat cards and recent activity when
  data is seeded"`. Its assertion is `findAllByText("Connected Apps")` with
  `toBeGreaterThanOrEqual(1)`, which still passes once the stat tile is removed
  because the section heading remains. Only the test name and the comment at
  lines 76–77 go stale and need updating.
- `RestoreExperience.test.tsx:178` — `"renders the put-away receipt with the
  closed count and deduped kept reasons"` asserts via `getByText(/put away/)`
  and `toHaveTextContent`. Promoting the receipt from a single line to a listed
  surface **will** change that text. This test must be rewritten deliberately,
  not coerced into passing — it encodes the dedupe-reasons behaviour, which
  still has to hold.
- `RestoreExperience.test.tsx:208` — `"renders nothing extra when focus mode
  closed and kept nothing"` must keep passing unchanged: an empty receipt still
  renders no surface at all, not an empty one.
- New tests: one per primitive, the one-accent-per-view assertion, and the four
  curate item states — particularly *pinned but gone* (still renders, still
  unpinnable) and *not pinnable* (disabled, and able to say why).
- Full suite must pass before screenshots are regenerated.

## Screenshots

After the redesign lands, the site imagery is a pipeline rerun, not manual work:

```sh
cd apps/desktop && node capture/capture.mjs
cd /Users/sammy/rabta && python3 scripts/optimize-shots.py
```

This regenerates every shot against the seeded fixture in `capture/seed.ts` and
rebuilds the avif/webp/png derivatives at 640/1024/1600. The fixture may need
its copy refreshed, but no capture-rig changes are expected.

Note that `capture/mock-tauri.ts` and `capture/seed.ts` render the same React
components, so any prop-signature change to a page component must be reflected
in the capture harness or the shots will fail to build.

## Sequencing

1. **Foundation** — tokens, type scale, density, elevation utilities. One
   commit, cascades everywhere.
2. **Primitives** — `Section`, `Surface`, `Row`, `Field`; re-point `Card`.
   Tests land with them.
3. **Screens** — Overview first (it carries the content edits), then Capsules,
   Projects, Connectors, Activity, Settings.
4. **Verify** — full suite green, then regenerate screenshots.

Nothing here is committed to the live site. The website redesign is a separate
spec, to be written after this ships.
