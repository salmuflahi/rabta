#!/usr/bin/env python3
"""Build a browsable gallery of every candidate mark, with the SVG source
shown under each one so it can be copied straight out."""

import html
import re
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).parent
SRC = HERE / "cand"
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "site"

GROUPS = [
    ("knot-", "Knot", "A band tied in an actual knot. The most literal reading of <em>rabta</em>."),
    ("dogear-", "Fold as hero", "The fold itself as the whole mark, with no document around it."),
    ("b-", "Weave, loop, tab", "Woven, twisted and fastened variants."),
    ("mine-", "Ribbon-fold series", "Cream is the face of the band; tangerine is its reverse, seen where it turns."),
    ("zz-", "Current mark", "The outgoing logo, for comparison."),
]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "svg").mkdir(exist_ok=True)

    files = sorted(SRC.glob("*.svg"))
    for f in files:
        shutil.copy(f, OUT / "svg" / f.name)

    seen, sections = set(), []
    for prefix, title, blurb in GROUPS:
        group = [f for f in files if f.stem.startswith(prefix) and f not in seen]
        seen.update(group)
        if not group:
            continue
        cards = []
        for f in group:
            svg = f.read_text().strip()
            paths = re.findall(r'<path\b[^>]*\bd="([^"]+)"', svg)
            cards.append(f"""
      <figure class="card">
        <div class="big">{svg}</div>
        <div class="sizes">
          <span class="s48">{svg}</span><span class="s32">{svg}</span>
          <span class="s16">{svg}</span>
        </div>
        <figcaption>
          <b>{html.escape(f.stem)}</b>
          <span class="bytes">{len(svg)} bytes &middot; glyph {len(paths[0]) if paths else 0} ch</span>
          <a download href="svg/{f.name}">download .svg</a>
        </figcaption>
        <details><summary>SVG source</summary><pre>{html.escape(svg)}</pre></details>
      </figure>""")
        sections.append(
            f'<section><h2>{title} <span class="n">{len(group)}</span></h2>'
            f'<p class="blurb">{blurb}</p><div class="grid">{"".join(cards)}</div></section>')

    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rabta &mdash; candidate marks</title><style>
 *{{box-sizing:border-box;margin:0}}
 body{{background:#0b1516;color:#F3F0E8;
   font:15px/1.5 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;padding:32px}}
 h1{{font-size:20px;margin-bottom:6px}}
 .lede{{color:#8fa5a7;font-size:13.5px;max-width:62ch;margin-bottom:28px}}
 .lede code{{background:#16292b;padding:1px 5px;border-radius:4px;font-size:12.5px}}
 h2{{font-size:15px;margin:34px 0 2px;display:flex;align-items:center;gap:8px}}
 h2 .n{{font:11px ui-monospace,monospace;color:#63797b;background:#16292b;
   padding:2px 7px;border-radius:20px}}
 .blurb{{color:#7d9294;font-size:12.5px;margin-bottom:14px}}
 .grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px}}
 .card{{background:#111f21;border:1px solid #1c3133;border-radius:12px;padding:14px}}
 .big svg{{width:100%;height:auto;display:block;border-radius:12px}}
 .sizes{{display:flex;align-items:flex-end;gap:10px;margin:11px 0 9px;height:52px}}
 .sizes span{{display:block}}
 .s48 svg{{width:48px;height:48px}} .s32 svg{{width:32px;height:32px}}
 .s16 svg{{width:16px;height:16px}}
 figcaption{{display:flex;flex-direction:column;gap:3px}}
 figcaption b{{font:13px ui-monospace,monospace;word-break:break-all}}
 .bytes{{color:#63797b;font-size:11px}}
 figcaption a{{color:#FF6B2C;font-size:11.5px;text-decoration:none;width:max-content}}
 figcaption a:hover{{text-decoration:underline}}
 details{{margin-top:9px}}
 summary{{cursor:pointer;color:#8fa5a7;font-size:11.5px}}
 pre{{background:#0b1516;border:1px solid #1c3133;border-radius:8px;padding:9px;
   margin-top:7px;overflow-x:auto;font-size:10px;line-height:1.45;
   white-space:pre-wrap;word-break:break-all;color:#b9cbcc}}
</style></head><body>
<h1>Rabta &mdash; candidate marks</h1>
<p class="lede">Every candidate is in the exact format
<code>scripts/generate-brand-assets.py</code> parses: <code>viewBox 0 0 64 64</code>,
one <code>&lt;rect rx&gt;</code>, exactly two <code>&lt;path&gt;</code> (glyph then fold),
fills only. Palette unchanged. Expand <b>SVG source</b> on any card to copy the code,
or use the download link. Byte count matters &mdash; the glyph string is embedded in
all 27 derived assets.</p>
{''.join(sections)}
</body></html>"""

    (OUT / "index.html").write_text(page)
    print(f"{len(files)} marks -> {OUT/'index.html'}")


if __name__ == "__main__":
    main()
