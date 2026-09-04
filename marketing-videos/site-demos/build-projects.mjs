#!/usr/bin/env node
/**
 * The site's product loops, as HyperFrames projects. Version 2: a camera.
 *
 *   node build-projects.mjs            # write every project's files
 *   node build-projects.mjs hero-return
 *
 * Each loop is the real app (a deterministic recording from the capture rig,
 * one of its screenshots, or — for agents-connect — an authored terminal)
 * inside a 3D world under a perspective camera. The vocabulary is Raylight's:
 * shots hard-cut into each other; a push-in commits (1.7x and more, expo.in,
 * landing on a beat); a pull-back opens a shot; a tilted screenshot rests
 * under a linear dolly; a whip pan smears one screen into the next; focus is
 * already on the subject at frame one and travels between depth layers,
 * never a box growing. Every loop wears the same quiet grade: a vignette,
 * a screen-blended bloom of the plate, and living grain.
 *
 * Geometry is authored in the app's own 1280x800 CSS pixels; the frame is
 * scaled 2x so the render is 2560x1600 and a 1.8x push still lands on real
 * pixels of the 2x source. The camera is `3d-camera-flight`: one perspective
 * stage, one preserve-3d world, one `cam` state, one writer. Cursor targets
 * and the restore sheet's box come from the recorder's cue sidecars in
 * _recordings/<demo>.json, never from a ruler.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const SHOTS = join(REPO, "site/public/assets/shots/src");
const REC = join(HERE, "_recordings");
const PIN = "0.8.27";

const W = 1280;
const H = 800;
const FPS = 30;
const P = 1000; // perspective, in app pixels
const INK = "#0a0b0e";
const EMBER = "#FF6B2C";

// ------------------------------------------------------------------ camera

/** World z that makes the z=0 plane read at scale `s` under perspective P. */
const zFor = (s) => +(P * (1 - 1 / s)).toFixed(2);
/** How far the world may translate at world depth z before the plate's edge
 *  enters the frame: the headroom grows with the push, and is zero flat. */
const headroom = (z) => ({ x: (W / 2) * (z / P), y: (H / 2) * (z / P) });
const clamp = (v, lim) => Math.max(-lim, Math.min(lim, v));
/** A flat pose at scale `s` with app point (cx, cy) brought to the frame's
 *  centre, translation clamped to the headroom so the plate never shows its
 *  edge mid-push. Translate sits outside the rotations, so x/y are screen
 *  axes at any tilt (3d-camera-flight's fixed transform order). */
const flat = (s = 1, cx = W / 2, cy = H / 2) => {
  const z = zFor(s);
  const h = headroom(z);
  return { x: +clamp(W / 2 - cx, h.x).toFixed(2), y: +clamp(H / 2 - cy, h.y).toFixed(2), z, rx: 0, ry: 0 };
};
/** A tilted pose. Authored by eye, baked as numbers (see the spec below). */
const tilt = (x, y, z, rx = 10, ry = -30) => ({ x, y, z, rx, ry });

const FLAT = flat(1);

// ------------------------------------------------------------------ sidecars

/** The recorder's cue sidecar for a demo: the director's cues with the
 *  Capture button's and the restore sheet's boxes in app pixels. */
function sidecar(demo) {
  const file = join(REC, `${demo}.json`);
  if (!existsSync(file)) throw new Error(`missing cue sidecar ${file} — record the demo first (apps/desktop/capture/record-frames.mjs)`);
  return JSON.parse(readFileSync(file, "utf8"));
}
const centre = (r) => ({ x: +(r.x + r.w / 2).toFixed(1), y: +(r.y + r.h / 2).toFixed(1) });
/** The Capture button's centre at the click cue. */
function clickTarget(demo) {
  const cue = sidecar(demo).cues.find((c) => c.action === "save-state");
  if (!cue?.rect?.button) throw new Error(`${demo}: the save-state cue has no button rect`);
  return { at: cue.atMs / 1000, ...centre(cue.rect.button) };
}
/** Where the restore sheet rests once it has landed. */
function sheetBox(demo) {
  const box = sidecar(demo).sheet;
  if (!box) throw new Error(`${demo}: the sidecar has no sheet box`);
  return box;
}

// ------------------------------------------------------------------ regions
//
// Rectangles in app pixels on the capture rig's screenshots (2560x1600 = 2x),
// read off the frames. Each is a plane the focus can rest on.

const R = {
  // capsules.png — "What's inside" cards, the tabs list
  vscodeCard: { x: 566, y: 291, w: 216, h: 146 },
  chromeCard: { x: 788, y: 291, w: 216, h: 146 },
  gitCard: { x: 1010, y: 291, w: 216, h: 146 },
  tabsList: { x: 566, y: 478, w: 660, h: 210 },
  // overview.png — the active capsule card, the "Also open" list
  activeCard: { x: 450, y: 169, w: 598, h: 116 },
  alsoOpen: { x: 450, y: 333, w: 598, h: 112 },
  // projects.png — the header's branch row, the Branch card
  branchPill: { x: 566, y: 144, w: 350, h: 32 },
  branchCard: { x: 566, y: 474, w: 660, h: 56 },
};
const pad = (r, p = 8) => ({ x: r.x - p, y: r.y - p, w: r.w + 2 * p, h: r.h + 2 * p });
const inset = (r, radius = 10) => `inset(${r.y}px ${W - r.x - r.w}px ${H - r.y - r.h}px ${r.x}px round ${radius}px)`;

