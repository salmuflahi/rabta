#!/usr/bin/env python3
"""Render candidate SVGs to a PNG contact strip you can actually look at.

    python3 preview.py out.png a.svg b.svg ...
    python3 preview.py out.png            # every *.svg in this directory

Each row shows: 112px tile, 48, 32, 16 (the real favicon size), the maskable
62% inset crop, the light-surface colourway, and the MONO colourway where the
fold and the face collapse to one colour. A mark that only works in full
colour is not finished.
"""

import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
INK, CREAM, TANGERINE = "#102526", "#F3F0E8", "#FF6B2C"


def parse(svg_text):
    """Pull (glyph_d, fold_d, rx) out of a candidate. Also the format check."""
    paths = re.findall(r'<path\b[^>]*\bd="([^"]+)"', svg_text)
    rx = re.search(r'<rect\b[^>]*\brx="([\d.]+)"', svg_text)
    problems = []
    if len(paths) != 2:
        problems.append(f"expected 2 <path>, found {len(paths)}")
    if not rx:
        problems.append("missing rounded <rect> tile")
    if "stroke" in svg_text:
        problems.append("contains stroke= (the pipeline drops strokes)")
    if 'viewBox="0 0 64 64"' not in svg_text:
        problems.append("viewBox must be 0 0 64 64")
    return (paths + ["", ""])[:2], (rx.group(1) if rx else "14"), problems


def tile(g, f, rxv, scale=1.0, mono=None, bare=False):
    face = mono or CREAM
    fold = mono or TANGERINE
    inner = (f'<path fill="{face}" fill-rule="evenodd" d="{g}"/>'
             f'<path fill="{fold}" d="{f}"/>')
    if scale != 1.0:
        o = 32 * (1 - scale)
        inner = (f'<g transform="translate({o:.3f} {o:.3f}) scale({scale})">'
                 f'{inner}</g>')
    rect = (f'<rect width="64" height="64" fill="{INK}"/>' if bare
            else f'<rect width="64" height="64" rx="{rxv}" fill="{INK}"/>')
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
            f'{rect}{inner}</svg>')


def light(g, f):
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
            f'<path fill="{INK}" fill-rule="evenodd" d="{g}"/>'
            f'<path fill="{TANGERINE}" d="{f}"/></svg>')


def main():
    out = (Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "preview.png").resolve()
    files = [Path(a).resolve() for a in sys.argv[2:]] or sorted(HERE.glob("*.svg"))
    if not files:
        sys.exit("no svg files given or found")

    rows, report = [], []
    for fp in files:
        (g, f), rxv, problems = parse(fp.read_text())
        report.append((fp.name, problems))
        warn = (f'<div class="warn">{"; ".join(problems)}</div>'
                if problems else "")
        rows.append(f"""
        <div class="row">
          <div class="name"><b>{fp.stem}</b>{warn}</div>
          <div class="c"><div class="s112">{tile(g, f, rxv)}</div></div>
          <div class="c"><div class="s48">{tile(g, f, rxv)}</div></div>
          <div class="c"><div class="s32">{tile(g, f, rxv)}</div></div>
          <div class="c"><div class="s16">{tile(g, f, rxv)}</div></div>
          <div class="c"><div class="s48 mask">{tile(g, f, rxv, 0.62, bare=True)}</div></div>
          <div class="c"><div class="s48 lt">{light(g, f)}</div></div>
          <div class="c"><div class="s48">{tile(g, f, rxv, mono=CREAM)}</div></div>
          <div class="c"><div class="s16">{tile(g, f, rxv, mono=CREAM)}</div></div>
        </div>""")

    html = f"""<!doctype html><meta charset="utf-8"><style>
    *{{box-sizing:border-box;margin:0}}
    body{{background:#0b1516;color:#F3F0E8;
         font:13px/1.35 -apple-system,system-ui,sans-serif;padding:24px 26px}}
    h1{{font-size:14px;font-weight:600;margin-bottom:3px}}
    p.sub{{color:#7d9294;font-size:11.5px;margin-bottom:16px}}
    .head,.row{{display:grid;
      grid-template-columns:150px 128px 66px 52px 40px 66px 66px 66px 40px;
      align-items:center}}
    .head{{color:#63797b;font-size:9.5px;text-transform:uppercase;
      letter-spacing:.08em;padding-bottom:7px;border-bottom:1px solid #1e3335}}
    .head div{{text-align:center}} .head div:first-child{{text-align:left}}
    .row{{padding:14px 0;border-bottom:1px solid #16292b}}
    .name{{padding-left:4px;padding-right:8px}}
    .name b{{font-size:13.5px;font-weight:600;
      font-family:ui-monospace,monospace;word-break:break-all}}
    .warn{{color:#ff8a5c;font-size:10px;margin-top:4px}}
    .c{{display:flex;justify-content:center}}
    svg{{display:block;width:100%;height:100%}}
    .s112{{width:112px;height:112px}} .s48{{width:48px;height:48px}}
    .s32{{width:32px;height:32px}} .s16{{width:16px;height:16px}}
    .mask{{border-radius:50%;overflow:hidden}}
    .lt{{background:#F3F0E8;border-radius:9px;padding:6px}}
  </style>
  <h1>Rabta &mdash; candidate marks</h1>
  <p class="sub">ink #102526 &middot; cream #F3F0E8 &middot; tangerine #FF6B2C &nbsp;|&nbsp;
  MASK = 62% inset under a circular platform crop &nbsp;|&nbsp;
  MONO = fold and face collapsed to one colour</p>
  <div class="head"><div>Candidate</div><div>App icon</div><div>48</div><div>32</div>
  <div>16</div><div>Mask</div><div>On light</div><div>Mono</div><div>Mono 16</div></div>
  {''.join(rows)}"""

    page = out.with_suffix(".html")
    page.write_text(html)
    height = 250 + 145 * len(files)
    subprocess.run([CHROME, "--headless", "--no-sandbox", "--disable-gpu",
                    "--hide-scrollbars", "--force-color-profile=srgb",
                    f"--window-size=760,{height}", "--force-device-scale-factor=2",
                    f"--screenshot={out}", "--virtual-time-budget=3000",
                    page.as_uri()],
                   check=True, capture_output=True)

    for name, problems in report:
        print(f"{'FAIL' if problems else 'ok  '}  {name}"
              + (f"   {'; '.join(problems)}" if problems else ""))
    print(f"\nwrote {out}")


if __name__ == "__main__":
    main()
