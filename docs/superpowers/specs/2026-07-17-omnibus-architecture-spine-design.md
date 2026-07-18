# OmniBus — Architecture Spine Design (Phases 1–4)

**Date:** 2026-07-17
**Status:** Draft for review
**Scope:** Tauri desktop shell, shared protocol, local event hub, fake connector, dev-console UI.
**Out of scope:** SQLite database, task capsules, real VS Code/Chrome connectors, Git operations, GitHub integration. Each of those gets its own spec later.

---

## Goal

Prove the core OmniBus architecture end-to-end before building any real integration:
a desktop app hosts a local hub; a connector process registers with it over WebSocket;
commands, responses, and events flow through a shared protocol; everything is visible
in a dev-console UI.

### Success criteria

1. Launch the OmniBus desktop app — the hub starts automatically.
2. Run the fake connector from a terminal — it appears in the UI as connected, with its capabilities listed.
3. From the UI, send it a command (e.g. `workspace.open`) — the fake connector responds and the response appears in the activity log.
4. The fake connector emits unsolicited events (e.g. simulated "file opened") — they appear in the log.
5. Kill the fake connector — the UI shows it disconnected within ~5 seconds.
6. Restart the fake connector — it reconnects and re-registers without restarting the app.
7. `pnpm test` and `cargo test` pass, including an integration test that runs the hub headless with a real WebSocket round-trip.

---

## Key decision: where the hub lives

**Chosen: inside the Tauri app's Rust process**, as a library crate (`crates/omnibus-hub`) started by the Tauri backend on launch.

Alternatives considered:

- **Separate daemon (`omnibusd`)** — connectors would survive UI restarts, but it doubles the process-management and packaging complexity for zero MVP benefit. Because the hub is a library crate behind a clean interface, extracting it into a daemon later is a packaging change, not a rewrite.
- **No WebSocket; Tauri IPC / stdio per connector** — rejected. The eventual VS Code and Chrome extensions can only realistically reach us over a local socket; building the spine on any other transport would invalidate the architecture we're trying to prove.

The hub binds **127.0.0.1 only**, on an OS-assigned port. It never listens on external interfaces.

## Key decision: protocol source of truth

The protocol is defined **twice, deliberately**: Zod schemas in TypeScript (`packages/protocol`) and serde structs in Rust (inside `crates/omnibus-hub/src/protocol.rs`). A shared set of JSON fixture files is tested against **both** implementations, so drift fails CI instead of failing at runtime. Code generation (e.g. from JSON Schema) is deferred — with ~10 message types it's more tooling than it saves.

---

## Repository layout

```
omnibus/
├── apps/
│   └── desktop/            # Tauri 2 app
│       ├── src/            # React + TS + Tailwind + Zustand (Vite)
│       └── src-tauri/      # Thin Tauri shell; depends on omnibus-hub
├── crates/
│   └── omnibus-hub/        # Hub as a Rust library (runs headless in tests)
├── connectors/
│   └── fake/               # Fake VS Code-like connector (TS, Node CLI)
├── packages/
│   ├── protocol/           # TS types + Zod schemas + shared JSON fixtures
│   └── connector-sdk/      # TS SDK: connect/register/handle/emit + reconnect
├── docs/
│   └── superpowers/specs/
├── pnpm-workspace.yaml
└── Cargo.toml              # workspace: crates/*, apps/desktop/src-tauri
```

Tooling: **pnpm workspaces** for TS, **cargo workspace** for Rust, **vitest** for TS tests. macOS is the only tested platform for now; nothing chosen here is macOS-specific.

---

## Protocol (`packages/protocol`)

Transport: JSON text frames over a local WebSocket. Every frame is an **envelope**:

```ts
{
  v: 1,                // protocol version
  id: string,          // uuid, unique per message
  kind: "hello" | "welcome" | "command" | "response" | "event" | "error" | "ping" | "pong",
  payload: { ... }     // kind-specific, validated by Zod / serde
}
```

### Lifecycle

1. **Discovery** — on startup the hub writes `hub.json` to the OmniBus app-data dir
   (`~/Library/Application Support/com.omnibus.dev/hub.json`): `{ port, secret }`, file mode 600.
   Connectors read it to find the port and authenticate. (Per-connector tokens replace the
   shared secret when persistence arrives in the database phase.)
2. **Registration** — connector sends `hello`: `{ name, kind: "fake" | "vscode" | "chrome", secret, protocolVersion, capabilities: string[] }`.
   Hub replies `welcome` (assigning a `connectorId` for this session) or `error` with a code
   (`version_mismatch`, `auth_failed`) and closes.
3. **Commands** — `command`: `{ target: connectorId, name, args }`. The hub routes it to the
   target connector; the connector replies `response`: `{ requestId, ok, result | error }`.
   The hub correlates by `requestId` and enforces a **10 s timeout**, synthesizing a timeout
   error response if the connector never answers.
4. **Events** — connector sends `event`: `{ name, data }`; hub stamps the source and fans out
   (in this slice: to the UI activity log only).
