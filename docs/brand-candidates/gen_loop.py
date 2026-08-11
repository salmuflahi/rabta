#!/usr/bin/env python3
"""Lens: THE CLOSED LOOP WITH A TWIST.

One continuous closed band. Cream face, tangerine reverse. The tangerine
appears only where the material actually turns.
"""
from __future__ import annotations

import math
import sys

sys.path.insert(0, "/home/user/rabta/docs/brand-candidates")
from lib import P, at, arc_band, write, n  # noqa: E402

OUT = "/home/user/rabta/docs/brand-candidates/cand"


# ---------------------------------------------------------------- helpers

def dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def line_inter(p, u, q, v):
    den = u[0] * v[1] - u[1] * v[0]
    if abs(den) < 1e-9:
        return None
    t = ((q[0] - p[0]) * v[1] - (q[1] - p[1]) * v[0]) / den
    return (p[0] + u[0] * t, p[1] + u[1] * t)


def sample_arc(cx, cy, r, a0, a1, step=4.0):
    k = max(2, int(abs(a1 - a0) / step) + 1)
    return [at(cx, cy, r, a0 + (a1 - a0) * i / (k - 1)) for i in range(k)]


def dedupe(pts, eps=1e-6):
    out = []
    for p in pts:
        if not out or dist(out[-1], p) > eps:
            out.append(p)
    if len(out) > 1 and dist(out[0], out[-1]) <= eps:
        out.pop()
    return out


def band_loop(pts, w, folds=()):
    """Closed band of width w whose CENTRELINE is the closed polygon `pts`.

    Vertices listed in `folds` are rendered as real flat FOLDS: the convex
    (outer) corner is chamfered along the crease, and the doubled triangle
    behind the crease is returned as fold geometry (the tangerine reverse).
    Everything else is a plain mitre.

    Returns (glyph_d, fold_d). glyph_d is two subpaths -> evenodd annulus.
    """
    m = len(pts)
    h = w / 2.0
    dirs = []
    for i in range(m):
        a, b = pts[i], pts[(i + 1) % m]
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dy) or 1.0
        dirs.append((dx / L, dy / L))

    A, B, tris = [], [], []
    for i in range(m):
        u1, u2 = dirs[i - 1], dirs[i]
        p = pts[i]
        nA1, nA2 = (-u1[1], u1[0]), (-u2[1], u2[0])
        a1 = (p[0] + nA1[0] * h, p[1] + nA1[1] * h)
        a2 = (p[0] + nA2[0] * h, p[1] + nA2[1] * h)
        b1 = (p[0] - nA1[0] * h, p[1] - nA1[1] * h)
        b2 = (p[0] - nA2[0] * h, p[1] - nA2[1] * h)
        vA = line_inter(a1, u1, a2, u2) or a1
        vB = line_inter(b1, u1, b2, u2) or b1
        if i in folds:
            if dist(vA, p) >= dist(vB, p):      # side A is the convex one
                E1 = line_inter(a1, u1, b2, u2)
                E2 = line_inter(b1, u1, a2, u2)
                A += [E1, E2]
                B.append(vB)
                tris.append((E1, E2, vB))
            else:
                E1 = line_inter(b1, u1, a2, u2)
                E2 = line_inter(a1, u1, b2, u2)
                B += [E1, E2]
                A.append(vA)
                tris.append((E1, E2, vA))
        else:
            A.append(vA)
            B.append(vB)
    return P(*A) + P(*B), "".join(P(*t) for t in tris)


def twist_ring(cx, cy, r_in, r_out, a_gap0, a_gap1):
    """Ring with a flat RIBBON TWIST filling the angular gap [a_gap0, a_gap1].

    The two edges of the band cross at the centreline: the piece before the
    crossing is the cream face, the piece after it is the tangerine reverse.
    """
    rm = (r_in + r_out) / 2
    am = (a_gap0 + a_gap1) / 2
    X = at(cx, cy, rm, am)
    O0, I0 = at(cx, cy, r_out, a_gap0), at(cx, cy, r_in, a_gap0)
    O1, I1 = at(cx, cy, r_out, a_gap1), at(cx, cy, r_in, a_gap1)
    ring = arc_band(cx, cy, r_in, r_out, a_gap1, a_gap0 + 360)
    face = P(O0, X, I0)
    return ring + face, P(X, O1, I1)


