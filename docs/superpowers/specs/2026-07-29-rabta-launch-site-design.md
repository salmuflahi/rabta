# Rabta launch site — design spec

_Date: 2026-07-29 · Target: `https://rabta.build` · Product: Rabta v0.1.0_

The official public launch and download site for Rabta v0.1.0. Replaces the
current single-file `website/index.html` and the externally-hosted privacy
page.

---

## 1. Goals

1. Explain what Rabta is in one screen.
2. Show the real product working.
3. Give one obvious, trustworthy download path.
4. Walk a new user through setup without leaving the domain.
5. Read as a serious developer tool, not a landing-page template.

Non-goals for v0.1.0: analytics of any kind, a blog, a changelog feed, an
account system, a pricing page, Windows/Linux/Intel messaging.

---

## 2. Ground truth

Every claim on the site must trace to one of these. Facts verified against
the repository and live endpoints on 2026-07-29.

| Fact | Value | Source |
|---|---|---|
| Version | 0.1.0 | `tauri.conf.json`, `docs/RELEASE.md` |
| Artifact | `Rabta_0.1.0_aarch64.dmg` | `dist-artifacts/` |
| Size | 5,495,778 bytes (5.5 MB) | `ls -l` on the artifact |
| SHA-256 | `3978ec57af7d37ab32670033d679c21a28cf74cebb0435ce011049e05635c655` | `docs/INSTALL.md`, verified |
| Platform | macOS 11.0+ · Apple Silicon (arm64) only | `docs/INSTALL.md` |
| Signed | Developer ID Application: sammy almuflahi (86M2X6MUA3) | `docs/INSTALL.md` |
| Notarized | Yes — notarized and stapled | `docs/INSTALL.md` |
| Bundle ID | `com.omnibus.dev` | `tauri.conf.json` |
| Download URL | `github.com/salmuflahi/rabta/releases/download/v0.1.0/…` | HTTP 200 verified |
| Editor connector | `rabta-connect.rabta-vscode` 0.1.0 on Open VSX | HTTP 200 verified |
| VS Code Marketplace | **NOT published** — do not claim | `docs/store-listings.md` |
| Browser connector | Pending Chrome Web Store review, id `aaombpafbhjkoinppogieaclijddlebo` | `docs/store-listings.md` |
| Licence | MIT | `LICENSE` |
| Contact | sammyalmuflahi1@gmail.com | `docs/privacy-policy.md` |

### 2.1 Prohibited claims

Never state, imply, or design around: VS Code Marketplace availability ·
Intel or universal macOS builds · Windows or Linux support · Chrome Web Store
availability before approval lands · download counts · user counts · cloud
sync · any feature not in v0.1.0 · security guarantees beyond "signed and
notarized by Apple", which is verifiable.

### 2.2 Availability wording (canonical strings)

- Desktop app — "macOS 11+ · Apple Silicon"
- Editor connector — "Live on Open VSX. Installs directly in Cursor,
  VSCodium and Windsurf. For VS Code, install the signed `.vsix`."
- Browser connector — "Pending Chrome Web Store review." Rendered as a
  labelled non-interactive state, never a dead button.

---

## 3. Information architecture

| Route | Title | Purpose |
|---|---|---|
| `/` | Rabta — Save a task's whole workspace. Reopen it exactly as you left it. | Launch page, 13 sections |
| `/setup/` | Setup — Rabta | Complete install, pairing, first-capsule and troubleshooting guide |
| `/privacy/` | Privacy — Rabta | The real policy, replacing the external host |
| `/404.html` | Not found — Rabta | Branded, links home + download + setup |

All three content pages share `css/base.css`, `css/site.css`, `js/site.js`.

### 3.1 Landing page section order

