import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { SITE, localReferences, readRoute } from "./helpers.mjs";

// Every route the site serves. The eight-page rebuild added five, and until
// they were listed here none of them were covered by any guard in this file —
// not the palette rule, not the no-third-party rule, not the responsibility
// boundaries. A page that no test knows about is a page that can ship anything.
const routes = [
  "/",
  "/why/",
  "/setup/",
  "/faq/",
  "/roadmap/",
  "/changelog/",
  "/contact/",
  "/privacy/",
  "/404.html",
];

/** The eight real pages — `routes` minus the 404, which has no chrome and is
 * exempt from the nav, footer and metadata rules by design. */
const pages = routes.filter((route) => route !== "/404.html");

test("all routes use the Living Instrument responsibility boundaries", async () => {
  for (const route of routes) {
    const html = await readRoute(route);
    assert.match(html, /\/css\/tokens\.css/);
    assert.match(html, /\/css\/shell\.css/);
    assert.match(html, /\/css\/(?:landing|doc)\.css/);
    assert.match(html, /\/css\/receipt-fold\.css/);
    assert.doesNotMatch(html, /\/css\/(?:components|sections)\.css/);
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1, route);
  }
});

test("the approved palette is canonical", async () => {
  const css = (
    await readFile(resolve(SITE, "css/tokens.css"), "utf8")
  ).toLowerCase();

  for (const value of [
    "#102526",
    "#ff6b2c",
    "#f3f0e8",
    "#173239",
    "#66858c",
    "#a9bec2",
    "#d9e3e3",
  ]) {
    assert.match(css, new RegExp(value));
  }
});

