import { connect } from "@rabta/connector-sdk";
import { createWorkspace } from "./state";

const chatty = process.argv.includes("--chatty");
const ws = createWorkspace();

const connector = await connect(
  { name: "fake-vscode", kind: "fake", capabilities: ["workspace", "editor"] },
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
