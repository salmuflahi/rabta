import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { utcDay } from "../src/day";
import { call, count, hit, incoming, rows, wipe } from "./helpers";

const today = utcDay();
const OTHER_UA = { "user-agent": "Mozilla/5.0 (someone else) Rabta/1.0" };

async function dayRow(): Promise<{ views: number; visitors: number } | undefined> {
  return (await rows<{ views: number; visitors: number }>("SELECT views, visitors FROM days WHERE day = ?", today))[0];
}

async function totals(): Promise<number> {
  let n = 0;
  for (const t of ["days", "hits", "refs", "geo", "devices", "salts", "uniques"] as const) n += await count(t);
  return n;
}

beforeEach(wipe);

describe("POST /hit", () => {
  it("answers 204 with the CORS origin and no-store", async () => {
    const res = await hit({ p: "/", r: "", w: "desktop" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(env.ALLOWED_ORIGIN);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://rabta.build");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toBe("");
  });

  it("counts nothing when Global Privacy Control is on", async () => {
    const res = await hit({ p: "/", r: "", w: "desktop" }, { "sec-gpc": "1" });
    expect(res.status).toBe(204);
    expect(await totals()).toBe(0);
  });

  it("counts nothing when Do Not Track is on", async () => {
    const res = await hit({ p: "/", r: "", w: "desktop" }, { dnt: "1" });
    expect(res.status).toBe(204);
    expect(await totals()).toBe(0);
  });

  it("tolerates a malformed body and records nothing", async () => {
    for (const body of ["{not json", "", "[1,2]", "null", '"str"']) {
      const res = await hit(body);
      expect(res.status).toBe(204);
    }
    expect(await totals()).toBe(0);
  });

  it("counts two views from one visitor as one visitor", async () => {
    await hit({ p: "/", r: "", w: "desktop" });
    await hit({ p: "/why/", r: "", w: "desktop" });
    expect(await dayRow()).toEqual({ views: 2, visitors: 1 });
    expect(await count("uniques")).toBe(1);
    expect(await count("salts")).toBe(1);
  });

  it("counts a different user agent as a second visitor", async () => {
    await hit({ p: "/", r: "", w: "desktop" });
    await hit({ p: "/", r: "", w: "desktop" }, OTHER_UA);
    expect(await dayRow()).toEqual({ views: 2, visitors: 2 });
    expect(await count("uniques")).toBe(2);
  });

  it("counts a different address as a second visitor", async () => {
    await hit({ p: "/", r: "", w: "desktop" });
    await hit({ p: "/", r: "", w: "desktop" }, { "cf-connecting-ip": "198.51.100.9" });
    expect(await dayRow()).toEqual({ views: 2, visitors: 2 });
  });

  it("never stores the address or the user agent, only a salted 32-hex hash", async () => {
    const ip = "203.0.113.7";
    const ua = "Mozilla/5.0 (test) Rabta/1.0";
    await hit({ p: "/", r: "", w: "desktop" }, { "cf-connecting-ip": ip, "user-agent": ua });
    const uniques = await rows<{ day: string; hash: string }>("SELECT day, hash FROM uniques");
    expect(uniques).toHaveLength(1);
    expect(uniques[0]?.hash).toMatch(/^[0-9a-f]{32}$/);
    const salts = await rows<{ salt: string }>("SELECT salt FROM salts");
    expect(salts[0]?.salt).toMatch(/^[0-9a-f]{64}$/);
    for (const table of ["days", "hits", "refs", "geo", "devices", "salts", "uniques"]) {
      const dump = JSON.stringify(await rows(`SELECT * FROM ${table}`));
      expect(dump).not.toContain(ip);
      expect(dump).not.toContain("Mozilla");
    }
  });

  it("keeps plain paths and buckets everything else as /other", async () => {
    const long = "/" + "a".repeat(64);
    await hit({ p: "/why/", r: "", w: "desktop" });
    await hit({ p: "/x?y=1", r: "", w: "desktop" });
    await hit({ p: long, r: "", w: "desktop" });
    await hit({ p: "/Why", r: "", w: "desktop" });
    await hit({ p: 42, r: "", w: "desktop" });
    await hit({ r: "", w: "desktop" });
    const hits = await rows<{ path: string; n: number }>("SELECT path, n FROM hits ORDER BY path");
    expect(hits).toEqual([
      { path: "/other", n: 5 },
      { path: "/why/", n: 1 },
    ]);
    expect(await dayRow()).toEqual({ views: 6, visitors: 1 });
  });

  it("keeps a 63-character path but not a 64-character one", async () => {
    await hit({ p: "/" + "b".repeat(63), r: "", w: "desktop" });
    const hits = await rows<{ path: string }>("SELECT path FROM hits");
    expect(hits).toEqual([{ path: "/" + "b".repeat(63) }]);
  });

  it("lowercases, truncates and reduces referrers to a host", async () => {
    await hit({ p: "/", r: "News.YCombinator.com", w: "desktop" });
    await hit({ p: "/", r: "HTTPS://Example.COM/some/path?token=secret", w: "desktop" });
    await hit({ p: "/", r: "x".repeat(100), w: "desktop" });
    await hit({ p: "/", r: "", w: "desktop" });
    await hit({ p: "/", w: "desktop" });
    await hit({ p: "/", r: "  ", w: "desktop" });
    const refs = await rows<{ host: string; n: number }>("SELECT host, n FROM refs ORDER BY host");
    expect(refs).toEqual([
      { host: "(direct)", n: 3 },
      { host: "example.com", n: 1 },
      { host: "news.ycombinator.com", n: 1 },
      { host: "x".repeat(80), n: 1 },
    ]);
  });

  it("keeps the three device classes and buckets the rest as unknown", async () => {
    for (const w of ["phone", "tablet", "desktop", "tv", "Desktop", 7, undefined]) await hit({ p: "/", r: "", w });
    const devices = await rows<{ class: string; n: number }>("SELECT class, n FROM devices ORDER BY class");
    expect(devices).toEqual([
      { class: "desktop", n: 1 },
      { class: "phone", n: 1 },
      { class: "tablet", n: 1 },
      { class: "unknown", n: 4 },
    ]);
  });

  it("takes the country from Cloudflare, ZZ when there is none", async () => {
    await hit({ p: "/", r: "", w: "desktop" }, {}, { country: "DE" });
    await hit({ p: "/", r: "", w: "desktop" }, {}, { country: "DE" });
    await hit({ p: "/", r: "", w: "desktop" });
    const geo = await rows<{ cc: string; n: number }>("SELECT cc, n FROM geo ORDER BY cc");
    expect(geo).toEqual([
      { cc: "DE", n: 2 },
      { cc: "ZZ", n: 1 },
    ]);
  });

  it("keys everything by today's UTC day", async () => {
    await hit({ p: "/", r: "", w: "desktop" });
    for (const table of ["days", "hits", "refs", "geo", "devices", "salts", "uniques"]) {
      const days = await rows<{ day: string }>(`SELECT DISTINCT day FROM ${table}`);
      expect(days).toEqual([{ day: today }]);
    }
  });

  it("still answers 204 when the database is unavailable", async () => {
    const broken = {
      ...env,
      DB: {
        prepare() {
          throw new Error("D1_ERROR: daily quota exceeded");
        },
      } as unknown as D1Database,
    };
    const res = await call(
      incoming("/hit", { method: "POST", body: JSON.stringify({ p: "/", r: "", w: "desktop" }) }),
      broken,
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(env.ALLOWED_ORIGIN);
  });

  it("ignores a body larger than the beacon could ever be", async () => {
    const res = await hit({ p: "/", r: "", w: "desktop", pad: "z".repeat(5000) });
    expect(res.status).toBe(204);
    expect(await totals()).toBe(0);
  });
});

describe("routing", () => {
  it("answers OPTIONS /hit with a 204 preflight", async () => {
    const res = await call(incoming("/hit", { method: "OPTIONS", headers: { origin: "https://rabta.build" } }));
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(env.ALLOWED_ORIGIN);
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
    expect(res.headers.get("access-control-allow-headers")).toContain("content-type");
  });

  it("answers GET / with an empty 204", async () => {
    const res = await call(incoming("/"));
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });

  it("answers 404 for anything else, including GET /hit", async () => {
    for (const path of ["/hit", "/nope", "/stats/extra", "/hit/"]) {
      expect((await call(incoming(path))).status).toBe(404);
    }
    expect((await call(incoming("/stats", { method: "POST" }))).status).toBe(404);
  });
});
