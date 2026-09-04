# Mac App Store submission

Everything the Mac App Store needs from this repo, and the honest state of
what a Store build can and cannot do. This is a **third distribution channel**
beside the signed DMG (`docs/RELEASE.md` §1) and the two extension stores; it
does not replace any of them.

**State: submission kit ready, nothing uploaded.** No App Store Connect record
exists yet. Building, signing and uploading need a Mac with the Apple
Developer account for team `86M2X6MUA3` — none of that can be done from CI or
from a Linux checkout. Read §1 before spending the afternoon.

| Piece | Where | State |
|---|---|---|
| Sandbox entitlements | `apps/desktop/src-tauri/Entitlements.appstore.plist` | ✅ |
| Store-only Info.plist keys (export compliance, category) | `apps/desktop/src-tauri/Info.appstore.plist` | ✅ |
| Tauri config overlay (Store build only) | `apps/desktop/src-tauri/tauri.appstore.conf.json` | ✅ |
| Build → sign → `.pkg` → validate → upload | `scripts/package-appstore.sh` | ✅ untested on a Mac — see §3 |
| Screenshots, 2560×1600 | `docs/app-store/screenshots/` (six PNGs) | ✅ rendered |
| 1024×1024 icon | `apps/desktop/src-tauri/icons/icon.icns` (`ic10`) | ✅ already in the bundle |
| Listing copy, privacy answers, review notes | §4 below | ✅ |
| Connectors find a sandboxed hub | `packages/connector-sdk` (`hubDiscoveryCandidates`) | ✅ in-repo, **not yet in a published extension** |
| Repository access under the sandbox | — | ❌ blocker, §1 |
| GitHub via `gh` under the sandbox | — | ❌ blocker, §1 |

---

## 1. Read first: what the sandbox does to Rabta

The Store requires App Sandbox (App Review Guideline 2.4.5(i)); the DMG build
has no sandbox and does not need one. Under the sandbox the app, **and every
`git`/`gh` process it spawns**, can read only its own container plus what the
user has explicitly granted through an open panel. Three things in Rabta
collide with that.

**1. Registered repositories are unreachable.** Projects are registered by
pasting a path (`~/code/atlas-api`). A pasted path grants nothing under the
sandbox, so `git -C ~/code/atlas-api status` fails with *Operation not
permitted* and every project row shows an error. Making it work needs two
code changes that are not in this repo yet:

- a **folder picker** (`tauri-plugin-dialog` → `NSOpenPanel`) as the way to
  register a project, which grants access for the running process; and
- **security-scoped bookmarks** so that grant survives relaunch. Tauri does not
  provide these; it needs a small native shim (`NSURL
  bookmarkDataWithOptions:` / `startAccessingSecurityScopedResource` via
  `objc2`) stored beside the project row in `omnibus.db`. Without it a Store
  build works until the user quits, then loses every repository.

**2. GitHub via the `gh` CLI does not work.** `gh` keeps its login in
`~/.config/gh/hosts.yml`, which the inherited sandbox denies, and a Homebrew
`gh` under `/opt/homebrew` may not even be readable. The GitHub panel will
report `gh` as unavailable. The options are to accept that the Store build has
no GitHub features (and say so in the listing), or to talk to the GitHub API
directly — which means holding a token, which the product promises never to
do. That is a product decision, not a packaging one.

**3. The hub's discovery file moves.** The sandbox rewrites `$HOME` for the
process, so `hub.json` lands in
`~/Library/Containers/com.omnibus.dev/Data/Library/Application Support/com.omnibus.dev/`
instead of `~/Library/Application Support/com.omnibus.dev/`. The connector SDK
now looks in both and picks the most recently written file, but the
**published editor extension (0.2.0) predates that**: it will not see a Store
build's hub until the next extension release ships from this tree. The Chrome
extension is unaffected (it dials the fixed port `17872`).

Also worth knowing: the Store build has its own database. Someone moving from
the DMG to the Store starts empty; there is no migration between the two data
directories. And the build is Apple Silicon only, like the DMG — the Store
lists it as requiring an M1 or later.

