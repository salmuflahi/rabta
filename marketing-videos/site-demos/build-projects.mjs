#!/usr/bin/env node
/**
 * The site's product loops, as HyperFrames projects.
 *
 *   node build-projects.mjs            # write every project's files
 *   node build-projects.mjs hero-return
 *
 * Each loop is the real app (a deterministic recording from the capture rig,
 * or one of its screenshots) under a virtual camera and a focus lens: the
 * region the viewer should look at stays sharp while the rest of the window
 * blurs and dims, and the camera pushes toward it. That is the whole
 * vocabulary — coordinate-target-zoom for the push, depth-of-field-blur for
 * the lens, multi-phase-camera's micro-drift so nothing ever sits dead — and
 * every project below is the same composition with different poses.
 *
 * Geometry is authored in the app's own 1280x800 CSS pixels; the frame is
 * scaled 2x so the render is 2560x1600 and a 1.35x push still lands on real
 * pixels of the 2x source.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const SHOTS = join(REPO, "website/assets/shots/src");
const REC = join(HERE, "_recordings");
const PIN = "0.8.27";

const W = 1280;
const H = 800;

/** A lens rectangle in frame pixels. `open` is the whole frame, sharp. */
const open = { x: 0, y: 0, w: W, h: H, r: 0, dof: 0, dim: 1 };
const lens = (x, y, w, h, r = 14, dof = 7, dim = 0.5) => ({ x, y, w, h, r, dof, dim });
/** A camera pose: scale and the frame point that should sit at the centre.
 *  A push of `s` can only move the centre by (s - 1) × half the frame before
 *  the source's edge enters the viewport, so the requested centre is clamped
 *  to that headroom; the lens does the rest of the "look here". */
const cam = (s, cx = W / 2, cy = H / 2) => {
  const hx = (s - 1) * (W / 2);
  const hy = (s - 1) * (H / 2);
  return { s, cx: Math.min(W / 2 + hx, Math.max(W / 2 - hx, cx)), cy: Math.min(H / 2 + hy, Math.max(H / 2 - hy, cy)) };
};

/**
 * Every loop. `source` is a recording or a still; `poses` is a list of
 * timeline beats — each beat says where the camera and the lens should be
 * BY time `t`, arriving over `dur` seconds with `ease`. The first beat is the
 * resting state at t=0. `veil` dips to ink at both ends so the loop's cut
 * point never shows a frame jump.
 */
