import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

export const ROOT = resolve(HERE, "../..");

/** The built site: what GitHub Pages serves. `pnpm build:site` writes it. */
export const SITE = resolve(ROOT, "site/dist");
/** The site's sources, for guards about how it is written rather than what it ships. */
export const SRC = resolve(ROOT, "site/src");
export const STYLES = resolve(SRC, "styles");
export const SCRIPTS = resolve(SRC, "scripts");
export const COMPONENTS = resolve(SRC, "components");
/** Files copied verbatim into the build. */
export const PUBLIC = resolve(ROOT, "site/public");

export function routeFile(route) {
  if (route === "/") return resolve(SITE, "index.html");
  if (route === "/404.html") return resolve(SITE, "404.html");
  return resolve(SITE, route.slice(1), "index.html");
}

export async function readRoute(route) {
  return readFile(routeFile(route), "utf8");
}

export function localReferences(html) {
  return [...html.matchAll(/(?:src|href|poster)="(\/[^"]+)"/g)].map(
    (match) => match[1].split(/[?#]/, 1)[0],
  );
}

/** Every stylesheet a built page links, concatenated in link order. */
export async function builtCssFor(html) {
  const links = [...html.matchAll(/<link rel="stylesheet" href="\/([^"]+\.css)"/g)].map((m) => m[1]);
  const sheets = await Promise.all(links.map((file) => readFile(resolve(SITE, file), "utf8")));
  return sheets.join("\n");
}

/** An .astro component's markup, without its frontmatter fence. */
export function stripFrontmatter(source) {
  return source.replace(/^---[\s\S]*?\n---\n?/, "");
}
