// Who may read the numbers. Two doors, either one opens: a bearer token for
// scripts and curl, or the JWT Cloudflare Access attaches once the dashboard
// sits behind a Zero Trust application. Neither is a session; nothing is
// remembered between requests except the Access team's public keys.

import { createRemoteJWKSet, jwtVerify } from "jose";

type RemoteJWKSet = ReturnType<typeof createRemoteJWKSet>;

// One JWKS fetcher per team domain, kept for the life of the isolate so the
// public keys are fetched once and refreshed by jose when a key rotates.
const jwksByTeam = new Map<string, RemoteJWKSet>();

function jwksFor(team: string): RemoteJWKSet {
  let jwks = jwksByTeam.get(team);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${team}.cloudflareaccess.com/cdn-cgi/access/certs`));
    jwksByTeam.set(team, jwks);
  }
  return jwks;
}

/**
 * Constant-time string equality. Both sides are hashed first so the compare
 * always sees two inputs of the same length, whatever the caller sent.
 */
async function sameSecret(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(da, db);
}

/** `Authorization: Bearer <STATS_TOKEN>`. Disabled until the secret exists. */
async function bearerOk(header: string | null, token: string | undefined): Promise<boolean> {
  if (!token || !header) return false;
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] !== undefined && (await sameSecret(match[1], token));
}

/**
 * The `Cf-Access-Jwt-Assertion` header Cloudflare Access adds after a login,
 * verified against the team's published keys. Only in play once both the team
 * domain and the application audience are configured; until then the header
 * is just a header.
 */
async function accessOk(jwt: string | null, env: Cloudflare.Env): Promise<boolean> {
  const team: string = env.ACCESS_TEAM ?? "";
  const aud: string = env.ACCESS_AUD ?? "";
  if (!jwt || !team || !aud) return false;
  try {
    await jwtVerify(jwt, jwksFor(team), {
      audience: aud,
      issuer: `https://${team}.cloudflareaccess.com`,
    });
    return true;
  } catch {
    return false;
  }
}

/** Null when the request may read stats, otherwise the 401 to send back. */
export async function authorize(request: Request, env: Cloudflare.Env): Promise<Response | null> {
  if (await bearerOk(request.headers.get("authorization"), env.STATS_TOKEN)) return null;
  if (await accessOk(request.headers.get("cf-access-jwt-assertion"), env)) return null;
  return Response.json(
    { error: "unauthorized" },
    {
      status: 401,
      headers: { "cache-control": "no-store", "www-authenticate": 'Bearer realm="stats"' },
    },
  );
}
