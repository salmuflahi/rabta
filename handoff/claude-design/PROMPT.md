# Rabta website, from zero

Attached: `brand-guidelines.md`, the source of truth for everything it covers, and the folder `rabta-claude-design`: the marks, the fonts, ten product loops of the real app, app screens, the story documents, the shipped copy of every page, and two reference lists. Read all of it before you design anything.

## The job

Design the public website for Rabta, rabta.build. Rabta is a free Mac app that writes down where you were in a task (the files, the terminals, the browser tabs, the git branch) so you can leave, and later return to all of it in one move. Local only, no account, no server, honest receipts, and a way for AI agents to read the same memory.

The current site at rabta.build is the thing to beat. Do not look like it. Not its layout, its section order, its nav, its cards, its hero with a window in it, its bento. Start from a blank page. What carries over: the mark, the name in Latin and Arabic (Rabta, رابطة), ember as the accent, the facts, and one line: "Leave the task. Return to all of it."

Audience: developers on macOS who work in an editor, several terminals, a browser and git at once, who get interrupted all day, who distrust software that phones home, and who can tell craft from decoration in half a second. Second audience: people running Claude Code, Cursor or Codex who want the agent to know what they were doing. They read fast and hate being sold to.

The page has one job. The visitor feels the cost of an interruption, feels the relief of returning to everything at once, believes it is local and honest, and downloads the app.

## The story: the homepage is a film you scroll

Write the homepage as a scroll-driven film in chapters. Each chapter pins to the viewport and plays as the visitor scrolls. Hard cuts between chapters, no crossfades. The type is the set and the product footage is the cast. Nothing is decorative.

0. Cold open, once per session. Black. The mark draws itself: stem, then bowl, then the leg in ember. رابطة appears under it in Reem Kufi, then the Latin name. Two seconds, skippable, never repeated in the session.
1. Late. A working desk built from real app footage and type: an editor with files open, three terminals, a wall of tabs, a branch called feat/connector-reconnect. One line types itself in huge display type: "You were in the middle of something." A notification slides in from the corner. The visitor scrolls and the desk freezes.
2. The scatter. As the scroll continues the desk comes apart: tabs fly off frame, terminal panes tilt away and blur, the branch name unspools letter by letter into nothing. Copy: "Then you left." Then: "Tomorrow the tabs are gone, the terminals are somewhere else, and the branch is a guess." Do not invent a statistic here. The feeling is the argument.
3. The capsule. Reverse it. Four kinds of pointer (files, terminals, tabs, branch) gather from the edges into one object at the centre. Show it with real depth, four planes stacked in space; the loop capsule-anatomy is the reference. Copy: "Rabta writes down where you were. Four pointers. One file. Your disk."
4. Leave. One click. The loop move-capture or hero-return plays the real Save State moment. Copy: "Leave the task."
5. Return. The climax. Everything comes back in order: the branch first, then the editor, then the browser. The loop move-return. The receipt prints itself line by line using the real vocabulary and the real fixture numbers from copy/home.md. Copy: "Return to all of it." This line gets the largest type on the site.
6. Focus. The switch. Turning it on closes half of what is open and keeps what matters: unsaved files, busy terminals, pinned tabs. Show the split as one scene that divides. Copy from the focus section of copy/home.md.
7. The receipt. The honesty chapter. Four words and what each means: Restored, On next reload, Skipped, Put away and kept. Ledger typography in mono. This is where the brand earns trust.
8. Agents. A terminal card. The command `claude mcp add rabta -- npx -y @rabta/mcp` types itself, then the briefing in story/agent-briefing-example.md types out at reading speed. Copy: "Your agent starts where you left off." Status line: ships with the next release. Never claim it is published.
9. Local. Where it lives: one file under Application Support. No server, no account, no telemetry, no network. Make this physical: the data folder as an object, a request counter that stays at zero, or a map with no lines leaving the machine. Choose one.
10. Where this goes. The roadmap from story/ROADMAP.md as a line that draws itself through three states: Shipping, Planned, Later.
11. Download. Free. 5.5 MB. macOS 11 or later, Apple silicon. MIT licence. The mark, huge, half off the edge of the screen. One button.

Between chapters the works-with row appears once, as a marquee: VS Code, Cursor, Zed, Ghostty, iTerm2, Terminal, Warp, Chrome, Arc, Firefox.

Inner pages, with their copy in copy/: Why (an essay with kinetic pull quotes), Capsules (how it works, with diagrams that draw themselves), Agents, Setup (a stepper with progress), FAQ, Roadmap, Changelog, Contact, Privacy, Brand, 404. Each inner page opens with its own short entrance, not a copy of the homepage.

## Motion: everything moves, nothing is idle

