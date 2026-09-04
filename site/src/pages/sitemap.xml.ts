import type { APIRoute } from "astro";
import { SITE_ORIGIN } from "../config.ts";

/**
 * Every page that exists, and nothing else. Enumerated from the pages folder
 * so a new route cannot be forgotten and a deleted one cannot linger. The
 * 404 page is not a destination.
 */
const pages = import.meta.glob("./**/*.astro");
const routes = Object.keys(pages)
  .map((file) => file.replace(/^\.\//, "/").replace(/index\.astro$/, "").replace(/\.astro$/, "/"))
  .filter((route) => route !== "/404/")
  .sort((a, b) => (a === "/" ? -1 : b === "/" ? 1 : a.localeCompare(b)));

export const GET: APIRoute = () => {
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes
    .map((route) => `  <url><loc>${SITE_ORIGIN}${route}</loc></url>`)
    .join("\n")}\n</urlset>\n`;
  return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8" } });
};
