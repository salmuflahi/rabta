# Console v2 — Phase 4: polish, motion and trust

## What this is

Phases 1–3 built the Console v2 shell, rebuilt all six views as master/detail,
and shipped the Migrate flow. What is left is the part that decides whether the
app reads as finished: controls that do nothing, a security prompt that shoves
the layout, loading states from a different design era, and an accessibility
story that stops at the primitives.

This phase closes four gaps. Three of them the Console v2 handoff itself names
as open (`design_handoff_rabta_console/README.md` → "Gaps"): the pairing
approval moment, capture confirmation, and the restore report. The fourth —
accessibility — the handoff never covers, because a visual handoff cannot.

This is the desktop app only. The website rebuild and the security audit are
separate specs, in that order.

## Decisions

### The back/forward chevrons become live — a deliberate divergence

The handoff specifies these as dead chrome: *"back/forward chevrons (back is
disabled at 50% opacity)"*, and its prototype wires neither to a handler.
`HistoryChevrons` (`src/shell/Toolbar.tsx`) implements that faithfully, with a
comment explaining there is no navigation-history stack for them to read.

We diverge. A permanently disabled control in a shipping app reads as broken
software, not as restraint. Either the arrows navigate or they come out; this
spec makes them navigate.

### Pairing approval becomes a modal sheet, not a smaller banner

The current banner renders *above* the toolbar inside the shell's flex column
(`src/App.tsx`), so every pending request pushes the whole application down —
and it renders one bar per request, stacking. It is also the last surface in
the app still wearing pre-Console-v2 styling (`bg-warn-soft p-2 text-sm`).

The obvious fix is to float it. We are not doing that, because the problem is
not only that it overlaps.

Approving a connector is the single moment Rabta's central promise — nothing
leaves this Mac — is actually tested by the user. A bar reading "Chrome wants
to connect to Rabta" with two buttons gives them nothing to decide *with*. The
approval surface should state what the connector will be able to see and what
it structurally cannot, at the moment consent is given.

That content needs room, so it gets a sheet: the same primitive the Migrate
flow already uses (`src/components/ui/sheet.tsx`). A modal layer over a scrim
cannot overlap the chrome and cannot reflow the app, which resolves the
original complaint as a side effect of resolving the larger one.

### Loading gets one motion vocabulary, not two

`Skeleton` is four lines of `animate-pulse` on `bg-muted`. `RestoreExperience`
spins a `Loader2`. Neither came from the Console v2 language, and they do not
agree with each other about what "working" looks like. The handoff already
specifies a live-state motion — the connector detail's pulsing dot — and that
becomes the app's one answer.

## Navigation history

### The model

A **location** is `{ view, selection }`. `view` is the existing `NavKey`;
`selection` is the per-view selected id already in the store —
`selectedCapsuleId`, `selectedProjectId`, `selectedConnectorId`,
`selectedEventSeq`, `selectedSettingsSection`. Views with no selection carry
`null`.

Store additions:

```
history: Location[]          // capped at 50, oldest dropped
historyIndex: number         // points at the current location
navigate(loc): void          // truncate forward, push, clamp
goBack(): void               // index-1, apply without pushing
goForward(): void            // index+1, apply without pushing
canGoBack: boolean           // derived: historyIndex > 0
canGoForward: boolean        // derived: historyIndex < history.length - 1
```

`goBack`/`goForward` apply a location by setting `view` and the relevant
`select*` value directly, bypassing `navigate` — otherwise moving through
history would itself rewrite history.

### Push versus replace

**A view change pushes. A selection change within the same view replaces the
top entry.**

This is the only non-obvious rule in the feature and it exists for a concrete
reason: arrow-keying down a forty-row capsule list would otherwise create forty
history entries, making Back useless. But collapsing selection out of history
entirely is equally wrong — a user who was reading capsule *X*, jumped to
Projects, and pressed Back expects capsule *X*, not a bare list.

Replace-in-place satisfies both: list browsing stays cheap, and the most recent
selection in a view is what Back returns to. Finder and Xcode behave this way.

### Surface

- Both chevrons enable and disable off `canGoBack`/`canGoForward`. When
  disabled they keep the handoff's rendered `opacity:.4` — but now it means
  something.
- `⌘[` and `⌘]` bind to back and forward, registered alongside the existing
  global shortcuts in `src/App.tsx`.
