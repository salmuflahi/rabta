/**
 * Writes the test fixture to a file so the built CLI can be smoke-tested
 * against a real database: node test/write-fixture.ts /path/to/fixture.db
 */
import { existsSync } from "node:fs";
import { buildFixtureDb } from "./fixture-db.ts";

const out = process.argv[2];
if (!out) {
  process.stderr.write("usage: node test/write-fixture.ts <path-to-create>\n");
  process.exit(2);
}
if (existsSync(out)) {
  process.stderr.write(`refusing to overwrite ${out}\n`);
  process.exit(2);
}
buildFixtureDb({ path: out }).close();
process.stderr.write(`fixture database written to ${out}\n`);
