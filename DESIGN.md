# Rabta — Lens visual system

Reviewed 2026-09-07. The user's new reference batch (IMG_3038–IMG_3051) and request to redesign the app supersede the visual restrictions in the September 3 brand spec. Its product/data commitments remain in force. Rabta Market means future merchandise, not a plugin store, and is reserved for a later release.

## Direction

Calm, focus, and immediate access to the things around a task. Frosted mist and sage surfaces, restrained rose accents in illustrative compositions, etched radial marks, joined circular actions, open typography, and small floating controls. The app translates the references into readable working surfaces; it does not import their health/finance metrics or promotional claims.

## Canonical owners

| Role | Owner | Use |
| --- | --- | --- |
| Shared colors, fonts and geometry | Rabta Studio `packages/rabta-ui/src/brand.ts` | `sync-rabta-ui.mjs` generates the app HSL adapter and copies the original source; light and dark |
| User accent preference | `apps/desktop/src/theme/accent.ts` | Existing preferences and contrast resolution remain compatible |
| Shared material, arc, joined action, dock, dot lettering | Rabta Studio `packages/rabta-ui/src/lens.tsx` and `lens.css` | Canonical upstream; lean vendored source below |
| App adaptation | `apps/desktop/src/lens-app.css` | Maps semantic app tokens to `--r-*`; owns app density and layout |
| Shared elevated app containers | `components/ui/surface.tsx` | Rounded 18px grouped/raised surfaces; Card delegates here |
| Selection and navigation | `shell/nav.ts`, `navRow.ts`, `Sidebar.tsx` | Existing labels, keyboard model, selected state and collapse behavior |
| Forms, menus, sheets, feedback | Existing `components/ui`, `restore`, `features/capsules` | Behavior is not reimplemented by visual primitives |

## Geometry and type

Overview uses a wider, asymmetric pair of cards: current task first, connections second. At narrow widths the pair stacks. Capsule master/detail keeps independent desktop scrollers; below 620px the existing list and detail form a vertical flow with one outer scroll owner. Native window controls retain `shell/titlebar.ts` geometry. No artwork sits above an actionable control.

App and site use locally hosted Instrument Sans for body, Inter for display, Geist Mono for code, and the approved bespoke outline for the brand. Task titles are 25–39px with restrained negative tracking; metadata remains at 11–13px with solid contrast. Long task titles wrap. Dot lettering is reserved for a short secondary accent, never a path or an essential instruction.

Lens panels use 26px radius in the app. Controls and dense list rows use smaller named app treatments. Glass is a bounded material on raised surfaces, with an opaque fallback. Popovers/dialogs remain opaque enough to read. There is no continuous GPU effect in the desktop shell.

## Motion

Context arcs draw once on visibility; orbit lines settle in staggered layers. Both respect OS reduced motion, background document visibility, and the app's existing reduced-motion attribute. The action bridge has a subtle lift/press response. No fabricated percentages, rotating task carousel, numbered timer, or section tabs are added.

## Reference translation

- 3038: layered elliptical wireframe → OrbitThreads.
- 3039: linked white action islands → ActionBridge.
- 3040: etched instruments and dot type → ContextArc and DotText.
- 3042/3043: pale blue frost and curved tick marks → LensPanel and ContextArc.
- 3044/3045: breathing room and floating tools → Overview hierarchy and QuietDock.
- 3051: sage/rose material pairings and precise labels → LensPanel tones.
- 3047/3049: organic atmosphere and thin connections → website photography and ContextRail.

## Shared source and migration

`apps/desktop/src/vendor/rabta-ui` is an unmodified, MIT-licensed subset of Rabta Studio 0.4.0. Refresh it with `node scripts/sync-rabta-ui.mjs /path/to/rabta-studio`. Do not edit the copy. It imports no Anime.js, Paper shader, Fluid, or second React runtime. The standalone package still exports the same primitives through `@rabta/ui/lens` and `@rabta/ui/lens.css` for other consumers.

