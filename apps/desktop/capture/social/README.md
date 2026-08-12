# Social video generator

Declare a video in `manifest.json`, run the build, get a 1080×1920 MP4.

```bash
node apps/desktop/capture/social/build.mjs             # build everything
node apps/desktop/capture/social/build.mjs app-tour    # build one
```

Output goes to `website/assets/social/`. Captions for each video live in
`docs/RABTA-SOCIAL-CAPTIONS.md`.

## Adding a video

Add an object to `videos` in `manifest.json`. No code changes, no hand-written
SVG.

```jsonc
{
  "id": "my-video",          // becomes my-video.mp4
  "type": "dump",            // "dump" | "demo"
  "duration": 12,            // seconds, exact
  "headline": "...",         // wraps and shrinks automatically
  "subhead": "...",
  "tagline": "...",          // the orange line
  "shots": ["restore"]       // dump: names in website/assets/shots/src/
  // "source": "x.m4v"       // demo: a file in website/assets/demos/
}
```

**`dump`** — app screenshots with a slow push, cross-dissolved. The photo-dump look.
**`demo`** — a title card with a screen recording composited into the frame.
**`carousel`** — a folder of 1080×1920 PNGs for a TikTok photo post or an
Instagram carousel. Takes `slides` instead of `duration`:

```jsonc
{
  "id": "my-carousel",
  "type": "carousel",
  "slides": [
    { "kind": "hook", "text": "the line that stops the scroll", "sub": "optional" },
    { "kind": "item", "text": "one idea per slide" },
    { "kind": "cta",  "text": "the payoff", "sub": "optional" }
  ]
}
```

Output lands in `website/assets/social/carousels/<id>/01.png`. The build enforces
TikTok's 4–35 slide range. Slide 1 is the cover — it has to work as a still, on
mute, at thumbnail size.

## Things that will bite you

**Never render cards with `qlmanage`.** It emits a *square* thumbnail, so a
1080×1920 card gets scaled to width and cropped at 1920px tall — silently
discarding the bottom 44%, which is where the tagline and URL live. Three social
videos shipped with no call to action because of this. Cards render through
headless Chrome, and the build asserts the PNG is exactly 1080×1920.

**Two screenshots are unusable for connectivity claims.** `activity.png` and
`connectors.png` were captured with nothing connected — they read
"No connectors yet" and "No connectors online". Putting them under copy like
"it knows your tools" makes the video contradict itself. Strong shots:
`restore`, `overview`, `projects`. Mixed: `capsules`. Recapture the other two in
a connected state to unlock them.

**Safe areas.** Platform UI covers the top 180px, bottom 320px, and rightmost
120px. The layout keeps all copy inside those bounds — the URL sits at y≈1490,
roughly 400px clear of the bottom edge. Moving `taglineTop` or `urlTop` down in
`build.mjs` will push the URL under TikTok's caption.

**Stage aspect.** Screenshots are 16:10 and recordings are 4:3. `stageBox()`
sizes the frame from the source aspect so neither is stretched. If you add a
source with a different shape, give it its own box.

**Silent by design.** No audio track. Add sound in the platform's editor — a
TikTok Business Account may only use the Commercial Sounds Library, and burned-in
music risks a mute.
