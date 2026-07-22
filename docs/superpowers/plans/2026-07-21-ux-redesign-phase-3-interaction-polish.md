# UX Redesign — Phase 3: Interaction Polish (Rabta) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Turn the coherent-but-terse Phase-2 shell into a *finished-feeling* app: humanized capsule summaries + activity feed, real action feedback via toasts, a redesigned git line, register-as-a-dialog, and inviting empty states — so Rabta feels alive and responsive even before it's full of data.

**Architecture:** A pure, unit-tested `lib/humanize.ts` (relative time, capsule → human text, event → human sentence) feeds the Capsules + Activity pages. A tiny toast layer replaces the inline `note`/`setNote` lines. The git line becomes a compact status + action menu. No backend/behavior change — same invokes, better presentation + feedback.

**Tech Stack:** React 18, Zustand, design system `@/components/ui/*` (incl. `sonner` Toaster, DropdownMenu, Dialog), Rabta tokens, Inter. Toaster is already mounted at the app root.

## Global Constraints
- **Presentation only.** No Tauri `invoke` name/arg, event name, or payload change. All existing invokes + behaviors (busy guard, activationNonce refresh, filters, pause, pairing) preserved.
- **Compose from the design system**; brand tokens only (no `bg-neutral-*`/hex; `font-mono` only deliberately for code/paths/ids/raw JSON). Title-case labels.
- **Pure helpers are unit-tested** (TDD); UI changes get a render smoke test (the Phase-2 harness `@/test/smoke-utils`).
- **No new backend data.** Humanization derives entirely from existing payload fields. If a field isn't present, degrade gracefully — never invent data.
- **Accent discipline:** tangerine stays the single hot action color; toasts use semantic tokens (success/destructive) sparingly.
- Run pnpm from repo root `/Users/sammy/omnibus`; default node v18.20.

## File structure
```
apps/desktop/src/
  lib/
    humanize.ts            (new: relativeTime, humanizeCapsule, describeEvent)
    humanize.test.ts       (new)
    toast.ts               (new: thin helpers over sonner — toastOk/toastErr/toastActivation)
  pages/
    CapsulesPage.tsx       (modify: humanized summaries + toasts + empty state + microinteractions)
    ActivityPage.tsx       (modify: humanized rows + raw JSON behind expand + empty state)
    ProjectsPage.tsx       (modify: register-as-Dialog + toasts + empty state)
    OverviewPage.tsx       (modify: inviting welcome/empty state)
    ConnectorsPage.tsx     (modify: inviting empty state + pairing toast)
  views/
    GitLine.tsx            (modify: compact status + action menu + safe-git note + toasts)
```

---

### Task 1: Humanize helpers (pure, unit-tested)

**Files:** create `lib/humanize.ts`, `lib/humanize.test.ts`.

**Interfaces (Produces):**
- `relativeTime(iso: string, now?: number): string` — "just now" / "2m ago" / "3h ago" / "yesterday" / "Mar 4". Deterministic given `now` (pass `now` in tests; default `Date.now()`).
- `humanizeCapsule(r: TaskResource): { kind: string; icon: "editor"|"browser"|"git"|"terminal"|"generic"; summary: string; savedAgo: string }` — e.g. git → `{ kind:"git", icon:"git", summary:"on main", savedAgo:"2m ago" }`; editor → `{ kind:"vscode", icon:"editor", summary:"3 files · 2 terminals", savedAgo:"…" }`. Reuse the existing field logic (payload.branch; payload.openFiles.length; payload.terminals.length) but produce human phrasing (pluralize; "1 file", "no files"; drop the raw timestamp in favor of savedAgo from `r.createdAt`). Never throw on missing fields.
- `describeEvent(e: { type: string; at?: string; [k:string]: unknown }): { icon: string; sentence: string }` — map event types to plain sentences: `connectorConnected` → "{name} connected", `connectorDisconnected` → "{name} disconnected", `commandSent` → "Sent {name} to {connector}", `responseReceived` → "{connector} responded", `eventReceived` → "{connector} sent {name}", `pairingRequested` → "{name} requested to connect". Fall back to a humanized version of the type string for unknown types. Pull names/connector from the payload defensively.

- [ ] Step 1: write failing tests in `humanize.test.ts` covering: relativeTime buckets (now/min/hour/day/date) with a fixed `now`; humanizeCapsule for git, editor (0/1/many files+terminals), and a missing-fields resource (no throw); describeEvent for each known type + an unknown type + missing-payload fallback.
- [ ] Step 2: run `pnpm --filter desktop test humanize` → FAIL (module missing).
- [ ] Step 3: implement `humanize.ts` (pure, no React). Import the `TaskResource` type from `@/store`.
- [ ] Step 4: run tests → PASS.
- [ ] Step 5: commit `feat(ui): humanize helpers (relative time, capsule, event) + tests`.

---

### Task 2: Action toasts (feedback layer)

**Files:** create `lib/toast.ts`; modify `pages/CapsulesPage.tsx`, `pages/ProjectsPage.tsx`, `views/GitLine.tsx`, and the pairing handlers (`pages/ConnectorsPage.tsx` + `App.tsx` banner).

**Interfaces (Produces):** `lib/toast.ts` — thin wrappers over `toast` from `@/components/ui/sonner`: `toastOk(msg, opts?)`, `toastErr(err)` (stringifies unknown errors like the current `String(e)`), and `toastActivation(summary)` (formats the applied/pending/skipped/savedPrevious/errors object into a titled toast with a description). Keep them tiny.

