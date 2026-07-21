# OmniBus UX Redesign — Design Spec

> **Status:** design, awaiting review. No implementation until this is approved.
> **Scope:** presentation only. No backend, protocol, DB, connector, or command
> API changes. Every Tauri `invoke` name, event name, and payload shape stays
> exactly as it is today. This is a reskin + re-architecture of the *frontend*
> (`apps/desktop/src`), nothing below it.

## Goal

Turn OmniBus from a working engineering prototype into a desktop app a developer
would happily download, install, and use every day — premium, calm, native-Mac,
trustworthy. Every interaction should reinforce one promise: **"Switch tasks,
not apps."**

## Non-goals

- No new product features or connectors (v1 is feature-complete).
- No backend/protocol/DB/API changes. If a screen needs data the backend doesn't
  already expose, we cut the screen — we do not add commands.
- No cloud, no accounts, no telemetry (also a product principle, see Privacy).
- Not a rewrite. The React/Zustand/Tauri architecture stays; we restructure the
  component tree and add a design system, we don't replace the stack.

## Constraints (hard)

- **Tauri CSP:** `default-src 'self'; img-src 'self' data:; style-src 'self'
  'unsafe-inline'`. Everything ships from `'self'` — no CDN scripts, no remote
  fonts, no remote images. All fonts are system fonts; all icons are inline SVG.
- **Local-first:** the hub is bound to `127.0.0.1`. The UI must never imply
  network/cloud activity, because there is none.
- **Preserve behavior:** the same actions with the same results. We change how
  they look, how they're grouped, and how many clicks they take — not what they do.

## Foundational decisions (approved 2026-07-20)

| Decision | Choice | Rationale |
|---|---|---|
| Navigation | **Task-first workspace** | Tasks are the product. One main Tasks surface; project is a switcher in the top bar; Connections/Activity live in a secondary drawer; raw dev tooling is demoted to Advanced. |
| Scope | **Full redesign, phased (A–J)** | Sequential reviewed sub-phases; each reviewed + shown before the next. |
| Design system | **shadcn/ui** (Radix + Tailwind, vendored) | Accessible primitives by construction, copied into the repo → CSP-safe, no runtime CDN. |
| Typography | **macOS system stack** (`-apple-system`/SF) | Reads as native Mac instantly; zero bundled font assets; monospace reserved for code/paths/logs. |

---

## Design principles

1. **Tasks are the spine; everything else supports Tasks.** Projects, connections,
   git, GitHub, and activity are all in service of resuming a task.
2. **One primary action per surface.** The defining verb (Resume a task) is visually
   dominant. Destructive actions are demoted, weighted, and confirmed.
3. **Humanize machine output.** No raw JSON, no timestamps-as-identity, no lowercase
   verb soup in the primary UI. Raw data lives in Advanced only.
4. **Calm over clever.** Whitespace, restraint, one accent color, subtle motion.
   No gradients, no glassmorphism, no decorative animation.
5. **Trust is a feature — show it.** The privacy posture is the strongest thing
   about OmniBus and must be visible, not buried in docs.
6. **Reuse, don't reinvent.** Every screen is composed from the shared component
   library. No page invents its own button.
7. **Accessible by construction.** Focus-visible, keyboard paths, contrast, reduced
   motion, and labels are requirements, not a later pass to bolt on.

---

## Information architecture (Phase B)

### Today
```
[ Projects | Debug ]
  Projects  → project boxes, each containing git + GitHub + tasks; register form at bottom
  Debug     → Connectors | raw Activity log (JSON) | raw Command sender
```
Problems: Tasks (the product) are buried two levels deep; "Debug" is an
engineering word given co-equal top billing; connector health (essential) sits
next to a JSON console; onboarding and trust don't exist.

### Redesigned — task-first workspace
```
┌──────────────────────────────────────────────────────────────┐
│  [ Project ▾ ]        Tasks            ◔ 3 connected   ⌘K  ⚙  │  ← top bar
├──────────────────────────────────────────────────────────────┤
│  Tasks                                            [ + New ]    │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ ● Fix login bug            vscode · git · chrome   Resume│  │  ← active
│  │   Refactor auth            no linked state         Resume│  │
│  │ ▸ Docs pass                chrome                   Resume│  │  ← expandable
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
        Connections / Activity / Advanced  →  right-side DRAWER
        (opened from "◔ 3 connected" or ⌘K)
```

- **Top bar:** project switcher (dropdown; includes "All projects"), app identity,
  a **connection summary chip** (`◔ N connected`) that opens the Connections drawer,
  a **⌘K** command-palette trigger, and a **⚙ / Privacy** entry.
