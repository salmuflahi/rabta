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
