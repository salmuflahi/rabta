import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/sonner";
import { toastErr } from "@/lib/toast";

interface DeferredDeleteOptions<T extends { id: string }> {
  /** The real delete invoke, e.g. `(p) => invoke("delete_project", { id: p.id })`. */
  commit: (item: T) => Promise<void>;
  /** Human label for the toast, e.g. `(p) => p.name`. */
  labelOf: (item: T) => string;
  /** Called after a successful commit (typically the page's `refresh`). */
  onCommitted?: () => void;
  /** Undo window in ms. Defaults to 5000. */
  delayMs?: number;
}

interface PendingEntry<T> {
  item: T;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Reusable deferred-commit "Undo for delete": `requestDelete(item)`
 * optimistically hides the row (via `pendingIds`) and shows an Undo toast.
 * The real `commit` invoke only fires after `delayMs` if the user hasn't
 * clicked Undo. No backend call happens until the window elapses (or the
 * component unmounts — see the flush note below).
 */
export function useDeferredDelete<T extends { id: string }>(opts: DeferredDeleteOptions<T>) {
  const { commit, labelOf, onCommitted, delayMs = 5000 } = opts;

  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  // Per-id timer + the item it applies to, so both cancel() and the
  // unmount-flush cleanup can reach the right invoke without depending on
  // component state (state read inside a setTimeout closure would be stale).
  const pendingRef = useRef<Map<string, PendingEntry<T>>>(new Map());

  // Refs for the latest callbacks: the timeout closure that fires later must
  // call the CURRENT commit/onCommitted, not whatever was passed in on the
  // render that created the timer (the page's `refresh` identity may change
  // across renders).
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const onCommittedRef = useRef(onCommitted);
  onCommittedRef.current = onCommitted;

  const reveal = useCallback((id: string) => {
    setPendingIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const runCommit = useCallback(
    async (id: string, item: T) => {
      try {
        await commitRef.current(item);
        pendingRef.current.delete(id);
        reveal(id);
        onCommittedRef.current?.();
      } catch (e) {
        // The delete failed server-side: restore the row (it's still there)
        // and surface the error, same as any other failed action.
        pendingRef.current.delete(id);
        toastErr(e);
        reveal(id);
      }
    },
    [reveal]
  );

  const cancel = useCallback(
    (id: string) => {
      const entry = pendingRef.current.get(id);
      if (!entry) return;
      clearTimeout(entry.timer);
      pendingRef.current.delete(id);
      reveal(id);
    },
    [reveal]
  );

  const requestDelete = useCallback(
    (item: T) => {
      const id = item.id;
      const stale = pendingRef.current.get(id);
      if (stale) clearTimeout(stale.timer);

      const timer = setTimeout(() => {
        void runCommit(id, item);
      }, delayMs);
      pendingRef.current.set(id, { item, timer });

      setPendingIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });

      toast(`${labelOf(item)} deleted`, {
        action: {
          label: "Undo",
          onClick: () => cancel(id),
        },
        duration: delayMs,
      });
    },
    [delayMs, labelOf, runCommit, cancel]
  );

  // Unmount flush: any deletes still within their undo window get committed
  // immediately rather than silently resurrected. The user already chose to
  // delete these rows — navigating away before the 5s window closes is not
  // the same as clicking Undo, so we honor the delete rather than lose it.
  // Fire-and-forget: the page is gone, so there's nothing left to update on
  // success/failure other than the toast (toastErr still fires on failure;
  // there's no row left to restore on this unmounted page).
  useEffect(() => {
    return () => {
      for (const [, entry] of pendingRef.current) {
        clearTimeout(entry.timer);
        void commitRef.current(entry.item).then(
          () => onCommittedRef.current?.(),
          (e) => toastErr(e)
        );
      }
      pendingRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { pendingIds, requestDelete };
}
