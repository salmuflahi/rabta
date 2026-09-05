#!/usr/bin/env bash
# scripts/fonts/subset.sh — builds the self-hosted web-font subsets for rabta.build.
#
#   site/public/assets/fonts/reem-kufi-sub.woff2   Reem Kufi 2.000, variable wght 400–700:
#                                                  only the glyphs the Arabic name and the
#                                                  tagline in arabic-phrase.txt need.
#   site/public/assets/fonts/geist-mono-sub.woff2  Geist Mono 1.700, variable wght 100–900:
#                                                  printable ASCII plus a few typographic
#                                                  marks, for receipts, terminals, code, hashes.
#   site/public/assets/fonts/ReemKufi-OFL.txt      The licences, copied from the same pinned
#   site/public/assets/fonts/GeistMono-OFL.txt     sources as the fonts.
#
# Everything is pinned: the upstream commits, the SHA-256 of every download and the
# fontTools major version, so two runs on two machines produce the same bytes. A
# second run on the same machine downloads nothing (the cache is checked by hash,
# not by presence) and re-subsets to files identical to the committed ones.
#
# Usage:  bash scripts/fonts/subset.sh            # from anywhere; needs python3 + curl
#         PYTHON=python3.12 bash scripts/fonts/subset.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$ROOT/site/public/assets/fonts"
VENV="$HERE/.venv"
CACHE="$HERE/.cache"
PYTHON="${PYTHON:-python3}"

# ---- pins -------------------------------------------------------------------
# google/fonts, ofl/reemkufi/: the commit that carries Reem Kufi 2.000 (added in
# e3a7616, 2025-07-16) plus the corrected OFL body text that landed 17 minutes later.
GF_SHA=202ff088eec9af599257cae90fd71742dfd3c950
GF_RAW="https://raw.githubusercontent.com/google/fonts/$GF_SHA/ofl/reemkufi"
REEM_TTF_SHA256=33ead1986cd48c138c4d906c9e5a6341877268461f97623409a2014de1cd4aa4
REEM_OFL_SHA256=3e1dea8822e6e4008fe0ebd2f65f88579683cfee198c0089407fa197535dbe65

# vercel/geist-font release v1.7.2 (2026-06-01), fetched by the commit the tag
# pointed at when it was pinned, so a moved tag cannot change the bytes.
GEIST_TAG=v1.7.2
GEIST_SHA=a73329da8fc62afc917f796555202e4997f79b7c
GEIST_RAW="https://raw.githubusercontent.com/vercel/geist-font/$GEIST_SHA"
GEIST_TTF_SHA256=87c2aff9723544a9adaea19d92e42a33705c9723624801b6e0224c2206a6af0d
GEIST_OFL_SHA256=c683bfbcc7e087f5d37a54ef628f10387c451a83ddc459b151403a164ac46c90

# Size budgets, in KB of 1024 bytes.
REEM_MAX_BYTES=$((14 * 1024))
GEIST_MAX_BYTES=$((40 * 1024))

# Reem Kufi: the text file supplies the letters; these add space, the Arabic
# comma and the Arabic question mark.
REEM_UNICODES='U+0020,U+060C,U+061F'

# Geist Mono: printable ASCII, no-break space, middle dot, en and em dash, the
# curly quotes, ellipsis, right arrow, check mark, ballot X.
GEIST_UNICODES='U+0020-007E,U+00A0,U+00B7,U+2013,U+2014,U+2018-201D,U+2026,U+2192,U+2713,U+2717'
# Shaping essentials plus Geist Mono's coding ligatures (liga: ->, !=, :=, ...).
# Named explicitly rather than left to pyftsubset's default list, which is long
# and changes between fontTools releases. Features the font lacks are skipped.
# The figure features (frac, numr, dnom, sups, subs, sinf) and stylistic sets are
# left out on purpose: sixty-odd glyphs nothing on the site switches on.
GEIST_FEATURES='ccmp,calt,liga,locl,kern,mark,mkmk,rvrn'

REEM_SRC="$CACHE/google-fonts-$GF_SHA/ReemKufi[wght].ttf"
REEM_OFL="$CACHE/google-fonts-$GF_SHA/OFL.txt"
GEIST_SRC="$CACHE/geist-font-$GEIST_SHA/GeistMono[wght].ttf"
GEIST_OFL="$CACHE/geist-font-$GEIST_SHA/OFL.txt"

# ---- helpers ----------------------------------------------------------------
sha256() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d' ' -f1
  else sha256sum "$1" | cut -d' ' -f1; fi
}

