#!/usr/bin/env node
/**
 * Publish the Chrome extension to the Web Store via the v2 API.
 *
 *   ./scripts/publish-chrome.mjs            # upload only — leaves a draft
 *   ./scripts/publish-chrome.mjs --publish  # upload, then submit for review
 *
 * Uploading is safe: it replaces the draft package on the item and changes
 * nothing anyone can install. Submitting is the outward-facing half, so it
 * needs the flag — a bare run can't put a build in front of users by accident.
 *
 * Auth is a Google Cloud service account, not an OAuth refresh token: there is
 * no consent flow to redo, nothing expires, and the credential is a file that
 * never has to be pasted anywhere. Setup is in docs/RELEASE.md §2.
 *
 *   CWS_SERVICE_ACCOUNT_KEY  path to the service account's JSON key
 *   CWS_PUBLISHER_ID         publisher GUID (the first id in the dashboard URL)
 *   CWS_ITEM_ID              extension id (defaults to the published item)
 *
 * v1 of this API is retired on 2026-10-15; this speaks v2.
 */
import { createSign } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/* Overridable so the whole flow can be exercised against a local stub. Nothing
   here is testable against the real Store — an upload is not a thing you can
   do twice to see what happens — so the seam is how this stays honest. */
const API = process.env.CWS_API_BASE ?? "https://chromewebstore.googleapis.com";
const SCOPE = "https://www.googleapis.com/auth/chromewebstore";
const DEFAULT_ITEM = "aaombpafbhjkoinppogieaclijddlebo";

const publish = process.argv.includes("--publish");

function need(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (!v) {
    console.error(`!! ${name} is not set. See docs/RELEASE.md §2 for the one-time setup.`);
    process.exit(1);
  }
  return v;
}

const b64url = (buf) => Buffer.from(buf).toString("base64url");

/**
 * Sign a JWT with the service account key and trade it for an access token.
 * This is the documented server-to-server flow — no browser, no refresh token.
 */
async function accessToken(key) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: key.client_email,
    scope: SCOPE,
    aud: key.token_uri,
    iat: now,
    exp: now + 3600,
  };
  const body = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify(claims))}`;
  const sig = createSign("RSA-SHA256").update(body).sign(key.private_key);
  const assertion = `${body}.${b64url(sig)}`;

  const res = await fetch(key.token_uri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Google's own message is far more useful than anything paraphrased here
    // — most failures are "service account not added to the publisher yet".
    throw new Error(`token exchange failed (${res.status}): ${JSON.stringify(json)}`);
  }
  return json.access_token;
}

async function api(token, url, { method = "POST", headers = {}, body } = {}) {
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token}`, ...headers },
    body,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) throw new Error(`${method} ${url}\n  ${res.status}: ${text}`);
  return json;
}

const key = JSON.parse(readFileSync(need("CWS_SERVICE_ACCOUNT_KEY"), "utf8"));
const publisher = need("CWS_PUBLISHER_ID");
const item = need("CWS_ITEM_ID", DEFAULT_ITEM);
const name = `publishers/${publisher}/items/${item}`;

/* Build through package-chrome.sh rather than assembling a zip here, so what
   gets uploaded is byte-for-byte what ./scripts/package.sh produces and what
   anyone testing "load unpacked" would have extracted. */
const zipPath = execFileSync(`${ROOT}/scripts/package-chrome.sh`, { encoding: "utf8" }).trim();
const zip = readFileSync(zipPath);
const version = JSON.parse(
  readFileSync(`${ROOT}/connectors/chrome/manifest.json`, "utf8"),
).version;

console.log(`==> ${zipPath}`);
console.log(`    ${item} → ${version}`);

const token = await accessToken(key);

console.log("==> uploading");
let up = await api(token, `${API}/upload/v2/${name}:upload`, {
  headers: { "content-type": "application/zip" },
  body: zip,
});

/* The Store accepts the bytes before it has finished unpacking them, so an
   immediate "ok" is not yet a verdict — poll until it commits to one. */
for (let i = 0; up.uploadState === "UPLOAD_IN_PROGRESS" && i < 30; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  up = await api(token, `${API}/v2/${name}:fetchStatus`, { method: "GET" });
}
if (up.uploadState && up.uploadState !== "SUCCESS") {
  console.error(`!! upload ended in ${up.uploadState}: ${JSON.stringify(up)}`);
  process.exit(1);
}
console.log(`    uploaded${up.crxVersion ? ` ${up.crxVersion}` : ""}`);

if (!publish) {
  console.log("==> draft only. Re-run with --publish to submit for review.");
  process.exit(0);
}

console.log("==> submitting for review");
const out = await api(token, `${API}/v2/${name}:publish`, {
  headers: { "content-type": "application/json" },
  // blockOnWarnings: a warning on a release nobody is watching should stop the
  // submission, not sail through and surface days later as a rejection.
  body: JSON.stringify({ deployInfos: [{ deployPercentage: 100 }], blockOnWarnings: true }),
});
console.log(`    ${out.state ?? JSON.stringify(out)}`);
for (const w of out.warningInfo?.warnings ?? []) console.log(`    warning: ${JSON.stringify(w)}`);
console.log("==> done. Review usually takes a few days.");