# ---------------------------------------------------------------- variants

def v_t1():
    """circular ring, ribbon twist at the bottom."""
    return twist_ring(32, 32, 16, 26, 68, 112)


def v_t2():
    """circular ring, ribbon twist upper-right at 45deg."""
    return twist_ring(32, 32, 16.5, 26.5, 292, 338)


def v_t3():
    """squarer loop, twist on the right flank."""
    g, f = twist_ring(32, 32, 16, 26, 340, 20)
    return g, f


def v_f1():
    """rounded-square frame, ONE folded corner (top-right)."""
    s, rc = 14.0, 8.0
    pts = []
    # corners: TL, TR(fold), BR, BL  (y-down)
    pts += sample_arc(32 - s + rc, 32 - s + rc, rc, 180, 270, 6)   # TL
    pts += [(32 + s, 32 - s)]                                      # TR sharp
    pts += sample_arc(32 + s - rc, 32 + s - rc, rc, 0, 90, 6)      # BR
    pts += sample_arc(32 - s + rc, 32 + s - rc, rc, 90, 180, 6)    # BL
    pts = dedupe(pts)
    fold_idx = {pts.index((32 + s, 32 - s))}
    return band_loop(pts, 9.5, fold_idx)


def v_l1():
    """limacon: one closed band that crosses itself once (a loop with an eye).
    evenodd punches a hole at the crossing -- the tangerine over-strap covers
    it exactly, which is the twist."""
    A, B = 6.5, 15.5
    cx, cy = 30.0, 30.0
    pts = []
    for i in range(120):
        th = 2 * math.pi * i / 120
        r = A + B * math.cos(th)
        pts.append((cx + r * math.cos(th), cy + r * math.sin(th)))
    g, _ = band_loop(pts, 8.5)
    # crossing sits at (cx, cy); over-strap = short band across it
    w = 8.5
    d = 7.0
    strap = P((cx - d, cy - w / 2), (cx + d, cy - w / 2),
              (cx + d, cy + w / 2), (cx - d, cy + w / 2))
    return g, strap


def v_c1():
    """teardrop / cusp loop: round loop cinched to a folded point."""
    cx, cy, r = 32.0, 27.5, 15.0
    a0, a1 = 40.0, 140.0
    pts = sample_arc(cx, cy, r, a1, a0 + 360, 5)
    tip = (32.0, 55.0)
    pts = dedupe(pts + [tip])
    return band_loop(pts, 9.5, {len(pts) - 1})


# ------------------------------------------------------------- batch 2

def twist_ring2(cx, cy, r_in, r_out, a0, a1, lead=0.0):
    """Ribbon twist filling gap a0->a1 (a1 > a0). `lead` slides the crossing
    point along the gap (0 = centre)."""
    rm = (r_in + r_out) / 2
    am = a0 + (a1 - a0) * (0.5 + lead)
    X = at(cx, cy, rm, am)
    O0, I0 = at(cx, cy, r_out, a0), at(cx, cy, r_in, a0)
    O1, I1 = at(cx, cy, r_out, a1), at(cx, cy, r_in, a1)
    ring = arc_band(cx, cy, r_in, r_out, a1, a0 + 360)
    return ring + P(O0, X, I0), P(X, O1, I1)


def v_t1b():
    """fat ring, twist at the bottom, wide twist zone."""
    return twist_ring2(32, 32, 15.5, 26.5, 62, 118)


def v_t2b():
    """twist at lower-right (35 deg)."""
    return twist_ring2(32, 32, 15.5, 26.5, 10, 62)


