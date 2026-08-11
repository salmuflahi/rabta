# Console v2 Phase 4 — Polish, Motion and Trust Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the back/forward chevrons navigate, replace the layout-shifting pairing banner with an informed approval sheet, give loading one motion vocabulary, and make the app keyboard-drivable and screen-reader-legible end to end.

**Architecture:** Four independent tracks over the existing Tauri + React + Zustand desktop app. Navigation history is a pure reducer in a new `src/shell/history.ts` consumed by the store. The pairing sheet reuses the Migrate `Sheet` primitive, extended with two props. Motion consolidates onto `src/lib/motion.ts` as the single source that `tailwind.config.js` reads from. Accessibility centres on one `useListNavigation` hook shared by all four master lists and one `announce()` helper backing two live regions.

**Tech Stack:** React 18, TypeScript, Zustand 5, Tailwind 3, Radix UI, vitest 2 + @testing-library/react, happy-dom.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-10-console-v2-phase-4-polish-design.md`. Read it before starting.
- **Test runner**, from the repo root. All tests are colocated beside the source as `*.test.ts(x)`.
  - Targeted: `pnpm --filter desktop exec vitest run <path>`
  - Full suite: `pnpm --filter desktop test`
  - **Never** use the `pnpm --filter desktop test -- <path>` form: pnpm inserts an extra `--`, vitest ignores the path, and the entire suite runs while appearing to be filtered. A green result from it says nothing about the file you meant to test.
- **Render helper:** `renderWithProviders` from `@/test/smoke-utils` — never bare `render`, the theme provider is required.
- **Store in tests:** `useStore.setState({ ... })` before render. Reset state between tests where it matters.
- **Motion rules:** transform/opacity only, never layout properties. Every animation has a `prefers-reduced-motion` path. Reduced motion means *no* animation, not a slower one.
- **Icon names** come from the closed `IconName` union in `src/components/ui/icon.tsx`. A name not in that union is a type error. Available: `overview capsule projects connectors activity settings shield search plus minus check x chevron-down chevron-up chevron-right chevron-left sidebar-on sidebar-off play capture ellipsis lock code globe terminal branch database folder-open archive appearance keyboard wifi alert check-circle circle`.
- **Accent budget:** `expectAtMostOneAccent` (`src/test/accent.ts`) allows one accent per screen. Task 5 rescopes it per layer.
- **Commit style:** lowercase conventional prefix, imperative, no trailing period. End every commit message body with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Never** force-push, rebase, or amend a commit that is already pushed.

---

## File Structure

**Created:**
- `src/shell/history.ts` — pure navigation-history reducer. No React, no store import at runtime (types only).
- `src/shell/history.test.ts`
- `src/features/pairing/PairingSheet.tsx` — the approval sheet.
- `src/features/pairing/PairingSheet.test.tsx`
- `src/lib/announce.ts` — live-region helper.
- `src/lib/announce.test.ts`
- `src/components/ui/live-region.tsx` — the two mounted regions.
- `src/lib/useListNavigation.ts` — roving-focus/listbox hook.
- `src/lib/useListNavigation.test.tsx`
- `src/theme/contrast.ts` — WCAG ratio maths.
- `src/theme/contrast.test.ts`
- `src/test/motion-guard.test.tsx` — every animation has a reduced-motion path.
- `src/test/a11y-guard.test.tsx` — accessible names, no positive tabIndex.

**Modified:**
- `src/store.ts` — history state and actions; `navigate` wiring on `setView`/`select*`.
- `src/shell/Toolbar.tsx` — `HistoryChevrons` becomes live.
- `src/App.tsx` — `⌘[`/`⌘]`; banner removed; `PairingSheet` and `LiveRegion` mounted.
- `src/components/ui/sheet.tsx` — `enterAdvances` and `secondary` props.
- `src/components/ui/skeleton.tsx` — shimmer.
- `src/restore/RestoreExperience.tsx` — live dot, draw-on check.
- `src/lib/motion.ts` — becomes the single motion source.
- `tailwind.config.js` — reads motion tokens from `motion.ts`.
- `src/pages/{Capsules,Projects,Connectors,Activity}Page.tsx` — listbox roles + skeleton geometry.
- `src/components/ui/row.tsx` — optional interactive role.
- `src/test/accent.ts` — per-layer scoping.
- `src/index.css` — reduced transparency, skip link.

---

### Task 1: Navigation history reducer

**Files:**
- Create: `apps/desktop/src/shell/history.ts`
- Test: `apps/desktop/src/shell/history.test.ts`

**Interfaces:**
- Consumes: `NavKey` (type-only) from `@/store`.
- Produces: `interface Location { view: NavKey; selection: string | number | null }`, `HISTORY_LIMIT = 50`, `pushLocation(history: Location[], index: number, next: Location): { history: Location[]; index: number }`.

Pure functions only — no store, no React. Task 2 consumes this.

- [ ] **Step 1: Write the failing test**

```ts
// apps/desktop/src/shell/history.test.ts
import { describe, expect, it } from "vitest";
import { HISTORY_LIMIT, pushLocation, type Location } from "./history";

const at = (view: Location["view"], selection: Location["selection"] = null): Location => ({
  view,
  selection,
});

