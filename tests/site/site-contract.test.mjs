import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
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

test("all root-relative assets exist", async () => {
  for (const route of routes) {
    const html = await readRoute(route);
    for (const ref of localReferences(html)) {
      if (ref === "/") continue;
      await access(resolve(SITE, `.${ref}`));
    }
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
