#!/usr/bin/env python3
"""Geometry helpers for Rabta candidate marks.

THE FORMAT (enforced by scripts/generate-brand-assets.py in the repo):
  - viewBox "0 0 64 64"
  - exactly ONE <rect ... rx="14">        the tile
  - exactly TWO <path d="...">            [0] = glyph, [1] = fold
  - FILLS ONLY. Any stroke=  is silently dropped by the pipeline.
  - path[0] is rendered with fill-rule="evenodd"  -> overlapping subpaths CANCEL
    (that is how you cut holes: draw an inner subpath the same direction).
  - path[1] is rendered with DEFAULT nonzero fill -> overlapping subpaths MERGE.
    To cut a hole in path[1] you must reverse the winding (use *_ccw helpers).

THE BRAND IDEA these candidates are exploring:
  "rabta" is Arabic for a tie / bond / knot. The tangerine accent is called
  THE FOLD in the pipeline. So: the mark is a band that is cream on its face
  and tangerine on its reverse. Wherever the band folds or crosses over
  itself, you see the tangerine underside. The fold is not decoration --
  it is the evidence that the band is tied.

MONO CONSTRAINT: a mono colourway renders BOTH paths in one colour. The glyph
must therefore still read as a form when the fold is the same colour as the
face. Design the silhouette first; the fold adds meaning, never legibility.
"""

from __future__ import annotations

import math

INK, CREAM, TANGERINE = "#102526", "#F3F0E8", "#FF6B2C"
RX = 14


def n(v: float) -> str:
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def P(*pts) -> str:
    """Polygon through absolute points."""
    d = f"M{n(pts[0][0])} {n(pts[0][1])}"
    for x, y in pts[1:]:
        d += f"L{n(x)} {n(y)}"
    return d + "Z"


def circle(cx, cy, r, ccw=False):
    s = 0 if ccw else 1
    return (f"M{n(cx - r)} {n(cy)}a{n(r)} {n(r)} 0 1 {s} {n(2 * r)} 0"
            f"a{n(r)} {n(r)} 0 1 {s} {n(-2 * r)} 0Z")


def rrect(x, y, w, h, r, ccw=False, rot=0.0, cx=32.0, cy=32.0):
    """Rounded rect, optionally rotated about (cx, cy). Circular arcs, so only
    the endpoints move under rotation."""
    pts = [(x + r, y), (x + w - r, y), (x + w, y + r), (x + w, y + h - r),
           (x + w - r, y + h), (x + r, y + h), (x, y + h - r), (x, y + r)]
    if rot:
        pts = [rotate(p, rot, cx, cy) for p in pts]
    if ccw:
        pts = [pts[0]] + pts[:0:-1]
        sweep = 0
    else:
        sweep = 1
    d = f"M{n(pts[0][0])} {n(pts[0][1])}"
    for i in range(1, 8):
        px, py = pts[i]
        d += (f"L{n(px)} {n(py)}" if i % 2 == 1
              else f"A{n(r)} {n(r)} 0 0 {sweep} {n(px)} {n(py)}")
    p0 = pts[0]
    return d + f"A{n(r)} {n(r)} 0 0 {sweep} {n(p0[0])} {n(p0[1])}Z"


def rotate(p, deg, cx=32.0, cy=32.0):
    t = math.radians(deg)
    dx, dy = p[0] - cx, p[1] - cy
    return (cx + dx * math.cos(t) - dy * math.sin(t),
            cy + dx * math.sin(t) + dy * math.cos(t))


def at(cx, cy, r, deg):
    """Point on a circle. Degrees, y-down: 0=east, 90=south, 270=north."""
    t = math.radians(deg)
    return cx + r * math.cos(t), cy + r * math.sin(t)


def arc_band(cx, cy, r_in, r_out, a0, a1, ccw=False):
    """Annular sector between two radii, sweeping a0 -> a1 (degrees, y-down).
    Set ccw=True to reverse the winding for a nonzero-fill hole."""
    large = 1 if abs(a1 - a0) > 180 else 0
    o0, o1 = at(cx, cy, r_out, a0), at(cx, cy, r_out, a1)
    i0, i1 = at(cx, cy, r_in, a0), at(cx, cy, r_in, a1)
    if ccw:
        return (f"M{n(o0[0])} {n(o0[1])}L{n(i0[0])} {n(i0[1])}"
                f"A{n(r_in)} {n(r_in)} 0 {large} 1 {n(i1[0])} {n(i1[1])}"
                f"L{n(o1[0])} {n(o1[1])}A{n(r_out)} {n(r_out)} 0 {large} 0 "
                f"{n(o0[0])} {n(o0[1])}Z")
    return (f"M{n(o0[0])} {n(o0[1])}A{n(r_out)} {n(r_out)} 0 {large} 1 "
            f"{n(o1[0])} {n(o1[1])}L{n(i1[0])} {n(i1[1])}"
            f"A{n(r_in)} {n(r_in)} 0 {large} 0 {n(i0[0])} {n(i0[1])}Z")


