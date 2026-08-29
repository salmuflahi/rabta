# Ink redesign — recorded divergences from the Console v2 handoff

Date: 2026-08-28. Product owner's call ("make this a $15k app design").
Everything not listed here still binds exactly as the handoff wrote it.

## Motion retune
The brand curve is now `cubic-bezier(0.16, 1, 0.3, 1)` (crisper expo-out;
was 0.2/0.8/0.2/1), and the bound durations dropped one step each:
fast 120→100, standard 180→160, switch 170→150, sheet 300→260.
`sidebar` stays 280 (pinned in three places). `SPRING_EASE`
(0.34, 1.45, 0.64, 1) exists for terminal "landed" pops only — icon-sized,
one-shot, never layout-affecting. Source of truth: `src/lib/motion.ts`,
pinned by `motion.test.ts`.

## The mark
The brand mark is the return glyph (stroke + orange arrowhead). The
arrowhead is permanent literal #FF6B2C wherever the mark renders — the one
permanent orange in chrome, exempt from the accent budget because it is
the identity, not an action. Stroke-draw (stroke-dashoffset, one-shot,
icon-sized, finished-state under reduced motion) is a sanctioned brand
gesture for the mark only. In-app badges paint the mark on ink #0C0E12
(the sidebar ground — the app's one ink). The orange-tile knockout
(`rabta-mark.svg`) is the Dock/marketing icon and never renders inside
the app.

## Surfaces
`.surface-rich` (token gradient card→muted) is sanctioned for hero panels;
`.surface-live` (same + ember veil + 0.5px ember hairline ring) is the ONE
live surface per screen — currently Overview's hero. Ember tokens
(`--ember-veil`/`--ember-line`) are brand warmth, constant across accent
choices; applyAccent never rewrites them.

## Restore ceremony
Progress renders as a 3px "crown" along the sheet's top edge (shimmer =
restore-shimmer over `--ember-line`; resolve = scaleX sweep in ok/warn/bad).
The folded-corner mark is retired app-wide. Completed hold is 480ms (was
220) so the check draw and bloom land. Failed rows use the bad (red)
family — `--bad-soft` was minted for it; warn stays for skipped/waiting.
Hairlines are 0.5px at full token (`border-*-[0.5px] border-border`)
everywhere, replacing the border-border/60 recipe.