test("token literals stay within the approved Living Instrument palette", async () => {
  const css = await readFile(resolve(SITE, "css/tokens.css"), "utf8");
  const approved = new Set([
    "#102526",
    "#ff6b2c",
    "#f3f0e8",
    "#173239",
    "#66858c",
    "#a9bec2",
    "#d9e3e3",
  ]);
  const literals = [...css.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((match) =>
    match[0].toLowerCase(),
  );

  assert.ok(
    literals.every((value) => approved.has(value)),
    `unapproved token color: ${literals.find((value) => !approved.has(value))}`,
  );
});

test("homepage hero retains the approved responsive display scale", async () => {
  const css = await readFile(resolve(SITE, "css/landing.css"), "utf8");
  const hero = css.match(/\.hero h1 \{([\s\S]*?)\n\s*\}/)?.[1] ?? "";

  // The redesigned hero is one fluid clamp rather than three fixed steps: it
  // is centred and its measure is capped in `ch`, so a per-breakpoint size
  // would only ever be re-deriving what the clamp already gives. The bounds
  // are the contract — 42px is the smallest the two lines stay two lines at,
  // and 82px is where the second line stops fitting a 1440px rail.
  assert.match(hero, /font-size:\s*clamp\(42px,\s*6\.6vw,\s*82px\)/);
  assert.match(hero, /line-height:\s*0\.98/);
  assert.match(hero, /letter-spacing:\s*-0\.045em/);
  assert.match(hero, /text-wrap:\s*balance/);
});

test("homepage surfaces stay within the approved Living Instrument palette", async () => {
  const approved = new Set([
    "#102526",
    "#ff6b2c",
    "#f3f0e8",
    "#173239",
    "#66858c",
    "#a9bec2",
    "#d9e3e3",
  ]);

  // The one documented exception: macOS's own window-control colours, at their
  // system values, on the hero window's traffic lights. They are a quotation,
  // not a palette addition — the frame claims "this is a Mac app", and a Mac
  // app's close button is that red. Drawing them in brand colours would make
  // the frame a stylised picture of a window rather than a window.
  const quoted = new Set(["#ff5f57", "#febc2e", "#28c840"]);

  for (const file of ["css/shell.css", "css/landing.css", "index.html"]) {
    const source = await readFile(resolve(SITE, file), "utf8");
    const literals = [...source.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((match) =>
      match[0].toLowerCase(),
    );
    const stray = literals.find(
      (value) => !approved.has(value) && !quoted.has(value),
    );
    assert.ok(!stray, `${file}: unapproved color ${stray}`);
  }

  // An exception that can spread is not an exception, it is a second palette.
  // Each quoted colour must appear exactly once, and only in the traffic-light
  // rule it was granted for.
  const landing = await readFile(resolve(SITE, "css/landing.css"), "utf8");
  for (const value of quoted) {
    assert.equal(
      (landing.match(new RegExp(value, "gi")) ?? []).length,
      1,
      `${value} is used more than once`,
    );
    assert.match(
      landing,
      new RegExp(`\\.window__lights span:nth-child\\(\\d\\) \\{\\s*background: ${value};`, "i"),
      `${value} is used outside the traffic lights`,
    );
  }

  // And nowhere but landing.css at all.
  for (const file of ["css/shell.css", "css/doc.css", "css/page.css", "css/tokens.css"]) {
    const source = await readFile(resolve(SITE, file), "utf8");
    for (const value of quoted) {
      assert.doesNotMatch(source, new RegExp(value, "i"), `${file}: ${value}`);
    }
  }
});

test("homepage uses the exact approved responsive section rhythm", async () => {
  const css = await readFile(resolve(SITE, "css/landing.css"), "utf8");
  const desktop = css.slice(0, css.indexOf("@media (max-width: 980px)"));
  const tablet = css.slice(
    css.indexOf("@media (max-width: 980px)"),
    css.indexOf("@media (max-width: 640px)"),
  );

  // One rhythm, not six hand-picked numbers: every section on the redesigned
  // page opens on the same 104px beat, and the closing band is the only one
  // that differs — it is the page ending, so it gets more air above and below.
  for (const selector of [".moves", ".holds", ".focus", ".history", ".local"]) {
    const body = desktop.match(
      new RegExp(`\\${selector} \\{([\\s\\S]*?)\\n\\s*\\}`),
    )?.[1] ?? "";
    assert.match(body, /padding-top:\s*104px/, `${selector} desktop`);
  }

  const hero = desktop.match(/\.hero \{([\s\S]*?)\n\s*\}/)?.[1] ?? "";
  assert.match(hero, /padding-top:\s*92px/);

  const download = desktop.match(/\.download \{([\s\S]*?)\n\s*\}/)?.[1] ?? "";
  assert.match(download, /padding-block:\s*120px 110px/);

  // The tablet step collapses the whole rhythm at once, so the sections cannot
  // drift apart from each other on the way down.
  assert.match(tablet, /\.moves,\n\s*\.holds,\n\s*\.focus,\n\s*\.history,\n\s*\.local \{\s*\n\s*padding-top:\s*80px/);
});

/** WCAG relative luminance of a #rrggbb string. */
function luminance(hex) {
  const channel = (value) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}

function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

test("cool-mid is a display colour, and small text never uses it", async () => {
  const petrol = "#102526";
  const panel = "#173239";
  const coolMid = "#66858c";
  const coolSoft = "#a9bec2";

  // The fact this whole rule rests on: cool-mid clears the 3:1 that text at
  // 24px+ needs, but not the 4.5:1 that anything smaller needs.
  assert.ok(contrast(coolMid, petrol) >= 3, "cool-mid is legible as display type");
  assert.ok(
    contrast(coolMid, petrol) < 4.5,
    "cool-mid is NOT AA for small text — if this ever passes, revisit the rule",
  );
  assert.ok(contrast(coolMid, panel) < 4.5);

  // Which is why every small register uses cool-soft instead.
  assert.ok(contrast(coolSoft, petrol) >= 4.5);
  assert.ok(contrast(coolSoft, panel) >= 4.5);

  // And why the dark-on-light surfaces are safe.
  assert.ok(contrast(petrol, "#d9e3e3") >= 4.5);
  assert.ok(contrast(petrol, "#f3f0e8") >= 4.5);
  assert.ok(contrast(petrol, "#ff6b2c") >= 4.5, "button label on the accent");

  const doc = await readFile(resolve(SITE, "css/doc.css"), "utf8");
  for (const selector of [
    ".marker",
    ".muted",
    ".cmt",
    ".note p",
    ".prose th",
    ".prose tbody th",
    ".copy-status",
    ".notfound__code",
  ]) {
    const body =
      doc.match(
        new RegExp(`\\${selector.replaceAll(" ", "\\s+")} \\{([\\s\\S]*?)\\n\\s*\\}`),
      )?.[1] ?? "";
    assert.doesNotMatch(body, /color:\s*var\(--text-3\)/, selector);
  }
});

/** Every selector list in a stylesheet, paired with its declaration block. */
async function rulesOf(file) {
  const css = await readFile(resolve(SITE, file), "utf8");
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: match[1].replace(/\s+/g, " ").trim(),
    body: match[2],
  }));
}

const STYLESHEETS = [
  "css/tokens.css",
  "css/shell.css",
  "css/landing.css",
  "css/doc.css",
  "css/receipt-fold.css",
];

test("nothing on the site responds to a mouse but not to a keyboard", async () => {
  // The single rule the hover system exists to hold: a keyboard user gets the
  // same feedback a pointer user gets, or the feedback does not ship.
  for (const file of STYLESHEETS) {
    const rules = await rulesOf(file);
    const selectors = rules.map((rule) => rule.selector).join(" | ");

    for (const rule of rules) {
      for (const part of rule.selector.split(",")) {
        const trimmed = part.trim();
        if (!trimmed.includes(":hover")) continue;
        const partner = trimmed.replace(/:hover/g, ":focus-visible");
        assert.ok(
          selectors.includes(partner),
          `${file}: "${trimmed}" has no ":focus-visible" counterpart`,
        );
      }
    }
  }
});

