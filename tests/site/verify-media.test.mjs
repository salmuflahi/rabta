import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ROOT } from "./helpers.mjs";
import {
  MOBILE_SHARE,
  TARGETS,
  checkManifest,
  checkVideo,
} from "../../scripts/verify-media.mjs";

const manifest = JSON.parse(
  await readFile(resolve(ROOT, "website/assets/demos/manifest.json"), "utf8"),
);

/** ffprobe output for an asset that is exactly what the manifest claims. */
function goodProbe(entry) {
  return {
    streams: [
      {
        codec_type: "video",
        codec_name: "h264",
        width: entry.width,
        height: entry.height,
      },
    ],
    format: { duration: String(entry.durationSeconds) },
  };
}

function probesFor(entries) {
  return new Map(entries.map((e) => [e.file, goodProbe(e)]));
}

function sizesFor(entries, posters = manifest.posters ?? []) {
  return new Map([
    ...entries.map((e) => [e.file, e.bytes]),
    ...posters.map((p) => [p.file, p.bytes]),
  ]);
}

test("the committed manifest describes a consistent set of media", () => {
  const videos = manifest.videos;
  const problems = checkManifest(manifest, probesFor(videos), sizesFor(videos));
  assert.deepEqual(problems, []);
});

test("the manifest's own numbers sit inside the approved budgets", () => {
  for (const entry of manifest.videos) {
    const target = TARGETS[entry.demo];
    assert.ok(target, `${entry.demo} has a budget`);
    assert.ok(
      Math.abs(entry.durationSeconds - target.seconds) <= target.tolerance,
      `${entry.file} duration ${entry.durationSeconds}s`,
    );
    if (entry.variant === "desktop") {
      assert.ok(entry.bytes <= target.desktopBytes, `${entry.file} bytes`);
    }
    assert.equal(entry.codec, "h264");
    assert.equal(entry.audioStreams, 0);
  }
});

test("a wrong manifest duration is caught", () => {
  const hero = manifest.videos.find((v) => v.file === "hero-return-desktop.mp4");
  const tampered = { ...hero, durationSeconds: 1 };

  // The file itself is untouched, so only the manifest is lying.
  const problems = checkVideo(tampered, goodProbe(hero), hero.bytes);

  assert.ok(problems.length > 0, "the tampered manifest is rejected");
  assert.ok(
    problems.some((p) => p.includes("hero-return-desktop.mp4") && /duration/.test(p)),
    problems.join(" | "),
  );
});

test("a re-encode that drifts from the manifest is caught", () => {
  const hero = manifest.videos.find((v) => v.file === "hero-return-desktop.mp4");

  const drifted = { ...goodProbe(hero), format: { duration: "6.4" } };
  assert.ok(
    checkVideo(hero, drifted, hero.bytes).some((p) => /duration/.test(p)),
    "a 1.6s drift is rejected",
  );

  const resized = goodProbe(hero);
  resized.streams[0].width = 1280;
  assert.ok(
    checkVideo(hero, resized, hero.bytes).some((p) => /1920x1200/.test(p)),
    "a resize is rejected",
  );
});

test("a stray audio track or wrong codec is caught", () => {
  const entry = manifest.videos[0];

  const withAudio = goodProbe(entry);
  withAudio.streams.push({ codec_type: "audio", codec_name: "aac" });
  assert.ok(
    checkVideo(entry, withAudio, entry.bytes).some((p) => /0 audio streams/.test(p)),
  );

  const wrongCodec = goodProbe(entry);
  wrongCodec.streams[0].codec_name = "hevc";
  assert.ok(
    checkVideo(entry, wrongCodec, entry.bytes).some((p) => /h264/.test(p)),
  );
});

test("a bloated desktop file is caught", () => {
  const hero = manifest.videos.find((v) => v.file === "hero-return-desktop.mp4");
  const fat = { ...hero, bytes: 9_000_000 };
  const problems = checkVideo(fat, goodProbe(hero), 9_000_000);
  assert.ok(problems.some((p) => /budget/.test(p)), problems.join(" | "));
});

test("a mobile variant that is not smaller than its desktop pair is caught", () => {
  const videos = manifest.videos;
  const desktop = videos.find((v) => v.file === "hero-return-desktop.mp4");
  const sizes = sizesFor(videos);
  sizes.set("hero-return-mobile.mp4", Math.round(desktop.bytes * 0.9));

  const problems = checkManifest(manifest, probesFor(videos), sizes);
  assert.ok(
    problems.some((p) => p.includes("hero-return-mobile.mp4") && p.includes("%")),
    problems.join(" | "),
  );
  assert.equal(MOBILE_SHARE, 0.75);
});

test("a missing or empty asset is caught, never skipped", () => {
  const videos = manifest.videos;

  const withoutFile = sizesFor(videos);
  withoutFile.delete("move-leave-mobile.mp4");
  assert.ok(
    checkManifest(manifest, probesFor(videos), withoutFile).some((p) =>
      /move-leave-mobile\.mp4: missing from disk/.test(p),
    ),
  );

  const emptyPoster = sizesFor(videos);
  emptyPoster.set("hero-return.png", 0);
  assert.ok(
    checkManifest(manifest, probesFor(videos), emptyPoster).some((p) =>
      /hero-return\.png: is empty/.test(p),
    ),
  );
});

test("an unprobeable file is a failure, not a pass", () => {
  const entry = manifest.videos[0];
  const problems = checkVideo(entry, undefined, entry.bytes);
  assert.ok(problems.some((p) => /ffprobe returned nothing/.test(p)));
});

test("the homepage plays exactly the sources the manifest describes", async () => {
  const html = await readFile(resolve(ROOT, "website/index.html"), "utf8");
  const referenced = [
    ...html.matchAll(/data-src-(?:desktop|mobile)="\/assets\/demos\/([^"]+)"/g),
  ]
    .map((match) => match[1])
    .sort();

  // A subset, not an equality, since the homepage rebuild. The manifest is the
  // inventory of what was produced and verified; the page plays the one the
  // design's composition has a slot for. What still has to hold is the
  // direction that matters: nothing the page plays may be absent from the
  // manifest, because an unverified source is one nobody has checked the codec,
  // duration or audio track of.
  const described = new Set(manifest.videos.map((v) => v.file));
  for (const file of referenced) {
    assert.ok(described.has(file), `${file} is not described by the manifest`);
  }
  assert.ok(referenced.length > 0, "the homepage plays something");

  const posters = [
    ...html.matchAll(/poster="\/assets\/demos\/([^"]+)"/g),
  ].map((match) => match[1]);
  for (const poster of posters) {
    assert.ok(
      (manifest.posters ?? []).some((p) => p.file === poster),
      `${poster} is described by the manifest`,
    );
  }
});
