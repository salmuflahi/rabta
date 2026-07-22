# Rabta — Quality-of-Life & Polish Arc — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Make Rabta feel like a premium, everyday commercial macOS app — calm, minimal, fast — through a craftsmanship pass. **Refine what exists; do not redesign; do not alter the petrol/ivory/tangerine identity.** Think Linear/Raycast/Arc/Apple HIG.

## Scope (approved 2026-07-21)

**Track A — pure front-end polish (do FIRST, in logically-separated changes):**
signature Resume animation · microinteractions (hover/press/shadow/card/sidebar-selection/button) · toast/modal/context-menu motion · loading skeletons · keyboard (⌘K/⌘N/⌘⇧N/⌘R + full nav) · Raycast-style command-palette search (projects/capsules/tasks/connectors/settings/actions) · context menus (existing actions + Reveal in Finder) · educational empty states · Resume preview (from existing capsule data) · connector status (last-seen/version, when useful) · Undo toasts via deferred-commit · unsaved indicator (git-dirty) · "saved X ago" · collapsible sidebar + remembered state + window-state persistence · overall spacing/type/alignment/shadow/focus consistency.

**Track B — backend features (AFTER Track A):**
1. **Rename + Archive (+ real Undo).**
2. **Project icons.**
3. **Last-opened / session-duration tracking (real, persisted).**
(Explicitly EXCLUDED: per-project accent colors — protects the single-accent calm identity.)

## Binding decisions / constraints
- **No redesign, no brand drift.** Compose from `@/components/ui/*`; petrol/ivory/tangerine only; tangerine stays the single hot accent (accent discipline).
- **Presentation-first.** Track A changes ZERO backend (no invoke/event/payload changes). Track B adds backend deliberately and last.
- **Motion:** purposeful, not decorative. Brand ease `cubic-bezier(.2,.8,.2,1)`. Animate **opacity/transform/scale only** — no heavy blur/expensive effects. **Respect `prefers-reduced-motion`** everywhere (already global for transitions; ceremonies must check it and degrade to instant).
- **Archive is the primary non-destructive removal;** Delete remains but is visually **secondary + clearly destructive**. Undo for archive genuinely restores the project (un-archive), not a re-create.
- **Undo (Track A, no backend):** destructive actions use **deferred-commit** — the invoke fires only after the ~5s toast window elapses without Undo. (Archive/un-archive in Track B is a true reversible backend op.)
- **Project icons:** a **curated, restrained built-in icon set** (lucide) + a small picker. Subtle/compact, for recognition — NOT emoji-heavy, not decorative.
- **Session tracking (Track B):** REAL + persisted (no estimates/mocks). **Definition:** a project accrues *active* seconds only while (a) it is the project of the currently-active task AND (b) the Rabta window is focused AND (c) the user is not idle (idle timeout ~60s). "Last opened" = last time a task in the project was resumed/activated. Displayed session duration = the current/most-recent active session length. **No analytics dashboards, scoring, streaks, or charts** — just quiet context on the Continue-Working cards.
- **Migrations:** backward-compatible; preserve ALL existing data; new columns nullable/defaulted; UI degrades gracefully when values are missing (old projects show no icon / "—" for last-opened, not errors).
- **Performance:** animations stay 60fps-cheap (transform/opacity); no layout thrash.

## Delivery phases (each: spec'd here or expanded at execution, subagent-built, reviewed, shown)

**Track A**
- **A1 — Motion foundation + Signature Resume ceremony** (the memorable centerpiece; show first).
- **A2 — Microinteractions & component motion** (hover/press/shadows/cards/sidebar-selection/toasts/modals/context-menu enter-exit/skeletons).
- **A3 — Keyboard + Command palette** (⌘K fuzzy search over all entities + ⌘N/⌘⇧N/⌘R; full keyboard nav).
- **A4 — Context menus + Undo toasts + Reveal in Finder** (right-click existing actions; deferred-commit undo).
- **A5 — Previews, empty states, status & indicators** (Resume preview from capsule data; educational empty states; connector last-seen/version; unsaved git-dirty dot; "saved X ago").
- **A6 — Sidebar collapse + persistence + window-state** (collapsible sidebar, remembered collapse + local project order, window size/position restore).

**Track B**
- **B1 — DB + backend** (backward-compatible migration: project `icon`, `archived_at`, `last_opened_at`, `active_seconds`; invokes: `rename_project`, `archive_project`, `unarchive_project`, `set_project_icon`, session accrual + `touch_project_opened`; `reveal_in_finder` opener if not done in A4). Rust-side, tested.
- **B2 — Wire Track-B UI** (rename/archive/undo in context menus + Projects; Delete demoted to secondary-destructive; icon picker; Continue-Working cards with real last-opened/session; graceful missing-value handling).
- **B3 — Session runtime** (focus/idle accrual driving `active_seconds`, per the definition above).

