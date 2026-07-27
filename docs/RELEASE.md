# Release & signing checklist

The exact steps to cut a signed, distributable Rabta release. Everything here
is **packaging/credentials** — none of it changes app code.

Current state: builds are **unsigned / sideload-only** (see `docs/INSTALL.md`).
The gap to a public release is the three developer accounts below plus the
mechanical steps to use them.

- **macOS desktop:** Apple Developer Program — **$99/yr**
- **Chrome extension:** Chrome Web Store developer account — **$5 one-time**
- **VS Code / Cursor extension:** VS Code Marketplace publisher (free) **and**
  Open VSX (free — this is what **Cursor** installs from, not the MS Marketplace)

Repo facts this checklist assumes:
- App: `apps/desktop`, productName **Rabta**, bundle id **`com.omnibus.dev`**,
  Tauri v2, macOS `aarch64`.
- Packaging: `./scripts/package.sh` → `dist-artifacts/`:
  `Rabta_<ver>_aarch64.dmg`, `rabta-chrome-<ver>.zip`, `rabta-vscode-<ver>.vsix`.
- Env quirks ([[sammy-dev-env]]): `cargo` is at `~/.cargo/bin` and NOT on the
  non-login PATH — prefix Rust/build commands with
  `export PATH="$HOME/.cargo/bin:$PATH"`. `vsce`/`ovsx` need **Node ≥ 20**
  (default `node` is v18; `package.sh` already auto-selects a newer one).

---

## 0. Pre-flight (every release)

- [ ] Green on `main`: `pnpm --dir apps/desktop test` (frontend) and
      `export PATH="$HOME/.cargo/bin:$PATH"; cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` (Rust).
- [ ] Typecheck + production build: `pnpm --dir apps/desktop build`.
- [ ] Human GUI acceptance pass on the unsigned `.app` (the automation can't do
      these): windowed **and** fullscreen layout, sidebar collapse animation,
      reduced-motion, light/dark, and a real end-to-end connector pairing
      (install a real VS Code + Chrome extension, approve the pairing, do a
      Save → switch → Resume).
- [ ] **Bump the release version in every user-facing place** (they are not
      derived from one source). The four that gate the shipped artifacts:
  - `apps/desktop/src-tauri/tauri.conf.json` → `"version"` (the `.app`/`.dmg`)
  - `connectors/chrome/manifest.json` → `"version"` (the Chrome extension)
  - `connectors/vscode/package.json` → `"version"` (the VS Code / Cursor extension)
  - `scripts/package.sh` → `VER="…"` (names the output files)

  Internal workspace packages (`packages/protocol`, `packages/connector-sdk`,
  `connectors/{chrome,fake}/package.json`) carry their own versions — bump for
  coordination if you like, but they don't gate the release.
  **Do NOT touch `packages/protocol/fixtures/hello-version.json`** — its
  `"version": "0.1.0"` is a test-assertion value, not a release version.