test("hover motion runs on one duration and one curve", async () => {
  const tokens = await readFile(resolve(SITE, "css/tokens.css"), "utf8");
  assert.match(tokens, /--hover-dur:\s*180ms/);
  assert.match(tokens, /--cut-skew:\s*-18deg/);

  const shell = await readFile(resolve(SITE, "css/shell.css"), "utf8");

  // The sweep waits off the leading edge and lands flush; the diagonal is its
  // front face, so the fold's geometry appears in motion and never as shape.
  const rest = shell.match(/\.sweep::before \{([\s\S]*?)\n\s*\}/)?.[1] ?? "";
  // The resting side is --cut-x, which js/instrument.js sets to the edge the
  // pointer crossed. It must stay a whole offset with a left-hand default:
  // calc() will not re-resolve a percentage scaled by a substituted number,
  // and the default is what keyboard focus and a scriptless page get.
  assert.match(
    rest,
    /transform:\s*translateX\(var\(--cut-x, -130%\)\) skewX\(var\(--cut-skew\)\)/,
  );
  assert.match(rest, /transition:\s*transform var\(--hover-dur\) var\(--ease-out\)/);

  const landed = shell.match(
    /\.sweep:hover::before,\s*\.sweep:focus-visible::before \{([\s\S]*?)\n\s*\}/,
  )?.[1] ?? "";
  assert.match(landed, /transform:\s*translateX\(0\) skewX\(var\(--cut-skew\)\)/);

  // No hover rule may invent its own timing.
  for (const file of ["css/shell.css", "css/landing.css", "css/doc.css"]) {
    const rules = await rulesOf(file);
    for (const rule of rules) {
      if (!/transition/.test(rule.body)) continue;
      // `0.01ms` is the reduced-motion collapse, not a hand-picked duration.
      const literal = rule.body.match(/transition[^;]*?(?<![\d.])(\d+)ms/);
      assert.ok(
        !literal,
        `${file}: "${rule.selector}" hard-codes ${literal?.[1]}ms instead of a token`,
      );
    }
  }
});

test("the current route is marked in the nav, not just in the markup", async () => {
  const shell = await readFile(resolve(SITE, "css/shell.css"), "utf8");
  const rule =
    shell.match(
      /\.nav__links a\[aria-current="page"\]::before \{([\s\S]*?)\n\s*\}/,
    )?.[1] ?? "";

  // The indicator holds the same fill the hover lands, so "you are here" and
  // "you are about to go here" are the same mark in two tenses.
  assert.match(rule, /transform:\s*translateX\(0\) skewX\(var\(--cut-skew\)\)/);
  assert.match(rule, /transition:\s*none/, "the indicator is a state, not a gesture");

  // And the attribute it depends on is actually on every route that has a
  // chrome link to itself.
  //
  // This deliberately does not look only inside `.nav__links`. The eight-page
  // rebuild moved Privacy and Roadmap into the footer, so a nav-only check
  // reported those pages as unmarked when they are correctly marked — in the
  // other nav. What matters is that a page marks itself exactly once, and
  // marks the link that actually points at it.
  for (const route of [
    "/why/",
    "/setup/",
    "/faq/",
    "/roadmap/",
    "/changelog/",
    "/contact/",
    "/privacy/",
  ]) {
    const html = await readRoute(route);
    const marks = html.match(/<a href="([^"]*)"[^>]*aria-current="page"/g) ?? [];
    assert.equal(marks.length, 1, `${route}: expected exactly one aria-current`);
    assert.match(
      marks[0],
      new RegExp(`href="${route}"`),
      `${route}: aria-current is on the wrong link`,
    );
  }

  // Home is the exception, and deliberately so: its chrome link is the brand
  // mark, not a nav item, so there is nothing to mark.
  const home = await readRoute("/");
  assert.equal(
    (home.match(/aria-current="page"/g) ?? []).length,
    0,
    "home marks no nav item",
  );
});

