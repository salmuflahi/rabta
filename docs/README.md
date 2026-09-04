# docs

What each file is, so the next person — including you in three months — does
not have to open all of them to find one.

## Start here

| File | What it is |
|---|---|
| [ROADMAP.md](ROADMAP.md) | What happens next, in sequence, with what blocks each item. Read this first after a break. |
| [vision.md](vision.md) | What Rabta is for. The argument the product exists to make. |
| [RELEASE.md](RELEASE.md) | How to cut a release: build, sign, notarize, publish. |
| [APP-STORE.md](APP-STORE.md) | The Mac App Store channel: sandbox entitlements, build/upload script, listing copy, screenshots — and what the sandbox breaks. Kit ready, nothing submitted. |
| [INSTALL.md](INSTALL.md) | Local development setup. |

## Reference

| File | What it is |
|---|---|
| [SECURITY-AUDIT-2026-08.md](SECURITY-AUDIT-2026-08.md) | Full audit of 0.1.0 — findings, evidence, and what it did *not* cover. True of 0.1.0; re-run each minor release. |
| [privacy-policy.md](privacy-policy.md) | The policy's source. `website/privacy/` is the published form. |
| [store-listings.md](store-listings.md) | Copy for the Marketplace, Open VSX and Chrome Web Store listings. The Mac App Store copy lives in `APP-STORE.md` §4. |
| [app-store/](app-store/) | Rendered Mac App Store screenshots (`scripts/make-appstore-shots.mjs` output). |

## Design

| File | What it is |
|---|---|
| [site-design-plan.md](site-design-plan.md) | The website's design system — palette, type scale, grid, motion. Cited by rule comments in `website/css/`. |
| [claude-rabta-living-instrument-handoff.md](claude-rabta-living-instrument-handoff.md) | The Living Instrument handoff the site's visual language comes from. |
| [design-brief-pins-and-focus-mode.md](design-brief-pins-and-focus-mode.md) | Brief for pins and focus mode in the app. |

## Marketing

| File | What it is |
|---|---|
| [RABTA-SCREEN-STUDIO-RECORDING-SCRIPT.md](RABTA-SCREEN-STUDIO-RECORDING-SCRIPT.md) | Shot-by-shot script for the product demo recordings. |
| [RABTA-SOCIAL-CAPTIONS.md](RABTA-SOCIAL-CAPTIONS.md) | Caption copy for the social cuts. |

## superpowers/

Working plans and specs, dated and kept rather than deleted — they record why
something was built the way it was. `plans/` is what was going to be done;
`specs/` is what it was supposed to look like; `*-outcome.md` is what actually
happened, including what went wrong.

Not reference material. Nothing outside this directory should depend on them.

---

## Where things are that are *not* here

- **`marketing` renders and video projects** — `video-editing/`,
  `video-exports/`, `website/assets/social/`, `website/assets/demos/micro/`.
  All gitignored. Roughly a gigabyte of project files and MP4s that git is the
  wrong store for. The last two sit under `website/` but are **not** part of the
  site: `.github/workflows/pages.yml` uploads the entire `website/` directory,
  so anything committed there is published at rabta.build whether or not a page
  links it.
- **Built artifacts** — `dist-artifacts/`, gitignored. The DMG, the `.vsix` and
  the Chrome zip.
- **Signing material** — `/signing/`, gitignored, and it stays that way.