// ------------------------------------------------------------------ eases
//
// Every move has one of these; the amateur move (a lone 1.1x ease-in-out)
// is not in the list.
const PUSH = { dur: 0.7, ease: "expo.in" }; // arrives on a beat
const PULL = { dur: 0.6, ease: "expo.out" }; // opens a shot
const DIVE = { dur: 0.8, ease: "power4.out" }; // violent arrival, sharp settle
const FLATTEN = { dur: 1.4, ease: "power2.inOut" }; // a repositioning, no slam
const RACK = { dur: 0.5, ease: "power2.inOut" };
const DOF = { blur: 8, dim: 0.6 }; // hero rack
const DOF_STILL = { blur: 7, dim: 0.55 }; // the cells' resting defocus
const WHIP_PEAK = 24; // streak stdDeviation at the burst, stage-level

// ------------------------------------------------------------------ the loops
//
// Time is composition seconds. A shot is a source range placed at `at` for
// `dur`; its `layers` are the planes in the world (the app plate, region
// copies, the alpha sheet, the bloom), its `legs` the camera moves. `pose`
// is where the camera stands when the shot cuts in.

function loops() {
  const hero = clickTarget("hero-return");
  const heroSheet = sheetBox("hero-return");
  const cap = clickTarget("capture");
  const retSheet = sheetBox("return");
  const WHIP = 1360; // hero shot B: the next page abuts the old one just past the 0.94 margin
  const WHIP_LEAVE = 1280; // at 1.06 the seam never shows ink

  return {
    "hero-return": {
      message: "Capture the task, leave it, and come back to all of it.",
      duration: 8.5,
      poster: 6.0,
      whip: true,
      shots: [
        {
          // A — the app resting tilted; a linear dolly; the cursor presses Capture.
          id: "a", at: 0, dur: 3.0,
          pose: tilt(-46, 111, 150),
          layers: [
            { kind: "plate", file: "hero-return-1280x800.mp4", mediaStart: 0, card: true, far: true },
            { kind: "bloom", file: "hero-return-1280x800.mp4", mediaStart: 0 },
          ],
          legs: [{ verb: "dolly", at: 0, dur: 3.0, dz: 40 }],
          cursor: { from: { x: hero.x + 150, y: hero.y + 130 }, to: hero, moveAt: 0.45, click: hero.at },
        },
        {
          // B — flat; a pull-back opens it; the whip pan carries the capsule
          // off and lands the Overview (the footage's own view switch, at
          // 4.0 here, sits inside the burst).
          id: "b", at: 3.0, dur: 2.2,
          pose: FLAT,
          layers: [
            { kind: "plate", file: "hero-return-1280x800.mp4", mediaStart: 2.0, at: 3.0, dur: 1.0 },
            { kind: "plate", file: "hero-return-1280x800.mp4", mediaStart: 2.2, at: 4.0, dur: 0.45 },
            { kind: "plate", file: "hero-return-1280x800.mp4", mediaStart: 3.0, at: 4.0, dur: 1.2, dx: WHIP },
            { kind: "bloom", file: "hero-return-1280x800.mp4", mediaStart: 2.0, at: 3.0, dur: 1.0 },
            { kind: "bloom", file: "hero-return-1280x800.mp4", mediaStart: 3.0, at: 4.0, dur: 1.2, dx: WHIP },
          ],
          legs: [
            { verb: "pull", at: 3.0, to: flat(0.94) },
            { verb: "whip", at: 3.83, dx: -WHIP },
          ],
        },
        {
          // C — the restore sheet as its own layer at z+120, sharp from its
          // first frame; the app racks out of focus under it; a slow push.
          id: "c", at: 5.2, dur: 3.3,
          pose: FLAT,
          layers: [
            { kind: "plate", file: "hero-return-1280x800.mp4", mediaStart: 4.45, rack: DOF, rackAt: 5.2 },
            { kind: "alpha", file: "hero-return-sheet-1280x800.webm", mediaStart: 4.45, z: 120 },
            { kind: "bloom", file: "hero-return-1280x800.mp4", mediaStart: 4.45 },
          ],
          legs: [{ verb: "dolly", at: 5.2, dur: 3.3, to: flat(1.06, centre(heroSheet).x, H / 2 + 20) }],
        },
      ],
    },

    "move-capture": {
      message: "Files, terminals, tabs and the branch, sealed into one capsule.",
      duration: 4,
      poster: 1.6,
      shots: [
        {
          id: "a", at: 0, dur: 4,
          pose: FLAT,
          layers: [
            { kind: "plate", file: "capture-1280x800.mp4", mediaStart: 0 },
            { kind: "bloom", file: "capture-1280x800.mp4", mediaStart: 0 },
          ],
          legs: [
            { verb: "push", at: cap.at - PUSH.dur, to: flat(1.8, cap.x, cap.y + 40) },
            { verb: "dolly", at: cap.at, dur: 3.3 - cap.at, to: flat(1.86, cap.x, cap.y + 40) },
            { verb: "pull", at: 3.3, to: FLAT },
          ],
          cursor: { from: { x: cap.x + 160, y: cap.y + 140 }, to: cap, moveAt: 0.4, click: cap.at },
        },
      ],
    },

    "move-leave": {
      message: "Switch tasks. The one you leave saves itself.",
      duration: 4,
      poster: 2.2,
      whip: true,
      shots: [
        {
          // 0.6s quiet, then the whip carries the capsule off and lands the
          // Overview; the footage switches at 0.9, inside the burst.
          id: "a", at: 0, dur: 4,
          pose: flat(1.06),
          layers: [
            { kind: "plate", file: "leave-1280x800.mp4", mediaStart: 0, at: 0, dur: 0.9 },
            { kind: "plate", file: "leave-1280x800.mp4", mediaStart: 0, at: 0.9, dur: 0.45 },
            { kind: "plate", file: "leave-1280x800.mp4", mediaStart: 0.9, at: 0.9, dur: 3.1, dx: WHIP_LEAVE },
            { kind: "bloom", file: "leave-1280x800.mp4", mediaStart: 0, at: 0, dur: 0.9 },
            { kind: "bloom", file: "leave-1280x800.mp4", mediaStart: 0.9, at: 0.9, dur: 3.1, dx: WHIP_LEAVE },
          ],
          legs: [
            { verb: "whip", at: 0.72, dx: -WHIP_LEAVE },
            // The hold is a slow dolly in, never a freeze: about 1.04x by the pull.
            { verb: "dolly", at: 1.35, dur: 2.0, dz: 36 },
            { verb: "pull", at: 3.4, to: { ...FLAT, x: -WHIP_LEAVE } },
          ],
        },
      ],
    },

    "move-return": {
      message: "Everything comes back, branch first, with a receipt.",
      duration: 5.5,
      poster: 3.0,
      shots: [
        {
          // The app sharp for 0.9s; the sheet lands as its own layer and the
          // focus travels to it over 0.5s; a slow linear push throughout.
          id: "a", at: 0, dur: 5.5,
          pose: FLAT,
          layers: [
            { kind: "plate", file: "return-1280x800.mp4", mediaStart: 0, rack: DOF, rackAt: 0.95 },
            { kind: "alpha", file: "return-sheet-1280x800.webm", mediaStart: 0, z: 120, rackIn: true, rackAt: 0.95 },
            { kind: "bloom", file: "return-1280x800.mp4", mediaStart: 0 },
          ],
          legs: [{ verb: "dolly", at: 0, dur: 5.5, to: flat(1.06, centre(retSheet).x, H / 2 + 20) }],
        },
      ],
    },

    "cell-files": {
      message: "Every open file and its order.",
      duration: 4,
      poster: 2.0,
      shots: [
        {
          id: "a", at: 0, dur: 4,
          pose: tilt(-40, 150, 260),
          layers: [
            { kind: "still", file: "capsules.png", card: true, dof: DOF_STILL },
            { kind: "region", file: "capsules.png", region: R.vscodeCard, z: 40 },
            { kind: "bloom", file: "capsules.png" },
          ],
          // A slow lateral track with a little dolly: the card drifts past the lens
          // the way a tilted screenshot does under a moving camera, never a freeze.
          legs: [{ verb: "track", at: 0, dur: 4, to: tilt(-110, 166, 320) }],
        },
      ],
    },

    "cell-tabs": {
      message: "URLs and titles from the browser you approved.",
      duration: 4,
      poster: 2.0,
      shots: [
        {
          id: "a", at: 0, dur: 4,
          pose: tilt(-90, -40, 170),
          layers: [
            { kind: "still", file: "capsules.png", card: true, dof: DOF_STILL },
            { kind: "region", file: "capsules.png", region: R.tabsList, z: 40 },
            { kind: "bloom", file: "capsules.png" },
          ],
          // A slow lateral track with a little dolly: the card drifts past the lens
          // the way a tilted screenshot does under a moving camera, never a freeze.
          legs: [{ verb: "track", at: 0, dur: 4, to: tilt(-160, -24, 230) }],
        },
      ],
    },

    "cell-terminals": {
      message: "Each terminal's working directory. Never its output.",
      duration: 4,
      poster: 1.2,
      shots: [
        {
          // A flat tracking shot at 1.3x; the focus racks from the active
          // capsule to the list below it midway.
          id: "a", at: 0, dur: 4,
          pose: flat(1.3, 668, 310),
          layers: [
            { kind: "still", file: "overview.png", dof: { blur: 6, dim: 0.55 } },
            { kind: "region", file: "overview.png", region: R.activeCard, z: 30, rackOut: true, rackAt: 1.75 },
            { kind: "region", file: "overview.png", region: R.alsoOpen, z: 30, rackIn: true, rackAt: 1.75 },
            { kind: "bloom", file: "overview.png" },
          ],
          legs: [{ verb: "track", at: 0.25, dur: 3.5, to: flat(1.3, 788, 310) }],
        },
      ],
    },

    "cell-branch": {
      message: "The branch, restored first and never forced.",
      duration: 4,
      poster: 3.0,
      shots: [
        {
          id: "a", at: 0, dur: 4,
          pose: flat(1.3, 668, 340),
          layers: [
            { kind: "still", file: "projects.png", dof: { blur: 6, dim: 0.55 } },
            { kind: "region", file: "projects.png", region: R.branchPill, z: 30, rackOut: true, rackAt: 1.75 },
            { kind: "region", file: "projects.png", region: R.branchCard, z: 30, rackIn: true, rackAt: 1.75 },
            { kind: "bloom", file: "projects.png" },
          ],
          legs: [{ verb: "track", at: 0.25, dur: 3.5, to: flat(1.3, 788, 340) }],
        },
      ],
    },

    "agents-connect": {
      message: "One command, and your agent knows what you were doing.",
      duration: 5,
      poster: 4.6,
      terminal: {
        command: "claude mcp add rabta -- npx -y @rabta/mcp",
        lines: [
          "Added stdio MCP server rabta",
          "capsule_briefing: Wire the connector SDK reconnect",
          "4 files · 3 terminals · 5 tabs · feat/connector-reconnect",
        ],
        charMs: 30,
        wordMs: 80,
        typeAt: 0.3,
      },
      shots: [
        {
          id: "a", at: 0, dur: 5,
          pose: FLAT,
          layers: [],
          // A slow dolly in under the typing, then one push to 1.2x landing on
          // the last line.
          legs: [
            { verb: "dolly", at: 0, dur: 4.1 - PUSH.dur, dz: 45 },
            { verb: "push", at: 4.1 - PUSH.dur, to: flat(1.2, W / 2, H / 2 + 60) },
          ],
        },
      ],
    },

    "capsule-anatomy": {
      message: "A capsule is four things: files, terminals, tabs and the branch.",
      duration: 6,
      poster: 2.6,
      shots: [
        {
          // The screenshot sliced into planes at four depths; a dive into
          // the angled pose, a held drift, then the tilt flattens and every
          // plane returns to the page so it ends as the plain screenshot.
          id: "a", at: 0, dur: 6,
          pose: { x: 0, y: 0, z: -220, rx: 0, ry: 0 },
          layers: [
            { kind: "still", file: "capsules.png", card: true, dof: { blur: 3, dim: 1 }, dofAt: 0, dofDur: DIVE.dur, dofEase: DIVE.ease, refocusAt: 4.4, refocusDur: FLATTEN.dur },
            { kind: "region", file: "capsules.png", region: R.vscodeCard, z: 80, settleAt: 4.4 },
            { kind: "region", file: "capsules.png", region: R.tabsList, z: 120, settleAt: 4.4 },
            { kind: "region", file: "capsules.png", region: R.chromeCard, z: 160, settleAt: 4.4 },
            { kind: "region", file: "capsules.png", region: R.gitCard, z: 240, settleAt: 4.4 },
            { kind: "bloom", file: "capsules.png" },
          ],
          legs: [
            { verb: "dive", at: 0, to: tilt(-120, 70, 40, 42, -14) },
            { verb: "dolly", at: DIVE.dur, dur: 4.4 - DIVE.dur, dz: 25 },
            { verb: "flatten", at: 4.4, to: { x: 0, y: 0, z: 0, rx: 0, ry: 0 } },
          ],
        },
      ],
    },
  };
}

