# Rabta site — creative reset

**Date:** 2026-07-29
**Supersedes (creatively):** `2026-07-29-rabta-launch-site-design.md`
**Preserves (factually):** that spec's truth-in-claims gate, zero-third-party-request rule,
JS-optional rendering, and `/privacy/` URL stability.
**Restore point:** tag `site-v1-pre-reset` → commit `6a829e9`.

---

## 1. The one central idea

`activate_task` in `apps/desktop/src-tauri/src/capsules.rs` auto-saves the **outgoing**
task's capsule before it restores the incoming one, and returns it as `savedPrevious`.

So the product's value is bidirectional, and literal:

> Context is caught on the way **out**, not merely handed back on the way **in**.

That is what the site demonstrates. `Leave the task. Keep your place.` is a description
of the code path, not a slogan. Everything on the page serves this one idea, and nothing
on the page may contradict it.

Slogan: **Context, kept.**

## 2. Chapter map — five chapters

| # | Chapter | Environment | Motion | Job |
|---|---------|-------------|--------|-----|
| A | Interactive hero | Warm cream `--paper` | Interactive, user-triggered | Demonstrate the switch in 10s |
| B | The context-switch story | Deep ink `--ink` | Pinned, scroll-scrubbed | Make the loss felt |
| C | Playable demo | Light editorial `--canvas` | Interactive state machine | Teach through use |
| D | Local-first trust | Quiet ivory `--ivory` | Static, almost empty | Earn belief |
| E | Download | Dark cinematic `--ink` | Mark unfold, once | Convert |

Rhythm is cream → ink → light → ivory → ink. Not mechanical alternation: A and C are
both light but at different values and different densities; D is the quiet one; B and E
are the two dark chapters and they bookend the argument.

Petrol (`--surface` `#102526`) appears **only** as product surface — the miniature app
UI, the capsule, the app frame. It is never a section background. This is the single
biggest change from v1, which was 100% dark with zero cream environments.

## 3. Copy — hard limits

Hero: one headline, one supporting paragraph, two CTAs, one trust line.
Each other chapter: one headline, at most one paragraph, at most three supporting labels.

- H1: `Leave the task. Keep your place.`
- Hero lede: `Rabta remembers the working context around your code—and restores it when you return.`
- Trust: `Your workspace stays on your Mac.`
- Download: `Return to your work.`
- Closing: `Context, kept.`

Banned: revolutionize, supercharge, unlock, seamless, next-generation, AI-powered,
and any abstract-productivity framing.

Removed from the homepage entirely: the 6-card feature grid, the 5 use-cases, the
6-card privacy grid (→ `/privacy/`), the 4-step install ladder (→ `/setup/`), the
integrity panel (→ `/setup/#verify`), 6 of 9 FAQ items, the screenshot tab switcher,
both `<hr>` dividers, and the standalone "how it works" ladder (absorbed into B).

## 4. Product fidelity — non-negotiable

The demos model the real machine. Verified against
`apps/desktop/src/restore/types.ts`, `RestoreExperience.tsx`, `normalize.ts`,
`src-tauri/src/capsules.rs`, `src-tauri/src/git.rs`.

**State machine:** `idle → opening → restoring → success | partial | failure → closing → idle`
**Row statuses:** `waiting | restoring | applied | skipped | failed`

**Exactly three rows**, one per distinct `connectorKind`:

| Row | Content | Truth |
|-----|---------|-------|
| VS Code | `4 files · 3 terminals` | Terminals live **inside** this row's payload |
| Chrome | `5 tabs` | Additive `tabs.open` only — never closes or reorders tabs |
| Git | `feat/reconnect` | Refuses on a dirty tree; never stashes or discards |

**Rules the demo must not break:**
- No per-row spinner. Rows go `Waiting` → final with a 40 ms reveal stagger. The
  per-row `Restoring…` state exists only in the dev playground.
- No `Terminal` row, no `Cursor` row. Only `fake | vscode | chrome` exist on the wire;
  `git` is virtual. Cursor reports `kind: "vscode"`.
- Only VS Code can be `pending` / `On next reload`.
- No percentage, ETA, step counter, or determinate progress. The real element is a 2px
  indeterminate shimmer that snaps to 100% on resolve.
- No capsule history, versions, or rollback — capsules are latest-only per kind.
- No per-tool retry, no cancel, no cloud/accounts/sync.
- Never animate VS Code/Chrome/Terminal windows themselves.

**Real strings only:** headings `Restoring workspace` / `Workspace restored` /
`Workspace partially restored`; row labels `Waiting` / `Restored` / `Skipped` /
`Couldn't restore`; `On next reload`; save toast `Saved state`.

**Real timings:** `SHEET_MS 200`, `FOLD_MS 180`, `ROW_MS 155`, `ROW_STAGGER_MS 30`,
`EMIT_REVEAL_STAGGER_MS 40`, `HOLD_MS 220`, `CLOSE_MS 170`, `MIN_VISIBLE_MS 450`,
ease `cubic-bezier(0.22, 1, 0.36, 1)`.

Chapter C deliberately resolves to **`partial`**, with Chrome `Skipped` because the
connector is offline. That is the honest v0.1.0 state — the browser connector is still
in review — and it is more persuasive than a fabricated all-green.

Both demos are labelled `Interactive product demo` and never presented as live data.

## 5. The fold motif — restraint

The fold already exists in the shipped product and is reused, not invented:

- Restore sheet: `clip-path: polygon(100% 0, 0 0, 100% 100%)` at 28px.
- Sidebar active nav row: 6px tangerine triangle on a squared top-right corner
  (`rounded-tr-none`), 9px on hover.