def v_t5():
    """twist AND back: the band turns over and returns -> tangerine lozenge."""
    cx, cy, r_in, r_out = 32, 32, 15.5, 26.5
    a0, a1 = 56, 124
    rm = (r_in + r_out) / 2
    X0, X1 = at(cx, cy, rm, a0 + 17), at(cx, cy, rm, a1 - 17)
    O0, I0 = at(cx, cy, r_out, a0), at(cx, cy, r_in, a0)
    O1, I1 = at(cx, cy, r_out, a1), at(cx, cy, r_in, a1)
    Om, Im = at(cx, cy, r_out, (a0 + a1) / 2), at(cx, cy, r_in, (a0 + a1) / 2)
    ring = arc_band(cx, cy, r_in, r_out, a1, a0 + 360)
    return ring + P(O0, X0, I0) + P(O1, X1, I1), P(X0, Om, X1, Im)


def v_f2():
    """square loop, folded corner, tighter radii + heavier band."""
    s, rc = 14.5, 7.0
    pts = sample_arc(32 - s + rc, 32 - s + rc, rc, 180, 270, 6)
    pts += [(32 + s, 32 - s)]
    pts += sample_arc(32 + s - rc, 32 + s - rc, rc, 0, 90, 6)
    pts += sample_arc(32 - s + rc, 32 + s - rc, rc, 90, 180, 6)
    pts = dedupe(pts)
    return band_loop(pts, 10.0, {pts.index((32 + s, 32 - s))})


def v_f3():
    """round loop with ONE hard fold: a pleat/step in the top edge."""
    s, rc = 14.0, 9.0
    x1, e = 30.0, 5.0
    pts = sample_arc(32 - s + rc, 32 - s + rc, rc, 180, 270, 6)
    a = (x1, 32 - s)
    b = (x1, 32 - s - e)
    pts += [a, b]
    pts += sample_arc(32 + s - rc, 32 - s - e + rc, rc, 270, 360, 6)
    pts += sample_arc(32 + s - rc, 32 + s - rc, rc, 0, 90, 6)
    pts += sample_arc(32 - s + rc, 32 + s - rc, rc, 90, 180, 6)
    pts = dedupe(pts)
    return band_loop(pts, 9.5, {pts.index(a), pts.index(b)})


def v_f4():
    """circular loop with a single sharp folded beak at lower-right."""
    cx, cy, r = 32.0, 30.0, 15.5
    am, half = 45.0, 46.0
    a0, a1 = am - half, am + half
    tipr = r / math.cos(math.radians(half))
    tip = at(cx, cy, tipr, am)
    pts = dedupe(sample_arc(cx, cy, r, a1, a0 + 360, 5) + [tip])
    return band_loop(pts, 9.5, {len(pts) - 1})


def v_f5():
    """as f4 but the beak points up-right and the loop is bigger."""
    cx, cy, r = 30.0, 33.0, 15.0
    am, half = 315.0, 48.0
    a0, a1 = am - half, am + half
    tipr = r / math.cos(math.radians(half))
    tip = at(cx, cy, tipr, am)
    pts = dedupe(sample_arc(cx, cy, r, a1, a0 + 360, 5) + [tip])
    return band_loop(pts, 9.5, {len(pts) - 1})


def v_l2():
    """limacon, tighter: small eye, short tangerine over-strap."""
    A, B = 7.5, 13.5
    cx, cy = 31.0, 30.0
    pts = [(cx + (A + B * math.cos(t)) * math.cos(t),
            cy + (A + B * math.cos(t)) * math.sin(t))
           for t in [2 * math.pi * i / 160 for i in range(160)]]
    g, _ = band_loop(pts, 8.0)
    w, d = 8.0, 5.0
    return g, P((cx - d, cy - w / 2), (cx + d, cy - w / 2),
                (cx + d, cy + w / 2), (cx - d, cy + w / 2))


# ------------------------------------------------------------- batch 3

