/** Copy the canonical shared workbench into the Rabta website checkout. */
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const site = process.argv[2];
if (!site)
  throw new Error(
    "Usage: node scripts/sync-studio-utilities.mjs /path/to/rabta-site",
  );
const source = resolve(root, "apps/desktop/src/features/utilities/shared");
const target = resolve(site, "vendor/rabta-utilities");
await mkdir(target, { recursive: true });
const files = [
  "catalog.ts",
  "core.ts",
  "ToolIcon.tsx",
  "UtilityWorkbench.tsx",
  "workbench.css",
];
const hashes = {};
for (const file of files) {
  await copyFile(resolve(source, file), resolve(target, file));
  hashes[file] = createHash("sha256")
    .update(await readFile(resolve(source, file)))
    .digest("hex");
}
await writeFile(
  resolve(target, "SOURCE.json"),
  JSON.stringify(
    {
      repository: "https://github.com/salmuflahi/rabta",
      path: "apps/desktop/src/features/utilities/shared",
      license: "MIT",
      syncCommand: "node scripts/sync-studio-utilities.mjs /path/to/rabta-site",
      sha256: hashes,
    },
    null,
    2,
  ) + "\n",
);
await copyFile(resolve(root, "LICENSE"), resolve(target, "LICENSE"));
console.log(`Synced ${files.length} files with SHA-256 provenance.`);
