# OmniBus — Architecture Foundation (Phases 1–4)

**Date:** 2026-07-17
**Status:** Draft for review (rev 2, after review feedback)
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

## Non-goals

This phase intentionally does **NOT** include:

- AI of any kind
- Task Capsules
- SQLite / any persistence
- Authentication or a permission model (see "Deferred: authentication" below)
- Capability *enforcement* (capabilities are declared and displayed, never checked)
- Cloud sync
- Plugin marketplace
- Real VS Code or Chrome connectors
- GitHub integration
- Docker
- Browser automation
- Multi-user support
- Cross-platform polish (macOS is the only tested platform)
- UI styling beyond bare functionality

If a task seems to require one of these, stop and update this spec first — do not
"helpfully" add it.

## Principles

When uncertain:

- Prefer simplicity. Prefer fewer abstractions. Avoid generic frameworks.
- Avoid premature optimization.
- Build the simplest implementation that satisfies the current phase — don't spend
  days perfecting abstractions.
- **Architect for one fake connector, not for five future connectors.**
- Write code another developer could understand in six months.
- Small working increments beat perfect architecture.
- Architecture follows the product, not vice versa.

## Coding standards

- Every public function has documentation (Rust doc comments / TSDoc).
- Every package and crate has a short README (what it is, how to run its tests).
- Every TODO explains WHY, not just what.
- Avoid comments that repeat the code; prefer descriptive names.
- Never leave dead code.

## Definition of Done

A phase is complete when:

- Builds without warnings (`cargo build`, `pnpm build`).
- All tests pass (`cargo test`, `pnpm test`).
- No unexplained TODOs remain.
- READMEs and this spec are updated to match reality.
- The success criteria above are walked through end-to-end (recording a short demo
  is encouraged but optional).

## Ownership

- **The Hub owns:** connection acceptance, the connector registry, command routing,
  request/response correlation, timeouts, liveness.
- **A Connector owns:** tool-specific behavior only (what `workspace.open` *does*).
- **The SDK owns:** discovery, networking, the handshake, reconnection, frame validation.

Anything that two of these want to own goes to the Hub. This avoids fat SDKs and
smart connectors.

---

## Key decision: where the hub lives

**Chosen: inside the Tauri app's Rust process**, as a library crate (`crates/omnibus-hub`) started by the Tauri backend on launch.

Alternatives considered:

- **Separate daemon (`omnibusd`)** — connectors would survive UI restarts, but it doubles the process-management and packaging complexity for zero MVP benefit. Because the hub is a library crate behind a clean interface, extracting it into a daemon later is a packaging change, not a rewrite.
- **No WebSocket; Tauri IPC / stdio per connector** — rejected. The eventual VS Code and Chrome extensions can only realistically reach us over a local socket; building the foundation on any other transport would invalidate the architecture we're trying to prove.

The hub binds **127.0.0.1 only**, on an OS-assigned port. It never listens on external interfaces.

## Key decision: protocol source of truth

The protocol is defined **twice, deliberately**: Zod schemas in TypeScript (`packages/protocol`) and serde structs in Rust (inside `crates/omnibus-hub/src/protocol.rs`). A shared set of JSON fixture files is tested against **both** implementations, so drift fails CI instead of failing at runtime. The fixtures are what make the double definition safe, which is why they stay in scope despite the "simplest implementation" principle. Code generation (e.g. from JSON Schema) is deferred — with ~10 message types it's more tooling than it saves.

## Deferred: authentication

There is **no authentication in this phase**. `hub.json` contains only the port, the
`hello` message carries no secret, and there is no `auth_failed` error.

This is a deliberate deferral, not an oversight. One caveat to record now: **any
webpage in any browser can open a WebSocket to `127.0.0.1:<port>`**, so an
unauthenticated hub is reachable by arbitrary websites. That is harmless while the
only clients are our own local processes, but authentication (a secret in `hub.json`,
or per-connector tokens once the database exists) **must land before the Chrome
connector phase**. Until then, the hub rejects any connection that carries a browser
`Origin` header — one `if`, not an auth system.

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
   (`~/Library/Application Support/com.omnibus.dev/hub.json`): `{ port }`.
   Connectors read it to find the port.
