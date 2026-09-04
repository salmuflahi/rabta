/* The long-form text for language models: the facts on the site, in plain
 * words, without the page chrome. Generated at build time from the same
 * constants the pages use, so a version bump changes both. */
import type { APIRoute } from "astro";
import { MCP_PUBLISHED, RELEASE, SITE_ORIGIN } from "../config.ts";

const text = `# Rabta

Rabta is a local-first macOS app that saves a task's capsule and restores it later with an honest receipt.

A capsule is four kinds of pointer for one task: the files you had open (in their order, with the active one and any with unsaved changes), the terminals and their working directories, the browser tabs (addresses and titles), and the git branch. It never stores file contents, diffs, terminal output or page text.

Facts about the current release:
- Version ${RELEASE.version}, published ${RELEASE.publishedOn}.
- Download: ${RELEASE.dmgUrl} (${RELEASE.dmgSizeLabel}, SHA-256 ${RELEASE.sha256}).
- Apple silicon only, ${RELEASE.macOsFloor}. There is no Intel build.
- Signed and notarized. ${RELEASE.licence} licence. Source: https://github.com/salmuflahi/rabta
- No account, no server, no telemetry, no crash reporting, no update checks.

## How it works

Rabta runs a hub on the Mac: a WebSocket server bound to 127.0.0.1 and nothing else. Connectors register with it: an editor extension for VS Code, Cursor, VSCodium and Windsurf (published on the Visual Studio Marketplace and Open VSX as "Rabta Connector"), and a browser extension for Chrome, Arc and Chromium browsers (Chrome Web Store, "Rabta Connector"). The browser extension requests no host permissions and runs no content scripts; it reads tab addresses and titles only.

Capture asks each connector for its state and writes one row per connector into a SQLite database at ~/Library/Application Support/com.omnibus.dev/omnibus.db. The branch is read from the repository. Each capture replaces the connector's previous row, so a capsule is always the latest state, never a history. Items you pin ("always open this") live in their own rows and are never overwritten by a capture.

Restore is additive: it opens things and closes nothing unless focus mode is on. Order: git first (a working tree with uncommitted changes refuses the switch and the refusal is reported), then the editor (files, then terminals; a different folder reloads the editor window and the rest lands on reconnect, reported as "On next reload"), then the browser tabs. The receipt reports each tool as Restored, On next reload, or Skipped with a reason; with focus mode on it also lists what was put away and what was deliberately kept (unsaved files, busy terminals, pins).

## For AI agents

The Rabta MCP server (${MCP_PUBLISHED ? "@rabta/mcp on npm" : "@rabta/mcp, shipping with the next release; until then run node packages/mcp/dist/cli.js from a checkout"}) lets an agent host such as Claude Code, Cursor, Codex or Claude Desktop read the capsules on this Mac. It runs over stdio, opens the database read-only, makes no network requests and writes nothing on its own.

Read-only tools: list_projects, list_capsules (project and status filters, newest capture first), read_capsule (folder, files, active file, unsaved files, terminals, tabs, branch, pins, saved time), capsule_briefing (the same capsule as Markdown under four kilobytes, meant to be loaded as context), recent_activity (connector connections, captures, restores). Resource template: rabta://capsules/{task_id}.

Install: \`claude mcp add rabta -- npx -y @rabta/mcp\` (Claude Code), \`codex mcp add rabta -- npx -y @rabta/mcp\` (Codex), or add {"mcpServers":{"rabta":{"command":"npx","args":["-y","@rabta/mcp"]}}} to .cursor/mcp.json or claude_desktop_config.json. Needs Node 24 or later and Rabta installed on the same Mac.

Two more tools ask the running app: capture_capsule and restore_capsule. They need Agent access, a switch in the app's Settings that opens a local Unix socket file in the data folder (a file, not a port) with an owner-only secret beside it; off removes both. The reply is the app's own receipt.

## Privacy

The app makes no outbound request on launch or on a timer. Two things in the app can reach the network, each only when you click: the Git menu's Fetch, and the optional GitHub issue features through your own gh CLI. The website makes one request beyond loading the page: a cookieless counter ping to count.rabta.build (run by the maintainer on Cloudflare) carrying the page path, the referring site's hostname and a coarse viewport class; IP address and user agent are never stored, visitors are counted once per day through a salted hash whose salt is discarded daily, and the ping is not sent when Global Privacy Control or Do Not Track is on. Full policy: ${SITE_ORIGIN}/privacy/

## Pages

${SITE_ORIGIN}/ , ${SITE_ORIGIN}/capsules/ , ${SITE_ORIGIN}/agents/ , ${SITE_ORIGIN}/why/ , ${SITE_ORIGIN}/setup/ , ${SITE_ORIGIN}/faq/ , ${SITE_ORIGIN}/privacy/ , ${SITE_ORIGIN}/changelog/ , ${SITE_ORIGIN}/roadmap/ , ${SITE_ORIGIN}/brand/
`;

export const GET: APIRoute = () =>
  new Response(text, { headers: { "content-type": "text/plain; charset=utf-8" } });