// ------------------------------------------------------------------ emit

const fmt = (n) => (Number.isInteger(n) ? String(n) : String(+n.toFixed(3)));
const poseJs = (p) => `{ x: ${fmt(p.x)}, y: ${fmt(p.y)}, z: ${fmt(p.z)}, rx: ${fmt(p.rx)}, ry: ${fmt(p.ry)} }`;

/** Emits the timeline for one loop: every camera leg as a fromTo on `cam`
 *  with explicit start values (seek-safe under parallel frame capture),
 *  every focus change as a `--dof` tween on a leaf layer. */
function timeline(name, spec) {
  const js = [];
  let cam = null; // the generator's shadow of the camera, so every leg's `from` is explicit
  let first = true;
  const leg = (to, at, dur, ease) => {
    const from = cam;
    const next = { ...cam, ...to };
    js.push(`  tl.fromTo(cam, ${poseJs(from)}, { ...${poseJs(next)}, duration: ${fmt(dur)}, ease: "${ease}", immediateRender: ${first}, onUpdate: applyCamera }, ${fmt(at)});`);
    cam = next;
    first = false;
  };

  for (const shot of spec.shots) {
    js.push(`  // shot ${shot.id} — ${fmt(shot.at)}s to ${fmt(shot.at + shot.dur)}s`);
    if (cam === null) {
      cam = shot.pose;
      js.push(`  Object.assign(cam, ${poseJs(cam)}); applyCamera();`);
    } else {
      // A hard cut: the pose lands on the same frame the new clip appears.
      js.push(`  tl.set(cam, { ...${poseJs(shot.pose)}, onUpdate: applyCamera }, ${fmt(shot.at)});`);
      cam = shot.pose;
    }

    for (const l of shot.legs) {
      switch (l.verb) {
        case "dolly": // linear, the only subtle move
        case "track": {
          const to = l.to ?? { z: cam.z + l.dz };
          leg(to, l.at, l.dur, "none");
          break;
        }
        case "push":
          leg(l.to, l.at, PUSH.dur, PUSH.ease);
          break;
        case "pull":
          leg(l.to, l.at, PULL.dur, PULL.ease);
          break;
        case "dive":
          leg(l.to, l.at, DIVE.dur, DIVE.ease);
          break;
        case "flatten":
          leg(l.to, l.at, FLATTEN.dur, FLATTEN.ease);
          break;
        case "whip": {
          // nudge-curve on cam.x: ramp-in, linear burst, long tail; the
          // streak rides the same windows (motion-blur-streak's whip sweep).
          const x0 = cam.x;
          leg({ x: x0 + l.dx * 0.1 }, l.at, 0.12, "power3.in");
          leg({ x: x0 + l.dx * 0.75 }, l.at + 0.12, 0.1, "none");
          leg({ x: x0 + l.dx }, l.at + 0.22, 0.35, "power4.out");
          js.push(`  tl.fromTo(streak, { v: 0 }, { v: ${WHIP_PEAK}, duration: 0.12, ease: "power3.in", immediateRender: false, onUpdate: writeStreak }, ${fmt(l.at)});`);
          js.push(`  tl.fromTo(streak, { v: ${WHIP_PEAK} }, { v: 0, duration: 0.35, ease: "power4.out", immediateRender: false, onUpdate: writeStreak }, ${fmt(l.at + 0.22)});`);
          break;
        }
        default:
          throw new Error(`${name}: unknown verb ${l.verb}`);
      }
    }

    shot.layers.forEach((l, i) => {
      const id = `${shot.id}-${l.kind}-${i}`;
      if (l.rack) {
        // The app plate racks out of focus under the sheet.
        js.push(`  tl.fromTo("#${id}", { "--dof": "0px", opacity: 1 }, { "--dof": "${l.rack.blur}px", opacity: ${l.rack.dim}, duration: ${RACK.dur}, ease: "${RACK.ease}", immediateRender: false }, ${fmt(l.rackAt)});`);
      }
      if (l.rackIn) {
        // Pre-blurred before the rack, so there is no pop; sharp after it.
        const blur = l.kind === "alpha" ? DOF.blur : (spec.shots[0].layers[0].dof?.blur ?? DOF.blur);
        const from = l.kind === "alpha" ? `{ "--dof": "${blur}px" }` : `{ "--dof": "${blur}px", opacity: 0 }`;
        const to = l.kind === "alpha" ? `{ "--dof": "0px"` : `{ "--dof": "0px", opacity: 1`;
        js.push(`  gsap.set("#${id}", ${from});`);
        js.push(`  tl.fromTo("#${id}", ${from}, ${to}, duration: ${RACK.dur}, ease: "${RACK.ease}", immediateRender: false }, ${fmt(l.rackAt)});`);
      }
      if (l.rackOut) {
        // A region copy racks out by fading into the defocused plate beneath
        // it, which already wears the same blur.
        const blur = spec.shots[0].layers[0].dof?.blur ?? DOF.blur;
        js.push(`  tl.fromTo("#${id}", { "--dof": "0px", opacity: 1 }, { "--dof": "${blur}px", opacity: 0, duration: ${RACK.dur}, ease: "${RACK.ease}", immediateRender: false }, ${fmt(l.rackAt)});`);
      }
      if (l.kind === "still" && l.dof && l.dofAt !== undefined) {
        // Decelerate into focus: the page defocuses on the dive, refocuses on the flatten.
        js.push(`  tl.fromTo("#${id}", { "--dof": "0px" }, { "--dof": "${l.dof.blur}px", duration: ${fmt(l.dofDur)}, ease: "${l.dofEase}", immediateRender: false }, ${fmt(l.dofAt)});`);
        js.push(`  tl.fromTo("#${id}", { "--dof": "${l.dof.blur}px" }, { "--dof": "0px", duration: ${fmt(l.refocusDur)}, ease: "${FLATTEN.ease}", immediateRender: false }, ${fmt(l.refocusAt)});`);
      }
      if (l.kind === "region" && l.settleAt !== undefined) {
        // The lifted plane returns to the page as the tilt flattens.
        js.push(`  gsap.set("#${id}", { z: ${l.z} });`);
        js.push(`  tl.fromTo("#${id}", { z: ${l.z} }, { z: 0, duration: ${FLATTEN.dur}, ease: "${FLATTEN.ease}", immediateRender: false }, ${fmt(l.settleAt)});`);
      }
    });

    if (shot.cursor) {
      const c = shot.cursor;
      const tip = { x: c.to.x, y: c.to.y };
      js.push(`  gsap.set(cursor, { x: ${fmt(c.from.x)}, y: ${fmt(c.from.y)}, z: 30, autoAlpha: 0, transformOrigin: "0 0" });`);
      js.push(`  gsap.set(ring, { x: ${fmt(tip.x)}, y: ${fmt(tip.y)}, z: 30, autoAlpha: 0, scale: 0.3 });`);
      js.push(`  tl.set(cursor, { autoAlpha: 1 }, ${fmt(shot.at)});`);
      js.push(`  tl.fromTo(cursor, { x: ${fmt(c.from.x)}, y: ${fmt(c.from.y)} }, { x: ${fmt(tip.x)}, y: ${fmt(tip.y)}, duration: 0.5, ease: "power2.inOut", immediateRender: false }, ${fmt(c.moveAt)});`);
      js.push(`  tl.fromTo(cursor, { scale: 1 }, { scale: 0.9, duration: 0.06, ease: "power2.in", immediateRender: false }, ${fmt(c.click - 0.06)});`);
      js.push(`  tl.fromTo(cursor, { scale: 0.9 }, { scale: 1, duration: 0.14, ease: "power2.out", immediateRender: false }, ${fmt(c.click)});`);
      js.push(`  tl.fromTo(ring, { autoAlpha: 0.7, scale: 0.3 }, { autoAlpha: 0, scale: 1.8, duration: 0.5, ease: "power2.out", immediateRender: false }, ${fmt(c.click)});`);
      if (shot.at + shot.dur < spec.duration) js.push(`  tl.set(cursor, { autoAlpha: 0 }, ${fmt(shot.at + shot.dur)});`);
    }
  }

  if (spec.terminal) js.push(...terminalTimeline(spec));
  return js.join("\n");
}

