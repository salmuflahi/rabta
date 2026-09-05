<!-- Shipped copy of /agents/ on rabta.build, 2026-09-05. Facts here are true; reuse them, do not invent new ones. -->

For agents
# Your agent starts where you left off.
A capsule is what an agent wishes it knew before its first tool call: the
files you had open, the terminals and where they were, the tabs you were
reading, the branch. The Rabta MCP server hands that over as a briefing,
read from the capsules already on your Mac.
@rabta/mcp ships with the next release · reads on its own, captures and restores through the app · nothing leaves this Mac
## One call, and the agent knows the task.
An agent that starts cold guesses. It opens the wrong file, greps
for the branch name, asks you what you were doing. One call to
capsule_briefing answers that with a page of Markdown
small enough to keep in context: the project and branch, the files
in the order you had them, which one was active and which had
unsaved changes, the terminals and their directories, the tabs, the
pins.
It is the same capsule the app restores, read from the same file.
Nothing is uploaded, indexed or summarised by anyone else; the
server runs on your Mac and speaks to the agent over standard
input and output.
Terminal — capsule_briefing Play demo
## Connect it in one line.
The server needs Node 24 or later and a Rabta install on the same
Mac. It reads the capsules the app has saved; if you have not saved
one yet, it says so instead of inventing one.
### Claude Code
claude mcp add rabta -- npx -y @rabta/mcp
### Codex
codex mcp add rabta -- npx -y @rabta/mcp
### Cursor
In .cursor/mcp.json, in the project or your home folder:
{
"mcpServers": {
"rabta": { "command": "npx", "args": ["-y", "@rabta/mcp"] }
}
}
### Claude Desktop
In claude_desktop_config.json, under Settings, Developer:
{
"mcpServers": {
"rabta": { "command": "npx", "args": ["-y", "@rabta/mcp"] }
}
}
Until the package is on npm, run it from a checkout of the repository:
node packages/mcp/dist/cli.js in place of npx -y @rabta/mcp.
## Five tools that read. Two that ask the app.
The five readers carry the read-only annotation, so a host that asks
before writes never has to ask for them. The two writers go through
the running app and only while Agent access is on. Each description
says what the tool returns and what it does not do, which is what
keeps an agent from calling the wrong one.
list_projects
The projects the app knows, with their repository paths and default branches.
list_capsules
The task capsules on this Mac, newest capture first, filtered by project or status. Ids for everything below.
read_capsule
One capsule as data: folder, files, active file, unsaved files, terminals, tabs, branch, pins, when it was saved.
capsule_briefing
The same capsule as Markdown an agent can load as context. Under four kilobytes.
recent_activity
What the connectors reported recently: connections, captures, restores. Never file contents.
capture_capsule
Asks the app to capture the task now. Returns what was captured and what was skipped. Needs Agent access.
restore_capsule
Asks the app to restore the task, focus mode optional. Returns the receipt the sheet shows: Restored, On next reload, Skipped and why. Needs Agent access.
rabta://capsules/&#123;id&#125;
Every capsule is also a resource, for hosts that browse resources instead of calling tools.
The briefing for the demo capsule this site is photographed from:
# Wire the connector SDK reconnect
Project atlas-api on branch feat/connector-reconnect, saved 2026-07-29T14:12:00.000000+00:00.
## Files
Folder: ~/code/atlas-api
- src/hub.rs
- src/connector/session.rs (active)
- src/connector/handshake.rs
- tests/reconnect.rs (unsaved changes)
## Terminals
- zsh in ~/code/atlas-api
- cargo watch in ~/code/atlas-api (busy)
- zsh in ~/code/atlas-api/crates
## Browser tabs
- WebSocket close codes - MDN <https://developer.mozilla.org/>
- tokio-tungstenite docs <https://docs.rs/tokio-tungstenite/>
- Exponential backoff and jitter <https://aws.amazon.com/builders-library/>
- atlas-api: Pull requests <https://github.com/>
- Reconnect design notes <https://www.notion.so/>
## Pins
- chrome: https://docs.rs/tokio-tungstenite/
Restore it from the Rabta app or, with Agent access on in its Settings, through restore_capsule.
## What it will not do.
Write to the database
It opens the file read-only. Capture and restore are requests to
the running app, answered only while Agent access is on in
Settings, and answered with the app's own receipt.
Read your files' contents
A capsule holds paths, titles and URLs. The briefing lists them.
What is inside a file stays between you and your editor.
Reach the network
No requests, no telemetry, no update check. It opens the
database file and, with Agent access on, the app's socket file
in the same folder. The only thing it talks to is the agent that
launched it and the app on this Mac.
Run without you
It is a process your agent host starts and stops. Nothing runs
in the background, and removing the one line removes it.
Agent access is a switch in the app's Settings. On, the app writes a
secret file and listens on a socket file beside it, both readable by
your user only; off removes both. A wrong secret is refused and the
connection closed. The receipt an agent gets back is the one the
restore sheet shows you, "On next reload" and "Skipped" included.
## Save a capsule. Then hand it to your agent.
Download for macOS How capsules work
Free. Apple silicon, macOS 11+. No account, no server.
