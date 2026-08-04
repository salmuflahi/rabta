/* What publish-chrome.mjs puts on the wire.
 *
 * None of this can be tried against the real Web Store — an upload is not
 * something you can do twice to see what happens, and a wrong publish call is
 * visible to every user of the extension. So the script talks to a stub that
 * checks each request the way Google would, and the credential is a throwaway
 * keypair generated here rather than anything real.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const SCRIPT = join(ROOT, "scripts", "publish-chrome.mjs");
const PUBLISHER = "pub-guid-1234";
const ITEM = "itemid0123456789abcdefghijklmnop";

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

let server;
let base;
let keyPath;
/** Every request the stub saw, in order. */
let seen;
/** Overridable per-test: what :upload and :fetchStatus answer with. */
let uploadStates;

function body(req) {
  return new Promise((res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => res(Buffer.concat(chunks)));
  });
}

before(async () => {
  server = createServer(async (req, res) => {
    const raw = await body(req);
    seen.push({ url: req.url, method: req.method, headers: req.headers, raw });
    const send = (code, obj) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    if (req.url === "/token") return send(200, { access_token: "stub-token" });
    if (req.url.endsWith(":upload") || req.url.endsWith(":fetchStatus")) {
      const next = uploadStates.shift() ?? "SUCCESS";
      return send(200, { itemId: ITEM, crxVersion: "9.9.9", uploadState: next });
    }
    if (req.url.endsWith(":publish")) return send(200, { itemId: ITEM, state: "IN_REVIEW" });
    return send(404, { error: "unexpected" });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;

  keyPath = join(mkdtempSync(join(tmpdir(), "cws-")), "key.json");
  writeFileSync(
    keyPath,
    JSON.stringify({
      client_email: "robot@example.iam.gserviceaccount.com",
      private_key: privateKey,
      token_uri: `${base}/token`,
    }),
  );
});

after(() => server?.close());

function run(args = [], env = {}) {
  seen = [];
  uploadStates = env.uploadStates ?? [];
  delete env.uploadStates;
  return new Promise((res) => {
    execFile(
      process.execPath,
      [SCRIPT, ...args],
      {
        cwd: ROOT,
        env: {
          ...process.env,
          CWS_API_BASE: base,
          CWS_SERVICE_ACCOUNT_KEY: keyPath,
          CWS_PUBLISHER_ID: PUBLISHER,
          CWS_ITEM_ID: ITEM,
          ...env,
        },
      },
      (err, stdout, stderr) => res({ code: err?.code ?? 0, stdout, stderr }),
    );
  });
}

const find = (suffix) => seen.find((r) => r.url.endsWith(suffix));

describe("publish-chrome.mjs", () => {
  test("proves who it is with a signature the key actually made", async () => {
    await run();
    const token = find("/token");
    assert.ok(token, "no token exchange");

    const form = new URLSearchParams(token.raw.toString());
    assert.equal(form.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");

    const [header, claims, sig] = form.get("assertion").split(".");
    assert.deepEqual(JSON.parse(Buffer.from(header, "base64url").toString()), {
      alg: "RS256",
      typ: "JWT",
    });

    // The signature has to verify against the public half, or Google rejects it
    // — and a JWT that is merely well-shaped would sail through a shallower test.
    const ok = createVerify("RSA-SHA256")
      .update(`${header}.${claims}`)
      .verify(publicKey, Buffer.from(sig, "base64url"));
    assert.ok(ok, "assertion signature does not verify");

    const c = JSON.parse(Buffer.from(claims, "base64url").toString());
    assert.equal(c.iss, "robot@example.iam.gserviceaccount.com");
    assert.equal(c.scope, "https://www.googleapis.com/auth/chromewebstore");
    assert.equal(c.aud, `${base}/token`);
    assert.ok(c.exp > c.iat, "token must expire after it was issued");
  });

  test("uploads the same bytes package.sh would ship", async () => {
    await run();
    const up = find(":upload");
    assert.ok(up, "no upload request");
    assert.equal(up.method, "POST");
    assert.equal(up.url, `/upload/v2/publishers/${PUBLISHER}/items/${ITEM}:upload`);
    assert.equal(up.headers["content-type"], "application/zip");
    assert.equal(up.headers.authorization, "Bearer stub-token");

    const version = JSON.parse(
      readFileSync(join(ROOT, "connectors/chrome/manifest.json"), "utf8"),
    ).version;
    const zip = readFileSync(join(ROOT, `dist-artifacts/rabta-chrome-${version}.zip`));
    assert.deepEqual(up.raw, zip, "uploaded bytes are not the packaged zip");
  });

  test("a bare run leaves a draft and submits nothing", async () => {
    // The whole point of the flag: publishing is the outward-facing half, and
    // it should take saying so.
    const { code, stdout } = await run();
    assert.equal(code, 0);
    assert.equal(find(":publish"), undefined, "published without --publish");
    assert.match(stdout, /draft only/i);
  });

  test("--publish submits for review at full rollout", async () => {
    const { code } = await run(["--publish"]);
    assert.equal(code, 0);
    const pub = find(":publish");
    assert.ok(pub, "no publish request");
    assert.equal(pub.url, `/v2/publishers/${PUBLISHER}/items/${ITEM}:publish`);
    assert.deepEqual(JSON.parse(pub.raw.toString()), {
      deployInfos: [{ deployPercentage: 100 }],
      blockOnWarnings: true,
    });
  });

  test("waits for the Store to finish unpacking before it calls it done", async () => {
    // Accepting the bytes is not a verdict; the state has to settle first.
    const { code } = await run(["--publish"], {
      uploadStates: ["UPLOAD_IN_PROGRESS", "UPLOAD_IN_PROGRESS", "SUCCESS"],
    });
    assert.equal(code, 0);
    assert.equal(seen.filter((r) => r.url.endsWith(":fetchStatus")).length, 2);
    assert.ok(find(":publish"), "should publish once the upload settles");
  });

  test("a rejected upload is never published on top of", async () => {
    const { code } = await run(["--publish"], { uploadStates: ["FAILURE"] });
    assert.notEqual(code, 0, "should exit non-zero");
    assert.equal(find(":publish"), undefined, "published over a failed upload");
  });

  test("refuses to run without a credential rather than half-trying", async () => {
    const { code, stderr } = await run([], { CWS_SERVICE_ACCOUNT_KEY: "" });
    assert.notEqual(code, 0);
    assert.match(stderr, /CWS_SERVICE_ACCOUNT_KEY/);
    assert.equal(seen.length, 0, "should not have called anything");
  });

  test("refuses to run without a publisher", async () => {
    const { code, stderr } = await run([], { CWS_PUBLISHER_ID: "" });
    assert.notEqual(code, 0);
    assert.match(stderr, /CWS_PUBLISHER_ID/);
  });
});
