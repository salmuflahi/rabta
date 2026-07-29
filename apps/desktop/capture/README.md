# Screenshot capture rig

Generates the product screenshots used on <https://rabta.build>.

```sh
cd apps/desktop
node capture/capture.mjs                 # -> website/assets/shots/src/*.png
node capture/capture.mjs --out /tmp/shots
```

Then regenerate the responsive derivatives the site actually loads:

```sh
python3 scripts/optimize-shots.py
```

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
| `vite.config.ts` | Aliases the Tauri modules to the mock; HMR disabled |
| `capture.mjs` | Driver: boots Vite, runs headless Chrome once per screen |

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
   filename and the `#capture=` hash value, and must appear in `VALID` in
   `main.tsx`.
