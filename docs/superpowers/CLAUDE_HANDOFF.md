# Claude Handoff — Track B Core

## Current state

- Working branch: `codex/track-b-core` in `/Users/sammy/omnibus/.worktrees/track-b-core`.
- Main is clean and still at the Track B base `27a6c8b`; this branch has **not** been merged.
- The Tauri debug app is running from this worktree via `pnpm --filter desktop tauri dev`.
- `docs/superpowers/STATUS.md` is the user-facing project handoff. This file is the implementation continuation note.

## What landed

Track B Core B1–B3 is implemented:

- Durable schema-v2 project/task/session support: rename, archive/unarchive, curated project icons, stable ordering, duplicate capsules/resources, session metadata and saturating active-duration accrual.
- Product UI for project/capsule actions, archived-project restore/delete, accessible ordering, persisted Continue Working, and session previews.
- Active-session runtime: focus/idle accounting, 15-second heartbeat, 60-second idle threshold, retryable fractional carry, session shutdown flush, and concurrency-safe activation/archive/reconnect continuation behavior.
- Repository-wide Rust formatting and strict Clippy cleanup.

Important final lifecycle fixes:

- `68259f5` serializes frontend `session_update` dispatches so quick blur/focus or idle/activity transitions cannot arrive at Rust out of order; it also captures nested scroll activity.
- The next commit after this handoff adds mutation-sensitive tests proving queued updates recover after an invoke rejection and that the document capture scroll listener is removed at unmount.

## Verification already run

At `1576428` (before the final test-only handoff assertion changes):

- `cargo fmt --all -- --check`
- `cargo clippy --workspace --all-targets -- -D warnings`
- `cargo test --workspace`
- `cargo test -p rabta-db migration_two_preserves_version_one_records`
- `pnpm --dir apps/desktop test` — 166 tests / 20 files
- `pnpm --dir apps/desktop build`

After the final test-only changes, the focused hook suite and frontend build passed:

- `pnpm --dir apps/desktop exec vitest run src/lib/useSessionTracking.test.tsx` — 7 tests
- `pnpm --dir apps/desktop build`

Vite still emits its advisory that the bundled JS is just over 500 kB; this is a non-blocking deferred polish item.

## Reviews

- Task 10 concurrency re-review: approved; no Critical or Important findings.
- Task 11 review found two Important lifecycle flaws (out-of-order updates and nested-scroll inactivity); both are fixed in `68259f5`.
- The Task 11 re-review found only test-coverage Minors; the current uncommitted test-only changes address both.
- A whole-branch review was in progress when work stopped. Treat it as incomplete unless its agent result is available in the task history.

## Next actions

1. Commit the final test-only handoff change, then run the complete final gate again:

   ```bash
   cargo fmt --all -- --check
   cargo clippy --workspace --all-targets -- -D warnings
   cargo test --workspace
   pnpm --dir apps/desktop test
   pnpm --dir apps/desktop build
   git status --short
   ```

2. Finish/read the whole-branch review. Fix only Critical or Important findings.
3. The manual GUI acceptance list is intentionally pending because automation cannot attach to the raw Tauri debug executable. It is listed in `docs/superpowers/STATUS.md`.
4. If integration is wanted, merge `codex/track-b-core` into local `main`, then rerun at least the workspace Rust tests and desktop frontend suite on `main`.
5. After Track B, implement B4 connector version reporting; B5 is packaging/signing/release hardening.
