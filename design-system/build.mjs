#!/usr/bin/env node
/**
 * Build the Living Instrument design system into design-system/dist/.
 *
 *   ./design-system/build.mjs
 *
 * Each card is a fragment in parts/, wrapped here into a standalone page with
 * the site's OWN stylesheets inlined — website/css/tokens.css and shell.css,
 * verbatim. The cards therefore render with the real values and the real
 * component rules; changing a token changes every card that shows it.
 *
 * That is the whole point. A design system re-typed by hand into a second
 * place is a design system that disagrees with the product within a month,
 * and this repo has already been bitten twice by assets that drifted from
 * what a manifest claimed (popup.css, the vsix icon).
 *
 * The webfont is inlined as a data URI because these pages are viewed off a
 * host that has none of this repo's assets, and a type specimen set in a
 * fallback face documents the wrong typeface.
 */
import { readFileSync, readdirSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = resolve(fileURLToPath(new URL(".", import.meta.url)));
const ROOT = resolve(HERE, "..");
const OUT = join(HERE, "dist");
const CSS = join(ROOT, "website", "css");

const read = (p) => readFileSync(p, "utf8");

/* The font, inlined. Everything else the stylesheets reference by URL is
   decoration these cards do not use. */
const font = readFileSync(join(ROOT, "website/assets/fonts/inter-var.woff2")).toString(
  "base64",
);
const tokens = read(join(CSS, "tokens.css")).replace(
  /url\("\/assets\/fonts\/inter-var\.woff2"\)/,
  `url("data:font/woff2;base64,${font}")`,
);
if (!tokens.includes("data:font/woff2")) {
  throw new Error("tokens.css no longer declares the font the way build.mjs expects");
}

const shell = read(join(CSS, "shell.css"));
const card = read(join(HERE, "card.css"));

/** `<!-- @dsCard … -->` has to survive as the first line of the built file. */
function build(file) {
  const src = read(join(HERE, "parts", file));
  const [first, ...rest] = src.split("\n");
  if (!first.startsWith("<!-- @dsCard")) {
    throw new Error(`${file}: first line must be the @dsCard marker`);
  }
  const title = /name="([^"]+)"/.exec(first)?.[1] ?? basename(file, ".html");

  return `${first}
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} — Rabta</title>
<style>
/* ---- website/css/tokens.css, verbatim (font inlined) ---- */
${tokens}
/* ---- website/css/shell.css, verbatim ---- */
${shell}
/* ---- design-system/card.css: the card's own chrome ---- */
${card}
</style>
</head>
<body>
${rest.join("\n")}
</body>
</html>
`;
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const parts = readdirSync(join(HERE, "parts")).filter((f) => f.endsWith(".html")).sort();
for (const f of parts) {
  const html = build(f);
  const bytes = Buffer.byteLength(html);
  // DesignSync caps a file at 256 KiB; the inlined font is most of each page.
  if (bytes > 256 * 1024) throw new Error(`${f} is ${bytes} bytes, over the 256 KiB limit`);
  writeFileSync(join(OUT, f), html);
  console.log(`  ${f.padEnd(22)} ${(bytes / 1024).toFixed(0)} KiB`);
}
console.log(`==> ${parts.length} cards -> ${OUT}`);
