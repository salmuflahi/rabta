# Rabta Social Content Engine Design

**Date:** 2026-08-13

**Status:** Approved design, pending written-spec review

**Owner:** Sammy Almuflahi

**Platforms:** TikTok and Instagram
**Primary outcome:** Grow reach and followers, with Rabta downloads as the final business goal

## Summary

Build a faceless, creator-style social content engine for Rabta that prepares one
high-quality post for every weekday. The system creates a five-post batch in one
session, using real Rabta product footage, natural AI narration, word-synced
captions, platform-specific edits, captions, covers, and scheduling metadata.
Sammy reviews the batch in a local approval dashboard and spends about one minute
per post approving or requesting a focused regeneration.

The engine must feel like a relaxed 20-year-old developer talking to another
developer, not a polished commercial. Occasional mild or strong swearing is
allowed when it makes a line sound natural. AI avatars are prohibited.

Rabta's existing published TikTok and Instagram post remains untouched and is
recorded as legacy history. It is not the creative or performance baseline for
the new engine.

## Goals

- Publish one post per weekday on both TikTok and Instagram.
- Prepare all five posts in one weekly batch, Sunday by default.
- Remove manual recording and editing from Sammy's normal workflow.
- Require a short human approval before anything enters the posting queue.
- Optimize first for non-follower reach and retention, then for profile visits,
  link clicks, and downloads.
- Keep every idea, script, asset, render, approval, schedule, and result traceable.
- Use real Rabta behavior and approved facts; never invent features, users,
  metrics, testimonials, or outcomes.
- Keep monthly operating costs in the $50-100 range where practical.

## Non-goals

- AI avatars, generated talking heads, or fake founder footage.
- Fully unattended public posting.
- Adding user telemetry to the Rabta product.
- Treating likes as the primary success metric.
- Building a general-purpose social media product for outside users.
- Replacing platform-native music, effects, or trend discovery when native tools
  are materially better.
- Deleting, overwriting, or re-editing already published content.

## Research basis

The system follows current first-party platform guidance:

- TikTok recommends vertical, high-resolution, sound-on content structured as
  hook, body, and close. Its 2026 creative guidance emphasizes the first 3-6
  seconds, creator-native production, frequent creative refreshes, movement,
  transitions, text, and voiceover.
- TikTok's recommendation documentation identifies user interactions and video
  information as ranking inputs, with a completed longer view described as a
  stronger interest signal than low-value account or device signals. Follower
  count and prior viral posts are not direct recommendation factors.
- Meta recommends 9:16 Reels with audio and key messages inside safe zones.
- Instagram Trial Reels can test content with non-followers and expose initial
  views, likes, comments, and shares after approximately 24 hours. Eligible
  trials may be shared to followers manually or automatically after the test.
- Meta reported in 2026 that 75% of Instagram recommendations in the United
  States were coming from original posts.

These sources define constraints and useful defaults, not guaranteed formulas.
The engine must learn from Rabta's own account results rather than treating any
generic benchmark as universal.

Primary references:

- <https://ads.tiktok.com/business/library/AUNZ_Creative_Starter_Pack_TakeItToTikTok.pdf>
- <https://ads.tiktok.com/business/en/creative-codes>
- <https://newsroom.tiktok.com/how-tiktok-recommends-videos-for-you>
- <https://ads.tiktok.com/help/article/creative-center>
- <https://www.facebook.com/business/ads/facebook-instagram-reels-ads>
- <https://about.fb.com/news/2024/12/trial-reels-try-content-non-followers-first-see-what-perfoms-best/>
- <https://about.fb.com/news/2026/01/2026-ai-drives-performance/>

## Chosen approach

Use a faceless creator engine now, with an optional real-creator hybrid later.
The core format combines tightly framed Rabta screen recordings, developer
culture visuals where appropriate, natural AI narration, dynamic captions,
quick editorial changes, restrained sound design, and low-pressure calls to
action.

A high-volume static template factory was rejected because Rabta's existing
manifest renderer already demonstrates its limitation: the output is polished
and technically correct but can feel repetitive and ad-like. AI avatar systems
were rejected because Sammy dislikes them and because they can reduce trust for
a technical product.

