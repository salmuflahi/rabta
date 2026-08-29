#!/usr/bin/env node
// Builds every social video declared in manifest.json.
//
//   node apps/desktop/capture/social/build.mjs            # build all
//   node apps/desktop/capture/social/build.mjs app-tour   # build one
//
// Two video types:
//   "dump" — app screenshots, slow push, cross-dissolved (the photo-dump look)
//   "demo" — a title card with a screen recording composited into the frame
//
// Cards are HTML rendered by headless Chrome at exactly 1080x1920. Do NOT switch
// this to `qlmanage`: it emits a SQUARE thumbnail, which silently crops the
// bottom 44% of a 1080x1920 card and throws away the tagline and the URL.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const manifest = JSON.parse(readFileSync(join(HERE, 'manifest.json'), 'utf8'));
const { width: W, height: H } = manifest.canvas;
const OUT = join(ROOT, manifest.output);
const SHOTS = join(ROOT, 'website/assets/shots/src');
const DEMOS = join(ROOT, 'website/assets/demos');
const WORK = join(HERE, '.work');

const TRANSITION = 0.5; // cross-dissolve seconds between photo-dump slides

const theme = {
  bg: '#0b0e0e',
  frame: '#151a19',
  stroke: '#303936',
  text: '#ffffff',
  muted: '#aeb7b4',
  accent: '#ff7043',
  url: '#6f7a77',
  font: '"SF Pro Display", -apple-system, Helvetica, Arial, sans-serif',
};

// Layout, in canvas pixels. Everything sits inside the platform safe areas:
// nothing above 180 or below 1600.
const layout = {
  headTop: 200,       // headline block starts here
  bandTop: 540,       // the stage is vertically centred in this band
  bandBottom: 1340,
  stageWidth: W - 100,
  taglineTop: 1380,
  urlTop: 1490,
  sideMargin: 70,
};

// The stage is sized from the SOURCE aspect ratio so nothing is stretched:
// screenshots are 2560x1600 (16:10), recordings are cropped to 960x720 (4:3).
// Heights are forced even because yuv420p requires it.
function stageBox(aspect) {
  let h = Math.round(layout.stageWidth / aspect);
  if (h % 2) h -= 1;
  const top = layout.bandTop + Math.round((layout.bandBottom - layout.bandTop - h) / 2);
  return { top, height: h };
}
const DUMP_STAGE = stageBox(2560 / 1600);
const DEMO_STAGE = stageBox(960 / 720);

const sh = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });

function shoot(html, pngPath) {
  const htmlPath = pngPath.replace(/\.png$/, '.html');
  writeFileSync(htmlPath, html);
  rmSync(pngPath, { force: true });
  sh(CHROME, [
    '--headless', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--screenshot=${pngPath}`,
    `--window-size=${W},${H}`,
    `file://${htmlPath}`,
  ]);
  if (!existsSync(pngPath)) throw new Error(`Chrome produced no PNG for ${pngPath}`);
  const dims = sh('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', pngPath])
    .toString().match(/pixel(?:Width|Height): (\d+)/g).map((s) => s.split(': ')[1]);
  if (dims[0] !== String(W) || dims[1] !== String(H)) {
    throw new Error(`${pngPath} rendered ${dims.join('x')}, expected ${W}x${H}`);
  }
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Shared chrome for both card and slide. `stage` is the middle band: either an
// empty frame that the recording gets composited into, or an <img>.
function page({ headline, subhead, tagline, url, stage, box }) {
  return `<!doctype html><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${W}px;height:${H}px;background:${theme.bg};font-family:${theme.font};overflow:hidden}
  .head{position:absolute;top:${layout.headTop}px;left:${layout.sideMargin}px;right:${layout.sideMargin}px;text-align:center}
  h1{color:${theme.text};font-size:72px;font-weight:700;line-height:1.08;letter-spacing:-0.5px;
     /* shrink-to-fit: long headlines step down instead of touching the frame edge */
     font-size:clamp(48px,72px,72px)}
  h1.long{font-size:60px}
  h1.longer{font-size:52px}
  p.sub{color:${theme.muted};font-size:42px;font-weight:400;margin-top:26px;line-height:1.25}
  .stage{position:absolute;top:${box.top}px;left:50px;width:${layout.stageWidth}px;height:${box.height}px;
         border-radius:34px;overflow:hidden;background:${theme.frame};border:2px solid ${theme.stroke}}
  .stage img{width:100%;height:100%;object-fit:fill;display:block}
  .tag{position:absolute;top:${layout.taglineTop}px;left:${layout.sideMargin}px;right:${layout.sideMargin}px;
       text-align:center;color:${theme.accent};font-size:50px;font-weight:650;line-height:1.15}
  .url{position:absolute;top:${layout.urlTop}px;left:0;right:0;text-align:center;color:${theme.url};font-size:32px}
  </style>
  <div class="head">
    <h1 class="${headline.length > 34 ? (headline.length > 46 ? 'longer' : 'long') : ''}">${esc(headline)}</h1>
    ${subhead ? `<p class="sub">${esc(subhead)}</p>` : ''}
  </div>
  <div class="stage">${stage}</div>
  <div class="tag">${esc(tagline)}</div>
  <div class="url">${esc(url)}</div>`;
}

