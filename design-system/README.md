# Living Instrument — design system

The visual system behind the desktop app, rabta.build, and the browser
connector, as a set of cards on claude.ai/design.

```bash
./design-system/build.mjs    # parts/ -> dist/
```

Each card is a fragment in `parts/`. `build.mjs` wraps it in a standalone page
with the site's **own** stylesheets inlined verbatim — `website/css/tokens.css`
and `website/css/shell.css` — plus `card.css` for the frame around the specimen.

So the cards render with the real values and the real component rules. Change a
token and every card that shows it changes. Nothing here re-states a value from
the stylesheets; a design system typed into a second place is one that disagrees
with the product inside a month, and this repo has already shipped two assets
that drifted from what a manifest claimed.

The webfont is inlined as a data URI: these pages are viewed off a host with
none of this repo's assets, and a type specimen set in a fallback face documents
the wrong typeface.

## Adding a card

Drop a fragment in `parts/`. Its first line must be the card marker:

```html
<!-- @dsCard group="Foundations" name="Palette" -->
```

`group` is the section in the Design System pane. Use the site's real classes in
the body — `.button`, `.sweep`, `.cut-link` — rather than restyling them here.

## Publishing

`build.mjs` writes `dist/`, which is what gets uploaded. Project:
**Rabta — Living Instrument**, `747ee2c7-50ff-40a6-af34-449eba782a48`.