1. Top nav (sticky, scroll-aware)
2. Hero (headline, CTAs, status line, animated capsule sequence over a real screenshot)
3. Product demo — six-tab showcase of real app screens
4. How it works — 4 steps
5. Feature grid
6. Use cases
7. Local-first / privacy
8. Install / setup flow
9. Download (primary CTA + integrity block)
10. Connectors / ecosystem
11. FAQ (accordion)
12. Final CTA
13. Footer

---

## 4. Stack

Hand-written static HTML/CSS/JS. No framework, no build step, no
`node_modules`, no bundler.

```
website/
  index.html
  setup/index.html
  privacy/index.html
  404.html
  css/base.css          tokens · reset · type scale · motion primitives
  css/site.css          layout · components · sections
  js/site.js            reveal · nav · tabs · accordion · copy · hero sequence
  assets/brand/         mark, lockup, favicons, app icons, og card
  assets/shots/         responsive AVIF/WebP/PNG derivatives of 6 app screens
  assets/fonts/         Inter subset, self-hosted woff2
  site.webmanifest · CNAME · robots.txt · sitemap.xml
```

Rationale: the product's core claim is that nothing phones home. A site with
no third-party requests makes that claim structurally true rather than
merely asserted, and a one-page marketing site does not earn a toolchain.

### 4.1 Network-request policy

The site itself issues **no background requests to third-party services**:
no analytics, no third-party fonts, no ad or tracking scripts, no tracking
pixels, no embedded video players, no chat widgets, no CDN-loaded animation
libraries. Every byte the page needs is served from `rabta.build`.

Copy must use the accurate framing — "The Rabta website makes no background
requests to third-party services" — and must not claim that browsing can
never reach another domain, because the user may deliberately click through
to Open VSX, the GitHub-hosted release asset, or an issue tracker. Those
outbound destinations are named where they appear.

Adding analytics later is a separate product and privacy decision and is out
of scope for this implementation.

---

## 5. Brand system

### 5.1 Single source of truth

`website/assets/brand/rabta-mark.svg` is the **only** brand-mark source in the
repository. Every raster icon, favicon, platform icon and social image is
generated from it.

### 5.2 Palette

Lifted from the app's own `apps/desktop/src/index.css` tokens so site and
product are visibly the same object.

| Token | Value | Role |
|---|---|---|
| `--ink` | `#081718` | page background |
| `--surface` | `#102526` | cards, the mark's tile |
| `--raised` | `#173234` | raised cards, chips |
| `--line` | `#244548` | hairline borders |
| `--cream` | `#f4f1e9` | primary text, the mark's glyph |
| `--muted` | `#9ba8a6` | secondary text |
| `--tangerine` | `#ff6b2c` | primary action, the mark's fold |
| `--teal` | `#66d6c2` | links, verified/integrity states |

Forbidden: the legacy palette — slate `#0f172a`, sky `#38bdf8`, sky
`#7dd3fc` — and any neon gradient, purple "AI" gradient, or stock
illustration.

### 5.3 Typography

Inter Variable, self-hosted as a subset woff2 from the copy already vendored
at `apps/desktop/node_modules/@fontsource-variable/inter`. `font-display:
swap`, preloaded, with a system-font fallback stack metric-matched closely
enough to avoid a visible reflow. `ui-monospace` for technical strings —
versions, checksums, commands, file names.

### 5.4 The fold motif

The mark's clipped corner is a system element, not decoration: section
eyebrow rules, a corner cut on cards, and the seal beat of the hero capsule
animation.

---

## 6. Brand asset pipeline

### 6.1 Script

`scripts/generate-brand-assets.py` replaces `scripts/make-icon.py`, which is
deleted. The old script is the origin of the legacy navy/blue circular icon —
it hard-coded slate `#0f172a`, sky `#38bdf8`, a ring geometry and four
connector dots. Nothing of its design survives; the replacement contains no
colour literals for the mark at all, since it rasterises the SVG.

Requirements:

- Python 3 standard library only.
- Input: `website/assets/brand/rabta-mark.svg`. The script fails loudly if
  that file is missing; it has no fallback geometry and therefore **cannot**
  reproduce the old icon.
