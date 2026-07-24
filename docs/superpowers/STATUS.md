# Rabta — Project Status & Handoff

> **Read this first.** This is the single "where we are / what's next" file for picking up work.
> Last updated: **2026-07-23**. Branch: **`main`** (local-only repo, no git remote). HEAD: **`ed8bf0b`**.
> Durable design records live in `docs/superpowers/plans/` and `docs/superpowers/specs/` (committed).
> The SDD per-task progress ledger at `.superpowers/sdd/progress.md` is git-ignored scratch — this file + `git log` are the source of truth.

---

## What this project is
**Rabta** (formerly OmniBus) — a local-first desktop app (Tauri + React + TS + Tailwind/shadcn; Rust hub + connectors) that saves and restores a task's full workspace "capsule": editor files/terminals, browser tabs, and git branch. Renamed OmniBus→Rabta (internal crates/packages `rabta-*`, user-facing name, Context-Fold app icon; bundle id + data dir `com.omnibus.dev` kept).

## Where we are
- **All 11 vision-roadmap phases: COMPLETE**, merged to main (register project → task/GitHub-issue → work in editor+browser on a branch → save → switch → everything restores; authenticated hub; VS Code/Cursor, Chrome, fake connectors).
- **QoL & polish arc A1–A6: COMPLETE**, merged to main (2026-07-23). Subagent-driven from `docs/superpowers/plans/`, per-task + final fable/opus reviews.
- Desktop TS suite: **125 tests green**. `cargo build` clean.

### Polish arc A1–A6 (all on main)
| Phase | What landed | Plan file |
|-------|-------------|-----------|
| A1 / RX | "Restore Experience" restore sheet (Radix dialog, truthful tool statuses, folded-corner brand detail, success/partial/failure, reduced-motion) — replaced the old fold-logo ceremony | `plans/2026-07-21-qol-polish-arc.md`, `specs/2026-07-22-restore-experience-spec.md` |
| A2 | macOS traffic lights integrated into a single nav bar; button/card/sidebar/input microinteractions; overlay motion; loading skeletons | `plans/2026-07-22-a2-microinteractions.md`, `plans/2026-07-22-a2-a3-batch.md` |
| A3 | ⌘K Raycast-style fuzzy command palette; ⌘N / ⌘⇧N / ⌘R shortcuts | `plans/2026-07-22-a2-a3-batch.md` |
| A4 | Right-click context menus (projects + capsules); deferred-commit Undo for delete; Reveal in Finder | `plans/2026-07-22-a4-context-undo-reveal.md` |
| A5 | Resume preview popover (peek a capsule); unsaved-changes git-dirty dot; connector last-seen (`connectedSince`→ISO, no fake version); educational empty states | `plans/2026-07-22-a5-a6-batch.md` |
| A6 | Collapsible localStorage-persisted sidebar (⌘\, 56px icon rail + tooltips); `tauri-plugin-window-state` (window size/position restore) | `plans/2026-07-22-a5-a6-batch.md` |

A5+A6 commit range on main: `1cdbf65..ed8bf0b` (incl. review fixes `cf59494`, `ed8bf0b`).

---

## What's next (pick up here)

### 1. Live-verify the two A6 features (needs a human GUI — could not be automated)
- **Sidebar collapse:** run the app, toggle the sidebar (button + **⌘\**), confirm the 56px icon rail, right-side tooltips, and smooth animation.
- **Window-state:** resize/move the window → quit → relaunch → confirm it reopens at the last size/position (clamped to the 760×540 minimum), with traffic lights still correct.
- To run: see `/run` skill or `apps/desktop` (`pnpm tauri dev`). Note: this machine has **no assistive access for osascript / GUI automation** — a person must click. Be surgical with app control (never `tell application to quit`).

### 2. Track B — backend features that complete the context menus (deferred, needs DB/backend work)
Per the plan's reality checks, these were explicitly out of scope for the presentation-first polish arc:
- **Rename / Archive (+ real un-archive) / Duplicate** wired into the existing A4 context menus (archive = primary non-destructive; delete = secondary destructive; undo genuinely un-archives).
- **Project icons** (curated lucide, not emoji).
- **Session tracking** → enables "Last session 2h 17m" in the Resume preview (real persisted ACTIVE focused usage; no charts/scoring).
- **Project reordering** (needs a DB sort field).
- **Connector version** in last-seen (needs the hub to capture a connector-reported version).

### 3. Deferred cosmetic Minors from A5/A6 reviews (low priority, all acceptable as-is)
- Sidebar labels disappear instantly instead of fading during collapse.
- `humanizeCapsule` computed twice per open Resume-preview row (pure/cheap).
- Unsaved-dot tooltip isn't keyboard-focusable (mirrors GitLine's existing pattern; screen-reader label already carries the count).

### 4. Older hardening / follow-up backlog (not roadmap)
Tracked in the `omnibus-status` auto-memory and prior plans: packaging/signing (unsigned ad-hoc builds only), plus per-phase follow-ups (git/hub/capsule/connector robustness items). Not blocking.

---

## How to resume
1. Read this file, then `git log --oneline -15` on `main`.
2. For a specific area, open its plan/spec in `docs/superpowers/`.
3. New multi-task work uses the superpowers **subagent-driven-development** workflow (plan → per-task implementer+review → final whole-branch review → finishing-a-development-branch). Write the plan with the **writing-plans** skill first.
4. Repo notes: `apps/desktop` = the app; cargo needs `export PATH="$HOME/.cargo/bin:$PATH"`; Node v18 default (v22 at `/usr/local/bin/node`); tests via `pnpm test` in `apps/desktop`, `cargo build` for the Tauri side.
