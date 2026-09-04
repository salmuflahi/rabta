# rabta-count

The visitor counter behind [rabta.build](https://rabta.build). One cookieless
ping per page view, aggregates only, a private dashboard. It is a Cloudflare
Worker with a single D1 database and it fits inside the free tier.

## What it does

The site sends one beacon per page view: `navigator.sendBeacon` to `/hit` with
a `text/plain` body of `{ "p": path, "r": referrer host, "w": device class }`.
The worker adds the country Cloudflare already knows for the request and
increments five daily counters: views and visitors for the day, and views per
path, per referrer host, per country and per device class.

A private page at `/stats` shows the last 30 days; `/stats.json` is the same
numbers as JSON for `curl` and scripts.

## The privacy model, in plain words

- **No cookies, no local storage, no fingerprinting, no third party.** The page
  sends three short fields and gets an empty 204 back.
- **The address and the user agent are never stored and never logged.** They are
  used for one thing: to tell whether this is the same visitor as an earlier one
  today. Both are hashed together with a random salt that is created fresh every
  UTC day (`sha256(salt:ip:user-agent)`, kept as 32 hex characters). Only that
  hash is written.
- **The hashes do not survive the day.** At 00:05 UTC a cron deletes yesterday's
  hashes and yesterday's salt. From then on nothing in the database can be tied
  to a person or a device, even in theory. What remains is "N views and M
  visitors on that day", broken down by path, referrer host, country and device.
- **"Visitors" over 7 or 30 days is the sum of each day's unique visitors.**
  Someone who comes back tomorrow counts again. That is the price of keeping
  nothing that outlives the day, and the dashboard says so.
- **Opt-outs are honoured before anything is read.** A request carrying
  `Sec-GPC: 1` (Global Privacy Control) or `DNT: 1` is answered with 204 and
  nothing is counted, not even in the aggregate.
- **Inputs are cut down to categories.** A path is kept only when it looks like a
  site path (`/`, lowercase letters, digits, `/` and `-`, at most 64 characters);
  anything else is `/other`. A referrer becomes a lowercase hostname at most 80
  characters long (a full URL loses its path and query), or `(direct)`. Device
  is `phone`, `tablet`, `desktop` or `unknown`. Country is Cloudflare's
  two-letter code or `ZZ`.
- **Failure means "not counted", never an error.** If D1 is unreachable or the
  free tier's daily quota is spent, the view is dropped and the visitor is still
  answered with 204. The site never depends on this worker.

## The beacon the site sends

```js
const w = matchMedia("(max-width: 600px)").matches
  ? "phone"
  : matchMedia("(max-width: 1024px)").matches
    ? "tablet"
    : "desktop";
let r = "";
try {
  r = document.referrer ? new URL(document.referrer).hostname : "";
} catch {}
if (r === location.hostname) r = "";
navigator.sendBeacon(
  `${COUNT_ORIGIN}/hit`,
  new Blob([JSON.stringify({ p: location.pathname, r, w })], { type: "text/plain" }),
);
```

`text/plain` keeps the request CORS-simple, so the browser sends it without a
preflight. The worker answers every `/hit` with
`access-control-allow-origin: https://rabta.build` (the `ALLOWED_ORIGIN` var)
and `cache-control: no-store`. The site's own content security policy needs
`connect-src https://count.rabta.build` for the beacon to leave the page.

## Routes

| Route             | What                                                        |
| ----------------- | ----------------------------------------------------------- |
| `POST /hit`       | one page view; always 204                                   |
| `OPTIONS /hit`    | CORS preflight; 204                                         |
| `GET /stats`      | the dashboard, HTML; bearer token or Cloudflare Access      |
| `GET /stats.json` | the same numbers as JSON; bearer token or Cloudflare Access |
| `GET /`           | empty 204, for health checks                                |
| anything else     | 404                                                         |

## Setting it up, in order

Every command runs from the repository root.

1. `pnpm install`
2. `pnpm --filter rabta-count exec wrangler login`
3. `pnpm --filter rabta-count exec wrangler d1 create count`
   Paste the `database_id` it prints into `workers/count/wrangler.jsonc`, over
   `REPLACE_AFTER_wrangler_d1_create`.
4. `pnpm --filter rabta-count exec wrangler d1 migrations apply count --remote`
5. Make a token and store it as the worker's secret:
   `openssl rand -hex 24`, then
   `pnpm --filter rabta-count exec wrangler secret put STATS_TOKEN` and paste
   it. Keep it in your password manager: it is the dashboard's key until
   Cloudflare Access is in front of it. Without the secret, token auth is simply
   off (the worker does not treat "no secret" as an empty password).
6. `pnpm --filter rabta-count exec wrangler deploy`
   Note the `https://rabta-count.<account>.workers.dev` URL it prints.
7. Check it: `curl -i https://rabta-count.<account>.workers.dev/` answers 204, and
   `curl -H "Authorization: Bearer <token>" https://rabta-count.<account>.workers.dev/stats.json`
   answers with zeros.

### Later, once the rabta.build zone is on Cloudflare DNS

8. In `wrangler.jsonc`, uncomment the `routes` line and set `workers_dev` to
   `false`, then `pnpm --filter rabta-count exec wrangler deploy`. The counter
   now answers at `https://count.rabta.build` and the old URL stops answering,
   which matters because Access (next step) protects only the custom domain.
9. The site already points at `https://count.rabta.build`
   (`COUNT_ORIGIN` in `site/src/config.ts`).
10. Put Cloudflare Access in front of the dashboard. In Zero Trust: Access,
    Applications, Add an application, Self-hosted. Name it, set the domain to
    `count.rabta.build` and the path to `stats*` (that covers `/stats` and
    `/stats.json`; `/hit` stays public). Add one Allow policy that includes
    your email, with One-time PIN as the login method.
11. From the application's overview copy the Application Audience (AUD) tag
    into `ACCESS_AUD` in `wrangler.jsonc`, and put your team name (the
    `<team>` in `https://<team>.cloudflareaccess.com`, the login page's host)
    into `ACCESS_TEAM`. Redeploy. The worker now also accepts the
    `Cf-Access-Jwt-Assertion` header Access attaches after login, verified
    against `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` with
    that audience and issuer. Until both vars are set, the header is ignored.

    One consequence: with `stats*` behind Access, `curl` no longer reaches
    `/stats.json` with just the bearer token, because Access answers first. Either
    add a Service Auth policy and send its `CF-Access-Client-Id` /
    `CF-Access-Client-Secret` headers alongside the bearer token, or narrow the
    Access path to `stats` (exact) so the JSON route stays on the bearer token
    alone, which the worker enforces by itself.

## Reading it

Open `https://count.rabta.build/stats` (or the `workers.dev` URL before step 8)
in a browser. Log in through Access, or add the header from a browser
extension if Access is not set up yet. The page has:

- three tiles: today, 7 days, 30 days, each with visitors large and views small;
- a 30-day line: visitors in ember, views as the faint line behind it;
- the top 15 pages, referrers and countries, and the device split, each row with
  a bar showing its share of the 30-day views.

The page makes no requests of its own: no fonts, no scripts, no images, and its
content security policy forbids all of them.

From the terminal:

```sh
curl -s -H "Authorization: Bearer $STATS_TOKEN" https://count.rabta.build/stats.json | jq
```

```json
{
  "today": { "views": 0, "visitors": 0 },
  "last7": { "views": 0, "visitors": 0 },
  "last30": { "views": 0, "visitors": 0 },
  "series": [{ "day": "2026-08-06", "views": 0, "visitors": 0 }],
  "pages": [{ "path": "/", "n": 0 }],
  "referrers": [{ "host": "(direct)", "n": 0 }],
  "countries": [{ "cc": "ZZ", "n": 0 }],
  "devices": [{ "class": "desktop", "n": 0 }]
}
```

`series` has 30 entries, oldest first, zero-filled, ending today (UTC).

## The free tier and what happens past it

Workers Free allows 100,000 requests a day; D1 Free allows 100,000 rows written
and 5 million rows read a day, with 5 GB of storage. One page view costs three
round trips to D1 and about six or seven written rows, so the counter fits
roughly 14,000 page views a day before D1 starts refusing writes.

Past the quota, D1 answers with an error. `/hit` swallows it: the view goes
uncounted and the visitor still gets the 204. `/stats` and `/stats.json` answer
`503 {"error":"stats unavailable"}` until the quota resets at 00:00 UTC. Nothing
on the site notices. Storage is not a concern: the aggregate tables gain a
handful of rows a day and the per-visitor table is emptied every night.

## Tests and local work

```sh
pnpm --filter rabta-count test              # vitest inside workerd, local D1, migrations applied
pnpm --filter rabta-count exec tsc --noEmit # types
pnpm --filter rabta-count exec wrangler dev # local worker on :8787
pnpm --filter rabta-count migrate:local     # migrations for the local D1 that wrangler dev uses
pnpm --filter rabta-count types             # regenerate worker-configuration.d.ts after changing bindings
```

The tests cover the opt-out headers, the sanitising rules, the per-day unique
count, that no address or user agent ever lands in a table, the dashboard's
headers and numbers, both auth doors (the Access door against a mocked key
set), and the nightly purge. For `wrangler dev`, local secrets go in
`workers/count/.dev.vars` (`STATS_TOKEN=...`), which is gitignored.

## Deploying from CI

`.github/workflows/count.yml` runs on every push to `main` that touches
`workers/count/`: install, type check, tests. When the repository variable
`COUNT_DEPLOY` is `true` and the secrets `CLOUDFLARE_API_TOKEN` (Workers
Scripts: Edit, D1: Edit, Account Settings: Read) and `CLOUDFLARE_ACCOUNT_ID`
exist, it then applies the migrations and deploys. Until the variable is set,
a push only runs the tests, so nothing fails for want of credentials.
