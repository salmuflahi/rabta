import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Console v2 Phase 4, Task 14 — extracted from tokens.test.ts, which
// originally defined this locally. contrast.test.ts needs the exact same
// "read index.css, slice out a selector's custom properties" logic; writing
// a second copy would let the two suites silently drift (e.g. one tolerating
// a token shape the other rejects). Both suites now import this one
// function, so there is exactly one CSS-token parser in the repo.
const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");

/** Extract the `--name: value;` pairs inside a given selector block. */
export function tokensIn(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`selector ${selector} not found in index.css`);
  let depth = 0;
  let end = start;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = css.slice(start, end);
  const out = new Map<string, string>();
  for (const m of body.matchAll(/(--[a-z-]+):\s*([^;]+);/g)) {
    out.set(m[1], m[2].trim());
  }
  return out;
}