**Verdict.** Submitting today would put a reviewer in front of an app whose
core feature fails the moment they register a project: a Guideline 2.1
rejection, or worse, an approval of something that does not work. Do items 1
and 2 first (a folder picker with bookmarks is a day or two; `gh` is a
decision), release an editor extension that knows the container path, then run
§3. Everything else in this document is ready and waits.

---

## 2. One-time setup (on a Mac, with the developer account)

The Developer ID certificate that signs the DMG is **not** usable here; the
Store has its own pair.

- [ ] **App ID.** Certificates, Identifiers & Profiles → Identifiers → register
      an explicit App ID `com.omnibus.dev` (the bundle id in
      `tauri.conf.json`). No capabilities need toggling; the sandbox is an
      entitlement, not an App ID capability.
- [ ] **Certificates.** Create and install in the login keychain:
      *Apple Distribution* (signs the app) and *Mac Installer Distribution*
      (signs the `.pkg`; the keychain shows it as `3rd Party Mac Developer
      Installer`). Confirm with `security find-identity -v`.
- [ ] **Provisioning profile.** Profiles → new → *Mac App Store Connect* →
      App ID `com.omnibus.dev` → the Apple Distribution certificate. Download
      it to `signing/Rabta_Mac_App_Store.provisionprofile` — the path
      `tauri.appstore.conf.json` embeds. `/signing/` is gitignored; keep it
      that way.
- [ ] **App Store Connect record.** My Apps → **+** → New App: platform
      *macOS*, name **Rabta**, primary language *English (U.S.)*, bundle ID
      `com.omnibus.dev`, SKU `rabta-macos`. Free app — no Paid Apps agreement
      needed; the Developer Program License Agreement must be current.
- [ ] **API key** for uploads. Users and Access → Integrations → App Store
      Connect API → team key with the *App Manager* role. Save
      `AuthKey_<KEYID>.p8` to `~/.appstoreconnect/private_keys/` (where
      `altool` looks) and note the **Key ID** and **Issuer ID**.

---

## 3. Build, package, upload

```sh
export PATH="$HOME/.cargo/bin:$PATH"
./scripts/package-appstore.sh              # build, sign, .pkg, verify — no upload
./scripts/package-appstore.sh --upload     # …then validate + upload to App Store Connect
```

For `--upload`: `export ASC_API_KEY_ID=<key id> ASC_API_ISSUER_ID=<issuer id>`.

What the script does, so a failure is placeable:

1. Refuses to run without the provisioning profile, an *Apple Distribution*
   identity and a *3rd Party Mac Developer Installer* identity in the
   keychain (`APPLE_SIGNING_IDENTITY` / `APPLE_INSTALLER_IDENTITY` override
   the auto-detection). A Developer ID identity is rejected by name.
2. Clears `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_API_*` for the build. Tauri
   notarizes whenever those are set, and a Store build must not be notarized
   — the notary service rejects Apple Distribution signatures.
3. `tauri build --bundles app --target aarch64-apple-darwin --config
   src-tauri/tauri.appstore.conf.json`. The overlay is merged over
   `tauri.conf.json`: it drops the `dmg` target, applies the sandbox
   entitlements, merges `Info.appstore.plist`, sets `CFBundleVersion` from
   `bundleVersion`, and copies the profile to
   `Contents/embedded.provisionprofile`. The DMG build never sees any of it.
4. Verifies the result: `codesign --verify --deep --strict`; the sandbox and
   `network.server` entitlements are present; the profile is embedded;
   `CFBundleShortVersionString` / `CFBundleVersion` /
   `ITSAppUsesNonExemptEncryption` read what the config says.
5. `productbuild --sign "3rd Party Mac Developer Installer: …"` →
   `dist-artifacts/Rabta_<ver>_<build>_appstore.pkg`, then
   `pkgutil --check-signature`.
6. With `--upload`: `xcrun altool --validate-app`, then `--upload-app`. The
   build appears under the app's **TestFlight / Builds** after processing.
   Transporter.app accepts the same `.pkg` by drag-and-drop if `altool` is
   ever retired.

