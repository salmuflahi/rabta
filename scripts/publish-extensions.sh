#!/usr/bin/env bash
# Publish the VS Code / Cursor extension to BOTH registries:
#   - VS Code Marketplace (serves VS Code)      — needs VSCE_PAT
#   - Open VSX (serves Cursor / VSCodium / Windsurf) — needs OVSX_TOKEN
#
# Each target is skipped (with a note) if its token env var is unset, so you
# can publish to one registry at a time. Does NOT create accounts or the
# Open VSX namespace — do those once by hand (see docs/RELEASE.md §3):
#   npx @vscode/vsce@latest login <publisher>          # Marketplace, once
#   npx ovsx create-namespace <publisher> -p $OVSX_TOKEN # Open VSX, once
#
# Requires Node >= 20 (vsce/ovsx deps); this script finds one automatically if
# the default node is older (same trick as scripts/package.sh).
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
VER="$(node -e 'console.log(require("./connectors/vscode/package.json").version)')"
VSIX="$ROOT/dist-artifacts/rabta-vscode-$VER.vsix"

node_major() { "$1" -e 'process.stdout.write(process.versions.node.split(".")[0])'; }
NODE_BIN="$(command -v node)"
if [ "$(node_major "$NODE_BIN")" -lt 20 ]; then
  for c in /usr/local/bin/node /opt/homebrew/bin/node; do
    if [ -x "$c" ] && [ "$(node_major "$c")" -ge 20 ]; then NODE_BIN="$c"; break; fi
  done
fi
if [ "$(node_major "$NODE_BIN")" -lt 20 ]; then
  echo "!! need Node >= 20 for vsce/ovsx; found $("$NODE_BIN" --version)." >&2
  exit 1
fi
echo "==> using node $("$NODE_BIN" --version)"
NPMCLI="$(dirname "$("$NODE_BIN" -e 'console.log(process.execPath)')")/../lib/node_modules/npm/bin/npm-cli.js"

echo "==> build + package the .vsix ($VER)"
pnpm --filter rabta-vscode build >/dev/null
mkdir -p "$ROOT/dist-artifacts"
TOOL="$(mktemp -d)"
( cd "$TOOL" && "$NODE_BIN" "$NPMCLI" install @vscode/vsce@latest ovsx >/dev/null 2>&1 )
( cd connectors/vscode && "$NODE_BIN" "$TOOL/node_modules/@vscode/vsce/vsce" \
    package --no-dependencies --allow-missing-repository -o "$VSIX" )
echo "    packaged $VSIX"

if [ -n "${VSCE_PAT:-}" ]; then
  echo "==> publishing to VS Code Marketplace"
  ( cd connectors/vscode && "$NODE_BIN" "$TOOL/node_modules/@vscode/vsce/vsce" \
      publish --no-dependencies --allow-missing-repository -p "$VSCE_PAT" --packagePath "$VSIX" )
else
  echo "==> skip Marketplace (set VSCE_PAT to publish)"
fi

if [ -n "${OVSX_TOKEN:-}" ]; then
  echo "==> publishing to Open VSX (Cursor)"
  "$NODE_BIN" "$TOOL/node_modules/.bin/ovsx" publish "$VSIX" -p "$OVSX_TOKEN"
else
  echo "==> skip Open VSX (set OVSX_TOKEN to publish)"
fi

echo "==> done."
