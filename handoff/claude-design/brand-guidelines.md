---
brand: Rabta
archetype: Sage with a maker's hands. Calm, exact, quietly confident.
positioning: Rabta remembers where you were, so you can leave a task and return to all of it. Local, honest, free.
voice: plain, exact, warm without being cute
colors:
  ember: "#ff6b2c"
  ember_deep: "#c2501b"
  ink: ["#0a0b0e", "#14161b", "#1e2128"]
  paper: ["#ffffff", "#f5f5f7", "#eaeaee"]
  text_on_ink: ["#f5f5f7", "#b4b8c2", "#7c808b"]
  text_on_paper: ["#0e0f12", "#4a4d57", "#6f7380"]
typography:
  display: open. A variable grotesk with character. Never Inter.
  body: Instrument Sans or Geist
  arabic: Reem Kufi, for the name only
  mono: Geist Mono
---

# Rabta brand guidelines

Use this file as the source of truth for every decision it covers. Where it says "open", decide, and keep the decision consistent across the whole site.

| Fixed | Open |
| --- | --- |
| The wordmark: one path, one colour, never redrawn | The ground colour and material, per direction |
| The name in Latin and Arabic | The display typeface (never Inter) |
| Ember as the single accent | The radius scale, chosen once |
| The facts, the vocabulary and the voice | Layout, composition, imagery made from the product |
| The line "Leave the task. Return to all of it." | Every other line of copy, within the voice |

## The name

Rabta (رابطة) is Arabic for a bond, a tie, the thing that holds two ends together. Say RAB-ta. Write Rabta in Latin type in running text. The Arabic name appears as a signature under the wordmark, set in Reem Kufi, never stretched, never transliterated inside the Arabic, never used as decoration elsewhere.

## The wordmark

There is no symbol. The brand is the word rabta: five rounded lowercase letters as one outlined path (viewBox 0 0 961 293), filled with one colour, the text colour of the surface it sits on. The ember is never on the letters.

Files in brand/: `wordmark.svg` (currentColor, for inlining), `wordmark-ink.svg` (#0A0B0E, for paper surfaces), `wordmark-paper.svg` (#F5F5F7, for ink surfaces), `favicon.svg` (the tile: the ink wordmark at 80 percent width on an ember squircle), `og-cover.png` (the social card).

Rules:
- One colour, the text colour of the surface: ink on paper, paper on ink. The tile is the only place the ember and the letters share a frame, and there the letters stay ink.
- When animated, it arrives rather than draws: it rises into place with a fade over 1000 ms and settles on the spring; whatever follows it starts at 1100 ms. Under reduced motion it is simply there.
- Clear space equal to one cap height on all sides. Never below 22 px tall; the tile never below 16 px. Under those, write the name in type.
- Never outlined, rotated, stretched, put in a circle, shadowed, gradient-filled, or set in a typeface instead of the path. Never on petrol or purple.

## Colour

Ember is the brand and the only accent: one ember element per view (a button, a drawn line, a live indicator). It is never on the letters of the wordmark. Deep ember is for pressed and for hover on ember.

Everything else is one neutral ladder. The ink and paper stacks above are what the app uses. The site's ground may be a filmic dark with light in it, graphite, or black and white, depending on the direction. If a new neutral is introduced it must be one ladder at one temperature, never warm and cool greys together.

Banned: petrol or teal, iris or purple, AI gradients, cream with brass, the default Apple white look.

## Type

Roles:
- Display: headlines and chapter titles. One family, and its variable axes used in motion. Tight tracking at display sizes. Never Inter.
- Body: 65 characters per line at most, line height 1.5.
- Arabic: Reem Kufi, the name only.
- Mono: Geist Mono for receipts, terminal, code, hashes, paths and numbers. Numbers tabular.

Never letterspace lowercase. Never use a serif for emphasis inside a sans headline; use weight or italics of the same family.

## Spacing and shape

An 8 px rhythm. One radius scale chosen per direction and written down (for example: all sharp for Signal, 6 and 12 px for Night studio, 2 px for Instrument). Buttons and inputs share the scale. Hairlines are 1 px at 12 to 16 percent of the text colour.

## Motion tokens

- Brand ease: cubic-bezier(0.16, 1, 0.3, 1). Expo-out for entrances, expo-in for pushes, linear for drifts.
- Durations: hover 120 ms, state 240 ms, reveal 480 ms, ceremony 900 ms.
- Spring: stiffness 260, damping 18.
- The wordmark arrives over 1100 ms: the rise, then the spring above.
- Exits are faster than entrances.
- Reduced motion: static end states, posters instead of loops, no cold open, the system cursor.

## Component conventions

- Buttons: primary is ember with ink text; secondary is outlined in the text colour; on paper the ink button. States: rest, hover, press (scale 0.97), focus-visible (2 px ember ring, 2 px offset), loading, done, disabled. One hover language for every button on the site.
- Links: the underline draws on hover; arrows travel 4 px.
- Cards only when elevation means something. Otherwise hairlines and space.
- Receipts: mono, ledger layout, the four words: Restored, On next reload, Skipped, Put away and kept.
- Loops: never inside a device mockup. The poster is the first frame.

## Voice and tone

Plain, exact, generous with facts, stingy with adjectives. Say what happened, then what it means. Sentence case. No dashes in visible copy. No exclamation marks. No "seamless", "supercharge", "unleash", "effortless", "AI-powered", "enterprise-grade".

Do: "Restored 4 files, 3 terminals. Chrome was closed, so its tabs wait for it."
Don't: "Seamlessly restore your entire workspace in one click!"

Do: "Leave the task. Return to all of it."
Don't: "Pick up the task. Not the pieces." (retired; never use)

Do: "Nothing leaves your Mac."
Don't: "Enterprise-grade privacy you can trust."

## Product vocabulary

capsule (what is saved), connector (the bridge to an editor or a browser), receipt (what a restore reports), focus mode (close half, keep what matters), Agent access (the local socket agents use), restore or return, Save State (the button), pin (always open this).

## Facts that do not change

Version 0.1.0. DMG 5.5 MB. macOS 11 or later. Apple silicon. MIT licence. Free. No account. No server. No telemetry. The app makes no network calls. Capsules live in one SQLite file under ~/Library/Application Support/com.omnibus.dev/. The MCP server @rabta/mcp ships with the next release and is not yet on npm. Connectors: VS Code, Cursor, Zed, Ghostty, iTerm2, Terminal, Warp, Chrome, Arc, Firefox. Everything else is in story/ and copy/.

## Hard constraints

No stock photos. No illustrated people. No mockup frames around the loops. No testimonials, logos or numbers that are not in story/ or copy/. No purple. No dashes. No exclamation marks. No chatbot widget.