**Every upload needs a new build number.** App Store Connect rejects a second
`0.1.0 (1)`. Bump `bundle.macOS.bundleVersion` in `tauri.appstore.conf.json`
before each upload; the marketing version stays whatever `tauri.conf.json`
says (bumped per `docs/RELEASE.md` §0). Bumping the marketing version resets
nothing — build numbers only have to be unique within a version, but counting
up forever is simpler.

**Untested caveat.** The script was written and syntax-checked without a Mac
in reach; its first real run is the test. Each step is a standard Xcode
command, and each verification names what it expected, so a failure says which
assumption was wrong.

---

## 4. App Store Connect — the listing, ready to paste

**Name** (30): `Rabta`
**Subtitle** (30): `Save & restore dev workspaces`
**Primary category:** Developer Tools · **Secondary:** Productivity
**Price:** Free · **Availability:** all territories
**Copyright:** `2026 Sammy Almuflahi`
**Version:** whatever `tauri.conf.json` says (`0.1.0`)

**Promotional text** (170, editable without a new build):
> Switch tasks and your workspace comes back: files, terminals, branch, tabs. Local-first, no account, nothing leaves your Mac.

**Description** (4000):
> Rabta is a local-first workspace for developers who work in tasks, not apps.
>
> Your editor, browser, terminal and git each know their own piece of what you were doing. Rabta connects them once, through a hub that runs only on your Mac, and remembers the whole picture per task: the files that were open, the terminal folders, the git branch, the browser tabs. Switch to another task and that state is saved. Come back and it is restored.
>
> WHAT IT DOES
> • Capsules. Save the state of a task across every connected tool. Switching tasks saves the one you leave and restores the one you pick.
> • Honest restores. Rabta reports what came back and what is still waiting on another app, rather than pretending everything landed.
> • Pins. Mark a file or tab as always part of a task; it opens every time you resume, even if you closed it last time.
> • Focus mode, off by default. Resuming a task also puts away what does not belong to it, one tab or file at a time — never an unsaved file, never a busy terminal.
> • Safe git. Status, fetch, checkout and new branches from the project row. Rabta never force-checkouts, resets, stashes or discards; a dirty tree is refused, not overwritten.
>
> WHAT IT NEVER DOES
> • No cloud, no account, no telemetry. Nothing leaves your machine.
> • It stores only the metadata needed to restore a task: file paths, folders, a branch name, tab URLs. Never file contents, terminal output, keystrokes, page contents, cookies or history.
> • Every app connects through a hub bound to 127.0.0.1 only, and you approve each connection in the app.
>
> CONNECTORS
> Rabta works with the free Rabta Connector extensions: for Cursor and other VS Code-compatible editors through Open VSX, and for Chrome through the Chrome Web Store. Install the ones you use; each pairs with the app on your Mac. Git features need git installed.
>
> Rabta is open source under the MIT license: github.com/salmuflahi/rabta

> If the Store build ships without GitHub features (§1 item 2), leave the
> GitHub-issues bullet out — it is deliberately absent above. Add it back only
> when the Store build can actually do it.

**Keywords** (100, comma-separated, no spaces after commas):
`workspace,tasks,context switch,restore,session,git,branch,tabs,cursor,vscode,chrome,local,developer`

**Support URL:** <https://rabta.build/contact/>
**Marketing URL:** <https://rabta.build/>
**Privacy Policy URL:** <https://rabta.build/privacy/>

**What's New** (first version): `First release on the Mac App Store.`

### Screenshots

Six 2560×1600 PNGs in `docs/app-store/screenshots/`, uploaded in filename
order — App Store Connect keeps the order you add them. They are the real app
on the frozen demo fixture (`apps/desktop/capture/README.md`), captioned the
same way as the Chrome Web Store set so the two listings read as one product.

