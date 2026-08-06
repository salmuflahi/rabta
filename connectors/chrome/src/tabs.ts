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

/** A tab matching a `tabs.close` url, reduced to what `closePlan` needs to
 * decide its fate. `id` is optional because Chrome does not always assign
 * one (see `chrome.tabs.Tab.id`) — a tab with no id cannot be closed. */
export interface CloseCandidate {
  id?: number;
  url: string;
  pinned: boolean;
  incognito: boolean;
  windowId: number;
}

/** The outcome for every tab open on one `tabs.close` url: either every
 * matching id may be removed, or none of them may and the url is kept for
 * one reason. */
export type ClosePlan = { close: number[] } | { kept: true; reason: string };

/**
 * Decides the fate of every tab open on one url before anything closes.
 * Pure — no `chrome` import — so the "don't close some and keep others"
 * accounting is unit-testable without a browser.
 *
 * One url can be open in several tabs. Closing them one at a time as each
 * verdict comes back is how a pinned tab in the middle of three turns into
 * two tabs gone and a report that says the url was left alone — by the
 * time the refusal is known, the damage is already done. So every match is
 * judged first; if any one of them must stay, NOTHING closes and the whole
 * url is reported kept, using that refusal's reason. Refusing to close a
 * url because one copy is pinned is the conservative, honest outcome.
 *
 * `closeVerdict` judges a single tab against its own window's total tab
 * count, so it can't see that several matches share a window: three tabs
 * in a 3-tab window each look fine alone (tabsInWindow > 1) but closing
 * all three empties the window exactly as closing an actual last tab
 * would. That case is caught separately here by grouping matches by
 * `windowId` and comparing against `windowTabCounts`.
 */
export function closePlan(matches: CloseCandidate[], windowTabCounts: Record<number, number>): ClosePlan {
  const ids: number[] = [];
  for (const m of matches) {
    const verdict = closeVerdict(m, windowTabCounts[m.windowId] ?? 0);
    if (!verdict.close) return { kept: true, reason: verdict.reason };
    if (m.id == null) return { kept: true, reason: "missing tab id" };
    ids.push(m.id);
  }

  const closingPerWindow = new Map<number, number>();
  for (const m of matches) {
    closingPerWindow.set(m.windowId, (closingPerWindow.get(m.windowId) ?? 0) + 1);
  }
  for (const [windowId, closing] of closingPerWindow) {
    if (closing >= (windowTabCounts[windowId] ?? 0)) {
      return { kept: true, reason: "the last tab in its window" };
    }
  }

  return { close: ids };
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
