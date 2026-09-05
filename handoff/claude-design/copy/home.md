<!-- Shipped copy of / on rabta.build, 2026-09-05. Facts here are true; reuse them, do not invent new ones. -->

abta
# Leave the task. Return to all of it.
Every file, terminal, tab and branch around a task, captured on your Mac and restored when you return. With a receipt.
Download for macOS
See it work Rabta — connector-reconnect.capsule Play demo
Works with
Connectors currently speak to VS Code, Cursor, Zed, Ghostty, iTerm2, Terminal, Warp, Chrome, Arc and Firefox. VS Code Cursor Zed Ghostty iTerm2 Terminal Warp Chrome Arc Firefox VS Code Cursor Zed Ghostty iTerm2 Terminal Warp Chrome Arc Firefox
## Three moves. Nothing else to learn.
Capture the task. Leave it. Everything is where you left it when you come back.
1
### Capture
Files, terminals, tabs and the branch, sealed into one capsule.
2
### Leave
Switch tasks. The one you leave saves itself.
3
### Return
Everything comes back, branch first, with a receipt. Rabta — Capsules
## A capsule is the whole surface of a task.
Not the code. The arrangement around it: which files, which terminals, which tabs, which branch.
### The files
Every open file and its order, plus the workspace folder they belong to. Play
### The terminals
Each one's working directory. Never its output. Play
### The tabs
URLs and titles from the browser you approved. Nothing on the page. Play
### The branch
Restored first, and never forced. A dirty tree stops the switch and says so. Play
## The receipt never rounds up.
A restore reports each tool the way it went: restored, waiting on a reload, or skipped and why. Change what is true on the Mac and read what the sheet says. Chrome is closed A file has unsaved changes The branch has uncommitted work
Workspace partially restored
Restored 2 of 3.
Git Restored feat/connector-reconnect
VS Code Restored 4 files, 3 terminals
Chrome On next reload Chrome is not running
A refusal is not an error. Rabta says what it left alone, and why.
## Resuming can also put away what isn't in the task.
Focus mode closes what the capsule didn't capture, one item at a time,
only after a clean restore. Unsaved files, running terminals and
anything pinned are kept, and the receipt says why.
focus mode on 12brought back 6put away 4kept
6 tabs closed · 4 kept
2 tabs kept pinned in the browser
1 file kept unsaved changes
1 terminal left running npm run dev
Closed items are held in the task you left. Resume it to get them back.
## Your agent starts where you stopped.
Claude Code, Cursor and Codex can read a capsule through Rabta's MCP server: the files, terminals, tabs and branch of a task, as one briefing, before the first prompt. Terminal
$ claude mcp add rabta -- npx -y @rabta/mcp
Added stdio MCP server rabta
> capsule_briefing task_reconnect
# Wire the connector SDK reconnect
Project atlas-api on branch feat/connector-reconnect, saved 2026-07-29T14:12:00.000000+00:00.
## Files
- src/hub.rs
- src/connector/session.rs (active)
## Terminals
- cargo watch in ~/code/atlas-api (busy)
The server is built and ships with the next release. See how it will work
## There is no account, because there is no server.
Capsules are files on your disk. Rabta has no backend to send them
to, no telemetry, and nothing to sign in to. Delete the app and the
data goes with it.
Read the full privacy policy
### On your disk
Plain files under Application Support. Readable, movable, deletable.
### Pointers, not contents
Paths and URLs. Rabta never reads what is inside your files.
### No network calls
Nothing on launch and nothing on a timer. No analytics, no update ping.
### Permissions you grant
The editor and browser extensions, each installed and revoked by you.
## Where this goes.
Three things in the repository, at the stage they are named under. No dates, on purpose.
The whole roadmap
Planned
### Intel and universal builds
The largest group who cannot run Rabta today. Packaging, not architecture.
Planned
### Focus mode's close half, in the app
The connectors can already close tabs, files and terminals. The app side that drives them, with the never-close rules held there.
Planned
### Auto-update that asks first
Not wired yet. It would be the first thing in Rabta to make a request on its own, so it gets designed to ask, or it stays unbuilt.
## Stop rebuilding the same workspace.
Free and MIT-licensed. Runs entirely on your Mac.
Download Rabta 0.1.0
Setup guide
5.5 MB
macOS 11+
Apple Silicon only, no Intel build
Signed and notarized
GitHub release Verify the download What's in it
