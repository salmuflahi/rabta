import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { SITE, localReferences, readRoute } from "./helpers.mjs";

const routes = ["/", "/setup/", "/privacy/", "/404.html"];

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
  const desktop = css.match(/\.hero h1\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? "";
  const tablet = css.slice(
    css.indexOf("@media (max-width: 899px)"),
    css.indexOf("@media (max-width: 599px)"),
  );
  const mobile = css.slice(css.indexOf("@media (max-width: 599px)"));
  const tabletHero = tablet.match(/\.hero h1\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? "";
  const mobileHero = mobile.match(/\.hero h1\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? "";

  assert.match(desktop, /font-size:\s*72px/);
  assert.match(desktop, /line-height:\s*0\.98/);
  assert.match(tabletHero, /font-size:\s*46px/);
  assert.doesNotMatch(tabletHero, /line-height:/);
  assert.match(mobileHero, /font-size:\s*36px/);
  assert.doesNotMatch(mobileHero, /line-height:/);
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

  for (const file of ["css/shell.css", "css/landing.css", "index.html"]) {
    const source = await readFile(resolve(SITE, file), "utf8");
    const literals = [...source.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((match) =>
      match[0].toLowerCase(),
    );
    assert.ok(
      literals.every((value) => approved.has(value)),
      `${file}: unapproved color ${literals.find((value) => !approved.has(value))}`,
    );
  }
});

test("homepage uses the exact approved responsive section rhythm", async () => {
  const css = await readFile(resolve(SITE, "css/landing.css"), "utf8");
  const desktop = css.slice(0, css.indexOf("@media (max-width: 899px)"));
  const tablet = css.slice(
    css.indexOf("@media (max-width: 899px)"),
    css.indexOf("@media (max-width: 599px)"),
  );
  const mobile = css.slice(css.indexOf("@media (max-width: 599px)"));

  for (const [source, selector, spacing] of [
    [desktop, ".hero", "144px 64px"],
    [desktop, ".thesis", "160px"],
    [desktop, ".pieces", "128px 160px"],
    [desktop, ".honest-return", "160px"],
    [desktop, ".local", "96px"],
    [desktop, ".download", "160px"],
    [tablet, ".thesis", "112px"],
    [tablet, ".pieces", "92px 112px"],
    [tablet, ".honest-return", "112px"],
    [tablet, ".local", "72px"],
    [tablet, ".download", "112px"],
    [mobile, ".hero", "88px 40px"],
    [mobile, ".thesis", "88px"],
    [mobile, ".pieces", "72px 88px"],
    [mobile, ".honest-return", "88px"],
    [mobile, ".local", "56px"],
    [mobile, ".download", "88px"],
  ]) {
    const body = source.match(
      new RegExp(`\\${selector}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`),
    )?.[1] ?? "";
    assert.match(
      body,
      new RegExp(`padding-block:\\s*${spacing}`),
      `${selector} ${spacing}`,
    );
  }
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

test("homepage metadata uses the approved contrast pairings", async () => {
  const landing = await readFile(resolve(SITE, "css/landing.css"), "utf8");
  const shell = await readFile(resolve(SITE, "css/shell.css"), "utf8");

  for (const selector of [
    ".requirement",
    ".release-strip",
    ".product-crop figcaption",
    ".return-demo figcaption",
  ]) {
    const body = landing.match(
      new RegExp(`\\${selector.replaceAll(" ", "\\s+")}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`),
    )?.[1] ?? "";
    assert.match(body, /color:\s*var\(--cool-soft\)/, selector);
  }

  for (const selector of [".local .eyebrow", ".availability"]) {
    const body = landing.match(
      new RegExp(`\\${selector.replaceAll(" ", "\\s+")}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`),
    )?.[1] ?? "";
    assert.match(body, /color:\s*var\(--(?:petrol|cool-panel)\)/, selector);
  }

  const livingShell = shell.slice(shell.indexOf("Living Instrument shared shell"));
  const footerMeta = livingShell.match(/\.foot__meta\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? "";
  assert.match(footerMeta, /color:\s*var\(--cool-soft\)/);
});

test("homepage footer includes the published release page", async () => {
  const html = await readRoute("/");
  const footer = html.match(/<footer\b[\s\S]*?<\/footer>/)?.[0] ?? "";
  assert.match(
    footer,
    /href="https:\/\/github\.com\/salmuflahi\/rabta\/releases\/tag\/v0\.1\.0"[^>]*>Release<\/a>/,
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
    assert.match(html, /class="rail foot__compact"/, route);

    const footer = html.match(/<footer\b[\s\S]*?<\/footer>/)?.[0] ?? "";
    for (const link of [
      '"/setup/"',
      '"/privacy/"',
      "https://github.com/salmuflahi/rabta",
      "https://github.com/salmuflahi/rabta/releases/tag/v0.1.0",
      "open-vsx.org",
      "https://github.com/salmuflahi/rabta/issues",
    ]) {
      assert.ok(footer.includes(link), `${route} footer → ${link}`);
    }
    assert.ok(footer.includes("v0.1.0 · MIT · Sammy Almuflahi"), route);

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
  assert.equal(regions.length, 2);
  assert.deepEqual(
    regions.sort(),
    ['data-product-media="hero"', 'data-product-media="return"'],
  );

  // These are attached by JavaScript, so no crawler and no earlier contract
  // would ever notice them going missing.
  const sources = [
    ...home.matchAll(/data-src-(?:desktop|mobile)="(\/[^"]+)"/g),
  ].map((match) => match[1]);
  assert.equal(sources.length, 4);
  for (const source of sources) {
    await access(resolve(SITE, `.${source}`));
  }

  const posters = [...home.matchAll(/poster="(\/[^"]+)"/g)].map((m) => m[1]);
  assert.equal(posters.length, 2);
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

test("homepage has the approved narrative and removes the stale architecture", async () => {
  const html = await readRoute("/");

  for (const copy of [
    "Workspace memory for macOS",
    "Pick up the task.",
    "Not the pieces.",
    "A task is more than a folder.",
    "The pieces you usually reconstruct by hand.",
    "The return, shown honestly.",
    "Local is not a privacy setting.",
    "Come back to the work.",
  ]) {
    assert.ok(html.includes(copy), copy);
  }

  for (const id of ["how-it-works", "pieces", "return", "local", "download"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  for (const removed of [
    'class="rack',
    'class="evidence',
    'class="switch',
    'class="ledger',
  ]) {
    assert.doesNotMatch(html, new RegExp(removed));
  }

  assert.ok(html.includes("no Intel build"));
  assert.ok(html.includes("Workspace partially restored"));
  assert.ok(html.includes("On next reload"));
});

test("mobile Return Field offsets fit inside the viewport", async () => {
  const css = await readFile(resolve(SITE, "css/landing.css"), "utf8");
  const mobile = css.match(
    /@media \(max-width: 599px\) \{[\s\S]*?\.return-field \{([\s\S]*?)\n\s*\}/,
  )?.[1];

  assert.ok(mobile, "mobile Return Field rule exists");
  assert.match(mobile, /width:\s*auto/);
  assert.match(mobile, /margin-inline:\s*12px/);
});

test("homepage is a focused download narrative", async () => {
  const html = await readRoute("/");

  assert.equal((html.match(/<video\b/g) ?? []).length, 2);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);

  const pieces =
    html.match(/<section\b[^>]*id="pieces"[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.equal((pieces.match(/<img\b/g) ?? []).length, 1);

  assert.doesNotMatch(html, /type="radio"/);
  assert.doesNotMatch(html, /3978ec57|86M2X6MUA3/);
});

test("the two colour chapters are full-bleed surfaces", async () => {
  const html = await readRoute("/");

  // The cool panel and the ivory reset are the world changing colour, not
  // centred cards. Carrying a rail/shell here would also charge the product
  // stage inside a double gutter.
  for (const id of ["return", "local"]) {
    const open = html.match(new RegExp(`<section\\b[^>]*id="${id}"[^>]*>`))?.[0] ?? "";
    assert.ok(open, id);
    assert.doesNotMatch(open, /class="[^"]*\b(?:rail|shell)\b/, id);
  }
});

test("product stages declare their own shape", async () => {
  const css = await readFile(resolve(SITE, "css/landing.css"), "utf8");
  const desktop = css.slice(0, css.indexOf("@media (max-width: 899px)"));
  const stage =
    desktop.match(/\[data-product-media\] video \{([\s\S]*?)\n\s*\}/)?.[1] ?? "";

  // Never `height: auto` alone: that hands the stage's height to whichever
  // source is attached, so a post-load breakpoint change restyles the page.
  assert.match(stage, /aspect-ratio:\s*1280\s*\/\s*720/);
  assert.match(stage, /object-fit:\s*contain/);

  for (const selector of [".return-field__stage video", ".return-demo video"]) {
    const body =
      desktop.match(
        new RegExp(`\\${selector.replaceAll(" ", "\\s+")} \\{([\\s\\S]*?)\\n\\s*\\}`),
      )?.[1] ?? "";
    assert.doesNotMatch(body, /aspect-ratio|object-fit/, selector);
  }
});

test("mobile product media is a deliberate portrait crop", async () => {
  const css = await readFile(resolve(SITE, "css/landing.css"), "utf8");
  const mobile = css.slice(css.indexOf("@media (max-width: 599px)"));

  const stage =
    mobile.match(/\[data-product-media\] video \{([\s\S]*?)\n\s*\}/)?.[1] ?? "";
  assert.match(stage, /aspect-ratio:\s*390\s*\/\s*700/);
  assert.match(stage, /object-fit:\s*cover/);

  const hero =
    mobile.match(
      /\[data-product-media="hero"\] video \{([\s\S]*?)\n\s*\}/,
    )?.[1] ?? "";
  const restore =
    mobile.match(
      /\[data-product-media="return"\] video \{([\s\S]*?)\n\s*\}/,
    )?.[1] ?? "";

  assert.match(hero, /object-position:/);
  assert.match(restore, /object-position:/);
  assert.notEqual(
    hero.trim(),
    restore.trim(),
    "each loop keeps its own crop position",
  );

  // The crop is CSS-only: the intrinsic ratio the browser uses before the
  // stylesheet applies must still be the recorded one.
  const html = await readRoute("/");
  const videos = [...html.matchAll(/<video\b[^>]*>/g)].map((match) => match[0]);
  assert.equal(videos.length, 2);
  for (const video of videos) {
    assert.match(video, /width="1280"/);
    assert.match(video, /height="720"/);
  }
});

test("Return Field paints the orange fold outside the clipped cool sheet", async () => {
  const css = await readFile(resolve(SITE, "css/landing.css"), "utf8");
  const field = css.match(/\.return-field \{([\s\S]*?)\n\s*\}/)?.[1] ?? "";
  const sheet =
    css.match(/\.return-field::before \{([\s\S]*?)\n\s*\}/)?.[1] ?? "";
  const fold =
    css.match(/\.return-field::after \{([\s\S]*?)\n\s*\}/)?.[1] ?? "";

  assert.doesNotMatch(field, /clip-path/);
  assert.match(sheet, /background:\s*var\(--cool-field\)/);
  assert.match(sheet, /clip-path/);
  assert.match(fold, /background:\s*var\(--orange\)/);
});
