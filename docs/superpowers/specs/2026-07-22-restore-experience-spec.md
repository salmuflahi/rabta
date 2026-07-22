# Rabta Signature Resume — "Restore Experience" — Spec

> Verbatim product spec from the user (2026-07-22). This is the authoritative
> spec for the signature Resume interaction. It SUPERSEDES the earlier
> full-screen "ResumeCeremony" (fold-logo) approach.

## Inspection findings (confirmed before building)
- **Trigger:** Resume button in `apps/desktop/src/pages/CapsulesPage.tsx`.
- **Invoke:** `activate_task { taskId }` (Rust `capsules::activate_task`) → returns
  `ActivateSummary { applied: string[]; pending: string[]; skipped: string[];
  savedPrevious: string|null; errors: string[] }`. Strings are connector kinds
  ("git","vscode","chrome",…); `errors` is a separate list of message strings.
- **Progress model: PATH B — final result only.** `activate_task` is a single
  async command; it emits NO incremental per-tool events. So: show the known
  tool rows, run a general "restoring" state, and on the resolved summary reveal
  final per-tool statuses with a short 35–50ms stagger. **No fabricated %.**
- **Reuse:** design system `@/components/ui/*`; Radix Dialog; sonner toasts;
  lucide-react icons; tailwindcss-animate + CSS transitions (NO framer-motion —
  do not add a large animation dep); tokens petrol/ivory/tangerine + `--success`
  (light `#0f7a67`, the sea-glass token) for "Restored".

## Status → tool mapping (PATH B)
- `applied` kind → tool `applied` ("Restored", success/sea token).
- `pending` kind → tool `skipped` with message "On next reload" (NOT a failure).
- `skipped` kind → tool `skipped` ("Skipped", muted).
- `errors` non-empty → overall becomes `partial` (or `failure` if nothing applied);
  if an error string is clearly attributable to a kind, that tool may be `failed`
  ("Couldn't restore"); otherwise surface a concise error in the sheet.
- overall = `success` (≥1 applied, none skipped/pending/failed, no errors) /
  `partial` (some applied + some skipped/pending/failed or errors) /
  `failure` (invoke rejected, or nothing applied and errors present).
- Retry: the backend has **no per-tool retry** command → partial/failure actions
  use **[ Close ] [ View details ]** and **[ Close ] [ Try again ]** (re-runs the
  whole activate), NOT "Retry failed tools".

## Component architecture
```
useRestore() → { start(opts), node, active }
  start(opts: {
    title: "Restoring workspace"; subtitle: <project/capsule name>;
    tools: { id; name; kind }[];                 // from the task's capsule resources
    run: (emit: (toolId, status) => void) => Promise<RestoreResult>;  // performs the restore
    canRetry?: boolean;                          // false for now (whole re-run only)
  })
RestoreExperience (rendered via `node`)
  RestoreBackdrop · RestoreSheet(folded corner) · RestoreHeader · ToolRestoreList(ToolRestoreRow) · RestoreProgress · RestoreActions
```
- `run(emit)` performs the restore. The PLAYGROUND passes scripted `run`s (and uses
  `emit` for the slow-success timeline). REAL integration passes a `run` that calls
  `invoke("activate_task",{taskId})`, normalizes the summary → `RestoreResult`, and
  does NOT call `emit` (component reveals final statuses with the stagger).
- Normalization (ActivateSummary → RestoreResult) lives OUTSIDE the visual rows.
- Run-id / abort-safety: a stale run's resolution must never update a newer run.
- `forceReducedMotion?: boolean` prop for the playground's reduced-motion preview.

---

## [Verbatim spec below]

The goal is not a cinematic loading screen. It should look like a premium native macOS restore operation: fast, controlled, truthful, and clearly connected to Rabta's folded visual identity.

Do not attempt to animate VS Code, Chrome, Terminal, or other external applications themselves. Rabta cannot reliably control their native opening animations. The signature experience happens inside Rabta while the actual restoration runs in parallel.

### CORE EXPERIENCE — state machine
`idle → opening → restoring → success/partial/failure → closing → idle`. One authoritative status value (reducer/state machine), not scattered booleans.
```
type RestoreStage = "idle"|"opening"|"restoring"|"success"|"partial"|"failure"|"closing";
type ToolRestoreStatus = "waiting"|"restoring"|"applied"|"skipped"|"failed";
```
Do not show a tool as restored until the backend confirms.

