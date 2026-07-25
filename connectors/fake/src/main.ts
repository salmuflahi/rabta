import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { connect } from "@rabta/connector-sdk";
import { createWorkspace } from "./state";

const chatty = process.argv.includes("--chatty");
const ws = createWorkspace();

// Report our own package version, distinct from the wire protocol version.
const version = (
  JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8")
  ) as { version: string }
).version;

const connector = await connect(
  { name: "fake-vscode", kind: "fake", capabilities: ["workspace", "editor"], version },
  (c) => {
    c.onCommand("workspace.open", (args) => ws.open((args as { path: string }).path));
    c.onCommand("workspace.state", () => ws.state);
    c.onCommand("editor.openFiles", () => ({ openFiles: ws.state.openFiles }));
  }
);
console.log(`fake-vscode connected as ${connector.connectorId}`);

if (chatty) {
  const files = ["src/main.ts", "src/app.ts", "README.md", "package.json"];
  let i = 0;
  setInterval(() => {
    const path = files[i++ % files.length];
    ws.openFile(path);
    connector.emit("editor.fileOpened", { path });
  }, 3000);
}
