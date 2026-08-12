# Founder Ad Cut and End Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the clipped sentence and replace the current generic end card with the approved flat, energetic Rabta finish.

**Architecture:** The founder edit remains a deterministic Remotion sequence backed by a separately rendered audio master. The source-cut constant, audio concat filter, caption JSON, composition duration, and end-card sequences move together so picture, speech, captions, and CTA stay frame-aligned.

**Tech Stack:** Remotion 4, React, TypeScript, FFmpeg, Whisper.cpp caption timestamps.

## Global Constraints

- Preserve the completed phrase “Rabta brings the workspace back with it.”
- Do not include the redundant “Files, tabs, terminals…” sentence.
- No glow, particles, lens effects, or decorative gradients in the end card.
- Final output remains 1080×1920 at 30 fps.

---

### Task 1: Repair the speech cut and audio master

**Files:**
- Modify: `video-editing/founder-ad-remotion/src/FounderAd.tsx`
- Modify: `video-editing/founder-ad-remotion/public/founder-audio.m4a`

- [ ] Inspect the raw speech tail and choose the first source time after “with it” fully decays.
- [ ] Extend the fourth `FACE_CLIPS` entry to that source time.
- [ ] Rebuild `founder-audio.m4a` from the five source ranges with the existing cleanup and loudness chain.
- [ ] Listen across the repaired boundary and confirm no following words leak into the cut.

### Task 2: Regenerate and correct word-level captions

**Files:**
- Modify: `video-editing/founder-ad-remotion/src/captions-word-level.json`
- Modify: `video-editing/founder-ad-remotion/src/Root.tsx`

- [ ] Transcribe the rebuilt audio with token timestamps.
- [ ] Correct product-name recognition to `Rabta` without changing measured word boundaries.
- [ ] Recalculate the founder and end-card frame boundary from the new speech duration.
- [ ] Typecheck the composition.

### Task 3: Build the approved end card

**Files:**
- Modify: `video-editing/founder-ad-remotion/src/FounderAd.tsx`

- [ ] Replace the glow-backed centered stack with a flat near-black composition.
- [ ] Add a cropped, offset app-window frame, orange rule motion, Rabta mark, headline, and URL.
- [ ] Animate only with `useCurrentFrame()` and `interpolate()`.
- [ ] Render and inspect early and late end-card frames at quarter scale.

### Task 4: Final verification

**Files:**
- Verify: `video-editing/founder-ad-remotion/src/FounderAd.tsx`
- Verify: `video-editing/founder-ad-remotion/src/Captions.tsx`
- Verify: `video-editing/founder-ad-remotion/src/Root.tsx`

- [ ] Run `npx tsc --noEmit`.
- [ ] Render the full `RabtaFounderAd` composition.
- [ ] Probe resolution, frame rate, duration, audio stream, and loudness.
- [ ] Keep Remotion Studio running on the updated project for user edits.
