import { describe, expect, it } from "vitest";
import { installTabListeners, type ChromeTabsApi } from "../src/tab-events";

/** A stubbed chrome.tabs — just the onUpdated/onRemoved listener registries
 * installTabListeners wires against — plus helpers to fire events the way
 * the real chrome.tabs API would. */
function fakeChromeTabs() {
  const updatedListeners: Array<
    (tabId: number, changeInfo: { url?: string }, tab: { incognito?: boolean }) => void
  > = [];
  const removedListeners: Array<(tabId: number) => void> = [];

  const api: ChromeTabsApi = {
    onUpdated: {
      addListener: (cb) => updatedListeners.push(cb),
    },
    onRemoved: {
      addListener: (cb) => removedListeners.push(cb),
    },
  };

  return {
    api,
    fireUpdated(tabId: number, changeInfo: { url?: string }, tab: { incognito?: boolean } = {}) {
      for (const cb of updatedListeners) cb(tabId, changeInfo, tab);
    },
    fireRemoved(tabId: number) {
      for (const cb of removedListeners) cb(tabId);
    },
  };
}

function fakeEmit() {
  const emits: Array<{ name: string; data: unknown }> = [];
  return { emit: (name: string, data: unknown) => emits.push({ name, data }), emits };
}

describe("installTabListeners", () => {
  it("emits tab.opened when a tab commits a non-incognito http(s) url", () => {
    const chromeTabs = fakeChromeTabs();
    const { emit, emits } = fakeEmit();
    installTabListeners(chromeTabs.api, emit);

    chromeTabs.fireUpdated(7, { url: "https://a.test" }, { incognito: false });

    expect(emits).toEqual([{ name: "tab.opened", data: { url: "https://a.test" } }]);
  });

  it("emits tab.closed with the remembered url when the tab is removed", () => {
    const chromeTabs = fakeChromeTabs();
    const { emit, emits } = fakeEmit();
    installTabListeners(chromeTabs.api, emit);

    chromeTabs.fireUpdated(7, { url: "https://a.test" }, { incognito: false });
    emits.length = 0; // only care about the close below
    chromeTabs.fireRemoved(7);

    expect(emits).toEqual([{ name: "tab.closed", data: { url: "https://a.test" } }]);
  });

  it("never emits for an incognito tab, on either open or close", () => {
    const chromeTabs = fakeChromeTabs();
    const { emit, emits } = fakeEmit();
    installTabListeners(chromeTabs.api, emit);

    chromeTabs.fireUpdated(9, { url: "https://secret.test" }, { incognito: true });
    chromeTabs.fireRemoved(9);

    expect(emits).toEqual([]);
  });

  it("ignores onUpdated events with no url (unrelated tab changes)", () => {
    const chromeTabs = fakeChromeTabs();
    const { emit, emits } = fakeEmit();
    installTabListeners(chromeTabs.api, emit);

    chromeTabs.fireUpdated(1, {}, { incognito: false });

    expect(emits).toEqual([]);
  });

  it("does not emit tab.closed for a tab that was never tracked as opened", () => {
    const chromeTabs = fakeChromeTabs();
    const { emit, emits } = fakeEmit();
    installTabListeners(chromeTabs.api, emit);

    chromeTabs.fireRemoved(42);

    expect(emits).toEqual([]);
  });

  it("forgets a tab after it closes, so a later removal doesn't re-emit", () => {
    const chromeTabs = fakeChromeTabs();
    const { emit, emits } = fakeEmit();
    installTabListeners(chromeTabs.api, emit);

    chromeTabs.fireUpdated(7, { url: "https://a.test" }, { incognito: false });
    chromeTabs.fireRemoved(7);
    emits.length = 0;
    chromeTabs.fireRemoved(7); // duplicate/late onRemoved

    expect(emits).toEqual([]);
  });
});