def twist(cx, cy, r_in, r_out, am, gap, over=0.0, step=3.0):
    """CLOSED ring whose band makes one flat ribbon twist centred on angle `am`.

    The two edges of the band cross on the centreline: everything before the
    crossing is the cream face, everything after it is the tangerine reverse.
    `over` (degrees) runs each wedge PAST the crossing so the waist is never
    zero width -- otherwise the ring snaps at 16px.
    """
    a0, a1 = am - gap / 2, am + gap / 2
    rm = (r_in + r_out) / 2
    ring = arc_band(cx, cy, r_in, r_out, a1, a0 + 360)
    O0, I0 = at(cx, cy, r_out, a0), at(cx, cy, r_in, a0)
    O1, I1 = at(cx, cy, r_out, a1), at(cx, cy, r_in, a1)
    # wedges follow the arc, so build them as curved-back triangles
    def wedge(aa, ab, Po, Pi):
        k = max(2, int(abs(ab - aa) / step) + 1)
        outer = [at(cx, cy, r_out - (r_out - rm) * i / (k - 1),
                    aa + (ab - aa) * i / (k - 1)) for i in range(k)]
        inner = [at(cx, cy, r_in + (rm - r_in) * i / (k - 1),
                    aa + (ab - aa) * i / (k - 1)) for i in range(k)]
        return P(*outer, *reversed(inner))
    face = wedge(a0, am + over, O0, I0)
    rev = wedge(a1, am - over, O1, I1)
    return ring + face, rev


def mk_twist(am, gap, over, w=10.5, rm=21.0):
    return lambda: twist(32, 32, rm - w / 2, rm + w / 2, am, gap, over)


def sq_fold(s=14.5, rc=8.0, w=10.0, corner="TR", rot=0.0):
    """Rounded-square closed band with ONE folded corner."""
    cs = {"TL": (-1, -1), "TR": (1, -1), "BR": (1, 1), "BL": (-1, 1)}
    order = ["TL", "TR", "BR", "BL"]
    arcs = {"TL": (180, 270), "TR": (270, 360), "BR": (0, 90), "BL": (90, 180)}
    pts, sharp = [], None
    for c in order:
        sx, sy = cs[c]
        if c == corner:
            sharp = (32 + sx * s, 32 + sy * s)
            pts.append(sharp)
        else:
            a0, a1 = arcs[c]
            pts += sample_arc(32 + sx * (s - rc), 32 + sy * (s - rc), rc,
                              a0, a1, 6)
    pts = dedupe(pts)
    if rot:
        from lib import rotate
        pts = [rotate(p, rot) for p in pts]
        sharp = rotate(sharp, rot)
    idx = min(range(len(pts)), key=lambda i: dist(pts[i], sharp))
    return band_loop(pts, w, {idx})


VARIANTS = {
    "loop-t6": mk_twist(90, 44, 7),
    "loop-t7": mk_twist(90, 44, 12),
    "loop-t8": mk_twist(45, 48, 10),
    "loop-t9": mk_twist(315, 48, 10),
    "loop-f6": lambda: sq_fold(14.5, 8.5, 10.0, "TR"),
    "loop-f7": lambda: sq_fold(15.0, 10.0, 10.5, "TR"),
    "loop-f8": lambda: sq_fold(14.5, 8.5, 10.0, "BR"),
    "loop-f9": lambda: sq_fold(14.0, 7.0, 9.5, "TR", rot=45),
    "loop-t1b": v_t1b,
    "loop-f2": v_f2,
    "loop-f5": v_f5,
}

_OLD = {
    "loop-t1": v_t1,
    "loop-t2": v_t2,
    "loop-f1": v_f1,
    "loop-t1b": v_t1b,
    "loop-t2b": v_t2b,
    "loop-t5": v_t5,
    "loop-f2": v_f2,
    "loop-f3": v_f3,
    "loop-f4": v_f4,
    "loop-f5": v_f5,
    "loop-l2": v_l2,
}

if __name__ == "__main__":
    for name, fn in VARIANTS.items():
        g, f = fn()
        write(f"{OUT}/{name}.svg", g, f)
        print("wrote", name)
