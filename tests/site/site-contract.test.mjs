import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { COMPONENTS, SCRIPTS, SITE, STYLES, builtCssFor, localReferences, readRoute, stripFrontmatter } from "./helpers.mjs";
import { MARK_DRAW as SITE_MARK_DRAW } from "../../site/src/scripts/mark-draw.ts";
import { MARK_DRAW as APP_MARK_DRAW } from "../../apps/desktop/src/lib/motion.ts";

// Every route the site serves. A page that no test knows about is a page
// that can ship anything.
const routes = [
  "/",
  "/why/",
  "/brand/",
  "/capsules/",
  "/agents/",
  "/setup/",
  "/faq/",
  "/roadmap/",
  "/changelog/",
  "/contact/",
  "/privacy/",
  "/404.html",
];

/** The nine real pages — `routes` minus the 404, which is exempt from the
 * sitemap and the current-route marking. */
const pages = routes.filter((route) => route !== "/404.html");

// ---------------------------------------------------------------------------
// The brand: paper, ink, one ember.
// docs/superpowers/specs/2026-09-03-rabta-brand-redesign-design.md §2.

/** The thirteen colour literals the brand owns. tokens.css defines them and
 * no other stylesheet may introduce a fourteenth. */
const PALETTE = new Set([
  "#ffffff",
  "#f5f5f7",
  "#eaeaee",
  "#0a0b0e",
  "#14161b",
  "#1e2128",
  "#ff6b2c",
  "#c2501b",
  "#0e0f12",
  "#4a4d57",
  "#6f7380",
  "#b4b8c2",
  "#7c808b",
]);

/** macOS's own window-control colours, on the window frame's traffic lights.
 * A quotation, not a palette addition: used once each, in page.css only. */
const QUOTED = new Set(["#ff5f57", "#febc2e", "#28c840"]);

/** The site's stylesheets as written. Astro bundles them per page family. */
const STYLESHEETS = ["tokens.css", "shell.css", "landing.css", "page.css", "doc.css"];