## Architecture

The engine lives outside the shipped Rabta desktop application under one
dedicated repository area:

```text
marketing/social-engine/
├── config/          # Product facts, voice, platform, schedule, provider config
├── content/         # Ideas, scripts, hooks, captions, editorial records
├── assets/          # Product clips, voice audio, music, and sound effects
├── renderer/        # Remotion compositions and caption presentation
├── capture/         # Automatic Rabta product recording director
├── review/          # Local approval dashboard
├── providers/       # Voice, generation, scheduling, and analytics adapters
├── performance/     # Local metrics store, scoring, and reports
├── tests/           # Unit, integration, render, and workflow tests
└── exports/         # Immutable ready-to-post packages by date and slug
```

Keeping this separate prevents marketing dependencies, provider SDKs, and
credentials from entering the shipped product. It also preserves Rabta's local-
first privacy posture.

### Core flow

```text
Rabta facts + product events + comments + trend notes
  -> idea candidates
  -> script and hook variants
  -> fact/tone validation
  -> voice and product-clip generation
  -> creator-style render
  -> automated QA
  -> local human approval
  -> Metricool or native notification workflow
  -> 24-hour, 72-hour, and 7-day measurement
  -> future idea and hook ranking
```

### Content records and states

Every concept has a stable identifier and explicit state:

```text
idea -> scripted -> voiced -> rendered -> qa_passed -> approved
     -> scheduled -> posted -> measured -> archived
```

Failed and rejected are recorded as side states with a reason. A transition is
allowed only after the previous stage's required artifact exists. Re-running a
stage must be idempotent or create a new version rather than silently replacing
an approved artifact.

Each record includes:

- Stable ID, slug, creation time, content pillar, and target platform.
- Script, hook variants, selected hook, CTA, captions, and hashtags.
- Product facts and source material used to support claims.
- Voice provider, model, voice, settings, and generated audio checksum.
- Footage sources, crop instructions, timeline, and render version.
- QA results, approval decision, and rejection/regeneration reasons.
- Scheduled and actual publication times and platform post identifiers.
- Metrics snapshots and performance scores.

## Content strategy

### Weekly cadence

The engine generates seven to ten candidates on Sunday and selects the strongest
five complete posts for review. After approval, it schedules one post per day,
Monday through Friday, on TikTok and Instagram.

Default weekly mix:

- Two relatable developer-problem videos.
- One satisfying product-proof video.
- One developer opinion, joke, or culture video.
- One build-in-public, trust, carousel, or comment-reply post.

The mix is a starting allocation, not a permanent quota. The learning loop may
adjust it after enough evidence accumulates. Time-sensitive posts can enter the
next review queue, but never displace approved evergreen content automatically.
Unused candidates remain in an organized backlog.

### Script voice

The writing should sound like a relaxed developer around age 20 talking to a
peer. It should use contractions, short clauses, varied rhythm, dry humor, and
occasional slang or swearing. It must not imitate a demographic through forced
slang or caricature.

Preferred qualities:

- Direct, conversational, understated, and self-aware.
- Concrete nouns: files, terminals, tabs, branch, issue, and task.
- Personal frustration or observation before product explanation.
- Natural fragments and pauses when they improve delivery.
- Rabta introduced as the consequence or payoff, not as an opening pitch.
- Low-pressure CTAs such as "it's called rabta" or "it's at rabta.build."

Disallowed language includes corporate fillers such as "revolutionize,"
"game-changing," "unlock," "supercharge," and "transform your workflow."
Scripts may not use fake enthusiasm, fake scarcity, invented popularity,
engagement begging, or manipulative claims.

Example tone:

```text
having forty tabs isn't the problem

the problem is remembering which twelve belonged to this task

rabta saves them with the branch and files

so yeah, future me can figure his own shit out
```

### Hook generation

Each concept gets at least three materially different hooks, drawn from a
controlled set of patterns:

