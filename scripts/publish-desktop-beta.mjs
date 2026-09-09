#!/usr/bin/env node
/** Publish a validated desktop beta. Run only from the authorized release workflow.
 *
 * node scripts/publish-desktop-beta.mjs <artifact-directory>
 * GH_TOKEN requires contents:write; GITHUB_SHA identifies the exact build commit.
 * A failed upload leaves a recoverable draft. This script never replaces assets,
 * changes a public release, promotes a beta to latest, or follows redirects.
 */
import { createHash } from "node:crypto";
import { openAsBlob } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPOSITORY = "salmuflahi/rabta";
const BETA = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-beta\.(0|[1-9]\d*)$/;
const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const MAX_BINARY_BYTES = 512 * 1024 * 1024;
const MAX_TEXT_BYTES = 64 * 1024;

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

async function boundedFile(path, maxBytes) {
  const stat = await lstat(path);
  ensure(stat.isFile() && stat.size > 0 && stat.size <= maxBytes,
    "Release inputs must be nonempty regular files within the size limit.");
  // File-backed Blobs also detect a file changing while it is being consumed.
  return openAsBlob(path);
}

async function hashBlob(blob) {
  const hash = createHash("sha256");
  for await (const chunk of blob.stream()) hash.update(chunk);
  return hash.digest("hex");
}

export function parseChecksums(text, expectedNames) {
  const checksums = new Map();
  for (const line of text.trimEnd().split(/\r?\n/)) {
    const match = /^([a-f0-9]{64}) [ *]([^\r\n]+)$/.exec(line);
    ensure(match && expectedNames.includes(match[2]) && !checksums.has(match[2]),
      "SHA256SUMS contains an invalid, duplicate, or unexpected entry.");
    checksums.set(match[2], match[1]);
  }
  ensure(checksums.size === expectedNames.length, "SHA256SUMS is missing a required asset.");
  return checksums;
}

export async function loadReleaseInputs({ artifactDir, root = ROOT, env = process.env }) {
  ensure(typeof artifactDir === "string" && artifactDir.length > 0, "An artifact directory is required.");
  ensure(env.GITHUB_REPOSITORY === REPOSITORY, "GITHUB_REPOSITORY must be salmuflahi/rabta.");
  ensure(typeof env.GITHUB_SHA === "string" && SHA.test(env.GITHUB_SHA),
    "GITHUB_SHA must be the exact lowercase 40-character build commit.");
  const manifest = JSON.parse(await (await boundedFile(resolve(root, "releases/desktop-beta.json"), MAX_TEXT_BYTES)).text());
  ensure(manifest && typeof manifest.version === "string" && BETA.test(manifest.version),
    "Only explicit beta versions can be published by this script.");
  const { version, tag, notes } = manifest;
  ensure(tag === `v${version}` && notes === `docs/releases/v${version}.md`,
    "The beta tag and release-notes path must match the version.");
  const releaseNotes = await (await boundedFile(resolve(root, notes), MAX_TEXT_BYTES)).text();
  ensure(releaseNotes.trim().length > 0, "Release notes cannot be empty.");
  ensure(!releaseNotes.includes("<!-- rabta-desktop-beta:"), "Release notes cannot contain reserved provenance markers.");
  const names = [`Rabta_${version}_aarch64.dmg`, `Rabta_${version}_aarch64.zip`, "BUILD.json", "SHA256SUMS"];
  const actualNames = await readdir(artifactDir);
  ensure(actualNames.length === names.length && actualNames.every(name => names.includes(name)),
    "Artifact directory must contain exactly the expected DMG, ZIP, BUILD.json and SHA256SUMS.");
  const assets = [];
  for (const name of names) {
    const data = await boundedFile(resolve(artifactDir, name), name.endsWith(".dmg") || name.endsWith(".zip") ? MAX_BINARY_BYTES : MAX_TEXT_BYTES);
    assets.push({ name, data, size: data.size, sha256: await hashBlob(data),
      contentType: name.endsWith(".dmg") ? "application/x-apple-diskimage" : name.endsWith(".zip") ? "application/zip" : name.endsWith(".json") ? "application/json" : "text/plain" });
  }
  const build = JSON.parse(await assets[2].data.text());
  ensure(build && build.commit === env.GITHUB_SHA && build.version === version
    && build.identifier === "com.omnibus.dev.beta" && build.productName === "Rabta Beta"
    && build.signing === "ad-hoc" && build.notarized === false,
  "BUILD.json does not match this commit, version, or beta identity/signing requirements.");
  const checksums = parseChecksums(await assets[3].data.text(), names.slice(0, 3));
  for (const asset of assets.slice(0, 3)) {
    ensure(checksums.get(asset.name) === asset.sha256, `Checksum mismatch for ${asset.name}.`);
  }
  const provenance = { commit: env.GITHUB_SHA, version, assets: Object.fromEntries(assets.map(asset => [asset.name, asset.sha256])) };
  return { repository: REPOSITORY, commit: env.GITHUB_SHA, version, tag, assets,
    body: `${releaseNotes.trim()}\n\n<!-- rabta-desktop-beta: ${JSON.stringify(provenance)} -->` };
}

