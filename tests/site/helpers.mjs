import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

export const ROOT = resolve(HERE, "../..");
export const SITE = resolve(ROOT, "website");

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
