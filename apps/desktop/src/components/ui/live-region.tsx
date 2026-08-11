import { useEffect, useRef, useState } from "react";
import { subscribeToAnnouncements } from "@/lib/announce";

/** How long a shown announcement stays in the DOM before this clears it back
 * to empty. Pure tidiness between messages (an idle region reads as empty,
 * not as a growing transcript, and nothing lingers for an unrelated
 * `getByText` elsewhere in the app to trip over) — the mechanism that
 * actually guarantees a repeated message re-announces does not depend on
 * this delay at all; see `nonce` below. */
const CLEAR_MS = 1000;

type Channel = "polite" | "assertive";

interface RegionState {
  text: string;
  /** The announce() nonce that produced `text`. Never rendered — only used
   * as the `key` on the span below. `announce()` bumps its nonce on every
   * call, including an exact repeat of the previous message, so this is
   * guaranteed to differ from the previous render's value even when `text`
   * does not. Keying on it forces React to unmount the old text node and
   * mount a fresh one instead of leaving an existing node with unchanged
   * textContent in place — a live region only gets re-announced when its
   * subtree actually mutates, and an unchanged node is nothing to notice. */
  nonce: number;
}

const IDLE: RegionState = { text: "", nonce: 0 };

/**
 * Mounts the app's two `aria-live` regions — polite for routine status,
 * assertive for the pairing sheet's unprompted interrupt — and renders
 * whatever `announce()` (lib/announce.ts) sends through. `announce()` is the
 * only way to reach this component — nothing here is ever imported by a call
 * site.
 *
 * These are the app-wide regions, not the only live regions in the tree. A
 * view that owns a region tied to its own visible content keeps it local:
 * `RestoreExperience` narrates a restore in progress, `ProjectsPage` marks a
 * dirty-tree dot `role="status"`. Both are scoped to something on screen and
 * unmount with it. Use `announce()` for anything that has to be heard when
 * the thing that caused it is not — or is about to stop being — on screen.
 *
 * Mount exactly once (App.tsx). A second instance would subscribe
 * independently and double-speak every announcement.
 */
export function LiveRegion() {
  const [polite, setPolite] = useState<RegionState>(IDLE);
  const [assertive, setAssertive] = useState<RegionState>(IDLE);
  const clearTimers = useRef<Partial<Record<Channel, ReturnType<typeof setTimeout>>>>({});

  useEffect(() => {
    const stop = subscribeToAnnouncements((announcement, nonce) => {
      const channel: Channel = announcement.assertive ? "assertive" : "polite";
      const setState = channel === "assertive" ? setAssertive : setPolite;

      // Cancel whatever clear was already pending for this channel — without
      // this, a slow-timed clear left over from the previous message could
      // fire after this new one renders and wipe it out early.
      const pending = clearTimers.current[channel];
      if (pending) clearTimeout(pending);

      setState({ text: announcement.message, nonce });
      clearTimers.current[channel] = setTimeout(() => setState({ text: "", nonce }), CLEAR_MS);
    });

    return () => {
      stop();
      for (const id of Object.values(clearTimers.current)) clearTimeout(id);
    };
  }, []);

  return (
    <>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        <span key={polite.nonce}>{polite.text}</span>
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="true" className="sr-only">
        <span key={assertive.nonce}>{assertive.text}</span>
      </div>
    </>
  );
}
