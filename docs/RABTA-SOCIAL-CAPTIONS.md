# Rabta social captions and hashtags

Copy for TikTok (`@rabtaconnector`) and Instagram (`@rabtaconnector`).
All copy is drawn from the founder-ad script and the on-screen copy in
`RABTA-SCREEN-STUDIO-RECORDING-SCRIPT.md`, so the spoken, on-screen, and
written lines stay consistent.

## Voice rules

- The product is **Rabta**. Never "Rabta Connector" — that is only the handle.
- Lowercase, terse, first person. Match the founder ad: "it's basically a save
  state for coding."
- Say the concrete nouns: files, terminals, browser tabs, branch. They do more
  work than "workflow" or "productivity."
- One idea per post. The hook carries it.
- The URL is **rabta.build**.

## Hook rules

Only about **one line** shows before "…more" on both platforms. The first line
is the whole ad. Everything after it is for people already sold.

- Lead with the problem, not the product.
- No "Stop scrolling", no "Tap Learn More" — there is no Learn More button on an
  organic post, and a dead instruction costs trust.

## Hashtag bank

Use **5–8 tags.** Thirty generic tags do not increase reach; they dilute topic
classification and attract engagement bots rather than developers.

| Set | Tags |
|---|---|
| Core (every post) | `#devtools` `#softwareengineer` `#coding` `#programming` `#buildinpublic` |
| TikTok add | `#techtok` `#devtok` `#codinglife` |
| Instagram add | `#developer` `#softwaredevelopment` `#indiehackers` |
| Tool-adjacent (when the clip shows them) | `#vscode` `#git` `#terminal` `#macos` |

**Do not use** `#fyp` `#viral` `#viralreel` `#trendingnow` `#explorepage`.
TikTok ranks on watch time and completion rate, not hashtags; these add no
ranking benefit and read as low-effort to a technical audience.

---

## 1. Founder ad — `rabta-founder-ad-v4.mp4` (29s)

### TikTok

```text
you leave a task mid-flow. you come back and it's gone - the branch, the tabs, where you actually were.

rabta saves the whole state, so you pick up exactly where you left off.

a save state for coding. try it: rabta.build

#devtools #softwareengineer #coding #programming #buildinpublic #techtok #devtok #codinglife
```

### Instagram (currently live)

```text
you leave a task mid-flow. you come back and it's gone - the branch, the tabs, where you actually were.

rabta saves the whole state, so you pick up exactly where you left off.

a save state for coding.

try it: rabta.build

#devtools #softwareengineer #coding #programming #developer #softwaredevelopment #buildinpublic #indiehackers #vscode #codinglife
```

### Alternate first lines (swap line 1 only, keep the rest)

Post the same video with a different hook a week apart. The hook is the only
variable worth testing at this follower count.

- `switch tasks for 20 minutes, come back with no idea what you had open.`
- `the expensive part of context switching isn't the switch. it's the rebuild.`
- `your files, your terminals, your tabs, your branch. gone the second you switch tasks.`
- `i kept rebuilding the same setup every time i switched tasks. so i built a save state for coding.`

---

## 2. Social 01 — Problem / payoff (`problem-return.mp4`, 12–15s)

```text
switching coding tasks is easy. coming back is the part that costs you.

rabta saves your files, terminals, tabs and branch as one capsule. one click and the task is back.

pick up the task, not the pieces.

rabta.build

#devtools #softwareengineer #coding #programming #buildinpublic #techtok #codinglife
```

---

## 3. Social 02 — Pure proof (`pure-proof.mp4`, 8–10s)

No talking, no claim — the clip is the argument. Keep the caption short so the
loop replays.

```text
one click. files, tabs, branch, all back.

no setup ritual, no "wait, where was i". the workspace exactly as you left it.

rabta.build

#devtools #softwareengineer #coding #programming #vscode #buildinpublic #devtok
```

---

## 4. Social 03 — Trust / honest restore (`trust-local-first.mp4`, 12–15s)

The strongest post of the four for a developer audience. It shows the failure
state on purpose.

```text
most demos hide the failure state. this one doesn't.

rabta tells you exactly what restored and what still needs you. chrome reconnects on its own schedule, so we say so instead of faking it.

local-first. no account. no telemetry.

rabta.build

#devtools #softwareengineer #coding #programming #privacy #localfirst #buildinpublic #indiehackers
```

---

## 5. Micro loops (`website/assets/demos/micro/`)

Short silent loops. These work as filler posts between the four main videos.
One line, one tag set.

| Clip | Caption |
|---|---|
| `save-state.mp4` | `save the task. the whole workspace goes with it.` |
| `resume-click.mp4` | `one click and the task is back.` |
| `branch-restored.mp4` | `it puts you back on the right branch too.` |
| `editor-restored.mp4` | `your editor, reopened exactly how you left it.` |
| `capsule-context.mp4` | `every saved task keeps its own context.` |
| `task-switch.mp4` | `switch tasks without paying for it later.` |
| `partial-result.mp4` | `it tells you what restored and what didn't. no pretending.` |
| `tabs-deferred.mp4` | `tabs come back when the browser is ready, not before.` |

Tag set for all micro loops:

```text
#devtools #softwareengineer #coding #programming #buildinpublic
```

---

## 6. Generated batch (`apps/desktop/capture/social/`)