2. **Registration** — connector sends `hello`: `{ name, kind: "fake" | "vscode" | "chrome", protocolVersion, capabilities: string[] }`.
   Hub replies `welcome` (assigning a `connectorId` for this session) or `error` with a code
   (`version_mismatch`) and closes. `capabilities` is informational in this phase: the hub
   stores it and the UI displays it, but nothing enforces it.
3. **Commands** — `command`: `{ target: connectorId, name, args }`. The hub routes it to the
   target connector; the connector replies `response`: `{ requestId, ok, result | error }`.
   The hub correlates by `requestId` and enforces a **10 s timeout** (a dead connector must
   not hang the UI), synthesizing a timeout error response if the connector never answers.
4. **Events** — connector sends `event`: `{ name, data }`; hub stamps the source and fans out
   (in this slice: to the UI activity log only).
5. **Liveness** — hub pings every 5 s; two missed pongs → connection considered dead.

---

## Hub (`crates/omnibus-hub`)

Tokio-based. Responsibilities: accept WS connections, validate hellos, maintain the
registry, route commands/responses/events, enforce timeouts, emit **hub events**
(connector connected/disconnected, message traffic) on a broadcast channel.

The **public interface below is the contract; the internal concurrency model is the
implementer's choice.** A single actor task owning all state with mpsc channels is a
reasonable starting point, but if a `Mutex`/`RwLock` around a registry map turns out
simpler, use that — this spec mandates behavior, not concurrency style.

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
Zod validation of inbound frames, and **reconnection with exponential backoff** (1 s → 30 s
cap — required by success criterion 6).

The **fake connector** (`connectors/fake`) is a Node CLI built on the SDK. It simulates a
VS Code-like tool: in-memory workspace state, handlers for `workspace.open`,
`workspace.state`, `editor.openFiles`, and a `--chatty` flag that emits random editor events
every few seconds (useful for exercising the UI log). It doubles as the reference example
for the SDK.

---

## Dev-console UI (`apps/desktop`)

**This UI exists only to debug the hub. Literally gray boxes.** Dark-mode-first because
that's the project default, but zero effort on visual design — no animations, no polish,
no component library. Three panels:

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
| Browser `Origin` header on connect | Connection rejected (see "Deferred: authentication") |
| Command timeout (10 s) | Hub synthesizes `{ ok: false, error: "timeout" }` response; connector's late reply is dropped and logged |
| Connector disconnect | Registry marks it offline, pending requests to it fail fast, UI updates; SDK reconnects with backoff |
| App/hub restart | New port written to `hub.json`; SDK re-reads discovery file on each reconnect attempt |
| Port bind failure | Hub retries with a fresh OS-assigned port; fatal error dialog only if binding fails entirely |

Guiding rule (from the project principles): the hub never takes destructive action on
behalf of a connector, and a misbehaving connector can only ever hurt itself.

---

## Testing

- **Protocol fixtures** — shared JSON files in `packages/protocol/fixtures/`; vitest asserts
  Zod round-trips, a Rust test asserts serde round-trips on the same files. Drift breaks CI.
- **Hub unit tests** — registry, routing, timeout against a mock connection.
- **Integration test (Rust)** — start `Hub::start` headless, connect a real WebSocket client,
  register, send command, receive response/events, disconnect. No Tauri involved.
- **SDK integration test (TS)** — run against the headless hub binary (`cargo run -p omnibus-hub --example headless`), covering handshake, command handling, and reconnect.
- UI is verified manually via the success criteria; no UI test framework in this slice.

---

## Build order

1. Scaffold monorepo (pnpm + cargo workspaces) and a running Tauri 2 shell window.
2. `packages/protocol` — schemas + fixtures + TS tests.
3. `crates/omnibus-hub` — protocol structs, WS server, discovery file, fixture + unit + integration tests.
4. Embed hub in the Tauri shell; expose commands/events to the frontend.
5. `packages/connector-sdk` + `connectors/fake` + SDK integration test.
6. Dev-console UI panels.
7. Walk the success criteria end-to-end.
