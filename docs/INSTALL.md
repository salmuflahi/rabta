# Installing Rabta

Rabta ships as three artifacts: the desktop app, and one extension per
browser/editor you want to connect.

**Get it from the website:** <https://salmuflahi.github.io/rabta/>

| Artifact | What it is | Where to get it |
|---|---|---|
| `Rabta_0.1.0_aarch64.dmg` | the desktop app (macOS, Apple Silicon) | [Download](https://github.com/salmuflahi/rabta/releases/download/v0.1.0/Rabta_0.1.0_aarch64.dmg) |
| Rabta Connector (editor) | VS Code / Cursor extension | [Open VSX](https://open-vsx.org/extension/rabta-connect/rabta-vscode) |
| Rabta Connector (browser) | Chrome extension | Pending Chrome Web Store review |

> To rebuild all three from source for this machine's architecture:
> `./scripts/package.sh` → `dist-artifacts/`. This is only needed for
> development — end users install from the links above.

---

## 1. Desktop app (`.dmg`)

The macOS app is **signed with an Apple Developer ID and notarized by Apple**,
so it installs and launches like any other Mac app — no right-click→Open, no
Gatekeeper "unidentified developer" warning.

1. Download `Rabta_0.1.0_aarch64.dmg` and **double-click** it to mount.
2. Drag **Rabta** into the **Applications** folder shown in the window.
3. Launch Rabta from **Applications**, **Spotlight**, or **Launchpad**.
4. Rabta opens on the **Overview** view and starts its local hub on `127.0.0.1`
   — nothing is exposed to the network.

**Requirements:** macOS 11.0 (Big Sur) or later · Apple Silicon (arm64). There
is no Intel/x86 build.

### Verify your download (optional but recommended)

```sh
shasum -a 256 ~/Downloads/Rabta_0.1.0_aarch64.dmg
# expected:
# 3978ec57af7d37ab32670033d679c21a28cf74cebb0435ce011049e05635c655
```

You can also confirm the notarization/signature yourself:

```sh
xcrun stapler validate  ~/Downloads/Rabta_0.1.0_aarch64.dmg   # -> "The validate action worked!"
spctl -a -vv -t install ~/Downloads/Rabta_0.1.0_aarch64.dmg   # -> accepted, source=Notarized Developer ID
```

- **Team ID:** `86M2X6MUA3` · **Bundle ID:** `com.omnibus.dev`
- **Signing identity:** `Developer ID Application: sammy almuflahi (86M2X6MUA3)`

## 2. VS Code / Cursor connector

Install **Rabta Connector** from **Open VSX** —
<https://open-vsx.org/extension/rabta-connect/rabta-vscode>. Cursor, VSCodium,
and Windsurf install from Open VSX directly; in those editors just search for
"Rabta Connector" in the Extensions panel, or:

```sh
cursor --install-extension rabta-connect.rabta-vscode
```

For stock **VS Code** (Microsoft Marketplace), Rabta Connector is **not yet
published** there — install the same `.vsix` manually for now:

```sh
code --install-extension dist-artifacts/rabta-vscode-0.1.0.vsix
```

Reload the window. On the next start it activates automatically, reads the hub's
per-run secret from the discovery file, and appears as a `vscode` connector in
Rabta's **Connectors** view. It never blocks editor startup, even when Rabta
isn't running.

## 3. Chrome connector

The **Rabta Connector** Chrome extension is **pending Chrome Web Store review**
(item "Rabta Connector", extension id `aaombpafbhjkoinppogieaclijddlebo`). Once
approved it will install from the Web Store like any other extension.

Until it's approved, load it unpacked from the built folder:

1. Unzip `rabta-chrome-0.1.0.zip` somewhere stable (the extension loads from
   this folder, so don't delete it).
2. `chrome://extensions` → enable **Developer mode** (top-right) → **Load
   unpacked** → select the unzipped `rabta-chrome` folder.
3. With Rabta running, the extension sends a pairing request → an
   **approve/deny banner** appears in the Rabta window → **approve**. It
   reconnects as a `chrome` connector and remembers its token across restarts.
   - If Rabta bound a port other than the default `17872` (rare — only if 17872
     was taken), the app header shows the real port; enter it in the extension's
     popup.

The extension can read only tab **URLs and titles** (http/https, non-incognito)
— it requests no host permissions and runs no content scripts, so it is
structurally unable to read page contents.

---

## Privacy

Everything runs locally: no accounts, no cloud, no telemetry. Connectors talk
only to the Rabta app on `127.0.0.1`. Full policy:
<https://rabta-privacy.n0bodyy.chatgpt.site/>.

## Distribution status

| Channel | State |
|---|---|
| macOS DMG | **Signed, notarized, hosted** — [download](https://github.com/salmuflahi/rabta/releases/download/v0.1.0/Rabta_0.1.0_aarch64.dmg) |
| Open VSX (Cursor / VSCodium / Windsurf) | **Published** — `rabta-connect.rabta-vscode` 0.1.0 |
| Chrome Web Store | Pending review (`aaombpafbhjkoinppogieaclijddlebo`) |
| VS Code Marketplace (Microsoft) | Not yet published |

See [`docs/RELEASE.md`](./RELEASE.md) for the full release/signing checklist.