// `&#8220;`-style entities are not colours, hence the lookbehind.
const hexLiterals = (source) =>
  [...source.matchAll(/(?<![&\w])#[0-9a-f]{3,8}\b/gi)].map((m) => m[0].toLowerCase());

test("every route wears the same stylesheets and one h1", async () => {
  for (const route of routes) {
    const html = await readRoute(route);
    const css = await builtCssFor(html);
    assert.ok(css.length > 0, `${route}: links no built stylesheet`);
    assert.match(css, /@layer tokens/, `${route}: tokens`);
    assert.match(css, /\.nav__inner/, `${route}: shell`);
    assert.match(css, /\.window__lights/, `${route}: page components`);
    assert.match(css, route === "/" ? /\.hero__/ : /\.doc-grid/, `${route}: the page family's own sheet`);
    assert.doesNotMatch(html, /receipt-fold|instrument\.js|reveal\.js/, route);
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1, route);
  }
});

test("the palette is thirteen literals, all of them in tokens.css", async () => {
  const tokens = (await readFile(resolve(STYLES, "tokens.css"), "utf8")).toLowerCase();
  for (const value of PALETTE) {
    assert.match(tokens, new RegExp(value), `tokens.css defines ${value}`);
  }
  for (const value of hexLiterals(tokens)) {
    assert.ok(PALETTE.has(value), `tokens.css: unapproved colour ${value}`);
  }
  // Petrol is gone on every surface of the brand.
  for (const file of STYLESHEETS) {
    const css = (await readFile(resolve(STYLES, file), "utf8")).toLowerCase();
    assert.doesNotMatch(css, /#102526|#173239|#66858c|#a9bec2|#d9e3e3|#f3f0e8/, `${file}: petrol`);
  }
});

test("no stylesheet or page introduces a colour the brand does not own", async () => {
  for (const file of STYLESHEETS) {
    const css = await readFile(resolve(STYLES, file), "utf8");
    for (const value of hexLiterals(css)) {
      assert.ok(
        PALETTE.has(value) || (file === "page.css" && QUOTED.has(value)),
        `${file}: unapproved colour ${value}`,
      );
    }
  }

  // The traffic lights: once each, only on the lights, only in page.css.
  const page = await readFile(resolve(STYLES, "page.css"), "utf8");
  for (const value of QUOTED) {
    assert.equal((page.match(new RegExp(value, "gi")) ?? []).length, 1, `${value} is used more than once`);
    assert.match(
      page,
      new RegExp(`\\.window__lights span:nth-child\\(\\d\\) \\{\\s*background: ${value};`, "i"),
      `${value} is used outside the traffic lights`,
    );
  }

  for (const route of routes) {
    const html = await readRoute(route);
    const body = html.match(/<body[\s\S]*<\/body>/)?.[0] ?? html;
    for (const value of hexLiterals(body)) {
      assert.ok(PALETTE.has(value), `${route}: unapproved colour ${value} in markup`);
    }
    assert.match(html, /<meta name="theme-color" content="#0a0b0e"\s*\/?>/, `${route}: theme-color`);
    assert.match(html, /<meta name="color-scheme" content="dark"\s*\/?>/, `${route}: color-scheme`);
  }
});

test("the mark's geometry is the brand source, wherever it is inlined", async () => {
  const source = await readFile(resolve(SITE, "assets/brand/mark.svg"), "utf8");
  const strokes = [...source.matchAll(/\bd="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(strokes.length, 3, "mark.svg carries three strokes");

  let inlined = 0;
  for (const route of routes) {
    const html = await readRoute(route);
    for (const [svg] of html.matchAll(/<svg class="mark"[\s\S]*?<\/svg>/g)) {
      inlined += 1;
      const d = [...svg.matchAll(/\bd="([^"]+)"/g)].map((m) => m[1]);
      assert.deepEqual(d, strokes, `${route}: an inline mark drifted from mark.svg`);
      assert.match(svg, /class="stem/, `${route}: stem`);
      assert.match(svg, /class="bowl/, `${route}: bowl`);
      assert.match(svg, /class="leg/, `${route}: leg`);
    }
  }
  assert.ok(inlined >= 5, `the mark is inlined on the pages that draw it (${inlined})`);

  // The tile and the lockups are generated from the same geometry.
  const tile = await readFile(resolve(SITE, "assets/brand/rabta-mark.svg"), "utf8");
  for (const d of strokes) assert.ok(tile.includes(d), "the tile carries the mark's strokes");
  for (const file of ["lockup.svg", "lockup-paper.svg", "lockup-mono.svg"]) {
    const lockup = await readFile(resolve(SITE, `assets/brand/${file}`), "utf8");
    for (const d of strokes) assert.ok(lockup.includes(d), `${file} carries the mark's strokes`);
  }
});

test("the type is Inter 4 with both axes, self-hosted, preloaded once", async () => {
  const font = await stat(resolve(SITE, "assets/fonts/inter-var.woff2"));
  assert.ok(font.size > 20_000 && font.size < 90_000, `subset is ${font.size} bytes`);
  const tokens = await readFile(resolve(STYLES, "tokens.css"), "utf8");
  assert.match(tokens, /font-family: "Inter Var";/);
  assert.match(tokens, /font-weight: 400 700;/);
  const shell = await readFile(resolve(STYLES, "shell.css"), "utf8");
  assert.match(shell, /font-optical-sizing: auto;/, "the display cut is on");
  for (const route of routes) {
    const html = await readRoute(route);
    assert.equal(
      (html.match(/rel="preload" as="font"[^>]*inter-var\.woff2/g) ?? []).length,
      1,
      `${route}: preloads the font once`,
    );
    assert.doesNotMatch(html, /inter-latin-variable/, `${route}: the old subset`);
  }
});

test("the brand's own copy carries no em-dash", async () => {
  // Headings and paragraphs on the pages written for the redesign, and the
  // shared chrome. Reference documents (/setup/, /privacy/, /faq/, /roadmap/,
  // /changelog/, /contact/) keep their prose as written.
  for (const route of ["/", "/why/", "/brand/", "/capsules/", "/agents/", "/404.html"]) {
    const html = await readRoute(route);
    const body = (html.match(/<main[\s\S]*<\/main>/)?.[0] ?? "").replace(/<!--[\s\S]*?-->/g, "");
    for (const [block] of body.matchAll(/<(?:h[1-3]|p)\b[^>]*>[\s\S]*?<\/(?:h[1-3]|p)>/g)) {
      if (/window__title/.test(block)) continue;
      assert.doesNotMatch(block.replace(/<[^>]+>/g, ""), /[—–]/, `${route}: ${block.slice(0, 80)}`);
    }
  }
  for (const file of ["Nav.astro", "Foot.astro"]) {
    const chrome = stripFrontmatter(await readFile(resolve(COMPONENTS, file), "utf8")).replace(/<!--[\s\S]*?-->/g, "");
    assert.doesNotMatch(chrome.replace(/<[^>]+>/g, ""), /[—–]/, file);
  }
});

// ---------------------------------------------------------------------------
// The shell.

test("every route wears the same shell", async () => {
  for (const route of routes) {
    const html = await readRoute(route);
    assert.equal((html.match(/<main\b/g) ?? []).length, 1, route);
    assert.match(html, /<header class="nav" data-nav>/, route);
    assert.match(html, /class="rail nav__inner"/, route);
    assert.match(html, /<footer class="foot">/, route);
    assert.match(html, /class="rail foot__grid"/, route);

    // The lockup, in both colourways, in the nav and the footer.
    const nav = html.match(/<header class="nav"[\s\S]*?<\/header>/)?.[0] ?? "";
    assert.match(nav, /class="brand__ink" src="\/assets\/brand\/lockup\.svg"/, `${route}: nav lockup`);
    assert.match(nav, /class="brand__paper" src="\/assets\/brand\/lockup-paper\.svg"/, `${route}: nav lockup, paper`);
    assert.equal((nav.match(/class="nav__links"[\s\S]*?<\/nav>/)?.[0].match(/<a /g) ?? []).length, 6, `${route}: six links`);
    assert.match(nav, /nav__download/, `${route}: the download button`);
    assert.match(nav, /<details class="nav__menu">/, `${route}: the compact menu`);

    const footer = html.match(/<footer\b[\s\S]*?<\/footer>/)?.[0] ?? "";
    for (const link of [
      '"/setup/"',
      '"/privacy/"',
      '"/roadmap/"',
      '"/faq/"',
      '"/contact/"',
      '"/brand/"',
      "https://github.com/salmuflahi/rabta",
      "https://github.com/salmuflahi/rabta/releases/tag/v0.1.0",
      "open-vsx.org",
      "https://github.com/salmuflahi/rabta/issues",
      "https://www.instagram.com/rabtaconnector/",
      "https://www.tiktok.com/@rabtaconnector",
    ]) {
      assert.ok(footer.includes(link), `${route} footer → ${link}`);
    }
    for (const profile of [
      "https://github.com/salmuflahi/rabta",
      "https://www.instagram.com/rabtaconnector/",
      "https://www.tiktok.com/@rabtaconnector",
    ]) {
      const tag = footer.match(new RegExp(`<a href="${profile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`))?.[0] ?? "";
      assert.match(tag, /rel="[^"]*\bme\b/, `${route}: ${profile} lacks rel="me"`);
    }
    for (const heading of ["Product", "Get started", "Project", "Contact &amp; legal"]) {
      assert.ok(footer.includes(`<p class="foot__head">${heading}</p>`), `${route} footer → ${heading} column`);
    }
    assert.ok(footer.includes("Rabta v0.1.0 · MIT · nothing leaves this Mac"), route);

    if (route !== "/") {
      assert.doesNotMatch(await builtCssFor(html), /\.hero__/, `${route}: carries the landing styles`);
      // Two inner pages carry one loop each; everything else carries none.
      const regionsAllowed = { "/agents/": 1, "/capsules/": 1 };
      assert.equal((html.match(/data-product-media=/g) ?? []).length, regionsAllowed[route] ?? 0, `${route}: product media regions`);
    }
  }
});

test("the current route is marked exactly once, on the link that points at it", async () => {
  for (const route of pages.filter((r) => r !== "/")) {
    const html = await readRoute(route);
    const marks = html.match(/<a href="([^"]*)"[^>]*aria-current="page"/g) ?? [];
    assert.equal(marks.length, 1, `${route}: expected exactly one aria-current`);
    assert.match(marks[0], new RegExp(`href="${route}"`), `${route}: aria-current is on the wrong link`);
  }
  const home = await readRoute("/");
  assert.equal((home.match(/aria-current="page"/g) ?? []).length, 0, "home marks no nav item");
});

test("nothing on the site responds to a mouse but not to a keyboard", async () => {
  for (const file of STYLESHEETS) {
    const css = (await readFile(resolve(STYLES, file), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => m[1].replace(/\s+/g, " ").trim());
    const all = rules.join(" | ");
    for (const selector of rules) {
      for (const part of selector.split(",")) {
        const trimmed = part.trim();
        if (!trimmed.includes(":hover")) continue;
        const partners = [trimmed.replace(/:hover/g, ":focus-visible"), trimmed.replace(/:hover/g, ":focus-within")];
        assert.ok(partners.some((partner) => all.includes(partner)), `${file}: "${trimmed}" has no ":focus-visible" or ":focus-within" counterpart`);
      }
    }
  }
});

test("motion runs on the brand's tokens, and stands down under reduced motion", async () => {
  const tokens = await readFile(resolve(STYLES, "tokens.css"), "utf8");
  assert.match(tokens, /--ease: cubic-bezier\(0\.16, 1, 0\.3, 1\);/);
  assert.match(tokens, /--dur-hover: 120ms;/);
  assert.match(tokens, /--dur-state: 240ms;/);
  assert.match(tokens, /--dur-reveal: 480ms;/);

  // No transition or animation may invent its own duration.
  for (const file of ["shell.css", "landing.css", "page.css", "doc.css"]) {
    const css = (await readFile(resolve(STYLES, file), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [, body] of css.matchAll(/\{([^{}]*)\}/g)) {
      if (!/transition/.test(body)) continue;
      const literal = body.match(/transition[^;]*?(?<![\d.])([1-9]\d*)ms/);
      assert.ok(!literal, `${file}: a transition hard-codes ${literal?.[1]}ms instead of a token`);
    }
  }

  const shell = await readFile(resolve(STYLES, "shell.css"), "utf8");
  assert.match(shell, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(shell, /\[data-reveal="pending"\] \{\s*opacity: 1;/);

  // Every module that animates reads the preference, and nothing listens to
  // the scroll event: scrubbing goes through ScrollTrigger or an observer.
  const animating = (await readdir(SCRIPTS)).filter((f) => f.endsWith(".ts"));
  let gsapModules = 0;
  for (const file of animating) {
    const ts = await readFile(resolve(SCRIPTS, file), "utf8");
    assert.doesNotMatch(ts, /addEventListener\(["']scroll["']/, `${file}: listens to scroll directly`);
    if (!/from "gsap/.test(ts)) continue;
    gsapModules += 1;
    assert.match(ts, /reducedMotion\(/, `${file}: animates without honouring reduced motion`);
  }
  assert.ok(gsapModules >= 2, "the motion modules import gsap");
  // The mark draws with the same numbers in the app and on the page.
  assert.deepEqual(SITE_MARK_DRAW, APP_MARK_DRAW, "the site's mark timing drifted from the app's");
  assert.deepEqual(SITE_MARK_DRAW, { stem: { delay: 0, duration: 420 }, bowl: { delay: 180, duration: 560 }, leg: { delay: 560, duration: 640 }, total: 1100 });
});

test("every enhancement resolves to the finished state without JavaScript", async () => {
  for (const route of routes) {
    const html = await readRoute(route);
    assert.doesNotMatch(html, /data-reveal="pending"/, route);
    assert.doesNotMatch(html, /data-hero="pending"/, route);
    assert.doesNotMatch(html, /data-moves="live"/, route);
    assert.doesNotMatch(html, /\sstyle="/, `${route}: inline style`);
  }
  const home = await readRoute("/");
  for (const [, value] of home.matchAll(/data-tally="[a-z]+">(\d+)</g)) {
    assert.ok(Number.parseInt(value, 10) >= 0, `tally ships ${value}`);
  }
  assert.equal((home.match(/data-tally=/g) ?? []).length, 3);
});

// ---------------------------------------------------------------------------
// The homepage.

test("homepage has the approved narrative", async () => {
  const html = await readRoute("/");
  for (const copy of [
    "Leave the task.",
    "Return to all of it.",
    "Three moves. Nothing else to learn.",
    "A capsule is the whole surface of a task.",
    "Resuming can also put away what isn't in the task.",
    "There is no account, because there is no server.",
    "Stop rebuilding the same workspace.",
  ]) {
    assert.ok(html.includes(copy), copy);
  }
  for (const id of ["top", "product", "pieces", "focus", "local", "download"]) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
  for (const removed of ['class="return-field', 'class="bento', 'class="heat', 'data-receipt-fold', 'class="badge']) {
    assert.doesNotMatch(html, new RegExp(removed), removed);
  }
});

test("the hero is the mark, the claim, and the real app", async () => {
  const html = await readRoute("/");
  const hero = html.match(/<section class="hero"[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.match(hero, /data-hero-mark/);
  assert.match(hero, /data-hero-word>abta</, "the word arrives beside the mark");
  assert.equal((hero.match(/class="rise"/g) ?? []).length, 2, "two lines rise");
  assert.equal((hero.match(/class="button/g) ?? []).length, 2, "one primary, one quiet");
  assert.equal((hero.match(/button--primary/g) ?? []).length, 1, "one ember in the hero");
  assert.match(hero, /data-product-media="hero"/);
  assert.match(hero, /poster="\/assets\/demos\/hero-return\.png"/, "the hero's poster is a frame of its own loop");
  assert.match(hero, /data-src-desktop="\/assets\/demos\/hero-return-desktop\.mp4"/);
  assert.match(hero, /data-src-mobile="\/assets\/demos\/hero-return-mobile\.mp4"/);
  assert.equal((html.match(/<video\b/g) ?? []).length, 8, "eight loops on the page: the hero, three moves, four cells");
  for (const video of html.match(/<video\b[^>]*>/g) ?? []) {
    assert.match(video, /\bmuted\b/, "every loop is silent");
    assert.match(video, /\bplaysinline\b/, "every loop stays in its frame on iOS");
    assert.match(video, /preload="none"/, "no loop downloads before its script decides to");
    assert.match(video, /aria-label="[^"]+"/, "every loop says what it shows");
    assert.doesNotMatch(video, /\bautoplay\b/, "no loop plays without the script's consent");
    assert.doesNotMatch(video, /\ssrc=/, "sources attach at runtime, from data-src-*");
  }
});

test("the homepage's claims about the build match what ships", async () => {
  const html = (await readRoute("/")).replace(/<!--[\s\S]*?-->/g, "");
  assert.ok(html.includes("no Intel build"), "names the missing Intel build");
  assert.ok(html.includes("macOS 11+"), "the real floor");
  assert.ok(html.includes("5.5 MB"), "the real size");
  assert.ok(html.includes("MIT-licensed"), "the real licence");
  assert.ok(html.includes("Signed and notarized"), "the real signing status");
  assert.doesNotMatch(html, /Apple silicon &amp; Intel|Apple silicon & Intel/);
  assert.doesNotMatch(html, /macOS 13/);
  assert.doesNotMatch(html, /while in beta/);
  assert.doesNotMatch(html, /14 MB/);
});

test("the three moves ship as a list and scrub into a sequence", async () => {
  const html = await readRoute("/");
  const moves = html.match(/<section class="moves"[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.equal((moves.match(/class="move"/g) ?? []).length, 3);
  assert.equal((moves.match(/data-move-shot="\d"/g) ?? []).length, 3);
  assert.match(moves, /data-move-shot="0" data-active/, "the first beat is up before any script runs");
  assert.match(moves, /class="move" data-move="0" aria-current="step"/, "the first move is current before any script runs");
  for (const copy of ["Capture", "Leave", "Return"]) {
    assert.ok(moves.includes(`<h3>${copy}</h3>`), copy);
  }
  for (const [i, beat] of ["move-capture", "move-leave", "move-return"].entries()) {
    const shot = moves.match(new RegExp(`<video data-move-shot="${i}"[^>]*>`))?.[0] ?? "";
    assert.match(shot, new RegExp(`poster="/assets/demos/${beat}\\.png"`), `${beat} poster`);
    assert.match(shot, new RegExp(`data-src-desktop="/assets/demos/${beat}-desktop\\.mp4"`), `${beat} desktop loop`);
    assert.match(shot, new RegExp(`data-src-mobile="/assets/demos/${beat}-mobile\\.mp4"`), `${beat} mobile loop`);
  }
  assert.doesNotMatch(moves, /data-product-media/, "the moves' loops belong to the sequence, not to media.js");
});

test("the bento has exactly four cells and every one shows the real app", async () => {
  const html = await readRoute("/");
  const bento = html.match(/<div class="holds__grid">[\s\S]*?<\/section>/)?.[0] ?? "";
  const cells = bento.match(/<article class="cell[^"]*"/g) ?? [];
  assert.equal(cells.length, 4);
  assert.ok(cells.some((c) => /cell--ember/.test(c)), "one ember cell");
  assert.ok(cells.some((c) => /cell--paper paper/.test(c)), "one paper cell");
  assert.equal((bento.match(/class="cell__art" data-product-media="cell-[a-z]+"/g) ?? []).length, 4, "every cell is its own media block");
  assert.equal((bento.match(/<video\b/g) ?? []).length, 4, "a loop per cell");
  assert.equal((bento.match(/data-media-play/g) ?? []).length, 4, "every cell's loop can be paused");
  assert.doesNotMatch(bento, /<img\b/, "the cells show footage of the app, not crops of stills");
});

test("the focus switch ships in the state that makes its section legible", async () => {
  const html = await readRoute("/");
  const toggle = html.match(/<button[^>]*data-focus-toggle[^>]*>/)?.[0] ?? "";
  assert.ok(toggle, "the switch exists");
  assert.match(toggle, /role="switch"/);
  assert.match(toggle, /aria-checked="true"/, "ships on");
  assert.match(toggle, /type="button"/);
  assert.ok(html.includes("6 tabs closed · 4 kept"));
  assert.ok(html.includes("focus mode on"));
});

test("the night chapter states the guarantees and draws the mark", async () => {
  const html = await readRoute("/");
  const night = html.match(/<section class="local"[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.ok(night, "the chapter exists");
  assert.match(night, /data-mark="thread"/, "the mark finishes the thread");
  assert.match(night, /data-thread-end/);
  assert.equal((night.match(/<h3>/g) ?? []).length, 4, "four guarantees");
  assert.match(night, /href="\/privacy\/"/);
});

test("the marquee names only apps a connector actually speaks to", async () => {
  const html = await readRoute("/");
  const marquee = html.match(/<div class="marquee"[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? "";
  for (const app of ["VS Code", "Cursor", "Zed", "Ghostty", "iTerm2", "Terminal", "Warp", "Chrome", "Arc", "Firefox"]) {
    assert.ok(marquee.includes(`>${app}</span>`), app);
  }
  assert.equal((marquee.match(/class="marquee__logo"/g) ?? []).length, 20);
  assert.match(marquee, /aria-hidden="true"/);
  assert.ok(html.includes("Connectors currently speak to VS Code"));
  assert.equal((html.match(/class="marquee"/g) ?? []).length, 1, "one marquee on the page");
});

// ---------------------------------------------------------------------------
// The inner pages.

test("the inner pages are laid out, not just typeset", async () => {
  const shaped = {
    "/why/": { bands: 4, cards: 3, headline: "The code is saved." },
    "/brand/": { bands: 6, headline: "An R that is also a ر." },
    "/faq/": { bands: 4, groups: 4, headline: "The questions the docs answer sideways." },
    "/roadmap/": { bands: 3, cards: 10, headline: "Where this goes." },
    "/agents/": { bands: 4, cards: 4, headline: "Your agent starts where you left off." },
    "/capsules/": { bands: 4, cards: 3, headline: "What a capsule holds, and how it comes back." },
    "/changelog/": { bands: 4, cards: 6, headline: "What shipped." },
    "/contact/": { bands: 3, cards: 3, headline: "Talk to a human." },
  };
  for (const [route, want] of Object.entries(shaped)) {
    const html = await readRoute(route);
    assert.ok(html.includes(want.headline), `${route}: headline`);
    assert.equal((html.match(/<section class="band[^"]*"/g) ?? []).length, want.bands, `${route}: band count`);
    if (want.cards !== undefined) {
      assert.equal((html.match(/class="card[ "]/g) ?? []).length, want.cards, `${route}: card count`);
    }
    if (want.groups !== undefined) {
      assert.equal((html.match(/class="qa"/g) ?? []).length, want.groups, `${route}: question-group count`);
    }
    for (const band of html.match(/<section class="band[\s\S]*?<\/section>/g) ?? []) {
      assert.equal((band.match(/<h2\b/g) ?? []).length, 1, `${route}: a band with ${(band.match(/<h2\b/g) ?? []).length} h2s`);
    }
    assert.doesNotMatch(html, /class="prose"/, `${route}: a prose document`);
    // Section-number eyebrows are gone; a label names the section in words.
    assert.doesNotMatch(html, /class="band__label">0\d ·/, `${route}: numbered label`);
  }
});

test("the brand page draws the mark, explains it, and hands out the files", async () => {
  const html = await readRoute("/brand/");
  assert.equal((html.match(/data-mark="draw"/g) ?? []).length, 2, "two living specimens");
  for (const [, id] of html.matchAll(/data-mark-replay aria-controls="([^"]+)"/g)) {
    assert.match(html, new RegExp(`id="${id}"`), `replay control points at ${id}`);
  }
  assert.equal((html.match(/class="stroke"/g) ?? []).length, 3, "three strokes explained");
  assert.match(html, /class="name__word name__word--arabic">رابطة</);
  for (const file of ["lockup.svg", "lockup-paper.svg", "icon-512.png", "mark.svg"]) {
    assert.match(html, new RegExp(`href="/assets/brand/${file.replace(".", "\\.")}" download`), `${file} download`);
    await access(resolve(SITE, `assets/brand/${file}`));
  }
  assert.equal((html.match(/class="swatch"/g) ?? []).length, 8, "eight swatches");
});

test("the two document pages are navigable, not just long", async () => {
  for (const route of ["/setup/", "/privacy/"]) {
    const html = await readRoute(route);
    assert.match(html, /class="doc-grid"/, `${route}: no document grid`);
    assert.match(html, /<nav class="doc-nav"/, `${route}: no sidebar index`);
    assert.match(html, /class="prose doc-body"/, `${route}: no numbered body`);
    const nav = html.match(/<nav class="doc-nav"[\s\S]*?<\/nav>/)?.[0] ?? "";
    const linked = [...nav.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
    const sections = [...html.matchAll(/<h2 id="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(linked, sections, `${route}: index and sections disagree`);
    assert.doesNotMatch(html, /<h2 id="[^"]+">\s*\d+\./, `${route}: a heading still carries its own number`);
  }
});

test("no page styles itself with a class no stylesheet it loads defines", async () => {
  const stylesheets = new Map();
  const cssFor = async (file) => {
    if (!stylesheets.has(file)) stylesheets.set(file, await readFile(resolve(SITE, file), "utf8"));
    return stylesheets.get(file);
  };
  // Hooks rather than styling: JS targets, or names used only as a state.
  const behavioural = new Set(["visually-hidden", "lit", "stem", "bowl"]);
  for (const route of routes) {
    const html = await readRoute(route);
    const links = [...html.matchAll(/<link rel="stylesheet" href="\/([^"]+)"/g)].map((m) => m[1]);
    const css = (await Promise.all(links.map(cssFor))).join("\n");
    const main = html.match(/<main\b[\s\S]*?<\/main>/)?.[0] ?? "";
    const used = new Set([...main.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean));
    for (const name of used) {
      if (behavioural.has(name)) continue;
      assert.ok(css.includes(`.${name}`), `${route}: .${name} is used in <main> but defined in none of ${links.join(", ")}`);
    }
  }
});

// ---------------------------------------------------------------------------
// Links, assets, and the outside world.

test("no route links to an anchor that does not exist", async () => {
  const idsIn = (html) => new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  const homeIds = idsIn(await readRoute("/"));
  for (const route of routes) {
    const html = await readRoute(route);
    const ownIds = idsIn(html);
    for (const [, target] of html.matchAll(/href="\/#([^"]+)"/g)) {
      assert.ok(homeIds.has(target), `${route} → /#${target} is not on the homepage`);
    }
    for (const [, target] of html.matchAll(/href="#([^"]+)"/g)) {
      assert.ok(ownIds.has(target), `${route} → #${target} is not in that document`);
    }
  }
});

test("every route carries its canonical title", async () => {
  const expected = new Map([
    ["/", "Rabta: leave the task, return to all of it"],
    ["/brand/", "Brand"],
    ["/setup/", "Setup"],
    ["/privacy/", "Privacy"],
    ["/404.html", "Page not found"],
  ]);
  for (const [route, fragment] of expected) {
    const html = await readRoute(route);
    const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? "";
    assert.ok(title.includes(fragment), `${route}: ${title}`);
    assert.ok(title.includes("Rabta"), route);
  }
  const home = await readRoute("/");
  assert.match(home, /<meta property="og:title" content="Rabta: leave the task, return to all of it"\s*\/?>/);
});

test("the social card and the link preview say the same thing", async () => {
  const card = await readFile(resolve(SITE, "assets/brand/og-card.html"), "utf8");
  const home = await readRoute("/");
  const ogTitle = home.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ?? "";
  const headline = (card.match(/<h1>([\s\S]*?)<\/h1>/)?.[1] ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  assert.ok(ogTitle, "homepage declares an og:title");
  assert.equal(headline, ogTitle);
  assert.ok(card.includes("Workspace memory for macOS"));
  assert.match(card, /src="lockup(?:-paper)?\.svg"/, "the card carries the lockup");
  for (const value of hexLiterals(card)) {
    assert.ok(PALETTE.has(value), `og-card: unapproved colour ${value}`);
  }
  assert.deepEqual([...card.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]), []);
});

test("the generated social preview is the declared size", async () => {
  const png = await readFile(resolve(SITE, "assets/brand/og-cover.png"));
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  for (const route of routes) {
    const html = await readRoute(route);
    if (!html.includes("og:image")) continue;
    assert.match(html, /<meta property="og:image:width" content="1200"\s*\/?>/, route);
    assert.match(html, /<meta property="og:image:height" content="630"\s*\/?>/, route);
  }
});

test("all root-relative assets exist", async () => {
  for (const route of routes) {
    const html = await readRoute(route);
    for (const ref of localReferences(html)) {
      if (ref === "/") continue;
      await access(resolve(SITE, `.${ref}`));
    }
  }
});

test("every declared media source is on disk", async () => {
  const home = await readRoute("/");
  const regions = home.match(/data-product-media="[^"]+"/g) ?? [];
  assert.deepEqual(regions.sort(), [
    'data-product-media="cell-branch"',
    'data-product-media="cell-files"',
    'data-product-media="cell-tabs"',
    'data-product-media="cell-terminals"',
    'data-product-media="hero"',
  ]);
  const sources = [...home.matchAll(/data-src-(?:desktop|mobile)="(\/[^"]+)"/g)].map((m) => m[1]);
  assert.equal(sources.length, (home.match(/<video\b/g) ?? []).length * 2, "a desktop and a mobile file per loop");
  for (const source of sources) await access(resolve(SITE, `.${source}`));
  const posters = [...home.matchAll(/poster="(\/[^"]+)"/g)].map((m) => m[1]);
  assert.equal(posters.length, (home.match(/<video\b/g) ?? []).length, "every loop has a poster");
  for (const poster of posters) await access(resolve(SITE, `.${poster}`));
});

test("no route opens a new tab without noopener", async () => {
  for (const route of routes) {
    const html = await readRoute(route);
    for (const [tag] of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) {
      assert.match(tag, /rel="[^"]*\bnoopener\b/, `${route}: ${tag}`);
    }
  }
});

test("no third-party subresource is loaded", async () => {
  for (const route of routes) {
    const html = await readRoute(route);
    const external = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
    const subresources = external.filter((url) => /\.(?:js|css|woff2?|png|jpe?g|avif|webp|svg|m4v)(?:[?#]|$)/i.test(url));
    assert.deepEqual(subresources, [], route);
  }
});

test("no stylesheet or module reaches off this origin", async () => {
  const files = [
    ...(await readdir(resolve(SITE, "_astro"))).filter((f) => /\.(?:css|js)$/.test(f)).map((f) => `_astro/${f}`),
    "assets/brand/og-card.html",
  ];
  for (const file of files) {
    const source = await readFile(resolve(SITE, file), "utf8");
    const external = [
      ...source.matchAll(/url\(\s*["']?(https?:\/\/[^"')]+)/g),
      ...source.matchAll(/@import\s+(?:url\()?["'](https?:\/\/[^"']+)/g),
      ...source.matchAll(/(?:from|import)\s+["'](https?:\/\/[^"']+)/g),
    ].map((m) => m[1]);
    assert.deepEqual(external, [], file);
  }
});
