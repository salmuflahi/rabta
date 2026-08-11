# Rabta site — the eight-page rebuild

## What this is

The live site is three pages: Home, Privacy, Setup. The redesign is eight —
Home, Why Rabta, Setup, FAQ, Roadmap, Changelog, Contact, Privacy — with shared
chrome, a real nav, and a footer that finally carries the project's links.

This spec covers that rebuild plus what it takes to put the site in front of
people: socials, metadata, and the security headers a site should have before
it is advertised. The desktop app's Phase 4 is done and separate; the security
*audit* of the whole product is the spec after this one.

## Decisions

### The new structure, the established palette

The design files carry their own colour and type choices. We take their
**structure, copy and interactions** and render them in Rabta's existing brand:
`--petrol #102526`, `--orange #ff6b2c`, `--ivory #f3f0e8`, Inter Variable at
400–600.

The reason is not conservatism. The site's OG card, favicons, app icon, store
listings and the desktop app itself are already that palette. A site that
doesn't match them reads as a different product, and the one thing a launch
site cannot afford is looking like it belongs to someone else. "Fit the vibe"
is the requirement; the vibe already exists.

### Media stays empty, deliberately

Every image and video is a **placeholder slot** — a black block at the right
aspect ratio, with a visible label naming what belongs there. No stock imagery,
no borrowed screenshots, no AI-generated filler. The existing real product
screenshots under `website/assets/shots/` stay where they are already used.

Slots are addressable by id so filling one later is a one-line change, and a
build check fails if a slot ships without either real media or an explicit
`data-placeholder` marker — so an empty slot can never reach production by
accident, only by intent.

### Hand-written HTML and CSS, as now

No framework, no build step for the site. The existing `website/` is
hand-authored HTML with layered CSS (`tokens` → `reset` → `type` → `layout` →
`component` → `section` → `state`) and ES modules. Eight pages is not enough to
justify a generator, and the current approach is why the site loads as fast as
it does.

Shared chrome (nav, footer) is duplicated across pages rather than templated.
That is a real cost — eight copies to keep in sync — paid down by a test that
asserts every page's nav and footer are identical, so drift fails CI rather
than shipping.

## Pages

| Page | Path | Purpose |
| --- | --- | --- |
| Home | `/` | The pitch. Seven sections, hero through CTA. |
| Why Rabta | `/why/` | The argument: why switching back is expensive. |
| Setup | `/setup/` | Install, verify, connect editor and browser, first capsule. |
| FAQ | `/faq/` | The questions the README keeps answering. |
| Roadmap | `/roadmap/` | What is coming, honestly scoped. |
| Changelog | `/changelog/` | Releases, newest first. |
| Contact | `/contact/` | How to reach a human; where to file bugs. |
| Privacy | `/privacy/` | Already exists; retoned to the new chrome. |

**Home's seven sections**, in order, from the design:

1. Hero — "Pick up the task. Not the pieces." with the demo video slot.
2. "Three moves. Nothing else to learn."
3. "A capsule is the whole surface of a task."
4. "Resuming can also put away what isn't in the task."
5. "Every task you came back to."
6. "There is no account, because there is no server."
7. "Stop rebuilding the same workspace." — the download CTA.

**Nav**, on every page: Why Rabta · Product · Setup · FAQ · Changelog · Contact,
then a Download button. "Product" is a Home anchor, not a page — the design's
nav lists it but ships no such page, and inventing one would pad the site with
a page that has nothing to say.

**Footer**, on every page: Roadmap, Privacy, and the links below.

### Content is derived, not invented

Roadmap, Changelog and FAQ state facts about the product, so they come from what
is already true in the repo — `docs/RELEASE.md`, the GitHub releases, `README.md`
— not from the design file's sample text, which was written to fill a layout.
Where the repo doesn't answer a question, the page says so plainly rather than
inventing a date or a promise.

## Links

**GitHub:** repo, releases, and issues — `github.com/salmuflahi/rabta`.

**Instagram and TikTok:** requested, handles not yet supplied. The footer is
built with their markup in place and the two links **omitted until the handles
arrive** — a wrong or dead social link on a launch site is worse than an absent
one. Adding them is a one-line change per link.

Social links carry `rel="me"` so the profiles can verify the site back, and
`rel="noopener noreferrer"` on every external target.

## Launch readiness

This is the part that makes the site advertisable rather than merely finished.

**Security headers**, served via the existing GitHub Pages setup where possible
and documented where not: a Content-Security-Policy that permits only self-hosted
assets (the site loads no third-party scripts and must keep it that way),
`Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options:
nosniff`, and a `Permissions-Policy` denying camera, microphone and geolocation
outright.

**No third-party requests.** No analytics, no fonts from a CDN, no embeds. The
site's own privacy page claims there is no tracking; a test asserts the built
HTML contains no external origin outside an explicit allowlist, so that claim
stays true by construction rather than by discipline.

**Per-page metadata:** unique `<title>` and description, canonical URL, OG and
Twitter card tags, and `sitemap.xml` covering all eight pages.

**Accessibility**, to the same standard the app just met: landmarks, a skip
link, visible focus, one `<h1>` per page, and colour contrast asserted against
WCAG AA from the token values — reusing the ratio maths the desktop app now has
rather than writing a second implementation.

**Performance:** the font is already self-hosted and preloaded. Images ship as
AVIF/WebP with PNG fallback at the sizes actually used. No layout shift from
media slots — every slot reserves its aspect ratio.

## Testing

Extends `tests/site/`, which already runs under `node --test`:

- **Chrome parity** — every page's nav and footer markup is identical. This is
  what makes duplicated chrome safe.
- **Metadata** — every page has a unique title, a description, a canonical, and
  OG tags; `sitemap.xml` lists exactly the eight pages that exist.
- **No third-party origins** — no `src`/`href` to an external host outside the
  allowlist.
- **Media slots** — every slot either references real media that exists on disk
  or is explicitly marked a placeholder.
- **Links** — no internal link 404s; every external link is `https` and carries
  `rel="noopener noreferrer"`.
- **Contrast** — token pairs meet WCAG AA.

## Out of scope

- The security audit of the desktop app, hub, and connectors — the next spec.
- Real media. Slots ship empty by design, to be filled on request.
- Any CMS, generator, or framework migration.
- Localisation.
