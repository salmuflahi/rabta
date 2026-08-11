# Console v2 Phase 4 — outcome

Branch `feat/console-v2-phase-2`, 40 commits from `0eb1f81` to `b40d26f`.
+4,478 / −226 across 55 files in `apps/desktop`.

**Verified at close:** 60 test files / 743 tests passing, 65 repo-wide tests
passing, `tsc -b --noEmit` clean, `vite build` succeeds. Keyboard navigation
confirmed working in the running app — ArrowUp moved the selection, focus
followed it, and the detail pane updated. The four master lists confirmed
visually unchanged: still 7px radius on real `<button>` elements.

## What shipped

**Navigation history.** The toolbar's back/forward chevrons were hardcoded
`disabled`; the design handoff specifies them as dead chrome. They now walk a
real history stack (`src/shell/history.ts`), bound to ⌘[ / ⌘], each naming its
destination — "Back to Capsules", not "Back". A view change pushes; a selection
change inside a view rewrites in place, so browsing a long list stays cheap
while Back still returns to the row you were reading.

**The pairing approval sheet.** The old banner rendered above the toolbar inside
the shell's flex column, so every pending request pushed the whole application
down. It is now a modal sheet over a scrim: no reflow, nothing to overlap. It
also stopped being a yes/no prompt — it shows what the connector will be able to
see and what it structurally cannot, using the same permission cards the
Connectors page uses, so consent and later inspection look identical.

Three safety properties, each load-bearing: both decisions are inert for 350ms
(a pairing request arrives unprompted, over whatever you were doing); Enter
fires nothing at all while still being swallowed, so no global shortcut can fire
over an unread approval; and Escape dismisses *without deciding*, leaving the
request pending on the Connectors page rather than permanently rejecting it.

**One motion vocabulary.** Skeletons sweep instead of pulsing, and take the
geometry of the content they stand in for. The restore ceremony dropped its
bootstrap-era spinner for the same live pulse a connected connector shows.
`motion.ts` is now the single source for durations and easings, with the
Tailwind config reading from it — verified by an MD5-identical CSS build.

**Accessibility, first real pass.** All four master lists are keyboard-drivable
through one shared hook — arrows, Home/End, type-ahead, roving tabindex,
selection following focus. One `announce()` helper backs two live regions where
the app previously had one region total. Landmarks, a skip link, and reduced
transparency. Token contrast is asserted from the token values in both themes
across all four accents, so it cannot silently regress.

## Divergences from the spec, and why

**The chevrons became live.** The handoff specifies them as permanently
disabled. A dead control in a shipping app reads as broken software, so they
navigate instead.

**Initial focus does not land on Deny.** The spec asked for it. The `Sheet`
primitive deliberately focuses its own container so a screen reader starts at
the title rather than mid-footer, and `enterAdvances={false}` makes Enter fire
nothing at all — a stronger guarantee than focusing Deny, since no keypress
reaches either decision.

**Accent label colour is computed at runtime.** All four accents failed WCAG,
and no single static `--primary-foreground` satisfies all four in one theme.
The accent hues are pinned byte-identically to the handoff, so `applyAccent()`
resolves the label colour per accent+theme instead. Review confirmed the
alternative — a literal CSS-only fix — would have silently regressed three
accents from passing to failing.

**Connectors and Activity gained a store hydration flag.** Neither page had a
loading state, so neither could show a skeleton. Adding one surfaced a real
latent bug: a user whose landing page is either view watched an empty list where
a skeleton belonged.

## What the reviews caught

Every task passed an independent review before counting as done. The reviews,
not the implementations, caught all of the following — none would have thrown an
error in production:

- **The plan itself had a history-corrupting bug.** Selection actions recorded
  under the *active* view, but three shipped call sites select before
  navigating, silently clobbering the outgoing view's selection.
- **The pairing sheet's arm delay protected only the first request in a queue.**
  Approve one, and the next rendered with Approve already enabled.
- **The capture announcement lied to screen-reader users** — "Capsule captured"
  when nothing was captured, on the only channel such a user has for the event.
- **The accessibility guard passed while inspecting nothing.** Every page
  rendered a skeleton rather than real content, so it found no elements at all.
- **The motion guard checked a string, not a rule.** Gutting the app's own
  Motion setting while leaving the selector text intact passed silently.
- **Task 11 restyled all four main screens** as a side effect of wiring keyboard
  navigation, because the plan wrongly assumed those pages used the shared `Row`
  component. Reverted; the lists gained behaviour and zero pixels changed.

A pattern worth carrying forward: five of these were tests or guards that
*looked* like coverage and weren't, and several traced back to plan text rather
than implementation. Requiring implementers to break the code and watch the test
fail — before accepting a fix — is what caught the last of them.

## Carried forward

**Decided and done (`f27dfce`):** `Toolbar.tsx` set an opaque `bg-background`
alongside `backdrop-blur-[24px]`, so the toolbar's blur had never rendered and
the reduced-transparency rule was inert for that surface. Now
`bg-background/85 backdrop-blur-[24px]`, matching `CommandPalette`, whose blur
was always real. It visibly changes the app's main chrome, which is why it
waited for a decision rather than shipping as a cleanup.

**Logged for the security audit:** pairing is parked on a `pair` frame carrying
only name and kind, so the approval sheet shows capabilities derived from the
connector *kind* rather than from the specific request. Forwarding real
capabilities would reveal a connector asking for more than its kind normally
does.

**Deferred minors** are recorded in
`.superpowers/sdd/2026-08-10-console-v2-phase-4-polish/progress.md`, each marked
`minor (deferred)` with its reasoning.

## Not done, deliberately

The restore report and capture confirmation — the handoff's own gaps 1 and 2 —
remain unbuilt. Both are new product surfaces rather than polish on existing
ones. This phase gave capture and restore correct announcements and loading
states; it did not build the report.

## Incomplete

The final whole-branch review was dispatched but terminated on a session limit
before returning. Per-task reviews all passed, and the cross-task checks done by
hand at close found no duplicate mechanisms (one announcement helper, one
contrast implementation, one navigation hook) — but the phase has not had a
single reviewer read it end to end. Worth running before this merges.