The fold appears in exactly **five** places sitewide, each marking preservation or
restoration — never decoration:

1. Hero — the outgoing context folding into a capsule.
2. Chapter B scene 3 — the pieces gathering into one capsule.
3. Chapter C — the active capsule being sealed.
4. Chapter E — the mark unfolding at scale.
5. The primary CTA — one 6px corner detail.

No fold corner on ordinary cards. No orange triangles as stickers.

**Mark unfold geometry** (exact, from `rabta-mark.svg`): hinge midpoint `(48.75, 15.25)`,
axis direction `(1,1)/√2`, flap legs `14.5`. A 180° `rotate3d(1, 1, 0)` about that axis
lands the flap precisely in the void triangle. The mark's resting state is *folded*, so
the sequence must end folded — unfold, then settle closed.

## 6. Motion architecture

No new dependencies. Nothing is vendored for animation and nothing needs to be.

- **CSS** owns all continuous/declarative motion: `@keyframes`, transitions, and
  scroll-driven `animation-timeline: view()` / `scroll()` where supported.
- **Web Animations API** owns the two orchestrated sequences (hero switch, demo restore).
- **Explicit state machines** in JS own demo logic — a `state` + `transition(action)`
  reducer per demo, never `setTimeout` chains.
- One easing: `cubic-bezier(0.22, 1, 0.36, 1)`, the app's `--ease-standard`.

Motion vocabulary, all tied to product meaning: **gather · fold · preserve · unfold ·
reconnect · return**. Banned: fade-up-everything, floating icons, particles, glowing
network lines, gradient blobs, marquees, cursor trails, purple anything.

**Lifecycle:** `IntersectionObserver` pauses off-screen work; `visibilitychange` pauses
hidden-tab work; no rAF loop runs when idle. Hero plays one guided sequence after load,
then settles into interactive and does **not** loop.

**Reduced motion:** every chapter renders in its completed state, fully readable, with
no animation. The scroll story becomes five stacked static scenes. `prefers-reduced-motion`
is honored via media query *and* the existing `.js` gating, so JS-off is also complete.

## 7. Salvage from the OmniBus prototype

Reinterpreted (technique, not content):

1. **Two light slabs at two light values** — the largest single gain; fixes v1's flat monotony.
2. **Scroll-linked product frame rise** — one 0→1 scalar driving `rotateX 8°→0`,
   `scale .88→1`, `translateY 38px→0` on a `perspective: 1400px` stage.
3. **Mask-everything discipline** — no decorative layer gets a hard edge.
4. **Zero-request film grain** — inline `feTurbulence` data-URI at `opacity: .08`.
5. **Composition that encodes data** — column widths that *are* the quantity.
6. **Restrained pointer response** — ±3° max, with explicit reset.

Explicitly **not** restored: the OmniBus name in any form, the old marks, "The Context
Fold" as a proper noun, capitalised "Task Capsule", the ⌘K palette wired to nothing,
the 8-tool marquee, the component gallery, and every fabricated metric
(`2h 18m` time recovered, `12 pieces of context`, `4/4 tools`, `75%`, `92%`, the
12-bar chart, `Good morning, Sal.`).

## 8. Claim corrections (factual gate)

| Change | Reason |
|--------|--------|
| Drop "signed" before `.vsix` (3 places) | The .vsix has 7 files and no signature member — **false** |
| State the VS Code Marketplace listing as live | Registry: `validated, public`, published 2026-07-28 |
| Update `docs/RELEASE.md` + `docs/store-listings.md` | Docs are stale relative to the live registry |
| No Chrome Web Store link | No public listing exists; "pending review" only |
| No usage/star/rating metrics | 0 stars; the 4.45 rating has zero underlying ratings |
| No "open source" for the app | Only the website repo is public |
| No auto-update promise | The Tauri updater is not wired |

Verified true and safe to state: `0.1.0` · macOS 11.0+ · arm64 only · `.dmg` ·
`5,495,778` bytes · signed · notarized · SHA-256
`3978ec57…5635c655` · Team ID `86M2X6MUA3` · MIT · Open VSX
`rabta-connect.rabta-vscode`.

## 9. Sub-pages

`/setup/` and `/privacy/` inherit the new nav, footer, typography, tokens and buttons,
and receive the content moved off the homepage. They keep stable layouts, prose
readability and clear navigation — no pinned scroll, no scrubbing, no cinematics.

Anchor stability matters: 13 links across the sub-pages and 404 point at `/#demo`,
`/#connectors`, `/#faq`, `/#download`. `#demo` and `#download` are kept; `#connectors`
and `#faq` are re-pointed as those sections are absorbed or moved.

## 10. Deploy (authored here, run by the owner)

The site has never been deployed from this repo. Authored as part of this work:
`.github/workflows/pages.yml` and `.nojekyll`. The owner must switch the repo's Pages
source to **GitHub Actions** and provision the apex certificate — `https://rabta.build`
currently fails TLS validation and `/setup/` + `/privacy/` 404, which breaks the
privacy-policy URL the Chrome Web Store and Open VSX listings depend on.

## 11. Acceptance

Built against the brief's §23 criteria. The page is finished only when: the hero is not
a centered heading over a screenshot; the visitor can trigger a real context switch;
petrol is not a section background anywhere; the fold means preservation in all five of
its appearances; the scroll story scrubs smoothly with a static reduced-motion
equivalent; screenshots are secondary; copy is materially shorter; no fabricated data
appears anywhere; and the page still reads as professional with all motion disabled.
