import { openedEventFor } from "./tabs";

/** The subset of `chrome.tabs` this module listens on; injectable so the
 * listener wiring is testable without a real browser (background.ts has
 * other top-level side effects that touch the real `chrome` global, so this
 * lives in its own module rather than being imported directly by tests). */
export interface ChromeTabsApi {
  onUpdated: {
    addListener(
      cb: (tabId: number, changeInfo: { url?: string }, tab: { incognito?: boolean }) => void,
    ): void;
  };
  onRemoved: {
    addListener(cb: (tabId: number, removeInfo?: unknown) => void): void;
  };
}

/** Emits a named event with a payload; matches `Connection.emit`. */
export type Emit = (name: string, data: unknown) => void;

/**
 * Wires reliable tab lifecycle events:
 * - `tab.opened` fires from `tabs.onUpdated` when a committed http/https,
 *   non-incognito url lands (`onCreated`'s `pendingUrl` is not a committed
 *   url and is unreliable — this is the fix for tab.opened rarely firing).
 * - `tab.closed` fires from `tabs.onRemoved`, looking up the tab's
 *   last-known url in a tabId→url map populated by the `onUpdated` listener
 *   above (`onRemoved` carries no url on its own).
 *
 * Incognito tabs are excluded via `openedEventFor` — they are never
 * recorded in the map and never emitted, so a `tab.closed` for a formerly-
 * incognito tab can never fire either.
 *
 * Returns the tabId→url map for tests to inspect; production callers can
 * ignore it.
 */
export function installTabListeners(chromeApi: ChromeTabsApi, emit: Emit): Map<number, string> {
  const tabUrls = new Map<number, string>();

  chromeApi.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!changeInfo.url) return;
    const decision = openedEventFor({ url: changeInfo.url, incognito: tab.incognito ?? false });
    if (!decision) return;
    tabUrls.set(tabId, decision.url);
    emit("tab.opened", decision);
  });

  chromeApi.onRemoved.addListener((tabId) => {
    const url = tabUrls.get(tabId);
    if (url === undefined) return;
    tabUrls.delete(tabId);
    emit("tab.closed", { url });
  });

  return tabUrls;
}