const PROJECTS = {
  "hero-return": {
    message: "Capture the task, leave it, and come back to all of it.",
    duration: 8.5,
    source: { kind: "video", file: "hero-return-1280x800.mp4", mediaStart: 0 },
    veil: 0.35,
    poses: [
      { t: 0, cam: cam(1), lens: open },
      { t: 0.5, dur: 0.9, ease: "power3.inOut", cam: cam(1.14, 900, 320), lens: lens(548, 148, 712, 320, 16) },
      { t: 1.85, dur: 0.5, ease: "power2.inOut", cam: cam(1), lens: open },
      { t: 2.5, dur: 0.9, ease: "power3.inOut", cam: cam(1.16, 760, 236), lens: lens(438, 156, 636, 154, 16) },
      { t: 3.6, dur: 0.5, ease: "power2.inOut", cam: cam(1), lens: open },
      { t: 4.55, dur: 0.9, ease: "power3.inOut", cam: cam(1.3, 749, 413), lens: lens(516, 254, 468, 318, 20) },
      { t: 7.6, dur: 0.8, ease: "power2.inOut", cam: cam(1.06), lens: open },
    ],
  },
  "move-capture": {
    message: "Files, terminals, tabs and the branch, sealed into one capsule.",
    duration: 4,
    source: { kind: "video", file: "capture-1280x800.mp4", mediaStart: 0 },
    veil: 0.3,
    poses: [
      { t: 0, cam: cam(1.04, 760, 300), lens: open },
      { t: 0.5, dur: 0.9, ease: "power3.inOut", cam: cam(1.22, 880, 300), lens: lens(548, 148, 712, 320, 16) },
      { t: 3.2, dur: 0.6, ease: "power2.inOut", cam: cam(1.04, 760, 300), lens: open },
    ],
  },
  "move-leave": {
    message: "Switch tasks. The one you leave saves itself.",
    duration: 4,
    source: { kind: "video", file: "leave-1280x800.mp4", mediaStart: 0 },
    veil: 0.3,
    poses: [
      { t: 0, cam: cam(1.04, 640, 380), lens: open },
      { t: 1.4, dur: 0.9, ease: "power3.inOut", cam: cam(1.2, 760, 236), lens: lens(438, 156, 636, 154, 16) },
      { t: 3.2, dur: 0.6, ease: "power2.inOut", cam: cam(1.04, 640, 380), lens: open },
    ],
  },
  "move-return": {
    message: "Everything comes back, branch first, with a receipt.",
    duration: 5.5,
    source: { kind: "video", file: "return-1280x800.mp4", mediaStart: 0 },
    veil: 0.3,
    poses: [
      { t: 0, cam: cam(1.04), lens: open },
      { t: 1.3, dur: 0.9, ease: "power3.inOut", cam: cam(1.3, 749, 413), lens: lens(516, 254, 468, 318, 20) },
      { t: 4.7, dur: 0.6, ease: "power2.inOut", cam: cam(1.04), lens: open },
    ],
  },
  "cell-files": {
    message: "Every open file and its order.",
    duration: 4,
    source: { kind: "image", file: "capsules.png" },
    veil: 0,
    poses: [
      { t: 0, cam: cam(1.08, 880, 420), lens: open },
      { t: 0.6, dur: 1.2, ease: "power2.inOut", cam: cam(1.22, 880, 340), lens: lens(556, 284, 232, 160, 14) },
      { t: 2.7, dur: 1.3, ease: "power2.inOut", cam: cam(1.08, 880, 420), lens: open },
    ],
  },
  "cell-terminals": {
    message: "Each terminal's working directory. Never its output.",
    duration: 4,
    source: { kind: "image", file: "overview.png" },
    veil: 0,
    poses: [
      { t: 0, cam: cam(1.1, 700, 300), lens: open },
      { t: 0.6, dur: 1.2, ease: "power2.inOut", cam: cam(1.3, 760, 250), lens: lens(438, 160, 636, 130, 14) },
      { t: 2.7, dur: 1.3, ease: "power2.inOut", cam: cam(1.1, 700, 300), lens: open },
    ],
  },
  "cell-tabs": {
    message: "URLs and titles from the browser you approved.",
    duration: 4,
    source: { kind: "image", file: "capsules.png" },
    veil: 0,
    poses: [
      { t: 0, cam: cam(1.08, 880, 540), lens: open },
      { t: 0.6, dur: 1.2, ease: "power2.inOut", cam: cam(1.2, 896, 580), lens: lens(556, 468, 680, 224, 14) },
      { t: 2.7, dur: 1.3, ease: "power2.inOut", cam: cam(1.08, 880, 540), lens: open },
    ],
  },
  "cell-branch": {
    message: "The branch, restored first and never forced.",
    duration: 4,
    source: { kind: "image", file: "projects.png" },
    veil: 0,
    poses: [
      { t: 0, cam: cam(1.08, 800, 440), lens: open },
      { t: 0.6, dur: 1.2, ease: "power2.inOut", cam: cam(1.24, 896, 494), lens: lens(556, 440, 680, 108, 14) },
      { t: 2.7, dur: 1.3, ease: "power2.inOut", cam: cam(1.08, 800, 440), lens: open },
    ],
  },
};

const inset = (l) => `inset(${l.y}px ${W - l.x - l.w}px ${H - l.y - l.h}px ${l.x}px round ${l.r}px)`;

