# Design brief — pins and focus mode

Paste this into Claude Design. It describes two features that already ship in
Rabta's code but have no considered UI yet, so the redesign can place them
properly instead of inheriting where they landed by default.

---

## The product, in one paragraph

Rabta is a local-first macOS app for developers. It captures a **capsule** — a
snapshot of the workspace around a task: which files are open in the editor,
which terminals and their directories, which browser tabs, and the git branch.
When you resume that task later, Rabta reopens all of it. Everything stays on
the user's own machine; there is no account and no server. The palette is
petrol `#102526` as the ground, ivory `#f3f0e8` for text, orange `#ff6b2c` used
for exactly one thing — the live or primary thing — and four cool tones between.

## Feature 1 — Pinning and curating a capsule

A capsule is a **recording**: whatever happened to be open. Users now get a thin
layer of **intent** on top.

Every item in a capsule (a tab, a file, a terminal) can be:

- **Pinned** — "always open this." A pinned item reopens on every resume even if
  it was closed the last time the capsule was saved. That is the whole
  distinction: *always here* versus *here until I close it once*.
- **Removed** — dropped from the record. It does not say "never open this"; if
  the thing is still open next time the capsule saves, it comes back.

Three states a row can be in, and all three need to read differently:

1. **Captured, not pinned** — ordinary. Came back because it was open.
2. **Captured and pinned** — will always come back.
3. **Pinned but no longer captured** — the user pinned it, then closed it. It
   still reopens on every resume, but it is not currently part of the recording.
   Today this renders italic with "(not open)" appended, which is weak. This
   state matters: it is the only place a user can turn off a pin that is still
   firing.

One row is special: **a terminal Rabta cannot restore.** Rabta only knows a
terminal's working directory if it was created with an explicit one — a terminal
the user opened with ⌃\` has none, so Rabta cannot reopen it. Those rows are
listed (so they can be removed) but their pin control is unavailable, with the
reason "can't always open — no saved folder to restore it in". A disabled
control that cannot explain itself is worse than none.

**Where it lives now:** inside a popover hanging off each task's capsule
summary on the Capsules page. That was the path of least resistance, not a
decision. A list with two icon buttons per row, in a popover, is almost
certainly the wrong home for something users are meant to curate.

## Feature 2 — Focus mode

Restoring a task has always been purely **additive**: it opens things and closes
nothing. Resume three tasks and the browser holds three projects at once.

Focus mode, **off by default**, makes resuming a task also put away what does
not belong to it. Settings copy today:

> **Put away what isn't in the task** — On resume, close the tabs, files and
> terminals that don't belong to the task you're resuming. Never closes unsaved
> files, pinned tabs, or terminals that are running something.

Two things about it are load-bearing and should be legible in the design:

**Nothing is ever lost.** Before switching, Rabta already saves the outgoing
task's state, so anything put away is recoverable by resuming that task. Undo is
"go back to what you were doing," not a separate mechanism.

**It refuses, out loud.** Focus mode asks each connected app to close something,
and the app can say no. A refusal is a correct outcome, not a failure. The
reasons that can come back, verbatim:

- `pinned in the browser`
- `incognito`
- `the last tab in its window`
- `unsaved changes`
- `running something`
- `no longer open`
- `not an http(s) page`

**The receipt.** After a resume, a sheet reports what happened. It already
reports which tools restored, which are pending, which were skipped. It now also
has to report what was put away and what was kept, e.g. *"6 tabs closed · 2 kept
— 1 pinned, 1 unsaved · 1 terminal left running (npm run dev)"*. Today that is a
single muted line at the bottom. Given it is the only place a user learns their
tabs were closed, it deserves better than a footnote — but it must not read as
an error either, because refusing is the system working correctly.

## What to design

1. **A home for curating a capsule.** Three item states plus the unavailable-pin
   case, across three kinds (tabs, files, terminals), scannable and editable.
   Assume tens of items, not five.
2. **The put-away receipt**, as a first-class part of the restore sheet —
   honest, calm, and clearly not an error.
3. **Somewhere focus mode is discoverable.** It is a destructive-feeling feature
   buried in Settings. A user who would want it will probably never find it,
   and a user who finds it should understand the guarantees before enabling it.

## Constraints

- Orange means one thing only: the live thing, or the primary action. A page has
  one primary action. Do not spend orange on decoration.
- Colour is never the only signal — every state needs a non-colour cue too.
- Anything that can be hovered must be reachable by keyboard, and a disabled
  control must still be able to explain why it is disabled.
- Copy style: sentence case, no exclamation marks. Name what is true, then what
  to do about it. Never claim more than the software does.
- macOS desktop app, dark ground. Existing type scale is Inter, 400–600 only.

## What does NOT exist — do not design it

Hiding other applications' windows. Chrome tab groups. Reusable workspace
templates. A "never reopen this" list. All four were considered and explicitly
left out; showing them would promise something the software cannot do.
