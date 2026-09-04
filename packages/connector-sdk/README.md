# @omnibus/connector-sdk

TypeScript SDK for OmniBus connectors, covering hub discovery, handshake, and reconnect. See `connectors/fake` for the reference example; `pnpm test` builds the Rust headless hub first.

Discovery reads `hub.json` from wherever the desktop app wrote it: `~/Library/Application Support/com.omnibus.dev/` for the direct-download build, or the app's sandbox container for the Mac App Store build. When both exist, the most recently written one wins (`hubDiscoveryCandidates` / `pickHubFile`).