// ------------------------------------------------------------------ terminal

const CHAR_RE = /\S|\s/g;
function terminalMarkup(t) {
  const span = (ch, cls) => `<span class="${cls}">${ch === " " ? "&nbsp;" : ch.replace(/</g, "&lt;")}</span>`;
  const command = t.command.match(CHAR_RE).map((ch) => span(ch, "ch")).join("");
  const lines = t.lines
    .map((line, i) => {
      const words = line.split(" ").map((w) => span(w, "wd")).join('<span class="wd">&nbsp;</span>');
      return `<div class="line out" id="out-${i}">${words}</div>`;
    })
    .join("\n            ");
  return `<div class="term" id="term">
          <div class="bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="title">zsh — rabta</span></div>
          <div class="body">
            <div class="line cmd"><span class="prompt">$</span>&nbsp;${command}<span class="caret" id="caret"></span></div>
            ${lines}
          </div>
        </div>`;
}
function terminalTimeline(spec) {
  const t = spec.terminal;
  const js = [];
  js.push(`  const chars = gsap.utils.toArray(".line.cmd .ch");`);
  js.push(`  gsap.set(chars, { autoAlpha: 0 }); gsap.set(".line.out", { autoAlpha: 0 }); gsap.set(".line.out .wd", { autoAlpha: 0 });`);
  const n = t.command.length;
  js.push(`  chars.forEach((c, i) => tl.set(c, { autoAlpha: 1 }, ${fmt(t.typeAt)} + i * ${t.charMs / 1000}));`);
  let cursor = t.typeAt + n * (t.charMs / 1000) + 0.35; // enter, then the response
  t.lines.forEach((line, i) => {
    const words = line.split(" ").length;
    js.push(`  tl.set("#out-${i}", { autoAlpha: 1 }, ${fmt(cursor)});`);
    js.push(`  gsap.utils.toArray("#out-${i} .wd").forEach((w, k) => tl.set(w, { autoAlpha: 1 }, ${fmt(cursor)} + Math.floor(k / 2) * ${t.wordMs / 1000}));`);
    cursor += words * (t.wordMs / 1000) + 0.25;
  });
  // The caret blinks for the whole loop: an idle terminal is never still.
  js.push(`  for (let k = 0; k < ${Math.floor(spec.duration / 0.5)}; k++) tl.set("#caret", { opacity: k % 2 ? 0 : 1 }, k * 0.5);`);
  return js;
}

