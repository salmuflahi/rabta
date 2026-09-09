import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createGitHubClient, loadReleaseInputs, publishDesktopBeta } from "../../scripts/publish-desktop-beta.mjs";

const COMMIT = "a".repeat(40);
const OTHER_COMMIT = "b".repeat(40);
const VERSION = "0.2.0-beta.1";
const TAG = `v${VERSION}`;
const TOKEN = "fixture-token-not-a-real-credential";
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "rabta-beta-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const artifactDir = join(root, "artifacts");
  await Promise.all([mkdir(artifactDir), mkdir(join(root, "releases")), mkdir(join(root, "docs/releases"), { recursive: true })]);
  const manifest = { version: VERSION, tag: TAG, notes: `docs/releases/${TAG}.md` };
  await writeFile(join(root, "releases/desktop-beta.json"), JSON.stringify(manifest));
  await writeFile(join(root, manifest.notes), "Rabta beta: ad hoc signed and not notarized.\n");
  const build = { commit: COMMIT, version: VERSION, identifier: "com.omnibus.dev.beta", productName: "Rabta Beta", signing: "ad-hoc", notarized: false };
  const files = new Map([
    [`Rabta_${VERSION}_aarch64.dmg`, Buffer.from([0x55, 0x44, 0x49, 0x46, 0x00, 0xff, 0x81])],
    [`Rabta_${VERSION}_aarch64.zip`, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0x82])],
    ["BUILD.json", Buffer.from(JSON.stringify(build))],
  ]);
  const rewrite = async () => {
    for (const [name, bytes] of files) await writeFile(join(artifactDir, name), bytes);
    await writeFile(join(artifactDir, "SHA256SUMS"), [...files].map(([name, bytes]) => `${digest(bytes)}  ${name}\n`).join(""));
  };
  await rewrite();
  const env = { GITHUB_REPOSITORY: "salmuflahi/rabta", GITHUB_SHA: COMMIT, GH_TOKEN: TOKEN };
  return { root, artifactDir, env, files, build, manifest, rewrite };
}