test("every enhancement resolves to the finished state without JavaScript", async () => {
  // The whole rule for this layer: CSS ships the completed page, and the
  // modules only opt elements into being animated on the way there.
  const landing = await readFile(resolve(SITE, "css/landing.css"), "utf8");

  // The headline's lines are only hidden once js/reveal.js has marked their
  // section pending. Nothing in the markup carries that state, so a page whose
  // script never runs renders the finished thing rather than an empty box.
  assert.match(landing, /\[data-reveal="pending"\] \.rise > span \{[\s\S]*?opacity:\s*0/);
  const html = await readRoute("/");
  assert.doesNotMatch(html, /data-resolve="pending"/);
  assert.doesNotMatch(html, /data-reveal="pending"/);

  // A counter's markup holds its final value, so a scriptless page shows it.
  for (const [, value] of html.matchAll(/data-count>(\d+)</g)) {
    assert.ok(Number.parseInt(value, 10) > 0, `counter ships ${value}`);
  }
  // Three, in the footer's receipt. The homepage's own counters went with the
  // bento; the receipt's are the shell's and appear on every route.
  assert.equal((html.match(/data-count/g) ?? []).length, 3);

  // The focus receipt is the same rule in a different shape: its three tallies
  // ship their real values, so the section reads correctly before home.js runs.
  for (const [, value] of html.matchAll(/data-tally="[a-z]+">(\d+)</g)) {
    assert.ok(Number.parseInt(value, 10) >= 0, `tally ships ${value}`);
  }
  assert.equal((html.match(/data-tally=/g) ?? []).length, 3);

  const instrument = await readFile(resolve(SITE, "js/instrument.js"), "utf8");
  // Counting and sequencing are motion with no meaning of their own, so both
  // stand down under reduced motion rather than merely running faster.
  assert.equal(
    (instrument.match(/prefers-reduced-motion/g) ?? []).length +
      (instrument.match(/matchMedia\?\.\(REDUCED\)/g) ?? []).length,
    3,
  );
});

test("chapter marks are drawn at rest, so a script failure cannot hide them", async () => {
  const shell = await readFile(resolve(SITE, "css/shell.css"), "utf8");
  const mark = shell.match(/\.eyebrow::before \{([\s\S]*?)\n\s*\}/)?.[1] ?? "";

  // No transform in the resting rule means scaleX(1) — visible by default.
  assert.doesNotMatch(mark, /transform:\s*scaleX\(0\)/);
  assert.match(shell, /\[data-reveal="pending"\] \.eyebrow::before \{\s*transform:\s*scaleX\(0\)/);

  const reveal = await readFile(resolve(SITE, "js/reveal.js"), "utf8");
  assert.match(reveal, /dataset\.reveal = "pending"/);
  assert.match(reveal, /IntersectionObserver/);
});

test("homepage metadata uses the approved contrast pairings", async () => {
  const landing = await readFile(resolve(SITE, "css/landing.css"), "utf8");
  const shell = await readFile(resolve(SITE, "css/shell.css"), "utf8");

  // Mono metadata is the quietest text on the page and the easiest to render
  // unreadable. Every instance of it resolves to a checked token rather than a
  // hand-dimmed value.
  for (const [selector, token] of [
    [".requirement,\n  .download__meta", "cool-mid"],
    [".marquee__logo", "cool-mid"],
    [".figcard__fig", "cool-mid"],
    [".hero__lede", "cool-soft"],
    [".moves__hint", "cool-soft"],
  ]) {
    const body = landing.match(
      new RegExp(`\\${selector.replaceAll(" ", "\\s+")} \\{([\\s\\S]*?)\\n\\s*\\}`),
    )?.[1] ?? "";
    assert.match(body, new RegExp(`color:\\s*var\\(--${token}\\)`), selector);
  }

  const livingShell = shell.slice(shell.indexOf("Living Instrument shared shell"));
  const footerMeta = livingShell.match(/\.foot__meta \{([\s\S]*?)\n\s*\}/)?.[1] ?? "";
  assert.match(footerMeta, /color:\s*var\(--cool-soft\)/);
});

test("homepage footer includes the published release page", async () => {
  const html = await readRoute("/");
  const footer = html.match(/<footer\b[\s\S]*?<\/footer>/)?.[0] ?? "";
  assert.match(
    footer,
    /href="https:\/\/github\.com\/salmuflahi\/rabta\/releases\/tag\/v0\.1\.0"[^>]*>Releases<\/a>/,
  );
});

test("document routes keep detail but never load product media", async () => {
  const setup = await readRoute("/setup/");
  const privacy = await readRoute("/privacy/");
  const notFound = await readRoute("/404.html");

  // The homepage deliberately sheds these; /setup/ is where they live.
  assert.ok(
    setup.includes(
      "3978ec57af7d37ab32670033d679c21a28cf74cebb0435ce011049e05635c655",
    ),
  );
  assert.ok(setup.includes("86M2X6MUA3"));
  assert.ok(privacy.includes("127.0.0.1"));

  for (const html of [setup, privacy, notFound]) {
    assert.doesNotMatch(html, /<video\b/);
    assert.match(html, /data-receipt-fold/);
  }

  assert.ok(notFound.includes("Home"));
  assert.ok(notFound.includes("Download"));
  assert.ok(notFound.includes("Setup"));
});

test("every route wears the same shell", async () => {
  for (const route of routes) {
    const html = await readRoute(route);

    // One nav, one footer, one main, one receipt — no route keeps a private
    // copy of the chrome.
    assert.equal((html.match(/<main\b/g) ?? []).length, 1, route);
    assert.equal((html.match(/data-receipt-fold/g) ?? []).length, 1, route);
    assert.match(html, /<header class="nav">/, route);
    assert.match(html, /class="rail nav__inner"/, route);
    assert.match(html, /<footer class="foot">/, route);
    assert.match(html, /class="rail foot__grid"/, route);

    const footer = html.match(/<footer\b[\s\S]*?<\/footer>/)?.[0] ?? "";
    for (const link of [
      '"/setup/"',
      '"/privacy/"',
      '"/roadmap/"',
      '"/faq/"',
      '"/contact/"',
      "https://github.com/salmuflahi/rabta",
      "https://github.com/salmuflahi/rabta/releases/tag/v0.1.0",
      "open-vsx.org",
      "https://github.com/salmuflahi/rabta/issues",
    ]) {
      assert.ok(footer.includes(link), `${route} footer → ${link}`);
    }

    // Four labelled columns, not one undifferentiated row. The labels are what
    // make the footer navigable rather than a list of everything.
    for (const heading of ["Product", "Get started", "Project", "Contact &amp; legal"]) {
      assert.ok(
        footer.includes(`<p class="foot__head">${heading}</p>`),
        `${route} footer → ${heading} column`,
      );
    }
    assert.ok(footer.includes("Rabta v0.1.0 · MIT · nothing leaves this Mac"), route);

    // The document routes never carry homepage composition or media behaviour.
    if (route !== "/") {
      assert.doesNotMatch(html, /\/css\/landing\.css/, route);
      assert.doesNotMatch(html, /data-product-media/, route);
      assert.doesNotMatch(html, /class="[^"]*\breturn-field\b/, route);
    }
  }
});

test("no route links to an anchor that does not exist", async () => {
  const home = await readRoute("/");
  const idsIn = (html) =>
    new Set([...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
  const homeIds = idsIn(home);

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

test("every route paints the same browser chrome colour", async () => {
  for (const route of routes) {
    const html = await readRoute(route);
    assert.match(
      html,
      /<meta name="theme-color" content="#102526" \/>/,
      route,
    );
  }
});

test("every route carries its canonical title", async () => {
  const expected = new Map([
    ["/", "Rabta — Pick up the task. Not the pieces."],
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
  assert.match(
    home,
    /<meta property="og:title" content="Rabta — Pick up the task\. Not the pieces\." \/>/,
  );
});

test("the social card and the link preview say the same thing", async () => {
  const card = await readFile(resolve(SITE, "assets/brand/og-card.html"), "utf8");
  const home = await readRoute("/");

  // A card that argues one thing while the preview beside it argues another
  // is the one social-image bug nobody catches, because the two are never
  // rendered side by side except by the platform.
  const ogTitle =
    home.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ?? "";
  const headline = (card.match(/<h1>([\s\S]*?)<\/h1>/)?.[1] ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

  assert.ok(ogTitle, "homepage declares an og:title");
  assert.equal(headline, ogTitle);
  assert.ok(card.includes("Workspace memory for macOS"));

  // The card is uploaded with the rest of website/, so it is bound by the
  // palette and no-third-party rules like any other page.
  const approved = new Set([
    "#102526",
    "#ff6b2c",
    "#f3f0e8",
    "#173239",
    "#66858c",
    "#a9bec2",
    "#d9e3e3",
  ]);
  const literals = [...card.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((match) =>
    match[0].toLowerCase(),
  );
  assert.ok(
    literals.every((value) => approved.has(value)),
    `og-card: unapproved colour ${literals.find((value) => !approved.has(value))}`,
  );
  assert.deepEqual(
    [...card.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]),
    [],
  );
});

test("the generated social preview is the declared size", async () => {
  const png = await readFile(resolve(SITE, "assets/brand/og-cover.png"));
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");

  // IHDR width/height live at bytes 16..24 of every PNG.
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  assert.equal(width, 1200);
  assert.equal(height, 630);

  for (const route of routes) {
    const html = await readRoute(route);
    if (!html.includes("og:image")) continue;
    assert.match(html, /<meta property="og:image:width" content="1200" \/>/, route);
    assert.match(html, /<meta property="og:image:height" content="630" \/>/, route);
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
  // Pinned as a set rather than a count: what matters is which demos the page
  // declares, and a bare number says nothing about which one went missing.
  // One, since the rebuild — the design's composition has a single demo slot,
  // the window under the headline. `capture` and `return` are still built and
  // still in the manifest; they have no section to sit in on this page.
  assert.deepEqual(regions.sort(), ['data-product-media="hero"']);

  // These are attached by JavaScript, so no crawler and no earlier contract
  // would ever notice them going missing.
  const sources = [
    ...home.matchAll(/data-src-(?:desktop|mobile)="(\/[^"]+)"/g),
  ].map((match) => match[1]);
  // Two variants (desktop, mobile) per demo region.
  assert.equal(sources.length, regions.length * 2);
  for (const source of sources) {
    await access(resolve(SITE, `.${source}`));
  }

  const posters = [...home.matchAll(/poster="(\/[^"]+)"/g)].map((m) => m[1]);
  assert.equal(posters.length, regions.length);
  for (const poster of posters) {
    await access(resolve(SITE, `.${poster}`));
  }
});

test("no route opens a new tab without noopener", async () => {
  for (const route of routes) {
    const html = await readRoute(route);
    for (const [tag] of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) {
      assert.match(tag, /rel="[^"]*\bnoopener\b/, `${route}: ${tag}`);
    }
  }
});

test("nothing in the shipped site references the local probe file", async () => {
  for (const route of routes) {
    const html = await readRoute(route);
    assert.doesNotMatch(html, /__cap\.html/, route);
  }

  for (const file of [
    "css/tokens.css",
    "css/shell.css",
    "css/landing.css",
    "css/doc.css",
    "css/receipt-fold.css",
    "js/main.js",
    "js/media.js",
    "js/receipt-fold.js",
  ]) {
    const source = await readFile(resolve(SITE, file), "utf8");
    assert.doesNotMatch(source, /__cap/, file);
  }
});

test("no third-party subresource is loaded", async () => {
  for (const route of routes) {
    const html = await readRoute(route);
    const external = [
      ...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g),
    ].map((match) => match[1]);
    const subresources = external.filter((url) =>
      /\.(?:js|css|woff2?|png|jpe?g|avif|webp|svg|m4v)(?:[?#]|$)/i.test(
        url,
      ),
    );
    assert.deepEqual(subresources, [], route);
  }
});

test("no stylesheet or module reaches off this origin", async () => {
  // The privacy claim is that the site serves every byte itself, so this
  // covers CSS and JS too — a font @import or a CDN module would contradict
  // the page's own copy without touching any route's HTML.
  const files = [
    ...(await readdir(resolve(SITE, "css"))).map((f) => `css/${f}`),
    ...(await readdir(resolve(SITE, "js"))).map((f) => `js/${f}`),
    "assets/brand/og-card.html",
  ];

  for (const file of files) {
    const source = await readFile(resolve(SITE, file), "utf8");
    const external = [
      ...source.matchAll(/url\(\s*["']?(https?:\/\/[^"')]+)/g),
      ...source.matchAll(/@import\s+(?:url\()?["'](https?:\/\/[^"']+)/g),
      ...source.matchAll(/(?:from|import)\s+["'](https?:\/\/[^"']+)/g),
    ].map((match) => match[1]);
    assert.deepEqual(external, [], file);
  }
});


test("the inner pages are laid out, not just typeset", async () => {
  // Five pages shipped as `.prose` documents — the right shape for /setup/ and
  // /privacy/, which are read like reference material, and the wrong one for
  // pages that are scanned. The redesign gives them bands: a label naming the
  // section, a heading saying the thing, then cards or question groups.
  //
  // This asserts the structure rather than the styling, because the failure it
  // guards is a page quietly reverting to a wall of `<h3>` + `<p>` — which
  // would look fine, read fine, and be a different page than the one designed.
  const shaped = {
    "/why/": { bands: 3, cards: 3, headline: "The code is saved." },
    "/faq/": { bands: 4, groups: 4, headline: "The questions the docs answer sideways." },
    "/roadmap/": { bands: 3, cards: 10, headline: "What's next, without dates." },
    "/changelog/": { bands: 4, cards: 6, headline: "What shipped." },
    "/contact/": { bands: 3, cards: 3, headline: "Talk to a human." },
  };

  for (const [route, want] of Object.entries(shaped)) {
    const html = await readRoute(route);

    assert.ok(html.includes(want.headline), `${route}: headline`);
    assert.equal(
      (html.match(/<section class="band[^"]*"/g) ?? []).length,
      want.bands,
      `${route}: band count`,
    );
    if (want.cards !== undefined) {
      assert.equal(
        (html.match(/class="card[ "]/g) ?? []).length,
        want.cards,
        `${route}: card count`,
      );
    }
    if (want.groups !== undefined) {
      assert.equal(
        (html.match(/class="qa"/g) ?? []).length,
        want.groups,
        `${route}: question-group count`,
      );
    }

    // Every band names itself and carries exactly one h2. A band whose label
    // and heading disagree about what the section is is worse than neither.
    const bands = html.match(/<section class="band[\s\S]*?<\/section>/g) ?? [];
    for (const band of bands) {
      assert.match(band, /class="band__label"/, `${route}: band without a label`);
      assert.equal(
        (band.match(/<h2\b/g) ?? []).length,
        1,
        `${route}: band with ${(band.match(/<h2\b/g) ?? []).length} h2s`,
      );
    }

    // These five no longer carry a document body. /setup/ and /privacy/ still
    // do, deliberately — they are the reference pages.
    assert.doesNotMatch(html, /class="prose"/, `${route}: still a prose document`);
    assert.match(html, /\/css\/page\.css/, `${route}: page.css not linked`);
  }
});

test("no page styles itself with a class no stylesheet it loads defines", async () => {
  // `/why/` shipped with `class="cta"` and `class="hero__actions"` on its
  // closing block. `.cta` was defined nowhere at all, and `.hero__actions`
  // lives in landing.css — which document routes deliberately never load. Both
  // rendered as bare block elements: a heading, two links and a line of text
  // stacked with default margins at the end of an otherwise composed page.
  //
  // It survived review because nothing was *broken*. The markup was right, the
  // content was right, the page returned 200. Only the rendering was wrong, and
  // no assertion in this suite reads rendering. This one reads the next best
  // thing: whether a class the markup relies on is defined in a stylesheet that
  // page actually links.
  const stylesheets = new Map();
  const cssFor = async (file) => {
    if (!stylesheets.has(file)) {
      stylesheets.set(file, await readFile(resolve(SITE, file), "utf8"));
    }
    return stylesheets.get(file);
  };

  // Classes that are hooks rather than styling: JS targets, or names used only
  // as a descendant qualifier. Each needs a reason, not just an entry.
  const behavioural = new Set([
    "visually-hidden", // defined in shell.css's reset layer via [class]
  ]);

  for (const route of [...routes, "/404.html"]) {
    const html = await readRoute(route);
    const links = [...html.matchAll(/<link rel="stylesheet" href="\/([^"]+)"/g)].map(
      (m) => m[1],
    );
    const css = (await Promise.all(links.map(cssFor))).join("\n");

    const main = html.match(/<main\b[\s\S]*?<\/main>/)?.[0] ?? "";
    const used = new Set(
      [...main.matchAll(/class="([^"]+)"/g)]
        .flatMap((m) => m[1].split(/\s+/))
        .filter(Boolean),
    );

    for (const name of used) {
      if (behavioural.has(name)) continue;
      assert.ok(
        css.includes(`.${name}`),
        `${route}: .${name} is used in <main> but defined in none of ${links.join(", ")}`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// The redesigned homepage.
//
// The seven guards these replace described the previous composition — the
// Return Field, the two full-bleed colour chapters, the bento, the product
// stages. None of those elements exists any more; the page was rebuilt to the
// design comp, which is centre-weighted and built from a hero window, three
// hover rows, four figure cards, a focus receipt, a contribution graph and two
// closing bands.
//
// Deleting a guard because the thing it guarded is gone is correct. Deleting
// it without writing its replacement is how a page ends up with no coverage at
// all, so each of the properties worth holding is re-stated below against what
// actually shipped.

test("homepage has the approved narrative", async () => {
  const html = await readRoute("/");

  // An editorial contract, not a description: the page's argument cannot drift
  // a sentence at a time without someone deciding to.
  for (const copy of [
    "Pick up the task.",
    "Not the pieces.",
    "New — focus mode puts away what isn't in the task",
    "Three moves. Nothing else to learn.",
    "A capsule is the whole surface of a task.",
    "Resuming can also put away what isn't in the task.",
    "Nothing is lost.",
    "Every task you came back to.",
    "There is no account, because there is no server.",
    "Stop rebuilding the same workspace.",
  ]) {
    assert.ok(html.includes(copy), copy);
  }

  for (const id of ["how-it-works", "pieces", "focus", "history", "local", "download"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  // The previous composition's classes, so a half-finished revert is caught.
  for (const removed of [
    'class="return-field',
    'class="bento',
    'class="thesis',
    'class="honest-return',
    'class="chapter-heading',
  ]) {
    assert.doesNotMatch(html, new RegExp(removed), removed);
  }
});

test("the homepage's claims about the build match what ships", async () => {
  // Comments stripped: the source explains at length why the design's numbers
  // were not used, and quoting a wrong claim in order to reject it must not
  // read as making it.
  const html = (await readRoute("/")).replace(/<!--[\s\S]*?-->/g, "");

  // The design comp says "Apple silicon & Intel", "macOS 13 or later", "14 MB"
  // and "Free while in beta". All four are wrong for the artifact this page
  // links to, and the last one implies a price that does not exist. The layout
  // is the design's; these numbers are the product's.
  assert.ok(html.includes("no Intel build"), "names the missing Intel build");
  assert.ok(html.includes("macOS 11+"), "the real floor");
  assert.ok(html.includes("5.5 MB"), "the real size");
  assert.ok(html.includes("MIT-licensed"), "the real licence");

  assert.doesNotMatch(html, /Apple silicon &amp; Intel|Apple silicon & Intel/);
  assert.doesNotMatch(html, /macOS 13/);
  assert.doesNotMatch(html, /while in beta/);
  assert.doesNotMatch(html, /14 MB/);
});

test("homepage is a focused download narrative", async () => {
  const html = await readRoute("/");

  // One video. The design comp has a single demo slot — the window under the
  // headline — and the two loops the previous page carried have no home in
  // this composition. Raising this number needs a section to put one in, not
  // just an asset.
  assert.equal((html.match(/<video\b/g) ?? []).length, 1);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);

  assert.doesNotMatch(html, /type="radio"/);
  assert.doesNotMatch(html, /3978ec57|86M2X6MUA3/);
});

test("the hover rows are a disclosure, not a hover-only secret", async () => {
  const html = await readRoute("/");
  const css = await readFile(resolve(SITE, "css/landing.css"), "utf8");

  // Every row is focusable, so the description is reachable without a pointer.
  assert.equal((html.match(/class="move" tabindex="0"/g) ?? []).length, 3);

  // And the text is in the markup at full weight — folded by opacity, which
  // keeps it in the accessibility tree, never `display: none`.
  for (const copy of [
    "Files, terminals, tabs and the branch, sealed into one capsule",
    "Resuming closes what is not in the task, and says what it kept",
    "Everything comes back, branch first, with a receipt",
  ]) {
    assert.ok(html.includes(copy), copy);
  }
  const desc = css.match(/\.move__desc \{([\s\S]*?)\n\s*\}/)?.[1] ?? "";
  assert.match(desc, /opacity:\s*0/);
  assert.doesNotMatch(desc, /display:\s*none|visibility:\s*hidden/);

  // A pointer-less device gets them all open rather than none.
  const noHover = css.slice(css.indexOf("@media not all and (hover: hover)"));
  assert.match(noHover, /\.move__desc \{[\s\S]*?opacity:\s*1/);
});

test("the focus switch ships in the state that makes its section legible", async () => {
  const html = await readRoute("/");

  // With no JavaScript the toggle cannot move, so the page must ship showing
  // the interesting half: focus mode on, and a receipt that has something in
  // it. Shipping "off" would leave a scriptless visitor reading a section
  // about a feature next to a result where nothing happened.
  const toggle = html.match(/<button[^>]*data-focus-toggle[^>]*>/)?.[0] ?? "";
  assert.ok(toggle, "the switch exists");
  assert.match(toggle, /role="switch"/, "a real switch, not a styled div");
  assert.match(toggle, /aria-checked="true"/, "ships on");
  assert.match(toggle, /type="button"/);

  assert.ok(html.includes("6 tabs closed · 4 kept"));
  assert.ok(html.includes("focus mode on"));
});

test("the contribution graph is markup, not a runtime artefact", async () => {
  const html = await readRoute("/");

  // 140 cells: twenty weeks of seven days, written into the page. It is
  // illustrative and it never changes, so generating it at runtime would only
  // mean a scriptless visitor sees an empty box where the argument was.
  const grid = html.match(/<div class="heat__grid"[\s\S]*?<\/div>/)?.[0] ?? "";
  assert.equal((grid.match(/class="heat__cell"/g) ?? []).length, 140);

  // It is a graphic with one accessible name, not 140 announced spans.
  assert.match(grid, /role="img"/);
  assert.match(grid, /aria-label="[^"]+"/);
});

test("the marquee names only apps a connector actually speaks to", async () => {
  const html = await readRoute("/");
  const marquee = html.match(/<div class="marquee"[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? "";

  // A logo wall is a claim. Everything on it is an editor the Open VSX
  // extension installs into, a terminal those editors host, or a browser the
  // Chrome connector runs in — nothing aspirational.
  for (const app of ["VS Code", "Cursor", "Zed", "Ghostty", "iTerm2", "Terminal", "Warp", "Chrome", "Arc", "Firefox"]) {
    assert.ok(marquee.includes(`>${app}</span>`), app);
  }

  // Duplicated once so the CSS can translate the track by exactly -50% and
  // loop seamlessly without measuring anything.
  assert.equal((marquee.match(/class="marquee__logo"/g) ?? []).length, 20);

  // Decorative: the same list is given to assistive technology once, as a
  // sentence, rather than twice as twenty orphaned labels.
  assert.match(marquee, /aria-hidden="true"/);
  assert.ok(html.includes("Connectors currently speak to VS Code"));
});

test("the two document pages are navigable, not just long", async () => {
  // /setup/ and /privacy/ are the pages people read while doing something —
  // installing, or checking what is stored before they trust the app. They are
  // also the only two long enough to get lost in. They had a boxed table of
  // contents that scrolled away at the top, useful once and then gone exactly
  // when it starts mattering.
  for (const route of ["/setup/", "/privacy/"]) {
    const html = await readRoute(route);

    assert.match(html, /class="doc-grid"/, `${route}: no document grid`);
    assert.match(html, /<nav class="doc-nav"/, `${route}: no sidebar index`);
    assert.match(html, /class="prose doc-body"/, `${route}: no numbered body`);
    assert.match(html, /class="page-head__meta"/, `${route}: no contents line`);

    // Every section is reachable from the sidebar, and every sidebar entry
    // points at a section that exists. Either half drifting is how an index
    // quietly starts lying.
    const nav = html.match(/<nav class="doc-nav"[\s\S]*?<\/nav>/)?.[0] ?? "";
    const linked = [...nav.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
    const sections = [...html.matchAll(/<h2 id="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(linked, sections, `${route}: index and sections disagree`);

    // The numbers are generated by CSS counters. A hand-typed "1." in a
    // heading would double them, which is what the old markup did.
    assert.doesNotMatch(
      html,
      /<h2 id="[^"]+">\s*\d+\./,
      `${route}: a heading still carries its own number`,
    );
    assert.doesNotMatch(html, /class="toc"/, `${route}: the boxed TOC is back`);
  }
});
