import { useLayoutEffect } from "react";
import { useStore } from "@/store";

/**
 * Declares that this page's content is spending the screen's one accent — its
 * hero "Resume", its detail-pane "Restore", whatever the page's real primary
 * action is — for as long as `owns` holds.
 *
 * The Toolbar's contextual action ("New capsule", "Add project") steps down to
 * neutral while a page holds the claim, so the orange lands on the action the
 * user came for rather than on the generic create beside it. Release the claim
 * and the Toolbar takes the accent back: on Overview with nothing open, "New
 * capsule" *is* the primary action, and it should look like one.
 *
 * Pass the condition, not a call site — `useOwnsViewAccent(Boolean(hero))`.
 * Flipping it to false releases the claim on the same commit, and unmounting
 * releases it too.
 *
 * `useLayoutEffect`, not `useEffect`: the claim has to land in the same commit
 * the page's accent renders in. A passive effect would paint one frame with
 * both the page's accent and the Toolbar's before the Toolbar stood down —
 * a visible orange flicker on every navigation into Overview or Capsules.
 */
export function useOwnsViewAccent(owns: boolean): void {
  const view = useStore((s) => s.view);
  const claimViewAccent = useStore((s) => s.claimViewAccent);
  const releaseViewAccent = useStore((s) => s.releaseViewAccent);

  useLayoutEffect(() => {
    if (!owns) return;
    claimViewAccent(view);
    return () => releaseViewAccent(view);
  }, [owns, view, claimViewAccent, releaseViewAccent]);
}