// ------------------------------------------------------------------ html

function layerMarkup(shot, l, i, spec) {
  const id = `${shot.id}-${l.kind}-${i}`;
  const at = l.at ?? shot.at;
  const dur = l.dur ?? shot.dur;
  const left = l.dx ? ` left: ${l.dx}px;` : "";
  const z = (v) => `transform: translateZ(${v}px);`;
  const video = (cls, file, track, extra = "") =>
    `<video id="${id}" class="${cls}" src="assets/${file}?layer=${id}" data-start="${fmt(at)}" data-duration="${fmt(dur)}" data-media-start="${fmt(l.mediaStart)}" data-track-index="${track}" muted playsinline style="${extra}${left}"></video>`;
  switch (l.kind) {
    case "plate": {
      const cls = ["plate", l.card ? "card" : "", l.rack ? "dof" : ""].join(" ").trim();
      const main = video(cls, l.file, 0, z(0));
      // The far side of a tilted page is out of focus: a masked, blurred copy.
      const far = l.far ? `\n          <video id="${id}-far" class="plate far" src="assets/${l.file}?layer=${id}-far" data-start="${fmt(at)}" data-duration="${fmt(dur)}" data-media-start="${fmt(l.mediaStart)}" data-track-index="0" muted playsinline style="${z(0.3)}"></video>` : "";
      return main + far;
    }
    case "alpha":
      return video("plate layer alpha dof", l.file, 1, z(l.z));
    case "bloom":
      return spec.shots[0].layers.some((x) => x.kind === "still")
        ? `<img id="${id}" class="plate bloom" src="assets/${bloomName(l.file)}?layer=${id}" alt="" style="${z(0.5)}" />`
        : video("plate bloom", bloomName(l.file), 2, z(0.5));
    case "still":
      return `<img id="${id}" class="plate ${l.card ? "card" : ""} dof" src="assets/${l.file}?layer=${id}" alt="" style="${z(0)}" />`;
    case "region": {
      const style = l.settleAt !== undefined ? "" : z(l.z); // settling planes are GSAP-positioned
      return `<img id="${id}" class="plate region dof" src="assets/${l.file}?layer=${id}" alt="" style="clip-path: ${inset(pad(l.region))}; ${style}" />`;
    }
    default:
      throw new Error(`unknown layer kind ${l.kind}`);
  }
}