function composition(name, spec) {
  const D = spec.duration;
  const src = spec.source;
  // The two plates are the same frame; the query keeps their URLs distinct
  // so the runtime discovers them as two media entries, not one duplicated.
  const plate = (id, cls, track) =>
    src.kind === "video"
      ? `<video id="${id}" class="plate ${cls}" src="assets/${src.file}?plate=${cls}" data-start="0" data-duration="${D}" data-media-start="${src.mediaStart}" data-track-index="${track}" muted playsinline></video>`
      : `<img id="${id}" class="plate ${cls}" src="assets/${src.file}?plate=${cls}" alt="" />`;

  const first = spec.poses[0];
  const beats = spec.poses.slice(1);
  const tweens = beats
    .map((b) => {
      const l = b.lens;
      return [
        `  tl.to(zo, { scale: ${b.cam.s}, duration: ${b.dur}, ease: "${b.ease}" }, ${b.t});`,
        `  tl.to(zi, { x: ${W / 2 - b.cam.cx}, y: ${H / 2 - b.cam.cy}, duration: ${b.dur}, ease: "${b.ease}" }, ${b.t});`,
        `  tl.to(sharp, { clipPath: "${inset(l)}", duration: ${b.dur}, ease: "${b.ease}" }, ${b.t});`,
        `  tl.to(base, { "--dof": "${l.dof}px", opacity: ${l.dim}, duration: ${b.dur}, ease: "${b.ease}" }, ${b.t});`,
      ].join("\n");
    })
    .join("\n");

  const veil = spec.veil
    ? [
        `  tl.fromTo(veil, { opacity: 1 }, { opacity: 0, duration: ${spec.veil}, ease: "power2.out" }, 0);`,
        `  tl.to(veil, { opacity: 1, duration: ${spec.veil}, ease: "power2.in" }, ${(D - spec.veil).toFixed(2)});`,
      ].join("\n")
    : `  gsap.set(veil, { opacity: 0 });`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=2560, height=1600" />
    <title>Rabta · ${name}</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js" integrity="sha384-sG0Hv1tP1lZCk9KQmrIbY/XNwi+OY84GQqhMscbnsoBFqAz8KNCil1kvfL3Hbbk2" crossorigin="anonymous"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 2560px; height: 1600px; overflow: hidden; background: #0a0b0e; }
      #root { position: relative; width: 2560px; height: 1600px; overflow: hidden; background: #0a0b0e; }
      /* The app's own pixels: authored at 1280x800, shown at 2x. */
      .frame { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; transform: scale(2); transform-origin: 0 0; overflow: hidden; background: #0a0b0e; }
      .drift { position: absolute; inset: 0; will-change: transform; }
      .zoom-outer { position: absolute; inset: 0; transform-origin: 50% 50%; will-change: transform; }
      .zoom-inner { position: absolute; inset: 0; will-change: transform; }
      .plate { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; object-fit: cover; display: block; }
      /* The off-focus plate: blurred and dimmed by the lens tweens. */
      .plate.base { --dof: 0px; filter: blur(var(--dof)); will-change: filter, opacity; }
      /* The focal plate: the same frame, clipped to the region that matters. */
      .plate.sharp { z-index: 2; clip-path: ${inset(first.lens)}; will-change: clip-path; }
      .veil { position: absolute; inset: 0; z-index: 5; background: #0a0b0e; pointer-events: none; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${D}" data-width="2560" data-height="1600">
      <div class="frame">
        <div class="drift" id="drift">
          <div class="zoom-outer" id="zo">
            <div class="zoom-inner" id="zi" data-layout-allow-overflow>
              ${plate("base", "base", 0)}
              ${plate("sharp", "sharp", 1)}
            </div>
          </div>
        </div>
        <div class="veil" id="veil" data-layout-ignore></div>
      </div>
    </div>
    <script>
      const zo = document.getElementById("zo");
      const zi = document.getElementById("zi");
      const base = document.getElementById("base");
      const sharp = document.getElementById("sharp");
      const veil = document.getElementById("veil");
      const drift = document.getElementById("drift");
      const tl = gsap.timeline({ paused: true });

      // The resting pose, seeded so frame 0 is right under seek.
      gsap.set(zo, { scale: ${first.cam.s} });
      gsap.set(zi, { x: ${W / 2 - first.cam.cx}, y: ${H / 2 - first.cam.cy} });
      gsap.set(base, { "--dof": "${first.lens.dof}px", opacity: ${first.lens.dim} });

      // Camera and lens: coordinate-target-zoom (outer scales, inner
      // counter-translates, same duration and ease) + depth-of-field-blur
      // (the off-focus plate takes --dof and a dim; the focal plate clips).
${tweens}

      // multi-phase-camera's micro-drift: the one writer of drift's transform,
      // spanning the whole loop so no sampled window is ever static.
      const phase = { p: 0 };
      tl.to(phase, {
        p: Math.PI * 2 * ${Math.max(1, Math.round(D / 3))},
        duration: ${D},
        ease: "none",
        onUpdate: () => {
          const dx = Math.sin(phase.p) * 3;
          const dy = Math.sin(phase.p * 0.7) * 2;
          drift.style.transform = \`translate(\${dx}px, \${dy}px)\`;
        },
      }, 0);

      // The loop's seam: a dip to ink at both ends.
${veil}

      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
}

function brief(name, spec) {
  return `---
workflow: general-video
flow: automation
storyboard: no
message: "${spec.message}"
destination: rabta.build
aspect: 2560x1600
language: en
length: ${spec.duration}s
---

## Intent

One of the product loops on rabta.build: the real Rabta app under a virtual
camera and a focus lens, the way Raylight shoots its product. The region the
viewer should look at stays sharp while the rest of the window blurs and dims,
and the camera pushes toward it. No cursor, no captions, no invented UI: the
footage is a deterministic recording of the shipped app on its demo fixture,
or one of the capture rig's screenshots.

## Assets

- assets/${spec.source.file} — ${spec.source.kind === "video" ? "the app, recorded frame by frame from the capture rig" : "a capture-rig screenshot of the app"}.

## Notes

- Brand: docs/superpowers/specs/2026-09-03-rabta-brand-redesign-design.md. Ink
  canvas, no third hue; the app supplies the ember.
- Generated by marketing-videos/site-demos/build-projects.mjs. Edit the spec
  there, not this file.
`;
}

function motionSidecar(spec) {
  return JSON.stringify(
    {
      duration: spec.duration,
      assertions: [
        { kind: "keepsMoving", withinSelector: ".frame", maxStaticSec: 2 },
        { kind: "staysInFrame", selector: "#root" },
      ],
    },
    null,
    2,
  );
}

const only = process.argv[2];
const template = join(HERE, "hero-return");
for (const [name, spec] of Object.entries(PROJECTS)) {
  if (only && only !== name) continue;
  const dir = join(HERE, name);
  mkdirSync(join(dir, "assets"), { recursive: true });
  if (!existsSync(join(dir, "hyperframes.json"))) {
    copyFileSync(join(template, "hyperframes.json"), join(dir, "hyperframes.json"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify(
        {
          name,
          private: true,
          type: "module",
          scripts: {
            dev: `npx --yes hyperframes@${PIN} preview`,
            check: `npx --yes hyperframes@${PIN} check`,
            render: `npx --yes hyperframes@${PIN} render`,
          },
        },
        null,
        2,
      ) + "\n",
    );
  }
  const from = spec.source.kind === "video" ? join(REC, spec.source.file) : join(SHOTS, spec.source.file);
  if (!existsSync(from)) {
    console.warn(`  ${name}: missing source ${from}`);
  } else {
    copyFileSync(from, join(dir, "assets", spec.source.file));
  }
  writeFileSync(join(dir, "index.html"), composition(name, spec));
  writeFileSync(join(dir, "index.motion.json"), motionSidecar(spec));
  writeFileSync(join(dir, "BRIEF.md"), brief(name, spec));
  console.log(`  ${name}: written`);
}
