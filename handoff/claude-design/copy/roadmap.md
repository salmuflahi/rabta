<!-- Shipped copy of /roadmap/ on rabta.build, 2026-09-05. Facts here are true; reuse them, do not invent new ones. -->

Roadmap
# Where this goes.
Everything here is real work in the repository, at the stage it is named
under. Nothing carries a date, because nothing here ships until it is
right. What already shipped is on the
changelog.
Reflects Rabta 0.1.0 · updated 4 September 2026
Shipping
## Next up.
Published, or with a store.
### Connectors 0.2.0: focus mode's reconcile step
The close half of focus mode lives in the connectors:
tabs.close, editor.closeFile,
terminal.dispose. Live on Open VSX and the Visual
Studio Marketplace; the browser connector is in Chrome Web Store
review. The desktop app stays at 0.1.0: this is a
connector-only bump, and the app does not drive the closing half
yet.
### Agents can read capsules
An MCP server, @rabta/mcp, lets Claude Code, Cursor
and Codex list the capsules on this Mac and load one as a
briefing: the files, the terminals, the tabs, the branch.
Reads come straight from the same database the app writes.
Capture and restore from an agent go through Agent access, a
switch in Settings that opens a local socket file and closes it
again; the receipt is the one the app shows. How it
works.
### A higher editor floor
0.2.0 raises engines.vscode from ^1.85 to ^1.93.
Busy-terminal detection needs shell-execution events that are only
stable from 1.93, and there is no fallback for older editors,
anyone on 1.85 to 1.92 stops seeing updates until they upgrade.
Queued
## Planned.
Known, wanted, not started or blocked.
### Focus mode's close half, in the app
The connectors can already close tabs, files and terminals. The
app side that drives them is the work, and the rule that makes
focus mode trustworthy has to hold there: never an unsaved file,
a running terminal, or anything pinned.
### Intel and universal macOS builds
The current bundle is arm64 only. Nothing in the app is
deliberately Apple-silicon-specific; this is packaging work.
### Auto-update
Not wired. It needs an update endpoint and a signing keypair
separate from the Apple certificate: and it would be the first
thing in Rabta that makes an outbound request on its own, so it
gets designed carefully or not at all.
### Bulk multi-select on capsules
So archiving or deleting several is one gesture rather than a
repeated one. A larger opt-in feature, not built yet.
Deferred
## Later.
Deliberately not now.
### More connectors
Docker, Postman, Figma, Linear, Jira: each one is a protocol
conversation, not a plugin drop. Doing four badly would be worse
than doing none.
### A plugin SDK and automation rules
Worth doing once the protocol has stopped moving. Publishing an
SDK against a moving target is a promise you then have to break.
### Cloud sync and team collaboration
Opt-in only, and only if they can meet the local-first bar.
Anything that would send data off your machine is off by default
and asks first.
Items move between these three groups as work happens. The
changelog is the record of what actually
shipped.
