#!/usr/bin/env bash
# Build, sign and package the Mac App Store build of Rabta:
#   dist-artifacts/Rabta_<ver>_<build>_appstore.pkg
#
#   ./scripts/package-appstore.sh            # build + sign + package + validate signature
#   ./scripts/package-appstore.sh --upload   # …then validate and upload to App Store Connect
#
# This is a different artifact from the DMG that ./scripts/package.sh builds:
# sandboxed, signed with the App Store distribution identities, carrying a
# provisioning profile, and packaged as a signed installer .pkg. Nothing here
# touches the DMG path. Read docs/APP-STORE.md before running it — the Store
# build has limits the DMG does not, and the doc says which.
#
# Needs, on a Mac with Xcode command-line tools:
#   - "Apple Distribution: <name> (<team>)"              in the login keychain
#   - "3rd Party Mac Developer Installer: <name> (<team>)" in the login keychain
#   - signing/Rabta_Mac_App_Store.provisionprofile        (gitignored; see the doc)
#   - for --upload: an App Store Connect API key, ASC_API_KEY_ID + ASC_API_ISSUER_ID,
#     with AuthKey_<ID>.p8 in ~/.appstoreconnect/private_keys/
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
OUT="$ROOT/dist-artifacts"
mkdir -p "$OUT"
export PATH="$HOME/.cargo/bin:$PATH"

UPLOAD=0
for arg in "$@"; do
  case "$arg" in
    --upload) UPLOAD=1 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

fail() { echo "!! $*" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || fail "the App Store build can only be produced on macOS"

CONF="apps/desktop/src-tauri/tauri.conf.json"
OVERLAY="apps/desktop/src-tauri/tauri.appstore.conf.json"
VER="$(node -p "require('./$CONF').version")"
BUILD_NO="$(node -p "require('./$OVERLAY').bundle.macOS.bundleVersion")"
PROFILE="$(node -p "require('./$OVERLAY').bundle.macOS.files['embedded.provisionprofile']")"
PROFILE_ABS="$ROOT/apps/desktop/src-tauri/$PROFILE"

[ -f "$PROFILE_ABS" ] || fail "provisioning profile missing: $PROFILE_ABS
   Create a 'Mac App Store Connect' profile for com.omnibus.dev in the developer
   portal and save it there (the signing/ directory is gitignored)."

# The two Store identities. Overridable, but the defaults are what
# `security find-identity` prints for the team the entitlements name.
IDENTITIES="$(security find-identity -v -p codesigning 2>/dev/null || true)"
APP_IDENTITY="${APPLE_SIGNING_IDENTITY:-$(printf '%s\n' "$IDENTITIES" | sed -n 's/.*"\(Apple Distribution: [^"]*\)".*/\1/p' | head -1)}"
[ -n "$APP_IDENTITY" ] || fail "no 'Apple Distribution' identity in the keychain (set APPLE_SIGNING_IDENTITY to override)"
case "$APP_IDENTITY" in
  "Developer ID"*) fail "APPLE_SIGNING_IDENTITY is a Developer ID identity; the Store needs 'Apple Distribution'" ;;
esac
PKG_IDENTITY="${APPLE_INSTALLER_IDENTITY:-$(security find-identity -v 2>/dev/null | sed -n 's/.*"\(3rd Party Mac Developer Installer: [^"]*\)".*/\1/p' | head -1)}"
[ -n "$PKG_IDENTITY" ] || fail "no '3rd Party Mac Developer Installer' identity in the keychain (set APPLE_INSTALLER_IDENTITY to override)"

# Tauri notarizes during `tauri build` whenever these are set. A Store build
# must NOT be notarized — the notary service rejects Apple Distribution
# signatures, and the Store does its own review — so they are cleared for the
# build regardless of what the shell had exported for the DMG recipe.
unset APPLE_ID APPLE_PASSWORD APPLE_API_KEY APPLE_API_ISSUER APPLE_API_KEY_PATH
export APPLE_SIGNING_IDENTITY="$APP_IDENTITY"

echo "==> Rabta $VER (build $BUILD_NO) for the Mac App Store"
echo "    app identity : $APP_IDENTITY"
echo "    pkg identity : $PKG_IDENTITY"
echo "    profile      : $PROFILE_ABS"

echo "==> workspace deps"
pnpm install --frozen-lockfile >/dev/null

echo "==> sandboxed .app (release build — slow first time)"
pnpm --filter desktop tauri build \
  --bundles app \
  --target aarch64-apple-darwin \
  --config src-tauri/tauri.appstore.conf.json

APP="$ROOT/target/aarch64-apple-darwin/release/bundle/macos/Rabta.app"
[ -d "$APP" ] || fail "expected bundle not found: $APP"

echo "==> verifying the bundle"
codesign --verify --deep --strict --verbose=2 "$APP"
ENT="$(codesign -d --entitlements :- "$APP" 2>/dev/null)"
printf '%s' "$ENT" | grep -q 'com.apple.security.app-sandbox' || fail "App Sandbox entitlement missing — the Store rejects this at upload"
printf '%s' "$ENT" | grep -q 'com.apple.security.network.server' || fail "network.server entitlement missing — the hub could not listen"
[ -f "$APP/Contents/embedded.provisionprofile" ] || fail "embedded.provisionprofile not in the bundle"
PLIST="$APP/Contents/Info.plist"
[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$PLIST")" = "$VER" ] || fail "CFBundleShortVersionString != $VER"
[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$PLIST")" = "$BUILD_NO" ] || fail "CFBundleVersion != $BUILD_NO"
[ "$(/usr/libexec/PlistBuddy -c 'Print :ITSAppUsesNonExemptEncryption' "$PLIST")" = "false" ] || fail "ITSAppUsesNonExemptEncryption not merged from Info.appstore.plist"
echo "    signature, sandbox, profile, version $VER ($BUILD_NO): ok"

PKG="$OUT/Rabta_${VER}_${BUILD_NO}_appstore.pkg"
echo "==> installer package"
rm -f "$PKG"
xcrun productbuild --sign "$PKG_IDENTITY" --component "$APP" /Applications "$PKG"
pkgutil --check-signature "$PKG" >/dev/null || fail "pkg signature check failed"
ls -lh "$PKG"

if [ "$UPLOAD" -eq 1 ]; then
  : "${ASC_API_KEY_ID:?set ASC_API_KEY_ID (App Store Connect API key id)}"
  : "${ASC_API_ISSUER_ID:?set ASC_API_ISSUER_ID (App Store Connect API issuer id)}"
  echo "==> validating with App Store Connect"
  xcrun altool --validate-app -f "$PKG" -t macos --apiKey "$ASC_API_KEY_ID" --apiIssuer "$ASC_API_ISSUER_ID"
  echo "==> uploading build $VER ($BUILD_NO)"
  xcrun altool --upload-app -f "$PKG" -t macos --apiKey "$ASC_API_KEY_ID" --apiIssuer "$ASC_API_ISSUER_ID"
  echo "==> uploaded. It appears under TestFlight/Builds in App Store Connect after processing (usually minutes)."
  echo "    Next upload of the same $VER needs a higher bundleVersion in $OVERLAY."
else
  echo "==> not uploaded (pass --upload). Transporter.app accepts the same .pkg by hand."
fi
