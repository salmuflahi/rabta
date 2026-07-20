import { describe, expect, it } from "vitest";
import { isRestorableUrl, snapshotTabs } from "../src/tabs";

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