- Relatable frustration.
- Curiosity gap.
- Contrarian developer opinion.
- Immediate product action or result.
- Confession or build-in-public observation.
- Comment reply.
- Before/after without inflated claims.

The selected hook must introduce the content proposition within the first three
seconds. No logo animation, greeting, throat-clearing, or generic "stop
scrolling" line is allowed.

### Duration and structure

Default videos run 12-24 seconds and communicate one idea. Longer or shorter
videos are permitted only when the narrative justifies them.

- First 0-1.5 seconds: hook plus immediate motion or product action.
- Middle: one coherent proof, story, or explanation.
- Close: payoff and low-pressure CTA.
- Ending: create a natural loop when doing so does not make the script confusing.

### Platform variants

TikTok receives the rawer, faster version. Instagram receives a cleaner cover
and may use slightly longer caption holds. Both remain original, watermark-free
exports from the same source timeline. Platform rules and learned account data
may change pacing, caption copy, CTA, hashtags, cover, and posting time without
changing the verified product claim.

## Product capture and assets

The capture director extends Rabta's existing deterministic capture rig rather
than recording a real workspace. It runs the actual React product tree against
representative frozen demo data and records directed interactions such as:

- Capturing a task.
- Switching between tasks.
- Restoring files, terminals, tabs, and branch context.
- Showing partial restores and honest failure states.
- Showing safe-git refusals.
- Demonstrating focus mode.
- Highlighting a single row, button, receipt, or state transition.

The director should generate reusable horizontal source clips plus crop and
focus metadata. The social renderer performs vertical reframing and close-ups.
No real usernames, project names, paths, browser history, credentials, or user
content may enter captures.

Existing footage and screenshots remain usable, but the new system should avoid
tiny full-window presentations when a focused crop communicates the action more
clearly on a phone.

## Voice and audio

### Voice

ElevenLabs is the preferred premium provider. The adapter boundary must support
a fallback provider so the engine is not permanently coupled to one API.

Voice characteristics:

- Natural, young adult, relaxed, and clean.
- No announcer cadence, influencer exaggeration, or synthetic cheerfulness.
- Varied emphasis and pauses without excessive filler words.
- Consistent enough to build recognition across posts.

The engine stores provider-neutral narration text and timing data. Provider-
specific IDs and settings live in local configuration. AI narration must be
disclosed when required by the destination platform's current policies.

### Captions

- Word-aligned captions generated from provider timestamps or transcription.
- Two to five words per visible phrase by default.
- Current spoken word highlighted in Rabta orange.
- High contrast, readable at phone size, and inside shared safe zones.
- No more than two lines unless an explicit render test approves the exception.
- Caption timing follows the voice exactly; no early spoilers or late holds.

### Sound design

- Narration is the dominant element.
- Background music remains quiet and is ducked under speech.
- UI clicks, transitions, and emphasis sounds are restrained.
- Loudness and true peak are normalized consistently.
- Native platform audio is added during notification-based posting when it
  materially improves fit or discoverability.
- Only original, licensed, or platform-authorized audio may be used.

## Rendering

Build the creator renderer in Remotion and use FFmpeg for probing, trimming,
normalization, and final validation. Remotion animation must be frame-driven;
CSS animations and transitions are not used for rendered motion.

Default export requirements:

- 1080x1920 pixels.
- 30 FPS.
- H.264 video and AAC audio in MP4.
- yuv420p pixel format and web-optimized metadata.
- Platform-safe text and product focal points.
- No third-party watermark.

Editorial devices include controlled punch-ins, fast cuts, cursor emphasis,
callouts, progress indicators, motion-backed captions, intentional scene
changes, and clean end loops. A meaningful visual change should normally occur
every one to two seconds, but the renderer must not add movement that obscures
the product or feels chaotic.

## Fact and tone controls

`config/product-facts` is the source of truth for public claims. Each fact has a
status, supporting source, applicable release, and allowed wording. The script
generator may paraphrase only facts marked public and current.

Automated checks reject:

- Features not available in the current release.
- Claims that Rabta reads file contents, terminal output, page contents, or
  other data outside its stated privacy model.
