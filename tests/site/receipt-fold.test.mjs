import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { SITE, readRoute } from "./helpers.mjs";

// The site deliberately has no package boundary or build step. Load the real
// browser module as source so Node 18 does not reinterpret its .js suffix as
// CommonJS while exercising it.
const foldSource = await readFile(
  new URL("../../website/js/receipt-fold.js", import.meta.url),
  "utf8",
);
const { setReceiptFolded, initReceiptFolds } = await import(
  `data:text/javascript;base64,${Buffer.from(foldSource).toString("base64")}`
);

test("receipt toggle exposes the real state", () => {
  const attrs = new Map([["aria-pressed", "false"]]);
  const button = {
    dataset: {},
    setAttribute(name, value) {
      attrs.set(name, value);
    },
  };

  setReceiptFolded(button, true);
  assert.equal(attrs.get("aria-pressed"), "true");
  assert.equal(button.dataset.folded, "true");

  setReceiptFolded(button, false);
  assert.equal(attrs.get("aria-pressed"), "false");
  assert.equal(button.dataset.folded, "false");
});

test("clicking toggles the fold, and teardown detaches it", () => {
  const listeners = [];
  const button = {
    attrs: {},
    dataset: { folded: "false" },
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    addEventListener(type, fn) {
      listeners.push({ type, fn });
    },
    removeEventListener(type, fn) {
      const at = listeners.findIndex((l) => l.type === type && l.fn === fn);
      if (at >= 0) listeners.splice(at, 1);
    },
  };

  const teardown = initReceiptFolds({ querySelectorAll: () => [button] });
  assert.equal(listeners.length, 1);
  assert.equal(listeners[0].type, "click");

  listeners[0].fn();
  assert.equal(button.dataset.folded, "true");
  assert.equal(button.attrs["aria-pressed"], "true");

  // Click state is sticky and reversible — it never latches folded.
  listeners[0].fn();
  assert.equal(button.dataset.folded, "false");
  assert.equal(button.attrs["aria-pressed"], "false");

  teardown();
  assert.equal(listeners.length, 0);
});

test("desktop and mobile hinge halves are exact", async () => {
  const css = await readFile(resolve(SITE, "css/receipt-fold.css"), "utf8");

  assert.match(css, /--fold-size:\s*56px/);
  assert.match(css, /--fold-half:\s*28px/);
  assert.match(css, /--fold-size:\s*40px/);
  assert.match(css, /--fold-half:\s*20px/);

  assert.match(
    css,
    /rotate3d\(1,\s*1,\s*0,\s*calc\(-180deg \* var\(--fold-progress\)\)\)/,
  );
  // The hinge is the 45° edge's midpoint, (width − half, half). Any other
  // origin detaches the flap from the corner it is supposed to be peeling.
  assert.match(css, /calc\(100% - var\(--fold-half\)\) var\(--fold-half\)/);
});

test("the orange underside turns about the hinge, not about Y", async () => {
  const css = await readFile(resolve(SITE, "css/receipt-fold.css"), "utf8");
  // Anchored so it cannot match the grouped `::before, ::after` reset above.
  const back = css.match(/[^,]\n\s*\.receipt__flap::after \{([\s\S]*?)\n\s*\}/)?.[1] ?? "";
  const target = css.match(/\.receipt__target \{([\s\S]*?)\n\s*\}/)?.[1] ?? "";

  assert.match(back, /background:\s*var\(--orange\)/);

  // A rotateY flip mirrors horizontally, which lands the underside on
  // (0,0) (N,0) (0,N) and leaves a notch where it misses the target. The two
  // faces of a sheet are mirrored across the hinge, so the pre-turn uses the
  // hinge's own axis and the mirrored triangle.
  assert.doesNotMatch(back, /rotateY/);
  assert.match(back, /transform:\s*rotate3d\(1,\s*1,\s*0,\s*180deg\)/);
  assert.match(back, /clip-path:\s*polygon\(0 0, 0 100%, 100% 100%\)/);

  // Same triangle, stated the other way round: the flap's -180deg composes
  // with the pre-turn to the identity, so the underside lands here exactly.
  assert.match(target, /clip-path:\s*polygon\(0 0, 100% 100%, 0 100%\)/);
});

test("the fold keeps the approved timing", async () => {
  const css = await readFile(resolve(SITE, "css/receipt-fold.css"), "utf8");
  const flap = css.match(/\.receipt__flap \{([\s\S]*?)\n\s*\}/)?.[1] ?? "";

  assert.match(flap, /transition:\s*transform 520ms/);
  assert.match(css, /transition-delay:\s*100ms/);
});

test("the receipt is a real button carrying real state", async () => {
  const html = await readRoute("/");
  const receipt = html.match(/<button\b[^>]*data-receipt-fold[^>]*>/)?.[0] ?? "";

  assert.ok(receipt, "the receipt is a native button");
  assert.match(receipt, /type="button"/);
  assert.match(receipt, /aria-pressed="false"/);
  assert.match(receipt, /data-folded="false"/);
  assert.match(receipt, /aria-describedby="receipt-summary"/);

  // The manifest is decorative uppercase; the accessible summary is the copy
  // a screen reader actually gets.
  assert.match(html, /id="receipt-summary"[^>]*>|<span class="visually-hidden" id="receipt-summary">/);
  for (const copy of [
    "YOUR PLACE IS KEPT",
    "FILES",
    "TERMINALS",
    "BROWSER TABS",
    "BRANCH",
    "RESTORE RESULT",
    "v0.1.0 · MIT · Sammy Almuflahi",
  ]) {
    assert.ok(html.includes(copy), copy);
  }
});

test("reduced motion resolves the fold instead of animating it", async () => {
  const css = await readFile(resolve(SITE, "css/receipt-fold.css"), "utf8");
  const reduced = css.slice(css.indexOf("prefers-reduced-motion"));

  assert.ok(reduced, "a reduced-motion block exists");
  assert.match(reduced, /transition:\s*none/);
  // The message and the orange underside must be readable without motion.
  assert.match(reduced, /opacity:\s*1/);
});
