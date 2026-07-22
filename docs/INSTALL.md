# Installing Rabta

Rabta ships as three artifacts: the desktop app, and one extension per browser/editor you want to connect. Build them all with one command, then install each.

```sh
./scripts/package.sh        # → dist-artifacts/
```

This produces (for this machine's architecture):

| Artifact | What it is |
|---|---|
| `Rabta_0.1.0_aarch64.dmg` | the desktop app |
| `omnibus-vscode-0.1.0.vsix` | the VS Code / Cursor connector |
| `omnibus-chrome-0.1.0.zip` | the Chrome connector |

> **These builds are unsigned.** Rabta is not (yet) code-signed with an Apple Developer certificate, published to the Chrome Web Store, or listed on the VS Code Marketplace. Everything below is a local/sideload install, so each step has a "first-run trust" gesture. See **Signed distribution** at the end for what that would take.

---

## 1. Desktop app (`.dmg`)

1. Open `Rabta_0.1.0_aarch64.dmg` and drag **Rabta** to Applications.
2. First launch: macOS Gatekeeper blocks unsigned apps. **Right-click the app → Open → Open** (a normal double-click just shows "can't be opened"). You only do this once.
   - If it still refuses: `xattr -dr com.apple.quarantine /Applications/Rabta.app`
3. Rabta opens on the **Projects** view and starts its local hub on `127.0.0.1` — nothing is exposed to the network.

## 2. VS Code / Cursor connector (`.vsix`)

Install into your editor:

```sh
code   --install-extension dist-artifacts/omnibus-vscode-0.1.0.vsix   # VS Code
cursor --install-extension dist-artifacts/omnibus-vscode-0.1.0.vsix   # Cursor
```

Or in the editor UI: Extensions panel → `⋯` → **Install from VSIX…**. Reload the window. On the next start it activates automatically, reads the hub's per-run secret from the discovery file, and appears as a `vscode` connector in Rabta's **Debug** tab. It never blocks editor startup, even when Rabta isn't running.

## 3. Chrome connector (`.zip`)

Chrome can't read the hub's discovery file, so it pairs interactively — you approve it once.

1. Unzip `omnibus-chrome-0.1.0.zip` somewhere stable (the extension loads from this folder, so don't delete it).
2. `chrome://extensions` → enable **Developer mode** (top-right) → **Load unpacked** → select the unzipped `omnibus-chrome` folder.
3. With Rabta running, the extension sends a pairing request → an **approve/deny banner** appears in the Rabta window → **approve**. It reconnects as a `chrome` connector and remembers its token across restarts.
   - If Rabta bound a port other than the default `17872` (rare — only if 17872 was taken), the app header shows the real port; enter it in the extension's popup.

The extension can read only tab **URLs and titles** (http/https, non-incognito) — it requests no host permissions and runs no content scripts, so it is structurally unable to read page contents.

---

## Signed / store distribution (not done)

To hand this to someone who *isn't* comfortable right-click-Opening an unsigned app, you'd need accounts this project doesn't assume:

- **macOS:** an Apple Developer account ($99/yr) to codesign + notarize the `.dmg`. Tauri supports this via `bundle.macOS.signingIdentity` + notarization env vars — no code changes, just the cert and a CI step.
- **Chrome:** a Chrome Web Store developer account ($5 one-time) to publish (or distribute a signed `.crx` with an enterprise policy).
- **VS Code:** a Marketplace publisher (free) via `vsce publish` with a Personal Access Token.

None of these change the app — they're packaging/distribution credentials. Until then, the local install above is the supported path.
