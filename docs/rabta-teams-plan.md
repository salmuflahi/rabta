# Rabta Teams: share the work, not the explanation

Plan, September 9, 2026. Supersedes the hand-off-first plan of September 8 and keeps its state, permission and validation rules. Everything below is a proposal until its acceptance gate passes; the running service in `services/teams` and the desktop Teams page are the starting point, not the finished product.

## The idea

Git changed programming by making the snapshot the unit of work: cheap to take, cheap to branch, safe to merge, owned by everyone. Teamwork never got that. It still runs on descriptions of work: messages that say which file, calls that show which screen, notes that record what was decided. Every description is written once and reconstructed by hand on the other side. That reconstruction is the back-and-forth.

Rabta already holds the thing the descriptions describe: the capsule, the whole working context around a task, captured from the editor, browser, terminals and git. Teams makes the capsule the unit of teamwork.

**Git versions the code. Rabta Teams versions the work around it.**

Three primitives, and only three:

| Primitive | What it is | Git analogy |
| --- | --- | --- |
| **Capsule snapshot** | A reviewed, sanitized picture of a task's context: project-relative files, sanitized links, terminal folders, branch, pins. Content-addressed and immutable. | tree |
| **Thread** | A task's shared timeline. An append-only, hash-chained log of what people did to the work: knots, hand-offs, decisions, splits, weaves. Every member holds a full copy; entries made offline append on reconnect. | commit history |
| **Knot** | One point on a thread, tied by one person at one place: a file and line, a link, a terminal folder, a commit, a spot on an image. It carries a note, a request, or a decision. Anyone can pull the thread to a knot and land exactly there. | commit, and the blame line under it |

