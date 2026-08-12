# Rabta Screen Studio recording script

Record four clean masters. Every final website loop and social video is cut from these four recordings.

## Before recording

1. Quit Slack, Messages, Mail, WhatsApp, and anything that can show notifications.
2. Turn on macOS Focus / Do Not Disturb.
3. Open Screen Studio → Settings → Recording.
4. Turn **Create zooms automatically** on.
5. Turn microphone, camera, and system audio off.
6. Record the **Safari window**, not the whole display.
7. Use the prepared local Rabta fixture. It contains fake `atlas-api` data only.
8. Move the cursor slowly. Pause for roughly half a second before every click and one second after it.
9. Do not circle the cursor, shake it, or move it while a result is animating.

## Start the prepared demo

In Terminal, from `/Users/sammy/rabta`, run:

```bash
pnpm --filter desktop exec vite --config capture/vite.config.ts --host 127.0.0.1 --port 5199
```

Keep that Terminal window open. In Safari, open:

```text
http://127.0.0.1:5199/#capture=capsules
```

Maximize Safari. Do not use full-screen mode. Keep the window at a normal 16:9-ish size and record only the webpage area if Screen Studio's window recording includes too much browser chrome.

## Master 01 — Save, leave, resume

Filename: `01-save-leave-resume.screenstudio`

Target raw length: 12–14 seconds.

Starting URL:

```text
http://127.0.0.1:5199/#capture=capsules
```

Exact performance:

| Time | Action |
|---:|---|
| 0:00–0:01 | Hold still on the active capsule. Cursor rests in empty space near the bottom-right. |
| 0:01–0:02 | Move smoothly to **Capture**. Pause 0.4s, click once, then stop moving. |
| 0:02–0:04 | Hold so the saved state is readable. |
| 0:04–0:05 | Move to **Overview** in the left sidebar. Pause, click once. |
| 0:05–0:07 | Hold on the different task/context. |
| 0:07–0:08 | Move to the orange **Resume** button. Pause, click once. |
| 0:08–0:11 | Do not move. Let the restore result finish and remain readable. |
| 0:11–0:13 | Move slowly across the three result rows: VS Code → Chrome → Git. Do not click. |

Do two takes. Keep the one with the cleanest cursor path.

## Master 02 — Honest partial restore

Filename: `02-honest-partial-restore.screenstudio`

Target raw length: 7–9 seconds.

Reload the starting URL before recording.

| Time | Action |
|---:|---|
| 0:00–0:01 | Hold on the capsule with the Restore button visible. |
| 0:01–0:02 | Move to **Restore**, pause 0.4s, and click once. |
| 0:02–0:05 | Keep the cursor still while the result opens. |
| 0:05–0:07 | Move slowly down the result rows, ending beside Chrome's reconnect status. |
| 0:07–0:08 | Hold. |

The Chrome limitation must stay visible. Do not crop it out.

## Master 03 — Capsule context scan

Filename: `03-capsule-context.screenstudio`

Target raw length: 7–8 seconds.

Reload the starting URL before recording.

| Time | Action |
|---:|---|
| 0:00–0:01 | Hold on the selected capsule. |
| 0:01–0:03 | Move slowly across the three summary cards: files/terminals → tabs → git branch. No clicks. |
| 0:03–0:05 | Move down the Tabs list and stop on one fake research tab. |
| 0:05–0:07 | Move down to Files and stop on `reconnect.rs`. |

This master supplies the small website feature loops. Slow movement matters more than speed.

## Master 04 — Navigation and task switching

Filename: `04-navigation-task-switch.screenstudio`

Target raw length: 9–11 seconds.

Starting URL:

```text
http://127.0.0.1:5199/#capture=overview
```

| Time | Action |
|---:|---|
| 0:00–0:01 | Hold on Overview. |
| 0:01–0:02 | Move to **Capsules**, pause, click. |
| 0:02–0:04 | Select **Fix token refresh race in auth**. Hold. |
| 0:04–0:06 | Select **Wire the connector SDK reconnect**. Hold. |
| 0:06–0:07 | Click the search/command control in the top bar. |
| 0:07–0:09 | Type `connector`. Do not use real project names. |
| 0:09–0:10 | Hold on the result list. |

