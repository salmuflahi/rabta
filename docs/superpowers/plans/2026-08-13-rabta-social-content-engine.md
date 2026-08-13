# Rabta Social Content Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local weekly content engine that generates, voices, records, edits, validates, reviews, exports, schedules, and learns from five faceless Rabta posts for TikTok and Instagram.

**Architecture:** A new `marketing/social-engine` pnpm workspace package owns the marketing-only domain, SQLite state, provider adapters, deterministic product capture, Remotion renderer, QA pipeline, local review application, and metrics loop. The shipped Rabta app remains dependency-free from the marketing engine; existing capture fixtures are extended only through explicit social capture modes.

**Tech Stack:** Node.js 22, TypeScript 5.6+, pnpm, Zod 3, Node SQLite, Vitest 2, React 18, Vite 6, Remotion 4.0.507, FFmpeg/ffprobe, ElevenLabs API, Metricool Advanced API.

## Global Constraints

- Publish exactly one approved post per weekday, Monday through Friday, on TikTok and Instagram.
- Generate seven to ten candidates in the Sunday batch and fully prepare the strongest five.
- Optimize for reach and followers first, with profile visits, link clicks, and Rabta downloads as the final outcome.
- Never use an AI avatar, generated talking head, or fake founder footage.
- Script voice is a relaxed developer around age 20: direct, understated, naturally casual, occasionally profane, and never corporate or full of forced slang.
- Disallow “revolutionize,” “game-changing,” “unlock,” “supercharge,” and “transform your workflow.”
- Every public claim must resolve to a current public fact in `config/product-facts.json`.
- Preserve Rabta's privacy claims: no file contents, terminal output, page contents, credentials, real workspace data, or user telemetry.
- The existing public social post is legacy history and is excluded from the new creative baseline.
- Every public schedule requires explicit human approval; approved versions are immutable.
- Final video is 1080×1920, 30 FPS, H.264/AAC MP4, yuv420p, with no third-party watermark.
- Default video length is 12–24 seconds, with a content proposition inside three seconds and a meaningful visual change normally every one to two seconds.
- Captions show two to five words per phrase, use no more than two lines, and highlight the active word in Rabta orange.
- Keep credentials in ignored local configuration or the OS credential store; never commit, log, screenshot, or export them.
- Preserve the user's existing uncommitted change in `apps/desktop/capture/social/build.mjs`; this plan does not modify that file.
- Paid boundaries are usage-based OpenAI script generation (budgeted at $5–20/month), ElevenLabs Creator (approximately $22/month), and Metricool Advanced (approximately $54/month); complete mock/local work before requesting credentials.

---

## File map

The implementation creates one focused workspace package:

```text
marketing/social-engine/
├── package.json                     # Scripts and dependency boundary
├── tsconfig.json                    # Node/React TypeScript settings
├── vite.config.ts                   # Local review client build
├── index.html                       # Local review client HTML entry
├── vitest.config.ts                 # Unit/integration test environment
├── .env.example                     # Credential names without values
├── README.md                        # Operator workflow and paywall setup
├── config/
│   ├── product-facts.json           # Current public claim allowlist
│   ├── tone.json                    # Voice and prohibited-copy rules
│   ├── platforms.json               # Export/safe-area/platform defaults
│   └── schedule.json                # Sunday batch and weekday cadence
├── src/
│   ├── domain/
│   │   ├── schema.ts                # Zod schemas and inferred domain types
│   │   ├── state.ts                 # Legal content-state transitions
│   │   ├── facts.ts                 # Fact lookup and claim validation
│   │   └── tone.ts                  # Deterministic tone lint
│   ├── db/
│   │   ├── migrate.ts               # SQLite schema creation
│   │   └── repository.ts            # Content/event/metric persistence
│   ├── providers/
│   │   ├── contracts.ts             # Script, voice, scheduler interfaces
│   │   ├── mock-script.ts            # Deterministic candidate fixture
│   │   ├── openai-script.ts          # Paid structured script adapter
│   │   ├── mock-voice.ts             # Deterministic audible voice fixture
│   │   ├── elevenlabs.ts             # Paid TTS adapter
│   │   ├── mock-scheduler.ts         # Local scheduling/metrics fixture
│   │   └── metricool.ts              # Paid schedule/analytics adapter
│   ├── content/
│   │   ├── select.ts                 # Diversity and score-based top-five
│   │   └── generate.ts               # Candidate generation and validation
│   ├── capture/
│   │   ├── shots.ts                  # Social shot contracts and focus boxes
│   │   └── record.ts                 # Deterministic capture command wrapper
│   ├── voice/
│   │   └── generate.ts               # Provider-neutral audio/timing pipeline
│   ├── renderer/
│   │   ├── index.ts                  # Remotion registration entry
│   │   ├── Root.tsx                  # Dynamic composition metadata
│   │   ├── CreatorVideo.tsx          # Hook/body/close timeline
│   │   ├── Captions.tsx              # Word-aligned phrase captions
│   │   ├── ProductStage.tsx           # Cropped footage and callouts
│   │   └── render.ts                  # CLI render wrapper
│   ├── qa/
│   │   ├── media.ts                  # ffprobe/loudness/media validation
│   │   ├── visual.ts                 # Caption and safe-area assertions
│   │   └── run.ts                    # Combined blocking QA report
│   ├── exports/
│   │   └── package.ts                # Immutable platform package writer
│   ├── pipeline/
│   │   ├── batch.ts                  # Sunday candidate-to-render orchestration
│   │   └── schedule.ts               # Monday-Friday schedule preparation
│   ├── review/
│   │   ├── server.ts                 # Local API and static client server
│   │   ├── api.ts                    # Review action application service
│   │   └── client/
│   │       ├── main.tsx              # Browser entry
│   │       ├── App.tsx               # Weekly queue UI
│   │       └── styles.css             # Deliberate Rabta review UI
│   ├── performance/
│   │   ├── comments.ts               # Manual/API comment normalization
│   │   ├── score.ts                  # Evidence-labeled performance scoring
│   │   └── report.ts                 # Weekly Markdown/JSON report
│   └── cli.ts                        # generate/review/schedule/measure commands
├── tests/                             # Mirrors focused source units
├── assets/                            # Ignored generated clips/audio/SFX
├── data/                              # Ignored SQLite and provider responses
└── exports/                           # Ignored immutable ready-to-post output
```

The Rabta capture app receives only these focused additions:

```text
apps/desktop/capture/director.ts       # Parse social shot mode and cue contract
apps/desktop/capture/main.tsx          # Dispatch approved social shot cues
apps/desktop/capture/seed.ts           # Add only truthful fixture states required by shots
apps/desktop/capture/director.test.ts  # Pin shot parsing and cue timing
```

---

### Task 1: Workspace package, domain schemas, facts, and tone gates

**Files:**
- Modify: `pnpm-workspace.yaml`
- Modify: `.gitignore`
- Create: `marketing/social-engine/package.json`
- Create: `marketing/social-engine/tsconfig.json`
- Create: `marketing/social-engine/vitest.config.ts`
- Create: `marketing/social-engine/.env.example`
- Create: `marketing/social-engine/config/product-facts.json`
- Create: `marketing/social-engine/config/tone.json`
- Create: `marketing/social-engine/config/platforms.json`
- Create: `marketing/social-engine/config/schedule.json`
- Create: `marketing/social-engine/src/domain/schema.ts`
- Create: `marketing/social-engine/src/domain/state.ts`
- Create: `marketing/social-engine/src/domain/facts.ts`
- Create: `marketing/social-engine/src/domain/tone.ts`
- Test: `marketing/social-engine/tests/domain.test.ts`

