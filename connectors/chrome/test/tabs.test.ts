import { describe, expect, it } from "vitest";
import { closeVerdict, isRestorableUrl, openedEventFor, snapshotTabs } from "../src/tabs";

const tab = (url: string, incognito = false, title = url) => ({ url, title, incognito });

describe("snapshotTabs", () => {
  it("keeps only http/https non-incognito tabs, deduped", () => {
    const state = snapshotTabs([
      tab("https://a.test"),
      tab("chrome://settings"),
      tab("http://b.test"),
      tab("https://a.test"), // dup
      tab("file:///etc/hosts"),
      tab("https://secret.test", true), // incognito
      tab("chrome-extension://x/popup.html"),
    ]);
    expect(state.tabs.map((t) => t.url)).toEqual(["https://a.test", "http://b.test"]);
  });

  it("carries titles and handles empty", () => {
    expect(snapshotTabs([]).tabs).toEqual([]);
    expect(snapshotTabs([tab("https://x.test", false, "X")]).tabs).toEqual([
      { url: "https://x.test", title: "X" },
    ]);
  });
});

describe("isRestorableUrl", () => {
  it("accepts http/https only", () => {
    expect(isRestorableUrl("https://x.test")).toBe(true);
    expect(isRestorableUrl("http://x.test")).toBe(true);
    expect(isRestorableUrl("chrome://x")).toBe(false);
    expect(isRestorableUrl("file:///x")).toBe(false);
    expect(isRestorableUrl("javascript:alert(1)")).toBe(false);
  });
});

describe("openedEventFor", () => {
  it("emits for a committed http/https, non-incognito url", () => {
    expect(openedEventFor({ url: "https://a.test", incognito: false })).toEqual({
      url: "https://a.test",
    });
    expect(openedEventFor({ url: "http://b.test", incognito: false })).toEqual({
      url: "http://b.test",
    });
  });

  it("never emits for an incognito tab, even with a committed http(s) url", () => {
    expect(openedEventFor({ url: "https://secret.test", incognito: true })).toBeNull();
  });

  it("does not emit for non-http(s) urls", () => {
    expect(openedEventFor({ url: "chrome://settings", incognito: false })).toBeNull();
    expect(openedEventFor({ url: "file:///etc/hosts", incognito: false })).toBeNull();
  });

  it("does not emit when the url is missing (e.g. an unrelated tab update)", () => {
    expect(openedEventFor({ incognito: false })).toBeNull();
  });
});

describe("closeVerdict", () => {
  const tab = (over: Partial<{ url: string; pinned: boolean; incognito: boolean }> = {}) => ({
    url: "https://a.test/",
    pinned: false,
    incognito: false,
    ...over,
  });

  it("closes an ordinary tab when it is not the last in its window", () => {
    expect(closeVerdict(tab(), 3)).toEqual({ close: true });
  });

  it("never closes a browser-pinned tab", () => {
    // Pinning a tab in Chrome is an explicit "this stays", independent of any capsule.
    expect(closeVerdict(tab({ pinned: true }), 3)).toEqual({
      close: false,
      reason: "pinned in the browser",
    });
  });

  it("never closes an incognito tab", () => {
    // Incognito is never captured, so it would read as unrelated and be closed.
    // This exclusion is load-bearing, not incidental.
    expect(closeVerdict(tab({ incognito: true }), 3)).toEqual({
      close: false,
      reason: "incognito",
    });
  });

  it("never closes the last tab in a window, because that closes the window", () => {
    expect(closeVerdict(tab(), 1)).toEqual({
      close: false,
      reason: "the last tab in its window",
    });
  });

  it("never closes a url it would refuse to open", () => {
    expect(closeVerdict(tab({ url: "chrome://extensions" }), 3)).toEqual({
      close: false,
      reason: "not an http(s) page",
    });
  });

  it("reports the strongest reason when several apply", () => {
    // A pinned incognito last tab is refused once, not three times.
    const v = closeVerdict(tab({ pinned: true, incognito: true }), 1);
    expect(v.close).toBe(false);
  });
});
