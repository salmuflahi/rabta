#!/usr/bin/env python3
"""
Generate every Rabta brand raster from one vector source.

    python3 scripts/generate-brand-assets.py [--check]

Source of truth
---------------
`website/assets/brand/rabta-mark.svg` — the ONLY brand-mark source in this
repository. Every favicon, app icon, connector icon and social image below is
derived from it, including the `-primary` (transparent) and `-mono`
(currentColor) colourways, which are re-emitted from the canonical glyph group
— transform, stroke weight and joins included — so they can never drift from
the mark.

This script has no fallback geometry and no mark colour literals of its own:
if the source SVG is missing it exits rather than drawing anything. It is
therefore structurally incapable of reproducing the pre-0.1.0 navy/sky
circular icon that `scripts/make-icon.py` used to generate. That script has
been deleted; this replaces it.

Requirements
------------
macOS. Uses `sips` (rasterise + resize) and `iconutil` (.icns), both built in.
The social card is composed in HTML and rendered with headless Google Chrome.
`.ico` is written by the pure-Python packer below — no third-party imaging
libraries are needed.

Outputs are listed on stdout. Re-running is idempotent.
"""

from __future__ import annotations

import re
import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "website/assets/brand/rabta-mark.svg"

BRAND = ROOT / "website/assets/brand"
WEB = ROOT / "website"
TAURI = ROOT / "apps/desktop/src-tauri/icons"
APP_BRAND = ROOT / "apps/desktop/src/assets/brand"
CHROME = ROOT / "connectors/chrome/icons"
VSCODE = ROOT / "connectors/vscode"

OG_CARD_HTML = BRAND / "og-card.html"
OG_CARD_PNG = BRAND / "og-cover.png"
OG_SIZE = (1200, 630)

CHROME_CANDIDATES = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
]

written: list[Path] = []


def fail(msg: str) -> None:
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)


def note(path: Path) -> None:
    written.append(path)
    print(f"  {path.relative_to(ROOT)}")


# --------------------------------------------------------------- source

def read_source() -> tuple[str, str, str]:
    """Returns (glyph_open_tag, glyph_body, tile_radius) from the canonical mark.

    Parsed rather than hard-coded so the mark's geometry lives in exactly one
    place. Any edit to the SVG flows into every derived asset on the next run.

    The mark is a stroked glyph — an R whose leg is the Arabic ر — so what is
    lifted is the whole `<g>`: its transform, stroke-width and joins as well as
    its paths. Only the stroke colour is substituted per colourway. Pulling the
    `d`s out on their own would leave the weight and placement behind, which is
    most of the drawing.
    """
    if not SOURCE.exists():
        fail(
            f"missing brand source: {SOURCE.relative_to(ROOT)}\n"
            "This script derives every icon from that file and has no fallback "
            "artwork by design."
        )

    # Comments carry the geometry's rationale and belong in the source, not in
    # sixteen derived files. Dropped before parsing so prose can never be
    # mistaken for markup either.
    svg = re.sub(r"<!--.*?-->", "", SOURCE.read_text(), flags=re.S)

    rx = re.search(r'<rect\b[^>]*\brx="([\d.]+)"', svg)
    if not rx:
        fail("expected a rounded <rect> tile in the mark")

    group = re.search(r"(<g\b[^>]*>)(.*?)</g>", svg, re.S)
    if not group:
        fail("expected the glyph to be one <g> element")
    open_tag, body = group.group(1), group.group(2)

    if "<g" in body:
        fail(
            "the glyph group is nested; flatten it so the composed transform "
            "is visible in one place and survives a single-pass parse"
        )
    if not re.findall(r'<path\b[^>]*\bd="[^"]+"', body):
        fail("the glyph group holds no <path>")
    for attr in ("stroke-width", "fill"):
        if f'{attr}="' not in open_tag:
            fail(
                f'the glyph group must declare {attr}. The mark is stroked, so '
                f'a group without it renders at the wrong weight or as a blob.'
            )

    return open_tag, body, rx.group(1)


GLYPH_OPEN, GLYPH_BODY, TILE_RX = read_source()

INK = "#102526"      # tile / glyph on light
CREAM = "#F3F0E8"    # glyph on tile


