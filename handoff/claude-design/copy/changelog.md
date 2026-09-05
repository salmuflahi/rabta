<!-- Shipped copy of /changelog/ on rabta.build, 2026-09-05. Facts here are true; reuse them, do not invent new ones. -->

Changelog
# What shipped.
Every release, what it added, and what it refuses to do. Newest first.
Full history on
GitHub releases.
An upgrade that needs a manual step says so on the way in, not after
## v0.1.0
Current
First public release: signed and notarized, Apple silicon, macOS 11
or later. The first version anyone else can run.
### Capsules
Save and restore a task across the editor, browser, terminals
and Git: open files, tab URLs, working directories and the
branch, in order.
Switching tasks auto-saves the outgoing one. Restores are
additive by default and report partial results instead of hiding
them.
Pinned items open on every resume, even if they were closed at
the last save.
### Focus mode
Off by default. When on, resuming also puts away what the
capsule didn't capture: one item at a time, only after a clean
restore.
Never closes an unsaved file, a running terminal, or anything
pinned. Kept items are reported with the reason.
### Git & GitHub
Safe Git: status, fetch, checkout and branch creation: never
force-checkouts, resets, stashes or discards. A dirty tree
refuses with a message.
Fetch issues through your own gh CLI and start a
task and branch from one. No GitHub token is seen or stored.
### Connectors
Editor connector on Open VSX; browser connector on the Chrome
Web Store: tabs and storage only,
structurally unable to read page content.
Every connector authenticates to a hub bound to
127.0.0.1. Browsers pair through an approve/deny
sheet, and web origins are rejected at the handshake.
## What it asks of you.
The build is signed with an Apple Developer ID and notarized, so it
opens on a normal double-click. If a Gatekeeper warning does
appear, the file is not the one that was signed: the
setup guide has the checksum to check
that with. The connectors install from Open VSX and the Chrome Web
Store. There is no auto-update, so future versions are a manual
download.
What it does not do: no account, no server, no telemetry. Details on
the Why page.
Release notes on GitHub
·
Download the .dmg
Next
## Planned.
Packaged or planned. No dates promised.
### Connectors 0.2.0: published
Focus mode's close half: tabs.close,
editor.closeFile, terminal.dispose. On
Open VSX and the Visual Studio Marketplace now; the browser
connector is in Chrome Web Store review. The desktop app stays at
0.1.0 and does not drive the closing half yet. It also raises the
editor floor to VS Code 1.93.
### Queued and deferred
Queued: a verified Open VSX namespace, an Intel build,
auto-update, bulk multi-select on capsules. Deferred on purpose:
more connectors, a plugin SDK, automation rules, cloud sync. The
full picture is on the roadmap.
## Before 0.1.0.
Rabta was built in the open under its former name, OmniBus. There are
no published releases before 0.1.0: the history is in the
repository
rather than on this page, because nothing before it was something you
could install.
