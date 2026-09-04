// The hit path. One page view comes in as a sendBeacon POST; what leaves for
// the database is five aggregate increments and one salted, truncated hash
// that stops being meaningful the next morning. Nothing here is ever logged.

import { utcDay } from "./day";

const PATH = /^\/[a-z0-9/-]{0,63}$/;
const COUNTRY = /^[A-Z0-9]{2}$/;
const DEVICES = new Set(["phone", "tablet", "desktop"]);
const MAX_BODY = 4096;
const MAX_HOST = 80;

/** A page path, or `/other` for anything that is not a plain site path. */
export function sanitisePath(p: unknown): string {
  return typeof p === "string" && PATH.test(p) ? p : "/other";
}

/** Anything but whitespace and control characters. */
function printable(c: string): boolean {
  const code = c.charCodeAt(0);
  return code > 32 && code !== 127 && !/\s/.test(c);
}

/**
 * A referrer host. Full URLs are reduced to their hostname so a referrer can
 * never carry a query string or a token into the database; empty means the
 * visitor typed the address or came from somewhere that hides itself.
 */
export function sanitiseReferrer(r: unknown): string {
  if (typeof r !== "string") return "(direct)";
  let host = r.trim().toLowerCase();
  if (host.includes("://")) {
    try {
      host = new URL(host).hostname;
    } catch {
      host = "";
    }
  }
  host = Array.from(host).filter(printable).join("").slice(0, MAX_HOST);
  return host === "" ? "(direct)" : host;
}

/** One of the three device classes the page reports, or `unknown`. */
export function sanitiseDevice(w: unknown): string {
  return typeof w === "string" && DEVICES.has(w) ? w : "unknown";
}

/** Cloudflare's two-letter country code for the request, or `ZZ`. */
export function sanitiseCountry(cc: unknown): string {
  return typeof cc === "string" && COUNTRY.test(cc) ? cc : "ZZ";
}

interface Beacon {
  p?: unknown;
  r?: unknown;
  w?: unknown;
}

/** The body as text, or null when it is missing or longer than `limit` bytes. */
async function readUpTo(body: ReadableStream | null, limit: number): Promise<string | null> {
  if (!body) return null;
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = value as Uint8Array;
    size += chunk.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * The beacon body as an object, or null when it is not one. A real beacon is
 * a few dozen bytes; anything past the cap is not read to the end.
 */
async function readBeacon(request: Request): Promise<Beacon | null> {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return null;
  const text = await readUpTo(request.body, MAX_BODY);
  if (text === null) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Beacon)
      : null;
  } catch {
    return null;
  }
}

function hex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Today's salt, created on first use. INSERT OR IGNORE then SELECT means two
 * concurrent first hits of the day agree on one salt instead of racing.
 */
async function dailySalt(db: D1Database, day: string): Promise<string> {
  const fresh = hex(crypto.getRandomValues(new Uint8Array(32)));
  const [, row] = await db.batch<{ salt: string }>([
    db.prepare("INSERT OR IGNORE INTO salts(day, salt) VALUES(?, ?)").bind(day, fresh),
    db.prepare("SELECT salt FROM salts WHERE day = ?").bind(day),
  ]);
  const salt = row?.results[0]?.salt;
  if (!salt) throw new Error("no salt for today");
  return salt;
}

/**
 * The per-day visitor key: sha256(salt:ip:ua), first 32 hex characters. The
 * raw address and user agent exist only inside this function's arguments.
 */
async function visitorHash(salt: string, ip: string, ua: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${ip}:${ua}`));
  return hex(digest).slice(0, 32);
}

export interface Hit {
  path: string;
  host: string;
  device: string;
  cc: string;
}

/** Records one page view: the unique check, then five upserts in one batch. */
async function record(db: D1Database, hit: Hit, ip: string, ua: string): Promise<void> {
  const day = utcDay();
  const hash = await visitorHash(await dailySalt(db, day), ip, ua);
  const seen = await db.prepare("INSERT OR IGNORE INTO uniques(day, hash) VALUES(?, ?)").bind(day, hash).run();
  const first = seen.meta.changes === 1 ? 1 : 0;
  await db.batch([
    db
      .prepare(
        "INSERT INTO days(day, views, visitors) VALUES(?1, 1, ?2) " +
          "ON CONFLICT(day) DO UPDATE SET views = views + 1, visitors = visitors + ?2",
      )
      .bind(day, first),
    db
      .prepare("INSERT INTO hits(day, path, n) VALUES(?, ?, 1) ON CONFLICT(day, path) DO UPDATE SET n = n + 1")
      .bind(day, hit.path),
    db
      .prepare("INSERT INTO refs(day, host, n) VALUES(?, ?, 1) ON CONFLICT(day, host) DO UPDATE SET n = n + 1")
      .bind(day, hit.host),
    db
      .prepare("INSERT INTO geo(day, cc, n) VALUES(?, ?, 1) ON CONFLICT(day, cc) DO UPDATE SET n = n + 1")
      .bind(day, hit.cc),
    db
      .prepare("INSERT INTO devices(day, class, n) VALUES(?, ?, 1) ON CONFLICT(day, class) DO UPDATE SET n = n + 1")
      .bind(day, hit.device),
  ]);
}

/**
 * POST /hit. Always answers 204: the beacon is fire-and-forget, so there is
 * nobody to tell about a problem and nothing a visitor should ever notice.
 */
export async function handleHit(
  request: Request<unknown, IncomingRequestCfProperties>,
  env: Cloudflare.Env,
): Promise<Response> {
  const done = () =>
    new Response(null, {
      status: 204,
      headers: { "access-control-allow-origin": env.ALLOWED_ORIGIN, "cache-control": "no-store" },
    });

  // A visitor who asked not to be tracked is not counted, not even in the
  // aggregate. Checked before the body is read so nothing of theirs is parsed.
  if (request.headers.get("sec-gpc") === "1" || request.headers.get("dnt") === "1") return done();

  try {
    const beacon = await readBeacon(request);
    if (beacon === null) return done();
    const hit: Hit = {
      path: sanitisePath(beacon.p),
      host: sanitiseReferrer(beacon.r),
      device: sanitiseDevice(beacon.w),
      cc: sanitiseCountry(request.cf?.country),
    };
    await record(
      env.DB,
      hit,
      request.headers.get("cf-connecting-ip") ?? "",
      request.headers.get("user-agent") ?? "",
    );
  } catch {
    // D1 unreachable, the free tier's daily quota spent, a malformed row:
    // the page view goes uncounted and the visitor never learns of it.
  }
  return done();
}