Overview and Capsules receive composition changes. Projects, Connectors, Activity and Settings inherit the new semantic palette, Surface geometry and shell. Their domain layouts, data actions and preferences remain owned by their existing screens. Future visual work should extend these shared owners rather than add another card or overlay framework.

## Verification boundary

Frontend builds and behavior/contrast tests are the automated gate. Native macOS rendering, keyboard zoom, vibrancy, and a signed desktop release require macOS validation before release. No new binary is distributed by this change. Existing published downloads are not replaced by a frontend-only build.

## Rabta family — September 7 update

The current user instruction authorizes unifying the app/site/library and implementing Companion and context handoffs. Earlier visual restrictions and the brainstorm-only limitation are superseded. The product family is Workspace, Companion, Connect, Teams, UI, and future Market merchandise.

`brand.ts` is the canonical palette, type, logo and geometry owner. `brand.css` is generated, never edited separately. App `index.css` preserves semantic error/success roles but its shared neutral/primary values are generated by the sync script. The 35-name app sprite and compatibility glyph entrypoint both use the original `ICON_PATHS` from @rabta/ui 0.5.0. No remaining app UI imports Lucide. Personal accent choices remain supported; Sage is the new default.

Companion is a separate native always-on-top window, opened explicitly from the family launcher. It reads the active capsule through existing commands, refreshes on focus and hub events, and uses actual capture results. Stale reads cannot replace newer ones. Its content scrolls at constrained heights; no essential action relies on an animation or drag. UI preview is tested; native Mac execution remains unverified.

Connect and Teams share one context-handoff dialog, owned by Radix Dialog and the existing Button/Textarea primitives. It previews a bounded allowlist of file paths, web URLs, terminal directories and branch names. URL queries, fragments and credentials are stripped; file content and terminal output are excluded. User-selected categories and optional next-step text are copied only on request. Clipboard rejection leaves selected text for manual copy. No cloud team sync, accounts or AI inference is claimed.

Runtime tests cover behavior and contrast. Full repo strict audit retains existing unrelated gallery/settings/test-fixture findings; do not call the whole project audit clean. New controls are audited through canonical Radix owners. Browser captures use actual React UI and clearly labeled sample connector data. Native app upload is blocked by GitHub integration 403, and the preview build workflow has not run.

## Brand — September 9, 2026

The R mark is retired everywhere. The approved outlined wordmark is the whole identity: the sidebar and Companion keep `ApprovedWordmark`; the Dock icon, favicon, connector icons and social card are regenerated from `site/public/assets/brand/wordmark.svg` (the same path) by `scripts/generate-brand-assets.mjs`, which packs `.icns` and `.ico` itself and rasterises with any Chrome-family browser, so the pipeline runs on Linux and CI as well as a Mac. `apps/desktop/src/assets/brand/app-icon.svg` is the ember tile with the ink wordmark; the R mark SVGs and the unused `wordmark.ts` outlines were deleted. The vendored `vendor/rabta-ui/brand.ts` no longer carries the retired `mark` geometry; the next upstream sync must drop it there too or the sync will bring it back. Restore's small `Mark` keeps the Workspace return-loop, which was never the R.

## Purpose-led update — September 8

The approved rounded lowercase Rabta wordmark replaces the legacy lockup in the shell and Companion. `components/brand/ApprovedWordmark.tsx` owns its outlined geometry, copied from the approved brand study SVG; its exact path matches the Site component and the downloadable brand assets. The existing sync script continues to own color/type/icon tokens, not this approved logo override. Legacy small mark motion remains in unmodified restore components; a complete small-icon/loading-mark migration is not claimed.

`ContextMeasure` replaces decorative tick marks with one mark per saved reference. Its total is actual capsule metadata, not inferred readiness. `RestoreReadiness` separately represents connected-tool availability with one segment per tool, visible connected/total text and the existing detailed tool list. There is no central unconditional success check. Exact counts and zero/grouped states are readable without color or motion. `context-measure.css` owns only this geometry and logo sizing, mapping to app semantic HSL tokens.

