#!/usr/bin/env python3
"""WEAVE lens -- two bands crossing over and under each other.

Rule used throughout: at every crossing exactly ONE strand is continuous and
the other is BROKEN (a gap of `g`). The broken strand is the one passing
underneath, and the last `t` units before it disappears are tangerine -- the
reverse of the band, seen because the material turns there. That is the only
place tangerine appears. The gap is what makes the weave survive MONO, where
the fold and the face are the same colour.
"""
import sys, pathlib
HERE = pathlib.Path("/home/user/rabta/docs/brand-candidates")
sys.path.insert(0, str(HERE))
from lib import P, write, rotate

OUT = HERE / "svg" / "cand"


def sym(pts, order, base=0.0):
    """Repeat a subpath under `order`-fold rotation, whole thing turned `base`."""
    step = 360.0 / order
    return "".join(P(*[rotate(p, base + step * k) for p in pts])
                   for k in range(order))


# ------------------------------------------------------------------- MAT
def mat(O=10, w=10, g=4.5, t=7, base=0.0, crease="cut", rake=0.55):
    """Four straps plaited into a square mat. Each strap runs OVER its
    neighbour at one end (it reaches the outer corner) and UNDER at the other
    (it stops short, and turns tangerine as it goes)."""
    I, F = O + w, 64 - O
    J = F - w
    G = J - g                      # where the under-going end stops
    strap = [(O, O), (G, O), (G, I), (O, I)]
    if crease == "cut":            # square crease, perpendicular to the strap
        fold = [(G - t, O), (G, O), (G, I), (G - t, I)]
    elif crease == "bevel":        # crease raked across the strap
        fold = [(G - t, O), (G, O), (G, I), (G - t - w * rake, I)]
    else:                          # full triangular fold
        fold = [(G - w, I), (G, O), (G, I)]
    return sym(strap, 4, base), sym(fold, 4, base)


# ------------------------------------------------------------------- LOZ
def loz(O=12, w=10.5, g=5, t=7.5, base=45.0, crease="cut", rake=0.55):
    """Two L-straps woven into a closed square: strap A is top+right, strap B
    (A turned 180) is bottom+left. A runs over B at one corner, under it at
    the other. Set base=45 and the square stands on its point -- a lashing,
    not a frame."""
    I, F = O + w, 64 - O
    J = F - w
    G = J - g
    strap = [(O, O), (F, O), (F, G), (J, G), (J, I), (O, I)]
    if crease == "cut":
        fold = [(J, G - t), (F, G - t), (F, G), (J, G)]
    elif crease == "bevel":
        fold = [(J, G - t - w * rake), (F, G - t), (F, G), (J, G)]
    else:
        fold = [(J, G - w), (F, G), (J, G)]
    return sym(strap, 2, base), sym(fold, 2, base)


if __name__ == "__main__":
    cands = {
        # ---------------------------- FINAL TWO ----------------------------
        "weave-mat": mat(O=10, w=10, g=4.5, t=6, crease="bevel", rake=.45),
        "weave-lozenge": loz(O=13, w=11, g=5, t=6.5, crease="bevel", rake=.45),
    }
    for k, (g, f) in cands.items():
        write(OUT / f"{k}.svg", g, f)
        print("wrote", k)
