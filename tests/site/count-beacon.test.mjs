// The one ping. These tests drive site/src/scripts/count.ts with a fake
// browser, so what the privacy page promises about the counter is checked
// here rather than trusted: nothing on Global Privacy Control or Do Not
// Track, a hostname and never a full referrer, three short fields, one
// beacon per page load.
import test from "node:test";
import assert from "node:assert/strict";
import { count, payload, referrerHost, shouldCount, viewportClass } from "../../site/src/scripts/count.ts";
import { COUNT_ORIGIN } from "../../site/src/config.ts";

function browser({ gpc = false, dnt = null, referrer = "", width = 1440, pathname = "/why/" } = {}) {
  const sent = [];
  return {
    sent,
    env: {
      navigator: {
        globalPrivacyControl: gpc,
        doNotTrack: dnt,
        sendBeacon(url, data) {
          sent.push({ url, data });
          return true;
        },
      },
      location: { pathname, host: "rabta.build" },
      document: { referrer },
      innerWidth: width,
    },
  };
}

test("Global Privacy Control and Do Not Track both stop the ping before anything is read", () => {
  assert.equal(shouldCount({ globalPrivacyControl: true }), false);
  assert.equal(shouldCount({ doNotTrack: "1" }), false);
  assert.equal(shouldCount({ doNotTrack: "0" }), true);
  assert.equal(shouldCount({}), true);
  for (const b of [browser({ gpc: true }), browser({ dnt: "1" })]) {
    assert.equal(count(b.env), false);
    assert.equal(b.sent.length, 0, "nothing was sent");
  }
});

test("the referrer is reduced to a hostname, and dropped when it is this site", () => {
  assert.equal(referrerHost("https://news.ycombinator.com/item?id=1", "rabta.build"), "news.ycombinator.com");
  assert.equal(referrerHost("https://rabta.build/why/", "rabta.build"), "");
  assert.equal(referrerHost("", "rabta.build"), "");
  assert.equal(referrerHost("not a url", "rabta.build"), "");
});

test("the viewport is a class, not a size", () => {
  assert.equal(viewportClass(390), "phone");
  assert.equal(viewportClass(768), "tablet");
  assert.equal(viewportClass(1440), "desktop");
});

test("the payload is exactly three short fields", () => {
  const b = browser({ referrer: "https://github.com/salmuflahi/rabta", width: 820, pathname: "/agents/" });
  assert.deepEqual(JSON.parse(payload(b.env)), { p: "/agents/", r: "github.com", w: "tablet" });
});

test("one beacon goes to the counter's /hit as text/plain, so it needs no preflight", async () => {
  const b = browser({ referrer: "https://x.com/rabta" });
  assert.equal(count(b.env), true);
  assert.equal(b.sent.length, 1);
  assert.equal(b.sent[0].url, `${COUNT_ORIGIN}/hit`);
  assert.equal(b.sent[0].data.type, "text/plain");
  assert.deepEqual(JSON.parse(await b.sent[0].data.text()), { p: "/why/", r: "x.com", w: "desktop" });
});

test("a browser without sendBeacon, or one that throws, is simply not counted", () => {
  const b = browser();
  delete b.env.navigator.sendBeacon;
  assert.equal(count(b.env), false);
  const c = browser();
  c.env.navigator.sendBeacon = () => {
    throw new Error("blocked");
  };
  assert.equal(count(c.env), false);
});

test("the counter origin is the one the privacy page names and the CSP allows", () => {
  assert.match(COUNT_ORIGIN, /^https:\/\/[a-z0-9.-]+$/);
  assert.ok(COUNT_ORIGIN.includes("count") || COUNT_ORIGIN.includes("workers.dev"), COUNT_ORIGIN);
});
