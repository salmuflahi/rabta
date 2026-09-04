import { createExecutionContext, createScheduledController, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { shiftDay, utcDay } from "../src/day";
import worker from "../src/index";
import type { Stats } from "../src/stats";
import { call, count, hit, incoming, rows, wipe } from "./helpers";

const today = utcDay();
const TOKEN = env.STATS_TOKEN ?? "";
const auth = { authorization: `Bearer ${TOKEN}` };
const EM_DASH = String.fromCharCode(0x2014);

beforeEach(wipe);

/** Three views from two visitors: two pages, one outside referrer, one German phone. */
async function seed(): Promise<void> {
  await hit({ p: "/", r: "news.ycombinator.com", w: "desktop" });
  await hit({ p: "/why/", r: "", w: "desktop" });
  await hit({ p: "/", r: "", w: "phone" }, { "user-agent": "Mozilla/5.0 (iPhone) Rabta/1.0" }, { country: "DE" });
}

describe("GET /stats", () => {
  it("has a token to test with", () => {
    expect(TOKEN).not.toBe("");
  });

  it("is 401 without credentials", async () => {
    const res = await call(incoming("/stats"));
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("www-authenticate")).toContain("Bearer");
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("is 401 with a wrong token", async () => {
    for (const authorization of [`Bearer ${TOKEN}x`, `Bearer ${TOKEN.slice(1)}`, "Bearer ", `Basic ${TOKEN}`, TOKEN]) {
      const res = await call(incoming("/stats", { headers: { authorization } }));
      expect(res.status, authorization).toBe(401);
      expect(await res.json()).toEqual({ error: "unauthorized" });
    }
  });

  it("is 401 with a bearer token when no secret is configured", async () => {
    const noSecret = { ...env, STATS_TOKEN: undefined } as unknown as Cloudflare.Env;
    expect((await call(incoming("/stats", { headers: auth }), noSecret)).status).toBe(401);
    expect((await call(incoming("/stats", { headers: { authorization: "Bearer " } }), noSecret)).status).toBe(401);
  });

  it("renders the dashboard with the right token", async () => {
    await seed();
    const res = await call(incoming("/stats", { headers: auth }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");

    const csp = res.headers.get("content-security-policy") ?? "";
    const nonce = /style-src 'nonce-([0-9a-f]{32})'/.exec(csp)?.[1];
    expect(nonce).toBeDefined();
    expect(csp).toBe(`default-src 'none'; style-src 'nonce-${nonce}'; img-src 'none'; base-uri 'none'; form-action 'none'`);

    const html = await res.text();
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain(`<style nonce="${nonce}">`);
    expect(html.match(/<style/g)).toHaveLength(1);
    expect(html).toContain(`<time datetime="${today}">${today} UTC</time>`);
    expect(html).toContain("Rabta <span>·</span> site");

    // The tiles carry the numbers the three hits produced.
    expect(html).toContain('<div class="label">Today</div><div class="big">2</div><div class="small">3 views</div>');
    expect(html).toContain('<div class="label">7 days</div><div class="big">2</div><div class="small">3 views</div>');
    expect(html).toContain('<div class="label">30 days</div><div class="big">2</div><div class="small">3 views</div>');
    for (const text of ["/why/", "news.ycombinator.com", "(direct)", "DE", "ZZ", "phone", "desktop"]) {
      expect(html).toContain(`<span class="k">${text}</span>`);
    }
    expect(html).toContain('<path class="visitors"');
    expect(html).toContain('<path class="views"');

    // Nothing leaves the page: no scripts, no fetched resources, no inline
    // style attributes the policy would block, and no em dashes.
    expect(html).not.toMatch(/<(script|link|img|iframe|object|embed|form)\b/i);
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/ style=/);
    expect(html).not.toContain(EM_DASH);
  });

  it("uses a fresh nonce for every response", async () => {
    const a = await call(incoming("/stats", { headers: auth }));
    const b = await call(incoming("/stats", { headers: auth }));
    expect(a.headers.get("content-security-policy")).not.toBe(b.headers.get("content-security-policy"));
  });

  it("escapes what visitors sent", async () => {
    await hit({ p: "/", r: '<img src=x onerror="alert(1)">.example', w: "desktop" });
    const html = await (await call(incoming("/stats", { headers: auth }))).text();
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;imgsrc=xonerror=&quot;alert(1)&quot;&gt;.example");
  });

  it("renders an empty database as zeros", async () => {
    const html = await (await call(incoming("/stats", { headers: auth }))).text();
    expect(html).toContain('<div class="label">Today</div><div class="big">0</div><div class="small">0 views</div>');
    expect(html.match(/Nothing yet\./g)).toHaveLength(4);
  });
});

describe("GET /stats.json", () => {
  it("is 401 without a token", async () => {
    expect((await call(incoming("/stats.json"))).status).toBe(401);
  });

  it("returns the stats shape", async () => {
    await seed();
    const res = await call(incoming("/stats.json", { headers: auth }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const stats = (await res.json()) as Stats;
    expect(Object.keys(stats).sort()).toEqual(["countries", "devices", "last30", "last7", "pages", "referrers", "series", "today"]);
    expect(stats.today).toEqual({ views: 3, visitors: 2 });
    expect(stats.last7).toEqual({ views: 3, visitors: 2 });
    expect(stats.last30).toEqual({ views: 3, visitors: 2 });
    expect(stats.series).toHaveLength(30);
    expect(stats.series[0]).toEqual({ day: shiftDay(today, -29), views: 0, visitors: 0 });
    expect(stats.series[29]).toEqual({ day: today, views: 3, visitors: 2 });
    expect(stats.pages).toEqual([
      { path: "/", n: 2 },
      { path: "/why/", n: 1 },
    ]);
    expect(stats.referrers).toEqual([
      { host: "(direct)", n: 2 },
      { host: "news.ycombinator.com", n: 1 },
    ]);
    expect(stats.countries).toEqual([
      { cc: "ZZ", n: 2 },
      { cc: "DE", n: 1 },
    ]);
    expect(stats.devices).toEqual([
      { class: "desktop", n: 2 },
      { class: "phone", n: 1 },
    ]);
  });

  it("sums the windows from the day table and stops at their edges", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO days(day, views, visitors) VALUES(?, 10, 4)").bind(shiftDay(today, -6)),
      env.DB.prepare("INSERT INTO days(day, views, visitors) VALUES(?, 100, 40)").bind(shiftDay(today, -7)),
      env.DB.prepare("INSERT INTO days(day, views, visitors) VALUES(?, 1000, 400)").bind(shiftDay(today, -29)),
      env.DB.prepare("INSERT INTO days(day, views, visitors) VALUES(?, 10000, 4000)").bind(shiftDay(today, -30)),
    ]);
    const stats = (await (await call(incoming("/stats.json", { headers: auth }))).json()) as Stats;
    expect(stats.today).toEqual({ views: 0, visitors: 0 });
    expect(stats.last7).toEqual({ views: 10, visitors: 4 });
    expect(stats.last30).toEqual({ views: 1110, visitors: 444 });
    expect(stats.series.filter((p) => p.views > 0).map((p) => p.views)).toEqual([1000, 100, 10]);
  });

  it("caps the lists at fifteen rows", async () => {
    for (let i = 0; i < 20; i++) await hit({ p: `/p${i}`, r: "", w: "desktop" });
    const stats = (await (await call(incoming("/stats.json", { headers: auth }))).json()) as Stats;
    expect(stats.pages).toHaveLength(15);
    expect(stats.today.views).toBe(20);
  });

  it("answers 503 when the database fails", async () => {
    const broken = {
      ...env,
      DB: {
        prepare() {
          throw new Error("D1_ERROR: daily quota exceeded");
        },
      } as unknown as D1Database,
    };
    const res = await call(incoming("/stats.json", { headers: auth }), broken);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "stats unavailable" });
  });
});