If the command control does not open, stop the take, reload, and record it again. Do not improvise around a broken state.

## Screen Studio edit preset

Create one preset named `Rabta — Product Demo` and apply it to every master:

- Background: near-black or charcoal, not a bright gradient
- Outer spacing: 48–64 px for wide exports
- Corner radius: 16–20 px
- Shadow: subtle, approximately 20–30%
- Cursor size: 125–140%
- Hide static cursor: on
- Click sound: off
- Motion blur: low
- Automatic zooms: on
- Normal zoom level: about 1.25×–1.4×
- Zoom duration: roughly 1.2–1.8 seconds
- Delete accidental zooms caused by setup clicks
- Trim all dead time before the first intentional hold and after the final hold
- No music, microphone, or captions in the website exports

For vertical exports, choose **Vertical 9:16** and turn **Always keep zoomed in** on. Review every zoom because the cursor controls the visible crop in this mode.

## Final deliverables

### Website main demos

1. `hero-save-leave-resume.mp4`
   - Source: Master 01
   - 16:9
   - 1280×720 or 1920×1080
   - 8–10 seconds
   - Silent
   - Start on the active capsule; end with restore results visible

2. `honest-partial-restore.mp4`
   - Source: Master 02
   - 16:9
   - 1280×720 or 1920×1080
   - 5–7 seconds
   - Silent

### Website micro loops

Export each at 960×540, H.264, silent, 2.3–3.0 seconds. Use Screen Studio's loop cursor position option when available.

1. `micro-save-state.mp4` — Master 01, Capture click and immediate result
2. `micro-leave-task.mp4` — Master 01, Overview click and context change
3. `micro-resume-click.mp4` — Master 01, Resume click
4. `micro-restore-result.mp4` — Master 02, result panel appearing
5. `micro-files-terminals.mp4` — Master 03, first summary card
6. `micro-tabs.mp4` — Master 03, tabs card and list
7. `micro-git-branch.mp4` — Master 03, branch card
8. `micro-task-switch.mp4` — Master 04, switching between the two capsules

Do not export three copies of the same result panel. Each loop must prove one distinct thing.

### TikTok and Instagram Reels

Export 1080×1920, H.264, 30 fps. Keep important text and the product UI away from the top 180 px, bottom 320 px, and rightmost 120 px where platform controls can cover it.

#### Social 01 — Problem / payoff

Filename: `social-problem-payoff.mp4`

Length: 12–15 seconds. Source: Master 01.

On-screen copy:

```text
0:00–0:03  Switching coding tasks is easy.
0:03–0:06  Coming back is the expensive part.
0:06–0:11  [show Resume and restore]
0:11–0:15  Pick up the task. Not the pieces.
             rabta.build
```

#### Social 02 — Pure proof

Filename: `social-pure-proof.mp4`

Length: 8–10 seconds. Sources: Masters 01 and 03.

On-screen copy:

```text
0:00–0:02  Watch my coding workspace come back.
0:02–0:07  [Resume → files/tabs/branch → result]
0:07–0:10  One click to resume.
             rabta.build
```

#### Social 03 — Trust

Filename: `social-honest-restore.mp4`

Length: 12–15 seconds. Source: Master 02.

On-screen copy:

```text
0:00–0:03  Most demos hide the failure state.
0:03–0:09  Rabta tells you exactly what restored.
0:09–0:12  And what still needs attention.
0:12–0:15  Local-first. No account. No telemetry.
             rabta.build
```

Use large captions: approximately 64–80 px, no more than two lines, white with one Rabta-orange emphasis. Do not place the entire desktop inside a tiny vertical frame; let Screen Studio's vertical crop and zoom follow the action.

## Export checklist

Before accepting any export, check all of these:

- Cursor appears and moves smoothly.
- Every meaningful click has a zoom, and setup clicks have none.
- Text can be read at phone size.
- No Safari favorites, notifications, personal tabs, email addresses, or local filesystem paths appear.
- No black frame at the beginning.
- No abrupt cut before the restore result finishes.
- Chrome's reconnect status remains truthful.
- Website videos are silent and loop cleanly.
- Social videos are exactly 1080×1920.
- Save the Screen Studio project before exporting with `Command-S`.