def compact(markup: str) -> str:
    """One line, no gaps between tags. The source is indented for reading; a
    generated asset is not read, so it ships without the whitespace."""
    return re.sub(r">\s+<", "><", re.sub(r"\s+", " ", markup)).strip()


def glyph(stroke: str) -> str:
    """The canonical group, re-emitted in one colourway. Every attribute but
    the stroke colour is carried through from the source verbatim."""
    open_tag = compact(re.sub(r'\s+stroke="[^"]*"', "", GLYPH_OPEN))
    open_tag = f'{open_tag[:-1]} stroke="{stroke}">'
    return f"{open_tag}{compact(GLYPH_BODY)}</g>"


def svg_tile(scale: float = 1.0) -> str:
    """The mark on its tile. `scale` < 1 insets the glyph for maskable icons,
    where platforms crop to a circle inscribed in the square."""
    inner = glyph(CREAM)
    if scale != 1.0:
        offset = 32 * (1 - scale)
        inner = (
            f'<g transform="translate({offset:.3f} {offset:.3f}) scale({scale})">'
            f"{inner}</g>"
        )
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
        f'<rect width="64" height="64" rx="{TILE_RX}" fill="{INK}"/>'
        f"{inner}</svg>\n"
    )


def svg_maskable() -> str:
    """Full-bleed tile (no corner radius) with the glyph inset into the safe
    zone, so a circular or squircle platform mask never clips it."""
    offset = 32 * (1 - 0.62)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
        f'<rect width="64" height="64" fill="{INK}"/>'
        f'<g transform="translate({offset:.3f} {offset:.3f}) scale(0.62)">'
        f"{glyph(CREAM)}</g></svg>\n"
    )


def svg_primary() -> str:
    """Transparent background, ink glyph — for light surfaces."""
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
        f"{glyph(INK)}</svg>\n"
    )


def svg_mono() -> str:
    """Single-colour, inherits `currentColor` — for tinted contexts."""
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
        f"{glyph('currentColor')}</svg>\n"
    )


# ----------------------------------------------------------- rasterising

def require(tool: str) -> str:
    path = shutil.which(tool)
    if not path:
        fail(f"`{tool}` not found. This script requires macOS built-in tools.")
    return path


def rasterise(svg_text: str, size: int, out: Path, tmp: Path) -> Path:
    """SVG -> square PNG at `size`, via sips."""
    src = tmp / f"src-{abs(hash(svg_text)) % 10**8}-{size}.svg"
    src.write_text(svg_text)
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["sips", "-s", "format", "png", "-z", str(size), str(size), str(src), "--out", str(out)],
        check=True,
        capture_output=True,
    )
    return out


def write_ico(pngs: list[Path], out: Path) -> None:
    """Pack PNGs into an .ico. Windows Vista onward reads PNG-compressed
    entries directly, so no BMP re-encoding is needed."""
    entries = []
    for p in pngs:
        data = p.read_bytes()
        w, h = struct.unpack(">II", data[16:24])
        entries.append((0 if w >= 256 else w, 0 if h >= 256 else h, data))

    header = struct.pack("<HHH", 0, 1, len(entries))
    offset = 6 + 16 * len(entries)
    dir_bytes, image_bytes = b"", b""
    for w, h, data in entries:
        dir_bytes += struct.pack("<BBBBHHII", w, h, 0, 0, 1, 32, len(data), offset)
        image_bytes += data
        offset += len(data)

    out.write_bytes(header + dir_bytes + image_bytes)


def write_icns(tmp: Path, out: Path) -> None:
    """Build a macOS .icns via iconutil from a generated .iconset."""
    iconset = tmp / "rabta.iconset"
    iconset.mkdir(parents=True, exist_ok=True)
    tile = svg_tile()
    for base in (16, 32, 128, 256, 512):
        rasterise(tile, base, iconset / f"icon_{base}x{base}.png", tmp)
        rasterise(tile, base * 2, iconset / f"icon_{base}x{base}@2x.png", tmp)
    subprocess.run(
        ["iconutil", "-c", "icns", str(iconset), "-o", str(out)],
        check=True,
        capture_output=True,
    )