**Interfaces:**
- Consumes: Rabta's public release facts from `README.md`, `docs/privacy-policy.md`, and current capture fixtures.
- Produces: `ContentRecord`, `Candidate`, `WordTiming`, `QaReport`, `MetricSnapshot`, `assertTransition(from, to)`, `validateClaims(script, facts)`, and `lintTone(script, tone)`.

- [ ] **Step 1: Add the workspace and ignored runtime directories**

Add `marketing/*` to `pnpm-workspace.yaml`. Add these exact ignore entries:

```gitignore
/marketing/social-engine/.env
/marketing/social-engine/assets/generated/
/marketing/social-engine/data/
/marketing/social-engine/exports/
/marketing/social-engine/.remotion/
```

Create `package.json` with package name `@rabta/social-engine`, `type: module`, and scripts:

```json
{
  "dev": "tsx src/cli.ts review",
  "build": "tsc -b",
  "test": "vitest run",
  "test:watch": "vitest",
  "generate": "tsx src/cli.ts generate",
  "review": "tsx src/cli.ts review",
  "schedule": "tsx src/cli.ts schedule",
  "measure": "tsx src/cli.ts measure"
}
```

Set dependencies to `@remotion/captions`, `@remotion/cli`, `@remotion/media`,
`remotion` at `4.0.507`, `react`/`react-dom` at `^18.3.1`, and `zod` at
`^3.23.8`. Set development dependencies to `@types/node`, `@types/react`,
`@types/react-dom`, `tsx`, `typescript` `^5.6.0`, `vite` `^6.0.0`, and
`vitest` `^2.1.9`. The build script is TypeScript-only until Task 9 adds the
review client entry and changes it to `tsc -b && vite build`.