- Each button's `title` and `aria-label` name the destination — "Back to
  Capsules" — rather than a bare "Back".
- Command palette "Go to" entries route through `setView` and therefore get
  history without further work.

### Out of scope

No swipe-back gesture, no history dropdown on long-press, no persistence of
history across launches. Session-scoped, two buttons, two shortcuts.

## The pairing sheet

Replaces the banner in `src/App.tsx` entirely. The Connectors view's in-context
`PairingCard` stays as it is — it is the place a request that was dismissed
without a decision goes to be found again.

### Structure

Header states the request in plain language: the connector name, its kind, and
that it is asking for the first time. Body carries the **Can see / Never sees**
pair from the Connectors detail page — the same two-card treatment, `ok`
heading with check bullets against `bad` heading with x bullets.

Both columns come from `connectorFacts.ts`'s existing `canSee(capabilities)`
and `neverSees(capabilities)`, which derive from the capabilities the connector
actually declared in its handshake rather than from static per-kind copy. This
matters more at approval time than it does on the detail page: the user is told
what *this* request is asking for, so a connector requesting more than its kind
normally does is visibly different from one that is not. Generic copy would
hide exactly the case worth catching.

Footer carries the queue counter on the left and Deny / Approve on the right.

### Safety behaviour

Three properties, each deliberate:

1. **Initial focus lands on Deny.** The affirmative-trust action is never the
   default. A user who hits Return without reading has denied something
   recoverable rather than approved something that is not.
2. **Escape dismisses without deciding.** The request stays pending and remains
   visible on the Connectors view. Escape meaning "deny" would let a stray
   keypress permanently reject a connector the user wanted, with no undo.
3. **Keystrokes are ignored for 350ms after the sheet appears.** A Return
   already in flight when a pairing request arrives cannot land on Approve. The
   sheet's own buttons are disabled for that window; the delay is not
   configurable and not skippable.

### Queueing

Multiple pending requests show one sheet at a time, in arrival order, with
"1 of 2" in the footer. Deciding one advances to the next without closing and
reopening the layer.

### Accent budget

The Approve button is an accent action, and `expectAtMostOneAccent`
(`src/test/accent.ts`) allows one per screen. The sheet is a modal layer over
the page, so its accent and the page's coexist. The accent test needs to scope
its assertion per layer rather than per render tree; that scoping change is part
of this work.

## Motion and loading

### Skeletons

`Skeleton` moves from `animate-pulse` to a single-pass shimmer — one
translucent highlight travelling left to right over 1.4s. Under reduced motion
it renders as a static tint with no animation at all, not a slowed one.

Skeletons take the geometry of the content they stand in for. `OverviewPage`
already does this; `ProjectsPage`, `ConnectorsPage`, `ActivityPage` and
`ArchivedProjectsDialog` currently show generic bars and are brought in line.

### The restore ceremony

- The `Loader2` spinner is replaced by the handoff's live-state dot: 2.2s ping,
  `cubic-bezier(0,0,.2,1)`, scale 1 → 2.4 fading out. Same motion the connector
  detail uses for "connected", so "working" looks like one thing across the app.
- `applied` gets a draw-on checkmark via `stroke-dashoffset`.
- `skipped` and `failed` settle without overshoot — a failure should not bounce.
- The existing per-row stagger and `RESTORE_SHEET_EASE` stay; they are correct.

### Token consolidation

`src/lib/motion.ts` becomes the single source for duration and easing. Tailwind
config reads from it rather than restating values. The inline `cubic-bezier`
and millisecond literals currently spread across `Toolbar.tsx`,
`sidebarMotion.ts`, `titlebar.ts` and `RestoreExperience.tsx` collapse to named
tokens. No behaviour change — this is so the next animation cannot invent a
fifth easing curve.

### Micro-interactions

Restrained, and all of them transform/opacity only, ≤200ms, reduced-motion
gated:

- Row press feedback, matching the existing button `active:scale-[0.98]`.
- Nav row icon settle when a section becomes selected.
- Sidebar counts transition rather than snapping when they change.
- Toolbar contextual action cross-fades when the view changes, instead of
  swapping instantly.
- First-paint stagger on master lists, reusing the restore row stagger timing.

