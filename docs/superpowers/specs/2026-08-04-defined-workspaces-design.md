# Defined workspaces — design

**Date:** 2026-08-04
**Status:** approved, not implemented

## The problem

Rabta is a recorder. A capsule is a snapshot of whatever happened to be open,
and Resume replays it — additively. `restore_chrome` says so in as many words:

> Restores browser tabs additively: opens each captured url. Non-destructive
> (never closes the user's current tabs).

Two things follow from that, and both are felt.

**You cannot say what a workspace should be.** You can only record what it was.
If a task needs the API docs tab open every time, there is no way to say so —
you can only hope it was open the last time you saved.

**Switching accumulates.** Resume a task with five tabs and you now have your
previous tabs *plus* five. Nothing is ever put away, so after three switches
the browser holds three projects at once. There is no close, hide, minimise or
quit command anywhere in the codebase; restore has only ever added.

This design fixes both, in that order, without giving up the guarantee that
makes the additive behaviour trustworthy: **Rabta never loses your work.**

## The model

A capsule stays a recording and gains a thin *definition* layer: every item —
tab, file, terminal — can be **pinned**.

- **Pinned** items are what the workspace *is*. They open every switch.
- **Loose** items are what happened to be open. They come back as recorded.

Switching becomes a **swap**: the outgoing set is stashed (which already
happens), and anything not in the incoming capsule is closed.

No new nouns. Capsules, tasks and projects keep their meanings.

## Decisions and why

These were settled deliberately; each had a cheaper option that was rejected.

| Decision | Rejected alternative | Why |
|---|---|---|
| Stash, then close | Close outright | Closing outright loses anything that never belonged to a task. The stash costs nothing — see below. |
| Fold the stash into the outgoing task | A separate stash capsule | The outgoing task is auto-saved at that exact instant already. One mechanism, not two. |
| Global setting, off by default | On by default | Every Resume today is non-destructive. Turning that off under people without asking breaks the thing they rely on. |
| Busy terminals never closed | Close them anyway | A terminal running `npm run dev` holds state no capsule captures. It is the one action here that could destroy unrecoverable work. |
| Desktop diffs, per-item closes | Connector reconciles a desired state | Reconcile rules implemented twice, in two extensions on independent store-review cycles, will drift — and the bug is invisible until someone's tabs vanish. |
| Capture then curate | Author from a blank form | Being spared data entry is the reason Rabta exists. |
| Pinned + last open | Pinned only (clean room) | A clean room drops the half-read doc you had open when you got pulled away, which is the thing Rabta was built to stop happening. |

### The stash is free

Capture is already unfiltered. Chrome's `workspace.state` calls
`chrome.tabs.query({})` — every tab. VS Code's `snapshot()` walks
`window.tabGroups.all` and `window.terminals` — every editor tab, every
terminal. And `activate` already auto-saves the outgoing task before switching
(`saved_previous` in `ActivateSummary`).

So the outgoing capsule **already holds your strays today**. Stashing requires
no new capture code. Getting things back is just resuming that task.

This is why "stash then close" costs no more than "close": the stash is a thing
that already happens.

## Data model

Each capsule item gains `pinned: bool`, defaulting to `false`.

One rule carries the entire feature:

> **Auto-save preserves pinned items even when they are not open. Loose items
> are replaced by whatever is actually open.**

That is what makes a pin mean *always here* rather than *here until I close it
once*. Without it, closing a pinned tab and switching away would silently
un-pin it. This rule is the most likely place for a bug and gets its own test.

## Curating

The capsule detail view becomes editable. Each item gets:

- a **pin** toggle — always open this
- a **delete** — remove it from the capsule

Delete removes the record, not the thing. If the item is still open at the next
switch it returns as a loose item, which is correct: you deleted the record.
To be rid of it, delete it and close it.

There is no "never reopen" list. See *Out of scope*.

## Switching

With `focusMode` on, `activate` runs:

1. **Auto-save the outgoing task** — *exists.* Captures everything open,
   strays included, subject to the pin-preservation rule above.
2. **Restore the incoming capsule** — *exists, plus pinning.* `workspace.open`,
   `editor.openFile`, `terminal.create`, `tabs.open`. Pinned items always;
   loose items as recorded.
3. **Reconcile** — *new.* Request `workspace.state` from each connector, diff
   against the incoming capsule, close the remainder item by item.

### Step 3 runs only after a clean step 2

If any command in step 2 reported an error, focus is skipped entirely and the
receipt says `focus skipped — restore was incomplete`.

Two reasons, both load-bearing:

- The destructive half never runs on a restore that is already going wrong.
- Diffing **after** the opens means everything the restore just placed is by
  definition in the capsule, so reconcile can never close its own work.

### Never closed

> **Two different pins.** A *capsule pin* is this design's `pinned: bool` — it
> means "always open this". A *browser pin* is Chrome's own pinned tab. They
> are unrelated, and both are guards for different reasons: a capsule-pinned
> item is never closed because it is in the capsule, and a browser-pinned tab
> is never closed even when it is not.

| Guard | Why |
|---|---|
| Unsaved (dirty) editors | Closing a dirty buffer destroys work no capsule holds. |
| Browser-pinned tabs | Pinning a tab in Chrome is an explicit "this stays", independent of any capsule. |
| Busy terminals | A running process is not in the capsule. |
| The last tab in a window | Closing it closes the window. |
| Incognito tabs | Never captured, so they would read as unrelated and be closed. This exclusion is load-bearing, not incidental. |

Per-item failures are collected and never fatal, matching how `restore_chrome`
already handles `tabs.open`.

## Receipt

`ActivateSummary` gains `closed: Vec<String>` and `kept: Vec<(String, String)>`
— item and reason. The restore experience reports them alongside the existing
`applied` / `pending` / `skipped`:

> 6 tabs closed · 2 kept — 1 pinned, 1 unsaved · 1 terminal left running
> (`npm run dev`)

Same honest-partial-result pattern the restore experience already uses. Nothing
is ever closed silently.

## Connector surface

| Connector | Change | Cost |
|---|---|---|
| Chrome | `tabs.close` command | `tabs` permission already granted — no new consent prompt |
| VS Code | `editor.closeFile`, `terminal.dispose` | — |
| VS Code | `workspace.state` reports `dirty` per file and `busy` per terminal | — |
| VS Code | `engines.vscode` → `^1.93` | Drops 1.85–1.92 |

Busy detection uses `window.onDidStartTerminalShellExecution` /
`onDidEndTerminalShellExecution`, stable since VS Code 1.93 (Aug 2024). There
is no reliable way to know a terminal is busy before those events. VS Code
auto-updates and Cursor tracks recent VS Code, so the practical cost of the
floor is close to zero.

Both extensions go to 0.2.0 and require store submissions.

## Phasing

**Phase 1 — pinning and curating.** Data model, the pin-preservation rule, the
editable capsule view. No connector changes, no store review. Ships alone and
is independently valuable: the things you marked essential are always there,
whether or not the swap ever lands.

**Phase 2 — the swap.** `focusMode` setting, the reconcile step, the guards,
the receipt, and the new connector commands. Carries the store-review cost.

Phase 1 first, so a delay in Phase 2 still leaves something gained.

## Testing

- **Rust (`capsules.rs`)** — the diff; every guard; close-runs-only-after-clean-open;
  focus skipped when the open phase errored.
- **The pin-preservation rule** gets its own test: pin an item, close it,
  switch away, and assert it survived the auto-save. Everything rests on it.
- **Chrome (vitest)** — `tabs.close`; never targets incognito or pinned tabs;
  never closes the last tab in a window.
- **VS Code (vitest)** — `dirty` and `busy` reporting; `editor.closeFile`
  refuses a dirty editor; `terminal.dispose` refuses a busy terminal.
- **The guarantee** — with `focusMode` off, activate behaves identically to
  today. This is the test the whole design exists to protect.

## Out of scope

Each is a real idea; none is needed for this to work.

- **Hiding other applications' windows.** Reaches past anything Rabta has a
  connector for, needs Accessibility permission, and "hidden app" is not a
  state Rabta can capture or restore honestly.
- **Chrome tab groups.** Would need the `tabGroups` permission and a new
  consent prompt on an existing install.
- **Template workspaces.** Needs its own list, editing, and a rule for what
  happens when a task drifts from its template.
- **A "never reopen" list.** Deleting an item and closing it achieves the same
  thing. Revisit only if that proves insufficient in practice.
