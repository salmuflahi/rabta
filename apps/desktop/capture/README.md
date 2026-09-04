# Screenshot capture rig

Generates the product screenshots used on <https://rabta.build>.

```sh
cd apps/desktop
node capture/capture.mjs                 # -> site/public/assets/shots/src/*.png
node capture/capture.mjs --out /tmp/shots
```

Then regenerate the responsive derivatives the site actually loads:

```sh
python3 scripts/optimize-shots.py
```

## Posing shots by hand (promo, App Store, social)

The same rig runs as an ordinary dev server, so you can click around a
fully-populated Rabta without touching your real data — the fixture in
`seed.ts` is three projects, six capsules, two connectors and ten events,
and the Tauri bridge is mocked.

```sh
cd apps/desktop
pnpm exec vite --config capture/vite.config.ts   # -> http://localhost:5199
```

Then open a URL and take the picture however you like (⌘⇧4, CleanShot,
Chrome's device toolbar for a specific size). Everything after `#` is
optional and combinable with `&`:

| Switch | Values | Default |
|---|---|---|
| `capture=` | `overview` `capsules` `projects` `connectors` `activity` `settings` `restore` | `overview` |
| `theme=` | `light` `dark` | `dark` |
| `accent=` | `tangerine` `iris` `graphite` `sky` | `tangerine` |
| `sidebar=` | `collapsed` | expanded |
| `palette` | — | closed |

```
http://localhost:5199/#capture=capsules
http://localhost:5199/#capture=projects&theme=light&accent=iris
http://localhost:5199/#capture=overview&palette&sidebar=collapsed
http://localhost:5199/#capture=restore            # mid-restore sheet
```

The clock is frozen, so "8m ago" reads the same in every shot you take —
two pictures a week apart still match. Changing the hash alone does not
re-pose the page; reload after editing it.

The screenshot driver below sets none of these, so the site's own shots
stay byte-identical whatever you pose here.

## Recording the product loops

The homepage's eight loops (the hero, the three moves, the four bento cells)
are footage of this same real app and frozen fixture, put under a camera and
a focus lens. The footage comes from here; the camera work lives in
`marketing-videos/site-demos/`.

| Demo | What the director does | Length | Used by |
|---|---|---|---|
| `hero-return` | Save State, switch to Overview, resume `task_reconnect` | 8.5s | the hero loop |
| `capture` | Save State on the active capsule | 4s | `move-capture` |
| `leave` | switch to Overview with another task active | 4s | `move-leave` |
| `return` | resume `task_reconnect`, the restore sheet lands | 5.5s | `move-return` |

Recording needs macOS, Google Chrome and ffmpeg, and nothing else: no screen
recording permission, no window placement. The recorder drives the rig in
headless Chrome with virtual time paused, advances it exactly 1/30s per frame,
and screenshots every frame at 2x, so the mark's draw, the sheet's spring and
the rows' stagger land on real frames instead of whatever a real-time capture
managed to encode.

```sh
cd apps/desktop
pnpm exec vite --config capture/vite.config.ts --port 5199   # or launch.json's capture-rig
node capture/record-frames.mjs hero-return
node capture/record-frames.mjs capture
node capture/record-frames.mjs leave
node capture/record-frames.mjs return
```

Each run writes `marketing-videos/site-demos/_recordings/<demo>-1280x800.mp4`
(2560x1600, 30fps, silent H.264) plus a first and last frame for inspection.
Then, from `marketing-videos/site-demos/`, `node build-projects.mjs` rebuilds
the eight HyperFrames projects around the footage, each project is gated with
`npx hyperframes@0.8.27 check` and rendered with `render --quality high`, and
`node scripts/build-site-media.mjs` (repo root) encodes the renders into
`site/public/assets/demos/` with posters and a probed `manifest.json`. Never
hand-edit the manifest: it is a record of the generated files, and
`node scripts/verify-media.mjs` checks it against them.

Fixture strings must continue to match `seed.ts`, including `Workspace
partially restored`, `VS Code — Restored`, `Chrome — On next reload`, and
`Git — Restored`.

## What these screenshots are

**Genuine Rabta v0.1.0 product UI rendered with deterministic, representative
demo data.**

The rig runs the app's real React tree — real components, real effects, real
loading and transition states — against a mocked Tauri bridge. Nothing is
redrawn, restyled or mocked at the component level. What differs from a normal
launch is only the data underneath and the clock.

The data is a frozen fixture (`seed.ts`), never a real user's workspace. Site
captions must describe it as demo data and never as live usage.

## Files

| File | Role |
|---|---|
| `seed.ts` | The frozen fixture: projects, tasks, capsule resources, connectors, events |
| `mock-tauri.ts` | Stands in for `@tauri-apps/api/core` + `/event` |
| `main.tsx` | Capture entry: freezes the clock, seeds prefs, drives the requested screen |
| `director.ts` | Pure hash-mode parser and approved demo timeline contract |
| `vite.config.ts` | Aliases the Tauri modules to the mock; HMR disabled |
| `capture.mjs` | Driver: boots Vite, runs headless Chrome once per screen |
| `record-frames.mjs` | Driver: records a directed demo frame by frame under virtual time, for the site's loops |

None of this is reachable from the shipped app — `apps/desktop/vite.config.ts`
has no alias to the mock, so a production build cannot pick it up.

## Fidelity rules

The mock reproduces the **response shapes and state transitions** of the real
backend: identical command names, identical argument names, identical return
types (imported from `@/store`), and mutating commands mutate in-memory state
the way the real commands mutate the database. An unrecognised command throws
loudly rather than returning `undefined`, so a screen can never silently
capture in a degraded state.

Fixture content is constrained to what v0.1.0 actually does:

- No capability that does not ship. GitHub integration reports itself
  unavailable, because it is unconfigured in this fixture — that is the real
  state, so the real "install the gh CLI" hint renders. It is not hidden.
- The browser connector shows as **offline**, matching its real status while
  Chrome Web Store review is pending. Nothing implies it is installable today.
- The Connectors screen includes a pending pairing request, because the
  approve/deny gate is shipped behaviour and the clearest picture of the
  product's trust model.
- No download counts, user counts, or other fabricated metrics.

Privacy hygiene: no real usernames, machine names, emails, or absolute home
paths. Project paths are written `~/code/<name>`; repository and task names are
invented.

## Determinism

- **Clock** — `main.tsx` replaces `Date` with a subclass pinned to
  `NOW_ISO` (2026-07-29T14:20:00Z), so every relative label ("8m ago",
  "last session 1h 30m") is identical on every run.
- **Timezone** — the driver pins `TZ=UTC`, so absolute dates don't drift with
  the host's locale.
- **Timers** — Chrome's `--virtual-time-budget` advances timers as fast as
  possible rather than in wall-clock time, so entrance animations land in the
  same settled state every run.
- **Profile** — a throwaway Chrome profile per screen; no cached state leaks
  between runs.
- **Viewport** — 1280x800 CSS px at DPR 2, giving 2560x1600 PNGs.

Measured: five of six screens are byte-identical across runs. `connectors.png`
differs by ~300 pixels out of 4,096,000 (0.008%) at a maximum channel delta of
4/255, confined to the pairing card's translucent rounded border — Chrome
rasterisation noise, not a state difference, and not perceptible.

### Two deliberate consequences of the frozen clock

1. **The Restore sheet stays open.** `useRestore` auto-dismisses the sheet
   after a short hold measured with `Date.now()`; with the clock pinned, that
   elapsed check never advances and the sheet holds in its completed state.
   This is how `restore.png` captures the "Workspace partially restored"
   summary — a state a user genuinely sees, held still long enough to
   photograph.
2. **Resume buttons behind the sheet read "Restoring…".** That is the real
   app's behaviour while a restore is in flight, preserved for the same reason.

## Known Chrome quirk

Chrome does not reliably exit after `--screenshot` when a virtual time budget
is set. The driver therefore waits for the PNG to stop growing on disk and
then reaps the process. The file is complete before it is read; this is a
process-teardown workaround, not a timing race.

## Adding a screen

1. Add any data it needs to `seed.ts`, respecting the fidelity rules above.
2. Add the command to `mock-tauri.ts` if the screen calls a new one.
3. Add `{ id, label }` to `SCREENS` in `capture.mjs` — `id` is both the output
   filename and the `#capture=` hash value, and must appear in `SCREENS` in
   `director.ts`.
