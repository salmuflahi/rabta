import * as React from "react";

/** Type-ahead buffer window: consecutive printable keystrokes within this
 * many ms are treated as one search string; a pause this long clears the
 * buffer so the next keystroke starts a fresh search. */
const TYPEAHEAD_TIMEOUT_MS = 600;

export interface ListNavigation<T> {
  containerProps: { role: "listbox"; onKeyDown: (e: React.KeyboardEvent) => void };
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

/**
 * Keyboard/roving-focus behaviour shared by all four master lists (Capsules,
 * Projects, Connectors, Activity). Wires a `role="listbox"` container and
 * `role="option"` rows: arrow keys move, Home/End jump to the ends,
 * printable characters type-ahead search, and a roving `tabIndex` keeps the
 * whole list a single Tab stop. Built in Task 10; wired into the four pages
 * in Task 11 (Console v2 Phase 4) — see each page's `useListNavigation` call.
 *
 * Four decisions here are deliberate, not oversights:
 *
 * - Selection follows focus: there is no separate "active index" state.
 *   Arrows call `onSelect` directly, keyed off the caller-owned
 *   `selectedId`. In a master/detail list the detail pane is the point —
 *   moving a highlight without loading the detail would make arrow keys
 *   useless — so the row that's highlighted, focused, and loaded in the
 *   detail pane are always the same row.
 * - Ends do not wrap: ArrowUp on the first row / ArrowDown on the last does
 *   nothing, rather than jumping to the opposite end. Wrapping in a long
 *   list loses the user's place.
 * - Enter and Space are not handled by this hook's own `onKeyDown` — no
 *   `preventDefault()`, no `onSelect` call — because selection already
 *   follows focus (see above), so there is nothing left for either key to
 *   *report*. That is narrower than "nothing happens on a real page,"
 *   though, and worth being precise about: `getItemProps` doesn't control
 *   what element it ends up spread onto, and all four master lists spread it
 *   onto real `<button>`s (see task-11-report.md's addendum on why —
 *   `role="option"` is applied via props, but the underlying element is
 *   still a native button). A focused `<button>` activates natively on
 *   Enter/Space regardless of what this hook's own handler does, and since
 *   that handler never calls `preventDefault()` for either key, native
 *   activation isn't suppressed — it re-fires the row's own `onClick`,
 *   re-selecting the id that's already selected. That's provably harmless
 *   *today* only because it's calling into an idempotent operation: every
 *   consuming page's `select*` store action (`selectCapsule`,
 *   `selectProject`, `selectConnector`, `selectEvent` — see `store.ts`) sets
 *   the same field to the same value a second time, which is a no-op by
 *   construction (traced through as far as `pushLocation()`, which is
 *   itself keyed on whether the value actually changed). This hook leans on
 *   that invariant without enforcing it: nothing here would fail, loudly or
 *   quietly, the day a `select*` action grows a side effect that isn't
 *   idempotent — an analytics call, a toast, a triggered animation — at
 *   which point a focused native button's Enter/Space keypress starts
 *   silently firing it twice. Whoever adds that side effect won't learn it
 *   from this hook; they need to know it going in.
 * - Focus is real, not virtual: `containerProps` carries no
 *   `aria-activedescendant`, and the container itself is never given a
 *   `tabIndex`. That attribute only means anything on the element that
 *   currently holds DOM focus, and this hook never puts focus there — every
 *   move (see `selectAndFocus` below) calls `.focus()` on the actual option
 *   element via roving `tabIndex` (0 on the selected row, -1 on the rest).
 *   Adding `aria-activedescendant` on top would describe a second,
 *   contradictory focus-management strategy the hook doesn't implement — an
 *   attribute sitting on an element that's never focused, which is exactly
 *   the condition under which assistive tech ignores it. Roving tabIndex
 *   was already fully built and tested (real `.focus()`/`scrollIntoView()`
 *   calls, the click-vs-keyboard focus split below); switching to
 *   activedescendant would mean rebuilding that mechanism, not wiring it up.
 */
export function useListNavigation<T>(opts: {
  items: T[];
  idOf: (item: T) => string;
  labelOf: (item: T) => string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Namespaces each row's DOM `id` (`${idPrefix}-${idOf(item)}`) so
   * `aria-activedescendant` has a collision-free id to reference even when
   * several of these lists share a page. */
  idPrefix: string;
}): ListNavigation<T> {
  const { items, idOf, labelOf, selectedId, onSelect, idPrefix } = opts;

  // Every rendered row registers itself here (via getItemProps' `ref`),
  // keyed by its own (unprefixed) id — regardless of whether it's currently
  // selected. That means the element a keyboard move is about to land on is
  // already available synchronously: no need to wait a render cycle for a
  // fresh selectedId to come back down before we can focus/scroll it.
  const itemRefs = React.useRef<Map<string, HTMLElement>>(new Map());

  const typeaheadBufferRef = React.useRef("");
  const typeaheadTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Mirrors the undo-timer cleanup pattern used elsewhere in this codebase
  // (useDeferredDelete, useSessionTracking): don't leave a pending timeout
  // dangling past unmount.
  React.useEffect(() => {
    return () => {
      if (typeaheadTimerRef.current !== undefined) {
        clearTimeout(typeaheadTimerRef.current);
      }
    };
  }, []);

  // The resolved selected item, or null if selectedId is null OR points at
  // an id that isn't (or is no longer) in `items`. Using this rather than
  // the raw selectedId for the "is anything selected" checks below means a
  // stale id can't strand the list with zero tabbable rows.
  const selectedItem = items.find((item) => idOf(item) === selectedId) ?? null;

  // selectAndFocus below calls onSelect(id) and then el.focus(). `.focus()`
  // synchronously dispatches focus/focusin PROVIDED `el` isn't already
  // document.activeElement — happy-dom's HTMLElementUtility.focus() early-
  // returns with no dispatch in that one case, not the "unconditional"
  // dispatch an earlier version of this comment claimed. That's a narrow,
  // self-healing gap in practice: the target of a keyboard move is, by
  // construction, some OTHER row, not whichever one is already focused, so
  // the dispatch — and the double-call risk this comment is about — is the
  // normal case here. When it dispatches, React delegates it to that row's
  // own onFocus (see getItemProps below), which also calls onSelect. Left
  // alone that's a double call for every keyboard move. The fix is NOT
  // `id !== selectedId` in onFocus: React 18 batches the
  // onSelect-driven state update, so the onFocus closure that synchronously
  // fires is still from the render *before* this move — selectedId there is
  // last move's value, not this one, so it never equals `id` and the guard
  // never triggers (confirmed: tried it, the "exactly once" test below still
  // saw 2 calls). A ref sidesteps that — it's written and read within the
  // same synchronous call, no render/commit in between.
  const programmaticFocusIdRef = React.useRef<string | null>(null);

  // The one place that moves real DOM focus. Both the "move" (Arrow/Home/
  // End) and type-ahead paths funnel through this, so a keyboard action
  // always reports the new selection AND focuses + reveals its row.
  // getItemProps().onClick deliberately does NOT call this — see its
  // comment below.
  const selectAndFocus = (item: T) => {
    const id = idOf(item);
    onSelect(id);
    const el = itemRefs.current.get(id);
    if (el) {
      // Marks this focus as one we triggered ourselves, so the onFocus
      // handler it's about to synchronously fire can skip its own onSelect
      // — onSelect for this id was just called on the line above.
      programmaticFocusIdRef.current = id;
      el.focus();
      el.scrollIntoView({ block: "nearest" });
    }
  };

  // Moves to `index` if it's in range. Out of range — including every index
  // on an empty list — is a deliberate no-op: this is what makes the ends
  // not wrap (see the module doc comment above).
  const moveTo = (index: number) => {
    const target = items[index];
    if (!target) return;
    selectAndFocus(target);
  };

  const handleTypeahead = (char: string) => {
    if (typeaheadTimerRef.current !== undefined) {
      clearTimeout(typeaheadTimerRef.current);
    }
    typeaheadTimerRef.current = setTimeout(() => {
      typeaheadBufferRef.current = "";
    }, TYPEAHEAD_TIMEOUT_MS);

    typeaheadBufferRef.current += char.toLowerCase();
    const buffer = typeaheadBufferRef.current;

    // Repeated presses of one key (e.g. "c" "c" "c") build a buffer like
    // "ccc", which would never prefix-match a real label. Treat an
    // all-identical buffer as a search for that single character instead —
    // combined with searching from just past the current row below, this is
    // what makes holding one key cycle through every row that starts with
    // it rather than getting stuck re-matching the first one.
    const isRepeatedChar = buffer.length > 1 && buffer.split("").every((c) => c === buffer[0]);
    const query = isRepeatedChar ? buffer[0] : buffer;

    const currentIndex = items.findIndex((item) => idOf(item) === selectedId);
    // Start just AFTER the current row, wrapping through the whole list
    // back around to (and including) the current row itself. That's what
    // lets a same-letter repeat step to the *next* match each time instead
    // of re-finding the row that's already selected — and it still falls
    // back to the current row if it's the only match.
    const startIndex = currentIndex === -1 ? 0 : currentIndex + 1;

    for (let offset = 0; offset < items.length; offset++) {
      const candidate = items[(startIndex + offset) % items.length];
      if (labelOf(candidate).toLowerCase().startsWith(query)) {
        selectAndFocus(candidate);
        return;
      }
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const currentIndex = items.findIndex((item) => idOf(item) === selectedId);

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        // No selection yet behaves as "before row 0", so the first press
        // reveals the top row instead of skipping past it.
        moveTo(currentIndex + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveTo(currentIndex - 1);
        break;
      case "Home":
        event.preventDefault();
        moveTo(0);
        break;
      case "End":
        event.preventDefault();
        moveTo(items.length - 1);
        break;
      case "Enter":
      case " ":
        // Deliberately not handled — see the module doc comment above.
        // (Falling through to the default case would also feed the space
        // character into the type-ahead buffer, which we don't want either.)
        break;
      default:
        // Type-ahead only for an unmodified, single printable character:
        // longer key names (e.g. "ArrowDown", already handled above but
        // this guards any other multi-char key) and shortcut chords
        // (Cmd/Ctrl/Alt+letter) should pass through untouched.
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          handleTypeahead(event.key);
        }
        break;
    }
  };

  return {
    // No `aria-activedescendant` and no `tabIndex` here — see this file's
    // module doc comment ("Focus is real, not virtual") for why: this hook
    // moves real DOM focus onto the actual option element (getItemProps'
    // roving `tabIndex` + `ref`, and selectAndFocus's `el.focus()` above),
    // so the container itself never holds focus and activedescendant would
    // have nothing valid to attach to.
    containerProps: {
      role: "listbox",
      onKeyDown: handleKeyDown,
    },
    getItemProps: (item: T, index: number) => {
      const id = idOf(item);
      const selected = selectedItem !== null && id === idOf(selectedItem);
      // Roving tabIndex: the selected row is the list's one Tab stop. If
      // nothing is validly selected, row 0 holds that stop instead, so the
      // list is always reachable by Tab.
      const tabIndex: 0 | -1 = selected || (selectedItem === null && index === 0) ? 0 : -1;
      return {
        role: "option",
        id: `${idPrefix}-${id}`,
        "aria-selected": selected,
        tabIndex,
        onClick: () => onSelect(id),
        // Selection follows focus generally, not just via this hook's own
        // Arrow/Home/End/type-ahead moves: Tab landing on the roving stop,
        // or a real click — which focuses its target natively in a browser
        // — should select too. But a move this hook itself just made (see
        // selectAndFocus above) already called onSelect directly, and its
        // own el.focus() call is what's about to trigger *this* onFocus —
        // programmaticFocusIdRef is how this handler tells "focus we caused"
        // apart from "focus that arrived some other way", so the former
        // doesn't call onSelect twice.
        onFocus: () => {
          if (programmaticFocusIdRef.current === id) {
            programmaticFocusIdRef.current = null;
            return;
          }
          onSelect(id);
        },
        // Click deliberately does NOT call .focus()/.scrollIntoView(): the
        // user may have clicked this row with focus sitting elsewhere on
        // purpose (e.g. a filter input above the list), and yanking focus
        // into the list would undo that.
        ref: (el: HTMLElement | null) => {
          if (el) {
            itemRefs.current.set(id, el);
          } else {
            itemRefs.current.delete(id);
          }
        },
      };
    },
  };
}
