# UX Redesign — Phase 2: App Shell & Navigation (Rabta) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Replace the current two-tab app UI with the **Rabta sidebar shell** from the brand mockup — a petrol sidebar + titlebar (with ⌘K) + paper main — and route the existing functionality into it, restyled to the brand tokens so the whole app is coherent. No backend/behavior change.

**Architecture:** A new `shell/` (Titlebar, Sidebar, PageHeader, AppShell) drives layout and navigation via the Zustand store's `view`. `App.tsx` keeps ALL existing hub wiring (hub-event subscription, connectors refresh, pairing decisions, hub port) and renders `<AppShell>` with the routed page instead of the tab bar. Existing view components are ported from `bg-neutral-*`/`font-mono` to the design-system components + brand tokens. Deep per-interaction redesign (Resume prominence, humanized capsule text, action toasts, register-as-dialog) is **Phase 3** — Phase 2 makes it structurally the shell and visually coherent.

**Tech Stack:** React 18, Zustand, the Phase-1 design system (`@/components/ui/*`), Rabta tokens, Inter.

## Global Constraints

- **Presentation only.** No Tauri `invoke` name, event name, or payload shape changes. All existing `invoke(...)` calls keep their exact names/args. The hub-event subscription, pairing approve/deny, connectors/known_connectors/recent_events/pending_pairings/hub_port wiring in `App.tsx` must be preserved exactly (moved, not changed).
- **Compose from the design system.** Use `@/components/ui/*` (Button, Card, Input, Badge, Tooltip, DropdownMenu, Select, Command, Toaster, EmptyState, Skeleton, etc.). No raw `neutral-*`/hex. No bespoke buttons.
- **Follow the brand mockup** (`~/Downloads/omnibus-brand-system-v2`). Exact values locked by it:
  - Titlebar height **58px**, `grid-template-columns: 1fr auto 1fr`, bg `card`, hairline bottom border.
  - Layout `grid-template-columns: 220px 1fr` (sidebar 220 / main).
  - Sidebar: `bg-sidebar text-sidebar-foreground`, padding ~18px 13px; nav rows height 38, radius 8, muted text, active row `bg-sidebar-accent text-sidebar-accent-foreground`; `⌘N` kbd hints right-aligned; a bottom section with a **"Local only"** trust badge.
  - Main: `bg-background` (paper), padding ~36px. **PageHeader** = eyebrow (mono, uppercase, `text-[8px]/tracking-[.12em] text-muted-foreground`), an `h3` **~30px** title with `tracking-[-0.045em]`, and a muted subtitle; a right-aligned actions slot.
  - Buttons already tokenized; primary = tangerine. (Button height/weight refinements to match the mockup's 44px/740 are OK to apply in the Button component if needed, but keep variants intact.)
- **Nav sections (from the brand mockup):** `overview`, `capsules`, `projects`, `connectors`, `activity`, `settings`. Sidebar order: Overview, Capsules, Projects, Connectors, Activity (top group); Settings + "Local only" (bottom). Default view = `capsules`.
  - Label note: "Capsules" = the product's tasks + saved states. If the user later prefers "Tasks", it is a single label change in `Sidebar.tsx` + the store type comment — keep the internal `view` key as `capsules` regardless.
- Run pnpm from repo root `/Users/sammy/omnibus`; default node v18.20.

## File structure
```
apps/desktop/src/
  store.ts                         (modify: view union → sections)
  App.tsx                          (modify: keep all hub wiring; render <AppShell> + routed page + pairing)
  shell/
    AppShell.tsx                   (new: titlebar + sidebar + main grid)
    Titlebar.tsx                   (new: Rabta mark+name · ⌘K trigger · connection status)
    Sidebar.tsx                    (new: workspace switcher + nav + Local-only badge)
    PageHeader.tsx                 (new: eyebrow + title + subtitle + actions slot)
    nav.ts                         (new: nav item metadata — key, label, icon, shortcut)
  pages/
    OverviewPage.tsx               (new: light dashboard from existing data)
    CapsulesPage.tsx               (new: hosts the tasks UI — wraps existing task logic)
    ProjectsPage.tsx              (port of ProjectsView)
    ConnectorsPage.tsx             (port of ConnectorsPanel + pairing)
    ActivityPage.tsx              (port of LogPanel)
    SettingsPage.tsx              (new: theme toggle + Advanced command sender)
```

---

### Task 1: Navigation model + shell scaffold

**Files:** modify `store.ts`; create `shell/nav.ts`, `shell/PageHeader.tsx`, `shell/Sidebar.tsx`, `shell/Titlebar.tsx`, `shell/AppShell.tsx`; modify `App.tsx`.

**Interfaces:**
- Store: change `view: "projects" | "debug"` → `view: NavKey` where `type NavKey = "overview" | "capsules" | "projects" | "connectors" | "activity" | "settings"`; `setView(v: NavKey)`. Default `"capsules"`. (Update the two current `setView` callers.)
- `nav.ts` exports `NAV_ITEMS: { key: NavKey; label: string; icon: LucideIcon; shortcut: string }[]` (top group) and a `SETTINGS_ITEM`. Icons from `lucide-react` (e.g. LayoutGrid=overview, Layers=capsules, FolderGit2=projects, Plug=connectors, Activity=activity, Settings=settings).
- `AppShell({ children }: { children: ReactNode })` renders titlebar + sidebar + `<main>` with `children`.
- `PageHeader({ eyebrow, title, subtitle, actions })`.

- [ ] **Step 1: Extend the store view union** — update `Store` type + initial `view: "capsules"` + `setView`. Update the existing two callers (`App.tsx` tab handler is being replaced; ensure no dangling `"debug"`/`"projects"` literal remains that breaks types).
- [ ] **Step 2: nav.ts** — the NAV_ITEMS array + SETTINGS_ITEM with lucide icons + `⌘1..⌘5` shortcuts (display only this phase).
- [ ] **Step 3: PageHeader.tsx** — eyebrow/title/subtitle/actions per the brand spec (mono uppercase eyebrow, `text-[30px] font-semibold tracking-[-0.045em]` title, muted subtitle, actions right).
- [ ] **Step 4: Sidebar.tsx** — `bg-sidebar text-sidebar-foreground`, a top "Workspace" area (Rabta mark + wordmark), nav buttons mapped from NAV_ITEMS (active = `view` match → `bg-sidebar-accent text-sidebar-accent-foreground`, else muted; `⌘N` kbd right), a bottom group with Settings + a **"Local only"** badge (a small dot + text; a Tooltip explaining "Runs entirely on 127.0.0.1 — no cloud, no account"). Clicking a nav item calls `setView`.
- [ ] **Step 5: Titlebar.tsx** — 58px grid `1fr auto 1fr`: left Rabta mark + "Rabta"; center a ⌘K trigger (a `Button variant="outline"` styled like the mockup's search button — "Search or jump to…" + a `Kbd`), which for now just focuses/opens the Command palette stub (wire fully in Task 5); right a connection-status chip (`● N connected` reading `connectors.filter(c=>c.connected).length`, using a Tooltip). Preserve the `hub 127.0.0.1:{hubPort}` text somewhere subtle (e.g. right side or the Local-only tooltip).
- [ ] **Step 6: AppShell.tsx** — compose Titlebar (top), then a `grid-cols-[220px_1fr]` row: Sidebar + `<main className="bg-background overflow-y-auto p-9">{children}</main>`. Full-height `h-screen flex flex-col`.
- [ ] **Step 7: Rewire App.tsx** — KEEP the entire existing `useEffect` hub-event subscription, the `decide()` pairing handler, the hub-port effect, and all store selectors. REMOVE the tab bar + the old `view === "projects" ? … : (debug grid)`. Instead render: the pairing banner(s) (kept, may lightly restyle to a Card/amber-token later), then `<AppShell>` with a `switch(view)` selecting a page component. For THIS task, pages `overview/capsules/projects/connectors/activity/settings` may render simple placeholders (`<PageHeader…/>` + "coming in a later task") EXCEPT keep the app compiling and the pairing banner functional. (Pages get real content in Tasks 2–5.)
- [ ] **Step 8:** `pnpm --filter desktop build` + `pnpm --filter desktop test` (7 pass) green; commit `feat(shell): Rabta sidebar shell + navigation scaffold`.

---

### Task 2: Projects page (port of ProjectsView)

**Files:** create `pages/ProjectsPage.tsx` (port from `views/ProjectsView.tsx`); wire into App.tsx `switch`. May keep `views/ProjectsView.tsx` internals or move them; the register form + list + delete-confirm + GitLine/GitHubSection/TasksSection composition must keep working with the SAME invokes.

- [ ] Port the projects list to `Card`s on paper; project name/branch/path with proper hierarchy (title vs muted metadata); delete behind a `Dialog` confirm (using the design-system Dialog) instead of inline lookalike buttons.
- [ ] Register: keep the form (Input/Button from the system, Label’d fields, `pathNote` as inline error styling). (Register-as-dialog polish is Phase 3; a clean token form here is fine.)
- [ ] Keep GitLine/GitHubSection/TasksSection mounted as today (they get their own ports in Task 3/Phase 3) — but ensure they don’t look broken on paper; a light token pass on GitLine/GitHubSection is in scope if needed for coherence.
- [ ] PageHeader eyebrow "WORKSPACE" / title "Projects" / subtitle count. Build+tests green; commit.

---

### Task 3: Capsules page (tasks UI ported)

**Files:** create `pages/CapsulesPage.tsx`; port `views/TasksSection.tsx` presentation to tokens.

- [ ] Show tasks (across the selected/most-relevant project, or grouped by project) as `Card`/rows on paper with clear hierarchy: title prominent, humanized capsule summary muted, the **active** task marked (tangerine accent / `Badge`). Primary action **Resume** (=activate) as `Button` (primary/tangerine); Save state / Done / Delete as secondary/ghost/destructive (Delete behind Dialog confirm). Keep the exact invokes (`activate_task`, `save_capsule`, `set_task_status`, `delete_task`, `create_task`, `list_tasks`, `task_resources`) and the busy-guard + activation-nonce behavior.
- [ ] (Deep humanized-summary + action-toasts are Phase 3; here, coherent token styling + the Resume-primary hierarchy.) PageHeader "TASKS" / "Capsules". Build+tests green; commit.

---

### Task 4: Connectors + Activity pages

**Files:** create `pages/ConnectorsPage.tsx` (port `panels/ConnectorsPanel.tsx` + surface pairing), `pages/ActivityPage.tsx` (port `panels/LogPanel.tsx`).

- [ ] Connectors: connector rows as `Card`s with a clear **status** (icon+text+color, not color-only — e.g. a green dot + "Connected" / muted "Last seen …"), kind `Badge`, capabilities. Pairing requests shown as a proper approve/deny `Dialog`/banner (kept behavior via `approve_pairing`/`deny_pairing`).
- [ ] Activity: the event feed on paper; keep the connector/kind filters (as `Select`) + pause; the raw `JSON.stringify` row stays available but de-emphasized (mono, muted) — full humanization is Phase 3. PageHeaders. Build+tests green; commit.

---

### Task 5: Overview + Settings + ⌘K + Local-only trust

**Files:** create `pages/OverviewPage.tsx`, `pages/SettingsPage.tsx`; finish the Titlebar ⌘K wiring; the sidebar "Local only" tooltip/badge.

- [ ] Overview: a light dashboard from existing data — counts (projects, connectors connected, open tasks), the active task, recent activity — all from existing store/invokes; `Card`s + `EmptyState` when nothing yet. No new backend.
- [ ] Settings: the **Advanced** raw command sender (`panels/CommandSender.tsx` ported — it stays a power tool, clearly labeled Advanced) + a **theme** toggle (light/dark via `useTheme`) + a short **Privacy** blurb (local-first; links the Local-only story — full Privacy page is Phase 6).
- [ ] ⌘K: wire a global `keydown` (⌘K/Ctrl-K) opening the `CommandDialog` with nav commands (jump to each section) + "New task"/"Register project" (invoking the same store `setView`/actions). Mount `<CommandDialog>` at the shell level.
- [ ] "Local only" badge in the sidebar: a `success`-dot + text with a Tooltip: "Runs entirely on 127.0.0.1 — no cloud account, no telemetry." Build+tests green; commit.

---

## Definition of Done (Phase 2)
- The real app (no `#gallery`) renders the Rabta sidebar shell; all six sections navigable; default Capsules.
- Every existing capability still works through the SAME invokes (register/delete project, create/activate/save/done/delete task, git line, GitHub, connectors, pairing approve/deny, activity log/filters, command sender).
- No `bg-neutral-*`/`font-mono`/lowercase-verb UI remains in the ported screens; everything composed from the design system on brand tokens.
- Pairing approve/deny still functions; hub-event wiring intact; hub port shown.
- `pnpm --filter desktop build` + `pnpm --filter desktop test` green; no console errors.
- Shown to the user (live) before Phase 3.

## Self-review
- Spec coverage: shell (B) + nav + trust-in-chrome (G seed) + ⌘K (H seed) covered; deep interaction redesign explicitly deferred to Phase 3; no invoke/behavior change (constraint per task).
- Type consistency: `NavKey` defined once in store, imported by nav.ts/Sidebar/App; `view`/`setView` signatures consistent.
- Risk: the big risk is behavior drift while porting — every task restates "keep the exact invokes + wiring." App.tsx Task-1 step 7 explicitly preserves the hub subscription verbatim.
