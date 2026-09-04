// rabta.build's visitor counter. Four routes and a nightly purge.
//
//   POST /hit         one page view, from the site's beacon (204, always)
//   GET  /stats       the private dashboard (bearer token or Cloudflare Access)
//   GET  /stats.json  the same numbers as JSON
//   GET  /            204, so a health check has something to hit
//
// The cron drops yesterday's visitor hashes and the salt that made them.

import { authorize } from "./auth";
import { renderDashboard } from "./dashboard";
import { utcDay } from "./day";
import { handleHit } from "./hit";
import { readStats } from "./stats";

const NO_STORE = { "cache-control": "no-store" } as const;

function preflight(env: Cloudflare.Env): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": env.ALLOWED_ORIGIN,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "86400",
      ...NO_STORE,
    },
  });
}

function nonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function stats(request: Request, env: Cloudflare.Env, json: boolean): Promise<Response> {
  const denied = await authorize(request, env);
  if (denied) return denied;
  try {
    const data = await readStats(env.DB);
    if (json) return Response.json(data, { headers: { ...NO_STORE, "x-robots-tag": "noindex" } });
    const n = nonce();
    return new Response(renderDashboard(data, n), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": `default-src 'none'; style-src 'nonce-${n}'; img-src 'none'; base-uri 'none'; form-action 'none'`,
        "referrer-policy": "no-referrer",
        "x-robots-tag": "noindex",
        "x-content-type-options": "nosniff",
        ...NO_STORE,
      },
    });
  } catch {
    // The database is the only thing that can fail here. Say so plainly
    // rather than surfacing a stack trace to whoever is logged in.
    return Response.json({ error: "stats unavailable" }, { status: 503, headers: NO_STORE });
  }
}

export default {
  async fetch(request, env, _ctx) {
    const { pathname } = new URL(request.url);
    switch (pathname) {
      case "/hit":
        if (request.method === "OPTIONS") return preflight(env);
        if (request.method === "POST") return handleHit(request, env);
        break;
      case "/stats":
      case "/stats.json":
        if (request.method === "GET") return stats(request, env, pathname.endsWith(".json"));
        break;
      case "/":
        return new Response(null, { status: 204, headers: NO_STORE });
    }
    return new Response(null, { status: 404, headers: NO_STORE });
  },

  async scheduled(_controller, env, _ctx) {
    const today = utcDay();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM uniques WHERE day < ?").bind(today),
      env.DB.prepare("DELETE FROM salts WHERE day < ?").bind(today),
    ]);
  },
} satisfies ExportedHandler<Cloudflare.Env>;
