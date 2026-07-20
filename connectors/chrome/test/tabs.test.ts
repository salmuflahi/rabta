import { describe, expect, it } from "vitest";
import { isRestorableUrl, openedEventFor, snapshotTabs } from "../src/tabs";

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