- **Main:** the Tasks list for the selected project. Each row shows title, a
  humanized "linked state" summary, active indicator, and one primary **Resume**
  button. Rows expand to reveal capsule detail, the git line, and secondary
  actions (Save state, Done, Delete-with-confirmation).
- **Secondary drawer** (right): tabbed **Connections** (first-class connector
  health + pairing), **Activity** (humanized event feed), and **Advanced**
  (the raw JSON log + command sender — unchanged behavior, tucked away).
- **New surfaces:** first-run **Onboarding**, a **Privacy** page, and real
  **empty states** everywhere.

### Terminology changes (copy)
| Today | Redesigned | Why |
|---|---|---|
| activate | **Resume** | It's resuming a task's world; "activate" is ambiguous next to "save state". |
| save state | **Save state** (kept, but demoted/secondary) | Clear enough; just shouldn't rival Resume visually. |
| capsule | **linked state** (user-facing); "capsule" kept in code/docs | Users think "my editor/browser/git state," not "capsule". |
| connector | **connection** (user-facing) | Plainer. |
| Debug | **Connections + Activity + Advanced** | "Debug" is a dev word; split by real purpose. |
| done / reopen | Done / Reopen (title-cased) | — |

---

## Design system (Phase C)

Built on **shadcn/ui** (Radix primitives + Tailwind + `class-variance-authority`
+ `tailwind-merge` + `lucide-react` icons), all vendored into
`apps/desktop/src/components/ui`. Theme via CSS variables so light/dark is one
source of truth.

### Tokens
- **Type:** system stack `-apple-system, BlinkMacSystemFont, "SF Pro Text",
  system-ui, sans-serif`; monospace stack (`ui-monospace, "SF Mono", Menlo`)
  reserved for code, paths, branch names, logs. Scale: `xs 12 / sm 13 / base 14 /
  lg 16 / xl 20 / 2xl 24`, weights 400/500/600, line-heights tuned for UI density.
- **Spacing:** 4-based scale (`4 8 12 16 24 32 48`). One rhythm everywhere.
- **Radius:** `sm 6 / md 8 / lg 12` (rounded, not pill; native-Mac).
- **Elevation:** three levels — flat (rows), raised (cards/popovers, subtle
  shadow + 1px border), overlay (dialogs, stronger shadow + scrim).
- **Color:** neutral gray foundation (semantic tokens: `bg`, `surface`,
  `surface-raised`, `border`, `text`, `text-muted`, `text-subtle`), **one accent**
  (a calm blue) for primary actions/active state, plus semantic `success` /
  `warning` / `danger`. Every text/background pair meets **WCAG AA**.
- **Dark mode:** the default and primary theme; light mode fully specified from
  the same tokens. macOS-native feel in both.

### Components (all reused, none re-invented)
Button (primary / secondary / ghost / destructive / icon), Input, Textarea,
Select, Dropdown menu, Context menu, Command palette (⌘K), Dialog, Tooltip,
Badge (status/label), Toast (via `sonner`), Card, List/row, Table (Activity),
Empty state, Skeleton + loading, Kbd (shortcut chips), Focus ring, Inline
error/success/warning, Segmented control (drawer tabs), Switch.

Deliverable of this phase: a **component gallery** route (dev-only) to review the
system in isolation before wiring it into real screens.

---

## Visual identity (Phase D)

Premium, clean, minimal, technical, trustworthy. Whitespace-forward; strong
alignment to the 4px grid; clear type hierarchy (one dominant action, muted
metadata); a single accent. **Avoid:** flashy gradients, glassmorphism,
decorative animation, clutter. **Motion:** 120–200ms ease transitions on hover,
expand/collapse, drawer, and toasts only — and fully disabled under
`prefers-reduced-motion`.

---

## User flows redesigned (Phase E)

- **Register project:** promoted from a bottom-of-page form to a primary CTA +
  dialog, with live repo inspection (existing `inspect_repo_path`) surfacing
  path/branch feedback inline. Fewer clicks, clearer validation.
- **Create / Resume / Save / Done / Delete task:** Resume is the one primary
  button per row; Save state is secondary; Done is a checkbox affordance; Delete
  is destructive-styled behind a confirm Dialog (not an inline lookalike button).
  Results report via **toasts** (with the applied/pending/skipped detail), not a
  shared text line.
- **Git operations:** the git line becomes a compact status + a small action menu
  (Fetch, Switch branch, New branch). The "OmniBus never force/resets" safety
  guarantee is surfaced as a reassuring inline note — a differentiator made visible.