- Rasterises via `sips` (native macOS, verified working on SVG input with
  alpha preserved).
- `.ico` written by a small pure-Python ICO packer embedding PNG entries.
- `.icns` written via `iconutil` from a generated `.iconset`.
- `cwebp` / `avifenc` for web derivatives; both optional, with a clear
  message and a clean skip when absent.
- Idempotent, and prints every path it writes.

### 6.2 Outputs

| Output | Size(s) | Destination |
|---|---|---|
| favicon.svg | vector | `website/assets/brand/` |
| favicon.ico | 16, 32, 48 | `website/` root |
| favicon PNG | 16, 32 | `website/assets/brand/` |
| apple-touch-icon | 180 | `website/assets/brand/` |
| web app icon | 192, 512 (+ maskable 512) | `website/assets/brand/` |
| social card | 1200×630 | `website/assets/brand/og-cover.png` |
| Tauri icons | 32, 64, 128, 128@2x, icon.png, .icns, .ico | `apps/desktop/src-tauri/icons/` |
| Chrome connector | 16, 32, 48, 128 | `connectors/chrome/icons/` |
| Editor connector | 128 | `connectors/vscode/icon.png` |

Regeneration is documented in `docs/RELEASE.md` and in the script's own
header.

### 6.3 Social card

Composed, not screenshotted. 1200×630 with the new mark, the Rabta wordmark,
a one-line product statement, a carefully cropped fragment of real product
UI, and ≥60px safe-area padding on all edges so no element is lost to
platform cropping. It states no platform or availability claim that could
age badly. Authored as an SVG in the repo and rasterised by the same script,
so it regenerates from the same source of truth.

### 6.4 Old-icon audit

After regeneration, verify the legacy mark is absent from: source files,
generated assets, metadata, manifests, documentation, website assets,
connector packages, app bundle icons, screenshots and social images.
Mechanical checks — grep for the legacy hex values and for `make-icon` /
`icon-src` across the repository, plus visual inspection of every generated
raster. Result recorded in the final report.

---

## 7. Screenshot capture rig

### 7.1 What the screenshots are

**Genuine Rabta v0.1.0 product UI rendered with deterministic, representative
demo data.** They are the shipped interface, not a mockup and not a
recreation; the data behind them is seeded and reproducible, and is never
described as live user data. Captions on the site say so plainly.

### 7.2 Mechanism

`apps/desktop` runs its real React frontend under Vite against a mocked Tauri
bridge:

- A capture-only entry point aliases `@tauri-apps/api/core` and
  `@tauri-apps/api/event` to a mock module.
- The mock reproduces the real bridge's **response shapes and state
  transitions** — the same command names, the same payload types from
  `src/store.ts`, the same event sequence — so what renders is the real
  component tree in a real state, not a hand-drawn approximation.
- Seed data is a frozen fixture: fixed IDs, fixed ISO timestamps, fixed
  ordering, fixed clock. No randomness, no `Date.now()`.
- Capture-only files live under a clearly named directory and are excluded
  from the shipped app build.

### 7.3 Determinism and hygiene

- Fixed viewport 1280×800, fixed `deviceScaleFactor: 2`.
- No personal usernames, real file paths, emails, machine names or repository
  names. Demo identities are generic (`~/code/rabta`, `feat/reconnect`).
- Every capability shown must exist in shipped v0.1.0. No aspirational UI, no
  disabled-feature teasing, no fabricated connector availability, no
  fabricated counts.
- Reruns produce byte-comparable output.

### 7.4 Screens

Overview · Capsules · Restore (mid-sequence, showing progress) · Projects ·
Connectors · Activity. Full window for each; Restore additionally captured in
its focused state.

### 7.5 Derivatives and performance budget

