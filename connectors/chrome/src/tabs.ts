/** A browser tab reduced to the fields capture needs (matches chrome.tabs.Tab). */
export interface RawTab {
  url: string;
  title: string;
  incognito: boolean;
}

/** A captured tab on the wire. */
export interface Tab {
  url: string;
  title: string;
}

/** The `workspace.state` reply shape for the chrome connector. */
export interface TabsState {
  tabs: Tab[];
}

const HTTP = /^https?:\/\//i;

/** Only http/https URLs are ever captured or restored (privacy: no chrome://,
 * file://, extension pages, or javascript: URLs). */
export function isRestorableUrl(url: string): boolean {
  return HTTP.test(url);
}

/** Maps raw tabs to the wire state: http/https and non-incognito only,
 * deduped by url in first-seen order. Never touches page content. */
export function snapshotTabs(raw: RawTab[]): TabsState {
  const seen = new Set<string>();
  const tabs: Tab[] = [];
  for (const t of raw) {
    if (t.incognito || !isRestorableUrl(t.url) || seen.has(t.url)) continue;
    seen.add(t.url);
    tabs.push({ url: t.url, title: t.title });
  }
  return { tabs };
}

/** Why a tab was left alone. `close: false` is a refusal, not a failure — the
 *  desktop records it as kept. */
export type CloseVerdict = { close: true } | { close: false; reason: string };

/**
 * Whether focus mode may close this tab. Pure — no `chrome` import — so every
 * guard is testable without a browser.
 *
 * These are the facts only the browser holds. The desktop decides what does not
 * belong to a task; it cannot see that a tab is pinned, incognito, or the last
 * one keeping a window open, and asking it to would leave a gap between the
 * report and the close in which a window can empty.
 */
export function closeVerdict(
  tab: { url: string; pinned: boolean; incognito: boolean },
  tabsInWindow: number,
): CloseVerdict {
  if (tab.incognito) return { close: false, reason: "incognito" };
  if (tab.pinned) return { close: false, reason: "pinned in the browser" };
  if (!isRestorableUrl(tab.url)) return { close: false, reason: "not an http(s) page" };
  if (tabsInWindow <= 1) return { close: false, reason: "the last tab in its window" };
  return { close: true };
}

/** Decides whether a tab update should emit `tab.opened`: a committed
 * http/https, non-incognito url. Pure — no `chrome` import — so the
 * incognito exclusion and scheme filter are unit-testable without a
 * browser. Chrome does not supply a committed `url` on `tabs.onCreated`
 * (only `pendingUrl`), so this is meant to be driven from `tabs.onUpdated`
 * once `changeInfo.url` lands. */
export function openedEventFor(update: { url?: string; incognito: boolean }): { url: string } | null {
  if (!update.incognito && update.url && isRestorableUrl(update.url)) return { url: update.url };
  return null;
}