/** A REST protocol stub: the production URL and auth policy remain enabled. */
function githubStub(input, options = {}) {
  const state = { release: null, assets: [], tagCommit: options.tagCommit ?? null, calls: [], uploads: [], publishCount: 0, failUploadNumber: null, ...options };
  const response = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const releaseShape = json => ({ id: 42, ...json, upload_url: "https://uploads.github.com/repos/salmuflahi/rabta/releases/42/assets{?name,label}" });
  state.makeRelease = (overrides = {}) => releaseShape({ tag_name: TAG, target_commitish: COMMIT, body: input.body, draft: true, prerelease: true, ...overrides });
  state.makeAsset = (asset, index) => ({ id: index + 100, name: asset.name, size: asset.size, state: "uploaded", digest: `sha256:${asset.sha256}` });
  state.fetchImpl = async (url, init) => {
    const parsed = new URL(url);
    assert.equal(init.redirect, "error");
    assert.equal(init.headers.Authorization, `Bearer ${TOKEN}`);
    const method = init.method;
    const path = parsed.pathname;
    const json = typeof init.body === "string" ? JSON.parse(init.body) : null;
    state.calls.push({ method, path, json });
    if (path === `/repos/salmuflahi/rabta/git/ref/tags/${TAG}`) {
      return state.tagCommit ? response(200, { object: { type: state.annotated ? "tag" : "commit", sha: state.annotated ? "c".repeat(40) : state.tagCommit } }) : response(404, {});
    }
    if (path === `/repos/salmuflahi/rabta/git/tags/${"c".repeat(40)}`) return response(200, { object: { type: "commit", sha: state.tagCommit } });
    if (path === `/repos/salmuflahi/rabta/releases/tags/${TAG}`) return state.release && !state.tagLookupMissing ? response(200, state.release) : response(404, {});
    if (path === "/repos/salmuflahi/rabta/releases" && method === "GET") return response(200, state.release ? [state.release] : []);
    if (path === "/repos/salmuflahi/rabta/releases" && method === "POST") {
      assert.equal(state.release, null);
      assert.equal(json.draft, true);
      assert.equal(json.prerelease, true);
      assert.equal(json.make_latest, "false");
      assert.equal(json.target_commitish, COMMIT);
      state.release = releaseShape(json);
      return response(201, state.release);
    }
    if (path === "/repos/salmuflahi/rabta/releases/42/assets" && method === "GET") {
      return response(200, state.omitLastAsset && state.assets.length === 4 ? state.assets.slice(0, -1) : state.assets);
    }
    if (path === "/repos/salmuflahi/rabta/releases/42/assets" && method === "POST") {
      assert.equal(parsed.hostname, "uploads.github.com");
      assert.equal(state.release.draft, true);
      const name = parsed.searchParams.get("name");
      assert.equal(state.assets.some(asset => asset.name === name), false, "must never overwrite an existing asset");
      const bytes = Buffer.from(await init.body.arrayBuffer());
      assert.equal(Number(init.headers["Content-Length"]), bytes.length);
      state.uploads.push(name);
      if (state.uploads.length === state.failUploadNumber) return response(503, { message: "temporary upload failure" });
      const local = input.assets.find(asset => asset.name === name);
      assert.ok(local);
      assert.equal(digest(bytes), local.sha256, "uploaded bytes must equal validated bytes");
      const asset = state.makeAsset(local, state.assets.length);
      state.assets.push(asset);
      return response(201, state.badUploadDigest ? { ...asset, digest: `sha256:${"0".repeat(64)}` } : asset);
    }
    if (path === "/repos/salmuflahi/rabta/releases/42" && method === "GET") return response(200, state.release);
    if (path === "/repos/salmuflahi/rabta/releases/42" && method === "PATCH") {
      assert.equal(state.release.draft, true, "public releases must never be edited");
      assert.equal(state.assets.length, 4, "must not publish before every upload completes");
      assert.deepEqual(json, { draft: false, prerelease: true, make_latest: "false" });
      state.publishCount++;
      state.release = { ...state.release, ...json };
      state.tagCommit = COMMIT;
      return response(200, state.release);
    }
    assert.fail(`Unexpected protocol call: ${method} ${path}`);
  };
  return state;
}

async function setup(t, options) {
  const files = await fixture(t);
  const input = await loadReleaseInputs(files);
  const stub = githubStub(input, options);
  return { ...files, input, stub, run: () => publishDesktopBeta({ ...files, fetchImpl: stub.fetchImpl }) };
}

test("publishes the exact four validated files only after draft verification", async t => {
  const f = await setup(t);
  const result = await f.run();
  assert.equal(result.status, "published");
  assert.equal(result.url, `https://github.com/salmuflahi/rabta/releases/tag/${TAG}`);
  assert.equal(f.stub.publishCount, 1);
  assert.deepEqual(f.stub.uploads, f.input.assets.map(asset => asset.name));
  assert.equal(f.stub.release.draft, false);
  assert.equal(f.stub.release.prerelease, true);
  assert.equal(f.stub.release.make_latest, "false");
});

test("an interrupted upload leaves a draft; retry resumes without replacing a completed asset", async t => {
  const f = await setup(t, { failUploadNumber: 2 });
  await assert.rejects(f.run(), /HTTP 503/);
  assert.equal(f.stub.publishCount, 0);
  assert.equal(f.stub.release.draft, true);
  assert.equal(f.stub.assets.length, 1);
  f.stub.failUploadNumber = null;
  assert.equal((await f.run()).status, "published");
  assert.equal(f.stub.uploads.filter(name => name.endsWith(".dmg")).length, 1);
  assert.equal(f.stub.publishCount, 1);
});