Companion keeps the active task, saved-reference count and actual Capture action together in its compact surface. No new random dock, timer, simulated AI success or auto-sharing. Capture rig imports the same new stylesheet as the native entry. All 773 desktop unit tests passed after correcting duplicate accessible logo naming. Frontend TypeScript/build pass. Browser preview was blocked from reaching localhost, so refreshed screenshots and browser visual QA were not completed; native Mac validation remains required.

## Family refinement — September 8, 2026

The latest critique requires one Studio and exactly five family products. FamilyEmblem.tsx now shares the Site's original 48-unit paths; the approved outlined wordmark remains primary. Restore's Mark now uses Workspace's return-loop rather than the retired R. FamilyLauncher distinguishes Workspace, Companion, Connect and Teams, then a single Studio plus its free utility entry.

Toolbar controls adapt at 1100/850px without changing titlebar ownership. Settings control rows stack inside narrow panes. ContextHandoff retains shared dialogs/fields, shows the Connect/Teams symbols, and ignores stale clipboard completion after content or dialog changes. Companion uses its own family symbol.

Actual app components were rendered with synthetic capture data and inspected across Overview, Capsules, Projects, Connectors, Activity, Settings, ContextHandoff and Companion. An 820px window was checked for toolbar and Settings alignment. These are source previews; native macOS capture, restore, always-on-top behavior and signing remain separate release gates.

## Studio utilities — September 9 integration

### Intent

Rabta is a family of connected tools for calm, focused work. The desktop app keeps workspaces ready to resume. Studio provides useful editing and conversion tools. Their integration should reduce setup and duplicate work.

### Runtime sources of truth

- App shell and components: `apps/desktop/src/shell` and `apps/desktop/src/components/ui`.
- Desktop tokens: `apps/desktop/src/index.css`; HSL background, foreground, card, primary, muted-foreground and border.
- Shared utility geometry and behavior: `apps/desktop/src/features/utilities/shared`.
- Desktop adapter: `features/utilities/ui.tsx` and `desktop.css`. It injects existing Button, Input, Textarea and Radix Select; no second component framework.
- Website adapter lives in the Rabta site repository. The shared files are vendored by `scripts/sync-studio-utilities.mjs`, with hashes. Edit shared source here, then sync.

### Visual rules

Useful working surface first, with search, a grouped tool rail, and one active editor. Quiet graphite and sage in Studio; semantic host tokens in the desktop app. Original outlined icons, consistent stroke weight, clear labels. No decorative dashboard metrics. Motion communicates selection and real timer progress; reduced motion removes transitions.

### Scope and continuity

The merged app includes the approved Lens redesign and the utility workbench. Its adapter inherits the shared Instrument Sans, Inter and Geist Mono font tokens, semantic colors and panel geometry. The family launcher opens the native Utilities view; the separate design library remains an explicit web destination.

### Verification

See `UX-CONTRACT.md` and `docs/rabta-suite.md`. The user's September 2026 decision removes the blanket no-account rule; `docs/account-policy.md` owns the replacement. Basic tools remain local while real accounts progressively support deliberately saved work. Mac actions are real native commands and need macOS verification before a signed release.

## Desktop toolkit and Teams — September 9 expansion

User-authorized evolution: utilities belong in the app, with Everyday, Developer, Creator and Student recommendations inside one search/rail. The existing shared fonts, semantic HSL palette and Lens geometry remain canonical. Creative processors inherit desktop Button/Input/Textarea/Select/Progress owners through `features/creative/ui.tsx`; native exports use the operating system Save panel.

Teams uses the same shell with one working area beside explicitly published previews. Session state remains mounted when navigating away, preserving private drafts and the active connection. No decorative presence indicators, synthetic teammates, app-window streaming or automatic sharing. Server responses own status.

Reconcile drift: old notes describing GitHub as blocked and Mac preview as unbuilt are historical. PR #4's initial Apple Silicon preview build passed; subsequent toolkit changes require a new passing run. Website-hosted tools are retired under the current instruction. Team text collaboration supersedes the earlier manual-handoff-only scope; see `docs/product-direction.md` and `docs/teams-service.md` for precise boundaries.