- Scrolling is smooth, chapters are scrubbed by the scroll, and a thin progress line shows where in the film the visitor is.
- Type: every headline enters through a mask, by word or by line. Long lines fill with the scroll. Terminals type. Display type answers the scroll on a variable axis (weight, width or optical size). Links draw their underline and their arrows travel on hover.
- Cursor: on fine pointers a small ember dot replaces the cursor. It grows into a ring over links, becomes a "Play" label over loops and a "Drag" label over galleries, and hides over text fields.
- Buttons: magnetic within 24 px of the cursor. On hover the label slides up and its twin slides in from below. Press scales to 0.97. Every button has loading and done states, and done draws a tick.
- Cards: tilt toward the cursor up to 6 degrees, a spotlight border that follows the pointer, content with slight parallax inside.
- Loops: autoplay when in view, hover scrubs, click opens a cinema view with the receipt beside it. The poster is the first frame, never a device mockup.
- Page transitions: the mark travels. On a click the mark scales up and covers the page, and the next page reveals under it, 400 ms.
- Nav: a floating pill that shrinks on scroll, a sliding indicator under the active link, a menu that opens as a staggered list with the current chapter named.
- Numbers count up when they arrive. Lists stagger. Images reveal through a mask. Marquee once, for the works-with row only.
- Ambient: film grain on dark chapters at two to three percent, light that follows the scroll in the night chapters, ember bloom on the mark.
- Timing: entrances 500 to 900 ms with an expo-out ease, exits faster than entrances, hovers 120 to 180 ms. Each pinned chapter is worth 2.8 to 4.7 seconds of scroll. Camera moves commit: pushes of 1.7x or more, never a lone 1.05 to 1.2x ease-in-out zoom.
- Reduced motion: every element has a static end state, loops show their posters, the cold open is skipped, and the cursor is the system cursor.

## Three directions first, then one site

Before building anything, give me three directions as boards: the hero, chapter 2, chapter 5, and a component strip (button states, nav, a card, a loop frame), on desktop and phone. They must look nothing like each other and nothing like rabta.build.

A. Night studio. Cinematic dark with real light in it, not flat black. Film grain, huge optical-size type, the loops as full-bleed film with letterboxing.
B. Instrument. The site as a hardware panel: graphite, engraved lines, one ember LED, real dials and switches for the focus chapter, mono readouts. Think Teenage Engineering and Daylight, not a game UI.
C. Signal. Brutalist and typographic: a giant wide grotesk, black, white and ember, the rhythm of a terminal, the story told in type with footage punched through the letters.

I choose one, then you build the full site in it.

## Typography

Not Inter for display. Pick a variable grotesk with real character and use its axes in motion: Bricolage Grotesque (optical size and width), Unbounded, Syne or Anybody for display, Instrument Sans or Geist for body. Reem Kufi for رابطة only. Geist Mono (in fonts/) for receipts, terminal, code and numbers. Only fonts we can self-host.

## Colour

Ember #ff6b2c is the only accent and appears once per view. The ground is yours per direction: filmic dark, graphite, or pure black and white. Banned: petrol or teal, iris or purple, Apple white, AI gradients, cream with brass.

## Words

The voice is in brand-guidelines.md. Sentence case. No dashes of any kind in visible copy. No exclamation marks. Never "pick up the pieces". Every claim must come from story/ or copy/. Do not invent numbers, testimonials, logos or customers; there are none yet. Where something is not shipped (the MCP package on npm, the next app release) say "ships with the next release". Product words: capsule, connector, receipt, focus mode, Agent access, restore, Save State.

## Effect vocabulary and references

references/framer-free-assets.md lists the free Framer marketplace components and plugins whose behaviour I want, mapped to the chapters. Use them as the reference for how each effect should feel. references/sites.md lists the sites to study and the one thing to take from each.

## Deliver, in order

1. The three direction boards.
2. In the chosen direction: the homepage as an interactive HTML prototype with the scroll film working, plus Why, Capsules, Agents, Setup and Download, each with a phone layout.
3. A motion spec: a table of every animation with element, trigger, duration, easing and reduced-motion fallback.
4. A component sheet with every state (rest, hover, press, focus, loading, done, disabled) for buttons, links, nav, cards, loops, the switch, inputs, code blocks and receipts.
5. Export as standalone HTML and use Handoff to Claude Code, so the site can be built for real in Astro.

## Do not

- Reuse the current site's layout, sections or components.
- Use stock photography, illustrated people, 3D blobs or mesh gradients.
- Use three equal feature cards, a centred hero with a subtitle and two buttons, or a bento of features.
- Put the loops in device mockups. They are already the app.
- Add a chatbot, testimonials, a pricing table or a newsletter. None of these exist.