def band(p0, p1, w, cap=0.0):
    """A straight band of width w from p0 to p1, as a quad. `cap` extends both
    ends along the axis (use it to bury a join under another shape)."""
    (x0, y0), (x1, y1) = p0, p1
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy) or 1.0
    ux, uy = dx / L, dy / L
    px, py = -uy * w / 2, ux * w / 2
    x0, y0 = x0 - ux * cap, y0 - uy * cap
    x1, y1 = x1 + ux * cap, y1 + uy * cap
    return P((x0 + px, y0 + py), (x1 + px, y1 + py),
             (x1 - px, y1 - py), (x0 - px, y0 - py))


def polyband(pts, w, round_caps=True, close=False):
    """A band of width w following a polyline, as ONE closed filled outline
    with mitred joints. This is how you draw a "line" in a stroke-free format.

    round_caps trims the polyline by w/2 at each end and adds a cap circle that
    only TOUCHES the band -- it must never overlap it, because path[0] is
    evenodd and an overlap would punch a hole instead of rounding the end.
    """
    pts = [tuple(map(float, p)) for p in pts]
    if close and pts[0] != pts[-1]:
        pts = pts + [pts[0]]

    def norm(a, b):
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dy) or 1.0
        return (-dy / L, dx / L)

    normals = [norm(pts[i], pts[i + 1]) for i in range(len(pts) - 1)]
    left, right = [], []
    for i, p in enumerate(pts):
        if i == 0:
            m, scale = normals[0], 1.0
        elif i == len(pts) - 1:
            m, scale = normals[-1], 1.0
        else:
            a, b = normals[i - 1], normals[i]
            mx, my = a[0] + b[0], a[1] + b[1]
            L = math.hypot(mx, my) or 1.0
            m = (mx / L, my / L)
            cosang = max(0.2, m[0] * a[0] + m[1] * a[1])
            scale = min(2.6, 1.0 / cosang)
        d = w / 2 * scale
        left.append((p[0] + m[0] * d, p[1] + m[1] * d))
        right.append((p[0] - m[0] * d, p[1] - m[1] * d))

    if not round_caps or close:
        return P(*left, *reversed(right))

    # Round caps must be ARCS INSIDE the outline. A separate cap circle would
    # overlap the band, and path[0] is evenodd -- the overlap would punch a
    # hole instead of rounding the end.
    r = w / 2
    d = f"M{n(left[0][0])} {n(left[0][1])}"
    for x, y in left[1:]:
        d += f"L{n(x)} {n(y)}"
    d += f"A{n(r)} {n(r)} 0 0 0 {n(right[-1][0])} {n(right[-1][1])}"
    for x, y in reversed(right[:-1]):
        d += f"L{n(x)} {n(y)}"
    d += f"A{n(r)} {n(r)} 0 0 0 {n(left[0][0])} {n(left[0][1])}Z"
    return d


def fold_tab(tip, a, b):
    """A triangular fold: the reverse of the band showing where it turns back."""
    return P(tip, a, b)


# ------------------------------------------------------------------ emit

def svg_tile(glyph, fold, scale=1.0):
    if scale == 1.0:
        inner = (f'<path fill="{CREAM}" fill-rule="evenodd" d="{glyph}"/>'
                 f'<path fill="{TANGERINE}" d="{fold}"/>')
    else:
        o = 32 * (1 - scale)
        inner = (f'<g transform="translate({o:.3f} {o:.3f}) scale({scale})">'
                 f'<path fill="{CREAM}" fill-rule="evenodd" d="{glyph}"/>'
                 f'<path fill="{TANGERINE}" d="{fold}"/></g>')
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
            f'<rect width="64" height="64" rx="{RX}" fill="{INK}"/>{inner}</svg>\n')


def svg_primary(glyph, fold):
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
            f'<path fill="{INK}" fill-rule="evenodd" d="{glyph}"/>'
            f'<path fill="{TANGERINE}" d="{fold}"/></svg>\n')


def svg_mono(glyph, fold):
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
            f'<path fill="currentColor" fill-rule="evenodd" d="{glyph}"/>'
            f'<path fill="currentColor" d="{fold}"/></svg>\n')


def write(path, glyph, fold):
    """Write the canonical tile SVG -- the exact file the repo pipeline eats."""
    import pathlib
    p = pathlib.Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(svg_tile(glyph, fold))
    return p
