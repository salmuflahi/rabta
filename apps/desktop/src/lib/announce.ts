// A single screen-reader announcement channel for the whole app.
//
// Before this, the only `aria-live` region anywhere in Rabta was the one
// inside RestoreOverlay wrapping the per-tool restore rows — capture
// completing, connectors connecting/disconnecting, and an incoming pairing
// request all announced nothing. Rather than sprinkle more `aria-live`
// attributes around the tree (one region per feature, each easy to miss and
// impossible to audit as a set), every call site routes through this one
// `announce()` function. `<LiveRegion />` (components/ui/live-region.tsx) is
// its sole subscriber and the thing that actually renders the two mounted
// regions — everything else, including tests, only ever touches this file.

/** What a subscriber receives. Deliberately just these two fields — see
 * `subscribeToAnnouncements` for why the nonce that makes repeats work
 * isn't part of this shape. */
export interface Announcement {
  message: string;
  assertive: boolean;
}

type Listener = (announcement: Announcement, nonce: number) => void;

const listeners = new Set<Listener>();

// Bumped on every announce() call, including an exact repeat of the
// previous message. Passed to listeners as a second, separate argument
// rather than folded into `Announcement` above: `LiveRegion` is the only
// subscriber that needs it (to force a real DOM change even when the text
// repeats — see its own comment), and keeping it out of `Announcement`
// keeps that shape exactly {message, assertive} for every subscriber,
// including tests that assert on it with a plain `toEqual`.
let nonce = 0;

/**
 * Announce `message` to screen readers.
 *
 * Polite (the default) queues behind whatever is already being read —
 * right for routine status: a capture completing, a restore's progress, a
 * connector reconnecting. `assertive: true` interrupts immediately —
 * reserved for the pairing sheet, the one place something arrives
 * completely unprompted by the user.
 *
 * Every call notifies subscribers, even if `message` is identical to the
 * last call — screen readers only speak a live region whose rendered text
 * actually changed, and it's `LiveRegion`'s job (not this function's) to
 * turn "notified twice with the same string" into "genuinely announced
 * twice".
 */
export function announce(message: string, opts?: { assertive?: boolean }): void {
  const announcement: Announcement = { message, assertive: opts?.assertive ?? false };
  nonce += 1;
  for (const listener of listeners) listener(announcement, nonce);
}

/**
 * Subscribe to every announcement made through `announce()`. Returns an
 * unsubscribe function. `LiveRegion` is the one production subscriber;
 * tests use this directly to assert on what would be spoken without
 * rendering anything.
 */
export function subscribeToAnnouncements(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
