#!/usr/bin/env bash
# Build all distributable artifacts into dist-artifacts/:
#   Rabta_<ver>_<arch>.dmg    — macOS desktop app (unsigned / ad-hoc; see docs/INSTALL.md)
#   rabta-vscode-<ver>.vsix   — VS Code / Cursor extension
#   rabta-chrome-<ver>.zip    — Chrome extension (unzip → Load unpacked)
#
# Requires: pnpm, Rust/cargo. The .vsix step needs a Node >= 20 available
# (vsce's deps require it); this script finds one automatically if the default
# node is older. macOS only.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
OUT="$ROOT/dist-artifacts"
mkdir -p "$OUT"

echo "==> workspace deps"
pnpm install --frozen-lockfile >/dev/null

echo "==> desktop .app / .dmg (release build — slow first time)"
pnpm --filter desktop tauri build
cp target/release/bundle/dmg/Rabta_*_*.dmg "$OUT"/

echo "==> chrome extension zip"
# Staged by package-chrome.sh so that this and publish-chrome.mjs ship the
# identical zip — there is one place that decides what goes in it.
"$ROOT/scripts/package-chrome.sh" >/dev/null

echo "==> vscode .vsix"
pnpm --filter rabta-vscode build >/dev/null
VSCODE_VER="$(node -p 'require("./connectors/vscode/package.json").version')"
node_major() { "$1" -e 'process.stdout.write(process.versions.node.split(".")[0])'; }
NODE_BIN="$(command -v node)"
if [ "$(node_major "$NODE_BIN")" -lt 20 ]; then
  for c in /usr/local/bin/node /opt/homebrew/bin/node; do
    if [ -x "$c" ] && [ "$(node_major "$c")" -ge 20 ]; then NODE_BIN="$c"; break; fi
  done
fi
if [ "$(node_major "$NODE_BIN")" -lt 20 ]; then
  echo "!! need Node >= 20 for vsce; found $("$NODE_BIN" --version). Skipping .vsix." >&2
else
  echo "    using node $("$NODE_BIN" --version) for vsce"
  NPMCLI="$(dirname "$("$NODE_BIN" -e 'console.log(process.execPath)')")/../lib/node_modules/npm/bin/npm-cli.js"
  TOOL="$(mktemp -d)"
  ( cd "$TOOL" && "$NODE_BIN" "$NPMCLI" install @vscode/vsce@latest >/dev/null 2>&1 )
  ( cd connectors/vscode && "$NODE_BIN" "$TOOL/node_modules/@vscode/vsce/vsce" \
      package --no-dependencies --allow-missing-repository -o "$OUT/rabta-vscode-$VSCODE_VER.vsix" )
fi

echo "==> done. artifacts:"
ls -lh "$OUT"
