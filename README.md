# OmniBus

OmniBus is a local-first desktop platform that acts as a shared "brain" for dev tools: applications connect to a local event hub once and can then communicate with each other through it, with work organized around tasks instead of apps. This repo currently contains the architecture foundation (phases 1–4): the Tauri shell, the hub, the shared protocol, a connector SDK, a fake connector, and a dev-console UI. See the [vision](./docs/vision.md) and the [architecture spec](./docs/superpowers/specs/2026-07-17-omnibus-architecture-foundation-design.md).

## Verify

```sh
pnpm install
pnpm test     # protocol fixtures, connector SDK (spawns the real hub), fake connector
cargo test    # protocol fixtures, hub handshake/commands/events integration tests
```

## Try it

1. `pnpm --filter desktop tauri dev` — the OmniBus window opens; the hub starts automatically and writes `~/Library/Application Support/com.omnibus.dev/hub.json`.
2. In another terminal: `pnpm --filter fake-connector start -- --chatty` — a simulated VS Code connector appears in the Connectors panel (green dot, `workspace, editor` capabilities) and starts emitting `editor.fileOpened` events into the activity log every few seconds.
3. In the command sender, pick `fake-vscode`, keep `workspace.open` with args `{"path": "/tmp/demo"}`, hit send — the response `{ "opened": "/tmp/demo" }` appears inline and in the log.
4. Ctrl-C the connector — its dot turns red within ~15 s (`connectorDisconnected` in the log). Restart it — it reconnects and re-registers without restarting the app.
5. Quit the app and relaunch it — recent activity reappears as dimmed `[hist]` entries and previously-seen connectors show as known-but-disconnected rows, restored from `~/Library/Application Support/com.omnibus.dev/omnibus.db`.

The hub also runs without Tauri: `cargo run -p omnibus-hub --example headless` (`OMNIBUS_DATA_DIR` overrides the discovery-file location; `--record` persists activity like the app does).