**Final** — consistency & polish sweep (spacing/type/alignment/shadow/focus), reduced-motion + performance audit, whole-app review, merge.

---

## Phase A1 — Motion foundation + Signature Resume ceremony

**Goal:** a signature, real-data-driven Resume animation (~600ms) + the motion primitives it needs, with a clean reduced-motion fallback. No backend change.

**Files:**
- `apps/desktop/tailwind.config.js` (add brand ease + a couple durations if useful)
- `apps/desktop/src/lib/motion.ts` (new: `prefersReducedMotion()` + shared timing constants)
- `apps/desktop/src/shell/ResumeCeremony.tsx` (new: the overlay + fold animation + tool check-in)
- `apps/desktop/src/shell/FoldMark.tsx` (new: inline animatable Context-Fold SVG)
- `apps/desktop/src/pages/CapsulesPage.tsx` (modify: Resume triggers the ceremony instead of calling activate directly)
- tests: `apps/desktop/src/lib/motion.test.ts`, a `ResumeCeremony` render smoke

**Design — the ceremony (a state machine):**
```
idle → folding(≈180ms) → restoring(hold until activate resolves, min ≈260ms)
     → unfolding(≈180ms) → done(fade out ≈120ms)   ── total ≈ 600–700ms
```
1. **Trigger:** Resume click calls `startResume(task)`. The ceremony overlays the workspace (a `fixed inset-0` layer above the main content, below the titlebar is fine, or full-screen) with a subtle scrim (`bg-background/70`, NO heavy blur). The workspace behind gently fades (`opacity` to ~0.6).
2. **Fold:** the `FoldMark` (Context-Fold logo) plays a *close* — the tangerine corner-fold scales/rotates in and the mark scales down slightly (transform/opacity only).
3. **Restore (real data):** the ceremony calls `invoke("activate_task", { taskId })` at the START. Its result `ActivateSummary { applied[], pending[], skipped[], savedPrevious, errors }` drives a checklist that animates in with a stagger (~60ms each): each `applied` connector kind → a row with a check ✓ + label+icon (VS Code / Chrome / Terminal / Git…). `pending` → a muted "on next reload" row; `skipped` → dimmed "not connected". Hold `restoring` until BOTH the invoke resolves AND the min duration passed. On `errors`/reject → show a brief error state, then fall through to a `toastErr`.
4. **Unfold:** the fold opens again (reverse of step 2); the checklist settles.
5. **Done:** overlay fades out, workspace un-fades. Fire the existing `toastActivation(summary)` + `bumpActivation()` + `setActiveTaskId` (preserve ALL current post-activate behavior).
6. **Reduced motion:** if `prefersReducedMotion()`, SKIP the overlay entirely — run the exact current path (activate → toastActivation → bumpActivation), no animation.

**Rules:** transform/opacity/scale only; brand ease; the invoke name/args are unchanged (`activate_task {taskId}`); every existing post-activate side effect preserved; the ceremony must never *block* forever (if the invoke hangs, cap the restoring hold at ~4s then resolve to the result/error).

- [ ] **T1: motion.ts + tailwind ease** — `prefersReducedMotion()` (reads `window.matchMedia("(prefers-reduced-motion: reduce)").matches`, guarded for SSR/absent), timing constants (`FOLD_MS`, `RESTORE_MIN_MS`, `UNFOLD_MS`, `FADE_MS`, `STAGGER_MS`), brand ease constant. Tailwind: add `transitionTimingFunction.brand` = `cubic-bezier(.2,.8,.2,1)`. Unit-test `prefersReducedMotion` (mock matchMedia) + constants exported. Commit.
- [ ] **T2: FoldMark.tsx** — inline SVG of the Context-Fold mark (petrol rounded square, ivory arrow, tangerine corner-fold as a targetable path), with a `state` prop (`open`/`folding`/`closed`) driving CSS transforms on the fold + mark (transform/opacity only). Render smoke. Commit.
- [ ] **T3: ResumeCeremony.tsx** — the overlay + state machine above, driven by a real `activate_task` call; renders the tool checklist from the summary; reduced-motion short-circuit. Exposes an imperative/prop API the page uses (e.g. a component that takes `{ task, onDone }` and self-runs, or a small controller hook `useResumeCeremony()`). Render smoke (mock invoke → a summary; assert it mounts + completes without throw; and a reduced-motion path test asserting it calls activate + onDone without the overlay). Commit.
- [ ] **T4: wire CapsulesPage** — Resume button now starts the ceremony instead of calling activate inline. Preserve busy guard, activationNonce/bumpActivation, setActiveTaskId, toastActivation — moved into the ceremony's completion. Update the CapsulesPage smoke test. Build+tests green. Commit.

**A1 DoD:** clicking Resume plays the ~600ms fold→restore→unfold ceremony driven by the real activate result; reduced-motion runs the instant path; every prior post-activate behavior preserved; `pnpm --filter desktop test`+`build` green; no `invoke`/arg change.