- Unsupported performance or productivity numbers.
- Fake testimonials, download counts, user counts, or social proof.
- Promises of perfect restoration when Rabta intentionally reports partial
  results.
- Corporate-ad language or excessive/forced slang.
- Swearing in covers, metadata, or openings when it weakens reach without adding
  authenticity; the body may use it when context supports it.

The checker is a gate plus a review aid, not an assertion that generated copy is
infallible. Human approval remains required.

## Approval dashboard

The review application runs locally and displays a five-post weekly queue. Each
post includes:

- Final video with audio.
- TikTok and Instagram captions.
- Platform covers.
- Content pillar, hook pattern, selected hook, and CTA.
- Suggested date and time.
- QA summary and any warnings.
- Native audio or search suggestion when relevant.

Available actions:

- **Approve:** lock the current version and add it to the scheduling export.
- **Regenerate hook:** preserve the concept and useful footage while creating a
  new opening, voice, timing, and affected edit.
- **Regenerate voice:** preserve approved text and footage while creating a new
  narration and timing pass.
- **Reject:** record a required reason and keep the artifact for audit/history.

Approved content cannot be changed silently. Any later edit creates a new
version and requires approval again.

## Publishing workflow

Metricool is the scheduling and cross-platform analytics service. The engine
uses a provider adapter and supports two publishing paths:

1. **Standard scheduled post:** use Metricool when the finished original audio
   is sufficient and the platform supports the requested options.
2. **Native completion notification:** schedule with automatic publishing off.
   At the posting time, Metricool's mobile notification downloads the media,
   copies the caption, and opens TikTok or Instagram. Sammy selects the proposed
   native audio/effect if desired, verifies the preview, and posts.

The second path is the default when trending or platform-only audio materially
matters. It preserves the one-minute human control point and avoids building an
internal uploader that conflicts with TikTok's intended-use and explicit-
consent requirements.

The first five posting times are sensible test windows, not universal "best
times." Once enough account data exists, the system selects times separately
for TikTok and Instagram. At fewer than roughly 100 followers, Metricool may not
provide audience-specific best-time information, so early scheduling remains a
controlled experiment.

## Export package

Every approved post produces an immutable folder:

```text
exports/YYYY-MM-DD-post-slug/
├── video-tiktok.mp4
├── video-instagram.mp4
├── cover-tiktok.png
├── cover-instagram.png
├── caption-tiktok.txt
├── caption-instagram.txt
├── posting-notes.txt
├── content-record.json
└── qa-report.json
```

Files are checksummed. A rerender creates a new version rather than overwriting
an approved package.

## Measurement and learning

The system stores snapshots approximately 24 hours, 72 hours, and seven days
after publication, subject to platform data availability. It tracks separately
for TikTok and Instagram:

- Views and non-follower reach.
- Early retention, average watch time/percentage, completions, and replays.
- Shares, saves, and comments per 1,000 views.
- Profile visits, follows, and link clicks where available.
- Aggregate GitHub release-download changes.

Likes are recorded but weighted below retention, shares, saves, comments, and
download intent. Aggregate GitHub download change is directional because it
cannot reliably attribute a download to an individual organic post. The engine
must label it accordingly and must not present correlation as causal
attribution.

The first existing social post is stored as `legacy` and excluded from new
creative-baseline calculations. The new baseline begins with the first pilot
batch. The engine does not name a winning format from fewer than five comparable
posts and should prefer larger matched samples before reallocating the weekly
mix. Winning structures are adapted, not copied verbatim. Strong comments enter
the idea backlog as potential reply posts.

No new tracking is added to the Rabta application. If campaign-specific download
attribution is later desired, it requires a separate privacy review and explicit
approval.

## Providers, budget, and paywalls

Target monthly operating cost: $50-100.

- **ElevenLabs Creator:** approximately $22/month for higher-quality commercial
  voice generation.
- **Metricool Advanced:** approximately $54/month because direct API access is
  limited to Advanced and Custom plans.