const bloomName = (file) => file.replace(/\.(mp4|png)$/, "-bloom.$1");

function composition(name, spec) {
  const D = spec.duration;
  const world = spec.shots
    .flatMap((shot) => shot.layers.map((l, i) => layerMarkup(shot, l, i, spec)))
    .join("\n          ");
  const hasCursor = spec.shots.some((s) => s.cursor);
  const cursor = hasCursor
    ? `<div class="cursor" id="cursor"><svg viewBox="0 0 24 32" width="22" height="30" aria-hidden="true"><path d="M2 2 L2 24 L8 18.5 L12 28 L16 26 L12 17 L20 17 Z" fill="#101114" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg></div>
          <div class="ring" id="ring"></div>`
    : "";
  const term = spec.terminal ? terminalMarkup(spec.terminal) : "";
  const stillDof = spec.shots[0].layers.find((l) => l.kind === "still" && l.dof && l.dofAt === undefined)?.dof;
  const frames = Math.round(D * FPS);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=2560, height=1600" />
    <title>Rabta · ${name}</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js" integrity="sha384-sG0Hv1tP1lZCk9KQmrIbY/XNwi+OY84GQqhMscbnsoBFqAz8KNCil1kvfL3Hbbk2" crossorigin="anonymous"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 2560px; height: 1600px; overflow: hidden; background: ${INK}; }
      #root { position: relative; width: 2560px; height: 1600px; overflow: hidden; background: ${INK}; }
      /* The app's own pixels: authored at 1280x800, shown at 2x. */
      .frame { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; transform: scale(2); transform-origin: 0 0; overflow: hidden; background: ${INK}; }
      /* The void the camera exposes at the frame's edges is a designed surface. */
      .scene { position: absolute; inset: 0; overflow: hidden; background: radial-gradient(120% 90% at 50% 42%, #13151b 0%, ${INK} 62%); }
      .defs { position: absolute; width: 0; height: 0; }
      /* The lens: static perspective, never tweened. The whip's streak lives here, above the 3D context. */
      .stage { position: absolute; inset: 0; perspective: ${P}px; perspective-origin: 50% 50%; }
      .stage.whip { filter: url(#streak); }
      /* The world: preserve-3d and clean — only applyCamera() writes its transform. */
      .world { position: absolute; inset: 0; transform-style: preserve-3d; transform-origin: 50% 50%; will-change: transform; }
      .plate { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; object-fit: cover; display: block; }
      .plate.card { border-radius: 10px; box-shadow: 0 30px 70px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.06); }
      /* Depth of field on leaf layers only: a --dof blur and a dim. */
      .dof { --dof: 0px; filter: blur(var(--dof)); will-change: filter, opacity; }
      .region { --dof: 0px; }
      ${stillDof ? `.plate.card.dof, .plate.dof:not(.region):not(.alpha) { --dof: ${stillDof.blur}px; opacity: ${stillDof.dim}; }` : ""}
      /* The far side of a tilted page falls out of focus. */
      .plate.far { filter: blur(6px); -webkit-mask-image: linear-gradient(100deg, #000 0%, #000 20%, transparent 46%); mask-image: linear-gradient(100deg, #000 0%, #000 20%, transparent 46%); border-radius: 10px; }
      /* Bloom: a pre-blurred copy of the plate, screened over it in the world. */
      .plate.bloom { mix-blend-mode: screen; opacity: 0.14; pointer-events: none; }
      .cursor { position: absolute; left: 0; top: 0; width: 22px; height: 30px; will-change: transform; filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.5)); }
      .cursor svg { display: block; width: 22px; height: 30px; }
      .ring { position: absolute; left: -14px; top: -14px; width: 28px; height: 28px; border-radius: 50%; border: 2px solid rgba(255, 255, 255, 0.9); will-change: transform, opacity; }
      /* The grade, beside the stage, on every loop. */
      .grade { position: absolute; inset: 0; pointer-events: none; }
      .vignette { position: absolute; inset: 0; background: radial-gradient(ellipse 78% 68% at 50% 46%, rgba(0, 0, 0, 0) 42%, rgba(0, 0, 0, 0.5) 100%); }
      .grain { position: absolute; inset: 0; width: ${W}px; height: ${H}px; mix-blend-mode: overlay; opacity: 0.035; }
      /* agents-connect: an authored terminal in the world. */
      .term { position: absolute; left: ${(W - 800) / 2}px; top: ${(H - 420) / 2}px; width: 800px; height: 420px; border-radius: 14px; background: #0e1015; box-shadow: 0 40px 90px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.07); overflow: hidden; transform: translateZ(0); }
      .term .bar { display: flex; align-items: center; gap: 8px; height: 44px; padding: 0 16px; background: #13161c; border-bottom: 1px solid rgba(255, 255, 255, 0.06); }
      .term .dot { width: 12px; height: 12px; border-radius: 50%; background: #2a2f3a; }
      .term .title { margin-left: auto; margin-right: auto; font: 500 13px/1 ui-sans-serif, -apple-system, "SF Pro Text", Inter, system-ui, sans-serif; color: #8b93a7; letter-spacing: 0.01em; }
      .term .body { padding: 26px 30px; font: 400 17px/1.75 ui-monospace, "SF Mono", Menlo, Consolas, monospace; color: #e6e8ee; }
      .term .line { white-space: nowrap; min-height: 30px; }
      .term .prompt { color: ${EMBER}; font-weight: 600; }
      .term .out { color: #a3abbd; }
      .term .out:last-child { color: #e6e8ee; }
      .term .caret { display: inline-block; width: 9px; height: 19px; margin-left: 2px; vertical-align: -3px; background: ${EMBER}; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${fmt(D)}" data-width="2560" data-height="1600">
      <div class="frame">
        <div class="scene">
          <svg class="defs" aria-hidden="true">
            <filter id="streak" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur id="streak-blur" in="SourceGraphic" stdDeviation="0 0" /></filter>
          </svg>
          <div class="stage${spec.whip ? " whip" : ""}" id="stage">
            <div class="world" id="world" data-layout-allow-overflow>
          ${world}
          ${term}
          ${cursor}
            </div>
          </div>
          <div class="grade" data-layout-ignore>
            <div class="vignette"></div>
            <svg class="grain" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
              <filter id="grain-f" x="0" y="0" width="100%" height="100%"><feTurbulence id="grain-t" type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="0" stitchTiles="stitch" /><feColorMatrix type="saturate" values="0" /></filter>
              <rect width="${W}" height="${H}" filter="url(#grain-f)" />
            </svg>
          </div>
        </div>
      </div>
    </div>
    <script>
      const world = document.getElementById("world");
      ${hasCursor ? 'const cursor = document.getElementById("cursor");\n      const ring = document.getElementById("ring");' : ""}
      const streakNode = document.getElementById("streak-blur");
      const grainNode = document.getElementById("grain-t");
      const tl = gsap.timeline({ paused: true });

      // The camera: one state, one writer, translate outside the rotations so
      // x/y stay screen-aligned at any tilt.
      const cam = { x: 0, y: 0, z: 0, rx: 0, ry: 0 };
      function applyCamera() {
        world.style.transform = \`translate3d(\${cam.x}px, \${cam.y}px, \${cam.z}px) rotateX(\${cam.rx}deg) rotateY(\${cam.ry}deg)\`;
      }
      // The whip's streak: a proxy peaking during the burst, seeded at 0.
      const streak = { v: 0 };
      const writeStreak = () => streakNode.setAttribute("stdDeviation", \`\${streak.v.toFixed(2)} 0\`);
      writeStreak();

${timeline(name, spec)}

      // One driver across the loop: rewrites the camera after every other
      // tween has rendered (so a seek in any order ends on the same pose) and
      // reseeds the grain per frame, so it is alive and still deterministic.
      const clock = { t: 0 };
      grainNode.setAttribute("seed", "0");
      tl.to(clock, {
        t: ${fmt(D)},
        duration: ${fmt(D)},
        ease: "none",
        onUpdate: () => {
          applyCamera();
          grainNode.setAttribute("seed", String(Math.min(${frames}, Math.floor(clock.t * ${FPS} + 1e-6))));
        },
      }, 0);

      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
}

// ------------------------------------------------------------------ files

function brief(name, spec) {
  const assets = [...new Set(spec.shots.flatMap((s) => s.layers.map((l) => l.file)))];
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

One of the product loops on rabta.build: the real Rabta app inside a 3D
world under a perspective camera, shot the way Raylight shoots its product.
Hard cuts between shots; a push-in that commits and lands on the beat; a
tilted screenshot at rest under a linear dolly; a whip pan that smears one
screen into the next; focus already on the subject at frame one, travelling
between depth layers. A vignette, a screened bloom of the plate and living
grain on every loop, all below the level where they announce themselves.
${spec.terminal ? "The terminal is authored; every other pixel is the shipped app on its demo fixture." : "No captions, no invented UI: the footage is a deterministic recording of the shipped app on its demo fixture, or one of the capture rig's screenshots."}

## Assets

${assets.map((a) => `- assets/${a} — ${/webm$/.test(a) ? "the restore sheet alone, recorded with alpha" : /mp4$/.test(a) ? "the app, recorded frame by frame from the capture rig" : "a capture-rig screenshot of the app"}.`).join("\n")}

## Notes

- Brand: docs/superpowers/specs/2026-09-03-rabta-brand-redesign-design.md. Ink
  canvas, no third hue; the app supplies the ember.
- Generated by marketing-videos/site-demos/build-projects.mjs. Edit the spec
  there, not this file. Cursor targets and the sheet's box come from
  _recordings/<demo>.json, written by apps/desktop/capture/record-frames.mjs.
`;
}

function motionSidecar(spec) {
  return JSON.stringify(
    {
      duration: spec.duration,
      assertions: [
        { kind: "keepsMoving", withinSelector: ".scene", maxStaticSec: 1.2 },
        { kind: "staysInFrame", selector: "#root" },
      ],
    },
    null,
    2,
  );
}

/** A small, pre-blurred copy of a plate for the bloom layer: no runtime
 *  blur, and a tenth of the pixels to decode. Rebuilt when the source is newer. */
function bloomAsset(from, to) {
  if (existsSync(to) && statSync(to).mtimeMs >= statSync(from).mtimeMs) return;
  const filters = "scale=640:400:flags=lanczos,gblur=sigma=9";
  if (/\.mp4$/.test(from)) {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", from, "-an", "-vf", `${filters},format=yuv420p`, "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-movflags", "+faststart", to], { stdio: "inherit" });
  } else {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", from, "-vf", filters, to], { stdio: "inherit" });
  }
}

const only = process.argv[2];
const LOOPS = loops();
for (const [name, spec] of Object.entries(LOOPS)) {
  if (only && only !== name) continue;
  const dir = join(HERE, name);
  mkdirSync(join(dir, "assets"), { recursive: true });
  // Preview must show what the render shows: the proxy transcode drops alpha.
  writeFileSync(
    join(dir, "hyperframes.json"),
    JSON.stringify(
      {
        $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
        registry: "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
        paths: { blocks: "compositions", components: "compositions/components", assets: "assets" },
        media: { autoProxy: false },
        authoringSkill: "general-video",
      },
      null,
      2,
    ) + "\n",
  );
  if (!existsSync(join(dir, "package.json"))) {
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
  if (!existsSync(join(dir, "meta.json"))) {
    writeFileSync(join(dir, "meta.json"), JSON.stringify({ id: name, name }, null, 2) + "\n");
  }
  const files = new Set(spec.shots.flatMap((s) => s.layers.map((l) => l.file)));
  for (const file of files) {
    const from = /\.(mp4|webm)$/.test(file) ? join(REC, file) : join(SHOTS, file);
    if (!existsSync(from)) throw new Error(`${name}: missing source ${from}`);
    copyFileSync(from, join(dir, "assets", file));
    if (/\.(mp4|png)$/.test(file) && spec.shots.some((s) => s.layers.some((l) => l.kind === "bloom" && l.file === file))) {
      bloomAsset(from, join(dir, "assets", bloomName(file)));
    }
  }
  writeFileSync(join(dir, "index.html"), composition(name, spec));
  writeFileSync(join(dir, "index.motion.json"), motionSidecar(spec));
  writeFileSync(join(dir, "BRIEF.md"), brief(name, spec));
  console.log(`  ${name}: written`);
}