- **Connect VS Code / Chrome / GitHub:** the Connections drawer shows each
  connection's live status and, for pairing (Chrome), a proper approve/deny
  dialog instead of a raw amber bar. GitHub's unavailable state becomes a helpful
  guided empty state (install `gh`, `gh auth login`).
- **Review history:** the Activity feed humanizes events (icon + plain sentence +
  relative time); the raw JSON stays available in Advanced for power users.

---

## Onboarding (Phase F)

A first-run experience (shown when no projects exist; skippable; resumable):
1. **What OmniBus is** — one screen: the promise + how it works + why it matters.
2. **Connect your tools** — install the editor/browser extensions (reuse
   `docs/INSTALL.md` guidance), with live detection as connections appear.
3. **Register your first project.**
4. **Create your first task.**
5. **Resume it** — demonstrate the core magic once, end-to-end.
Every step obvious; every step has a skip; progress is not lost on quit.

---

## Trust / Privacy (Phase G)

A dedicated **Privacy** surface, sourced from `docs/vision.md`, stating plainly:
local-first; no cloud account; no telemetry; no code uploaded; never records
keystrokes, clipboard, terminal output, file contents, browser history, or
messages; stores only the minimum metadata required to restore a task; and gives
the user visibility + control over what's remembered. Plus **inline** trust
signals: the `127.0.0.1` hub badge reframed as a positive "local only" indicator;
a note near the Chrome connection that it can read *only* tab URLs/titles.

---

## Polish (Phase H)

Hover states, 120–200ms transitions, expand/collapse and drawer microinteractions,
context menus on task rows, success feedback (toasts + subtle checkmarks), tooltips
on icon buttons, a working **⌘K command palette** (jump to task, new task, switch
project, open Connections/Privacy), keyboard navigation throughout, smooth
scrolling, graceful window-resize behavior. Nothing left feeling unfinished.

---

## Accessibility (Phase I)

Contrast to WCAG AA (kills the `neutral-500/600`-on-`900` and `opacity-40`-only
signals); visible focus rings on every interactive element; full keyboard nav and
Escape/return semantics (free from Radix); ARIA roles/labels on status, lists, and
dialogs; status conveyed by **icon + text, not color alone**; comfortable touch
targets (≥ 32px); respects `prefers-reduced-motion` and font scaling.

---

## Product-quality review (Phase J)

A final whole-app pass reviewing OmniBus as a commercial macOS app before launch:
hunt anything unfinished, confusing, inconsistent, or immersion-breaking; adversarial
review; live walkthrough. Fix, then land.

---

## Delivery plan (phases → branches)

Each phase is spec'd here, planned in detail at execution time, implemented by
fresh subagents, reviewed (opus for anything stateful/keyboard/focus-trap heavy),
shown to you, then merged — the same discipline as the 11 engineering phases.

| # | Phase | Deliverable | Depends on |
|---|---|---|---|
| 1 | **Design system** (C, D, I-foundation) | shadcn vendored, tokens, system font, component gallery | — |
| 2 | **App shell & nav** (B) | task-first top bar + main + drawer scaffold, store wired | 1 |
| 3 | **Core task flow** (E) | task rows, Resume/Save/Done/Delete, toasts, git line, register dialog | 1,2 |
| 4 | **Connections surface** (B,E) | first-class connector health, pairing dialog, Advanced demoted | 1,2 |
| 5 | **Onboarding** (F) | first-run flow + real empty states | 1–4 |
| 6 | **Trust / Privacy** (G) | Privacy page + inline trust signals | 1,2 |
| 7 | **Polish** (H) | ⌘K palette, context menus, motion, tooltips, keyboard | 1–6 |
| 8 | **Accessibility** (I) | contrast/focus/ARIA/reduced-motion audit + fixes | 1–7 |
| 9 | **Product-quality review** (J) | whole-app review, adversarial pass, walkthrough, land | 1–8 |

## Definition of done (per phase)
- Composed only from the shared component library (no bespoke one-offs).
- Same behavior as before (no changed `invoke`/event/payload contracts).
- Keyboard-navigable, focus-visible, AA contrast, reduced-motion respected.
- Reviewed + shown to the user before the next phase starts.
- `pnpm` typecheck/lint/tests green; no console errors.

## Risks / watch-items
- **shadcn footprint:** adds Radix + a few util deps. Vendored + tree-shaken;
  verify bundle stays reasonable and CSP-clean (all local).
- **Behavior drift:** the biggest risk is "improving" a flow into a different
  behavior. Guard: every phase diffs against the current `invoke` calls; no
  command signatures change.
- **Scope creep into features:** the brief forbids new features; if a redesign
  "needs" data the backend lacks, we cut the element, not add a command.