- [ ] Tag intent (don't push the tag until artifacts verify): choose `vX.Y.Z`.

---

## 1. macOS — sign + notarize the desktop app

**One-time setup**
- [ ] Enroll in the Apple Developer Program ($99/yr).
- [ ] In Xcode → Settings → Accounts (or the Developer portal), create a
      **Developer ID Application** certificate and install it in the login
      keychain. Confirm: `security find-identity -v -p codesigning` shows
      `Developer ID Application: <Name> (<TEAMID>)`.
- [ ] Create an **app-specific password** for your Apple ID (appleid.apple.com
      → Sign-In & Security) for notarization.
- [ ] (Optional but cleaner) Consider whether the bundle id `com.omnibus.dev`
      should become a reverse-domain you actually own. Signing does not require
      it, but it's the identity users and the notary service will see.

**Configure Tauri** — already staged. `bundle.macOS.minimumSystemVersion` is
in `apps/desktop/src-tauri/tauri.conf.json`. Signing is left **env-driven**
(`APPLE_SIGNING_IDENTITY`) rather than hardcoded in the config, so the
current unsigned/ad-hoc build path keeps working and turns into a signed build
purely by setting the env vars below — no config edit at sign time.

Hardened runtime is applied automatically when signing. Only add a
`bundle.macOS.entitlements` plist if notarization later flags a specific denied
capability (Rabta shells out to `git`/`gh`/`open`, which is allowed under the
default hardened runtime — no entitlement needed).

**Build with notarization** (Tauri v2 notarizes during `tauri build` when these
are set):
```bash
export PATH="$HOME/.cargo/bin:$PATH"
export APPLE_ID="you@example.com"
export APPLE_PASSWORD="<app-specific-password>"
export APPLE_TEAM_ID="<TEAMID>"
export APPLE_SIGNING_IDENTITY="Developer ID Application: <Name> (<TEAMID>)"
pnpm --dir apps/desktop tauri build --bundles app dmg
```

**Verify before shipping the DMG**
- [ ] `codesign --verify --deep --strict --verbose=2 target/release/bundle/macos/Rabta.app`
- [ ] `spctl -a -t exec -vvv target/release/bundle/macos/Rabta.app` → *accepted, source=Notarized Developer ID*.
- [ ] Staple the ticket to the DMG so offline installs pass Gatekeeper:
      `xcrun stapler staple target/release/bundle/dmg/Rabta_<ver>_aarch64.dmg`
      then `xcrun stapler validate <dmg>`.
- [ ] Fresh-machine sanity: download the DMG (so it carries the quarantine
      xattr) and confirm it opens with a **normal double-click** — no
      right-click→Open needed.

> Note: this produces an **arm64-only** build. Add an `x86_64` /
> `universal-apple-darwin` target if Intel Macs must be supported.

---

## 2. Chrome — publish the extension

- [ ] Register a Chrome Web Store developer account ($5 one-time).
- [ ] Build the zip: `pnpm --filter rabta-chrome build` then use
      `dist-artifacts/rabta-chrome-<ver>.zip` (or `./scripts/package.sh`).
- [ ] Web Store → **Add new item** → upload the zip. Fill store listing (name
      "Rabta Connector", description, icons, screenshots, a privacy
      justification for the `tabs` permission — Rabta reads tab URLs locally to
      capture/restore a task; no data leaves the machine).
- [ ] Submit for review (approval typically takes a few days).

**Extension-ID note:** the published item gets a **new, Store-assigned ID**
(different from the unpacked dev ID). That's fine — the hub accepts any
`chrome-extension://` origin and pairing is approved in-app per connector, so a
new ID just prompts one approval. If you need a **stable ID across dev and
prod**, add a `"key"` to `connectors/chrome/manifest.json` (from the Store item)
before first upload.

- [ ] After publish, update the Connectors "how to connect" copy in
      `apps/desktop/src/pages/ConnectorsPage.tsx` (`ConnectHowTo` steps) to point
      at the Web Store link instead of "load unpacked".

---

## 3. VS Code + Cursor — publish the extension

Publish to **both** registries — the MS Marketplace serves VS Code; **Cursor,
VSCodium, and Windsurf install from Open VSX.**

**Marketplace (VS Code)**
- [ ] Create an Azure DevOps org and a **publisher** whose id matches
      `connectors/vscode/package.json` → `"publisher": "rabta-connect"` (or change
      the manifest to a publisher id you own).
- [ ] Create a Personal Access Token (Azure DevOps → scope **Marketplace →
      Manage**).
- [ ] Publish with Node ≥ 20:
      ```bash
      cd connectors/vscode && pnpm build
      npx @vscode/vsce@latest login rabta-connect   # paste the PAT once
      npx @vscode/vsce@latest publish            # or: publish -p <PAT>
      ```
      (`package.sh` already handles the Node-≥20 selection when it only
      *packages* the `.vsix`; publishing needs the same Node.)

**Open VSX (Cursor)**
- [ ] Create an Open VSX account (open-vsx.org) + access token; create the
      `rabta-connect` namespace once (`npx ovsx create-namespace rabta-connect -p <token>`).
- [ ] Publish the same `.vsix`:
      `npx ovsx publish dist-artifacts/rabta-vscode-<ver>.vsix -p <token>`.

- [ ] Fill `repository`/`icon`/`README` in `connectors/vscode/package.json` if
      missing — Marketplace listings look bare without them (`vsce package`
      currently runs with `--allow-missing-repository`).
- [ ] After publish, update the `ConnectHowTo` VS Code steps to "install from
      the Marketplace / Open VSX" instead of the VSIX sideload steps.

---

## 4. Cut the release

- [ ] Regenerate all three artifacts from the bumped version:
      `./scripts/package.sh` → verify `dist-artifacts/` names carry the new
      version.
- [ ] Re-run the macOS verify steps (§1) on the freshly built DMG.
- [ ] Commit the version bumps + any config/doc changes; tag `vX.Y.Z`.
- [ ] Publish the signed DMG (GitHub Release, download page, etc.). The store
      listings (Chrome / Marketplace / Open VSX) are the extension delivery.
- [ ] Flip `docs/INSTALL.md`: the "unsigned / sideload" framing and the
      "Signed / store distribution (not done)" section should now describe the
      real signed install path + store links.

---

## 5. Post-release

- [ ] Install each artifact clean on a machine that never had Rabta: DMG opens
      without Gatekeeper friction; extensions install from their stores; a real
      pair → Save → Resume works end to end.
- [ ] Keep secrets out of the repo — the Apple app-specific password, PATs, and
      store tokens live in your keychain / CI secrets only.

---

## Deferred / known follow-ups

- **Bulk multi-select on capsules** — larger opt-in feature, not built yet.
- **Auto-update** — not wired. If wanted, Tauri's updater plugin needs an update
  endpoint + a signing keypair (separate from the Apple cert).
- **Intel / universal macOS build** — current bundle is arm64 only.