describe("Cloudflare Access", () => {
  const TEAM = "rabta-test";
  const AUD = "a".repeat(64);
  const CERTS = `https://${TEAM}.cloudflareaccess.com/cdn-cgi/access/certs`;
  let privateKey: CryptoKey;
  let jwks: { keys: Record<string, unknown>[] };
  // Token auth off, Access on: the only way in is the header.
  const accessEnv = { ...env, STATS_TOKEN: undefined, ACCESS_TEAM: TEAM, ACCESS_AUD: AUD } as unknown as Cloudflare.Env;

  beforeAll(async () => {
    const pair = await generateKeyPair("RS256", { extractable: true });
    privateKey = pair.privateKey;
    jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256", use: "sig" }] };
  });

  beforeEach(() => {
    // jose fetches the team's public keys with the global fetch; serve them
    // from here so the test never leaves the sandbox.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input instanceof Request ? input.url : String(input);
        return url === CERTS ? Response.json(jwks) : new Response("not mocked", { status: 500 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function token(overrides: { aud?: string; exp?: number; key?: CryptoKey } = {}): Promise<string> {
    const jwt = new SignJWT({ email: "someone@example.com" })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(`https://${TEAM}.cloudflareaccess.com`)
      .setAudience(overrides.aud ?? AUD)
      .setIssuedAt()
      .setExpirationTime(overrides.exp ?? "5m");
    return jwt.sign(overrides.key ?? privateKey);
  }

  async function withJwt(jwt: string, e: Cloudflare.Env = accessEnv): Promise<Response> {
    return call(incoming("/stats.json", { headers: { "cf-access-jwt-assertion": jwt } }), e);
  }

  it("accepts a JWT signed by the team for this application", async () => {
    const res = await withJwt(await token());
    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(CERTS, expect.anything());
  });

  it("rejects a JWT for another application", async () => {
    expect((await withJwt(await token({ aud: "b".repeat(64) }))).status).toBe(401);
  });

  it("rejects an expired JWT", async () => {
    expect((await withJwt(await token({ exp: Math.floor(Date.now() / 1000) - 120 }))).status).toBe(401);
  });

  it("rejects a JWT signed with someone else's key", async () => {
    const other = await generateKeyPair("RS256", { extractable: true });
    expect((await withJwt(await token({ key: other.privateKey }))).status).toBe(401);
  });

  it("rejects garbage in the header", async () => {
    expect((await withJwt("not.a.jwt")).status).toBe(401);
  });

  it("ignores the header entirely while Access is not configured", async () => {
    const res = await withJwt(await token(), { ...env, STATS_TOKEN: undefined } as unknown as Cloudflare.Env);
    expect(res.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("still lets the bearer token in when both are configured", async () => {
    const both = { ...accessEnv, STATS_TOKEN: TOKEN } as unknown as Cloudflare.Env;
    expect((await call(incoming("/stats.json", { headers: auth }), both)).status).toBe(200);
  });
});

describe("scheduled purge", () => {
  it("drops yesterday's hashes and salt and keeps today's and the aggregates", async () => {
    const yesterday = shiftDay(today, -1);
    const older = shiftDay(today, -9);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO uniques(day, hash) VALUES(?, 'a1'), (?, 'b2'), (?, 'c3')").bind(older, yesterday, today),
      env.DB.prepare("INSERT INTO salts(day, salt) VALUES(?, 's1'), (?, 's2'), (?, 's3')").bind(older, yesterday, today),
      env.DB.prepare("INSERT INTO days(day, views, visitors) VALUES(?, 5, 2), (?, 7, 3)").bind(yesterday, today),
    ]);
    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController({ cron: "5 0 * * *" }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(await rows("SELECT day, hash FROM uniques")).toEqual([{ day: today, hash: "c3" }]);
    expect(await rows("SELECT day, salt FROM salts")).toEqual([{ day: today, salt: "s3" }]);
    expect(await count("days")).toBe(2);
  });
});