export class GitHubRequestError extends Error {
  constructor(status) {
    super(`GitHub request failed (HTTP ${status}). The draft, if created, has been preserved.`);
    this.status = status;
  }
}

export function createGitHubClient({ token, fetchImpl = fetch }) {
  ensure(typeof token === "string" && token.length > 0 && !/\s/.test(token), "GH_TOKEN is required.");
  return async function request(url, { method = "GET", json, data, contentType } = {}) {
    const parsed = new URL(url);
    ensure(parsed.protocol === "https:" && ["api.github.com", "uploads.github.com"].includes(parsed.hostname)
      && (!parsed.port || parsed.port === "443") && !parsed.username && !parsed.password && !parsed.hash,
    "Refusing to send GitHub credentials to an untrusted URL.");
    let response;
    try {
      response = await fetchImpl(parsed.href, {
        method, redirect: "error", signal: AbortSignal.timeout(10 * 60 * 1000),
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "rabta-desktop-beta-publisher",
          ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(data !== undefined ? { "Content-Type": contentType, "Content-Length": String(data.size) } : {}) },
        ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
        ...(data !== undefined ? { body: data } : {}),
      });
    } catch {
      // Do not echo a fetch error: it can include headers, server text or URLs.
      throw new Error("GitHub request did not complete. Re-run to inspect and resume the preserved draft.");
    }
    if (!response.ok) throw new GitHubRequestError(response.status);
    try { return await response.json(); }
    catch { throw new Error("GitHub returned an invalid JSON response. The draft has been preserved."); }
  };
}

async function optional(request, url) {
  try { return await request(url); }
  catch (error) { if (error instanceof GitHubRequestError && error.status === 404) return null; throw error; }
}

export async function resolveTagCommit(request, base, tag) {
  const ref = await optional(request, `${base}/git/ref/tags/${encodeURIComponent(tag)}`);
  if (!ref) return null;
  let object = ref.object;
  for (let depth = 0; depth < 8; depth++) {
    ensure(object && SHA.test(object.sha), "GitHub returned an invalid tag object.");
    if (object.type === "commit") return object.sha;
    ensure(object.type === "tag", "The release tag does not identify a commit.");
    object = (await request(`${base}/git/tags/${object.sha}`)).object;
  }
  throw new Error("The release tag contains too many nested annotations.");
}

function verifyRelease(release, input) {
  ensure(release && Number.isSafeInteger(release.id) && release.id > 0
    && release.tag_name === input.tag && release.target_commitish === input.commit
    && release.prerelease === true && typeof release.draft === "boolean" && release.body === input.body,
  "An existing release has different provenance or settings; it will not be changed.");
}

export function verifyAsset(remote, local) {
  ensure(remote && Number.isSafeInteger(remote.id) && remote.id > 0 && remote.name === local.name
    && remote.size === local.size && remote.state === "uploaded", `Release asset verification failed for ${local.name}.`);
  if (remote.digest !== null && remote.digest !== undefined) {
    ensure(typeof remote.digest === "string" && remote.digest === `sha256:${local.sha256}`,
      `Release asset digest mismatch for ${local.name}.`);
  }
}

async function inspectAssets(request, base, release, assets, requireComplete) {
  const remoteAssets = await request(`${base}/releases/${release.id}/assets?per_page=100`);
  ensure(Array.isArray(remoteAssets) && remoteAssets.length <= assets.length,
    "Release contains unexpected assets; no assets will be deleted or replaced.");
  const found = new Set();
  for (const remote of remoteAssets) {
    const local = assets.find(asset => asset.name === remote.name);
    ensure(local && !found.has(remote.name), "Release contains unexpected or duplicate assets.");
    verifyAsset(remote, local);
    found.add(remote.name);
  }
  ensure(!requireComplete || found.size === assets.length, "Release is missing required assets.");
  return found;
}

async function findRelease(request, base, tag) {
  const byTag = await optional(request, `${base}/releases/tags/${encodeURIComponent(tag)}`);
  if (byTag) return byTag;
  // A draft need not have created its Git tag yet. Authenticated listing exposes
  // it even when lookup by tag returns 404, allowing a lost response to resume.
  let match = null;
  for (let page = 1; page <= 10; page++) {
    const releases = await request(`${base}/releases?per_page=100&page=${page}`);
    ensure(Array.isArray(releases), "GitHub returned an invalid releases listing.");
    for (const release of releases) {
      if (release.tag_name !== tag) continue;
      ensure(match === null, "Multiple releases use this beta tag; refusing to choose or modify one.");
      match = release;
    }
    if (releases.length < 100) return match;
  }
  throw new Error("Could not finish checking existing releases; refusing to create a possible duplicate.");
}

