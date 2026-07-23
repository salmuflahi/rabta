# A4 — Context Menus + Undo + Reveal in Finder — Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. `- [ ]` steps.

**Goal:** Right-click context menus on project + capsule rows wired to REAL existing actions; every destructive action gets genuine **Undo** via deferred-commit (no backend); **Reveal in Finder** for projects (a tiny opener). No redesign; petrol/ivory/tangerine; reduced-motion respected.

## Scope note
Rename / Duplicate / Archive need the Track-B backend (not built yet) — they are NOT in A4. A4 wires the actions that exist today (Resume, Save state, Done/Reopen, Delete-with-Undo, Reveal in Finder). Track B will add Rename/Archive into the SAME menus later. No dead/disabled "coming soon" items.

## Global Constraints
- Presentation-first. The ONLY backend addition is a trivial `reveal_in_finder(path)` opener (shells `open -R` on macOS, matching the existing git/gh shell-out pattern) — no data/product logic. Everything else reuses existing invokes (`delete_project`/`delete_task`/`activate_task`/`save_capsule`/`set_task_status`).
- Undo = **deferred-commit**: on delete, optimistically hide the row + show a toast with **Undo**; the real `delete_*` invoke fires ONLY after the ~5s window elapses without Undo. Undo cancels the timer and restores the row — the DB is never touched. This REPLACES the current delete confirm-Dialog (undo is the better affordance the user asked for).
- Compose from `@/components/ui/*` (ContextMenu = Radix, already vendored; sonner toasts support an action button). Token-only; title-case; opacity/transform only. cargo: `export PATH="$HOME/.cargo/bin:$PATH"`. Repo root `/Users/sammy/omnibus`, node v18.20.

---

### T1 — `reveal_in_finder` opener (tiny backend)
**Files:** `apps/desktop/src-tauri/src/lib.rs` (or a small helper), register in `generate_handler!`; a TS wrapper usage in the context menu (T3).
- Add a Tauri command `reveal_in_finder(path: String) -> Result<(), String>`: on macOS run `Command::new("open").args(["-R", &path])` (reveals the file/folder in Finder); non-macOS → `Err("reveal in Finder is only supported on macOS")` (or a no-op Ok — pick Err with a clear message). Guard with `#[cfg(target_os="macos")]` for the open call. Validate the path exists first (`Path::new(&path).exists()`) → friendly Err if not. Mirror the existing shell-out style in `git.rs`/`github.rs`.
- Register it in the `tauri::generate_handler![...]` list at lib.rs:382.
- Rust test: a unit test that a non-existent path returns Err; (the actual `open` isn't run in tests — just the validation branch).
- Verify: `cargo build` + `cargo test` (the crate) clean. Commit `feat(app): reveal_in_finder opener (open -R on macOS)`.

---

### T2 — Deferred-commit Undo for delete
**Files:** a reusable `apps/desktop/src/lib/undoDelete.ts` (or a small hook `useDeferredDelete`), and wire `pages/ProjectsPage.tsx` + `pages/CapsulesPage.tsx`.
- Build a reusable mechanism: `deferredDelete({ id, label, commit, onOptimisticRemove, onRestore, delayMs=5000 })` — or a hook returning `{ pendingIds, requestDelete(item) }`. Behavior:
  1. On `requestDelete`: add `id` to a `pendingIds` set (the page filters these OUT of the rendered list → optimistic removal), and show `toast(<label> + " deleted", { action: { label: "Undo", onClick: cancel }, duration: delayMs })`.
  2. Start a `delayMs` timer. If it elapses: call `commit()` (the real `invoke("delete_project"/"delete_task", …)`), then a quiet confirm (or nothing), and drop the id from pendingIds (it's gone from the DB now; refresh).
  3. If Undo clicked before the timer: clear the timer, remove `id` from pendingIds (row reappears), no invoke fires.
  - Handle unmount/navigation: on unmount, either commit immediately (so a pending delete isn't silently lost) OR flush pending timers — CHOOSE: flush-commit pending deletes on unmount (the user chose to delete; leaving would resurrect it confusingly). Document the choice. Also handle app-level: if multiple deletes pending, each independent.
- **ProjectsPage:** replace the delete confirm-Dialog with `requestDelete(project)` (from the context menu AND/OR keep a Delete button that now uses undo). Filter `pendingIds` out of the displayed projects. Keep the existing `delete_project` invoke as the `commit`.
- **CapsulesPage:** same for tasks — replace the delete confirm-Dialog with the undo flow; filter pending task ids out of the rendered list; `delete_task` as commit.
- Tests: requestDelete hides the row + shows an Undo toast; Undo restores the row and does NOT call the delete invoke; letting the timer elapse (fake timers) DOES call the delete invoke once. Non-flaky (vi.useFakeTimers + advanceTimersByTimeAsync).
- Verify: `pnpm --filter desktop test` + `tsc -b` + build green. Commit `feat(ui): deferred-commit Undo for delete (project + task)`.

---

### T3 — Context menus on project + capsule rows
**Files:** `components/ui/context-menu.tsx` (already exists), `pages/ProjectsPage.tsx`, `pages/CapsulesPage.tsx`. Reuse T1 (reveal) + T2 (undo delete).
- **Project rows:** wrap each project card in `ContextMenu`/`ContextMenuTrigger`; `ContextMenuContent` with: **Reveal in Finder** (calls `invoke("reveal_in_finder",{path: project.repoPath})`; toastErr on failure), a separator, **Delete** (destructive styling → `requestDelete(project)` from T2). (Rename/Duplicate/Archive come in Track B — omit now.)
- **Capsule/task rows:** wrap each task card in a ContextMenu with: **Resume** (the same `resume(task)` path — reuse), **Save State** (`save_capsule`), **Done/Reopen** (`set_task_status`), a separator, **Delete** (destructive → `requestDelete(task)` from T2). (Rename comes in Track B.)
- The context menu must not fight the existing left-click actions (buttons still work). Menu items keyboard-accessible (Radix handles it). Menu enter/exit uses the shadcn animate classes (already tuned in A2-T3). Destructive items use `text-destructive`/`focus:bg-destructive/10`.
- Keep the existing on-card action buttons too (context menu is additive, not a replacement — power users right-click, others use buttons). EXCEPT the delete confirm-Dialog is gone (both the button-delete and menu-delete now use the undo flow from T2).
- Tests: right-click (or fire the context menu open) a project → menu shows Reveal + Delete; a task → Resume/Save/Done/Delete; selecting Delete triggers the undo flow; Reveal calls `reveal_in_finder`. Non-flaky.
- Verify: `pnpm --filter desktop test` + `tsc -b` + build green. Commit `feat(ui): right-click context menus (projects + capsules) wired to real actions`.

---

## DoD (A4)
- Right-click on a project → Reveal in Finder + Delete(undo); on a capsule → Resume/Save/Done/Delete(undo).
- Delete anywhere shows an Undo toast; Undo restores with no DB change; only after the window does it commit.
- Reveal in Finder opens the repo in Finder (macOS).
- Reduced-motion + keyboard accessible; token-only; no redesign; tests + cargo green; live-verified.
- Rename/Duplicate/Archive explicitly deferred to Track B (same menus).
