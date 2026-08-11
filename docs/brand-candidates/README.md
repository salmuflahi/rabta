# Candidate brand marks

Exploration for replacing the Rabta mark. The name and the palette are
unchanged; only the glyph is in question.

## The idea being explored

*Rabta* is Arabic for a **tie** — a bond, a knot. And the accent path in the
build pipeline is already called `FOLD_D`. So these candidates treat the two
as one idea:

> **Cream is the face of the band. Tangerine is its reverse, seen wherever
> the band turns over.**

Because `path[1]` is painted after `path[0]`, tangerine sits on top and reads
as the strand passing *over*, using only the two paths the pipeline allows.
Where a band passes *under*, the cream is gapped — so in the mono colourway
the gaps fill in and the mark recombines into one continuous, unbroken knot.
The fold does structural work rather than decorating.

## Browsing them

Open `index.html` in a browser. Every card shows the mark at app-icon, 48, 32
and 16px, with its SVG source expandable underneath and a download link.

## The format every candidate obeys

`scripts/generate-brand-assets.py` derives all 27 assets from one file and
parses it strictly:

- `viewBox="0 0 64 64"`
- exactly one `<rect ... rx="14">`
- exactly two `<path d="...">` — `[0]` the glyph, `[1]` the fold
- **fills only** — any `stroke=` is silently dropped by the pipeline
- `path[0]` renders `fill-rule="evenodd"`, so overlapping subpaths *cancel*;
  `path[1]` renders nonzero, so they *merge*

## Tooling

| file | what it does |
|---|---|
| `lib.py` | geometry helpers — bands along paths, annular sectors, rounded rects, winding-correct holes |
| `preview.py` | renders any set of candidates to a PNG contact strip (16px, circular mask, on-light, mono) and validates the format |
| `gallery.py` | rebuilds `index.html` from `svg/` |
| `install.py` | installs a chosen candidate: writes the canonical mark **and** patches the inline duplicate in `og-card.html` |

## Adopting one

```sh
python3 docs/brand-candidates/install.py docs/brand-candidates/svg/<name>.svg
python3 scripts/generate-brand-assets.py     # macOS only: needs sips + iconutil
```

Then rebuild and re-sign the `.dmg`, and bump both connector versions — an
icon change means a new Chrome Web Store submission and a new `.vsix`.

## Rejected, and why

- **`b-weave`** — reads as the Slack logo. Not usable.
- **`dogear-pleat` / `-tuck` / `-lock`** — resolve into the letterforms N, P
  and b; they read as another product's initial.
- **`dogear-leaf`** — the fold swallowed the whole glyph.
- A calligraphic pass abstracted from Arabic letterforms produced a smiley
  face; it is not included.

## Front-runner

`svg/knot-trefoil-v2.svg` — a true trefoil knot. Tangerine sits at the three
crossings, exactly where the band turns over. It survives 16px, and the mono
colourway recombines into one continuous unbroken knot. Needs path
simplification before shipping: the glyph is a sampled polyline, and that
string is embedded in all 27 derived assets.

Runners-up: `dogear-clasp.svg` (342 bytes, straight lines only),
`mine-turn.svg` (333 bytes, real arcs), `mine-tre-g.svg` (heavier knot,
fold reduced to a single crossing).

Marks suffixed `-v2` are refinements of an earlier candidate of the same name;
both are kept so they can be compared.

## Viewing

`gallery.html` is a single self-contained page — open it directly in a
browser, no server needed. `index.html` is the same set with download links,
and needs the `svg/` folder beside it.