# fetch URL DEST SHA256 — skip when DEST already has the expected hash; otherwise
# download to DEST.part, verify, then rename, so a torn download is never cached.
fetch() {
  local url=$1 dest=$2 want=$3 got
  if [ -f "$dest" ] && [ "$(sha256 "$dest")" = "$want" ]; then
    printf '  cached    %s\n' "${dest#"$CACHE"/}"
    return 0
  fi
  printf '  download  %s\n' "${dest#"$CACHE"/}"
  mkdir -p "$(dirname "$dest")"
  # --globoff: curl would otherwise read the [wght] in the file name as a range.
  curl --fail --location --silent --show-error --globoff --output "$dest.part" "$url"
  got=$(sha256 "$dest.part")
  if [ "$got" != "$want" ]; then
    rm -f "$dest.part"
    printf 'sha256 mismatch for %s\n  expected %s\n  got      %s\n' "$url" "$want" "$got" >&2
    exit 1
  fi
  mv "$dest.part" "$dest"
}

# ---- 1. toolchain -----------------------------------------------------------
echo "== toolchain"
if [ ! -x "$VENV/bin/pyftsubset" ]; then
  echo "  creating  ${VENV#"$ROOT"/}"
  "$PYTHON" -m venv "$VENV"
  "$VENV/bin/pip" install --quiet --disable-pip-version-check "fonttools[woff]==4.*" brotli
else
  echo "  venv ok   ${VENV#"$ROOT"/}"
fi
"$VENV/bin/python" -c 'import fontTools, brotli; print("  fonttools", fontTools.version)'

# ---- 2. sources -------------------------------------------------------------
echo "== sources"
fetch "$GF_RAW/ReemKufi%5Bwght%5D.ttf" "$REEM_SRC" "$REEM_TTF_SHA256"
fetch "$GF_RAW/OFL.txt"                "$REEM_OFL" "$REEM_OFL_SHA256"
fetch "$GEIST_RAW/fonts/GeistMono/variable/GeistMono%5Bwght%5D.ttf" "$GEIST_SRC" "$GEIST_TTF_SHA256"
fetch "$GEIST_RAW/OFL.txt"                                          "$GEIST_OFL" "$GEIST_OFL_SHA256"

# ---- 3. subsets -------------------------------------------------------------
echo "== subsets"
mkdir -p "$OUT"

# Reem Kufi: exactly the glyphs the name and the tagline need. --layout-features='*'
# keeps every shaping feature the font has (init/medi/fina/rlig/rclt/ccmp and the
# cv alternates in GSUB; mark/rclt in GPOS) so the letters still join, and the
# closure over those lookups is what pulls in the positional forms and the
# lam-alef ligature. The wght axis is kept, not instanced. --desubroutinize is a
# no-op on TrueType outlines and is passed for parity with the CFF case.
# --no-recalc-timestamp is pyftsubset's default, stated so the determinism is visible.
"$VENV/bin/pyftsubset" "$REEM_SRC" \
  --output-file="$OUT/reem-kufi-sub.woff2" \
  --text-file="$HERE/arabic-phrase.txt" \
  --unicodes="$REEM_UNICODES" \
  --layout-features='*' \
  --flavor=woff2 \
  --no-hinting \
  --desubroutinize \
  --no-recalc-timestamp
echo "  wrote     reem-kufi-sub.woff2"

# Geist Mono. --drop-tables+=meta drops the language-tag table, which pyftsubset
# cannot subset and would otherwise drop with a warning.
"$VENV/bin/pyftsubset" "$GEIST_SRC" \
  --output-file="$OUT/geist-mono-sub.woff2" \
  --unicodes="$GEIST_UNICODES" \
  --layout-features="$GEIST_FEATURES" \
  --drop-tables+=meta \
  --flavor=woff2 \
  --no-hinting \
  --desubroutinize \
  --no-recalc-timestamp
echo "  wrote     geist-mono-sub.woff2"

cp "$REEM_OFL"  "$OUT/ReemKufi-OFL.txt"
cp "$GEIST_OFL" "$OUT/GeistMono-OFL.txt"
echo "  copied    ReemKufi-OFL.txt GeistMono-OFL.txt"

# ---- 4. verify and report ---------------------------------------------------
# Fails the run if a file is over budget, lost its wght axis, lost a codepoint it
# was asked for, or (Reem Kufi) lost the init/medi/fina joining features.
echo "== verify"
"$VENV/bin/python" - "$OUT" "$HERE/arabic-phrase.txt" \
  "$REEM_MAX_BYTES" "$REEM_UNICODES" "$GEIST_MAX_BYTES" "$GEIST_UNICODES" <<'PY'
