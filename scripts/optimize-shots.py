#!/usr/bin/env python3
"""
Build the responsive image set the website actually loads.

    python3 scripts/optimize-shots.py

Input   site/public/assets/shots/src/*.png   (2560x1600 captures, see
                                          apps/desktop/capture/README.md)
Output  site/public/assets/shots/<name>-<width>.{avif,webp,png}

Why three formats: AVIF is the smallest by a wide margin, WebP covers older
Safari, and one PNG per image is kept as the universal <img src> fallback so
the page still shows a screenshot even where <picture> sources all fail.

AVIF and WebP are emitted at every width; PNG only at FALLBACK_WIDTH. A
browser that supports neither modern format has not shipped since 2020, so
three widths of PNG would be ~2.4 MB in the repository serving nobody.

Why three widths: the demo panel is at most ~1120 CSS px wide, so 1600px
covers a 1.4x display, 1024 covers most laptops at 1x, and 640 covers phones.
Serving the raw 2560px capture to a phone would waste roughly 90% of the
bytes.

Requires `sips` (macOS built-in) plus `cwebp` and `avifenc`:

    brew install webp libavif

Missing encoders are reported and skipped rather than failing the run — the
PNG fallbacks alone still produce a working site.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "site/public/assets/shots/src"
OUT = ROOT / "site/public/assets/shots"

WIDTHS = (640, 1024, 1600)
FALLBACK_WIDTH = 1024  # the single width kept as PNG for <img src>

# Quality: these are dense UI screenshots with fine text, so they need more
# bits than a photograph would. Values chosen by inspecting text edges at 1x.
WEBP_Q = "82"
AVIF_Q = "30"  # avifenc: lower is better quality (0-63)


def have(tool: str) -> bool:
    return shutil.which(tool) is not None


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True, capture_output=True)


def main() -> None:
    if not have("sips"):
        sys.exit("error: `sips` not found (expected on macOS)")

    sources = sorted(SRC.glob("*.png"))
    if not sources:
        sys.exit(
            f"error: no captures in {SRC.relative_to(ROOT)}\n"
            "Run `cd apps/desktop && node capture/capture.mjs` first."
        )

    has_webp, has_avif = have("cwebp"), have("avifenc")
    if not has_webp:
        print("warning: `cwebp` missing — skipping WebP  (brew install webp)")
    if not has_avif:
        print("warning: `avifenc` missing — skipping AVIF (brew install libavif)")

    OUT.mkdir(parents=True, exist_ok=True)
    total_before = total_after = 0
    rows: list[tuple[str, int, dict[str, int]]] = []

    for src in sources:
        stem = src.stem
        total_before += src.stat().st_size

        for width in WIDTHS:
            # Always rasterise a PNG at this width — the modern encoders read
            # it as their input — but only keep it when it is the fallback.
            png = OUT / f"{stem}-{width}.png"
            run(["sips", "-Z", str(width), str(src), "--out", str(png)])
            sizes = {"png": png.stat().st_size}

            if has_webp:
                webp = OUT / f"{stem}-{width}.webp"
                run(["cwebp", "-quiet", "-q", WEBP_Q, str(png), "-o", str(webp)])
                sizes["webp"] = webp.stat().st_size

            if has_avif:
                avif = OUT / f"{stem}-{width}.avif"
                run(["avifenc", "--min", "0", "--max", AVIF_Q, "--speed", "4",
                     "--jobs", "all", str(png), str(avif)])
                sizes["avif"] = avif.stat().st_size

            if width != FALLBACK_WIDTH:
                png.unlink()
                del sizes["png"]

            # Count the format the page will actually serve to a modern
            # browser, best first.
            total_after += next(
                sizes[k] for k in ("avif", "webp", "png") if k in sizes
            )
            rows.append((stem, width, sizes))

    print(f"\n{'screen':<12} {'width':>6} {'png':>10} {'webp':>10} {'avif':>10}")
    print("-" * 52)
    for stem, width, sizes in rows:
        kb = lambda k: f"{sizes[k]/1024:,.0f} KB" if k in sizes else "-"
        print(f"{stem:<12} {width:>6} {kb('png'):>10} {kb('webp'):>10} {kb('avif'):>10}")

    print(
        f"\nsource {total_before/1024/1024:.1f} MB "
        f"-> preferred-format payload {total_after/1024:.0f} KB across "
        f"{len(sources)} screens x {len(WIDTHS)} widths"
    )


if __name__ == "__main__":
    main()