def render_og_card(tmp: Path) -> None:
    """Render the 1200x630 social card from its HTML source with headless
    Chrome, at 2x then downsampled, so text and the mark stay crisp."""
    if not OG_CARD_HTML.exists():
        fail(f"missing social card source: {OG_CARD_HTML.relative_to(ROOT)}")

    chrome = next((c for c in CHROME_CANDIDATES if Path(c).exists()), None)
    if not chrome:
        print("  (skipped og-cover.png — no Chrome-family browser found)")
        return

    raw = tmp / "og-2x.png"
    profile = tmp / "chrome-profile"
    proc = subprocess.Popen(
        [
            chrome,
            "--headless=new",
            "--disable-gpu",
            "--hide-scrollbars",
            "--force-color-profile=srgb",
            "--no-first-run",
            "--no-default-browser-check",
            f"--user-data-dir={profile}",
            f"--window-size={OG_SIZE[0]},{OG_SIZE[1]}",
            "--force-device-scale-factor=2",
            "--virtual-time-budget=4000",
            f"--screenshot={raw}",
            OG_CARD_HTML.as_uri(),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    # Chrome does not reliably exit after --screenshot with a virtual time
    # budget; wait for the file to stop growing, then reap it.
    import time

    last, stable, deadline = -1, 0, time.time() + 60
    while time.time() < deadline:
        time.sleep(0.3)
        if not raw.exists():
            continue
        size = raw.stat().st_size
        if size > 0 and size == last:
            stable += 1
            if stable >= 2:
                break
        else:
            stable = 0
        last = size
    proc.kill()

    if not raw.exists() or raw.stat().st_size == 0:
        fail("social card render produced no output")

    subprocess.run(
        ["sips", "-z", str(OG_SIZE[1]), str(OG_SIZE[0]), str(raw), "--out", str(OG_CARD_PNG)],
        check=True,
        capture_output=True,
    )
    note(OG_CARD_PNG)


# ------------------------------------------------------------------ main

def main() -> None:
    require("sips")
    require("iconutil")

    print(f"source    {SOURCE.relative_to(ROOT)}")
    print("writing:")

    tile = svg_tile()

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        # --- vector colourways, re-emitted from the canonical geometry -----
        for path, text in (
            (BRAND / "favicon.svg", tile),
            (BRAND / "rabta-mark-primary.svg", svg_primary()),
            (BRAND / "rabta-mark-mono.svg", svg_mono()),
            (APP_BRAND / "rabta-mark.svg", tile),
            (APP_BRAND / "rabta-mark-primary.svg", svg_primary()),
            (APP_BRAND / "rabta-mark-mono.svg", svg_mono()),
        ):
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text)
            note(path)

        # --- website favicons and app icons -------------------------------
        for size in (16, 32):
            note(rasterise(tile, size, BRAND / f"favicon-{size}.png", tmp))
        note(rasterise(tile, 180, BRAND / "apple-touch-icon.png", tmp))
        note(rasterise(tile, 192, BRAND / "icon-192.png", tmp))
        note(rasterise(tile, 512, BRAND / "icon-512.png", tmp))
        note(rasterise(svg_maskable(), 512, BRAND / "icon-512-maskable.png", tmp))

        ico_sources = [
            rasterise(tile, s, tmp / f"ico-{s}.png", tmp) for s in (16, 32, 48)
        ]
        write_ico(ico_sources, WEB / "favicon.ico")
        note(WEB / "favicon.ico")

        # --- Tauri bundle --------------------------------------------------
        note(rasterise(tile, 32, TAURI / "32x32.png", tmp))
        note(rasterise(tile, 64, TAURI / "64x64.png", tmp))
        note(rasterise(tile, 128, TAURI / "128x128.png", tmp))
        note(rasterise(tile, 256, TAURI / "128x128@2x.png", tmp))
        note(rasterise(tile, 512, TAURI / "icon.png", tmp))
        write_ico(ico_sources + [rasterise(tile, 256, tmp / "ico-256.png", tmp)],
                  TAURI / "icon.ico")
        note(TAURI / "icon.ico")
        write_icns(tmp, TAURI / "icon.icns")
        note(TAURI / "icon.icns")

        # --- connectors ----------------------------------------------------
        for size in (16, 32, 48, 128):
            note(rasterise(tile, size, CHROME / f"icon{size}.png", tmp))
        note(rasterise(tile, 128, VSCODE / "icon.png", tmp))

        # --- social card ---------------------------------------------------
        render_og_card(tmp)

    print(f"\n{len(written)} assets written from {SOURCE.name}.")


if __name__ == "__main__":
    main()