describe("pushLocation", () => {
  it("pushes a new entry when the view changes", () => {
    const start = { history: [at("overview")], index: 0 };
    const next = pushLocation(start.history, start.index, at("capsules"));
    expect(next.history).toEqual([at("overview"), at("capsules")]);
    expect(next.index).toBe(1);
  });

  // The rule that makes Back usable: arrow-keying down a 40-row list must
  // not create 40 entries, but Back from another view must still land on
  // the row you were reading.
  it("rewrites in place when only the selection changes", () => {
    const start = { history: [at("overview"), at("capsules", "a")], index: 1 };
    const next = pushLocation(start.history, start.index, at("capsules", "b"));
    expect(next.history).toEqual([at("overview"), at("capsules", "b")]);
    expect(next.index).toBe(1);
  });

  it("discards forward entries on a new navigation", () => {
    const start = { history: [at("overview"), at("capsules"), at("projects")], index: 0 };
    const next = pushLocation(start.history, start.index, at("activity"));
    expect(next.history).toEqual([at("overview"), at("activity")]);
    expect(next.index).toBe(1);
  });

  it("drops the oldest entry past the cap and keeps the index on the newest", () => {
    const history: Location[] = [];
    let index = -1;
    // Alternate views so every step pushes rather than rewrites.
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) {
      const result = pushLocation(history, index, at(i % 2 ? "capsules" : "projects", i));
      history.length = 0;
      history.push(...result.history);
      index = result.index;
    }
    expect(history).toHaveLength(HISTORY_LIMIT);
    expect(index).toBe(HISTORY_LIMIT - 1);
    expect(history[index].selection).toBe(HISTORY_LIMIT + 9);
  });

  it("treats an empty history as a first visit", () => {
    const next = pushLocation([], -1, at("overview"));
    expect(next.history).toEqual([at("overview")]);
    expect(next.index).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter desktop exec vitest run src/shell/history.test.ts`
Expected: FAIL — `Failed to resolve import "./history"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/desktop/src/shell/history.ts
import type { NavKey } from "@/store";

/**
 * A place in the app: which view, and what was selected inside it.
 *
 * `selection` is the per-view selected id already held in the store —
 * `selectedCapsuleId`, `selectedProjectId`, `selectedConnectorId`,
 * `selectedEventSeq` (a number), or `settingsSection`. Overview has no
 * selection and always carries `null`.
 */
export interface Location {
  view: NavKey;
  selection: string | number | null;
}

/** Entries kept before the oldest is dropped. Session-scoped; history is
 * never persisted across launches. */
export const HISTORY_LIMIT = 50;

/**
 * Push a location, applying the replace-in-place rule.
 *
 * A change of *view* pushes a new entry. A change of *selection* inside the
 * current view rewrites the current entry instead — otherwise arrow-keying
 * down a long list would fill history with near-identical entries and make
 * Back useless. Rewriting still preserves the useful case: Back from another
 * view returns to the row you were last reading, not to a bare list.
 *
 * Forward entries are always discarded, as in a browser. Past the cap the
 * oldest entries are dropped and the index is rebased so it still points at
 * the newest entry.
 */
export function pushLocation(
  history: Location[],
  index: number,
  next: Location,
): { history: Location[]; index: number } {
  const current = index >= 0 ? history[index] : undefined;

  if (current && current.view === next.view) {
    const rewritten = history.slice(0, index + 1);
    rewritten[index] = next;
    return { history: rewritten, index };
  }

  const truncated = history.slice(0, index + 1);
  truncated.push(next);

  if (truncated.length > HISTORY_LIMIT) {
    const dropped = truncated.length - HISTORY_LIMIT;
    const capped = truncated.slice(dropped);
    return { history: capped, index: capped.length - 1 };
  }

  return { history: truncated, index: truncated.length - 1 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter desktop exec vitest run src/shell/history.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/shell/history.ts apps/desktop/src/shell/history.test.ts
git commit -m "feat(desktop): the navigation-history reducer

A location is {view, selection}. View changes push; selection changes
inside a view rewrite in place, so browsing a list stays cheap while Back
still returns to the row you were reading.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Wire history into the store

**Files:**
- Modify: `apps/desktop/src/store.ts`
- Test: `apps/desktop/src/store.test.ts` (append a `describe` block)

**Interfaces:**
- Consumes: `pushLocation`, `Location`, `HISTORY_LIMIT` from Task 1.
- Produces: store fields `history: Location[]`, `historyIndex: number`, and actions `goBack(): void`, `goForward(): void`. `setView` and every `select*` action now record history.

The critical invariant: `goBack`/`goForward` apply a location **without** recording it, or moving through history would rewrite history.

- [ ] **Step 1: Write the failing test**

```ts
// append to apps/desktop/src/store.test.ts
import { HISTORY_LIMIT } from "./shell/history";

describe("navigation history", () => {
  beforeEach(() => {
    useStore.setState({
      view: "overview",
      history: [{ view: "overview", selection: null }],
      historyIndex: 0,
      selectedCapsuleId: null,
      selectedProjectId: null,
    });
  });

  it("records a view change", () => {
    useStore.getState().setView("capsules");
    const s = useStore.getState();
    expect(s.history).toHaveLength(2);
    expect(s.historyIndex).toBe(1);
  });

  it("goes back to the previous view", () => {
    useStore.getState().setView("capsules");
    useStore.getState().goBack();
    expect(useStore.getState().view).toBe("overview");
    expect(useStore.getState().historyIndex).toBe(0);
  });

  // The invariant: moving through history must not itself write history.
  it("does not record the act of going back", () => {
    useStore.getState().setView("capsules");
    const before = useStore.getState().history.length;
    useStore.getState().goBack();
    expect(useStore.getState().history).toHaveLength(before);
  });

  it("restores the selection that was live in the view being returned to", () => {
    useStore.getState().setView("capsules");
    useStore.getState().selectCapsule("task-7");
    useStore.getState().setView("projects");
    useStore.getState().goBack();
    expect(useStore.getState().view).toBe("capsules");
    expect(useStore.getState().selectedCapsuleId).toBe("task-7");
  });

  it("goes forward again after going back", () => {
    useStore.getState().setView("capsules");
    useStore.getState().goBack();
    useStore.getState().goForward();
    expect(useStore.getState().view).toBe("capsules");
  });

  it("ignores goBack at the start and goForward at the end", () => {
    useStore.getState().goBack();
    expect(useStore.getState().view).toBe("overview");
    expect(useStore.getState().historyIndex).toBe(0);
    useStore.getState().goForward();
    expect(useStore.getState().historyIndex).toBe(0);
  });

  it("never grows past the cap", () => {
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
      useStore.getState().setView(i % 2 ? "capsules" : "projects");
    }
    expect(useStore.getState().history.length).toBeLessThanOrEqual(HISTORY_LIMIT);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter desktop exec vitest run src/store.test.ts`
Expected: FAIL — `goBack is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add near the other imports in `src/store.ts`:

```ts
import { pushLocation, type Location } from "./shell/history";
```

Add to the store's state interface, beside `view`/`setView`:

```ts
  /** Session-scoped navigation history. Never persisted — a relaunch starts
   * at the landing page with an empty past. */
  history: Location[];
  historyIndex: number;
  goBack: () => void;
  goForward: () => void;
```

Add these module-level helpers above `create<State>`:

```ts
/** The selected id that belongs to a view. Overview has none. */
function selectionFor(s: State, view: NavKey): Location["selection"] {
  switch (view) {
    case "capsules":
      return s.selectedCapsuleId;
    case "projects":
      return s.selectedProjectId;
    case "connectors":
      return s.selectedConnectorId;
    case "activity":
      return s.selectedEventSeq;
    case "settings":
      return s.settingsSection;
    case "overview":
      return null;
    default: {
      const _exhaustive: never = view;
      return _exhaustive;
    }
  }
}

/** The state patch that puts the app *at* a location. Used only by
 * goBack/goForward — it deliberately does not touch history, because
 * travelling through history must never rewrite it. */
function applyLocation(loc: Location): Partial<State> {
  switch (loc.view) {
    case "capsules":
      return { view: loc.view, selectedCapsuleId: loc.selection as string | null };
    case "projects":
      return { view: loc.view, selectedProjectId: loc.selection as string | null };
    case "connectors":
      return { view: loc.view, selectedConnectorId: loc.selection as string | null };
    case "activity":
      return { view: loc.view, selectedEventSeq: loc.selection as number | null };
    case "settings":
      return { view: loc.view, settingsSection: (loc.selection as string) ?? "general" };
    case "overview":
      return { view: loc.view };
    default: {
      const _exhaustive: never = loc.view;
      return _exhaustive;
    }
  }
}

/** Record where we now are. Called after any state change that moves the
 * user — a view switch, or a selection inside the current view. */
function record(s: State, view: NavKey, selection: Location["selection"]): Partial<State> {
  const { history, index } = pushLocation(s.history, s.historyIndex, { view, selection });
  return { history, historyIndex: index };
}
```

Replace `setView` and each `select*` action:

```ts
  history: [{ view: INITIAL_PREFS.landingPage, selection: null }],
  historyIndex: 0,

  setView: (view) =>
    set((s) => ({ view, ...record(s, view, selectionFor(s, view)) })),

  goBack: () =>
    set((s) => {
      if (s.historyIndex <= 0) return {};
      const index = s.historyIndex - 1;
      return { ...applyLocation(s.history[index]), historyIndex: index };
    }),

  goForward: () =>
    set((s) => {
      if (s.historyIndex >= s.history.length - 1) return {};
      const index = s.historyIndex + 1;
      return { ...applyLocation(s.history[index]), historyIndex: index };
    }),

  // Each select* records under the view that OWNS its id — a literal, never
  // `s.view`. This is load-bearing, not stylistic: three shipped call sites
  // select *before* navigating (ProjectsPage's per-project capsule list,
  // OverviewPage's openInCapsules, and four CommandPalette rows all do
  // `selectCapsule(id)` then `setView("capsules")`). Recording under `s.view`
  // there pairs the live view with an id belonging to another view, and since
  // pushLocation decides push-vs-rewrite on view equality, it would always
  // rewrite — silently clobbering the current entry's real selection. Back
  // would then restore a capsule id into `selectedProjectId`, and every
  // consumer's stale-id fallback would quietly land on its first row instead.
  selectedCapsuleId: null,
  selectCapsule: (selectedCapsuleId) =>
    set((s) => ({ selectedCapsuleId, ...record(s, "capsules", selectedCapsuleId) })),
  selectedProjectId: null,
  selectProject: (selectedProjectId) =>
    set((s) => ({ selectedProjectId, ...record(s, "projects", selectedProjectId) })),
  selectedConnectorId: null,
  selectConnector: (selectedConnectorId) =>
    set((s) => ({ selectedConnectorId, ...record(s, "connectors", selectedConnectorId) })),
  selectedEventSeq: null,
  selectEvent: (selectedEventSeq) =>
    set((s) => ({ selectedEventSeq, ...record(s, "activity", selectedEventSeq) })),
```

Add a test for the **pre-staged** call order alongside the brief's round-trip test — `selectCapsule(id)` *then* `setView("capsules")`, asserting the outgoing view's own selection survived. The brief's original test only covered selecting after arriving, which is why this defect shipped.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter desktop exec vitest run src/store.test.ts`
Expected: PASS. Then run the whole suite — `setView` is used everywhere:
Run: `pnpm --filter desktop test`
Expected: PASS. If a page test now fails because history state is missing from a `setState` call, add `history: [{ view: <that view>, selection: null }], historyIndex: 0` to it.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/store.ts apps/desktop/src/store.test.ts
git commit -m "feat(desktop): record navigation history in the store

setView and the four select actions record; goBack/goForward apply a
location without recording, so travelling through history cannot rewrite
it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: The chevrons become live

**Files:**
- Modify: `apps/desktop/src/shell/Toolbar.tsx:47-75` (`HistoryChevrons`)
- Modify: `apps/desktop/src/App.tsx` (keyboard handler around line 184)
- Test: `apps/desktop/src/shell/Toolbar.test.tsx` (append)

**Interfaces:**
- Consumes: `history`, `historyIndex`, `goBack`, `goForward` from Task 2; `NAV_ITEMS`/`SETTINGS_ITEM` from `./nav`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

```tsx
// append to apps/desktop/src/shell/Toolbar.test.tsx
describe("history chevrons", () => {
  it("disables back with nothing behind us", () => {
    useStore.setState({
      view: "overview",
      history: [{ view: "overview", selection: null }],
      historyIndex: 0,
    });
    renderWithProviders(<Toolbar />);
    expect(screen.getByRole("button", { name: /^Back$/ })).toBeDisabled();
  });

  // The label names where you are going, not just "Back" — the whole reason
  // to make these live is that the user can tell what they do.
  it("names the destination once there is one", () => {
    useStore.setState({
      view: "projects",
      history: [
        { view: "capsules", selection: null },
        { view: "projects", selection: null },
      ],
      historyIndex: 1,
    });
    renderWithProviders(<Toolbar />);
    expect(screen.getByRole("button", { name: "Back to Capsules" })).toBeEnabled();
  });

  it("goes back on click", () => {
    useStore.setState({
      view: "projects",
      history: [
        { view: "capsules", selection: null },
        { view: "projects", selection: null },
      ],
      historyIndex: 1,
    });
    renderWithProviders(<Toolbar />);
    fireEvent.click(screen.getByRole("button", { name: "Back to Capsules" }));
    expect(useStore.getState().view).toBe("capsules");
  });

  it("enables forward only after going back", () => {
    useStore.setState({
      view: "projects",
      history: [
        { view: "capsules", selection: null },
        { view: "projects", selection: null },
      ],
      historyIndex: 1,
    });
    renderWithProviders(<Toolbar />);
    expect(screen.getByRole("button", { name: /^Forward$/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Back to Capsules" }));
    expect(screen.getByRole("button", { name: "Forward to Projects" })).toBeEnabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter desktop exec vitest run src/shell/Toolbar.test.tsx`
Expected: FAIL — `Unable to find role="button" with name "Back to Capsules"` (the current label is the bare "Back").

- [ ] **Step 3: Write minimal implementation**

Replace `HistoryChevrons` in `src/shell/Toolbar.tsx`:

```tsx
/** Browser-style back/forward, now live against the store's navigation
 * history (src/shell/history.ts).
 *
 * DELIBERATE DIVERGENCE from the handoff, which specifies both as dead
 * chrome ("back is disabled at 50% opacity") and wires neither to a
 * handler. A permanently disabled control in a shipping app reads as broken
 * software rather than as restraint — so these navigate. The handoff's
 * rendered `opacity:.4` is kept for the genuinely-disabled state, where it
 * now means "nothing behind you" rather than "not built".
 *
 * Labels name the destination because that is the whole point of making
 * them live: "Back to Capsules" tells you what will happen, "Back" does
 * not. */
function HistoryChevrons() {
  const history = useStore((s) => s.history);
  const historyIndex = useStore((s) => s.historyIndex);
  const goBack = useStore((s) => s.goBack);
  const goForward = useStore((s) => s.goForward);

  const back = historyIndex > 0 ? history[historyIndex - 1] : undefined;
  const forward = historyIndex < history.length - 1 ? history[historyIndex + 1] : undefined;

  const label = (dir: "Back" | "Forward", loc: { view: NavKey } | undefined) =>
    loc
      ? `${dir} to ${[...NAV_ITEMS, SETTINGS_ITEM].find((i) => i.key === loc.view)?.label ?? NAV_ITEMS[0].label}`
      : dir;

  return (
    <div className="ml-0.5 flex shrink-0 items-center overflow-hidden rounded-md bg-secondary shadow-[0_0_0_0.5px_hsl(var(--border))]">
      <button
        type="button"
        disabled={!back}
        onClick={goBack}
        aria-label={label("Back", back)}
        title={label("Back", back)}
        className="grid h-[22px] w-[27px] place-items-center text-tertiary-foreground transition-opacity duration-fast ease-standard hover:text-foreground disabled:opacity-40 disabled:hover:text-tertiary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon name="chevron-left" className="size-3" />
      </button>
      <span aria-hidden className="h-[13px] w-px shrink-0 bg-border" />
      <button
        type="button"
        disabled={!forward}
        onClick={goForward}
        aria-label={label("Forward", forward)}
        title={label("Forward", forward)}
        className="grid h-[22px] w-[27px] place-items-center text-muted-foreground transition-opacity duration-fast ease-standard hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon name="chevron-right" className="size-3" />
      </button>
    </div>
  );
}
```

In `src/App.tsx`, inside the existing `onKeyDown` handler, alongside the other `metaKey` shortcuts:

```ts
      // ⌘[ / ⌘] — the macOS standard back/forward binding, matching the
      // toolbar chevrons.
      if (e.metaKey && !e.shiftKey && e.key === "[") {
        e.preventDefault();
        useStore.getState().goBack();
        return;
      }
      if (e.metaKey && !e.shiftKey && e.key === "]") {
        e.preventDefault();
        useStore.getState().goForward();
        return;
      }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter desktop exec vitest run src/shell/Toolbar.test.tsx src/App.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/shell/Toolbar.tsx apps/desktop/src/shell/Toolbar.test.tsx apps/desktop/src/App.tsx
git commit -m "feat(desktop): the toolbar chevrons navigate

A deliberate divergence from the handoff, which specifies both as dead
chrome. Labels name the destination, and cmd-[ / cmd-] bind to the same
actions.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Sheet gains `enterAdvances` and `secondary`

**Files:**
- Modify: `apps/desktop/src/components/ui/sheet.tsx`
- Test: `apps/desktop/src/components/ui/sheet.test.tsx` (append)

**Interfaces:**
- Produces: two new optional `SheetProps` fields consumed by Task 5:
  - `enterAdvances?: boolean` — default `true`. When `false`, Enter is swallowed and fires nothing.
  - `secondary?: { label: string; onClick: () => void; tone?: "bad"; disabled?: boolean } | null` — a third footer button, rendered between Cancel and the primary. `disabled` exists because Task 5 holds *both* decisions inert during the arm delay, not just the primary.

This exists because the pairing sheet must not let Enter approve a connector, and needs a Deny button that is neither Cancel nor the primary.

- [ ] **Step 1: Write the failing test**

```tsx
// append to apps/desktop/src/components/ui/sheet.test.tsx
describe("enterAdvances", () => {
  it("fires the primary on Enter by default", () => {
    const onPrimary = vi.fn();
    renderWithProviders(
      <Sheet open onOpenChange={() => {}} title="T" primary={{ label: "Go", onClick: onPrimary }}>
        body
      </Sheet>,
    );
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onPrimary).toHaveBeenCalled();
  });

  // The pairing sheet's core safety property: a security decision must never
  // be reachable by a keypress that was already in flight.
  it("fires nothing on Enter when enterAdvances is false", () => {
    const onPrimary = vi.fn();
    renderWithProviders(
      <Sheet
        open
        onOpenChange={() => {}}
        title="T"
        enterAdvances={false}
        primary={{ label: "Approve", onClick: onPrimary }}
      >
        body
      </Sheet>,
    );
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onPrimary).not.toHaveBeenCalled();
  });
});

describe("secondary action", () => {
  it("renders and fires a secondary button", () => {
    const onSecondary = vi.fn();
    renderWithProviders(
      <Sheet
        open
        onOpenChange={() => {}}
        title="T"
        secondary={{ label: "Deny", onClick: onSecondary, tone: "bad" }}
        primary={{ label: "Approve", onClick: () => {} }}
      >
        body
      </Sheet>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Deny" }));
    expect(onSecondary).toHaveBeenCalled();
  });

  it("renders no secondary when not given one", () => {
    renderWithProviders(
      <Sheet open onOpenChange={() => {}} title="T" primary={{ label: "Go", onClick: () => {} }}>
        body
      </Sheet>,
    );
    expect(screen.queryByRole("button", { name: "Deny" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter desktop exec vitest run src/components/ui/sheet.test.tsx`
Expected: FAIL — TypeScript rejects `enterAdvances` / `secondary` as unknown props, and the Deny button is not found.

- [ ] **Step 3: Write minimal implementation**

In `SheetProps`, after `primary`:

```ts
  /** A third footer button between Cancel and the primary. `tone: "bad"`
   * colours it as a destructive/negative choice (Deny, Disconnect).
   * `disabled` exists because the pairing sheet holds *both* decisions
   * inert while it arms — not just the affirmative one. */
  secondary?: { label: string; onClick: () => void; tone?: "bad"; disabled?: boolean } | null;
  /** Whether Enter fires the primary action. Default `true`, per the
   * handoff's "enter advances".
   *
   * The pairing sheet sets this `false`: approving a connector is a security
   * decision, and an Enter keypress already in flight when the sheet appears
   * must not be able to make it. With this off, Enter is still swallowed —
   * no global shortcut fires — it simply does nothing. */
  enterAdvances?: boolean;
```

Add to the destructured params: `secondary, enterAdvances = true,`.

In the `Enter` branch of `onKeyDown`, guard the action:

```ts
      if (event.key === "Enter") {
        const el = document.activeElement;
        const ownsEnter =
          el instanceof HTMLTextAreaElement ||
          el instanceof HTMLButtonElement ||
          el instanceof HTMLAnchorElement;
        if (enterAdvances && !ownsEnter) {
          const action = primaryRef.current;
          if (action && !action.disabled) {
            event.preventDefault();
            action.onClick();
          }
        }
        event.stopPropagation();
        return;
      }
```

Add `enterAdvances` to that effect's dependency array: `}, [open, enterAdvances]);`

In the footer, between the Back button and the primary:

```tsx
            {secondary && (
              <Button
                variant="secondary"
                size="sm"
                className={cn(
                  "h-7 rounded-[7px] px-3 text-body",
                  secondary.tone === "bad" && "text-bad hover:text-bad",
                )}
                disabled={secondary.disabled}
                onClick={secondary.onClick}
              >
                {secondary.label}
              </Button>
            )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter desktop exec vitest run src/components/ui/sheet.test.tsx src/features/migrate/MigrateSheet.test.tsx`
Expected: PASS. Migrate must be unaffected — it passes neither new prop and gets the old behaviour by default.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/ui/sheet.tsx apps/desktop/src/components/ui/sheet.test.tsx
git commit -m "feat(desktop): sheet gains a secondary action and an Enter opt-out

Both exist for the pairing sheet: it needs a Deny that is neither Cancel
nor the primary, and it must not let an in-flight Enter approve a
connector. Migrate keeps the old behaviour by default.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: The pairing approval sheet

**Files:**
- Create: `apps/desktop/src/features/pairing/PairingSheet.tsx`
- Test: `apps/desktop/src/features/pairing/PairingSheet.test.tsx`

**Interfaces:**
- Consumes: `Sheet` with Task 4's props; `canSee(capabilities: string[]): string[]` and `neverSees(capabilities: string[]): string[]` from `@/lib/connectorFacts`; `PendingPairing { pairingId, name, kind }` and `pairings`/`removePairing` from `@/store`; `decidePairing(pairing, ok, removePairing)` from `@/lib/pairing`.
- Produces: `<PairingSheet />`, mounted once in `App.tsx` by Task 6. `export const ARM_DELAY_MS = 350`.

`PendingPairing` carries no `capabilities` field today. Pass `[]` when absent and let `canSee`/`neverSees` return their capability-independent baseline — `neverSees` always includes "Passwords, tokens or keychain items", so the Never sees column is never empty.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/desktop/src/features/pairing/PairingSheet.test.tsx
import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ARM_DELAY_MS, PairingSheet } from "./PairingSheet";
import { useStore } from "@/store";
import { renderWithProviders } from "@/test/smoke-utils";

const chrome = { pairingId: "p1", name: "Chrome", kind: "browser" };
const cursor = { pairingId: "p2", name: "Cursor", kind: "editor" };

describe("PairingSheet", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    useStore.setState({ pairings: [] });
  });

  const arm = () => act(() => void vi.advanceTimersByTime(ARM_DELAY_MS + 10));

  it("shows nothing with no pending request", () => {
    renderWithProviders(<PairingSheet />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("names the connector asking", () => {
    useStore.setState({ pairings: [chrome] });
    renderWithProviders(<PairingSheet />);
    expect(screen.getByText(/Chrome/)).toBeInTheDocument();
  });

  // The reason this is a sheet and not a banner: consent needs to state what
  // is being consented to.
  it("states what the connector can and cannot see", () => {
    useStore.setState({ pairings: [chrome] });
    renderWithProviders(<PairingSheet />);
    expect(screen.getByText("Can see")).toBeInTheDocument();
    expect(screen.getByText("Never sees")).toBeInTheDocument();
    expect(screen.getByText("Passwords, tokens or keychain items")).toBeInTheDocument();
  });

  it("holds both decisions inert until armed", () => {
    useStore.setState({ pairings: [chrome] });
    renderWithProviders(<PairingSheet />);
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Deny" })).toBeDisabled();
    arm();
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Deny" })).toBeEnabled();
  });

  it("does not approve on Enter, even once armed", () => {
    useStore.setState({ pairings: [chrome] });
    renderWithProviders(<PairingSheet />);
    arm();
    fireEvent.keyDown(document, { key: "Enter" });
    expect(useStore.getState().pairings).toHaveLength(1);
  });

  it("counts the queue and advances through it", () => {
    useStore.setState({ pairings: [chrome, cursor] });
    renderWithProviders(<PairingSheet />);
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    expect(screen.getByText(/Chrome/)).toBeInTheDocument();
  });

  // Dismissing is not deciding. A stray Escape must not permanently reject a
  // connector the user wanted — the request stays pending on Connectors.
  it("keeps the request pending when dismissed without a decision", () => {
    useStore.setState({ pairings: [chrome] });
    renderWithProviders(<PairingSheet />);
    arm();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(useStore.getState().pairings).toHaveLength(1);
  });

  it("suppresses itself on the Connectors view, which has its own card", () => {
    useStore.setState({ pairings: [chrome], view: "connectors" });
    renderWithProviders(<PairingSheet />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter desktop exec vitest run src/features/pairing/PairingSheet.test.tsx`
Expected: FAIL — `Failed to resolve import "./PairingSheet"`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/desktop/src/features/pairing/PairingSheet.tsx
import * as React from "react";
import { Icon } from "@/components/ui/icon";
import { Sheet } from "@/components/ui/sheet";
import { canSee, neverSees } from "@/lib/connectorFacts";
import { decidePairing } from "@/lib/pairing";
import { useStore, type PendingPairing } from "@/store";

/**
 * How long both decisions stay inert after the sheet appears.
 *
 * A pairing request arrives unprompted — the user did not open this sheet,
 * it appeared over whatever they were doing. Without a delay, a Return or a
 * click already in flight lands on a button that was not there a frame ago.
 * Not configurable and not skippable: the whole point is that it cannot be
 * raced.
 */
export const ARM_DELAY_MS = 350;

function kindLabel(kind: string): string {
  if (kind === "browser") return "browser extension";
  if (kind === "editor") return "editor extension";
  return kind;
}

/** One of the two permission columns. `ok` for what it can see, `bad` for
 * what it structurally cannot — the same pairing the Connectors detail view
 * uses, so approving and inspecting later show the same two lists. */
function PermissionCard({
  tone,
  heading,
  lines,
}: {
  tone: "ok" | "bad";
  heading: string;
  lines: string[];
}) {
  return (
    <div className="min-w-0 flex-1 rounded-[9px] bg-secondary p-3">
      <div className={tone === "ok" ? "text-meta font-510 text-ok" : "text-meta font-510 text-bad"}>
        {heading}
      </div>
      <ul className="mt-2 space-y-1.5">
        {lines.map((line) => (
          <li key={line} className="flex gap-1.5 text-meta text-muted-foreground">
            <Icon
              name={tone === "ok" ? "check" : "x"}
              className={tone === "ok" ? "mt-0.5 size-3 shrink-0 text-ok" : "mt-0.5 size-3 shrink-0 text-bad"}
            />
            <span className="min-w-0">{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The moment a connector asks to talk to Rabta.
 *
 * This replaced a full-width banner rendered above the toolbar, which pushed
 * the whole application down every time a request arrived. It is a sheet
 * rather than a smaller floating banner for a reason beyond layout: this is
 * the one moment Rabta's promise — nothing leaves this Mac — is actually
 * tested by the user, and "Chrome wants to connect" with two buttons gives
 * them nothing to decide with. The Can see / Never sees pair is derived from
 * the capabilities *this* request declared, so a connector asking for more
 * than its kind normally does looks different from one that is not.
 *
 * Suppressed on the Connectors view, which shows its own in-context
 * PairingCard — otherwise the same request appears twice on one screen.
 */
export function PairingSheet() {
  const pairings = useStore((s) => s.pairings);
  const removePairing = useStore((s) => s.removePairing);
  const view = useStore((s) => s.view);
  const [dismissed, setDismissed] = React.useState<string[]>([]);

  const queue = pairings.filter((p) => !dismissed.includes(p.pairingId));
  const current: PendingPairing | undefined = view === "connectors" ? undefined : queue[0];

  const [armed, setArmed] = React.useState(false);
  React.useEffect(() => {
    if (!current) return;
    setArmed(false);
    const id = setTimeout(() => setArmed(true), ARM_DELAY_MS);
    return () => clearTimeout(id);
  }, [current?.pairingId]);

  if (!current) return null;

  // PendingPairing carries no capability list yet. canSee/neverSees tolerate
  // an empty one — neverSees always returns its baseline — so the Never sees
  // column is never empty even before the hub forwards capabilities.
  const capabilities: string[] = [];

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        // Closing without a decision leaves the request pending; it stays on
        // the Connectors view to be found again.
        if (!open) setDismissed((d) => [...d, current.pairingId]);
      }}
      title={`${current.name} wants to connect`}
      subtitle={`A ${kindLabel(current.kind)} on this Mac is asking to talk to Rabta. Nothing is shared until you approve it.`}
      cancelLabel="Not now"
      enterAdvances={false}
      secondary={{
        label: "Deny",
        tone: "bad",
        onClick: () => decidePairing(current, false, removePairing),
      }}
      primary={{
        label: "Approve",
        disabled: !armed,
        onClick: () => decidePairing(current, true, removePairing),
      }}
    >
      <div className="flex gap-2.5 pb-2">
        <PermissionCard tone="ok" heading="Can see" lines={canSee(capabilities)} />
        <PermissionCard tone="bad" heading="Never sees" lines={neverSees(capabilities)} />
      </div>
      <p className="flex items-center gap-1.5 pb-3 text-meta text-tertiary-foreground">
        <Icon name="lock" className="size-3 shrink-0" />
        Talks to Rabta on this Mac only — nothing leaves it.
      </p>
      {queue.length > 1 && (
        <p className="pb-2 text-meta tabular-nums text-tertiary-foreground">1 of {queue.length}</p>
      )}
    </Sheet>
  );
}
```

The `secondary` block above must also carry the arm gate — Task 4 already added `disabled` to the prop type for exactly this. Use both belts:

```ts
      secondary={{
        label: "Deny",
        tone: "bad",
        disabled: !armed,
        onClick: () => {
          // The handler guard is the real protection; `disabled` is what the
          // user and the test see. A disabled attribute alone can be defeated
          // by a synthetic click.
          if (!armed) return;
          decidePairing(current, false, removePairing);
        },
      }}
```

Apply the same handler guard to the primary's `onClick`, which currently relies on `disabled: !armed` alone.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter desktop exec vitest run src/features/pairing/PairingSheet.test.tsx`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/pairing apps/desktop/src/components/ui/sheet.tsx
git commit -m "feat(desktop): the pairing approval sheet

States what the connector can and cannot see, derived from the
capabilities this request declared. Both decisions are inert for 350ms so
an in-flight keypress cannot make one, Enter fires nothing, and dismissing
leaves the request pending rather than denying it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Retire the banner; rescope the accent budget

**Files:**
- Modify: `apps/desktop/src/App.tsx` (remove the banner block, mount `PairingSheet`)
- Modify: `apps/desktop/src/test/accent.ts`
- Test: `apps/desktop/src/App.test.tsx`, `apps/desktop/src/test/accent.test.tsx`

**Interfaces:**
- Consumes: `<PairingSheet />` from Task 5.
- Produces: `expectAtMostOneAccent` now counts accents per layer — page content and modal layers (`[data-sheet]`, `[role="dialog"]`) are budgeted separately.

- [ ] **Step 1: Write the failing test**

```tsx
// append to apps/desktop/src/App.test.tsx
it("no longer pushes the app down when a connector asks to pair", () => {
  useStore.setState({
    pairings: [{ pairingId: "p1", name: "Chrome", kind: "browser" }],
    view: "overview",
  });
  renderWithProviders(<App />);
  // The old banner was a sibling above the shell in the flex column. Nothing
  // may sit between the app root and the shell any more.
  expect(screen.queryByText(/wants to connect to Rabta/)).not.toBeInTheDocument();
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});
```

```tsx
// append to apps/desktop/src/test/accent.test.tsx
it("budgets a modal layer separately from the page beneath it", () => {
  const container = document.createElement("div");
  container.innerHTML = `
    <main><button class="bg-primary">Page accent</button></main>
    <div data-sheet><button class="bg-primary">Sheet accent</button></div>
  `;
  expect(() => expectAtMostOneAccent(container)).not.toThrow();
});

it("still rejects two accents inside one layer", () => {
  const container = document.createElement("div");
  container.innerHTML = `
    <main><button class="bg-primary">One</button><button class="bg-primary">Two</button></main>
  `;
  expect(() => expectAtMostOneAccent(container)).toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter desktop exec vitest run src/App.test.tsx src/test/accent.test.tsx`
Expected: FAIL — the banner text is still found, and the two-layer accent case throws.

- [ ] **Step 3: Write minimal implementation**

In `src/App.tsx`: delete the `{view !== "connectors" && pairings.map(...)}` block and the now-unused `decide` function, `kindLabel`, and the `pairings` / `Button` imports if nothing else uses them. Mount the sheet beside `MigrateSheet`:

```tsx
  return (
    <div className="flex h-screen min-w-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1">
        <MigrateSheet />
        <PairingSheet />
        <AppShell>
          <CurrentPage view={view} />
        </AppShell>
      </div>
      <CommandPalette />
    </div>
  );
```

In `src/test/accent.ts`, partition before counting:

```ts
/** Elements that establish their own accent budget. A modal layer sits
 * *over* the page rather than competing with it, so a sheet's one accent and
 * the page's one accent are not two accents on one screen. Introduced when
 * the pairing sheet's Approve button began overlaying pages that already
 * spend their own accent on Resume/Restore. */
const LAYER_SELECTOR = "[data-sheet], [role='dialog']";
```

Split the container's accent-bearing elements into those inside a layer (grouped by layer element) and those outside, then assert at most one per group. Keep the existing accent class list and failure message; only the partitioning is new.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter desktop test`
Expected: PASS across the whole suite.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/App.tsx apps/desktop/src/App.test.tsx apps/desktop/src/test/accent.ts apps/desktop/src/test/accent.test.tsx
git commit -m "feat(desktop): retire the pairing banner for the approval sheet

The banner rendered above the toolbar inside the shell's flex column, so
every pending request pushed the whole app down. The accent budget now
counts per layer, since a sheet's accent overlays the page's rather than
competing with it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Skeletons shimmer and match their content

**Files:**
- Modify: `apps/desktop/src/components/ui/skeleton.tsx`
- Modify: `apps/desktop/tailwind.config.js` (add the `skeleton-sweep` keyframe)
- Modify: `apps/desktop/src/index.css` (reduced-motion rule)
- Modify: `apps/desktop/src/pages/ProjectsPage.tsx`, `ConnectorsPage.tsx`, `ActivityPage.tsx`, `apps/desktop/src/features/projects/ArchivedProjectsDialog.tsx`
- Test: `apps/desktop/src/components/ui/skeleton.test.tsx` (create)

**Interfaces:**
- Produces: `<Skeleton />` unchanged in signature — same props, new appearance. Every existing call site keeps working.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/desktop/src/components/ui/skeleton.test.tsx
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Skeleton } from "./skeleton";
import { renderWithProviders } from "@/test/smoke-utils";

describe("Skeleton", () => {
  it("sweeps rather than pulsing", () => {
    renderWithProviders(<Skeleton data-testid="s" />);
    const el = screen.getByTestId("s");
    expect(el.className).toContain("animate-skeleton-sweep");
    expect(el.className).not.toContain("animate-pulse");
  });

  // A skeleton is decoration standing in for content that is not there —
  // a screen reader should skip it, not announce a run of blank boxes.
  it("is hidden from assistive technology", () => {
    renderWithProviders(<Skeleton data-testid="s" />);
    expect(screen.getByTestId("s")).toHaveAttribute("aria-hidden", "true");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter desktop exec vitest run src/components/ui/skeleton.test.tsx`
Expected: FAIL — className contains `animate-pulse`, no `aria-hidden`.

- [ ] **Step 3: Write minimal implementation**

`src/components/ui/skeleton.tsx`:

```tsx
import { cn } from "@/lib/utils";

/**
 * A stand-in for content that has not arrived.
 *
 * A single highlight sweeping left to right, not a pulse: a pulse reads as
 * "this element is doing something", a sweep reads as "this is not real
 * yet", which is what is true. Under reduced motion the sweep is suppressed
 * entirely by the global rule in index.css and it renders as a flat tint —
 * suppressed, not slowed.
 *
 * `aria-hidden` because a screen reader announcing a run of empty boxes is
 * worse than silence; the loading state is announced once, by the live
 * region, rather than once per placeholder.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative overflow-hidden rounded-md bg-muted",
        "after:absolute after:inset-0 after:animate-skeleton-sweep",
        "after:bg-gradient-to-r after:from-transparent after:via-foreground/[0.06] after:to-transparent",
        "animate-skeleton-sweep",
        className,
      )}
      {...props}
    />
  );
}
```

In `tailwind.config.js`, add to `keyframes`:

```js
        // Skeleton stand-in sweep — one highlight travelling left to right.
        // Transform-only so it never triggers layout, and neutralized under
        // reduced motion by the global rule in index.css.
        "skeleton-sweep": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
```

and to `animation`:

```js
        "skeleton-sweep": "skeleton-sweep 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite",
```

Then give `ProjectsPage`, `ConnectorsPage`, `ActivityPage` and `ArchivedProjectsDialog` skeletons that match their real row geometry, following the pattern `OverviewPage.tsx:63` (`OverviewSkeleton`) already establishes: a leading square at the row's icon size, two stacked text bars at the title and subtitle widths, and a trailing block where the trailing control sits. Read each page's real row markup first and mirror its dimensions.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter desktop exec vitest run src/components/ui/skeleton.test.tsx src/pages`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/ui/skeleton.tsx apps/desktop/src/components/ui/skeleton.test.tsx apps/desktop/tailwind.config.js apps/desktop/src/pages apps/desktop/src/features/projects/ArchivedProjectsDialog.tsx
git commit -m "feat(desktop): skeletons sweep, and match the content they stand in for

A pulse reads as 'this is doing something'; a sweep reads as 'this is not
real yet'. Projects, Connectors, Activity and Archived now mirror their
real row geometry the way Overview already did.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: The restore ceremony loses the spinner

**Files:**
- Modify: `apps/desktop/src/restore/RestoreExperience.tsx:120-145`
- Test: `apps/desktop/src/restore/RestoreExperience.test.tsx` (append)

**Interfaces:**
- Consumes: the `live-ping` animation already defined in `tailwind.config.js` (2.2s, `cubic-bezier(0, 0, 0.2, 1)`, scale 1 → 2.4, opacity 0.5 → 0). Do not add a new keyframe — this is the same "live" motion the connector detail uses.
- Produces: nothing consumed later.

- [ ] **Step 1: Write the failing test**

```tsx
// append to apps/desktop/src/restore/RestoreExperience.test.tsx
describe("restoring status", () => {
  it("uses the app's live-state dot, not a spinner", () => {
    renderWithProviders(<ToolStatus status="restoring" reducedMotion={false} />);
    expect(document.querySelector(".animate-spin")).toBeNull();
    expect(document.querySelector(".animate-live-ping")).not.toBeNull();
  });

  it("shows no animation at all under reduced motion", () => {
    renderWithProviders(<ToolStatus status="restoring" reducedMotion />);
    expect(document.querySelector(".animate-live-ping")).toBeNull();
  });
});
```

`ToolStatus` is not currently exported. Export it from `RestoreExperience.tsx` for this test.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter desktop exec vitest run src/restore/RestoreExperience.test.tsx`
Expected: FAIL — `ToolStatus is not exported`, then `.animate-spin` is still present.

- [ ] **Step 3: Write minimal implementation**

Export `ToolStatus`, and replace the `restoring` icon branch:

```tsx
  if (status === "waiting") icon = <Circle className="size-3.5" />;
  else if (status === "restoring")
    // The same "live" motion a connected connector's dot uses — one
    // vocabulary for "this is working" across the app, instead of a
    // bootstrap-era spinner here and a ping over there. Gated at the call
    // site rather than by the global reduced-motion rule so the dot renders
    // solid and still, not a halo frozen mid-expansion.
    icon = (
      <span className="relative grid size-3.5 place-items-center">
        {!reducedMotion && (
          <span className="absolute size-2 animate-live-ping rounded-full bg-foreground" />
        )}
        <span className="size-2 rounded-full bg-foreground" />
      </span>
    );
  else if (status === "applied") icon = <Check className="size-3.5" />;
```

Remove the now-unused `Loader2` import if nothing else in the file uses it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter desktop exec vitest run src/restore/RestoreExperience.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/restore/RestoreExperience.tsx apps/desktop/src/restore/RestoreExperience.test.tsx
git commit -m "feat(desktop): restore uses the app's live dot, not a spinner

Same 2.2s ping a connected connector shows, so 'working' looks like one
thing across the app.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Motion tokens get one source

**Files:**
- Modify: `apps/desktop/src/lib/motion.ts`
- Modify: `apps/desktop/tailwind.config.js`
- Modify: `apps/desktop/src/shell/Toolbar.tsx`, `src/shell/sidebarMotion.ts`, `src/shell/titlebar.ts`
- Test: `apps/desktop/src/lib/motion.test.ts` (append)

**Interfaces:**
- Produces: `export const DUR = { fast: 120, standard: 180, sidebar: 280, switch: 170, sheet: 300 } as const` and `export const EASE = { brand, standard, mac } as const`, both consumed by `tailwind.config.js`.

Behaviour must not change. This is a refactor whose only purpose is that the next animation cannot invent a fifth easing curve.

- [ ] **Step 1: Write the failing test**

```ts
// append to apps/desktop/src/lib/motion.test.ts
import { DUR, EASE } from "./motion";

describe("motion tokens", () => {
  it("exports the durations Tailwind publishes", () => {
    expect(DUR).toEqual({ fast: 120, standard: 180, sidebar: 280, switch: 170, sheet: 300 });
  });

  it("exports the three easing curves and no more", () => {
    expect(Object.keys(EASE).sort()).toEqual(["brand", "mac", "standard"]);
  });

  it("keeps BRAND_EASE and EASE.brand the same value", () => {
    expect(EASE.brand).toBe(BRAND_EASE);
  });

  it("keeps RESTORE_SHEET_EASE and EASE.standard the same value", () => {
    expect(EASE.standard).toBe(RESTORE_SHEET_EASE);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter desktop exec vitest run src/lib/motion.test.ts`
Expected: FAIL — `DUR` and `EASE` are not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/motion.ts`:

```ts
/**
 * Durations, in milliseconds, that `tailwind.config.js` publishes as
 * `duration-*` utilities. This file is the source; the config reads from it.
 * Before Phase 4 the two restated each other and drifted.
 */
export const DUR = {
  fast: 120,
  standard: 180,
  sidebar: 280,
  switch: 170,
  /** The Migrate and pairing sheets' slide-down. */
  sheet: 300,
} as const;

/**
 * The app's three easing curves, published by Tailwind as `ease-*`. Three is
 * the whole budget — a fourth needs a reason written down here.
 */
export const EASE = {
  brand: BRAND_EASE,
  standard: RESTORE_SHEET_EASE,
  mac: "cubic-bezier(0.32, 0.72, 0, 1)",
} as const;
```

`SIDEBAR_MOTION_MS` in `titlebar.ts` becomes `DUR.sidebar`; the inline `cubic-bezier(0.32, 0.72, 0, 1)` in `Toolbar.tsx`'s `style` becomes `EASE.mac`. Point `tailwind.config.js`'s `transitionDuration` and `transitionTimingFunction` at `DUR`/`EASE` — the config is CommonJS, so import with `await import()` at the top or restate via a small `require` shim consistent with how the file already loads its other values.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter desktop test`
Expected: PASS. Then confirm the build still produces the same utilities:
Run: `pnpm --filter desktop build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/lib/motion.ts apps/desktop/src/lib/motion.test.ts apps/desktop/tailwind.config.js apps/desktop/src/shell
git commit -m "refactor(desktop): one source for motion tokens

motion.ts publishes DUR and EASE; the Tailwind config reads from it rather
than restating the values. No behaviour change — this is so the next
animation cannot invent a fifth easing curve.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: The list-navigation hook

**Files:**
- Create: `apps/desktop/src/lib/useListNavigation.ts`
- Test: `apps/desktop/src/lib/useListNavigation.test.tsx`

**Interfaces:**
- Produces:

```ts
export interface ListNavigation<T> {
  containerProps: { role: "listbox"; "aria-activedescendant"?: string; onKeyDown: (e: React.KeyboardEvent) => void };
  getItemProps: (item: T, index: number) => {
    role: "option";
    id: string;
    "aria-selected": boolean;
    tabIndex: 0 | -1;
    onClick: () => void;
    onFocus: () => void;
    ref: (el: HTMLElement | null) => void;
  };
}

export function useListNavigation<T>(opts: {
  items: T[];
  idOf: (item: T) => string;
  labelOf: (item: T) => string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  idPrefix: string;
}): ListNavigation<T>;
```

Task 11 consumes this for all four master lists. Behaviour: ↑↓ move, Home/End jump, printable characters type-ahead against `labelOf` with a 600ms buffer, roving `tabIndex` (only the selected — or first — row is tabbable), focus follows the roving index.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/desktop/src/lib/useListNavigation.test.tsx
import { fireEvent, screen } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { useListNavigation } from "./useListNavigation";
import { renderWithProviders } from "@/test/smoke-utils";

const ITEMS = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Bravo" },
  { id: "c", label: "Charlie" },
];

function Harness({ onSelect = vi.fn(), selectedId = "a" as string | null }) {
  const nav = useListNavigation({
    items: ITEMS,
    idOf: (i) => i.id,
    labelOf: (i) => i.label,
    selectedId,
    onSelect,
    idPrefix: "test",
  });
  return (
    <div {...nav.containerProps} aria-label="Test list">
      {ITEMS.map((item, index) => (
        <div key={item.id} {...nav.getItemProps(item, index)}>
          {item.label}
        </div>
      ))}
    </div>
  );
}

describe("useListNavigation", () => {
  it("marks the container a listbox and rows options", () => {
    renderWithProviders(<Harness />);
    expect(screen.getByRole("listbox", { name: "Test list" })).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("marks only the selected row aria-selected", () => {
    renderWithProviders(<Harness selectedId="b" />);
    expect(screen.getByRole("option", { name: "Bravo" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: "Alpha" })).toHaveAttribute("aria-selected", "false");
  });

  // Roving tabindex: one stop for the whole list, arrows move within it.
  it("puts exactly one row in the tab order", () => {
    renderWithProviders(<Harness selectedId="b" />);
    const tabbable = screen.getAllByRole("option").filter((el) => el.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toHaveTextContent("Bravo");
  });

  it("selects the next row on ArrowDown", () => {
    const onSelect = vi.fn();
    renderWithProviders(<Harness onSelect={onSelect} selectedId="a" />);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });
    expect(onSelect).toHaveBeenCalledWith("b");
  });

  it("selects the previous row on ArrowUp", () => {
    const onSelect = vi.fn();
    renderWithProviders(<Harness onSelect={onSelect} selectedId="b" />);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowUp" });
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("stops at the ends rather than wrapping", () => {
    const onSelect = vi.fn();
    renderWithProviders(<Harness onSelect={onSelect} selectedId="a" />);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowUp" });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("jumps with Home and End", () => {
    const onSelect = vi.fn();
    renderWithProviders(<Harness onSelect={onSelect} selectedId="b" />);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "End" });
    expect(onSelect).toHaveBeenCalledWith("c");
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Home" });
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("jumps to a row by typing its first letter", () => {
    const onSelect = vi.fn();
    renderWithProviders(<Harness onSelect={onSelect} selectedId="a" />);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "c" });
    expect(onSelect).toHaveBeenCalledWith("c");
  });

  it("tolerates an empty list", () => {
    function Empty() {
      const nav = useListNavigation({
        items: [],
        idOf: (i: { id: string }) => i.id,
        labelOf: () => "",
        selectedId: null,
        onSelect: vi.fn(),
        idPrefix: "empty",
      });
      return <div {...nav.containerProps} aria-label="Empty" />;
    }
    renderWithProviders(<Empty />);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter desktop exec vitest run src/lib/useListNavigation.test.tsx`
Expected: FAIL — `Failed to resolve import "./useListNavigation"`.

- [ ] **Step 3: Write minimal implementation**

Implement `useListNavigation` per the interface above. Key decisions to honour:

- **Selection follows focus.** In a master/detail list the detail pane is the point; moving the highlight without loading the detail would make arrow keys useless. So arrows call `onSelect` directly rather than tracking a separate active index.
- **Ends do not wrap.** Wrapping in a long list loses the user's place.
- **Type-ahead** accumulates printable single characters into a buffer cleared after 600ms, matching against `labelOf` case-insensitively with `startsWith`, falling back to the first match from the current index onward so repeated presses of the same letter cycle.
- **Roving tabIndex** is `0` on the selected row, or on index 0 when nothing is selected; `-1` everywhere else.
- **`id`** is `` `${idPrefix}-${idOf(item)}` `` so `aria-activedescendant` can reference it.
- Refs are collected into a `Map` so the hook can call `.focus()` and `.scrollIntoView({ block: "nearest" })` on the newly selected row after a keyboard move — but **not** after a click, which would steal focus from where the user already put it.
- `Enter` and `Space` are not handled: selection already followed focus, so there is nothing left for them to confirm.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter desktop exec vitest run src/lib/useListNavigation.test.tsx`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/lib/useListNavigation.ts apps/desktop/src/lib/useListNavigation.test.tsx
git commit -m "feat(desktop): one hook for master-list keyboard navigation

Listbox roles, roving tabindex, arrows, Home/End and type-ahead. Selection
follows focus because the detail pane is the point of these lists.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: All four master lists become listboxes

**Files:**
- Modify: `apps/desktop/src/pages/CapsulesPage.tsx`, `ProjectsPage.tsx`, `ConnectorsPage.tsx`, `ActivityPage.tsx`
- Modify: `apps/desktop/src/components/ui/row.tsx`
- Test: `apps/desktop/src/test/list-navigation.test.tsx` (create — one suite run against all four)

**Interfaces:**
- Consumes: `useListNavigation` from Task 10; each page's existing `select*` store action.
- Produces: nothing consumed later.

`Row` currently spreads `...props` onto its root `<div>`, so `getItemProps` can be spread straight onto a `Row` with no change to `Row` itself — except that a focusable row needs a visible focus ring. Add that to `Row`'s class list, keyed off `focus-visible`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/desktop/src/test/list-navigation.test.tsx
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ActivityPage } from "@/pages/ActivityPage";
import { CapsulesPage } from "@/pages/CapsulesPage";
import { ConnectorsPage } from "@/pages/ConnectorsPage";
import { ProjectsPage } from "@/pages/ProjectsPage";
import { renderWithProviders } from "@/test/smoke-utils";

// One suite, four pages: the whole reason these share a hook is that a user
// who learns the keyboard on one list has learned it on all of them.
const PAGES = [
  { name: "Capsules", Page: CapsulesPage },
  { name: "Projects", Page: ProjectsPage },
  { name: "Connectors", Page: ConnectorsPage },
  { name: "Activity", Page: ActivityPage },
];

describe.each(PAGES)("$name master list", ({ Page }) => {
  it("is a listbox", async () => {
    renderWithProviders(<Page />);
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
  });

  it("puts exactly one row in the tab order", async () => {
    renderWithProviders(<Page />);
    const list = await screen.findByRole("listbox");
    const options = within(list).getAllByRole("option");
    expect(options.filter((el) => el.tabIndex === 0)).toHaveLength(1);
  });

  it("moves the selection with ArrowDown", async () => {
    renderWithProviders(<Page />);
    const list = await screen.findByRole("listbox");
    const before = within(list)
      .getAllByRole("option")
      .findIndex((el) => el.getAttribute("aria-selected") === "true");
    fireEvent.keyDown(list, { key: "ArrowDown" });
    const after = within(list)
      .getAllByRole("option")
      .findIndex((el) => el.getAttribute("aria-selected") === "true");
    expect(after).toBe(before + 1);
  });
});
```

Each page fetches its rows through Tauri `invoke`, which `src/test/smoke-utils.tsx` already mocks to resolve `[]`. Seed rows by overriding it per test — `mockInvoke.mockImplementation(...)` keyed on the command name — exactly as `ProjectsPage.test.tsx` already does. Import `mockInvoke` from `@/test/smoke-utils`, never from `@tauri-apps/api/core` directly; the re-export is what guarantees you get the mock regardless of import order.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter desktop exec vitest run src/test/list-navigation.test.tsx`
Expected: FAIL — `Unable to find role="listbox"` on all four.

- [ ] **Step 3: Write minimal implementation**

In each page, call `useListNavigation` with that page's items and store action, spread `containerProps` onto the master column's scroll container and `getItemProps(item, index)` onto each `Row`. Capsules groups rows by project — the listbox is the whole column and the group headers get `role="presentation"`, so the option indices run across groups rather than restarting per group.

In `row.tsx`, add to the root class list:

```
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter desktop test`
Expected: PASS across the whole suite.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/pages apps/desktop/src/components/ui/row.tsx apps/desktop/src/test/list-navigation.test.tsx
git commit -m "feat(desktop): the four master lists are keyboard-drivable

All four share one hook, so learning the keyboard on one list teaches all
of them. One suite asserts identical behaviour across the four.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: Announcements

**Files:**
- Create: `apps/desktop/src/lib/announce.ts`, `apps/desktop/src/components/ui/live-region.tsx`
- Test: `apps/desktop/src/lib/announce.test.ts`
- Modify: `apps/desktop/src/App.tsx` (mount `<LiveRegion />`), `src/restore/RestoreExperience.tsx`, `src/features/pairing/PairingSheet.tsx`, `src/pages/CapsulesPage.tsx`

**Interfaces:**
- Produces: `announce(message: string, opts?: { assertive?: boolean }): void` and `<LiveRegion />`, mounted exactly once.

One function so announcements stay auditable rather than becoming scattered `aria-live` attributes.

- [ ] **Step 1: Write the failing test**

```ts
// apps/desktop/src/lib/announce.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { announce, subscribeToAnnouncements } from "./announce";

describe("announce", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));

  it("delivers a polite message to subscribers", () => {
    const seen: Array<{ message: string; assertive: boolean }> = [];
    const stop = subscribeToAnnouncements((a) => seen.push(a));
    announce("Capsule captured");
    expect(seen).toEqual([{ message: "Capsule captured", assertive: false }]);
    stop();
  });

  it("marks assertive messages", () => {
    const seen: Array<{ assertive: boolean }> = [];
    const stop = subscribeToAnnouncements((a) => seen.push(a));
    announce("Chrome wants to connect", { assertive: true });
    expect(seen[0].assertive).toBe(true);
    stop();
  });

  // Screen readers ignore a live region whose text has not changed — the
  // same message twice must still be spoken twice.
  it("re-announces an identical message", () => {
    const seen: string[] = [];
    const stop = subscribeToAnnouncements((a) => seen.push(a.message));
    announce("Restored");
    announce("Restored");
    expect(seen).toHaveLength(2);
    stop();
  });

  it("stops delivering after unsubscribe", () => {
    const seen: string[] = [];
    const stop = subscribeToAnnouncements((a) => seen.push(a.message));
    stop();
    announce("ignored");
    expect(seen).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter desktop exec vitest run src/lib/announce.test.ts`
Expected: FAIL — `Failed to resolve import "./announce"`.

- [ ] **Step 3: Write minimal implementation**

`announce.ts` holds a module-level `Set` of listeners, an incrementing nonce so identical consecutive messages still register as a change, `announce()` which notifies, and `subscribeToAnnouncements(fn)` returning an unsubscribe.

`live-region.tsx` subscribes and renders two `sr-only` regions — `aria-live="polite"` and `aria-live="assertive"`, both `aria-atomic="true"` — writing the message into whichever matches. It clears the text after 1s so a later identical message re-triggers.

Then wire the call sites:

| Where | Message | Tone |
| --- | --- | --- |
| Capture completes (`CapsulesPage`, beside the existing `toastOk`) | `Capsule captured` | polite |
| Restore starts (`RestoreExperience`) | `Restoring <n> items` | polite |
| Restore finishes | `Restored <applied> of <total>. <skipped> waiting.` | polite |
| Connector connects (`App.tsx` event handler) | `<name> connected` | polite |
| Connector disconnects | `<name> disconnected` | polite |
| Pairing request arrives (`PairingSheet` mount effect) | `<name> wants to connect to Rabta` | assertive |

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter desktop exec vitest run src/lib/announce.test.ts src/App.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/lib/announce.ts apps/desktop/src/lib/announce.test.ts apps/desktop/src/components/ui/live-region.tsx apps/desktop/src/App.tsx apps/desktop/src/restore apps/desktop/src/features/pairing apps/desktop/src/pages/CapsulesPage.tsx
git commit -m "feat(desktop): announce capture, restore, connectors and pairing

One announce() backing two live regions, so announcements stay auditable
instead of becoming scattered aria-live attributes. The app had exactly one
live region before this.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 13: Landmarks, skip link, focus restoration, reduced transparency

**Files:**
- Modify: `apps/desktop/src/shell/AppShell.tsx`, `src/shell/Sidebar.tsx`, `src/index.css`
- Test: `apps/desktop/src/shell/AppShell.test.tsx` (append)

**Interfaces:**
- Produces: nothing consumed later.

- [ ] **Step 1: Write the failing test**

**Already true — do not redo:** `AppShell.tsx:83` already renders `<main>`. What it lacks is `id="main"` and `tabIndex={-1}`, both of which the skip link needs. The sidebar is the landmark that is genuinely missing.

```tsx
// append to apps/desktop/src/shell/AppShell.test.tsx
describe("landmarks", () => {
  it("exposes a navigation landmark", () => {
    renderWithProviders(<AppShell><div /></AppShell>);
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });

  it("gives main an id and a focus target for the skip link", () => {
    renderWithProviders(<AppShell><div /></AppShell>);
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main");
    expect(main).toHaveAttribute("tabindex", "-1");
  });

  // A keyboard user should not have to tab the whole sidebar to reach
  // content on every view change.
  it("offers a skip link to the main region", () => {
    renderWithProviders(<AppShell><div /></AppShell>);
    const skip = screen.getByRole("link", { name: /skip to (main )?content/i });
    expect(skip).toHaveAttribute("href", "#main");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter desktop exec vitest run src/shell/AppShell.test.tsx`
Expected: FAIL — no `navigation`/`main` role, no skip link.

- [ ] **Step 3: Write minimal implementation**

- `Sidebar`'s nav container becomes `<nav aria-label="Sections">`. The selected row keeps its existing `aria-current`.
- `AppShell`'s page region becomes `<main id="main" tabIndex={-1}>`.
- Detail panes in the four master/detail pages become `<aside aria-label="Details">`.
- A skip link as the first focusable element in `AppShell`, visually hidden until focused:

```tsx
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-popover focus:px-3 focus:py-1.5 focus:text-body focus:text-foreground focus:shadow-modal focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
```

- Verify Radix restores focus to the invoking element when `Sheet` and `Dialog` close (it does by default — confirm nothing in `sheet.tsx`'s `onOpenAutoFocus` override broke it, and add `onCloseAutoFocus` handling if it did).
- In `index.css`, add beside the existing reduced-motion rule:

```css
/* Reduced transparency: the blurred chrome becomes opaque rather than
   merely less blurred. A user who asked for no transparency wants none. */
@media (prefers-reduced-transparency: reduce) {
  [data-tauri-drag-region],
  [data-sheet],
  .backdrop-blur-\[24px\] {
    backdrop-filter: none;
    background-color: hsl(var(--background));
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter desktop test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/shell apps/desktop/src/index.css apps/desktop/src/pages
git commit -m "feat(desktop): landmarks, a skip link and reduced transparency

nav/main/aside regions, a skip link so a keyboard user is not tabbing the
sidebar on every view change, and opaque chrome when the OS asks for
reduced transparency.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 14: Contrast, asserted from the tokens

**Files:**
- Create: `apps/desktop/src/theme/contrast.ts`, `apps/desktop/src/theme/contrast.test.ts`
- Modify: `apps/desktop/src/index.css` (only the tokens that fail)

**Interfaces:**
- Produces: `contrastRatio(fg: string, bg: string): number` taking two `H S% L%` token strings and returning the WCAG ratio.

The point is not a one-off audit. The test derives ratios from the token values, so a future token change cannot quietly regress contrast.

- [ ] **Step 1: Write the failing test**

```ts
// apps/desktop/src/theme/contrast.test.ts
import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";
import { readTokens } from "./tokens.test-helpers";

// WCAG AA: 4.5:1 for body text, 3:1 for large text and UI components.
const BODY = 4.5;
const UI = 3;

const PAIRS: Array<{ fg: string; bg: string; min: number; why: string }> = [
  { fg: "--foreground", bg: "--background", min: BODY, why: "body text" },
  { fg: "--muted-foreground", bg: "--background", min: BODY, why: "subtitles" },
  { fg: "--tertiary-foreground", bg: "--background", min: UI, why: "metadata and counts" },
  { fg: "--primary-foreground", bg: "--primary", min: BODY, why: "accent button label" },
  { fg: "--ok", bg: "--background", min: UI, why: "connected state" },
  { fg: "--bad", bg: "--background", min: UI, why: "disconnect and Never sees" },
  { fg: "--warn", bg: "--background", min: UI, why: "warnings" },
  { fg: "--sidebar-foreground", bg: "--sidebar", min: BODY, why: "sidebar labels" },
];

describe.each(["light", "dark"] as const)("%s theme contrast", (theme) => {
  const tokens = readTokens(theme);
  it.each(PAIRS)("$why meets $min:1", ({ fg, bg, min }) => {
    expect(contrastRatio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(min);
  });
});

describe("contrastRatio", () => {
  it("is 21:1 for black on white", () => {
    expect(contrastRatio("0 0% 0%", "0 0% 100%")).toBeCloseTo(21, 1);
  });

  it("is 1:1 for a colour on itself", () => {
    expect(contrastRatio("210 40% 50%", "210 40% 50%")).toBeCloseTo(1, 2);
  });
});
```

`src/theme/tokens.test.ts` **already has this parser**: it reads `../index.css` at line 5 and exposes a local `tokensIn(selector)` that returns a `Record<string, string>` for `:root` and `.dark`. Do not write a second one — extract `tokensIn` into `src/theme/tokens-source.ts`, re-import it from `tokens.test.ts` so that suite is unchanged, and import it here as `readTokens`. The import in the test above becomes:

```ts
import { tokensIn } from "./tokens-source";
const readTokens = (theme: "light" | "dark") => tokensIn(theme === "dark" ? ".dark" : ":root");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter desktop exec vitest run src/theme/contrast.test.ts`
Expected: FAIL — `Failed to resolve import "./contrast"`.

- [ ] **Step 3: Write minimal implementation**

`contrast.ts` parses `H S% L%`, converts HSL → sRGB → relative luminance per WCAG (`c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4`), and returns `(lighter + 0.05) / (darker + 0.05)`.

Run the test. **For every failing pair, fix the token in `index.css`, never the threshold and never the pair list.** Adjust lightness in the smallest step that clears the bar, and re-check the token's other uses visually. Expect `--tertiary-foreground` and the accent-on-background pairs to be the ones that need moving.

The 40%-opacity disabled chevrons are not in this list because opacity is not a token; they are UI in a disabled state, which WCAG exempts from contrast minimums. They keep `opacity-40`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter desktop exec vitest run src/theme`
Expected: PASS, both themes.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/theme apps/desktop/src/index.css
git commit -m "feat(desktop): assert token contrast against WCAG AA

Ratios are computed from the token values in both themes, so a future
token change cannot quietly regress contrast. Failing tokens were moved;
no threshold was lowered.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 15: Micro-interactions, and the guards that keep them honest

**Files:**
- Modify: `apps/desktop/src/components/ui/row.tsx`, `src/shell/Sidebar.tsx`, `src/shell/Toolbar.tsx`
- Create: `apps/desktop/src/test/motion-guard.test.tsx`, `apps/desktop/src/test/a11y-guard.test.tsx`

**Interfaces:**
- Consumes: `DUR`/`EASE` from Task 9.
- Produces: two guard suites that run against every page.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/desktop/src/test/a11y-guard.test.tsx
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ActivityPage } from "@/pages/ActivityPage";
import { CapsulesPage } from "@/pages/CapsulesPage";
import { ConnectorsPage } from "@/pages/ConnectorsPage";
import { OverviewPage } from "@/pages/OverviewPage";
import { ProjectsPage } from "@/pages/ProjectsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { renderWithProviders } from "@/test/smoke-utils";

const PAGES = [
  { name: "Overview", Page: OverviewPage },
  { name: "Capsules", Page: CapsulesPage },
  { name: "Projects", Page: ProjectsPage },
  { name: "Connectors", Page: ConnectorsPage },
  { name: "Activity", Page: ActivityPage },
  { name: "Settings", Page: SettingsPage },
];

describe.each(PAGES)("$name accessibility", ({ Page }) => {
  it("gives every interactive element an accessible name", () => {
    const { container } = renderWithProviders(<Page />);
    const unnamed = [...container.querySelectorAll("button, a[href], [role='option']")].filter(
      (el) =>
        !el.getAttribute("aria-label") &&
        !el.getAttribute("aria-labelledby") &&
        !el.textContent?.trim() &&
        !el.querySelector("[aria-label]"),
    );
    expect(unnamed.map((el) => el.outerHTML.slice(0, 120))).toEqual([]);
  });

  // A positive tabIndex reorders the whole document's tab sequence, not just
  // this element's. There is never a good reason for one here.
  it("uses no positive tabIndex", () => {
    const { container } = renderWithProviders(<Page />);
    const positive = [...container.querySelectorAll("[tabindex]")].filter(
      (el) => Number(el.getAttribute("tabindex")) > 0,
    );
    expect(positive.map((el) => el.outerHTML.slice(0, 120))).toEqual([]);
  });
});
```

**Already true — do not redo:** `index.css:215` already carries the blanket `@media (prefers-reduced-motion: reduce)` rule clamping every animation and transition to 0.001ms, plus a `:root[data-motion="reduced"]` twin driven by the app's own Motion setting. The guard's job is to assert *both* survive, and that no animation opts out of them.

```tsx
// apps/desktop/src/test/motion-guard.test.tsx
// The reduced-motion story is a blanket rule over `*`, not a per-animation
// opt-in — so this guards the blanket itself, plus the app's own
// data-motion="reduced" twin, plus the absence of anything that escapes
// them. An animation with `!important` on its duration would.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");

describe("reduced motion", () => {
  it("clamps animation and transition under the OS preference", () => {
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block).toMatch(/animation-duration:\s*0\.001ms\s*!important/);
    expect(block).toMatch(/transition-duration:\s*0\.001ms\s*!important/);
  });

  it("clamps the same way for the app's own Motion setting", () => {
    expect(css).toMatch(/:root\[data-motion="reduced"\]/);
  });

  // An animation whose duration is itself !important would outrank the
  // blanket and keep playing for a user who asked it not to.
  it("has no animation that can outrank the blanket", () => {
    const offenders = [...css.matchAll(/animation[^;]*!important/g)]
      .map((m) => m[0])
      .filter((decl) => !decl.includes("0.001ms") && !decl.includes("iteration-count"));
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter desktop exec vitest run src/test/a11y-guard.test.tsx src/test/motion-guard.test.tsx`
Expected: FAIL — unnamed elements listed per page, and/or a missing reduced-motion path.

- [ ] **Step 3: Write minimal implementation**

Fix every element the guard names — add `aria-label` to icon-only buttons, remove any positive `tabIndex`. The reduced-motion blanket already exists at `index.css:215`; leave it alone.

Then add the micro-interactions, all transform/opacity, all ≤200ms, all inheriting the reduced-motion blanket above:

- `row.tsx`: `active:scale-[0.995] transition-transform duration-fast ease-standard` on interactive rows only (gate on the presence of `role="option"`).
- `Sidebar.tsx`: the selected row's icon gets `transition-transform duration-fast ease-standard`; counts get `transition-opacity duration-standard`.
- `Toolbar.tsx`: wrap `ContextualAction` in a `key={view}` element carrying `animate-page-in` so it cross-fades on view change rather than swapping instantly.
- Master lists: apply the existing `animate-page-in` to the list container on first paint.

### Not in this task: the toolbar accent double-spend

Overview and Capsules each render two accent buttons — `Toolbar.tsx`'s contextual "New
capsule" alongside the page hero's Resume/Restore. Found during Task 6, confirmed by
independent review as a real defect. **The user ruled the page hero keeps the accent**, so
the toolbar's contextual action goes neutral on `overview` and `capsules` and keeps its
accent on `projects`.

**A separate session owns this fix.** Do not touch `useContextualAction` or
`ContextualAction`'s colouring here — two sessions editing `Toolbar.tsx` concurrently would
conflict. This task's only `Toolbar.tsx` change is the contextual-action cross-fade above.

Phase verification (Task 16) confirms the fix landed and matches the ruling.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter desktop test`
Expected: PASS across the whole suite.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src
git commit -m "feat(desktop): micro-interactions, plus the guards that keep them honest

Row press, nav icon settle, count and contextual-action transitions — all
transform/opacity, all under 200ms, all covered by the reduced-motion
blanket. Two guard suites assert accessible names, no positive tabIndex,
and that every configured animation has a reduced-motion path.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 16: Verify the whole phase

**Files:** none created; this is the gate before the phase is called done.

- [ ] **Step 1: Full test suite**

Run: `pnpm --filter desktop test`
Expected: PASS, zero skipped.

- [ ] **Step 2: Typecheck and build**

Run: `pnpm --filter desktop build`
Expected: `tsc -b` clean, vite build succeeds.

- [ ] **Step 3: Repo-wide suite**

Run: `pnpm test`
Expected: PASS — confirms nothing in the site or script tests regressed.

- [ ] **Step 4: Manual verification against the spec**

Launch the app (`pnpm --filter desktop tauri dev`) and confirm by hand, since none of these are fully assertable in happy-dom:

1. Navigate Overview → Capsules → select a capsule → Projects. Back returns to that capsule, not a bare list. `⌘[` does the same.
2. Trigger a pairing request. The sheet appears **over** the app with no layout shift. Both buttons are inert for the first third of a second. Enter does nothing. Escape leaves the request on the Connectors page.
3. Set System Settings → Accessibility → Display → Reduce motion. Skeletons are flat, the restore dot is solid and still, nothing animates.
4. Tab from the window edge: skip link first, then sidebar, then one stop into each master list with arrows moving inside it.
5. Turn on VoiceOver. Capture a capsule and confirm it is announced; trigger a pairing request and confirm the assertive announcement interrupts.

- [ ] **Step 5: Record what shipped and what diverged**

Write `docs/superpowers/plans/2026-08-10-console-v2-phase-4-outcome.md` in the style of the existing `8269733` outcome doc: what shipped, what diverged from the spec and why, and what the next phase inherits. Commit it.

---

## Self-Review

**Spec coverage.** Every section of the spec maps to a task: navigation history → 1–3; pairing sheet → 4–6; skeletons → 7; restore ceremony → 8; motion tokens → 9; micro-interactions → 15; listboxes → 10–11; announcements → 12; focus/landmarks/reduced transparency → 13; contrast → 14; guard tests → 15; verification → 16. The spec's "Out of scope" items (restore report, capture confirmation, history persistence) have no tasks, correctly.

**Known deviation from the spec, carried deliberately.** The spec says the pairing sheet's initial focus lands on Deny. Task 5 does not move focus — the `Sheet` primitive focuses the sheet container so a screen reader starts at the title rather than mid-footer, which its own code comments call out as a fix worth keeping. The spec's *intent* — that the affirmative-trust action is never a keypress away — is met more completely by `enterAdvances={false}`, which makes Enter fire nothing at all, combined with the arm delay. Flag this to the user rather than silently diverging.

**Type consistency.** `Location`, `pushLocation`, `HISTORY_LIMIT` are defined in Task 1 and used with the same names in Tasks 2–3. `announce`/`subscribeToAnnouncements` are defined in Task 12 and used nowhere earlier. `useListNavigation`'s return shape in Task 10 matches its use in Task 11. `DUR`/`EASE` from Task 9 are referenced in Task 15. `ARM_DELAY_MS` is exported by Task 5 and imported by its own test only.

**One ordering constraint:** Task 4 must land before Task 5 — the sheet props do not exist otherwise. Tasks 7–9 and 10–14 are independent of each other and of 1–6.