test("a draft missing from tag lookup resumes through the authenticated releases listing", async t => {
  const f = await setup(t, { tagLookupMissing: true });
  f.stub.release = f.stub.makeRelease();
  f.stub.assets = [f.stub.makeAsset(f.input.assets[0], 0)];
  assert.equal((await f.run()).status, "published");
  assert.equal(f.stub.uploads.length, 3);
  assert.equal(f.stub.calls.some(call => call.method === "POST" && call.path.endsWith("/releases")), false);
  assert.equal(f.stub.publishCount, 1);
});

test("an identical published beta is verified without any write", async t => {
  const f = await setup(t);
  await f.run();
  f.stub.calls = [];
  assert.equal((await f.run()).status, "already-released");
  assert.ok(f.stub.calls.length > 0);
  assert.ok(f.stub.calls.every(call => call.method === "GET"));
  assert.equal(f.stub.publishCount, 1);
});

test("a public release with missing assets is never repaired or changed", async t => {
  const f = await setup(t, { tagCommit: COMMIT });
  f.stub.release = f.stub.makeRelease({ draft: false });
  await assert.rejects(f.run(), /missing required assets/);
  assert.ok(f.stub.calls.every(call => call.method === "GET"));
});

test("wrong lightweight or annotated tag commit stops before release creation", async t => {
  for (const annotated of [false, true]) {
    const f = await setup(t, { tagCommit: OTHER_COMMIT, annotated });
    await assert.rejects(f.run(), /different commit/);
    assert.equal(f.stub.release, null);
    assert.ok(f.stub.calls.every(call => call.method === "GET"));
  }
});

test("matching annotated tag can publish", async t => {
  const f = await setup(t, { tagCommit: COMMIT, annotated: true });
  assert.equal((await f.run()).status, "published");
});

test("a mismatched existing draft is not modified", async t => {
  const f = await setup(t);
  f.stub.release = f.stub.makeRelease({ target_commitish: OTHER_COMMIT });
  await assert.rejects(f.run(), /different provenance/);
  assert.ok(f.stub.calls.every(call => call.method === "GET"));
});

test("wrong existing asset size, digest, state or name stops without deletion or upload", async t => {
  for (const mismatch of [{ size: 9000 }, { digest: `sha256:${"f".repeat(64)}` }, { state: "starter" }, { name: "unexpected.zip" }]) {
    const f = await setup(t);
    f.stub.release = f.stub.makeRelease();
    f.stub.assets = [{ ...f.stub.makeAsset(f.input.assets[0], 0), ...mismatch }];
    await assert.rejects(f.run(), /asset|digest/);
    assert.equal(f.stub.publishCount, 0);
    assert.ok(f.stub.calls.every(call => call.method === "GET"));
  }
});

test("an unavailable remote digest still requires exact size and uploaded state", async t => {
  const f = await setup(t);
  f.stub.release = f.stub.makeRelease();
  f.stub.assets = [{ ...f.stub.makeAsset(f.input.assets[0], 0), digest: null }];
  assert.equal((await f.run()).status, "published");
  assert.equal(f.stub.uploads.length, 3);
});

test("a wrong upload digest or incomplete final listing cannot be published", async t => {
  for (const options of [{ badUploadDigest: true }, { omitLastAsset: true }]) {
    const f = await setup(t, options);
    await assert.rejects(f.run(), /digest mismatch|missing required assets/);
    assert.equal(f.stub.publishCount, 0);
    assert.equal(f.stub.release.draft, true);
  }
});

test("checksum mismatch is rejected before any GitHub request", async t => {
  const f = await fixture(t);
  await writeFile(join(f.artifactDir, `Rabta_${VERSION}_aarch64.dmg`), "tampered");
  let calls = 0;
  await assert.rejects(publishDesktopBeta({ ...f, fetchImpl: () => { calls++; } }), /Checksum mismatch/);
  assert.equal(calls, 0);
});

