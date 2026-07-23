# A2 — Microinteractions + macOS Traffic-Light Integration — Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** A calm, premium microinteraction pass across Rabta, plus integrating the macOS **traffic lights into our nav bar** (one unified top bar instead of a stacked native title bar + our bar). Refine what exists; no redesign; petrol/ivory/tangerine only; opacity/transform only; reduced-motion respected.

## Global Constraints
- Presentation only. No `invoke`/event/payload change (T1 changes the WINDOW chrome config + a Rust window-setup line — no command/data change).
- Motion: brand ease; **opacity/transform/scale/shadow only**; no blur/heavy effects; `prefers-reduced-motion` neutralizes (global rule already forces `transition-duration:0.001ms`; ceremonies check the helper).
- Compose from `@/components/ui/*` + tokens. No new deps. Title-case.
- Run pnpm from repo root `/Users/sammy/omnibus`; cargo needs `export PATH="$HOME/.cargo/bin:$PATH"`; node v18.20.

---

### T1 — Integrate macOS traffic lights into the nav bar
**Problem:** macOS draws its own native title bar (with the close/min/zoom "traffic lights") ABOVE our React `Titlebar` — two stacked bars. Goal: one bar; the real, functional traffic lights sit INSIDE our top bar at the left.

**Files:** `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src-tauri/src/lib.rs`, `apps/desktop/src/shell/Titlebar.tsx`, `apps/desktop/src/shell/AppShell.tsx`.

