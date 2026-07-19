# OmniBus Connector for VS Code

This is the real VS Code/Cursor connector that bridges VS Code and the local OmniBus hub.

## Build

```sh
pnpm --filter omnibus-vscode build
```

## Development

Run in VS Code or Cursor with the extension development path:

```sh
cursor --extensionDevelopmentPath="$PWD/connectors/vscode" /path/to/a/repo
```

Or in VS Code:
```sh
code --extensionDevelopmentPath="$PWD/connectors/vscode" /path/to/a/repo
```

## Test

```sh
pnpm --filter omnibus-vscode test
```
