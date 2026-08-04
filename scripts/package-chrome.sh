#!/usr/bin/env bash
# Build the Chrome extension zip into dist-artifacts/ and print its path.
#
# Split out of package.sh so that packaging and publishing cannot drift: what
# ships to the Web Store is whatever this script stages, and nothing else
# assembles a zip. Prints only the artifact path on stdout (progress goes to
# stderr), so callers can do: ZIP="$(./scripts/package-chrome.sh)"
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
OUT="$ROOT/dist-artifacts"
mkdir -p "$OUT"

# The manifest is the version of record for this artifact (docs/RELEASE.md §0),
# so read it rather than trusting a constant somewhere to have been bumped too.
VER="$(node -p 'require("./connectors/chrome/manifest.json").version')"

echo "==> building rabta-chrome $VER" >&2
pnpm --filter rabta-chrome build >/dev/null

STAGE="$(mktemp -d)/rabta-chrome"; mkdir -p "$STAGE/dist"
cp connectors/chrome/manifest.json connectors/chrome/popup.html \
   connectors/chrome/popup.css "$STAGE"/
cp connectors/chrome/dist/background.js connectors/chrome/dist/popup.js "$STAGE/dist"/
cp -r connectors/chrome/icons "$STAGE"/

# Every file popup.html asks for has to be in the zip. None of them is a build
# input — esbuild never reads popup.html — so a missing one fails nothing here
# and is visible only to whoever installs it from the Store. popup.css went
# missing exactly this way and shipped in 0.1.1.
for need in manifest.json popup.html popup.css dist/popup.js dist/background.js; do
  [ -f "$STAGE/$need" ] || { echo "!! the extension needs $need and it is not staged" >&2; exit 1; }
done

ZIP="$OUT/rabta-chrome-$VER.zip"
rm -f "$ZIP"
# manifest.json at the ROOT of the zip (the Web Store requires it; it also
# works for "Load unpacked" once extracted).
( cd "$STAGE" && zip -qr "$ZIP" . )
echo "    $(unzip -l "$ZIP" | tail -1 | awk '{print $2}') files, $(du -h "$ZIP" | cut -f1)" >&2
echo "$ZIP"
