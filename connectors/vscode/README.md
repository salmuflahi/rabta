# Rabta Connector

Connects your editor to the **Rabta** desktop app so it can capture and restore
your workspace — the open files, terminals, and folder — as part of a task.

Rabta is a local-first "shared brain" for your dev tools. It snapshots the state
of a task (editor, terminals, git branch, and browser tabs) into a *capsule* and
restores it on demand when you switch back. This extension is the editor half,
and works in **VS Code** and **Cursor**.

## Privacy

- **Local-first.** It talks only to the Rabta app on `127.0.0.1` — no cloud
  account, no servers, no telemetry.
- **No sign-in.** It authenticates with a per-run secret the Rabta app writes
  to a local file; nothing you do leaves your machine.
- Nothing is captured until you save a capsule in Rabta.

## Requirements

The **Rabta desktop app** must be installed and running. Install this extension,
open your editor, and it connects automatically — it appears under **Connectors**
in Rabta.

---

## For contributors

The fake connector under `connectors/fake` stays in the tree as the SDK
reference implementation — this real extension does not replace or deprecate
it.

### Build

```sh
pnpm --filter rabta-vscode build
```

### Development

Run in VS Code or Cursor with the extension development path:

```sh
cursor --extensionDevelopmentPath="$PWD/connectors/vscode" /path/to/a/repo
```

Or in VS Code:
```sh
code --extensionDevelopmentPath="$PWD/connectors/vscode" /path/to/a/repo
```

### Test

```sh
pnpm --filter rabta-vscode test
```