Create this TypeScript configuration:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "types": ["node", "vitest/globals"],
    "noEmit": true
  },
  "include": ["src", "tests", "vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 2: Write the failing domain tests**

```ts
import {describe, expect, it} from "vitest";
import {assertTransition} from "../src/domain/state";
import {validateClaims} from "../src/domain/facts";
import {lintTone} from "../src/domain/tone";

describe("social content gates", () => {
  it("accepts the approved happy path and rejects skipped approval", () => {
    expect(() => assertTransition("rendered", "qa_passed")).not.toThrow();
    expect(() => assertTransition("qa_passed", "scheduled")).toThrow(/approved/);
  });

  it("rejects unsupported product claims", () => {
    expect(validateClaims("rabta reads your terminal output")).toContain(
      "terminal output",
    );
    expect(validateClaims("rabta saves files, tabs, terminals and the git branch")).toEqual([]);
  });

  it("rejects corporate copy but permits natural profanity", () => {
    expect(lintTone("unlock a revolutionary workflow")).toEqual(
      expect.arrayContaining([expect.stringMatching(/unlock/), expect.stringMatching(/revolutionary/)]),
    );
    expect(lintTone("coming back to twelve mystery tabs is annoying as shit")).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the test and verify the missing modules fail**

Run: `pnpm install && pnpm --filter @rabta/social-engine test -- tests/domain.test.ts`

Expected: FAIL because `src/domain/state.ts`, `facts.ts`, and `tone.ts` do not exist.

- [ ] **Step 4: Implement schemas and deterministic gates**

Define content states exactly as:

```ts
export const contentStateSchema = z.enum([
  "idea", "scripted", "voiced", "rendered", "qa_passed", "approved",
  "scheduled", "posted", "measured", "archived", "failed", "rejected",
]);
```

`ContentRecord` must include `id`, `slug`, `version`, `state`, `pillar`,
`platforms`, `script`, `hooks`, `selectedHook`, `cta`, `factIds`, `artifacts`,
`createdAt`, and `updatedAt`. `WordTiming` uses `{text, startMs, endMs}`.
`QaReport` uses `{passed, checks, generatedAt}` where each check has
`name`, `passed`, and `detail`.

`Candidate` adds `visualPlan`, `editorialScore`, `validationErrors`, and
platform-specific `captions` and `covers`. `MetricSnapshot` includes
`contentId`, `platform`, `observedAt`, `window`, `views`, nullable
`nonFollowerReach`, `averageWatchPercentage`, `completionRate`, `replayRate`,
and integer `likes`, `shares`, `saves`, `comments`, `profileVisits`, `follows`,
and `linkClicks`. Counts unavailable from a provider are `null`, never zero.

The same schema module defines `ProductFact`, `ToneConfig`,
`PerformanceInsight`, and `ScoreBreakdown`. A performance insight contains
`platform`, `scope` (`hook`, `pillar`, `schedule`, or `comment`), `summary`,
`sampleIds`, `sampleSize`, and `caveats`; this lets Task 3 consume prior evidence
without importing the Task 11 report implementation.

Implement transition adjacency as a constant map. `failed` and `rejected` are
allowed from any nonterminal state; `approved` can be reached only from
`qa_passed`. Keep the fact checker deterministic: match banned claims and require
every `factId` in a candidate to exist, be `public`, and include the current
version. Keep the tone checker deterministic and case-insensitive.

- [ ] **Step 5: Run focused and workspace tests**

Run: `pnpm --filter @rabta/social-engine test -- tests/domain.test.ts && pnpm --filter @rabta/social-engine build`

Expected: domain tests PASS and TypeScript/Vite build succeeds.

- [ ] **Step 6: Commit the foundation**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml .gitignore marketing/social-engine
git commit -m "feat(social): add content engine domain foundation"
```

---

### Task 2: SQLite repository, audit events, metrics, and immutability

**Files:**
- Create: `marketing/social-engine/src/db/migrate.ts`
- Create: `marketing/social-engine/src/db/repository.ts`
- Test: `marketing/social-engine/tests/repository.test.ts`

**Interfaces:**
- Consumes: `ContentRecord`, `ContentState`, and `MetricSnapshot` from Task 1.
- Produces: `SocialRepository.open(path)`, `createContent(record)`, `getContent(id)`, `transition(id, to, detail)`, `appendMetric(snapshot)`, `listWeek(weekOf)`, and `listMetrics(contentId, platform)`.

- [ ] **Step 1: Write failing repository tests against a temporary SQLite file**

```ts
import {mkdtempSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {describe, expect, it} from "vitest";
import {SocialRepository} from "../src/db/repository";

it("records legal transitions and preserves an append-only audit", () => {
  const repo = SocialRepository.open(join(mkdtempSync(join(tmpdir(), "rabta-social-")), "test.db"));
  repo.createContent({
    id: "post-1", slug: "mystery-tabs", version: 1, state: "idea",
    pillar: "developer_problem", platforms: ["tiktok", "instagram"],
    script: "", hooks: [], selectedHook: "", cta: "", factIds: [],
    artifacts: {}, createdAt: "2026-08-16T12:00:00.000Z", updatedAt: "2026-08-16T12:00:00.000Z",
  });
  repo.transition("post-1", "scripted", {actor: "pipeline"});
  expect(repo.getContent("post-1")?.state).toBe("scripted");
  expect(repo.listEvents("post-1").map((event) => event.toState)).toEqual(["idea", "scripted"]);
});

it("refuses mutation of an approved version", () => {
  const repo = SocialRepository.memory();
  repo.createFixture("qa_passed");
  repo.transition("fixture", "approved", {actor: "sammy"});
  expect(() => repo.updateScript("fixture", "changed after approval")).toThrow(/new version/);
});
```

- [ ] **Step 2: Run the tests and verify repository imports fail**

Run: `pnpm --filter @rabta/social-engine test -- tests/repository.test.ts`

Expected: FAIL because `SocialRepository` is not defined.

- [ ] **Step 3: Create the SQLite schema and repository**

Use `DatabaseSync` from `node:sqlite`. Migrations create `content`,
`content_events`, `metrics`, and `provider_operations`. Enable foreign keys and
WAL. Store validated domain JSON in `content.payload`; index `state`, `week_of`,
and `(content_id, platform, observed_at)`.

Every transition runs in a transaction: read and parse the current record,
validate with `assertTransition`, update `state` and `updated_at`, then append an
event. `updateScript` must throw once state is `approved` or later. A changed
approved post must be cloned through `createVersion(id)` with `version + 1`.

- [ ] **Step 4: Run repository and full package tests**

Run: `pnpm --filter @rabta/social-engine test -- tests/repository.test.ts && pnpm --filter @rabta/social-engine test`

Expected: all tests PASS; Node may print one SQLite experimental warning, but no
test may depend on warning text.

- [ ] **Step 5: Commit persistence**

```bash
git add marketing/social-engine/src/db marketing/social-engine/tests/repository.test.ts
git commit -m "feat(social): persist content audit and metrics"
```

---

### Task 3: Provider contracts, natural script generation, and weekly selection

**Files:**
- Create: `marketing/social-engine/src/providers/contracts.ts`
- Create: `marketing/social-engine/src/providers/mock-script.ts`
- Create: `marketing/social-engine/src/providers/openai-script.ts`
- Create: `marketing/social-engine/src/content/generate.ts`
- Create: `marketing/social-engine/src/content/select.ts`
- Test: `marketing/social-engine/tests/content-generation.test.ts`

**Interfaces:**
- Consumes: validated facts/tone config and repository from Tasks 1-2.
- Produces: `ScriptProvider.generate(request): Promise<Candidate[]>`, `generateCandidates(context, provider)`, and `selectWeeklyBatch(candidates, 5)`.

- [ ] **Step 1: Write a failing generation and diversity test**

```ts
import {describe, expect, it} from "vitest";
import {MockScriptProvider} from "../src/providers/mock-script";
import {generateCandidates} from "../src/content/generate";
import {selectWeeklyBatch} from "../src/content/select";

it("generates validated candidates with three distinct hooks", async () => {
  const candidates = await generateCandidates({
    weekOf: "2026-08-17",
    count: 8,
    comments: ["does this restore my branch too?"],
  }, new MockScriptProvider());
  expect(candidates).toHaveLength(8);
  expect(candidates.every((candidate) => new Set(candidate.hooks).size >= 3)).toBe(true);
  expect(candidates.flatMap((candidate) => candidate.validationErrors)).toEqual([]);
});

it("selects five posts without losing the weekly pillar mix", async () => {
  const candidates = await new MockScriptProvider().generateFixture(10);
  const selected = selectWeeklyBatch(candidates, 5);
  expect(selected).toHaveLength(5);
  expect(selected.filter((item) => item.pillar === "developer_problem")).toHaveLength(2);
  expect(new Set(selected.map((item) => item.pillar)).size).toBeGreaterThanOrEqual(4);
});
```

- [ ] **Step 2: Run the tests and confirm missing provider failures**

Run: `pnpm --filter @rabta/social-engine test -- tests/content-generation.test.ts`

Expected: FAIL because the provider and selection modules do not exist.

- [ ] **Step 3: Define the provider contract and prompt payload**

```ts
export interface ScriptRequest {
  weekOf: string;
  count: number;
  facts: ProductFact[];
  tone: ToneConfig;
  priorInsights: PerformanceInsight[];
  comments: string[];
  trendNotes: string[];
}

export interface ScriptProvider {
  generate(request: ScriptRequest): Promise<Candidate[]>;
}

export interface VoiceRequest {
  text: string;
  outputPath: string;
  signal?: AbortSignal;
}

export interface VoiceArtifact {
  audioPath: string;
  durationMs: number;
  words: WordTiming[];
  provider: string;
  checksum: string;
}

export interface ScheduledPost {
  contentId: string;
  platform: "tiktok" | "instagram";
  publishAt: string;
  mediaPath: string;
  coverPath: string;
  caption: string;
  manualNotification: boolean;
}

export interface VoiceProvider {
  synthesize(request: VoiceRequest, idempotencyKey: string): Promise<VoiceArtifact>;
}

export interface SchedulerProvider {
  schedule(post: ScheduledPost, idempotencyKey: string): Promise<{scheduleId: string}>;
  metrics(postIds: string[], observedAt: string): Promise<MetricSnapshot[]>;
}
```

The generation service supplies facts and tone rules as structured data, rejects
any provider result that fails the Candidate schema, fact check, or tone lint,
and makes at most two repair attempts. It persists failed provider output only in
the ignored `data/provider-errors` directory with secrets redacted.

Implement `OpenAiScriptProvider` behind the same contract. It reads
`OPENAI_API_KEY` at construction, requests schema-constrained candidate JSON,
sets temperature/creativity through the selected model's supported controls,
and validates the returned JSON through the same local Zod/fact/tone gates. The
API response cannot advance state directly. Retry only HTTP 429 and 5xx with the
shared 1s/2s/4s policy; redact authorization headers and raw provider bodies from
user-facing errors.

- [ ] **Step 4: Implement deterministic mock candidates and top-five selection**

The fixture must contain 10 specific candidates spanning
`developer_problem`, `product_proof`, `developer_culture`, `build_in_public`,
and `comment_reply`. Use the approved natural tone; include the line “future me
can figure his own shit out” in one fixture and no prohibited corporate terms.

Selection first fills the default pillar allocation, then uses `editorialScore`
to fill gaps. It rejects duplicate selected hooks after lowercase punctuation
normalization. It never uses metrics from `legacy` records.

- [ ] **Step 5: Run content tests and inspect the generated fixture JSON**

Run: `pnpm --filter @rabta/social-engine test -- tests/content-generation.test.ts`

Expected: PASS with eight valid generated candidates and a diverse five-post
selection.

- [ ] **Step 6: Commit content generation**

```bash
git add marketing/social-engine/src/providers/contracts.ts marketing/social-engine/src/providers/mock-script.ts marketing/social-engine/src/providers/openai-script.ts marketing/social-engine/src/content marketing/social-engine/tests/content-generation.test.ts marketing/social-engine/.env.example
git commit -m "feat(social): generate and select weekly scripts"
```

---

### Task 4: Directed, privacy-safe product capture clips

**Files:**
- Modify: `apps/desktop/capture/director.ts`
- Modify: `apps/desktop/capture/main.tsx`
- Modify: `apps/desktop/capture/seed.ts`
- Modify: `apps/desktop/capture/director.test.ts`
- Create: `marketing/social-engine/src/capture/shots.ts`
- Create: `marketing/social-engine/src/capture/record.ts`
- Test: `marketing/social-engine/tests/capture.test.ts`

**Interfaces:**
- Consumes: existing deterministic capture app and `Candidate.visualPlan`.
- Produces: `SOCIAL_SHOTS`, `resolveShot(id)`, `recordShots(ids, outputDir)`, and reusable clips plus `{x, y, width, height, startMs, endMs}` focus metadata.

- [ ] **Step 1: Extend failing director tests with explicit social shot modes**

```ts
it("parses an approved social shot without changing screen/demo parsing", () => {
  expect(parseCaptureMode("#social=task-switch")).toEqual({kind: "social", name: "task-switch"});
  expect(parseCaptureMode("#capture=overview")).toEqual({kind: "screen", name: "overview"});
});

it("pins the task-switch cue sequence", () => {
  expect(SOCIAL_TIMELINES["task-switch"].cues).toEqual([
    {atMs: 0, action: "show-active-task"},
    {atMs: 350, action: "capture-task"},
    {atMs: 1200, action: "open-other-task"},
    {atMs: 2300, action: "resume-original-task"},
  ]);
});
```

- [ ] **Step 2: Run existing desktop capture tests and confirm the new types fail**

Run: `pnpm --filter desktop test -- capture/director.test.ts`

Expected: FAIL because `social` modes and `SOCIAL_TIMELINES` are absent.

- [ ] **Step 3: Add five truthful social timelines**

Add `task-switch`, `capture-task`, `honest-restore`, `branch-context`, and
`focus-mode`. Each timeline must use current commands already supported by
`mock-tauri.ts`; if one requires a fixture change, add representative invented
data only. Mark `document.documentElement.dataset.socialReady` and
`socialComplete` so the recorder has deterministic boundaries.

`shots.ts` defines each clip's expected duration and focus rectangle. Keep
focus rectangles within the 1280×720 capture source and ensure the crop contains
the relevant control plus enough surrounding context to understand it.

Define the timeline and shot contracts explicitly:

```ts
export const SOCIAL_TIMELINES = {
  "task-switch": {
    durationMs: 3_600,
    cues: [
      {atMs: 0, action: "show-active-task"},
      {atMs: 350, action: "capture-task"},
      {atMs: 1_200, action: "open-other-task"},
      {atMs: 2_300, action: "resume-original-task"},
    ],
  },
} as const;

export interface SocialShot {
  id: SocialShotName;
  durationMs: number;
  focus: {x: number; y: number; width: number; height: number};
}
```

- [ ] **Step 4: Implement `recordShots` as a safe wrapper**

Reuse the proven serial process and validation structure from
`apps/desktop/capture/record-demos.mjs`: start capture Vite on port 5199, use a
throwaway Chrome profile, wait on dataset markers, record one job at a time, and
probe each result. Write only beneath the caller-provided output directory and
refuse to overwrite unless `replace: true` is passed.

```ts
export async function recordShots(
  ids: SocialShotName[],
  outputDir: string,
  options: {replace: boolean} = {replace: false},
): Promise<Array<{shot: SocialShot; videoPath: string}>>;
```

- [ ] **Step 5: Run unit tests and a two-shot smoke capture**

Run:

```bash
pnpm --filter desktop test -- capture/director.test.ts
pnpm --filter @rabta/social-engine test -- tests/capture.test.ts
pnpm --filter @rabta/social-engine exec tsx src/capture/record.ts --shots capture-task,honest-restore --out assets/generated/capture-smoke
```

Expected: tests PASS; two silent H.264 clips exist, contain no real home path,
and match their declared dimensions/duration tolerances. If macOS Screen
Recording permission is absent, the command must fail with the exact System
Settings path and leave no zero-byte output.

- [ ] **Step 6: Commit capture direction**

```bash
git add apps/desktop/capture/director.ts apps/desktop/capture/main.tsx apps/desktop/capture/seed.ts apps/desktop/capture/director.test.ts marketing/social-engine/src/capture marketing/social-engine/tests/capture.test.ts
git commit -m "feat(social): direct reusable product capture clips"
```

---

### Task 5: Provider-neutral voice generation and ElevenLabs boundary

**Files:**
- Create: `marketing/social-engine/src/providers/mock-voice.ts`
- Create: `marketing/social-engine/src/providers/elevenlabs.ts`
- Create: `marketing/social-engine/src/voice/generate.ts`
- Test: `marketing/social-engine/tests/voice.test.ts`

**Interfaces:**
- Consumes: `VoiceProvider` from Task 3 and validated selected scripts.
- Produces: `VoiceProvider.synthesize(request, idempotencyKey)`, `VoiceArtifact`, and `generateVoice(candidate, provider, outputDir)`.

- [ ] **Step 1: Write failing voice contract tests**

```ts
it("returns audible narration and monotonic word timing", async () => {
  const artifact = await generateVoice(candidateFixture, new MockVoiceProvider(), tempDir);
  expect(artifact.durationMs).toBeGreaterThan(4_000);
  expect(artifact.words.every((word, index, words) => index === 0 || word.startMs >= words[index - 1].endMs)).toBe(true);
  expect(statSync(artifact.audioPath).size).toBeGreaterThan(1_000);
});

it("reuses an idempotent provider operation", async () => {
  const provider = new MockVoiceProvider();
  await generateVoice(candidateFixture, provider, tempDir);
  await generateVoice(candidateFixture, provider, tempDir);
  expect(provider.calls).toBe(1);
});
```

- [ ] **Step 2: Run tests and verify missing voice modules fail**

Run: `pnpm --filter @rabta/social-engine test -- tests/voice.test.ts`

Expected: FAIL because `MockVoiceProvider` and `generateVoice` are absent.

- [ ] **Step 3: Implement the mock voice and timing artifact**

Generate a deterministic audible WAV locally with FFmpeg's `sine` source and a
quiet amplitude envelope; the mock is not a human voice, but it makes silence,
duration, muxing, and caption tests real before payment. Derive deterministic
word boundaries from word lengths and punctuation. Store the provider operation
hash in `provider_operations` before returning.

```ts
export class MockVoiceProvider implements VoiceProvider {
  calls = 0;
  async synthesize(request: VoiceRequest, idempotencyKey: string): Promise<VoiceArtifact>;
}

export async function generateVoice(
  candidate: Candidate,
  provider: VoiceProvider,
  outputDir: string,
): Promise<VoiceArtifact>;
```

- [ ] **Step 4: Implement the paid ElevenLabs adapter without calling it**

Read `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, and
`ELEVENLABS_MODEL_ID` only at adapter construction. POST to the official
text-to-speech endpoint with word timestamps enabled, send the content hash as
the local idempotency key, validate response status/content type/timings, and
write the response atomically. Redact the `xi-api-key` header in every error.
Bound retries to HTTP 429 and 5xx responses with delays of 1s, 2s, and 4s.

```ts
const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`;
const response = await fetch(endpoint, {
  method: "POST",
  headers: {"content-type": "application/json", "xi-api-key": apiKey},
  body: JSON.stringify({text: request.text, model_id: modelId}),
  signal: request.signal,
});
```

- [ ] **Step 5: Run voice tests and provider error tests**

Run: `pnpm --filter @rabta/social-engine test -- tests/voice.test.ts`

Expected: PASS without an ElevenLabs account or network request.

- [ ] **Step 6: Commit voice boundaries**

```bash
git add marketing/social-engine/src/providers/mock-voice.ts marketing/social-engine/src/providers/elevenlabs.ts marketing/social-engine/src/voice marketing/social-engine/tests/voice.test.ts marketing/social-engine/.env.example
git commit -m "feat(social): add natural voice provider boundary"
```

---

### Task 6: Remotion creator renderer and word-synced captions

**Files:**
- Create: `marketing/social-engine/src/renderer/index.ts`
- Create: `marketing/social-engine/src/renderer/Root.tsx`
- Create: `marketing/social-engine/src/renderer/CreatorVideo.tsx`
- Create: `marketing/social-engine/src/renderer/Captions.tsx`
- Create: `marketing/social-engine/src/renderer/ProductStage.tsx`
- Create: `marketing/social-engine/src/renderer/render.ts`
- Test: `marketing/social-engine/tests/captions.test.ts`
- Test: `marketing/social-engine/tests/renderer.test.ts`

**Interfaces:**
- Consumes: candidate, `VoiceArtifact`, captured clips, and platform config.
- Produces: `CreatorVideoProps`, `paginateWords(words)`, `calculateVideoMetadata(props)`, and `renderPlatformVideo(props, platform, output)`.

- [ ] **Step 1: Write failing caption pagination tests**

```ts
it("uses two to five words and never exceeds two lines", () => {
  const pages = paginateWords(wordFixture("having forty tabs is not actually the problem"));
  expect(pages.every((page) => page.words.length >= 2 && page.words.length <= 5)).toBe(true);
  expect(pages.every((page) => page.lines.length <= 2)).toBe(true);
});

it("keeps active timing inside its page", () => {
  const pages = paginateWords(wordFixture("future me can figure his own shit out"));
  expect(pages.every((page) => page.startMs === page.words[0].startMs)).toBe(true);
  expect(pages.every((page) => page.endMs === page.words.at(-1)?.endMs)).toBe(true);
});
```

- [ ] **Step 2: Run tests and verify renderer imports fail**

Run: `pnpm --filter @rabta/social-engine test -- tests/captions.test.ts tests/renderer.test.ts`

Expected: FAIL because renderer modules are absent.

- [ ] **Step 3: Implement dynamic composition metadata and timeline**

`calculateVideoMetadata` returns 1080×1920, 30 FPS, and
`Math.ceil((voice.durationMs + closeHoldMs) / 1000 * 30)` frames. The timeline
uses `Sequence`, `Series`, `useCurrentFrame`, `interpolate`, and explicit easing.
Do not use CSS transitions, CSS animations, or Tailwind animation classes.

The first product action begins on frame 0. Use selected hook text as the first
caption content; do not render a logo intro. Product shots change according to
the candidate's visual plan, with controlled 1.0-1.08 punch-ins and optional
cursor/callout emphasis. The Rabta mark or name may appear subtly after the hook.

```ts
export const calculateVideoMetadata: CalculateMetadataFunction<CreatorVideoProps> = async ({props}) => ({
  fps: 30,
  width: 1080,
  height: 1920,
  durationInFrames: Math.ceil(((props.voice.durationMs + props.closeHoldMs) / 1000) * 30),
  props,
});
```

- [ ] **Step 4: Implement platform-safe caption rendering**

Use the shared safe rectangle from `platforms.json`. Render at most two lines,
active word `#ff7043`, inactive words `#ffffff`, and a high-contrast shadow or
backplate. TikTok and Instagram may use different bottom offsets, but neither
may place caption bounds in the top 180px, bottom 320px, or rightmost 120px.

```ts
const captionStyle = {
  left: 70,
  right: 140,
  bottom: 340,
  color: "#ffffff",
  fontSize: 64,
  fontWeight: 850,
  lineHeight: 1.06,
  textShadow: "0 4px 22px rgba(0,0,0,.92)",
} as const;
```

- [ ] **Step 5: Render deterministic stills and one mock video**

Run:

```bash
pnpm --filter @rabta/social-engine test -- tests/captions.test.ts tests/renderer.test.ts
pnpm --filter @rabta/social-engine exec remotion still src/renderer/index.ts RabtaCreator assets/generated/renderer-hook.png --frame 0
pnpm --filter @rabta/social-engine exec tsx src/renderer/render.ts --fixture mystery-tabs --platform tiktok --out assets/generated/renderer-smoke.mp4
```

Expected: tests PASS; still is 1080×1920; video has visible movement from frame
0, audible mock audio, orange word highlighting, and no captions beneath the
bottom safe boundary.

- [ ] **Step 6: Commit renderer**

```bash
git add marketing/social-engine/src/renderer marketing/social-engine/tests/captions.test.ts marketing/social-engine/tests/renderer.test.ts marketing/social-engine/package.json pnpm-lock.yaml
git commit -m "feat(social): render creator-style vertical videos"
```

---

### Task 7: Blocking media/visual QA and immutable export packages

**Files:**
- Create: `marketing/social-engine/src/qa/media.ts`
- Create: `marketing/social-engine/src/qa/visual.ts`
- Create: `marketing/social-engine/src/qa/run.ts`
- Create: `marketing/social-engine/src/exports/package.ts`
- Test: `marketing/social-engine/tests/qa.test.ts`
- Test: `marketing/social-engine/tests/export.test.ts`

**Interfaces:**
- Consumes: rendered video, render layout manifest, voice timing, and content record.
- Produces: `runQa(input): Promise<QaReport>` and `writeApprovedPackage(input): Promise<ExportManifest>`.

- [ ] **Step 1: Write failing QA tests with valid and invalid fixtures**

```ts
it("blocks wrong dimensions and missing audio", async () => {
  const report = await runQa({videoPath: silentLandscapeFixture, layout: validLayout});
  expect(report.passed).toBe(false);
  expect(report.checks).toEqual(expect.arrayContaining([
    expect.objectContaining({name: "dimensions", passed: false}),
    expect.objectContaining({name: "audio_stream", passed: false}),
  ]));
});

it("refuses to overwrite an approved export", async () => {
  await writeApprovedPackage(validPackageInput);
  await expect(writeApprovedPackage(validPackageInput)).rejects.toThrow(/immutable/);
});
```

- [ ] **Step 2: Run tests and verify QA/export modules fail**

Run: `pnpm --filter @rabta/social-engine test -- tests/qa.test.ts tests/export.test.ts`

Expected: FAIL because QA and package writers do not exist.

- [ ] **Step 3: Implement media and visual checks**

Call `ffprobe` through `execFile`, never a shell string. Require one H.264 video
stream, one AAC audio stream, 1080×1920, 30/1 FPS, yuv420p, nonzero duration,
and duration within 250ms of the timeline contract. Run FFmpeg `loudnorm` in
analysis mode and fail true peak above -1 dBTP or integrated narration mix
outside -18 to -13 LUFS.

Visual checks consume renderer layout JSON: all captions within the configured
safe rectangle, each phrase two to five words, no more than two lines, hook
starts by 1500ms, and visual plan has no gap longer than 2000ms. Render frames at
0%, 25%, 50%, 75%, and 95%; use FFmpeg signal stats to reject all-black frames.

```ts
const mediaContract = {
  width: 1080,
  height: 1920,
  fps: "30/1",
  videoCodec: "h264",
  audioCodec: "aac",
  pixelFormat: "yuv420p",
  durationToleranceMs: 250,
  truePeakMaxDbtp: -1,
  integratedLufs: {min: -18, max: -13},
} as const;
```

- [ ] **Step 4: Implement atomic immutable exports**

Write into a temporary sibling directory, verify checksums, then rename it to
`exports/YYYY-MM-DD-slug-vN`. Include both MP4s, both covers, both caption text
files, `posting-notes.txt`, `content-record.json`, and `qa-report.json`. Refuse
an existing target. Do not export if `qaReport.passed` is false or state is not
`approved`.

```ts
export async function writeApprovedPackage(input: ApprovedPackageInput): Promise<ExportManifest> {
  if (input.record.state !== "approved" || !input.qaReport.passed) {
    throw new Error("approved state and passing QA are required");
  }
  return writeAtomicallyWithoutOverwrite(input);
}
```

- [ ] **Step 5: Run QA/export tests and probe a real smoke render**

Run: `pnpm --filter @rabta/social-engine test -- tests/qa.test.ts tests/export.test.ts && pnpm --filter @rabta/social-engine exec tsx src/qa/run.ts assets/generated/renderer-smoke.mp4`

Expected: tests PASS and the smoke render reports every blocking check by name.

- [ ] **Step 6: Commit QA and exports**

```bash
git add marketing/social-engine/src/qa marketing/social-engine/src/exports marketing/social-engine/tests/qa.test.ts marketing/social-engine/tests/export.test.ts
git commit -m "feat(social): gate and package approved renders"
```

---

### Task 8: Sunday batch orchestration and CLI

**Files:**
- Create: `marketing/social-engine/src/pipeline/batch.ts`
- Create: `marketing/social-engine/src/pipeline/schedule.ts`
- Create: `marketing/social-engine/src/cli.ts`
- Test: `marketing/social-engine/tests/batch.test.ts`

**Interfaces:**
- Consumes: repository, script/voice providers, capture, renderer, and QA.
- Produces: `runSundayBatch(deps, options): Promise<BatchResult>` and CLI commands `generate`, `review`, `schedule`, `measure`.

- [ ] **Step 1: Write a failing batch orchestration test**

```ts
it("prepares exactly five QA-passed posts from eight candidates", async () => {
  const result = await runSundayBatch(mockDependencies(), {
    weekOf: "2026-08-17", candidateCount: 8, selectedCount: 5,
  });
  expect(result.candidateIds).toHaveLength(8);
  expect(result.reviewIds).toHaveLength(5);
  expect(result.records.every((record) => record.state === "qa_passed")).toBe(true);
  expect(result.records.filter((record) => record.pillar === "developer_problem")).toHaveLength(2);
});
```

- [ ] **Step 2: Run the batch test and confirm missing orchestrator failure**

Run: `pnpm --filter @rabta/social-engine test -- tests/batch.test.ts`

Expected: FAIL because `runSundayBatch` is absent.

- [ ] **Step 3: Implement resumable stage orchestration**

Process selected posts with a concurrency of two for script-independent work and
one for capture. Before each stage, read current state and reuse a valid artifact
whose checksum matches the record. On failure, append a `failed` event with
stage, retryability, and redacted message; continue other selected posts and
return a nonzero CLI exit when fewer than five reach `qa_passed`.

```ts
for (const candidate of selected) {
  await stages.voice(candidate);
  await stages.capture(candidate);
  await stages.render(candidate, "tiktok");
  await stages.render(candidate, "instagram");
  const report = await stages.qa(candidate);
  repository.transition(candidate.id, report.passed ? "qa_passed" : "failed", {
    stage: "qa",
    retryable: false,
  });
}
```

- [ ] **Step 4: Implement exact CLI parsing and dry-run defaults**

`generate` defaults to the next Monday in `America/New_York`, eight candidates,
five selections, `mock` script, `mock` voice, and no network. `--live-voice`
selects ElevenLabs only when credentials exist. `--json` prints a machine-
readable BatchResult; normal output prints IDs, states, and local review URL.

```ts
export interface BatchOptions {
  weekOf: string;
  candidateCount: number;
  selectedCount: 5;
  scriptProvider: "mock" | "live";
  voiceProvider: "mock" | "elevenlabs";
}
```

- [ ] **Step 5: Run the complete mock batch**

Run: `pnpm --filter @rabta/social-engine generate -- --week-of 2026-08-17 --json`

Expected: exit 0, eight candidate records, five QA-passed review records, and no
network requests. Re-run the same command and confirm it reuses matching
artifacts rather than creating duplicate provider operations.

- [ ] **Step 6: Commit orchestration**

```bash
git add marketing/social-engine/src/pipeline marketing/social-engine/src/cli.ts marketing/social-engine/tests/batch.test.ts
git commit -m "feat(social): orchestrate weekly content batches"
```

---

### Task 9: Local one-minute approval dashboard

**Files:**
- Modify: `marketing/social-engine/package.json`
- Create: `marketing/social-engine/index.html`
- Create: `marketing/social-engine/vite.config.ts`
- Create: `marketing/social-engine/src/review/server.ts`
- Create: `marketing/social-engine/src/review/api.ts`
- Create: `marketing/social-engine/src/review/client/main.tsx`
- Create: `marketing/social-engine/src/review/client/App.tsx`
- Create: `marketing/social-engine/src/review/client/styles.css`
- Test: `marketing/social-engine/tests/review-api.test.ts`
- Test: `marketing/social-engine/tests/review-ui.test.tsx`

**Interfaces:**
- Consumes: repository week queue, preview media, regeneration services, and QA.
- Produces: local endpoints `GET /api/weeks/:week`, `POST /api/content/:id/approve`, `/regenerate-hook`, `/regenerate-voice`, and `/reject`.

- [ ] **Step 1: Write failing review action tests**

```ts
it("approves only QA-passed content and records the actor", async () => {
  const service = reviewServiceWithFixture("qa_passed");
  const record = await service.approve("fixture", {actor: "sammy"});
  expect(record.state).toBe("approved");
  expect(service.repo.listEvents("fixture").at(-1)?.detail.actor).toBe("sammy");
});

it("requires a rejection reason", async () => {
  const service = reviewServiceWithFixture("qa_passed");
  await expect(service.reject("fixture", {actor: "sammy", reason: ""})).rejects.toThrow(/reason/);
});
```

- [ ] **Step 2: Run review tests and verify missing service failure**

Run: `pnpm --filter @rabta/social-engine test -- tests/review-api.test.ts tests/review-ui.test.tsx`

Expected: FAIL because review service and UI are absent.

- [ ] **Step 3: Implement review actions as application services**

Approval validates current QA again, records actor/time, locks the version, and
transitions to `approved`. Hook regeneration creates a new version, preserves
concept and useful visual plan, reruns voice/render/QA, and marks the original
version rejected with reason `superseded_hook`. Voice regeneration follows the
same version rule while preserving script and selected hook. Rejection requires
a nonblank reason of at least three characters.

```ts
export interface ReviewService {
  approve(id: string, input: {actor: string}): Promise<ContentRecord>;
  regenerateHook(id: string, input: {actor: string}): Promise<ContentRecord>;
  regenerateVoice(id: string, input: {actor: string}): Promise<ContentRecord>;
  reject(id: string, input: {actor: string; reason: string}): Promise<ContentRecord>;
}
```

- [ ] **Step 4: Build the focused weekly review UI**

Show one post at a time with video, covers, TikTok caption, Instagram caption,
pillar, hook type, schedule, QA checks, and native-audio note. Put **Approve**,
**Regenerate hook**, **Regenerate voice**, and **Reject** in a persistent action
row. Display progress such as `2 of 5 approved`; keyboard shortcuts are `A`,
`H`, `V`, and `R` only when focus is not in an input. Use Rabta's dark green,
warm off-white, and orange palette without copying the shipped app's navigation.

Add `@testing-library/react` and `happy-dom` as development dependencies. Create
`index.html` with only `<div id="root"></div>` and a module script for
`/src/review/client/main.tsx`. Change the package build script to:

```json
{
  "build": "tsc -b && vite build"
}
```

- [ ] **Step 5: Run tests and a browser review smoke test**

Run:

```bash
pnpm --filter @rabta/social-engine test -- tests/review-api.test.ts tests/review-ui.test.tsx
pnpm --filter @rabta/social-engine review -- --week-of 2026-08-17
```

Expected: local server prints one loopback URL; all five preview videos play;
approve/regenerate/reject produce visible new states; no server route binds to a
non-loopback interface.

- [ ] **Step 6: Commit review UI**

```bash
git add marketing/social-engine/vite.config.ts marketing/social-engine/src/review marketing/social-engine/tests/review-api.test.ts marketing/social-engine/tests/review-ui.test.tsx
git commit -m "feat(social): add local weekly approval queue"
```

---

### Task 10: Scheduling, Metricool adapter, and notification fallback

**Files:**
- Create: `marketing/social-engine/src/providers/mock-scheduler.ts`
- Create: `marketing/social-engine/src/providers/metricool.ts`
- Modify: `marketing/social-engine/src/pipeline/schedule.ts`
- Test: `marketing/social-engine/tests/scheduling.test.ts`

**Interfaces:**
- Consumes: five approved exports and `SchedulerProvider` contract.
- Produces: `prepareWeekSchedule(records, config)`, `scheduleWeek(records, provider)`, `SchedulerProvider.schedule(post, idempotencyKey)`, schedule IDs, and notification/manual posting notes.

- [ ] **Step 1: Write failing weekday and approval tests**

```ts
it("assigns one approved post to each weekday", () => {
  const schedule = prepareWeekSchedule(fiveApprovedFixtures(), scheduleConfig);
  expect(schedule.map((entry) => entry.publishAt.slice(0, 10))).toEqual([
    "2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21",
  ]);
});

it("never schedules unapproved content", async () => {
  await expect(scheduleWeek([...fourApprovedFixtures(), qaPassedFixture])).rejects.toThrow(/approved/);
});
```

- [ ] **Step 2: Run tests and verify scheduler failure**

Run: `pnpm --filter @rabta/social-engine test -- tests/scheduling.test.ts`

Expected: FAIL because scheduler implementations are absent.

- [ ] **Step 3: Implement local schedule preparation and CSV fallback**

Assign Monday-Friday dates in `America/New_York` and use configured experimental
time windows until platform/account data has a qualified recommendation. Each
entry stores separate TikTok and Instagram timestamps. Write a Metricool-ready
CSV plus posting notes even when API credentials are absent, so the workflow can
be used before purchase.

Set `manualNotification: true` when the post requests trending/native audio,
effects, Trial Reel, or platform-only options. Posting notes state the suggested
sound/search phrase and disclosure check; they never claim the sound was added.

```ts
export interface ScheduleEntry {
  contentId: string;
  platform: "tiktok" | "instagram";
  publishAt: string;
  caption: string;
  mediaPath: string;
  coverPath: string;
  manualNotification: boolean;
  nativeAudioSearch?: string;
}
```

- [ ] **Step 4: Implement Metricool Advanced adapter without live credentials**

Read `METRICOOL_TOKEN`, `METRICOOL_USER_ID`, and `METRICOOL_BLOG_ID` at adapter
construction. Send the token only in `X-Mc-Auth`. Use an idempotency record before
creating schedules and verify returned schedule IDs. Map notification-based posts
to auto-publish off. Bound retries to 429 and 5xx. Redact the token from errors.

```ts
export class MetricoolProvider implements SchedulerProvider {
  constructor(config: {token: string; userId: string; blogId: string});
  schedule(post: ScheduledPost, idempotencyKey: string): Promise<{scheduleId: string}>;
  metrics(postIds: string[], observedAt: string): Promise<MetricSnapshot[]>;
}
```

- [ ] **Step 5: Run mock scheduling and inspect all ten platform entries**

Run: `pnpm --filter @rabta/social-engine schedule -- --week-of 2026-08-17 --provider mock --json`

Expected: five weekdays, ten platform schedule entries, no weekend dates, no
unapproved record, and manual-notification flags only where requested.

- [ ] **Step 6: Commit scheduling**

```bash
git add marketing/social-engine/src/providers/mock-scheduler.ts marketing/social-engine/src/providers/metricool.ts marketing/social-engine/src/pipeline/schedule.ts marketing/social-engine/tests/scheduling.test.ts marketing/social-engine/.env.example
git commit -m "feat(social): prepare reviewed weekday schedules"
```

---

### Task 11: Metrics ingestion, conservative learning, and weekly report

**Files:**
- Create: `marketing/social-engine/src/performance/comments.ts`
- Create: `marketing/social-engine/src/performance/score.ts`
- Create: `marketing/social-engine/src/performance/report.ts`
- Test: `marketing/social-engine/tests/performance.test.ts`

**Interfaces:**
- Consumes: Metricool/mock metrics, content metadata, and repository snapshots.
- Produces: `normalizeComments(input)`, `scorePost(snapshot)`, `deriveInsights(records, metrics)`, and `writeWeeklyReport(weekOf)`.

- [ ] **Step 1: Write failing evidence and legacy-exclusion tests**

```ts
it("does not name a winner below five comparable posts", () => {
  const insights = deriveInsights(fourComparablePosts(), metricFixtures(4));
  expect(insights.winners).toEqual([]);
  expect(insights.caveats).toContain("fewer than 5 comparable posts");
});

it("excludes legacy records and labels download correlation", () => {
  const insights = deriveInsights([legacyPost(), ...fiveComparablePosts()], metricFixtures(6));
  expect(insights.sampleIds).not.toContain("legacy-founder-post");
  expect(insights.downloadSignal.label).toBe("directional correlation, not attribution");
});

it("promotes substantive questions to reply ideas", () => {
  const comments = normalizeComments([
    {platform: "tiktok", text: "does this restore my branch too?", likes: 7},
    {platform: "instagram", text: "fire", likes: 20},
  ]);
  expect(comments.replyIdeas.map((comment) => comment.text)).toEqual([
    "does this restore my branch too?",
  ]);
});
```

- [ ] **Step 2: Run tests and confirm scoring modules fail**

Run: `pnpm --filter @rabta/social-engine test -- tests/performance.test.ts`

Expected: FAIL because score/report modules are absent.

- [ ] **Step 3: Implement normalized outcome scoring**

Compute rates per 1,000 views for shares, saves, comments, profile visits,
follows, and link clicks. Store watch percentage, completion, and replay rate
when available. Score within platform only; do not compare raw TikTok views to
raw Instagram views. Weight retention and download intent above likes. Keep each
component in the report so the total is explainable.

```ts
const perThousand = (count: number, views: number) => views > 0 ? (count / views) * 1_000 : null;

export function scorePost(snapshot: MetricSnapshot): ScoreBreakdown {
  return {
    retention: snapshot.averageWatchPercentage,
    completion: snapshot.completionRate,
    sharesPerThousand: perThousand(snapshot.shares, snapshot.views),
    savesPerThousand: perThousand(snapshot.saves, snapshot.views),
    commentsPerThousand: perThousand(snapshot.comments, snapshot.views),
    profileVisitsPerThousand: perThousand(snapshot.profileVisits, snapshot.views),
    linkClicksPerThousand: perThousand(snapshot.linkClicks, snapshot.views),
  };
}
```

Require at least five comparable nonlegacy posts before naming a winning hook or
pillar. Require at least two weeks before changing the default pillar allocation.
If metrics are missing, report `unavailable`; never coerce missing values to zero.

`normalizeComments` accepts Metricool/API comment rows when available and a
local JSON export otherwise. It strips handles from report text, keeps platform
and source post ID, and promotes questions or comments with at least six words.
The CLI accepts `measure --comments-file path/to/comments.json`; the source file
remains in ignored local data and only normalized reply ideas enter reports.

- [ ] **Step 4: Generate Markdown and JSON weekly reports**

Include an answer-first summary, per-platform table, strongest/weakest evidence,
comments promoted to reply ideas, schedule observations, next-week experiments,
and caveats. Aggregate GitHub release-download change is always labeled
`directional correlation, not attribution`.

- [ ] **Step 5: Run mock 24h/72h/7d ingestion and report generation**

Run: `pnpm --filter @rabta/social-engine measure -- --week-of 2026-08-17 --provider mock`

Expected: three snapshots per platform post, one Markdown report, one JSON
report, no legacy ID in the sample, and no declared winner if the fixture has
fewer than five comparable posts.

- [ ] **Step 6: Commit performance learning**

```bash
git add marketing/social-engine/src/performance marketing/social-engine/tests/performance.test.ts
git commit -m "feat(social): learn conservatively from post metrics"
```

---

### Task 12: Full dry run, operator documentation, and paid-provider handoff

**Files:**
- Create: `marketing/social-engine/tests/helpers/test-engine.ts`
- Create: `marketing/social-engine/tests/workflow.test.ts`
- Create: `marketing/social-engine/README.md`
- Modify: `package.json`
- Verify: `docs/superpowers/specs/2026-08-13-rabta-social-content-engine-design.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: `createTestEngine(root)`, one verified mock Sunday-to-report workflow, and exact live setup instructions.

- [ ] **Step 1: Write the end-to-end acceptance test**

Create `tests/helpers/test-engine.ts` as a thin composition root over the real
repository, pipeline, review, scheduler, and report services, injecting only the
three mock providers:

```ts
export async function createTestEngine(root: string): Promise<TestEngine> {
  return TestEngine.create({
    root,
    scriptProvider: new MockScriptProvider(),
    voiceProvider: new MockVoiceProvider(),
    schedulerProvider: new MockSchedulerProvider(),
  });
}
```

The test must execute these exact observable stages in a temporary root:

```ts
it("runs Sunday batch through reviewed schedule and measured report", async () => {
  const engine = await createTestEngine(tempRoot);
  const batch = await engine.generate({weekOf: "2026-08-17", candidates: 8, selected: 5});
  expect(batch.reviewIds).toHaveLength(5);

  await engine.regenerateHook(batch.reviewIds[0]);
  await engine.regenerateVoice(batch.reviewIds[1]);
  for (const id of engine.currentReviewIds()) await engine.approve(id, "sammy");

  const scheduled = await engine.schedule({provider: "mock"});
  expect(scheduled).toHaveLength(10);
  await engine.measure({provider: "mock", windows: ["24h", "72h", "7d"]});

  expect(engine.exports()).toHaveLength(5);
  expect(engine.weeklyReport()).toMatch(/directional correlation, not attribution/);
});
```

- [ ] **Step 2: Run the acceptance test and repair only concrete failures**

Run: `pnpm --filter @rabta/social-engine test -- tests/workflow.test.ts`

Expected: PASS with five immutable export directories, ten schedules, and a
weekly report. No external network request is allowed in this test.

- [ ] **Step 3: Write the operator README**

Document:

- Prerequisites: Node 22, pnpm 10, FFmpeg 8, Chrome, macOS capture permission.
- Sunday commands for generate and review.
- Approval meanings and keyboard shortcuts.
- Monday-Friday scheduling and notification flow.
- Metrics snapshot/report commands.
- Recovery from voice, capture, render, QA, schedule, and expired-token failures.
- Exact paywalls: OpenAI API usage credit, ElevenLabs Creator, and Metricool Advanced API.
- Exact environment variable names, without sample secrets.
- A provider connection checklist that performs one nonpublic/private test before
  a reviewed public pilot.
- A cancellation note that prices and renewal behavior must be checked on the
  providers' current billing pages at purchase time.

- [ ] **Step 4: Add root scripts and run complete verification**

Add:

```json
{
  "social:test": "pnpm --filter @rabta/social-engine test",
  "social:generate": "pnpm --filter @rabta/social-engine generate",
  "social:review": "pnpm --filter @rabta/social-engine review"
}
```

Run:

```bash
pnpm social:test
pnpm --filter @rabta/social-engine build
pnpm --filter desktop test -- capture/director.test.ts
pnpm test
git diff --check
```

Expected: all commands exit 0. The broader `pnpm test` confirms the marketing
workspace did not regress Rabta's application, connectors, protocol, or site.

- [ ] **Step 5: Perform visual QA on the five-post mock batch**

Render contact sheets at 0%, 25%, 50%, 75%, and 95% for all ten platform videos.
Inspect every sheet for readable phone-scale product actions, caption bounds,
orange active-word timing, visual variety, first-frame motion, clean covers, and
absence of avatars/watermarks/private data. Record the inspected filenames and
any corrections in the batch's QA JSON.

- [ ] **Step 6: Commit the completed local engine**

```bash
git add package.json pnpm-lock.yaml marketing/social-engine/README.md marketing/social-engine/tests/workflow.test.ts
git commit -m "feat(social): verify weekly content engine workflow"
```

- [ ] **Step 7: Stop at the three live paywalls and request credentials**

Report exactly:

1. Add OpenAI API billing credit and provide `OPENAI_API_KEY` locally for live
   script generation. Keep the monthly engine budget capped at $20.
2. Purchase ElevenLabs Creator, choose three candidate voices, and provide
   `ELEVENLABS_API_KEY` plus the selected `ELEVENLABS_VOICE_ID` locally after a
   blind sample comparison.
3. Purchase Metricool Advanced, connect the existing `@rabtaconnector` TikTok
   and Instagram accounts, and provide `METRICOOL_TOKEN`, `METRICOOL_USER_ID`,
   and `METRICOOL_BLOG_ID` locally.

Do not ask for payment details. Do not place keys in chat, code, Git, or exported
files. Once connected, run one private/nonpublic integration test, then generate
the reviewed five-post pilot. No public post is authorized by provider setup
alone; Sammy must approve each current version in the dashboard.