Nothing here is load-bearing. Every one of them is removable without changing
what the app can do, which is the test for whether a micro-interaction has
overstepped.

### Guard

A test asserting that any element carrying a transition or animation class has
a reduced-motion path. This is the mechanism that keeps the next phase from
regressing what this one fixes.

## Accessibility

### Current state, measured

- **One `aria-live` region in the application.** Capture completion, restore
  progress, connector connect and disconnect, and pairing requests announce
  nothing to a screen reader.
- **`Row` is a bare `<div>`** — no role, no `tabIndex`, no key handling. None of
  the four master lists respond to arrow keys. `Segmented` and `Swatch` are the
  only components in the app with roving focus.
- **Contrast is unverified.** The disabled chevrons at 40% opacity and
  `text-tertiary-foreground` are the likeliest AA failures, in both themes.
- Focus-visible rings exist on the primitives but not on rows.

### Master lists become listboxes

The largest single win, because it is what makes the app keyboard-drivable end
to end rather than keyboard-drivable up to the point where you need to pick
something.

One `useListNavigation` hook, consumed by Capsules, Projects, Connectors and
Activity, providing:

- `role="listbox"` on the container, `role="option"` on rows, `aria-selected`
  tracking the store's selected id.
- Roving `tabIndex` — one row in the tab order, arrows move within.
- ↑ ↓ move, Home / End jump, type-ahead matches on the row's title.
- A visible focus ring on the focused row, distinct from the selected tint.

All four lists behave identically because they share one implementation.

### Announcements

A single `announce(message, { assertive })` helper backed by two live regions
mounted once in `App.tsx` — polite for status, assertive for pairing requests.
Routed through one function so announcements stay auditable rather than
scattered as ad-hoc `aria-live` attributes.

Wired to: capture completion, restore start and completion with its partial
result, connector connect and disconnect, and an incoming pairing request.

### Focus management

- Sheets and dialogs trap focus and restore it to the invoking element on close.
  `sheet.tsx` is audited for this; `MigrateSheet` and the new pairing sheet both
  depend on it.
- The pairing sheet's initial focus is Deny, per the safety behaviour above.
- A skip link to main content, visible on focus.

### Landmarks and structure

`<nav>` for the sidebar, `<main>` for the page region, `<aside>` for detail
panes. One `<h1>` per view — the Toolbar already owns it. Heading order verified
per view.

### Contrast

Every foreground/background token pair audited against WCAG AA — 4.5:1 for body
text, 3:1 for UI and large text — in both themes and across all four accents.
Failures are fixed by adjusting the token, not by exempting the usage.

A test computes contrast ratios directly from the token values and fails below
threshold, so a future token change cannot quietly regress it.

### Reduced transparency

`prefers-reduced-transparency` is honoured on the `backdrop-blur` surfaces —
Toolbar, status bar, sheet scrims — falling back to opaque equivalents.

## Testing

Extends the existing vitest suites; no new framework.

- **History**: push/replace semantics, the 50-entry cap, forward truncation on a
  new navigation, that `goBack`/`goForward` do not themselves push, and that
  chevron enablement tracks `canGoBack`/`canGoForward`.
- **Pairing sheet**: initial focus is Deny; Escape leaves the request pending;
  buttons are inert for 350ms after mount; the queue advances in arrival order;
  the Connectors view still suppresses its own card correctly.
- **Motion**: the reduced-motion guard test described above; shimmer renders
  static under `prefers-reduced-motion`.
- **Lists**: one shared suite run against all four master lists asserting
  identical keyboard behaviour, roles, and `aria-selected` tracking.
- **Contrast**: token-derived ratio assertions, both themes, all four accents.
- **Accessible names**: every interactive element has one; no positive
  `tabIndex` anywhere.

## Out of scope

Deferred to the specs that follow this one:

- The website rebuild, socials and launch readiness.
- The security audit and its written report.

Deferred beyond both, and named here so they are not mistaken for oversights:

- The **restore report** and **capture confirmation** — the handoff's gaps 1 and
  2. Both are new product surfaces rather than polish on existing ones, and both
  deserve their own design. This phase gives capture and restore *announcements*
  and correct loading states; it does not build the report.
- History persistence across launches, swipe-back, and a long-press history
  menu.
- VoiceOver rotor customisation and any macOS-native accessibility API work
  beyond what the web layer exposes.