**Approach (standard Tauri 2 macOS overlay title bar):**
- `tauri.conf.json` window: add `"titleBarStyle": "Overlay"` (keeps the native traffic-light buttons but makes the title bar transparent/overlaid so our webview content extends under it and there's no separate grey bar). Keep `title`, sizes, `resizable`. (Windows/Linux ignore `titleBarStyle`; on those platforms our bar is just a normal bar — acceptable, macOS-first.)
- `lib.rs` `.setup()`: vertically center the traffic lights in our 58px bar. Get the main window and call `set_traffic_light_position(LogicalPosition::new(19.0, 21.0))` (x≈19 from left, y≈21 so the ~16px buttons sit centered in the 58px bar). Guard with `#[cfg(target_os = "macos")]`. Import the needed types (`tauri::LogicalPosition`; the trait method is on `WebviewWindow`). If the exact API differs in tauri 2.1, use the correct equivalent (`window.set_traffic_light_position(...)`), and if that method isn't exposed, fall back to leaving default position (still integrated, just top-aligned) and note it.
- `Titlebar.tsx`: (a) reserve space so the left content (Rabta mark + wordmark) clears the lights — add left padding on macOS-ish: since the bar is `px-4`, change the LEFT cell to start after the lights, e.g. wrap header content so the first cell has `pl-[72px]` (buttons + gap ≈ 70px). Keep it responsive (the center ⌘K + right status unaffected). (b) Make the bar a drag region: add `data-tauri-drag-region` to the `<header>` (and ensure interactive children — the ⌘K button, the status chip — are NOT drag regions so they stay clickable; Tauri treats only the element with the attribute as draggable, children with their own handlers still work, but add `data-tauri-drag-region` only to non-interactive wrappers to be safe). Double-click on the drag region should zoom (default macOS behavior with drag region).
- `AppShell.tsx`: no structural change needed (Titlebar stays the top row), but verify the top of the app has no gap/overlap now that the native bar is gone.

**Verify:** this is a NATIVE-chrome change — MUST be checked live. Build + run `tauri dev`; confirm: only ONE top bar; the three traffic lights are visible at the left of our petrol/paper bar, vertically centered; close/min/zoom all work; dragging the bar moves the window; double-click zooms; the ⌘K button + status chip are still clickable; the mark/wordmark don't sit under the lights. `pnpm --filter desktop test` + `cargo build` green.
- [ ] T1 step: apply the four-file change; `cargo build` (PATH set) clean; commit `feat(shell): integrate macOS traffic lights into the nav bar (overlay title bar)`. (Live verification is done by the controller after commit.)

---

### T2 — Interactive-element microinteractions
**Files:** `apps/desktop/src/components/ui/button.tsx`, `card.tsx`, `apps/desktop/src/shell/Sidebar.tsx`, and a small shared tweak to `index.css`/tokens if useful. Plus light touches to inputs.

- **Button:** add a subtle press + hover to the base `buttonVariants`: `active:scale-[0.98] transition-[transform,background-color,box-shadow]` with brand-ish duration; primary/tangerine gets a soft hover (slightly darker + a touch of lift is already partly there — keep restrained). Ensure focus-visible ring intact. Don't change variants/API.
- **Card:** softer default shadow; a smooth hover (`transition-[box-shadow,transform] hover:shadow-md` OR a subtle `hover:-translate-y-px` — pick ONE, tasteful) applied where cards are interactive (a `hover` needn't apply to static cards — consider an `interactive` variant/prop OR a utility class used by clickable cards; keep static cards calm).
- **Sidebar nav selection:** the active-row transition should glide (background/opacity transition on the active pill), and hover a gentle `hover:bg-sidebar-accent/60`. Selection change should feel smooth, not instant-snap. Keep petrol palette.
- **Softer shadows:** define/adjust a soft shadow scale (e.g. use Tailwind `shadow-sm`/`shadow-md` but verify they read soft on the ivory surface; if too harsh, add a custom `--shadow-soft` token used by cards/sheet). Restrained.
- **Inputs:** smooth focus-ring transition (already has focus-visible; add `transition-[box-shadow,border-color]`).
- Reduced-motion: all via CSS transitions (auto-neutralized).
- Tests: existing suite stays green (class-only changes); no new tests needed unless a component API changes (it shouldn't). Build+test green. Commit `feat(ui): button/card/sidebar/input microinteractions (calm hover/press/shadow)`.

---

### T3 — Overlay/feedback motion + loading skeletons
**Files:** overlay components already carry shadcn `data-[state]:animate-in/out` classes (`dialog.tsx`, `dropdown-menu.tsx`, `context-menu.tsx`, `tooltip.tsx`, `popover.tsx`) — VERIFY they animate (fade+zoom) and refine timing/easing to brand if snappy/harsh. `sonner.tsx` toaster — confirm natural slide/fade (sonner defaults are good; align duration if needed). Add **loading skeletons** to the data pages so first paint isn't "empty → pop".

- Verify + lightly tune the enter/exit on Dialog (incl. the Restore sheet uses its own motion — leave it), DropdownMenu, ContextMenu (once T-context-menus exist in A4 they'll reuse this), Tooltip, Popover, Command — subtle fade + 2–4px/none translate + ~150–180ms brand ease. Don't over-animate.
- **Skeletons:** add `Skeleton` placeholder rows/cards to the initial-loading states of: CapsulesPage (while `list_projects`/`list_tasks` resolve), ProjectsPage, ConnectorsPage, ActivityPage, OverviewPage — each page currently shows nothing or an empty flash before data. Introduce a small per-page `loading` boolean (local `useState`, set false after the first fetch resolves) and render 2–4 `Skeleton` rows/cards while true. This is presentational (no new invoke; wraps existing fetches). Keep the empty states for genuinely-empty (loaded, zero items) — skeletons are only for the pre-first-load window.
- Tests: add/adjust smoke tests so a page shows skeletons before data and content after (or at least renders without throw with the loading state). Build+test green. Commit `feat(ui): overlay enter/exit motion polish + loading skeletons on data pages`.

---

## DoD (A2)
- One unified top bar with working, integrated macOS traffic lights (close/min/zoom + drag + double-click-zoom); mark/⌘K/status all correct.
- Calm hover/press/shadow/selection microinteractions across buttons, cards, sidebar, inputs; overlays fade/scale naturally; toasts natural; data pages show skeletons before first data.
- Reduced-motion respected; opacity/transform/shadow only; petrol/ivory/tangerine only; no redesign.
- `pnpm --filter desktop test` + `cargo build` green; live-verified in the native window.
- Shown to the user before A3.