5. **Liveness** — hub pings every 5 s; two missed pongs → connection considered dead.

### Capability check (permission stub)

A command is only routed if its `name` is within the target connector's declared `capabilities`
(prefix match: capability `workspace` covers `workspace.open`). Otherwise the hub returns a
`capability_denied` error. This is deliberately minimal — a real permission model comes later,
but the enforcement point exists from day one.

---

## Hub (`crates/omnibus-hub`)

Tokio-based, structured as an actor: a single hub task owns all state (connector registry,
pending requests) and communicates via mpsc channels — no shared locks.

Responsibilities: accept WS connections, validate hellos, maintain the registry, route
commands/responses/events, enforce timeouts and capability checks, emit **hub events**
(connector connected/disconnected, message traffic) on a broadcast channel.

Public interface (used by both the Tauri shell and integration tests):

```rust
let hub = Hub::start(config).await?;   // binds, writes hub.json
hub.subscribe()                        // broadcast stream of HubEvent (for UI log)
hub.send_command(target, name, args)   // -> Result<Value, CommandError>
hub.connectors()                       // snapshot of registry
hub.shutdown().await
```

The Tauri layer is thin: it starts the hub, exposes `send_command`/`connectors` as Tauri
commands, and forwards the `HubEvent` stream to the frontend via Tauri events.

---

## Connector SDK (`packages/connector-sdk`) and fake connector

SDK surface (TS):

```ts
const c = await connect({ name: "fake-vscode", kind: "fake", capabilities: ["workspace", "editor"] });
c.onCommand("workspace.open", async (args) => ({ opened: args.path }));
c.emit("editor.fileOpened", { path: "src/main.ts" });
```

The SDK handles discovery (reads `hub.json`), the hello/welcome handshake, ping/pong,
Zod validation of inbound frames, and **reconnection with exponential backoff** (1 s → 30 s cap).

The **fake connector** (`connectors/fake`) is a Node CLI built on the SDK. It simulates a
VS Code-like tool: in-memory workspace state, handlers for `workspace.open`,
`workspace.state`, `editor.openFiles`, and a `--chatty` flag that emits random editor events
every few seconds (useful for exercising the UI log). It doubles as the reference example
for the SDK.

---

## Dev-console UI (`apps/desktop`)

Dark-mode-first, minimal, three panels:

1. **Connectors** — name, kind, status dot (connected/disconnected), capabilities, connected-since.
2. **Activity log** — chronological stream of commands, responses, events, and lifecycle
   messages; filterable by connector and kind; auto-scroll with pause.
3. **Command sender** — pick a connector, pick/type a command name, JSON args editor,
   send button, inline response (or error) display.

State: one Zustand store fed by Tauri events; Tauri commands for actions. No router,
no theming system, no settings screen — this UI is scaffolding that the real product
grows out of (the connectors panel survives; the rest becomes a debug view).

---

## Error handling

| Failure | Behavior |
|---|---|
| Malformed / non-validating frame | Hub replies `error` (`bad_message`); closes connection after 3 strikes |
| Protocol version mismatch | Rejected at `hello` with `version_mismatch`; connector SDK surfaces a clear "update required" error and does **not** retry |
| Wrong/missing secret | `auth_failed`, connection closed |
| Command timeout (10 s) | Hub synthesizes `{ ok: false, error: "timeout" }` response; connector's late reply is dropped and logged |
| Connector disconnect | Registry marks it offline, pending requests to it fail fast, UI updates; SDK reconnects with backoff |
| App/hub restart | New port + secret written to `hub.json`; SDK re-reads discovery file on each reconnect attempt |
| Port bind failure | Hub retries with a fresh OS-assigned port; fatal error dialog only if binding fails entirely |

Guiding rule (from the project principles): the hub never takes destructive action on
behalf of a connector, and a misbehaving connector can only ever hurt itself.

---

## Testing

- **Protocol fixtures** — shared JSON files in `packages/protocol/fixtures/`; vitest asserts
  Zod round-trips, a Rust test asserts serde round-trips on the same files. Drift breaks CI.
- **Hub unit tests** — registry, routing, timeout, capability checks against a mock connection.
- **Integration test (Rust)** — start `Hub::start` headless, connect a real WebSocket client,
  register, send command, receive response/events, disconnect. No Tauri involved.
- **SDK integration test (TS)** — run against the headless hub binary (`cargo run -p omnibus-hub --example headless`), covering handshake, command handling, and reconnect.
- UI is verified manually via the success criteria; no UI test framework in this slice.

---

## Build order

1. Scaffold monorepo (pnpm + cargo workspaces) and a running Tauri 2 shell window.
2. `packages/protocol` — schemas + fixtures + TS tests.
3. `crates/omnibus-hub` — protocol structs, actor, WS server, discovery file, fixture + unit + integration tests.
4. Embed hub in the Tauri shell; expose commands/events to the frontend.
5. `packages/connector-sdk` + `connectors/fake` + SDK integration test.
6. Dev-console UI panels.
7. Walk the success criteria end-to-end.
