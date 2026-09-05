// The agents chapter and the /agents/ page show a briefing the MCP server
// produces. The server's own test snapshots that briefing to a golden file;
// this test pins the site to the same text, so the page can never show an
// agent an answer the server would not give.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ROOT, readRoute } from "./helpers.mjs";

const golden = (await readFile(resolve(ROOT, "packages/mcp/test/fixtures/briefing.golden.md"), "utf8")).trim();
const goldenLines = golden.split("\n");

function decode(html) {
  return html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

test("the homepage terminal types lines the server really produces, in the server's order", async () => {
  const home = await readRoute("/");
  const term = home.match(/<pre class="term__body">[\s\S]*?<\/pre>/)?.[0] ?? "";
  const brief = [...term.matchAll(/data-term-line="brief">([\s\S]*?)<\/span>/g)].map((m) => decode(m[1]).trim());
  assert.ok(brief.length >= 5, "the terminal shows at least five lines of the briefing");
  let cursor = 0;
  for (const line of brief) {
    const at = goldenLines.indexOf(line, cursor);
    assert.ok(at >= 0, `not in the golden briefing after line ${cursor}: ${line}`);
    cursor = at + 1;
  }
  assert.match(term, /claude mcp add rabta -- npx -y @rabta\/mcp/, "the install line is the real one");
});

test("the /agents/ page prints the golden briefing verbatim", async () => {
  const page = await readRoute("/agents/");
  const blocks = [...page.matchAll(/<pre class="code"[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].map((m) => decode(m[1]).trim());
  assert.ok(blocks.includes(golden), "one code block is the golden briefing, byte for byte");
});

test("the golden itself reads like a briefing an agent can act on", () => {
  assert.match(golden, /^# /, "starts with the task title");
  assert.match(golden, /\n## Files\n/);
  assert.match(golden, /\n## Terminals\n/);
  assert.match(golden, /\n## Browser tabs\n/);
  assert.ok(Buffer.byteLength(golden, "utf8") < 4096, "stays under four kilobytes");
  assert.doesNotMatch(golden, /[—–]/, "no dashes");
});