import os, sys
from collections import Counter
from fontTools.ttLib import TTFont

out, phrase_file, reem_max, reem_uni, geist_max, geist_uni = sys.argv[1:7]
failures = []

def parse_unicodes(spec):
    cps = set()
    for part in spec.split(","):
        lo, _, hi = part.strip().removeprefix("U+").partition("-")
        cps.update(range(int(lo, 16), int(hi or lo, 16) + 1))
    return cps

def unicode_range(cps):
    """Collapse codepoints into CSS unicode-range syntax."""
    cps, parts, i = sorted(cps), [], 0
    while i < len(cps):
        j = i
        while j + 1 < len(cps) and cps[j + 1] == cps[j] + 1:
            j += 1
        parts.append(f"U+{cps[i]:04X}" if i == j else f"U+{cps[i]:04X}-{cps[j]:04X}")
        i = j + 1
    return ", ".join(parts)

def features(font, table):
    if table not in font or font[table].table.FeatureList is None:
        return Counter()
    return Counter(r.FeatureTag for r in font[table].table.FeatureList.FeatureRecord)

def check(name, max_bytes, wanted, source_cmap, need_features=()):
    path = os.path.join(out, name)
    size = os.path.getsize(path)
    f = TTFont(path)
    axes = {a.axisTag: (a.minValue, a.defaultValue, a.maxValue) for a in f["fvar"].axes} if "fvar" in f else {}
    gsub, gpos, cmap = features(f, "GSUB"), features(f, "GPOS"), f.getBestCmap()
    if size > max_bytes:
        failures.append(f"{name}: {size} bytes is over the {max_bytes}-byte budget")
    if "wght" not in axes:
        failures.append(f"{name}: fvar has no wght axis (got {sorted(axes)})")
    for feat in need_features:
        if not gsub.get(feat):
            failures.append(f"{name}: GSUB feature {feat!r} missing")
    # Codepoints the source has but the subset lost are a bug; codepoints the
    # source never had are reported, not failed.
    lost = sorted(cp for cp in wanted if cp in source_cmap and cp not in cmap)
    absent = sorted(cp for cp in wanted if cp not in source_cmap)
    if lost:
        failures.append(f"{name}: lost {unicode_range(lost)}")
    return dict(name=name, size=size, max=max_bytes, glyphs=len(f.getGlyphOrder()),
                axes=axes, gsub=gsub, gpos=gpos, cmap=cmap, absent=absent)

with open(phrase_file, encoding="utf-8") as fh:
    reem_wanted = {ord(c) for c in fh.read() if c != "\n"} | parse_unicodes(reem_uni)
sources = {  # subset -> source, to tell "lost" from "never there"
    "reem-kufi-sub.woff2": os.environ["REEM_SRC"],
    "geist-mono-sub.woff2": os.environ["GEIST_SRC"],
}
src_cmaps = {k: TTFont(v).getBestCmap() for k, v in sources.items()}
rows = [
    check("reem-kufi-sub.woff2", int(reem_max), reem_wanted,
          src_cmaps["reem-kufi-sub.woff2"], need_features=("init", "medi", "fina")),
    check("geist-mono-sub.woff2", int(geist_max), parse_unicodes(geist_uni),
          src_cmaps["geist-mono-sub.woff2"]),
]

print(f"  {'file':<22} {'bytes':>7} {'budget':>7} {'glyphs':>6}  axes")
for r in rows:
    axes = " ".join(f"{t} {lo:g}-{hi:g} (default {d:g})" for t, (lo, d, hi) in r["axes"].items())
    print(f"  {r['name']:<22} {r['size']:>7} {r['max']:>7} {r['glyphs']:>6}  {axes}")
for r in rows:
    print(f"\n  {r['name']}")
    print(f"    codepoints:    {len(r['cmap'])}")
    print(f"    unicode-range: {unicode_range(r['cmap'])}")
    if r["absent"]:
        print(f"    not in source: {unicode_range(r['absent'])}")
    for tbl in ("gsub", "gpos"):
        feats = ", ".join(f"{k} x{v}" for k, v in sorted(r[tbl].items())) or "none"
        print(f"    {tbl.upper()} features: {feats}")
if failures:
    print("\n  FAILED\n  " + "\n  ".join(failures), file=sys.stderr)
    sys.exit(1)
print("\n  all checks passed")
PY

echo "== pins"
echo "  google/fonts     $GF_SHA  (ofl/reemkufi, Reem Kufi 2.000)"
echo "  vercel/geist-font $GEIST_TAG = $GEIST_SHA  (Geist Mono 1.700)"
