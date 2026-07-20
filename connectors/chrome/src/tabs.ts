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