Each capture produces AVIF + WebP + PNG at 3 widths (640 / 1024 / 1600 CSS
px), wired through `<picture>` with `srcset`/`sizes`, explicit `width`/
`height`, and correct aspect ratio so nothing shifts on load.

Loading rules:

- Preload **only** the hero image.
- The five inactive demo panels are not fetched during initial load; they
  load on tab activation or after the page goes idle, whichever comes first.
- Everything below the fold is `loading="lazy"` `decoding="async"`.
- No oversized transparent PNGs; the social card is optimised separately
  from page screenshots.

Targets: fast FCP · zero unexpected layout shift · hero legible before any
animation JS runs · usable on a throttled connection · no render-blocking
external requests · no external font requests · no animation that delays
first paint.

---

## 8. Hero

Layout: headline, sub-headline, primary and secondary CTA, a status line
(macOS 11+ · Apple Silicon · 5.5 MB · signed & notarized), and a trust line
(local-first · no account · no telemetry).

Visual: a real Overview screenshot in a macOS window frame, with a capsule
card layered in front running a four-beat sequence.

### 8.1 Sequence

1. Workspace chips — an editor file, terminals, tabs, a git branch — draw
   inward.
2. The capsule seals; the fold corner folds down.
3. It rests in the saved state while the frame behind switches task.
4. Restore: chips return outward, each landing with a check.

### 8.2 Behaviour

The animation must never read as an advertisement loop competing with the
headline and the download button.

- The **static final restored state is rendered in HTML/CSS**, before and
  independently of any JavaScript. With JS disabled or still loading, the
  hero is complete and meaningful.
- The sequence runs once after the initial page reveal, holds in the restored
  state, repeats at most once, then settles permanently into the final state.
- A subtle, keyboard-reachable replay control lets the user run it again.
- Pauses when scrolled out of the viewport (`IntersectionObserver`) and when
  the page is hidden (`visibilitychange`).
- No idle CPU/GPU once settled — animations are removed, not paused mid-loop.
- Transform/opacity only; no layout-affecting properties; no layout shift.
- Never overlaps or intercepts pointer events on the download button.

### 8.3 Reduced motion

Under `prefers-reduced-motion: reduce`, the final restored state renders
immediately, chips do not fly, all labels stay readable, and the meaning of
the sequence — this workspace was captured and came back — is preserved
through static composition and copy. The replay control is hidden.

---

## 9. Demo showcase

Six tabs with genuine tab semantics: `role="tablist"` / `tab` / `tabpanel`,
`aria-selected`, `aria-controls`, roving tabindex, Left/Right/Home/End keys,
and a visible focus ring that meets contrast requirements.

Content rules:

- No essential text lives only inside an image.
- Callout information is available as text, not hover-only.
- Each panel carries a plain-language description of what the screen shows.

Responsive rules:

- Small screens: the tab list scrolls horizontally or collapses to a compact
  select; callout pins are reduced or removed and their explanations move
  beneath the image; screenshots are not shrunk past the point where the
  interface stops being legible.
- Screenshots remain viewable at a useful size on every breakpoint.

---

## 10. Motion system

One easing token — `cubic-bezier(.22, 1, .36, 1)`, the app's own
`--ease-standard`. `IntersectionObserver` adds an `.in` class; CSS transitions
do the work. No JavaScript animation loop anywhere in the site.

- Nav compresses and increases blur on scroll.
- Section reveals: 12px rise + fade, staggered by index.
- Tabs: crossfade + rise, moving underline.
- Accordion: `grid-template-rows: 0fr → 1fr`, no height measurement.
- Feature cards: pointer-tracked spotlight, transform/opacity only.

All of it gated on `prefers-reduced-motion` in both CSS and JS. Motion never
carries information that is not also available statically.

---

## 11. Download block

One obvious primary button. Integrity information sits adjacent but visually
secondary — present for the cautious developer, not in the way of the
confident one.