export async function publishRelease({ input, request }) {
  ensure(input.repository === REPOSITORY && BETA.test(input.version) && input.tag === `v${input.version}` && SHA.test(input.commit),
    "Invalid beta publication input.");
  // The public seam is injectable for tests, but also validates its asset contract.
  const expected = [`Rabta_${input.version}_aarch64.dmg`, `Rabta_${input.version}_aarch64.zip`, "BUILD.json", "SHA256SUMS"];
  ensure(input.assets?.length === expected.length && input.assets.every((asset, index) => asset.name === expected[index]
    && asset.data instanceof Blob && asset.size === asset.data.size && asset.size > 0 && DIGEST.test(asset.sha256)),
  "Invalid beta assets.");
  const base = `https://api.github.com/repos/${REPOSITORY}`;
  const tagCommit = await resolveTagCommit(request, base, input.tag);
  ensure(tagCommit === null || tagCommit === input.commit, "The release tag already points to a different commit.");
  let release = await findRelease(request, base, input.tag);
  if (release) {
    verifyRelease(release, input);
  } else {
    release = await request(`${base}/releases`, { method: "POST", json: {
      tag_name: input.tag, target_commitish: input.commit, name: `Rabta ${input.version}`,
      body: input.body, draft: true, prerelease: true, make_latest: "false",
    } });
    verifyRelease(release, input);
    ensure(release.draft, "GitHub did not create a draft; refusing further mutations.");
  }
  if (!release.draft) {
    ensure(tagCommit === input.commit, "Published release tag could not be verified.");
    await inspectAssets(request, base, release, input.assets, true);
    return { status: "already-released", url: `https://github.com/${REPOSITORY}/releases/tag/${input.tag}` };
  }
  const found = await inspectAssets(request, base, release, input.assets, false);
  const uploadBase = `https://uploads.github.com/repos/${REPOSITORY}/releases/${release.id}/assets`;
  ensure(release.upload_url === `${uploadBase}{?name,label}` || release.upload_url === uploadBase,
    "GitHub returned an unexpected asset upload URL.");
  for (const asset of input.assets) {
    if (found.has(asset.name)) continue;
    // The workflow serializes this publisher; this extra read catches an externally
    // published draft before any further upload. No public release is edited.
    const current = await request(`${base}/releases/${release.id}`);
    verifyRelease(current, input);
    ensure(current.draft, "The release was published externally; no further assets will be uploaded.");
    const uploaded = await request(`${uploadBase}?name=${encodeURIComponent(asset.name)}`, {
      method: "POST", data: asset.data, contentType: asset.contentType,
    });
    verifyAsset(uploaded, asset);
  }
  release = await request(`${base}/releases/${release.id}`);
  verifyRelease(release, input);
  await inspectAssets(request, base, release, input.assets, true);
  const finalTagCommit = await resolveTagCommit(request, base, input.tag);
  ensure(finalTagCommit === null || finalTagCommit === input.commit, "The release tag changed during preparation.");
  if (!release.draft) {
    ensure(finalTagCommit === input.commit, "Published release tag could not be verified.");
    return { status: "already-released", url: `https://github.com/${REPOSITORY}/releases/tag/${input.tag}` };
  }
  const published = await request(`${base}/releases/${release.id}`, {
    method: "PATCH", json: { draft: false, prerelease: true, make_latest: "false" },
  });
  verifyRelease(published, input);
  ensure(published.draft === false, "GitHub has not published the prepared draft.");
  ensure(await resolveTagCommit(request, base, input.tag) === input.commit, "The published beta tag could not be verified.");
  return { status: "published", url: `https://github.com/${REPOSITORY}/releases/tag/${input.tag}` };
}

export async function publishDesktopBeta({ artifactDir, root = ROOT, env = process.env, fetchImpl = fetch }) {
  const input = await loadReleaseInputs({ artifactDir, root, env });
  const request = createGitHubClient({ token: env.GH_TOKEN, fetchImpl });
  return publishRelease({ input, request });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    ensure(process.argv.length === 3, "Usage: node scripts/publish-desktop-beta.mjs <artifact-directory>");
    const result = await publishDesktopBeta({ artifactDir: process.argv[2] });
    console.log(`${result.status}: ${result.url}`);
  } catch (error) {
    // Input/parser errors can echo untrusted text, so redact the token even here.
    const token = process.env.GH_TOKEN;
    const message = error instanceof Error ? error.message : "Desktop beta publication failed.";
    console.error(token ? message.split(token).join("[redacted]") : message);
    process.exitCode = 1;
  }
}