Verbs are plain: **Step in** (open a teammate's capsule on your own Mac), **Follow** (your editor tracks theirs, live), **Hand off** (send the task with a next step), **Split** (take a copy to try something), **Weave** (bring chosen parts back). Nothing else needs a name.

Because a snapshot holds references and not file contents, weaving two snapshots never produces a textual conflict: it is a choice of which tabs, files, folders and knots come back. Code changes stay in git branches, which the thread links to. Rabta never replaces git; it wraps the human part around it.

## A day with it

Sam opens a task she was handed overnight. The next step is the first line of the brief. One click and her editor has the same four files open, the terminal sits in the same folder, the branch is checked out, and a knot marks the line where Alina stopped: "The retry fires twice; start here."

Sam ties a knot on line 118: "This is the timeout. Alina, which value did the client agree to?" Alina, in another time zone, sees it in her inbox in the morning, ties a decision knot: "30 seconds, agreed with the client on the 4th." Sam acknowledges. That decision now lives on the task, not in a chat search.

Later the same day they are both online. Sam presses **Together**. Alina steps in and follows: Sam's cursor appears in Alina's editor with Sam's name on it, and when Sam switches files, Alina's editor switches too. They point at lines instead of describing them. Four minutes later Alina takes the lead, splits the capsule to try a different fix, and weaves back the two tabs and one note that mattered. Sam's task keeps a link to Alina's branch.

No screen was streamed. No message said "which file?". Nothing left either Mac except paths, links, a branch name, cursor positions while Together was on, and the words they wrote.

## What turns hours into minutes

| Today | With Teams | Time |
| --- | --- | --- |
| "Where were you when you saw this?" Links, screenshots, a call. | Step in: land in the teammate's exact context, on your own machine. | seconds |
| "Let me share my screen." A meeting to walk through code. | Together + Follow: named cursors in the editor, no video, either side can lead. | minutes |
| "Which line?" Descriptions of places. | Knots: a note at a file and line, a link, a terminal folder, a spot on an image. One click lands there. | seconds |
| "What did we decide?" Search chat, ask again. | Decision knots with acknowledgement, on the task, exportable to a pull request. | seconds |
| Onboarding by chat over a week. | A starter capsule: the files to read first, the docs tabs, the terminals, and knots that say why. | one click |
| Daily standup. | Pulse: who is in which task, since when, last knot, from published activity only. | none |
| "Let me set up a copy to try that." | Split, work, weave back. | seconds |
| Handing a task across time zones with a wall of text. | Hand off with a next step and "start here" knots; the receiver resumes in one click. | one sentence |

## Free here, paid elsewhere

Rabta Teams is MIT and self-hosted, so the things other tools meter are simply part of it. No seat pricing, no history limit, no feature tiers. A managed Rabta hosting service may cost money later, and the repository's rule stands: no price, checkout or usage tracking before that service exists and its cost is known.

| Usually metered | In Rabta Teams |
| --- | --- |
| Multiplayer cursors and follow mode | Included, in the brief and in the editor |
| Unlimited members and rooms | Limited only by the operator's server |
| Full history | The thread is append-only and stays |
| Decision logs and acknowledgements | Included |
| Async hand-offs with context | Included |
| Onboarding templates | Starter capsules |
| Standup automation | Pulse, from published activity |
| Image annotation | Knots on assets |
| Sign-in walls and SSO tiers | No accounts; keys and single-use invitations |

## What it looks like

One surface, the Room. Three regions, no tabs:

- **People**, along the top. Avatars with a coloured ring; the ring colour is that person's cursor colour everywhere. Status is what they published: working, away, or nothing.
- **The thread**, down the middle. Knots in time order, grouped by task, newest at the bottom like a conversation you can scroll back through. Each knot shows who, where (a chip that lands you there), and the words. Requests show how long they have waited. Decisions show who acknowledged.
- **The capsule**, on the right. Whatever task the thread has focused: files, links, folders, branch as chips, the last snapshot's time, and one primary button: **Step in**. When someone is Together, their name sits under the button with **Follow**.

Everything else is a gesture on those three: tie a knot from any chip, hand off from the capsule header, split from the same menu. Advanced controls (templates, weaving, export) live behind one "More" and never on the first screen.

**Cursors.** A 16 px arrow with a 2 px paper edge so it reads on any ground, and a name pill hanging from its lower right: 11 px, medium weight, 6 px radius, the person's colour at 90 percent with ink text, 4 px gap from the arrow. Names cut at 14 characters. After four seconds without movement the pill fades to a dot; after sixty seconds the cursor is gone. Movement is interpolated on the brand spring (stiffness 260, damping 18) between 100 ms updates, so a laggy network reads as a smooth hand, never a jump. You never see your own cursor as a teammate's. Colours come from the Lens ladder: sage, blue, amber, rose, lilac, mint, slate, sand, with darker variants on paper; ember stays the accent and is never a person.

**Reduced motion** shows cursors at their last position with no interpolation. **Narrow windows** stack the three regions in the order people, capsule, thread.

## Architecture, on what exists

`services/teams` already has rooms, members, single-use invitations, private lanes, published previews, proposals with revision checks, assets, explicit presence and an SSE change feed, all behind bearer member keys and an atomic durable store. Keep every one of those rules. Add:

1. **Snapshots.** `POST /rooms/:id/snapshots` stores a reviewed capsule snapshot, addressed by the SHA-256 of its canonical JSON. Contents: project identifier, relative file paths, sanitized `http(s)` links without query or fragment, terminal folders relative to the project, branch, pins, and the knots it was taken with. Never file contents, terminal output or absolute paths. The desktop app builds it with the existing hand-off sanitizer (`features/handoff/context.ts`) and shows the review sheet before anything is sent.
2. **Threads.** `POST /rooms/:id/threads/:task/entries` appends an entry `{prev, author, lamport, kind, place?, text?, snapshot?, parents?}` and returns its hash. `prev` is the hash of the entry the author last saw; the server stores entries in arrival order and clients order by `(lamport, author)`, so two people knotting offline both land on the thread with no conflict. `kind` is one of knot, request, decision, acknowledge, handoff, accept, split, weave, link. `GET /threads/:task?since=` pages the log. Entries are immutable; a correction is a new entry that references the old one.
3. **Together.** An ephemeral channel, separate from the durable store: `POST /rooms/:id/together` with `{task, file, line, column, selection?}` at most ten times a second per member, fanned out over the existing SSE feed as `cursor` events with a 250 ms coalescing window. Nothing about it is persisted or logged. Leaving Together, closing the app, or 60 seconds of silence clears the member's cursor for everyone.
4. **Editor cursors.** A new connector capability in the protocol: `editor.cursor` events from the VS Code extension (file, line, column, selection) while Together is on, and an `editor.showCursors` command that the extension renders as decorations with the name pill. The browser connector reports only the active tab's sanitized URL while Together is on. Both are opt-in per session, both are visible in the Debug activity log like every other hub message, and both are limited to files inside the shared project.
5. **Templates and Pulse.** A starter capsule is a snapshot flagged by the owner; Pulse is a read of the last published entry per member and needs no new data.

The desktop client keeps its rules: credentials in memory, one detail pane, the existing restore preview and receipts, the existing project-to-folder mapping chosen once by the receiver, missing tools reported per item. The MCP package can later expose a thread summary as explicit AI context; it must be selected by the user, like every Connect hand-off today.

## Consent and privacy

- Nothing is shared by taking a snapshot; sharing is a separate, reviewed action. Nothing is streamed by opening the Room; Together is a button, on by the person being followed, and it shows a persistent indicator while on.
- Only metadata crosses the wire: paths relative to a project, sanitized links, folder paths relative to a project, branch names, cursor coordinates, and the words people type. File contents, terminal output, keystrokes, page contents and screenshots never do. Assets are explicit uploads with visible limits.
- A shared path grants no permission. Step in maps the project to a folder the receiver already has; missing files and branches are explained one by one. Imported text is never executed.
- Presence is what you publish, expires in 90 seconds, and is cleared on restart. There is no idle detection, no keystroke counting, no window watching. Pulse reads published entries only.
- Revocation ends live access and future reads; it cannot recall what a member already saw. A self-hosting operator can read the store; it is not end-to-end encrypted, and the docs say so. A hosted service needs a published retention and deletion policy before it exists.

## Phases and gates

Each phase ships only when its gate passes with real pairs, following the validation rule of the earlier plan: five pairs, real tasks, measured against their existing chat process.

**1. Step in** (about three weeks). Snapshots, the thread with knots and hand-offs, the inbox, Step in with project mapping, the Room's three regions. Gate: a receiver lands on the sender's "start here" file within 60 seconds of accepting; repeated Send never duplicates; no absolute path or credential appears in any stored entry; revoked members are denied on every route; keyboard and 760 px window flows are complete.

**2. Together** (about four weeks). Cursors in the brief and in VS Code, Follow with either side leading, requests with waiting time, browser tab following. Gate: cursor latency under 300 ms on a LAN and under a second across the internet; a cursor disappears within five seconds of leaving; nothing is shown from a file outside the shared project; Together off means zero cursor traffic, verified in the activity log.

**3. Remember** (about three weeks). Decision knots with acknowledgement, Pulse, thread search, export to Markdown and to a pull request description. Gate: a pair can answer "what did we decide and when" from the thread without opening chat; export round-trips every knot with its place.

**4. Grow** (about four weeks). Split and weave, starter capsules, knots on images, the Connect summary. Gate: a new teammate reaches a first useful reference from a starter capsule in under five minutes; weave shows every choice and never drops a knot silently.

After that: load tests against the intended team size, an operational backup story, and the hosting decision.

## Not this

- No video, audio or screen streaming. Following is metadata; it is cheaper, more private, and works on any connection.
- No chat product. Knots are anchored to places; a reply is a knot on the same place. General conversation stays wherever the team already has it.
- No task board, no tickets, no time tracking, no activity scores.
- No automatic merging of anything. Weave is a choice a person makes, every time.
- No feature that only works when a Rabta server is up. Snapshots, knots and hand-off drafts are written locally first and sync when the room is reachable.

## Status — September 10, 2026

Phase 1 and the parts of phases 2 and 3 that need no new consent are in the source, verified on Linux with the service's real HTTP server, the desktop test suite, the Rust unit tests and the connector tests. Real-pair gates, cursor latency and everything that needs a Mac stay open.

- **Service**: content-addressed snapshots, append-only hash-chained threads with Lamport ordering and per-kind rules, the inbox, and the ephemeral Together channel with its own rate budget and 60-second expiry. See `teams-service.md`.
- **Desktop**: the Room sits at the top of the Teams page: People (colour rings, presence, Leading badge, Follow), Thread (thread chips, inbox with Step in and Decline, entries with places, acknowledge, the composer for knots, requests, decisions and hand-offs with "attach my current capsule") and Capsule (the latest snapshot, its places, project mapping and Step in). Step in imports the snapshot as a local task under the chosen project through a Rust command that refuses absolute paths and parent segments, then opens it through the normal restore with its receipt, and records `accept` on the hand-off. Threads export as Markdown. Named cursors move on the brand spring over the Room.
- **VS Code connector**: with Together on, the editor reports its cursor project-relative at most ten times a second; teammates' cursors are drawn with their name and colour; Follow reveals the leader's file and line. Together off means no cursor traffic and no decorations.
- **Not built yet**: browser tab following, Pulse, thread search, export to a pull request, Split and weave in the interface (the service accepts them), starter capsules, knots on images, local-first drafting while the room is unreachable, and the hosting decision.

## Open questions to settle with real use

1. Do teams want the thread per task, per project, or both? The data model allows both; the first Room shows one per task.
2. How often does Follow need "take the lead"? If rarely, it stays a two-step; if constantly, it becomes a single toggle.
3. Is a knot's place stable enough anchored to a line number plus a hash of the line's text, or does it need a small text window like review comments use?
4. Which acknowledgement rule feels right for decisions: everyone mentioned, or anyone who steps in afterwards?
