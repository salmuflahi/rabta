# Release & signing checklist

The exact steps to cut a signed, distributable Rabta release. Everything here
is **packaging/credentials** — none of it changes app code.

**Current state (v0.1.0):** the macOS app is **signed, notarized, and publicly
hosted**; the editor extension is **published to Open VSX**; the Chrome
extension is **live on the Web Store**. The only remaining channel is the
Microsoft VS Code Marketplace.

**The connectors have moved ahead of the app, to 0.2.0.** The desktop app
itself is still v0.1.0 — 0.2.0 is a connector-only bump for focus mode's
reconcile step (`tabs.close` / `editor.closeFile` / `terminal.dispose`).
Neither store has this version yet: both listings below are still serving
0.1.x until someone runs the publish steps in §2/§3 for 0.2.0. It also raises
`engines.vscode` — see §3.

| Channel | State |
|---|---|
| macOS DMG | ✅ Signed (Developer ID `86M2X6MUA3`), notarized, stapled, hosted |
| Open VSX (Cursor / VSCodium / Windsurf) | ✅ Published — `rabta-connect.rabta-vscode` 0.1.0; 0.2.0 packaged, awaiting upload |
| Chrome Web Store | ✅ Live — [Rabta Connector](https://chromewebstore.google.com/detail/rabta-connector/aaombpafbhjkoinppogieaclijddlebo) 0.1.1; 0.2.0 packaged, awaiting upload |
| VS Code Marketplace (Microsoft) | ❌ Not published (blocked on Azure DevOps PAT) |
| Trader / account verification (Google) | ⏳ Pending |

**Public downloads**
- Website: <https://rabta.build/>
- Direct DMG: <https://github.com/salmuflahi/rabta/releases/download/v0.1.0/Rabta_0.1.0_aarch64.dmg>
- SHA-256: `3978ec57af7d37ab32670033d679c21a28cf74cebb0435ce011049e05635c655`

The developer accounts this required (for reference):

- **macOS desktop:** Apple Developer Program — **$99/yr** — done
- **Chrome extension:** Chrome Web Store developer account — **$5 one-time** (adult-owned account) — published
- **VS Code / Cursor extension:** Open VSX (free — this is what **Cursor**
  installs from, not the MS Marketplace) — **done**; the MS VS Code Marketplace
  publisher is **published** — updates go through the publisher management UI
  (Manage → ⋮ → Update → drop the .vsix), which needs no PAT and no Azure
  DevOps organization. `vsce` is only needed for CLI publishing, and creating
  an org for its PAT now requires a linked Azure subscription.

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

### Brand assets

Every icon, favicon and social image in the repo is generated from one vector
source, `site/public/assets/brand/rabta-mark.svg`. Nothing brand-related is hand-
edited as a raster. Regenerate after any change to the mark:

```sh
python3 scripts/generate-brand-assets.py
```

That writes the website favicon set and web-app icons, the Tauri bundle icons
(`.png`/`.ico`/`.icns`), the Chrome and VS Code connector icons, the `-primary`
and `-mono` colourways, and the 1200x630 social card (composed from
`site/public/assets/brand/og-card.html`, rendered with headless Chrome). Requires
macOS `sips` + `iconutil`; no third-party imaging libraries.

The script has no fallback artwork: if the source SVG is missing it exits
rather than drawing anything, so it cannot resurrect the pre-0.1.0 navy/sky
circular icon that the deleted `scripts/make-icon.py` produced.

### Website screenshots

Product screenshots on rabta.build are captured from the real app frontend
against a mocked Tauri bridge with a frozen fixture — see
[`apps/desktop/capture/README.md`](../apps/desktop/capture/README.md):

```sh
cd apps/desktop && node capture/capture.mjs   # real UI, deterministic demo data
python3 scripts/optimize-shots.py             # AVIF/WebP/PNG responsive set
```

---

## 1. macOS — sign + notarize the desktop app

> ✅ **Done for 0.1.0.** Signed with `Developer ID Application: sammy almuflahi
> (86M2X6MUA3)`, notarized (submission accepted), stapled, and verified —
> `codesign`/`hdiutil verify`/`stapler validate`/`spctl` all pass on the freshly
> downloaded DMG. The steps below are the repeatable recipe for the next build.

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

> ✅ **Live.** Adult-owned publisher `rabta-connect`; item "Rabta Connector",
> Store id `aaombpafbhjkoinppogieaclijddlebo`, at
> <https://chromewebstore.google.com/detail/rabta-connector/aaombpafbhjkoinppogieaclijddlebo>.
> An older item under a prior account (id `eglannhohnfalopddjbjhgiimeblmgbj`) is
> **obsolete** — not the current listing.

First publish (done):

- [x] Register a Chrome Web Store developer account ($5 one-time).
- [x] Web Store → **Add new item** → upload the zip. Fill store listing (name
      "Rabta Connector", description, icons, screenshots, a privacy
      justification for the `tabs` permission — Rabta reads tab URLs locally to
      capture/restore a task; no data leaves the machine).
- [x] Submit for review (approval typically takes a few days).

Each subsequent version:

- [ ] Bump `"version"` in **both** `connectors/chrome/manifest.json` and
      `connectors/chrome/package.json`. The Store rejects a re-upload that does
      not raise the manifest version.
- [ ] Build the zip: `./scripts/package-chrome.sh` (prints the artifact path;
      `./scripts/package.sh` calls it as part of building everything). This is
      the only thing that assembles the zip — packaging and publishing cannot
      disagree about what ships.
- [ ] Load the **extracted zip** unpacked and open the popup before uploading.
      Missing a file that only `popup.html` references — `popup.css` went
      missing this way and shipped in 0.1.1 — breaks nothing at build time and
      is visible only to whoever installs it from the Store.
- [ ] Upload. Either `./scripts/publish-chrome.mjs --publish` (below), or by
      hand: Developer Dashboard → the item → **Package** → **Upload new
      package** → submit for review.

### Publishing from the command line

`./scripts/publish-chrome.mjs` uploads and (with `--publish`) submits for
review through the Web Store API v2. Without the flag it uploads only, leaving
a draft that nobody can install — so a bare run cannot put a build in front of
users by accident.

```bash
export CWS_SERVICE_ACCOUNT_KEY=~/.config/rabta/cws-key.json
export CWS_PUBLISHER_ID=<the first GUID in the dashboard URL>
./scripts/publish-chrome.mjs --publish
```

Auth is a Google Cloud **service account** rather than an OAuth refresh token:
nothing expires, there is no consent flow to redo, and the credential is a file
that never has to be pasted into a form. The v1 API is retired **2026-10-15**;
this speaks v2.

One-time setup, on the account that owns the listing:

- [ ] [Cloud Console](https://console.cloud.google.com) → a project → enable
      the **Chrome Web Store API**.
- [ ] [Service accounts](https://console.cloud.google.com/iam-admin/serviceaccounts)
      → create one. It needs no IAM roles — its access comes from the step
      below, not from the project.
- [ ] Create a **JSON key** for it and save it outside the repo (e.g.
      `~/.config/rabta/cws-key.json`, `chmod 600`). It is a credential: never
      commit it.
- [ ] Web Store Developer Dashboard → **Account** → add the service account's
      email as a publisher member. **A publisher can only have one service
      account**, so this choice is effectively permanent — worth doing on the
      account that will hold the listing long term.
- [ ] `CWS_PUBLISHER_ID` is the first GUID in the dashboard URL:
      `…/devconsole/<PUBLISHER_ID>/<ITEM_ID>/edit/package`. `CWS_ITEM_ID`
      defaults to the published item, so it only needs setting for a different
      extension.

`tests/scripts/publish-chrome.test.mjs` runs the script against a stub that
checks each request the way Google would — the signed assertion, the upload
body, and that a failed upload is never published on top of. It cannot test the
real Store, because an upload is not something you can do twice to see what
happens.

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

**0.2.0 raises the floor.** `engines.vscode` moved from `^1.85.0` to
`^1.93.0` — VS Code 1.85 through 1.92 can no longer install this extension.
Focus mode's busy-terminal detection needs `onDidStartTerminalShellExecution`
/ `onDidEndTerminalShellExecution`, stable only from 1.93; there's no
fallback for older editors. Both registries enforce `engines.vscode`
themselves, so this isn't a step to perform — it's what anyone still on
1.85–1.92 loses the moment 0.2.0 goes live: they stop seeing updates until
they upgrade the editor.

**Marketplace (VS Code)** — ❌ **not published.** The `rabta-connect` publisher
page exists, but publishing is blocked on Azure DevOps personal-access-token
creation (the Azure signup card check rejected a prepaid card). Deferred — Open
VSX already serves Cursor / VSCodium / Windsurf. An adult-owned Azure account
may be used later, as with Chrome.
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

**Open VSX (Cursor)** — ✅ **published**: <https://open-vsx.org/extension/rabta-connect/rabta-vscode>
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
- [x] Publish the signed DMG — hosted as a GitHub Release asset at
      <https://github.com/salmuflahi/rabta/releases/download/v0.1.0/Rabta_0.1.0_aarch64.dmg>,
      linked from the website <https://rabta.build/>. The store
      listings (Chrome / Marketplace / Open VSX) are the extension delivery.
- [x] `docs/INSTALL.md` now describes the real signed install path + store links.

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