Built by `node apps/desktop/capture/social/build.mjs`. Silent by design — add
sound from the platform's own library so a Business Account never risks a
copyright mute.

### `app-tour.mp4` (18s)

```text
this is the whole app. you save a task, you get the workspace back.

files, terminals, tabs, branch. all of it, exactly where you left it.

rabta.build

#devtools #softwareengineer #coding #programming #buildinpublic #techtok
```

### `many-tasks.mp4` (12s)

```text
three projects, seven open tasks, none of them bleeding into each other.

every capsule keeps its own files, terminals, tabs and branch. switch whenever. come back whenever.

rabta.build

#devtools #softwareengineer #coding #programming #buildinpublic #devtok
```

### `knows-your-tools.mp4` (10s)

```text
it doesn't guess what you had open. it asks your tools.

vs code, chrome and git each report what restored and what didn't.

rabta.build

#devtools #softwareengineer #coding #programming #vscode #git #buildinpublic
```

### `capture-flow.mp4` (12s)

```text
saving a task is one button.

open files, terminals, tabs, current branch. into a capsule. then you can walk away from it.

rabta.build

#devtools #softwareengineer #coding #programming #buildinpublic #codinglife
```

### `what-restores.mp4` (12s)

```text
it tells you what came back and what didn't.

vs code restored. git restored. chrome on next reload. it says so instead of pretending.

rabta.build

#devtools #softwareengineer #coding #programming #buildinpublic #indiehackers
```

---

## 7. Carousels (`website/assets/social/carousels/`)

Folders of 1080×1920 PNGs. Post as a **TikTok photo post** or an **Instagram
carousel**. TikTok requires 4–35 slides; completion rate is what gets ranked, so
a few strong slides beat a long weak deck.

Slide 1 is the cover. It has to work as a still, on mute, at thumbnail size.

### `cost-of-switching/` (7 slides)

```text
switching tasks is cheap. coming back is where the time goes.

the branch, the files, the terminals, the tabs. and twenty minutes rebuilding all of it.

rabta saves the whole state so you skip that part.

rabta.build

#devtools #softwareengineer #coding #programming #buildinpublic #techtok
```

### `honest-restore/` (5 slides)

```text
every tool claims a clean restore. here's what ours actually does.

vs code restored. git restored, on the right branch. chrome on next reload, not before, and it says so instead of pretending.

rabta.build

#devtools #softwareengineer #coding #programming #localfirst #buildinpublic
```

---

## Which format, and why

Researched August 2026. Sources at the end of this section.

| | TikTok | Instagram |
|---|---|---|
| Video | Goes to FYP. Reach engine. | Reels get ~1.36× the reach of carousels. |
| Carousel | Also goes to FYP; strong on saves and shares. | ~10% avg engagement vs ~6% for Reels, but less reach. |

**The practical split:** video to reach people who don't know you, carousels to
convert the ones who already showed up. On a 0-follower account, video is the
priority and carousels are the follow-up — not the other way round.

**Rules the research agrees on:**

- **The hook is the whole ad.** Viewers decide in about 2–3 seconds. Lead with
  the problem, not the product, not a logo, not "hey guys".
- **~85% of views are on mute.** Burned-in text isn't a nice-to-have. Every
  Rabta video already does this — keep it.
- **Something should change on screen every ~3 seconds.** Cut, zoom, or new text.
- **Teach, don't pitch.** Technical audiences filter promotional framing fast.
  Show the workflow; let the product be the thing that makes it work.
- **Audio matters even on photo carousels** — TikTok viewers expect sound. Add it
  from the platform's library, never burned in (a Business Account is limited to
  the Commercial Sounds Library).
- **Saves and DM shares outrank likes**, reportedly by a wide margin. Write for
  "I'll need this later", not "that's neat".

Sources: [TikTok carousel guide](https://www.krumzi.com/blog/how-to-make-tiktok-carousel-posts-a-complete-guide-2026) ·
[TikTok carousel specs](https://usevisuals.com/blog/tiktok-carousel-post-specs-and-size) ·
[Reels vs carousels](https://contentdrips.com/blog/2026/06/instagram-reels-vs-carousels-2026-guide/) ·
[Carousel vs Reels, data-backed](https://www.thesecondbrain.io/blog/carousel-vs-reels-2026-which-gets-you-followers) ·
[B2B SaaS on TikTok](https://usevisuals.com/blog/b2b-saas-tiktok-strategy-2026) ·
[SaaS TikTok playbook](https://www.tokportal.com/verticals/tiktok-marketing-saas-companies) ·
[Short-form hooks](https://www.capcut.com/create/short-form-video-hooks-first-3-second-patterns) ·
[Short-form strategy](https://www.teleprompter.com/blog/short-form-video-strategy)

These are marketing blogs, not platform documentation. The specs (sizes, slide
limits) are verifiable; the engagement percentages are their numbers, not
measured on your account. Treat the ratios as direction, not fact.

---

## Posting order

The four main videos are one sequence, not four independent posts. Space them
2–3 days apart:

1. **Founder ad** — who you are, what it is
2. **Problem / payoff** — the pain, stated cleanly
3. **Pure proof** — no claims, just the mechanism working
4. **Trust** — the failure state and local-first stance

Micro loops fill the gaps.