| # | File | Says |
|---|---|---|
| 1 | `rabta-1-overview-2560x1600.png` | Your dev tools, saved as tasks. |
| 2 | `rabta-2-capsules-2560x1600.png` | Save it. Leave. Come back. |
| 3 | `rabta-3-restore-2560x1600.png` | What came back, and what is waiting. |
| 4 | `rabta-4-projects-2560x1600.png` | Switch branches without losing work. |
| 5 | `rabta-5-connectors-2560x1600.png` | You approve every connection. |
| 6 | `rabta-6-activity-2560x1600.png` | Everything flows through one local hub. |

Regenerate after the product shots change:

```sh
cd apps/desktop && node capture/capture.mjs     # refresh website/assets/shots/src/*.png
./scripts/make-appstore-shots.mjs               # -> docs/app-store/screenshots/
```

No app preview video is planned; the site's demo loops are the wrong aspect
ratio and the Store's preview spec (H.264, 1920×1080 or 16:10 at those sizes,
15–30 s) is a separate recording job.

**Icon:** taken from the uploaded build. `icon.icns` already carries the
1024×1024 (`ic10`) representation the Store requires; it is generated from
`website/assets/brand/rabta-mark.svg` by `scripts/generate-brand-assets.py`.

### Age rating

Every question *None* / *No* → **4+**. No unrestricted web access (the app
opens links in the user's browser, it does not host one), no user-generated
content, no gambling, no contests.

### App Privacy

**Data Not Collected.** Answer *No* to "do you or your third-party partners
collect data from this app". This is exactly what `docs/privacy-policy.md`
says, and the app has no network path that could contradict it: no analytics
SDK, no crash reporter, no account. Privacy policy URL as above.

### Export compliance

Already answered in the binary: `ITSAppUsesNonExemptEncryption = false` in
`Info.appstore.plist`, so App Store Connect does not ask on each upload. The
only traffic the app itself originates is plaintext WebSocket on loopback;
`git` and `gh` reach remotes over the system TLS stack, which is exempt.

### Content rights

Contains no third-party content that needs a license beyond the open-source
dependencies listed in `Cargo.lock` / `pnpm-lock.yaml` (all permissive) and
the Inter font (`website/assets/fonts/Inter-LICENSE.txt`, OFL).

### App Review Information

Sign-in required: **No** — there is no account. Contact: the developer's
name, phone and email (not stored here).

**Notes for the reviewer** — paste once §1's blockers are closed, updating the
second paragraph to match what the build can actually do:

> Rabta is a local-first desktop hub for developers. It has no account, no server and no telemetry; the only network activity is a WebSocket server on 127.0.0.1 (port 17872 when free) that companion extensions on the same Mac connect to. That listener is why the app carries the network.server entitlement, and network.client is for the user's own `git fetch` running as a child process.
>
> To try the core loop without installing anything else: add a project by picking any local folder that is a git repository (Projects → Register; the open panel is how the sandbox grants access), create a capsule for it, then switch between two capsules — the git branch is captured and restored, and the restore sheet reports which items landed. The editor and browser halves need the free Rabta Connector extensions (Open VSX: open-vsx.org/extension/rabta-connect/rabta-vscode; Chrome Web Store: chromewebstore.google.com/detail/aaombpafbhjkoinppogieaclijddlebo). When a browser connects, the app shows an approve/deny banner — approving is expected.
>
> Source: github.com/salmuflahi/rabta (MIT). Privacy policy: rabta.build/privacy/.

---

## 5. After approval

- [ ] Add the Mac App Store badge to `website/setup/index.html` **only once the
      listing is live** — the site's launch-readiness tests fail closed on
      links that 404, and a Store link 404s until then.
- [ ] `docs/INSTALL.md`: a second install path beside the DMG, with the §1
      differences (own database, folder picker) stated plainly.
- [ ] `docs/RELEASE.md`: the channel table row flips to ✅ with the Store URL;
      the per-release checklist gains "bump `bundleVersion`, run
      `package-appstore.sh --upload`".
- [ ] Decide whether the Store build and the DMG stay at the same version, or
      the Store lags (it can — each channel is its own artifact).
