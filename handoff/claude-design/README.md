# Rabta for Claude Design

Everything Claude Design needs to design a new rabta.build from zero: the prompt, the brand file, the marks, the fonts, ten loops of the real app, app screens, the story documents, the shipped copy of every page, and two reference lists.

## How to use it

1. Open claude.ai/design, or Design in the Claude desktop app.
2. Start a new project. In the very first message attach `brand-guidelines.md` and this whole folder (or the zip), and paste the contents of `PROMPT.md` as the message text.
3. Round one: it returns three direction boards. Pick one, or say what to combine.
4. Round two: it builds the site in that direction. Go chapter by chapter. Ask for the motion spec and the component sheet at the end.
5. Export: standalone HTML, and Handoff to Claude Code. Then, in this repository, ask Claude Code to build it for real in `site/` (Astro, the strict CSP, the test suite).

The folder is also committed at `handoff/claude-design/` in github.com/salmuflahi/rabta, so "link a code repository" works as an alternative to uploading. The app's own tokens live in `apps/desktop` and `design-system/`; `/design-sync` from Claude Code can publish those as a design-system project later, but this brief does not need it.

## Contents

- `PROMPT.md`: the brief, ready to paste.
- `brand-guidelines.md`: what is fixed, what is open, voice, facts, constraints.
- `brand/`: the mark in every variant, the lockups, the favicon, the social card.
- `fonts/`: Inter (body fallback), Reem Kufi (the Arabic name), Geist Mono, with licences.
- `product/loops/`: ten desktop loops of the real app (mp4) with their poster frames (jpg).
- `product/screens/`: the app's screens at 1600 px (webp) and 1024 px (png).
- `story/`: vision, roadmap, privacy policy, the brand spec, an example agent briefing, the release facts.
- `copy/`: the shipped copy of every page, as plain text. True facts to reuse.
- `references/`: sites to study, and the free Framer marketplace assets to use as the effect vocabulary.