Displayed facts, all verified: version · macOS architecture · minimum macOS
version · file type · approximate size · release date · signed · notarized ·
SHA-256 with copy-to-clipboard and the `shasum` command to check it. Links to
release notes, setup instructions, and how to report a problem.

The download points at the **versioned, immutable** v0.1.0 release asset.
A future build must ship under a new version rather than silently replacing
the file behind this release identity — otherwise the published checksum
becomes a lie.

Intel is not offered, mentioned, or implied.

---

## 12. Setup page

Mirrors shipped behaviour exactly, from `docs/INSTALL.md`.

Covers: supported macOS version · supported architecture · exact DMG install
procedure · Gatekeeper behaviour a user may encounter · verification
(`shasum`, `stapler validate`, `spctl`) · editor connector via Open VSX for
Cursor/VSCodium/Windsurf · VS Code via the signed `.vsix` · browser connector
status · pairing steps and the approve prompt · required permissions · first
project · first capsule · saving · resuming · troubleshooting connection
failures, launch failures and connector version mismatches · finding logs and
diagnostics · uninstalling Rabta · removing local data · reporting a bug.

The browser connector is **not** documented as installable from a marketplace
before approval, and no unofficial sideload workaround is presented to public
users as a normal path merely to make the guide look complete. Its state is
described honestly, with what will change when review completes.

---

## 13. Privacy page

A real policy, not marketing copy, at `https://rabta.build/privacy/`.

Covers: effective date · whether an account is required · data stored
locally · exact categories of local data · connector data and permissions ·
whether project source code is read · whether it is uploaded · telemetry
status · crash-reporting status · update-check behaviour · website data
collection · website server logs · third-party marketplace interactions ·
external download hosting · data deletion · data export if available ·
changes to the policy · contact.

Every claim confirmed against the shipped app and the hosting setup before
it is written. Where hosting behaviour is outside the project's control —
GitHub serving the release asset, Open VSX serving the extension — that is
stated rather than glossed.

All legacy privacy URLs are replaced repository-wide with
`https://rabta.build/privacy/`: desktop app, website, extension metadata,
manifests, setup documentation, about screens, and store-listing copy where
editable.

---

## 14. Metadata and discoverability

Per page: canonical URL, unique title, unique meta description, Open Graph
and social card tags, theme colour. Site-wide: web manifest, full favicon
set, apple-touch-icon, `robots.txt`, `sitemap.xml`, and `SoftwareApplication`
structured data limited strictly to supported facts.

Semantics: one `h1` per page, no skipped heading levels, descriptive alt text
on every image, link text meaningful out of context.

A branded `404.html`.

---

## 15. Support paths

Visible, accurate links to: installation guide · privacy policy · release
notes · bug reporting · connector support · download troubleshooting. No dead
contact links. A dedicated support page is not required for v0.1.0 given the
setup/troubleshooting page and an issue-reporting destination.

Footer additionally shows: current version · platform availability · editor
connector availability · browser connector status · privacy · setup · release
notes · support.

---

## 16. Testing

Browsers: current Safari, Chrome, Firefox. Viewports: desktop, tablet,
mobile, narrow, wide external display, high-DPR.

Modes: keyboard-only, reduced motion, JavaScript disabled, throttled network.

Verify: every download, setup, privacy, connector and footer link · every
accordion · every demo tab · every responsive image source · favicon and
manifest · social card crop · sitemap and robots · 404 behaviour · no console
errors · no missing assets · no legacy logo references · no third-party
background requests · no horizontal overflow · no layout shift from images or
fonts.

Run a production accessibility and performance audit; resolve high-confidence
findings.

---

## 17. Definition of done

The site ships when: every claim traces to §2 · the legacy mark is provably
absent · screenshots are deterministic and regenerable · the hero is
meaningful without JavaScript · reduced motion is honoured · the performance
budget in §7.5 holds · §16 passes · and the final report in the task brief is
delivered with the exact file list and commit hash.
