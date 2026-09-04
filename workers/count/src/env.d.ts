// Bindings that `wrangler types` cannot see. STATS_TOKEN is a secret: it is
// set with `wrangler secret put STATS_TOKEN`, never written to wrangler.jsonc,
// so the generated worker-configuration.d.ts does not know about it. It is
// optional because a fresh deploy has no token yet, and the worker must treat
// that as "token auth disabled" rather than as an empty password.
declare namespace Cloudflare {
  interface Env {
    STATS_TOKEN?: string;
  }
}
