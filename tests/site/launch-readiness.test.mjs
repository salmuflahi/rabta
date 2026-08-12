// Launch readiness — the properties that have to hold before this site is
// advertised, as opposed to merely built.
//
// The existing site-contract suite covers design (palette, rhythm, semantics)
// and the no-third-party rule. This file covers the rest of what "ready to put
// in front of people" means: a policy that is actually delivered, metadata that
// is actually unique, media slots that cannot silently ship empty, and links
// that cannot silently 404.

import { readFile, access } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), "../../website");

/** The eight routes a visitor can reach, and the file each is served from. */
const PAGES = {
  "/": "index.html",
  "/why/": "why/index.html",
  "/setup/": "setup/index.html",
  "/faq/": "faq/index.html",
  "/roadmap/": "roadmap/index.html",
  "/changelog/": "changelog/index.html",
  "/contact/": "contact/index.html",
  "/privacy/": "privacy/index.html",
};

const read = (file) => readFile(resolve(SITE, file), "utf8");
const all = async () =>
  Object.fromEntries(
    await Promise.all(
      Object.entries(PAGES).map(async ([route, file]) => [route, await read(file)]),
    ),
  );

test("every page delivers the security policy", async () => {
  // GitHub Pages cannot set response headers, so the policy ships as a meta
  // element. If a page misses it, that page has no policy at all — this is the
  // check that stops one route being quietly exempt.
  for (const [route, file] of Object.entries(PAGES)) {
    const html = await read(file);
    assert.match(html, /http-equiv="Content-Security-Policy"/, route);
    assert.match(html, /name="referrer" content="strict-origin-when-cross-origin"/, route);
  }
});

