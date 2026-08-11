#!/usr/bin/env python3
"""Install a candidate mark into the Rabta repo.

    python3 install.py cand/<slug>.svg [--repo /home/user/rabta]

Writes the canonical source (website/assets/brand/rabta-mark.svg) and patches
the ONE place the build pipeline cannot reach: the inline copy of the mark in
website/assets/brand/og-card.html, which the social card is rendered from.

Everything else -- 27 derived assets across the app bundle, both connectors,
the favicons and the .icns/.ico -- is regenerated on macOS by:

    python3 scripts/generate-brand-assets.py

This script deliberately does NOT run that: it needs `sips` and `iconutil`,
which are macOS-only.
"""

import argparse
import re
import sys
from pathlib import Path

INK, CREAM, TANGERINE = "#102526", "#F3F0E8", "#FF6B2C"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("candidate")
    ap.add_argument("--repo", default="/home/user/rabta")
    a = ap.parse_args()

    src = Path(a.candidate).resolve()
    repo = Path(a.repo).resolve()
    mark = repo / "website/assets/brand/rabta-mark.svg"
    card = repo / "website/assets/brand/og-card.html"

    if not src.exists():
        sys.exit(f"no such candidate: {src}")
    for p in (mark, card):
        if not p.exists():
            sys.exit(f"missing repo file: {p}")

    svg = src.read_text().strip()

    # --- validate against what generate-brand-assets.py demands -------------
    paths = re.findall(r'<path\b[^>]*\bd="([^"]+)"', svg)
    rx = re.search(r'<rect\b[^>]*\brx="([\d.]+)"', svg)
    problems = []
    if len(paths) != 2:
        problems.append(f"needs exactly 2 <path>, found {len(paths)}")
    if not rx:
        problems.append("needs a rounded <rect> tile with rx=")
    if "stroke" in svg:
        problems.append("contains stroke= (the pipeline drops strokes)")
    if 'viewBox="0 0 64 64"' not in svg:
        problems.append('needs viewBox="0 0 64 64"')
    if problems:
        sys.exit("candidate rejected:\n  " + "\n  ".join(problems))

    glyph, fold = paths

    # --- 1. the canonical source ------------------------------------------
    mark.write_text(svg + "\n")
    print(f"  wrote  {mark.relative_to(repo)}")

    # --- 2. the inline duplicate in the social card ------------------------
    old = card.read_text()
    new_inline = (
        f'<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">\n'
        f'        <rect width="64" height="64" rx="{rx.group(1)}" fill="{INK}"/>\n'
        f'        <path fill="{CREAM}" fill-rule="evenodd" d="{glyph}"/>\n'
        f'        <path fill="{TANGERINE}" d="{fold}"/>\n'
        f'      </svg>'
    )
    patched, count = re.subn(
        r'<svg viewBox="0 0 64 64".*?</svg>', new_inline, old,
        count=1, flags=re.DOTALL,
    )
    if count != 1:
        sys.exit(f"could not find the inline mark in {card.relative_to(repo)}")
    card.write_text(patched)
    print(f"  wrote  {card.relative_to(repo)}  (inline copy)")

    print("\nNext, on macOS:\n    python3 scripts/generate-brand-assets.py")
    print("…then rebuild/re-sign the .dmg and bump both connector versions.")


if __name__ == "__main__":
    main()
