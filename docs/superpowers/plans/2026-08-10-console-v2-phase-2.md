# Console v2 — Phase 2 Record

**Status:** complete. Branch `feat/console-v2-phase-2`, off `feat/console-v2-phase-1`.

This is a record, not a forward plan: Phase 2 was executed in one pass at
the product owner's request ("do the entire phase 2 without stopping"), so
what follows documents what shipped, what diverged from the handoff, and
what is deliberately still open. Phase 1's plan
(`2026-08-09-console-v2-phase-1.md`) named the five master/detail screens
and three migrations as Phase 2's scope; all of it is done.

**Handoff:** `/Users/sammy/Downloads/design_handoff_rabta_console/` —
`README.md` and the prototype markup are authoritative for every value.

---

## What shipped

| | |
| --- | --- |
| Shell | Sidebar toggle pinned; collapse animated |
| Tokens | `--success`/`--warning`/`--info` retired for `--ok`/`--warn`/`--bad` |
| Controls | `switch-mac` is the only switch; Segmented, Swatch, Stepper mounted |
| Overview | Date, glance line, hero capsule with tool chips, Also open, Recent |
| Capsules | 296px master/detail, Open/Done filter, What's inside, History |
| Projects | 296px master/detail, dirty dot, branch/git chips, capsules, issues |
| Connectors | 296px master/detail, Can see / Never sees, capability table |
| Activity | Two-pane event browser, 320px Details with the raw payload |
| Settings | 216px section list, grouped cards, Accent + Status bar wired live |
| Palette | Spotlight-shaped, 600px at 118px, default items, settings targets |
| Icons | Shared UI primitives moved onto the sprite |

The shell's pane stopped scrolling and padding so master/detail screens can
run two independent scrollers edge-to-edge; each screen owns its own
scroller now. `page-in` was retoned to the Motion table's `pane-in`
(150ms, 2px).

---

## Deliberate divergences from the handoff

Each is commented at its call site; this is the index.

1. **The sidebar toggle is drawn once, not twice.** The handoff's
   requirement is that it "must not move between states". Phase 1 met that
   with two instances holding a shared 73px contract, which produced a bug
   the arithmetic could not catch: fullscreen dropped the row holding the
   sidebar's instance, and the Toolbar only drew its own while collapsed,
   so fullscreen + open sidebar had no toggle at all. One pinned instance
   makes the requirement structural. (`src/shell/SidebarToggle.tsx`)

2. **Sidebar collapse is animated.** The handoff says "Animating it was
   tried and cut." Reversed on the product owner's explicit call. The
   mechanism is a registered `@property --sidebar-width`, so the grid track
   interpolates; the panel's contents outlive the flag by one animation and
   slide off the left rather than an empty box wiping away.
   (`src/index.css`, `src/shell/sidebarMotion.ts`)

3. **Selected rows are neutral everywhere, never accent-filled.** The
   handoff fills the selected nav row, capsule row, project row and event
   row with the accent. Phase 1 already diverged for the sidebar; Phase 2
   extends the same reasoning to every master list. A selected row is
   permanently on screen, and each of those screens has a real accent
   action (Restore, the toolbar's contextual button) that the fill would
   compete with. The palette's highlighted row **is** accent-filled — that
   one moves with the keyboard and is exactly "the thing Enter will run".

4. **"What's inside" reports connection state, not Chrome-on-reload.** The
   handoff hard-codes the amber case to "Chrome … on next reload". That is
   true of its fixture, not of this app: `connectors/chrome/src/background.ts`
   implements a real `tabs.open` and reopens tabs live. Printing it anyway
   would be the app claiming something false about itself. The honest amber
   this app does have is a captured tool that isn't running.

5. **No Disconnect button on Connectors.** There is no disconnect command —
   connectors hold the socket and drop it themselves. A button that did
   nothing would be worse than saying so.

6. **Capsule History is the capture record.** The handoff draws a list of
   audit entries; this app keeps no per-capsule audit trail, so History is
   one row per captured tool, newest first, which is real.

7. **No Migrate section in Settings.** Migrate is Phase 3 in full. A
   section that opened a sheet which doesn't exist is worse than its
   absence.

8. **Activity drops its kind filter and free-text search.** The Details
   pane answers "what was in that event?" better than a substring match
   over stringified JSON did. If a real find-in-activity need appears it
   belongs in the palette, next to every other search in this app.

---

## Two Phase 1 bugs found and fixed en route

- **Two fontSize steps were named after colours** (`card`, `secondary`).
  Tailwind emits `.text-<key>` for both fontSize and textColor and puts
  textColor last, so both steps were unreachable and `text-card` had been
  silently painting a colour where a size was meant. Renamed `card-title`
  and `sub`, with a test that fails on any future collision.
- **`--primary-hover`, `--accent-soft` and `--accent-text` had no Tailwind
  binding**, so nothing could reach three tokens `applyAccent` repaints on
  every accent change.

---

## Still open

- **Migrate** — the whole flow (send, receive, the review step). Phase 3.
- **`lucide-react` cannot be removed.** The sprite is 35 glyphs drawn for
  the handoff's screens; this app has affordances the handoff never drew
  (pin, trash, spinners, git fetch, ahead/behind, three of the nine
  pickable project icons). The rule Phase 2 followed — migrate a file only
  when the sprite covers every glyph in it — and the exact list of what is
  left are written down in `src/components/ui/icon.tsx`.
- **Everything under the handoff's "Not yet designed"** — restore report,
  capture confirmation, drift warning, first-run state, pairing approval,
  menu bar extra, real macOS menu bar. *"Do not invent them — they need
  design first."*

---

## Verification

`pnpm test` (538), `pnpm exec tsc -b --noEmit` and `pnpm build` clean;
`node capture/capture.mjs` + `scripts/optimize-shots.py` regenerated.

Looking at the images caught three regressions no test did: the sidebar's
Projects count reading 0 from Capsules, the active capsule showing as
merely Open on the default landing page, and Projects' action row wrapping.
Each is now pinned by a test. Keep doing this step.