test("wrong build identity, commit, signing or version is rejected", async t => {
  for (const mismatch of [{ commit: OTHER_COMMIT }, { version: "0.1.0" }, { identifier: "com.omnibus.dev" }, { productName: "Rabta" }, { signing: "developer-id" }, { notarized: true }]) {
    const f = await fixture(t);
    f.files.set("BUILD.json", Buffer.from(JSON.stringify({ ...f.build, ...mismatch })));
    await f.rewrite();
    await assert.rejects(loadReleaseInputs(f), /BUILD.json does not match/);
  }
});

test("stable versions, mismatched tag, traversed notes and wrong repository are rejected", async t => {
  for (const mismatch of [{ version: "0.2.0" }, { tag: "v0.1.0" }, { notes: "../notes.md" }]) {
    const f = await fixture(t);
    await writeFile(join(f.root, "releases/desktop-beta.json"), JSON.stringify({ ...f.manifest, ...mismatch }));
    await assert.rejects(loadReleaseInputs(f), /beta versions|tag and release-notes/);
  }
  const f = await fixture(t);
  await assert.rejects(loadReleaseInputs({ ...f, env: { ...f.env, GITHUB_REPOSITORY: "other/repo" } }), /GITHUB_REPOSITORY/);
  await assert.rejects(loadReleaseInputs({ ...f, env: { ...f.env, GITHUB_SHA: "main" } }), /GITHUB_SHA/);
});

test("extra, missing, empty or symlinked artifacts are rejected", async t => {
  const extra = await fixture(t);
  await writeFile(join(extra.artifactDir, "unexpected.txt"), "x");
  await assert.rejects(loadReleaseInputs(extra), /exactly/);
  const missing = await fixture(t);
  await rm(join(missing.artifactDir, "BUILD.json"));
  await assert.rejects(loadReleaseInputs(missing), /exactly/);
  const empty = await fixture(t);
  await writeFile(join(empty.artifactDir, `Rabta_${VERSION}_aarch64.dmg`), "");
  await assert.rejects(loadReleaseInputs(empty), /nonempty regular files/);
  const link = await fixture(t);
  await rm(join(link.artifactDir, `Rabta_${VERSION}_aarch64.dmg`));
  await symlink(join(link.artifactDir, `Rabta_${VERSION}_aarch64.zip`), join(link.artifactDir, `Rabta_${VERSION}_aarch64.dmg`));
  await assert.rejects(loadReleaseInputs(link), /nonempty regular files/);
});

test("duplicate or incomplete checksum entries are rejected", async t => {
  for (const duplicate of [true, false]) {
    const f = await fixture(t);
    const checksumPath = join(f.artifactDir, "SHA256SUMS");
    const entries = (await readFile(checksumPath, "utf8")).trim().split("\n");
    await writeFile(checksumPath, duplicate ? `${entries.join("\n")}\n${entries[0]}\n` : `${entries[0]}\n`);
    await assert.rejects(loadReleaseInputs(f), /duplicate|missing/);
  }
});

test("credentials are restricted to HTTPS GitHub hosts and redirect following is disabled", async () => {
  let calls = 0;
  const request = createGitHubClient({ token: TOKEN, fetchImpl: async (_url, init) => {
    calls++;
    assert.equal(init.redirect, "error");
    return new Response("redirect", { status: 302, headers: { Location: "https://untrusted.example" } });
  } });
  for (const url of ["http://api.github.com/x", "https://api.github.com.evil.test/x", "https://api.github.com:444/x", "https://user@api.github.com/x", "https://uploads.github.com/x#fragment"]) {
    await assert.rejects(request(url), /untrusted URL/);
  }
  assert.equal(calls, 0);
  await assert.rejects(request("https://api.github.com/x"), /HTTP 302/);
  assert.equal(calls, 1);
});

test("network failure details cannot leak the token", async () => {
  const request = createGitHubClient({ token: TOKEN, fetchImpl: async () => { throw new Error(`Authorization: Bearer ${TOKEN}`); } });
  await assert.rejects(request("https://api.github.com/x"), error => {
    assert.equal(error.message.includes(TOKEN), false);
    assert.match(error.message, /did not complete/);
    return true;
  });
});