test("the policy forbids exactly what the site does not use", async () => {
  const head = await read("_chrome/head.html");
  // The policy is the `content` attribute — not the file, whose comment
  // legitimately mentions 'unsafe-inline' while explaining why it is absent.
  const policy = head.match(/Content-Security-Policy" content="([^"]+)"/)?.[1] ?? "";
  assert.ok(policy, "no policy found in the shared head");

  // Each of these is only safe to forbid because the site genuinely does not
  // rely on it — the two tests below prove that rather than assuming it.
  for (const directive of [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "upgrade-insecure-requests",
  ]) {
    assert.ok(policy.includes(directive), `missing directive: ${directive}`);
  }

  // 'unsafe-inline' / 'unsafe-eval' would make script-src and style-src
  // decorative. If either ever appears, the policy is no longer a policy.
  assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval/);
});

test("no page relies on inline styles or scripts, so the policy holds", async () => {
  // The CSP above forbids both. A page that used either would be broken in
  // production but fine in a local file:// preview, which is exactly the class
  // of bug that reaches users.
  for (const [route, html] of Object.entries(await all())) {
    assert.doesNotMatch(html, /\sstyle="/, `${route}: inline style attribute`);
    assert.doesNotMatch(html, /<style[\s>]/, `${route}: inline <style> block`);
    for (const tag of html.match(/<script(?![^>]*\bsrc=)[^>]*>/g) ?? []) {
      assert.match(
        tag,
        /type="application\/ld\+json"/,
        `${route}: inline <script> that is not structured data — ${tag}`,
      );
    }
  }
});

test("every page is independently addressable in search and social", async () => {
  const titles = new Map();
  const descriptions = new Map();

  for (const [route, html] of Object.entries(await all())) {
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    const desc = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];

    assert.ok(title, `${route}: no <title>`);
    assert.ok(desc, `${route}: no description`);
    assert.equal(canonical, `https://rabta.build${route}`, `${route}: canonical`);

    // A shared title or description means two pages compete for the same
    // search result, and one of them loses.
    assert.ok(!titles.has(title), `${route}: title duplicates ${titles.get(title)}`);
    assert.ok(!descriptions.has(desc), `${route}: description duplicates ${descriptions.get(desc)}`);
    titles.set(title, route);
    descriptions.set(desc, route);

    // Open Graph, so a shared link renders as something other than a bare URL.
    assert.match(html, /property="og:title"/, `${route}: og:title`);
    assert.match(html, /property="og:description"/, `${route}: og:description`);
    assert.match(html, /property="og:image"/, `${route}: og:image`);
    assert.match(
      html,
      new RegExp(`property="og:url" content="https://rabta\\.build${route}"`),
      `${route}: og:url must match the canonical`,
    );
  }
});

test("the sitemap lists exactly the pages that exist", async () => {
  const xml = await read("sitemap.xml");
  const listed = [...xml.matchAll(/<loc>https:\/\/rabta\.build([^<]*)<\/loc>/g)].map(
    (m) => m[1],
  );
  assert.deepEqual(
    [...listed].sort(),
    Object.keys(PAGES).sort(),
    "sitemap and routes disagree",
  );
});

test("a media slot cannot ship silently empty", async () => {
  // Slots are deliberately empty until real media replaces them. The failure
  // this guards is the other one: a slot that lost its placeholder marker and
  // now renders as a blank box nobody notices.
  for (const [route, html] of Object.entries(await all())) {
    for (const slot of html.match(/<figure[^>]*class="media-slot[^"]*"[^>]*>/g) ?? []) {
      assert.match(
        slot,
        /data-placeholder|data-slot-filled/,
        `${route}: media slot is neither marked a placeholder nor filled — ${slot.slice(0, 80)}`,
      );
      // A slot with no reserved ratio causes layout shift when the real asset
      // lands, which is the whole reason to reserve one.
      assert.match(
        slot,
        /media-slot--(?:16x10|16x9|4x3|square)/,
        `${route}: media slot reserves no aspect ratio — ${slot.slice(0, 80)}`,
      );
    }
  }
});

test("no internal link points at a page that does not exist", async () => {
  const known = new Set(Object.keys(PAGES));
  for (const [route, html] of Object.entries(await all())) {
    for (const [, href] of html.matchAll(/href="(\/[^"#?]*)"/g)) {
      if (known.has(href)) continue;
      // Anything else must be a real file in website/.
      await assert.doesNotReject(
        () => access(resolve(SITE, href.replace(/^\//, ""))),
        `${route}: dead internal link ${href}`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Cross-page facts.
//
// Every check above this line reads one page at a time, which is why a whole
// class of defect shipped green: five pages written in parallel, four drifting
// from a source of truth a sixth already had right. The worst of them told
// readers the build was unsigned and that the correct first launch was the
// Gatekeeper bypass gesture — on a site whose setup page says, correctly, that
// a Gatekeeper warning means the file is not the one that was signed. Both
// pages passed every test in this file.
//
// A claim that appears on two pages has to say the same thing on both. These
// assertions pin the handful that are load-bearing: distribution status,
// signing status, and how many things can reach the network.

test("no page contradicts the signing status of the build it links to", async () => {
  // The artifact is Developer-ID signed with a stapled notarization ticket
  // (`codesign -dv`, `stapler validate`, `spctl -a -t install` all agree).
  // Saying otherwise anywhere trains readers to expect — and work around — a
  // warning that in reality only appears on a tampered file.
  for (const [route, html] of Object.entries(await all())) {
    const prose = html.replace(/<!--[\s\S]*?-->/g, "");
    assert.doesNotMatch(
      prose,
      /\bunsigned\b/i,
      `${route}: calls the build unsigned — it is signed and notarized`,
    );
    // The bypass gesture, in the forms a page would actually write it.
    assert.doesNotMatch(
      prose,
      /right-click\s*(?:›|→|->|&rsaquo;|›)\s*<b>\s*Open|right-click\s*(?:›|→|->)\s*Open\b(?![^.]*\bnot\b)/i,
      `${route}: instructs the Gatekeeper bypass as a normal first launch`,
    );
  }
});

test("the extension distribution story is the same on every page that tells it", async () => {
  const pages = await all();

  // Both connectors are published. "Installs by hand" was true before they
  // were, and survived on three pages after the correction landed on a fourth.
  for (const [route, html] of Object.entries(pages)) {
    const prose = html.replace(/<!--[\s\S]*?-->/g, "");
    assert.doesNotMatch(
      prose,
      /extensions? install by hand\b(?!\s*(?:for stock|today for))/i,
      `${route}: says the extensions install by hand — both are published`,
    );
    assert.doesNotMatch(
      prose,
      /pending\s+chrome\s+web\s+store|once\s+review\s+completes|awaiting\s+review/i,
      `${route}: describes the browser extension as awaiting store review`,
    );
  }

  // This assertion used to require the opposite. It asked /setup/ to explain
  // why stock VS Code needed a hand-installed .vsix — and it kept passing after
  // `rabta-connect.rabta-vscode` had been live on the Visual Studio Marketplace
  // since 28 July, publisher flagged `verified`. A guard that pins a fact
  // nobody re-checks does not protect the fact; it preserves it after it stops
  // being true, and this one was actively holding four pages wrong.
  //
  // So it is inverted: the Marketplace is a place the extension IS, and no page
  // may say otherwise.
  for (const [route, html] of Object.entries(pages)) {
    const prose = html.replace(/<!--[\s\S]*?-->/g, "");
    assert.doesNotMatch(
      prose,
      /not (?:yet )?(?:on|published)[^.]{0,80}Marketplace|Marketplace[^.]{0,80}not (?:yet )?published/i,
      `${route}: says the extension is missing from the Marketplace — it is not`,
    );
    assert.doesNotMatch(
      prose,
      /Azure DevOps token/i,
      `${route}: still describes the Marketplace listing as blocked`,
    );
  }

  // And /setup/ points at both registries, so a reader on any of the four
  // editors is told where theirs gets it from.
  assert.match(
    pages["/setup/"],
    /marketplace\.visualstudio\.com\/items\?itemName=rabta-connect\.rabta-vscode/,
    "/setup/: no link to the Marketplace listing",
  );
  assert.match(
    pages["/setup/"],
    /open-vsx\.org\/extension\/rabta-connect\/rabta-vscode/,
    "/setup/: no link to the Open VSX listing",
  );
});

test("the pinned .vsix matches the version the page says it is", async () => {
  // /setup/ can legitimately be in two states: both registries on the same
  // version, or briefly split while one upload catches up. Either way the
  // pinned download and the prose must agree, or the page hands over a build it
  // just described as something else.
  const setup = await read("setup/index.html");

  const unified = setup.match(/rabta-vscode<\/code>, version ([\d.]+)\)/)?.[1];
  const openVsx = setup.match(/Open VSX serves\s*<strong>([\d.]+)<\/strong>/)?.[1];
  const stated = unified ?? openVsx;
  assert.ok(stated, "/setup/: states no extension version at all");

  // The pinned file is served by Open VSX, so it tracks that registry's number.
  const pinned = [
    ...setup.matchAll(/open-vsx\.org\/api\/rabta-connect\/rabta-vscode\/([\d.]+)\//g),
  ].map((m) => m[1]);
  assert.ok(pinned.length, "/setup/: no pinned Open VSX download");
  for (const version of pinned) {
    assert.equal(version, stated, "/setup/: pinned .vsix is not the stated version");
  }
  assert.ok(
    setup.includes(`rabta-connect.rabta-vscode-${stated}.vsix`),
    "/setup/: the filename in the install command is not the stated version",
  );

  // A split has to name both sides. Naming only one is how a reader on the
  // other registry ends up looking for something that is not there.
  if (!unified) {
    assert.match(
      setup,
      /Marketplace still serves\s*<strong>[\d.]+<\/strong>/,
      "/setup/: names the Open VSX version but not the Marketplace one",
    );
  }
});

test("no page claims fewer network calls than another page documents", async () => {
  // Two user-initiated calls exist: `git fetch` and the optional GitHub issue
  // features, which shell out to `gh`. The privacy page counted them
  // correctly; the FAQ claimed there was one, on the same page that goes on to
  // describe the other. "No call on launch or on a timer" is the true and
  // sufficient claim — an exclusivity count is neither.
  for (const [route, html] of Object.entries(await all())) {
    const prose = html.replace(/<!--[\s\S]*?-->/g, "");
    assert.doesNotMatch(
      prose,
      /\bthe (?:one|only|single) network (?:call|request)\b/i,
      `${route}: claims a single network call — there are two, both click-gated`,
    );
  }
});

test("404 obeys the same inline-content rules as a real route", async () => {
  // It is not in PAGES (it has no route and belongs in no sitemap), which
  // meant the CSP-compatibility assertions never ran against it. The CSP
  // applies to it exactly as it does to everything else.
  const html = await read("404.html");
  assert.match(html, /http-equiv="Content-Security-Policy"/, "404: no policy");
  assert.doesNotMatch(html, /\sstyle="/, "404: inline style attribute");
  assert.doesNotMatch(html, /<style[\s>]/, "404: inline <style> block");
  for (const tag of html.match(/<script(?![^>]*\bsrc=)[^>]*>/g) ?? []) {
    assert.match(tag, /type="application\/ld\+json"/, `404: inline <script> — ${tag}`);
  }
});

test("every off-site link is https and cannot reach back through window.opener", async () => {
  for (const [route, html] of Object.entries(await all())) {
    for (const [tag, href] of html.matchAll(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>/g)) {
      // Every off-site link must be https, whether or not it opens a new tab.
      assert.ok(href.startsWith("https://"), `${route}: insecure link ${href}`);

      // rel=noopener/noreferrer only matters where a new browsing context is
      // created — that is the only case where the opened page gets a handle
      // back through window.opener.
      if (!/target="_blank"/.test(tag)) continue;
      assert.match(tag, /rel="[^"]*noopener/, `${route}: ${href} lacks rel=noopener`);
      assert.match(tag, /rel="[^"]*noreferrer/, `${route}: ${href} lacks rel=noreferrer`);
    }
  }
});
