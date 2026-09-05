<!-- Shipped copy of /capsules/ on rabta.build, 2026-09-05. Facts here are true; reuse them, do not invent new ones. -->

How it works
# What a capsule holds, and how it comes back.
Four kinds of pointer, written down: the files you had open, the
terminals and their directories, the tabs, the branch. Kept in one file
on your Mac, restored in the right order, reported honestly.
Pointers, never contents. Your disk, never a server.
## Four pointers, and the order you had them in.
Saving a capsule asks each connector for its state. The editor
answers with the workspace folder, the open files in their tab
order, which one is active and which have unsaved changes, and the
terminals with their working directories. The browser answers with
the tabs it is allowed to see: their addresses and titles, nothing
from inside the page. The branch is read from the repository
itself.
That is the whole capsule. No file contents, no diffs, no terminal
output, no page text. Small enough to read in one screen, which is
also what makes it safe to keep.
Rabta — Capsules Play demo
## Exactly what is stored.
A capsule is a set of rows, one per connector, keyed by the task.
Each save replaces that connector's row, so a capsule is always the
latest capture and never a history. Anything you pin ("always open
this") is kept in its own row, authored by you and never overwritten
by a capture.
[
{
"connector_kind": "vscode",
"resource_type": "workspace",
"payload": {
"workspaceFolder": "~/code/atlas-api",
"openFiles": ["src/hub.rs", "src/connector/session.rs", "tests/reconnect.rs"],
"activeFile": "src/connector/session.rs",
"dirtyFiles": ["tests/reconnect.rs"],
"terminals": [
{ "name": "zsh", "cwd": "~/code/atlas-api", "busy": false },
{ "name": "cargo watch", "cwd": "~/code/atlas-api", "busy": true }
]
}
},
{
"connector_kind": "chrome",
"resource_type": "workspace",
"payload": {
"tabs": [
{ "url": "https://docs.rs/tokio-tungstenite/", "title": "tokio-tungstenite docs" },
{ "url": "https://developer.mozilla.org/", "title": "WebSocket close codes - MDN" }
]
}
},
{
"connector_kind": "git",
"resource_type": "branch",
"payload": { "branch": "feat/connector-reconnect" }
}
]
The shapes are the connectors' own: WorkspaceState from
the editor connector and TabsState from the browser
connector, both in the public repository.
## Back in the right order, with a receipt.
Resuming a capsule is additive: it opens things and closes nothing,
unless you turn on focus mode. The order matters, because a branch
switch changes what is on disk before the editor looks.
01
### Git first
The branch is checked out before anything else. A working tree
with uncommitted changes refuses the switch, and the refusal is
reported as a skip with its reason. Nothing is reset, stashed or
discarded.
02
### Then the editor
Files open in their order, terminals in their directories. If
the capsule belongs to a different folder, the editor reloads its
window and the rest lands when it reconnects: the receipt says
"On next reload" rather than pretending.
03
### Then the browser
Tabs open by address. If the browser is not running, the capsule
waits for it, and the receipt says so. Pinned tabs and anything
the extension cannot open are left alone.
Restored
The tool did what the capsule asked.
On next reload
Queued for the connector's reconnect; it will finish on its own.
Skipped
Not done, with the reason: a dirty tree, a closed app, a file that is not there.
Put away, kept
With focus mode on, what was closed and what was deliberately left open: unsaved files, busy terminals, pins.
## One file under Application Support.
Capsules live in a SQLite database in the app's own folder, readable
with any SQLite tool and deletable with the app. The hub that talks
to the connectors binds to the loopback address and to nothing else;
a connector finds it through a file only your user can read.
Where
~/Library/Application Support/com.omnibus.dev/omnibus.db
Format
SQLite, write-ahead logging, versioned migrations. Other readers, such as the MCP server, open it read-only while the app runs.
Moving Macs
Export a .rabta bundle from Settings, encrypted with a passphrase, and import it on the other side.
The hub
A WebSocket server on 127.0.0.1. Its port and a per-run secret are written to hub.json with owner-only permissions; the browser extension pairs once and keeps a token.
The protocol
Version 1, ten message kinds: hello · welcome · command · response · event · error · pair · paired · ping · pong. Defined once in TypeScript and once in Rust, held in lockstep by shared fixtures. Internal until the SDK ships.
Connectors today
One for VS Code, Cursor, VSCodium and Windsurf. One for Chrome, Arc and Chromium browsers. Terminals come with the editor.
## Leave the task. Return to all of it.
Download for macOS Read the setup guide
Free. Apple silicon, macOS 11+. No account, no server.