// Mixes a background bed onto a finished silent video. Normalised to a target
// LUFS so "not too loud" is one number, not a guess — lower is quieter.
// Typical music sits near -14; -20 or below reads as background.
function attachAudio(videoPath, duration, cfg) {
  const bed = join(HERE, 'audio', cfg.file);
  if (!existsSync(bed)) throw new Error(`missing audio bed: ${bed}`);
  const tmp = videoPath.replace(/\.mp4$/, '.aud.mp4');
  const fade = Math.min(1.5, duration / 4);
  sh('ffmpeg', ['-y', '-loglevel', 'error',
    '-i', videoPath,
    '-stream_loop', '-1', '-i', bed,
    '-filter_complex',
    `[1:a]loudnorm=I=${cfg.lufs}:TP=-2:LRA=11,` +
    `afade=t=in:st=0:d=${fade},afade=t=out:st=${(duration - fade).toFixed(2)}:d=${fade}[a]`,
    '-map', '0:v', '-map', '[a]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k',
    '-t', String(duration), '-movflags', '+faststart', tmp]);
  sh('mv', [tmp, videoPath]);
}

function buildDump(v) {
  const n = v.shots.length;
  const per = (v.duration + (n - 1) * TRANSITION) / n;
  const frames = Math.round(per * 30);

  const slides = v.shots.map((shot, i) => {
    const src = join(SHOTS, `${shot}.png`);
    if (!existsSync(src)) throw new Error(`missing screenshot: ${src}`);
    const png = join(WORK, `${v.id}-${i}.png`);
    shoot(page({
      headline: v.headline,
      subhead: v.subhead,
      tagline: v.tagline,
      url: manifest.url,
      stage: `<img src="file://${src}">`,
      box: DUMP_STAGE,
    }), png);
    return png;
  });

  const args = ['-y', '-loglevel', 'error'];
  slides.forEach((s) => args.push('-loop', '1', '-i', s));

  const parts = slides.map((_, i) =>
    `[${i}:v]zoompan=z='min(zoom+0.00035,1.09)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'` +
    `:d=${frames}:s=${W}x${H}:fps=30,trim=duration=${per.toFixed(3)},setpts=PTS-STARTPTS,setsar=1[v${i}]`);

  let last = 'v0';
  for (let k = 1; k < n; k++) {
    const off = (k * (per - TRANSITION)).toFixed(3);
    const label = k === n - 1 ? 'out' : `x${k}`;
    parts.push(`[${last}][v${k}]xfade=transition=fade:duration=${TRANSITION}:offset=${off}[${label}]`);
    last = label;
  }
  const map = n === 1 ? '[v0]' : '[out]';

  args.push('-filter_complex', parts.join(';'), '-map', map, '-an',
    '-r', '30', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    join(OUT, `${v.id}.mp4`));
  sh('ffmpeg', args);
}

function buildDemo(v) {
  const src = join(DEMOS, v.source);
  if (!existsSync(src)) throw new Error(`missing recording: ${src}`);
  const card = join(WORK, `${v.id}-card.png`);
  shoot(page({
    headline: v.headline,
    subhead: v.subhead,
    tagline: v.tagline,
    url: manifest.url,
    stage: '',
    box: DEMO_STAGE,
  }), card);

  // The recording is cropped to the app area, scaled to the stage width, and
  // composited over the card's empty frame.
  sh('ffmpeg', ['-y', '-loglevel', 'error',
    '-stream_loop', '-1', '-i', src,
    '-loop', '1', '-i', card,
    '-t', String(v.duration), '-an',
    '-filter_complex',
    `[1:v]scale=${W}:${H}[card];` +
    `[0:v]crop=960:720:160:0,scale=${layout.stageWidth}:${DEMO_STAGE.height},setsar=1[app];` +
    `[card][app]overlay=50:${DEMO_STAGE.top}:shortest=1`,
    '-r', '30', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    join(OUT, `${v.id}.mp4`)]);
}