### FRAME 2 — Button press (same frame as click)
Compress scale 1→0.98 (70–90ms) → back to 1 (~110ms); label → "Restoring…"; icon → small spinner; disable repeat clicks; begin the real restore immediately (don't wait for the animation).

### FRAME 3 — Backdrop
Fixed over the app viewport; petrol-black ~16–20% opacity (fallback `rgba(16,37,38,0.18)`); NO strong blur (≤1–2px acceptable, plain dim preferred); underlying UI stays visible but non-interactive and does NOT slide/scale away. Opacity 0→1, 160ms, ease `cubic-bezier(0.22,1,0.36,1)`.

### FRAME 4 — Restore sheet
Centered; width 420–460px, max `calc(100vw - 32px)`; content-driven height; padding ~22–24px; radius 14–16px; warm ivory surface token (fallback `#F3F0E8`); thin low-opacity petrol border; soft shadow `0 18px 50px rgba(16,37,38,0.18)` (not glass). Enter: opacity 0→1, translateY 8→0, scale 0.985→1, 180–220ms, same ease; no bounce/overshoot; sheet begins ~40–60ms after the backdrop.

### Folded-corner brand detail
A small folded top-right corner (~26–30px), looking like a physical ivory corner turned over exposing tangerine (`#FF6B2C`), with a subtle darker crease. Option: static `clip-path` cut of the sheet's top-right corner + a separate absolutely-positioned ~28px fold element filling the cut. Fold animates: scale 0.65→1 (or size ~0→28px), opacity 0→1, 180ms, starting ~100ms after the sheet enters. NO 3D page-flip, no extreme rotation — a corner settling into place. If clip-path interpolation is problematic, keep the clip STATIC and animate only the fold element's opacity+scale (reliability > complexity).

### Sheet content
Header: `[Rabta mark ~30–34px]  "Restoring workspace" / <project or capsule name>`. Do NOT continuously spin the logo. Below: a compact tool-status list (rows ~40–44px: icon, name, right-aligned status). Use the ACTUAL restorable tools from the capsule (don't hard-code VS Code/Chrome/Terminal).
Status presentation: WAITING (hollow circle, "Waiting", muted) · RESTORING (spinner, "Restoring…", petrol/tangerine not too bright) · APPLIED (check, "Restored", sea-glass `#66D6C2`/success token) · SKIPPED (minus/neutral, "Skipped", muted — NOT a failure) · FAILED (small warning, "Couldn't restore", restrained error — no shake).
Row enter: opacity 0→1, translateY 4→0, 140–170ms, stagger ~30ms. Restoring→restored: crossfade spinner→check (opacity 0→1, scale 0.8→1, 130–160ms; row may move ≤2px; do NOT flash the whole row green).

### Progress indicator
Thin 2px rounded line at the sheet bottom; neutral low-opacity track; tangerine active. PATH B (final only): use an indeterminate gentle left→right highlight while waiting, then snap to 100% on the response. No fabricated percentages.

### Backend integration
Restore begins immediately after click; the animation never delays it. PATH B: rows start waiting; general "Restoring tools…" (do not pretend a specific tool is active without truth); on final response map applied→restored / skipped→skipped / errors→failed; reveal known finals with a 35–50ms stagger (doesn't change truth or delay external restore). Never show success before the response. Use a run-id / abort-safe mechanism so a stale response can't update a newer restore.

### Success
Heading → "Workspace restored"; subtle completed logo state (mark stays, a small check may appear beside it — no giant success icon); progress 100%; hold completed ~180–250ms; then close: opacity 1→0, translateY 0→-4, scale 1→0.99, 160–180ms, backdrop fades with it; restore the Resume button. No "Done" click required. Minimum visible sheet duration ~450ms (affects ONLY overlay dismissal, never the real restore). Longer restores keep the overlay for the full operation.

### Partial
Heading "Workspace partially restored"; keep restored tools; clearly show skipped/failed; do NOT auto-close; actions `[ Close ] [ Retry failed tools ]` only if safe per-tool retry exists — else `[ Close ] [ View details ]`. Skipped ≠ failure. No auto-retry.

### Failure
Sheet stays open; heading "Couldn't restore workspace"; concise human error (no raw stack in primary UI); `[ Close ] [ Try again ]`; a collapsible "Technical details" may show the raw error. No shake/flash/aggressive red.

### Focus & accessibility
`role="dialog"`, `aria-modal="true"`, `aria-labelledby` the title, status updates `aria-live="polite"`; move focus into the sheet on open; during active restore Escape must not silently dismiss if the op can't be cancelled; return focus to the Resume button on close; all partial/failure actions keyboard-accessible; visible focus rings; underlying page gets no keyboard while overlay active.
Reduced motion (`prefers-reduced-motion: reduce`): remove scale + row stagger + moving shimmer; simple opacity ~100–120ms; keep every state/status visible; keep functional progress feedback.

### Performance
Animate only opacity / transform / progress width. Avoid big blur, animated box-shadow, layout-heavy height animation, per-frame measurement, large SVG filters, unnecessary rerenders. Smooth on an ordinary MacBook. Memoize only where useful; don't overengineer.

### Design constraints
Preserve identity: petrol nav/text, warm ivory surfaces, tangerine sparingly, calm type, soft restrained depth. NO neon/glass-heavy/purple/spring-bounce/confetti/full-screen-logo-anim/fake-terminal-logs/fake-percentages/dramatic-zoom. Never block or slow restoration. The sheet must look native to Rabta, not pasted from a library.

### Dev playground (BUILD FIRST)
A dev-only preview with controls: Idle · Slow successful restore · Instant successful restore · Partial restore · Complete failure · Three tools · Eight tools · Reduced motion · Long project name · Missing tool icon.
Slow-success timeline: 0ms overlay opens · 250 VS Code restoring · 650 VS Code restored · 700 Chrome restoring · 1100 Chrome restored · 1150 Terminal restoring · 1550 Terminal restored · 1750 overlay closes. (Design testing only; production uses real data/timing.)

### Acceptance criteria
1 immediate click feedback · 2 restore begins immediately · 3 palette matches · 4 fold restrained-but-visible · 5 statuses from real data · 6 no fast-restore flash · 7 slow restores understandable · 8 partial/failure never fake success · 9 keyboard + SR work · 10 reduced-motion works · 11 smooth · 12 existing Resume behavior/data intact · 13 dev preview exists · 14 no unrelated redesign.
**After the isolated preview, STOP and show the user before broad microinteraction changes.**