- **Script/research generation:** expected to remain modest, approximately
  $5-20/month at this publishing volume.
- **Rendering and capture:** local, with no recurring service cost.

Prices are current estimates and must be rechecked at purchase time. The system
is built first with mock/local providers. When a paid boundary is reached, work
stops only on the affected live integration and reports the exact account,
plan, credential, and setup action required. Unrelated implementation continues.

Credentials live in an ignored local environment file or OS credential store.
They are never included in logs, fixtures, screenshots, exports, or commits.

## Error handling

- A failed generation, voice, capture, render, QA, export, scheduling, or metrics
  request cannot advance the content state.
- Transient provider failures retry with bounded exponential backoff.
- Idempotency keys prevent duplicate paid generations and duplicate schedules.
- Permanent failures show an actionable error in the local dashboard.
- Missing or expired credentials affect only the provider-dependent stage.
- Scheduling failures retain the approved export for manual notification-based
  posting.
- Approval and rejection actions are append-only audit events.
- Existing social assets and published posts are never overwritten or deleted.

## Testing and verification

### Unit tests

- Content state transitions and versioning.
- Script schema, hook variants, tone linting, and prohibited phrases.
- Product-fact lookup and unsupported-claim rejection.
- Caption pagination, safe-area constraints, and filenames.
- Schedule selection and platform-specific metadata.
- Performance scoring and minimum-sample safeguards.

### Integration tests

- Fake script, ElevenLabs, Metricool, and analytics providers.
- Provider retries, idempotency, credential failures, and malformed responses.
- Capture-director timelines against Rabta's deterministic fixture.
- Immutable export generation and content-record traceability.

### Render verification

- Probe 1080x1920, 30 FPS, H.264/AAC, yuv420p, duration, and file integrity.
- Verify expected audio presence, loudness, true peak, and absence of clipping.
- Validate caption bounds, line count, contrast, timing, and safe areas.
- Render representative stills and contact sheets for visual inspection.
- Reject missing source media, black frames, frozen unintended sections, or
  unreadable product crops.

### Workflow acceptance test

Run one complete mock Sunday batch:

1. Generate at least seven candidates.
2. Select and render five posts.
3. Pass automated QA.
4. Exercise approve, regenerate-hook, regenerate-voice, and reject actions.
5. Export five immutable packages.
6. Create mock Monday-Friday schedules for both platforms.
7. Import mock 24-hour, 72-hour, and seven-day metrics.
8. Verify that the next candidate ranking uses the stored evidence without
   overfitting to an undersized sample.

After the paid providers are connected, run a one-post private/unpublished
integration test where the service supports it, then a reviewed five-post pilot
batch. Public posting always requires Sammy's final approval.

## Rollout

1. Build repository structure, schemas, local database, facts, tone rules, and
   mock providers.
2. Extend deterministic product capture and build the Remotion creator renderer.
3. Add voice generation, captions, QA, and immutable exports.
4. Build the local approval dashboard and complete the mock weekly dry run.
5. Connect ElevenLabs after purchase and select the final voice through blind
   sample review.
6. Connect Metricool Advanced after purchase, then test scheduling and metrics.
7. Produce and approve the first five-post pilot batch.
8. Publish Monday-Friday, collect the three metric snapshots, and adjust only
   after the minimum evidence threshold is met.

## Acceptance criteria

The design is implemented when:

- A single command or dashboard action prepares a weekly candidate batch.
- Five complete, distinct posts can be approved in one local review session.
- No manual recording or timeline editing is required for the pilot batch.
- Every post passes automated technical, fact, tone, caption, and safe-area QA.
- TikTok and Instagram receive separate watermark-free exports and metadata.
- Approved exports are immutable, organized by date/slug, and traceable to all
  inputs and decisions.
- Monday-Friday schedules can be prepared with standard or notification-based
  posting paths.
- The engine can ingest platform metrics and generate an evidence-labeled weekly
  learning report.
- The existing public post and existing repository assets remain untouched.
- No AI avatar code, service, or visual appears anywhere in the workflow.
- No credential or private user data enters version control or generated media.