// A carousel is a folder of 1080x1920 PNGs, uploaded as a TikTok photo post or
// an Instagram carousel. Slide 1 is the hook and doubles as the cover, so it has
// to work as a still. Slide kinds: "hook", "item", "cta".
function carouselPage(slide, index, total) {
  const isHook = slide.kind === 'hook';
  const isCta = slide.kind === 'cta';
  const size = isHook ? 92 : isCta ? 78 : 76;
  const colour = isHook || isCta ? theme.accent : theme.text;
  return `<!doctype html><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${W}px;height:${H}px;background:${theme.bg};font-family:${theme.font};overflow:hidden}
  .wrap{position:absolute;top:340px;left:${layout.sideMargin}px;right:${layout.sideMargin}px;
        height:${H - 340 - 420}px;display:flex;flex-direction:column;justify-content:center;text-align:left}
  .n{position:absolute;top:220px;left:${layout.sideMargin}px;color:${theme.url};font-size:34px;letter-spacing:2px}
  h1{color:${colour};font-size:${size}px;font-weight:700;line-height:1.12;letter-spacing:-1px}
  p.sub{color:${theme.muted};font-size:44px;margin-top:34px;line-height:1.3}
  .swipe{position:absolute;top:${layout.urlTop}px;left:${layout.sideMargin}px;color:${theme.url};font-size:34px}
  .url{position:absolute;top:${layout.urlTop}px;left:0;right:0;text-align:center;color:${theme.url};font-size:34px}
  </style>
  <div class="n">${index + 1} / ${total}</div>
  <div class="wrap">
    <h1>${esc(slide.text)}</h1>
    ${slide.sub ? `<p class="sub">${esc(slide.sub)}</p>` : ''}
  </div>
  ${isCta ? `<div class="url">${esc(manifest.url)}</div>`
          : `<div class="swipe">swipe &rsaquo;</div>`}`;
}

function buildCarousel(v) {
  if (v.slides.length < 4) throw new Error(`TikTok requires at least 4 slides, got ${v.slides.length}`);
  if (v.slides.length > 35) throw new Error(`TikTok allows at most 35 slides, got ${v.slides.length}`);
  const dir = join(OUT, 'carousels', v.id);
  mkdirSync(dir, { recursive: true });
  v.slides.forEach((slide, i) => {
    const png = join(dir, `${String(i + 1).padStart(2, '0')}.png`);
    shoot(carouselPage(slide, i, v.slides.length), png);
    rmSync(png.replace(/\.png$/, '.html'), { force: true });
  });
  return dir;
}

const only = process.argv[2];
const queue = only ? manifest.videos.filter((v) => v.id === only) : manifest.videos;
if (!queue.length) {
  console.error(only ? `No video with id "${only}"` : 'Manifest declares no videos');
  process.exit(1);
}

mkdirSync(WORK, { recursive: true });
mkdirSync(OUT, { recursive: true });

let built = 0;
for (const v of queue) {
  process.stdout.write(`  ${v.id} (${v.type}${v.duration ? `, ${v.duration}s` : ''}) ... `);
  try {
    if (v.type === 'carousel') {
      const dir = buildCarousel(v);
      console.log(`ok  ${v.slides.length} slides  ${W}x${H}`);
      built++;
      continue;
    }
    if (v.type === 'dump') buildDump(v);
    else if (v.type === 'demo') buildDemo(v);
    else throw new Error(`unknown type "${v.type}"`);
    const out = join(OUT, `${v.id}.mp4`);
    const audio = v.audio === false ? null : (v.audio || manifest.audio);
    if (audio) attachAudio(out, v.duration, audio);
    const probe = sh('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height', '-show_entries', 'format=duration',
      '-of', 'csv=p=0', out]).toString().trim().split('\n');
    console.log(`ok  ${probe[0]}  ${Number(probe[1]).toFixed(1)}s`);
    built++;
  } catch (err) {
    console.log('FAILED');
    console.error(`    ${err.message.split('\n')[0]}`);
    process.exitCode = 1;
  }
}

rmSync(WORK, { recursive: true, force: true });
console.log(`\nBuilt ${built}/${queue.length} into ${manifest.output}/`);
if (manifest.audio) {
  console.log(`Audio bed: ${manifest.audio.file} at ${manifest.audio.lufs} LUFS ` +
    '(lower is quieter). Carousels are images and carry no audio — give those a ' +
    'sound in the app.');
}
