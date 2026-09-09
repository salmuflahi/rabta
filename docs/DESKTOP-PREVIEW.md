# Rabta Lens desktop preview

This is the actual Tauri desktop app, built from the commit recorded in
`COMMIT.txt`. It runs on Apple Silicon Macs. The Lens frontend uses real app
state; this is not the marketing illustration.

The preview is named **Rabta Preview** and uses its own
`com.omnibus.dev.preview` data directory. It starts with an empty workspace;
the installed Rabta app's projects, capsules and pairings are not imported or
modified. Quit the installed app before testing the preview, then add a
project and pair the connectors you want to use.

## Open the preview

1. Download the `Rabta-Lens-Preview-macOS-arm64` artifact from the successful
   **Desktop preview** run on the pull request's Checks page.
2. Extract the artifact, then extract `Rabta-Lens-Preview-macOS-arm64.zip`.
3. Move **Rabta Preview.app** to Applications and open it.

This review build has an ad-hoc signature, not an Apple Developer ID signature
or notarization ticket. macOS may require approval in System Settings →
Privacy & Security after the first attempted launch. This is not a signed
public release or an update to the existing download on the website.

## Build it on a Mac

From the repository root, with Node 24, the repository's pinned pnpm version,
Rust and Xcode Command Line Tools installed:

```sh
pnpm install --frozen-lockfile
rustup target add aarch64-apple-darwin
pnpm --dir apps/desktop tauri build --target aarch64-apple-darwin --bundles app --config src-tauri/tauri.preview.conf.json -- --locked
```

The app is created at
`target/aarch64-apple-darwin/release/bundle/macos/Rabta Preview.app`.

The preview workflow checks frontend tests, TypeScript, the production frontend,
native desktop tests and the app signature before uploading the archive. It
has read-only repository permission and does not publish a release. Native
visual review and a real Capture → switch → Resume check still need a person
using the app. The signed public release follows [RELEASE.md](RELEASE.md).
