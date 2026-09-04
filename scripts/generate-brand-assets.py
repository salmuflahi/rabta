#!/usr/bin/env python3
"""
Generate every Rabta brand raster from the vector sources.

    python3 scripts/generate-brand-assets.py

Sources of truth
----------------
`website/assets/brand/mark.svg`        the glyph: an R whose leg is a ر,
                                       three strokes in currentColor.
`website/assets/brand/rabta-mark.svg`  the tile: the glyph, ink, on an
                                       ember squircle. Dock icon, favicon,
                                       social avatar.

Every favicon, app icon, connector icon and colourway below is derived from
those two files. The glyph's stroke geometry is parsed out of mark.svg, so an
edit to the mark flows into every derived asset on the next run; the tile is
used verbatim. There is no fallback artwork: if a source is missing this
script exits rather than drawing anything.

The lockup SVGs (glyph + "abta" as outlines) are produced by the font step in
the brand pipeline, not here — they need Inter's outlines, which live in the
font, not in this repository.

Requirements
------------
macOS. Uses `sips` (rasterise + resize) and `iconutil` (.icns), both built
in. The social card is composed in HTML and rendered with headless Google
Chrome. `.ico` is written by the pure-Python packer below.

Outputs are listed on stdout. Re-running is idempotent.
"""

from __future__ import annotations

import re
import shutil
import struct
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GLYPH_SOURCE = ROOT / "website/assets/brand/mark.svg"
TILE_SOURCE = ROOT / "website/assets/brand/rabta-mark.svg"

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

# The brand's two colours, as the spec names them. The only literals here.
EMBER = "#FF6B2C"
INK = "#0A0B0E"
PAPER = "#F5F5F7"

written: list[Path] = []


def fail(msg: str) -> None:
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)


def note(path: Path) -> None:
    written.append(path)
    print(f"  {path.relative_to(ROOT)}")


# --------------------------------------------------------------- sources

def read_glyph() -> tuple[str, list[str], str]:
    """Returns (group transform, [stem, bowl, leg] path data, stroke width)
    parsed from the canonical glyph."""
    if not GLYPH_SOURCE.exists():
        fail(f"missing brand source: {GLYPH_SOURCE.relative_to(ROOT)}")
    svg = GLYPH_SOURCE.read_text()
    paths = re.findall(r'<path\b[^>]*\bd="([^"]+)"', svg)
    if len(paths) != 3:
        fail(f"expected the glyph's 3 strokes in mark.svg, found {len(paths)}")
    transform = re.search(r'<g\b[^>]*\btransform="([^"]+)"', svg)
    width = re.search(r'\bstroke-width="([\d.]+)"', svg)
    if not transform or not width:
        fail("mark.svg must carry the glyph group's transform and stroke-width")
    return transform.group(1), paths, width.group(1)


def read_tile() -> str:
    if not TILE_SOURCE.exists():
        fail(f"missing brand source: {TILE_SOURCE.relative_to(ROOT)}")
    svg = TILE_SOURCE.read_text()
    if EMBER.lower() not in svg.lower():
        fail("rabta-mark.svg is not the ember tile")
    return svg


TRANSFORM, (STEM, BOWL, LEG), STROKE = read_glyph()
TILE = read_tile()


def glyph_group(main: str, leg: str, extra_transform: str = "") -> str:
    t = f"{extra_transform} {TRANSFORM}".strip()
    return (
        f'<g transform="{t}" fill="none" stroke-width="{STROKE}" stroke-linejoin="round">'
        f'<path stroke="{main}" d="{STEM}"/><path stroke="{main}" d="{BOWL}"/>'
        f'<path stroke="{leg}" d="{LEG}"/></g>'
    )


def svg_maskable() -> str:
    """Full-bleed ember square with the glyph inset into the safe zone, so a
    circular or squircle platform mask never clips it."""
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
        f'<rect width="100" height="100" fill="{EMBER}"/>'
        f'{glyph_group(INK, INK, "translate(50 50) scale(0.5) translate(-45.5 -43)")}'
        "</svg>\n"
    )


def svg_primary() -> str:
    """Transparent background, ink glyph with the ember leg — for paper."""
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
        f"{glyph_group(INK, EMBER)}</svg>\n"
    )


def svg_paper() -> str:
    """Transparent background, paper glyph with the ember leg — for ink."""
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
        f"{glyph_group(PAPER, EMBER)}</svg>\n"
    )


def svg_mono() -> str:
    """Single-colour, inherits `currentColor` — for tinted contexts."""
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
        f'{glyph_group("currentColor", "currentColor")}</svg>\n'
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
    for base in (16, 32, 128, 256, 512):
        rasterise(TILE, base, iconset / f"icon_{base}x{base}.png", tmp)
        rasterise(TILE, base * 2, iconset / f"icon_{base}x{base}@2x.png", tmp)
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

    print(f"sources   {GLYPH_SOURCE.relative_to(ROOT)}, {TILE_SOURCE.relative_to(ROOT)}")
    print("writing:")

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        # --- vector colourways, re-emitted from the canonical geometry -----
        for path, text in (
            (BRAND / "favicon.svg", TILE),
            (BRAND / "rabta-mark-primary.svg", svg_primary()),
            (BRAND / "rabta-mark-paper.svg", svg_paper()),
            (BRAND / "rabta-mark-mono.svg", svg_mono()),
            (APP_BRAND / "rabta-mark.svg", TILE),
            (APP_BRAND / "rabta-mark-primary.svg", svg_primary()),
            (APP_BRAND / "rabta-mark-mono.svg", svg_mono()),
        ):
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text)
            note(path)

        # --- website favicons and app icons -------------------------------
        for size in (16, 32):
            note(rasterise(TILE, size, BRAND / f"favicon-{size}.png", tmp))
        note(rasterise(TILE, 180, BRAND / "apple-touch-icon.png", tmp))
        note(rasterise(TILE, 192, BRAND / "icon-192.png", tmp))
        note(rasterise(TILE, 512, BRAND / "icon-512.png", tmp))
        note(rasterise(svg_maskable(), 512, BRAND / "icon-512-maskable.png", tmp))

        ico_sources = [
            rasterise(TILE, s, tmp / f"ico-{s}.png", tmp) for s in (16, 32, 48)
        ]
        write_ico(ico_sources, WEB / "favicon.ico")
        note(WEB / "favicon.ico")

        # --- Tauri bundle --------------------------------------------------
        note(rasterise(TILE, 32, TAURI / "32x32.png", tmp))
        note(rasterise(TILE, 64, TAURI / "64x64.png", tmp))
        note(rasterise(TILE, 128, TAURI / "128x128.png", tmp))
        note(rasterise(TILE, 256, TAURI / "128x128@2x.png", tmp))
        note(rasterise(TILE, 512, TAURI / "icon.png", tmp))
        write_ico(ico_sources + [rasterise(TILE, 256, tmp / "ico-256.png", tmp)],
                  TAURI / "icon.ico")
        note(TAURI / "icon.ico")
        write_icns(tmp, TAURI / "icon.icns")
        note(TAURI / "icon.icns")

        # --- connectors ----------------------------------------------------
        for size in (16, 32, 48, 128):
            note(rasterise(TILE, size, CHROME / f"icon{size}.png", tmp))
        note(rasterise(TILE, 128, VSCODE / "icon.png", tmp))

        # --- social card ---------------------------------------------------
        render_og_card(tmp)

    print(f"\n{len(written)} assets written.")


if __name__ == "__main__":
    main()
