# @rabta/mcp

An MCP server that lets an AI agent read the task capsules Rabta has saved on this Mac. A capsule is everything Rabta captured when you were last on a task: the files that were open in your editor and which one was active, the terminals and their working directories, the browser tabs, the git branch, and anything you pinned. With this server connected, an agent can ask which tasks exist, read one capsule as JSON, or load a short Markdown briefing into its context before it starts work, so it begins from where you actually left off instead of from a cold repository.

This is phase M1, the read-only half. Nothing here captures, restores, edits or deletes anything; it opens Rabta's local database read-only and answers questions about it. Capture and restore through an agent arrive later, through an opt-in socket to the running app, and will appear as separate tools.

## Requirements

- Rabta installed and opened at least once (that is what creates the database the server reads).
- Node 24 or newer (the server reads the database through `node:sqlite`).

## Install

Claude Code:

```sh
claude mcp add rabta -- npx -y @rabta/mcp
```

Cursor (`.cursor/mcp.json`):

```json
{ "mcpServers": { "rabta": { "command": "npx", "args": ["-y", "@rabta/mcp"] } } }
```

Codex:

```sh
codex mcp add rabta -- npx -y @rabta/mcp
```

Claude Desktop (`claude_desktop_config.json`):

```json
{ "mcpServers": { "rabta": { "command": "npx", "args": ["-y", "@rabta/mcp"] } } }
```

## Tools

- `list_projects`: the projects Rabta knows about, with repository path, default branch, archived flag, open task count and last opened time.
- `list_capsules`: saved capsules newest first, optionally filtered by project (name or id) and status (`open`, `done`, `all`), each with its branch, save time and a one-line summary such as `4 files, 3 terminals, 5 tabs`.
- `read_capsule`: one capsule in full as JSON: editor state (folder, files, active file, unsaved files, terminals), browser tabs, branch and pins. A tool that captured nothing is `null`, never an empty count.
- `capsule_briefing`: one capsule as Markdown under 4 KB, meant to be pasted into an agent's context; only sections with content appear, long lists end with `and N more`.
- `recent_activity`: recent entries from Rabta's connector event log, newest first, with time, event type, connector kind and command or event name.

Capsules are also exposed as resources at `rabta://capsules/{task_id}` (JSON, the same document `read_capsule` returns), so clients that browse resources can attach one directly.

## Security model

- Read-only. The database is opened with SQLite's read-only flag and the server contains no write path. Every tool is annotated `readOnlyHint: true`.
- Local only. The server opens one file, `omnibus.db` in Rabta's Application Support folder, and talks to the agent over stdio. It makes no network requests, and nothing leaves the Mac unless the agent you connected it to sends it somewhere.
- No secrets. The `connectors` table's pairing tokens are never selected.
- Capture and restore are not part of this server. They arrive later through an opt-in socket to the running Rabta app, where the app stays in control of what an agent may change.

## Configuration

- `RABTA_DB=/path/to/omnibus.db` points the server at a different database file (for example a copy).
- `--debug` reads the debug build's database (`~/Library/Application Support/com.omnibus.dev.debug/omnibus.db`) instead of the release one (`~/Library/Application Support/com.omnibus.dev/omnibus.db`).
- If the database does not exist the server exits with status 1 and names the path it looked for. If the database schema is newer than this build knows (`user_version` above 5) it prints one warning on stderr and continues.

Stdout is reserved for the MCP protocol; all logging goes to stderr.

## Development

```sh
pnpm --filter @rabta/mcp build      # compiles src/ to dist/ and marks dist/cli.js executable
pnpm --filter @rabta/mcp test       # vitest against an in-memory fixture database
pnpm --filter @rabta/mcp inspect    # MCP Inspector against dist/cli.js

# smoke-test the built CLI against a fixture database on disk
node test/write-fixture.ts /tmp/rabta-fixture.db
RABTA_DB=/tmp/rabta-fixture.db npx -y @modelcontextprotocol/inspector --cli node dist/cli.js --method tools/list

# regenerate the briefing golden file after an intentional change
UPDATE_GOLDEN=1 pnpm --filter @rabta/mcp test
```