- [ ] CapsulesPage: replace the inline `actionNote` mechanism with toasts — Resume → `toastActivation(summary)` (keeps applied/pending/skipped detail); Save state → `toastOk("Saved {kind} state")` or "Nothing connected to save"; Add task → `toastOk("Task added")`; Done/Reopen → `toastOk`; Delete → `toastOk("Task deleted")`; errors → `toastErr(e)`. Preserve busy guard + activationNonce + invokes exactly. (You may keep a very short inline status only for the in-flight "Resuming…" affordance, or use a toast loading state — your call, but the result must be a toast.)
- [ ] ProjectsPage: register success → `toastOk("Project registered")`; delete → `toastOk`; errors → `toastErr`.
- [ ] GitLine: fetch/switch/create success + error → toasts (replaces the inline `note`).
- [ ] Pairing: approve → `toastOk("{name} connected")`, deny → `toastOk("Denied {name}")` in both the App banner `decide()` and ConnectorsPage (keep both calling the same invokes; a shared helper is welcome).
- [ ] Smoke: existing page smoke tests still pass (toasts render into the root Toaster; assert no throw). Build+tests green; commit `feat(ui): action toasts across task/project/git/pairing flows`.

---

### Task 3: Capsules humanization + polish

**Files:** modify `pages/CapsulesPage.tsx`.

- [ ] Replace the terse `summarize()` text with `humanizeCapsule` output: an icon (lucide, mapped from the icon kind), a human summary, and a muted `savedAgo` (relativeTime). The active task keeps its tangerine marker.
- [ ] Inviting **empty states**: no projects → `EmptyState` "No projects yet" + primary "Register a project" (navigates to Projects); a project with no tasks → a friendly inline prompt + the new-task input; keep them warm, not terse.
- [ ] Microinteractions: task cards get a subtle hover (`hover:bg-accent/…` or shadow), the primary Resume button the brand's `-2px` lift on hover (add to the Button primary variant OR locally). Respect reduced-motion (already global).
- [ ] Smoke test updated (populated render still asserts). Build+tests green; commit `feat(ui): humanized capsule summaries + Capsules empty states & polish`.

---

### Task 4: Activity humanization

**Files:** modify `pages/ActivityPage.tsx`.

- [ ] Replace the raw `JSON.stringify(e)` rows with `describeEvent`: an icon + a plain sentence + a muted `relativeTime`. Keep the historical `[hist]` marker (as a subtle Badge). Keep the connector + kind filters + pause + scroll-on-new exactly.
- [ ] The raw JSON payload stays available but **behind an expander** (a per-row "Details" `disclosure`/`Collapsible` or a click-to-expand `<details>`), rendered in mono muted — power users can still see everything, but the default feed is human.
- [ ] Inviting empty state (no activity yet). Build+tests green; commit `feat(ui): humanized activity feed + raw payload behind expander`.

---

### Task 5: Git line redesign + register dialog + empty states

**Files:** modify `views/GitLine.tsx`, `pages/ProjectsPage.tsx`, `pages/OverviewPage.tsx`, `pages/ConnectorsPage.tsx`.

- [ ] **GitLine**: compact status (branch + dirty/ahead/behind as small `Badge`s with icons, not cryptic glyphs) + an actions `DropdownMenu` (Fetch / Switch branch → submenu or Select / New branch → small dialog/inline). Surface the **safe-git** reassurance subtly (a Tooltip or muted line: "Rabta never force-pushes, resets, or discards your work"). Preserve every invoke (`git_status`/`git_branches`/`git_fetch`/`git_checkout`/`git_create_branch`) + args + the activationNonce refresh.
- [ ] **ProjectsPage register-as-Dialog**: promote "Register project" to a primary CTA that opens a `Dialog` containing the form (name / path with live `inspect_repo_path` on blur → inline branch prefill + path note / dev URL). Fewer clicks, clearer validation. Keep the exact invoke + args.
- [ ] **Empty states** (the "mainly empty" fix): Overview → a warm "Welcome to Rabta" with 2–3 next-step cards (Register a project · Connect an editor · Connect a browser) linking to the right section; Connectors empty → guide to install the extensions (reference: the editor/browser connect flow); Projects empty → primary Register CTA. Keep them on-brand and calm.
- [ ] Build+tests green; commit `feat(ui): git-line redesign + register dialog + inviting empty states`.

---

## Definition of Done (Phase 3)
- Actions (resume/save/register/delete/git/pairing) give **toast** feedback; no bare inline `note` lines remain for results.
- Capsule summaries + activity rows are **human-readable** (icons + plain language + relative time); raw JSON only behind an expander/Advanced.
- Git line is a compact status + action menu; safe-git guarantee is visible.
- Register is a dialog with live inspection; empty states across pages are **inviting and guide the next action**.
- Every invoke/behavior preserved; `pnpm --filter desktop test` + `build` green; live-render sane (no provider crashes).
- Shown to the user (live, native window) before Phase 4.

## Self-review
- Coverage: spec Phase E (flows: register, resume, save, git, review history) + Phase H (micro-interactions, empty states, feedback) covered; onboarding *flow* remains Phase 5, Privacy page Phase 6.
- Type consistency: `humanizeCapsule`/`describeEvent`/`relativeTime` signatures defined once in Task 1, consumed in Tasks 3/4; `TaskResource` from `@/store`.
- Risk: behavior drift while swapping note→toast and redesigning GitLine — each task restates "preserve exact invokes + busy/activationNonce/filters".
