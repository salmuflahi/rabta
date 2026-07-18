# Architecture Foundation (Phases 1–4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the OmniBus architecture end-to-end: a Tauri desktop app hosts a local WebSocket hub; a fake connector registers over a shared protocol; commands, responses, and events flow through the hub and appear in a dev-console UI.

**Architecture:** The hub is a Rust library crate (`omnibus-hub`) embedded in the Tauri process, testable headless. The protocol is defined twice on purpose (Zod in TS, serde in Rust) and kept in sync by shared JSON fixtures tested on both sides. A TS connector SDK owns discovery/handshake/reconnect; the fake connector and the dev-console UI sit on top.

**Tech Stack:** Tauri 2, React 18, TypeScript, Tailwind 4, Zustand 5, Vite 6, vitest, pnpm workspaces · Rust, tokio, tokio-tungstenite, serde, cargo workspace · `ws` + zod on the Node side.

**Spec:** `docs/superpowers/specs/2026-07-17-omnibus-architecture-foundation-design.md` — read it before starting. Its Non-goals, Principles, Coding standards, and Definition of Done sections apply to every task below.

## Global Constraints

- Hub binds **127.0.0.1 only**, OS-assigned port. Never any external interface.
- **No authentication** in this phase; the hub **rejects any WS connection carrying an `Origin` header** (browsers) — one `if`, not an auth system.
- Capabilities are **declared and displayed, never enforced**.
- Protocol version is `1`; envelope shape `{ v, id, kind, payload }` exactly as in the spec.
- Command timeout **10 s**, ping every **5 s**, two missed pongs → dead (both durations configurable in `HubConfig` so tests can shrink them).
- Discovery file: `<app-data-dir>/hub.json` containing `{ "port": <u16> }` only. App identifier: `com.omnibus.dev`.
- UI is gray boxes; dark background; no component library, no animations, no router.
- Every package/crate gets a short README; public functions get doc comments; no dead code; builds must be warning-free.
- macOS is the only tested platform.

---

### Task 1: Monorepo scaffold + Tauri shell window

**Files:**
- Create: `pnpm-workspace.yaml`, `package.json`, `Cargo.toml`, `.gitignore`
- Create: `apps/desktop/{package.json, vite.config.ts, tsconfig.json, index.html, src/main.tsx, src/App.tsx, src/index.css}`
- Create: `apps/desktop/src-tauri/{Cargo.toml, build.rs, tauri.conf.json, capabilities/default.json, src/main.rs, src/lib.rs}`
- Create: `README.md` (root)

**Interfaces:**
- Produces: a `pnpm -r --if-present test` root script and a cargo workspace later tasks add members to; `omnibus_desktop_lib::run()` as the Tauri entry point Task 7 modifies.

- [ ] **Step 1: Root files**

`pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "connectors/*"
```

`package.json`:
```json
{
  "name": "omnibus",
  "private": true,
  "scripts": {
    "test": "pnpm -r --if-present test",
    "build": "pnpm -r --if-present build"
  }
}
```

`Cargo.toml`:
```toml
[workspace]
resolver = "2"
members = ["apps/desktop/src-tauri"]
```

`.gitignore`:
```
node_modules/
dist/
target/
```

Root `README.md`: one paragraph — what OmniBus is, link to the spec, `pnpm install && pnpm test && cargo test` to verify, `pnpm --filter desktop tauri dev` to run.

- [ ] **Step 2: Frontend scaffold**

`apps/desktop/package.json`:
```json
{
  "name": "desktop",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "tauri": "tauri"
  },
  "dependencies": {
    "@tauri-apps/api": "^2.1.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@tauri-apps/cli": "^2.1.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0"
  }
}
```

`apps/desktop/vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: { port: 5173, strictPort: true },
});
```

`apps/desktop/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

`apps/desktop/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>OmniBus</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`apps/desktop/src/index.css`:
```css
@import "tailwindcss";
```

`apps/desktop/src/main.tsx`:
```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

`apps/desktop/src/App.tsx` (placeholder, replaced in Task 10):
```tsx
export default function App() {
  return <div className="h-screen bg-neutral-900 text-neutral-200 p-4 font-mono">OmniBus dev console</div>;
}
```

- [ ] **Step 3: Tauri shell**

`apps/desktop/src-tauri/Cargo.toml`:
```toml
[package]
name = "omnibus-desktop"
version = "0.1.0"
edition = "2021"

[lib]
name = "omnibus_desktop_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

`apps/desktop/src-tauri/build.rs`:
```rust
fn main() {
    tauri_build::build()
}
```

`apps/desktop/src-tauri/tauri.conf.json`:
```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "OmniBus",
  "version": "0.1.0",
  "identifier": "com.omnibus.dev",
  "build": {
    "beforeDevCommand": "pnpm dev",
    "devUrl": "http://localhost:5173",
    "beforeBuildCommand": "pnpm build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [{ "title": "OmniBus", "width": 1100, "height": 700 }],
    "security": { "csp": null }
  }
}
```

`apps/desktop/src-tauri/capabilities/default.json`:
```json
{ "identifier": "default", "windows": ["main"], "permissions": ["core:default"] }
```

`apps/desktop/src-tauri/src/main.rs`:
```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    omnibus_desktop_lib::run()
}
```

`apps/desktop/src-tauri/src/lib.rs`:
```rust
/// Builds and runs the OmniBus Tauri application.
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running OmniBus");
}
```

- [ ] **Step 4: Verify**

Run: `pnpm install` — succeeds.
Run: `cargo check` — succeeds, no warnings.
Run: `pnpm --filter desktop tauri dev` — a dark window titled "OmniBus" opens showing "OmniBus dev console". Close it. (Success criterion 1 groundwork.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: scaffold pnpm+cargo monorepo with Tauri 2 shell"
```

---

### Task 2: Protocol package (Zod schemas + fixtures)

**Files:**
- Create: `packages/protocol/{package.json, README.md, src/index.ts}`
- Create: `packages/protocol/fixtures/{hello,welcome,command,response,event,error,ping,pong}.json`
- Test: `packages/protocol/test/fixtures.test.ts`

**Interfaces:**
- Produces: `Envelope` (Zod discriminated union + inferred type), `PROTOCOL_VERSION = 1`, exported from `@omnibus/protocol`. The fixture files are also consumed by the Rust test in Task 3 — their paths are contract.

- [ ] **Step 1: Package + failing test**

`packages/protocol/package.json`:
```json
{
  "name": "@omnibus/protocol",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": { "test": "vitest run" },
  "dependencies": { "zod": "^3.23.8" },
  "devDependencies": { "typescript": "^5.6.0", "vitest": "^2.1.0" }
}
```
(No build step: consumers import the TS source; vite/vitest/tsx all handle it.)

`packages/protocol/README.md`: two sentences — single source of the wire protocol for TS; fixtures are shared with the Rust side, run `pnpm test`.

Fixtures — one file per kind, exact content:

`fixtures/hello.json`
```json
{ "v": 1, "id": "11111111-1111-1111-1111-111111111111", "kind": "hello", "payload": { "name": "fake-vscode", "kind": "fake", "protocolVersion": 1, "capabilities": ["workspace", "editor"] } }
```
`fixtures/welcome.json`
```json
{ "v": 1, "id": "22222222-2222-2222-2222-222222222222", "kind": "welcome", "payload": { "connectorId": "c-1" } }
```
`fixtures/command.json`
```json
{ "v": 1, "id": "33333333-3333-3333-3333-333333333333", "kind": "command", "payload": { "target": "c-1", "name": "workspace.open", "args": { "path": "/tmp/demo" } } }
```
`fixtures/response.json`
```json
{ "v": 1, "id": "44444444-4444-4444-4444-444444444444", "kind": "response", "payload": { "requestId": "33333333-3333-3333-3333-333333333333", "ok": true, "result": { "opened": "/tmp/demo" } } }
```
`fixtures/event.json`
```json
{ "v": 1, "id": "55555555-5555-5555-5555-555555555555", "kind": "event", "payload": { "name": "editor.fileOpened", "data": { "path": "src/main.ts" } } }
```
`fixtures/error.json`
```json
{ "v": 1, "id": "66666666-6666-6666-6666-666666666666", "kind": "error", "payload": { "code": "version_mismatch", "message": "unsupported protocol version" } }
```
`fixtures/ping.json`
```json
{ "v": 1, "id": "77777777-7777-7777-7777-777777777777", "kind": "ping", "payload": {} }
```
`fixtures/pong.json`
```json
{ "v": 1, "id": "88888888-8888-8888-8888-888888888888", "kind": "pong", "payload": {} }
```

`packages/protocol/test/fixtures.test.ts`:
```ts
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Envelope } from "../src/index";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

describe("protocol fixtures", () => {
  for (const file of readdirSync(dir)) {
    it(`round-trips ${file}`, () => {
      const raw = JSON.parse(readFileSync(join(dir, file), "utf8"));
      expect(Envelope.parse(raw)).toEqual(raw);
    });
  }

  it("rejects an unknown kind", () => {
    expect(() => Envelope.parse({ v: 1, id: "x", kind: "nope", payload: {} })).toThrow();
  });

  it("rejects a hello with a wrong-typed capability list", () => {
    const raw = JSON.parse(readFileSync(join(dir, "hello.json"), "utf8"));
    raw.payload.capabilities = "workspace";
    expect(() => Envelope.parse(raw)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm install && pnpm --filter @omnibus/protocol test`
Expected: FAIL — cannot resolve `../src/index`.

- [ ] **Step 3: Implement schemas**

`packages/protocol/src/index.ts`:
```ts
import { z } from "zod";

/** Wire protocol version. Bump only with a spec change. */
export const PROTOCOL_VERSION = 1;

export const ConnectorKind = z.enum(["fake", "vscode", "chrome"]);
export type ConnectorKind = z.infer<typeof ConnectorKind>;

export const HelloPayload = z.object({
  name: z.string().min(1),
  kind: ConnectorKind,
  protocolVersion: z.number().int(),
  capabilities: z.array(z.string()),
});

export const WelcomePayload = z.object({ connectorId: z.string().min(1) });

export const CommandPayload = z.object({
  target: z.string().min(1),
  name: z.string().min(1),
  args: z.unknown(),
});

export const ResponsePayload = z.object({
  requestId: z.string().min(1),
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: z.string().optional(),
});

export const EventPayload = z.object({ name: z.string().min(1), data: z.unknown() });

export const ErrorPayload = z.object({ code: z.string().min(1), message: z.string() });

export const EmptyPayload = z.object({});

const base = { v: z.literal(PROTOCOL_VERSION), id: z.string().min(1) };

/** Every frame on the wire is one of these envelopes. */
export const Envelope = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("hello"), payload: HelloPayload }),
  z.object({ ...base, kind: z.literal("welcome"), payload: WelcomePayload }),
  z.object({ ...base, kind: z.literal("command"), payload: CommandPayload }),
  z.object({ ...base, kind: z.literal("response"), payload: ResponsePayload }),
  z.object({ ...base, kind: z.literal("event"), payload: EventPayload }),
  z.object({ ...base, kind: z.literal("error"), payload: ErrorPayload }),
  z.object({ ...base, kind: z.literal("ping"), payload: EmptyPayload }),
  z.object({ ...base, kind: z.literal("pong"), payload: EmptyPayload }),
]);
export type Envelope = z.infer<typeof Envelope>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @omnibus/protocol test`
Expected: PASS — 10 tests.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: protocol package with Zod schemas and shared fixtures"
```

---

### Task 3: Hub crate — serde protocol structs against the same fixtures

**Files:**
- Create: `crates/omnibus-hub/{Cargo.toml, README.md, src/lib.rs, src/protocol.rs}`
- Modify: `Cargo.toml` (root — add member)
- Test: `crates/omnibus-hub/tests/fixtures.rs`

**Interfaces:**
- Consumes: `packages/protocol/fixtures/*.json` from Task 2.
- Produces: `omnibus_hub::protocol::{Envelope, Message, Hello, Welcome, Command, Response, Event, ErrorMsg, ConnectorKind, PROTOCOL_VERSION}` used by Tasks 4–6.

- [ ] **Step 1: Crate scaffold + failing test**

Root `Cargo.toml` members become:
```toml
members = ["crates/omnibus-hub", "apps/desktop/src-tauri"]
```

`crates/omnibus-hub/Cargo.toml`:
```toml
[package]
name = "omnibus-hub"
version = "0.1.0"
edition = "2021"

[dependencies]
tokio = { version = "1", features = ["full"] }
tokio-tungstenite = "0.24"
futures-util = "0.3"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
uuid = { version = "1", features = ["v4"] }
thiserror = "2"

[dev-dependencies]
tempfile = "3"
dirs = "5"
```

`crates/omnibus-hub/README.md`: what the crate is (the OmniBus local event hub, embeddable + headless), `cargo test`, `cargo run -p omnibus-hub --example headless`.

`crates/omnibus-hub/src/lib.rs`:
```rust
//! OmniBus local event hub: accepts connector WebSocket connections,
//! routes commands/responses/events, and reports activity as `HubEvent`s.
pub mod protocol;
```

`crates/omnibus-hub/tests/fixtures.rs`:
```rust
use omnibus_hub::protocol::Envelope;
use serde_json::Value;

/// Every shared fixture must deserialize into our types and serialize back
/// to the identical JSON — this is what keeps the TS and Rust protocol
/// definitions from drifting.
#[test]
fn fixtures_round_trip() {
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../../packages/protocol/fixtures");
    let mut checked = 0;
    for entry in std::fs::read_dir(dir).unwrap() {
        let path = entry.unwrap().path();
        let raw: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        let parsed: Envelope = serde_json::from_value(raw.clone())
            .unwrap_or_else(|e| panic!("{path:?} failed to deserialize: {e}"));
        let back = serde_json::to_value(&parsed).unwrap();
        assert_eq!(back, raw, "{path:?} did not round-trip");
        checked += 1;
    }
    assert_eq!(checked, 8, "expected all 8 fixtures");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p omnibus-hub`
Expected: FAIL — `protocol` module has no `Envelope` (compile error).

- [ ] **Step 3: Implement `src/protocol.rs`**

```rust
//! serde mirror of the Zod schemas in `packages/protocol`.
//! Field names on the wire are camelCase; keep both sides in lockstep —
//! the shared fixtures enforce it.
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Wire protocol version. Bump only with a spec change.
pub const PROTOCOL_VERSION: u8 = 1;

/// Every frame on the wire.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Envelope {
    pub v: u8,
    pub id: String,
    #[serde(flatten)]
    pub msg: Message,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(tag = "kind", content = "payload", rename_all = "lowercase")]
pub enum Message {
    Hello(Hello),
    Welcome(Welcome),
    Command(Command),
    Response(Response),
    Event(Event),
    Error(ErrorMsg),
    Ping(Value),
    Pong(Value),
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ConnectorKind {
    Fake,
    Vscode,
    Chrome,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Hello {
    pub name: String,
    pub kind: ConnectorKind,
    #[serde(rename = "protocolVersion")]
    pub protocol_version: u8,
    pub capabilities: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Welcome {
    #[serde(rename = "connectorId")]
    pub connector_id: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Command {
    pub target: String,
    pub name: String,
    pub args: Value,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Response {
    #[serde(rename = "requestId")]
    pub request_id: String,
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Event {
    pub name: String,
    pub data: Value,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct ErrorMsg {
    pub code: String,
    pub message: String,
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p omnibus-hub`
Expected: PASS — `fixtures_round_trip` green, `checked == 8`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: hub crate with serde protocol mirrored against shared fixtures"
```

---

### Task 4: Hub core — start, discovery file, handshake, registry

**Files:**
- Create: `crates/omnibus-hub/src/hub.rs`
- Modify: `crates/omnibus-hub/src/lib.rs`
- Test: `crates/omnibus-hub/tests/handshake.rs`

**Interfaces:**
- Produces (contract for Tasks 5–8):
  - `HubConfig { data_dir: PathBuf, command_timeout: Duration, ping_interval: Duration }` with `HubConfig::new(data_dir)` defaulting to 10 s / 5 s.
  - `Hub::start(HubConfig) -> io::Result<Hub>`, `hub.port() -> u16`, `hub.connectors() -> Vec<ConnectorInfo>` (async), `hub.subscribe() -> broadcast::Receiver<HubEvent>`, `hub.shutdown()`.
  - `ConnectorInfo { id, name, kind: ConnectorKind, capabilities }` (Serialize, camelCase).
  - `HubEvent` enum (Serialize, `type`-tagged, camelCase): `ConnectorConnected { connector }`, `ConnectorDisconnected { connector_id }`, `CommandSent { connector_id, request_id, name, args }`, `ResponseReceived { connector_id, request_id, ok, result }`, `EventReceived { connector_id, name, data }`.

- [ ] **Step 1: Write the failing tests**

`crates/omnibus-hub/tests/handshake.rs`:
```rust
use futures_util::{SinkExt, StreamExt};
use omnibus_hub::{Hub, HubConfig};
use serde_json::{json, Value};

async fn start_hub() -> (Hub, tempfile::TempDir) {
    let dir = tempfile::tempdir().unwrap();
    let hub = Hub::start(HubConfig::new(dir.path().to_path_buf())).await.unwrap();
    (hub, dir)
}

fn hello(name: &str, version: u8) -> String {
    json!({"v": 1, "id": "t-hello", "kind": "hello", "payload": {
        "name": name, "kind": "fake", "protocolVersion": version, "capabilities": ["workspace"]
    }})
    .to_string()
}

#[tokio::test]
async fn writes_discovery_file_and_registers_connector() {
    let (hub, dir) = start_hub().await;
    let disco: Value =
        serde_json::from_str(&std::fs::read_to_string(dir.path().join("hub.json")).unwrap()).unwrap();
    assert_eq!(disco, json!({ "port": hub.port() }));

    let (mut ws, _) =
        tokio_tungstenite::connect_async(format!("ws://127.0.0.1:{}", hub.port())).await.unwrap();
    ws.send(hello("test-conn", 1).into()).await.unwrap();
    let reply: Value =
        serde_json::from_str(ws.next().await.unwrap().unwrap().to_text().unwrap()).unwrap();
    assert_eq!(reply["kind"], "welcome");
    assert!(reply["payload"]["connectorId"].is_string());

    let conns = hub.connectors().await;
    assert_eq!(conns.len(), 1);
    assert_eq!(conns[0].name, "test-conn");
    assert_eq!(conns[0].capabilities, vec!["workspace"]);
}

#[tokio::test]
async fn rejects_protocol_version_mismatch() {
    let (hub, _dir) = start_hub().await;
    let (mut ws, _) =
        tokio_tungstenite::connect_async(format!("ws://127.0.0.1:{}", hub.port())).await.unwrap();
    ws.send(hello("old-conn", 99).into()).await.unwrap();
    let reply: Value =
        serde_json::from_str(ws.next().await.unwrap().unwrap().to_text().unwrap()).unwrap();
    assert_eq!(reply["kind"], "error");
    assert_eq!(reply["payload"]["code"], "version_mismatch");
    assert!(hub.connectors().await.is_empty());
}

#[tokio::test]
async fn rejects_browser_origin_header() {
    use tokio_tungstenite::tungstenite::{client::IntoClientRequest, http::HeaderValue};
    let (hub, _dir) = start_hub().await;
    let mut req = format!("ws://127.0.0.1:{}", hub.port()).into_client_request().unwrap();
    req.headers_mut().insert("Origin", HeaderValue::from_static("https://evil.example"));
    assert!(tokio_tungstenite::connect_async(req).await.is_err());
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p omnibus-hub --test handshake`
Expected: compile error — `Hub`/`HubConfig` do not exist.

- [ ] **Step 3: Implement hub core**

`crates/omnibus-hub/src/lib.rs`:
```rust
//! OmniBus local event hub: accepts connector WebSocket connections,
//! routes commands/responses/events, and reports activity as `HubEvent`s.
pub mod hub;
pub mod protocol;

pub use hub::{CommandError, ConnectorInfo, Hub, HubConfig, HubEvent};
```

`crates/omnibus-hub/src/hub.rs` — full implementation (Task 5 and 6 extend the marked spots):
```rust
//! The hub proper. One tokio task per connection owns both socket halves;
//! shared state (registry + pending requests) lives behind a single Mutex.
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use futures_util::stream::{SplitSink, SplitStream};
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use serde_json::{json, Value};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{broadcast, mpsc, oneshot, Mutex};
use tokio_tungstenite::tungstenite::handshake::server::{ErrorResponse, Request, Response as HsResponse};
use tokio_tungstenite::tungstenite::Message as WsMessage;
use tokio_tungstenite::WebSocketStream;
use uuid::Uuid;

use crate::protocol::*;

/// Hub configuration. Timeouts are configurable so tests can shrink them;
/// production callers use `HubConfig::new` defaults (spec: 10 s / 5 s).
#[derive(Clone)]
pub struct HubConfig {
    pub data_dir: PathBuf,
    pub command_timeout: Duration,
    pub ping_interval: Duration,
}

impl HubConfig {
    pub fn new(data_dir: PathBuf) -> Self {
        Self {
            data_dir,
            command_timeout: Duration::from_secs(10),
            ping_interval: Duration::from_secs(5),
        }
    }
}

/// A connector as shown to the UI.
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConnectorInfo {
    pub id: String,
    pub name: String,
    pub kind: ConnectorKind,
    pub capabilities: Vec<String>,
}

/// Everything observable about hub activity, broadcast to subscribers
/// (the UI activity log, the headless example, tests).
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum HubEvent {
    ConnectorConnected { connector: ConnectorInfo },
    ConnectorDisconnected { connector_id: String },
    CommandSent { connector_id: String, request_id: String, name: String, args: Value },
    ResponseReceived { connector_id: String, request_id: String, ok: bool, result: Value },
    EventReceived { connector_id: String, name: String, data: Value },
}

#[derive(Debug, thiserror::Error)]
pub enum CommandError {
    #[error("unknown connector: {0}")]
    UnknownConnector(String),
    #[error("timeout")]
    Timeout,
    #[error("connector disconnected")]
    Disconnected,
    #[error("connector error: {0}")]
    Connector(String),
}

struct Connected {
    info: ConnectorInfo,
    tx: mpsc::UnboundedSender<Envelope>,
}

type Waiter = oneshot::Sender<Result<Value, CommandError>>;

#[derive(Default)]
struct State {
    connectors: HashMap<String, Connected>,
    /// requestId -> (connectorId it was sent to, waiter)
    pending: HashMap<String, (String, Waiter)>,
}

type Shared = Arc<Mutex<State>>;

pub struct Hub {
    port: u16,
    cfg: HubConfig,
    state: Shared,
    events: broadcast::Sender<HubEvent>,
    accept_task: tokio::task::JoinHandle<()>,
}

impl Hub {
    /// Binds 127.0.0.1 on an OS-assigned port, writes `hub.json`, starts accepting.
    pub async fn start(cfg: HubConfig) -> std::io::Result<Hub> {
        let listener = TcpListener::bind("127.0.0.1:0").await?;
        let port = listener.local_addr()?.port();
        std::fs::create_dir_all(&cfg.data_dir)?;
        std::fs::write(cfg.data_dir.join("hub.json"), json!({ "port": port }).to_string())?;
        let (events, _) = broadcast::channel(256);
        let state: Shared = Default::default();
        let accept_task =
            tokio::spawn(accept_loop(listener, state.clone(), events.clone(), cfg.clone()));
        Ok(Hub { port, cfg, state, events, accept_task })
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    /// Live stream of hub activity for the UI log.
    pub fn subscribe(&self) -> broadcast::Receiver<HubEvent> {
        self.events.subscribe()
    }

    /// Snapshot of currently connected connectors.
    pub async fn connectors(&self) -> Vec<ConnectorInfo> {
        self.state.lock().await.connectors.values().map(|c| c.info.clone()).collect()
    }

    /// Routes a command to `target` and awaits its response (Task 5).
    pub async fn send_command(
        &self,
        target: &str,
        name: &str,
        args: Value,
    ) -> Result<Value, CommandError> {
        let request_id = Uuid::new_v4().to_string();
        let (done_tx, done_rx) = oneshot::channel();
        {
            let mut st = self.state.lock().await;
            let conn = st
                .connectors
                .get(target)
                .ok_or_else(|| CommandError::UnknownConnector(target.to_string()))?;
            let env = Envelope {
                v: PROTOCOL_VERSION,
                id: request_id.clone(),
                msg: Message::Command(Command {
                    target: target.to_string(),
                    name: name.to_string(),
                    args: args.clone(),
                }),
            };
            if conn.tx.send(env).is_err() {
                return Err(CommandError::Disconnected);
            }
            st.pending.insert(request_id.clone(), (target.to_string(), done_tx));
        }
        let _ = self.events.send(HubEvent::CommandSent {
            connector_id: target.to_string(),
            request_id: request_id.clone(),
            name: name.to_string(),
            args,
        });
        match tokio::time::timeout(self.cfg.command_timeout, done_rx).await {
            Ok(Ok(outcome)) => outcome,
            Ok(Err(_)) => Err(CommandError::Disconnected),
            Err(_) => {
                self.state.lock().await.pending.remove(&request_id);
                let _ = self.events.send(HubEvent::ResponseReceived {
                    connector_id: target.to_string(),
                    request_id,
                    ok: false,
                    result: json!("timeout"),
                });
                Err(CommandError::Timeout)
            }
        }
    }

    /// Stops accepting connections. Existing connection tasks end when their
    /// sockets close; fine for app shutdown.
    pub fn shutdown(&self) {
        self.accept_task.abort();
    }
}

async fn accept_loop(
    listener: TcpListener,
    state: Shared,
    events: broadcast::Sender<HubEvent>,
    cfg: HubConfig,
) {
    while let Ok((stream, _)) = listener.accept().await {
        tokio::spawn(handle_connection(stream, state.clone(), events.clone(), cfg.clone()));
    }
}

/// Rejects browser connections until authentication exists (see spec,
/// "Deferred: authentication").
fn reject_origin(req: &Request, resp: HsResponse) -> Result<HsResponse, ErrorResponse> {
    if req.headers().contains_key("origin") {
        let mut denied = ErrorResponse::new(Some("browser connections not allowed".to_string()));
        *denied.status_mut() = tokio_tungstenite::tungstenite::http::StatusCode::FORBIDDEN;
        Err(denied)
    } else {
        Ok(resp)
    }
}

type Sink = SplitSink<WebSocketStream<TcpStream>, WsMessage>;
type Source = SplitStream<WebSocketStream<TcpStream>>;

async fn send_env(sink: &mut Sink, env: &Envelope) -> Result<(), ()> {
    let txt = serde_json::to_string(env).map_err(|_| ())?;
    sink.send(WsMessage::Text(txt.into())).await.map_err(|_| ())
}

fn envelope(msg: Message) -> Envelope {
    Envelope { v: PROTOCOL_VERSION, id: Uuid::new_v4().to_string(), msg }
}

async fn handle_connection(
    stream: TcpStream,
    state: Shared,
    events: broadcast::Sender<HubEvent>,
    cfg: HubConfig,
) {
    let Ok(ws) = tokio_tungstenite::accept_hdr_async(stream, reject_origin).await else { return };
    let (mut sink, mut source) = ws.split();

    // Handshake: first frame must be a valid hello within 5 s.
    let hello = match tokio::time::timeout(Duration::from_secs(5), source.next()).await {
        Ok(Some(Ok(WsMessage::Text(txt)))) => {
            match serde_json::from_str::<Envelope>(txt.as_ref()) {
                Ok(Envelope { msg: Message::Hello(h), .. }) => h,
                _ => {
                    let _ = send_env(
                        &mut sink,
                        &envelope(Message::Error(ErrorMsg {
                            code: "bad_message".into(),
                            message: "expected a valid hello".into(),
                        })),
                    )
                    .await;
                    return;
                }
            }
        }
        _ => return,
    };
    if hello.protocol_version != PROTOCOL_VERSION {
        let _ = send_env(
            &mut sink,
            &envelope(Message::Error(ErrorMsg {
                code: "version_mismatch".into(),
                message: "unsupported protocol version".into(),
            })),
        )
        .await;
        return;
    }

    let id = Uuid::new_v4().to_string();
    let info = ConnectorInfo {
        id: id.clone(),
        name: hello.name,
        kind: hello.kind,
        capabilities: hello.capabilities,
    };
    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<Envelope>();
    state.lock().await.connectors.insert(id.clone(), Connected { info: info.clone(), tx: out_tx });
    let _ = events.send(HubEvent::ConnectorConnected { connector: info });
    if send_env(&mut sink, &envelope(Message::Welcome(Welcome { connector_id: id.clone() })))
        .await
        .is_err()
    {
        cleanup(&state, &events, &id).await;
        return;
    }

    // Main loop: one task owns both halves. Ping every interval; two pings
    // without a pong in between → dead (spec: liveness).
    let mut tick = tokio::time::interval(cfg.ping_interval);
    tick.tick().await; // consume the immediate first tick
    let mut unanswered_pings: u32 = 0;
    let mut strikes: u32 = 0;
    loop {
        tokio::select! {
            incoming = source.next() => match incoming {
                Some(Ok(WsMessage::Text(txt))) => match serde_json::from_str::<Envelope>(txt.as_ref()) {
                    Ok(env) => match env.msg {
                        Message::Pong(_) => unanswered_pings = 0,
                        Message::Response(r) => {
                            let waiter = state.lock().await.pending.remove(&r.request_id);
                            match waiter {
                                Some((_, done_tx)) => {
                                    let ok = r.ok;
                                    let result = r.result.unwrap_or(Value::Null);
                                    let outcome = if ok {
                                        Ok(result.clone())
                                    } else {
                                        Err(CommandError::Connector(r.error.unwrap_or_default()))
                                    };
                                    let _ = done_tx.send(outcome);
                                    let _ = events.send(HubEvent::ResponseReceived {
                                        connector_id: id.clone(),
                                        request_id: r.request_id,
                                        ok,
                                        result,
                                    });
                                }
                                // Late reply after timeout: spec says drop and log.
                                None => eprintln!("dropped late response {} from {}", r.request_id, id),
                            }
                        }
                        Message::Event(e) => {
                            let _ = events.send(HubEvent::EventReceived {
                                connector_id: id.clone(),
                                name: e.name,
                                data: e.data,
                            });
                        }
                        _ => {}
                    },
                    Err(_) => {
                        strikes += 1;
                        let _ = send_env(&mut sink, &envelope(Message::Error(ErrorMsg {
                            code: "bad_message".into(),
                            message: "frame failed validation".into(),
                        }))).await;
                        if strikes >= 3 { break; }
                    }
                },
                Some(Ok(_)) => {}   // ignore non-text frames
                _ => break,          // closed or socket error
            },
            outgoing = out_rx.recv() => {
                let Some(env) = outgoing else { break };
                if send_env(&mut sink, &env).await.is_err() { break; }
            }
            _ = tick.tick() => {
                if unanswered_pings >= 2 { break; }
                unanswered_pings += 1;
                if send_env(&mut sink, &envelope(Message::Ping(json!({})))).await.is_err() { break; }
            }
        }
    }
    cleanup(&state, &events, &id).await;
}

/// Removes the connector from the registry, fails its pending requests fast,
/// and announces the disconnect.
async fn cleanup(state: &Shared, events: &broadcast::Sender<HubEvent>, id: &str) {
    let mut st = state.lock().await;
    st.connectors.remove(id);
    let stale: Vec<String> = st
        .pending
        .iter()
        .filter(|(_, (cid, _))| cid == id)
        .map(|(rid, _)| rid.clone())
        .collect();
    for rid in stale {
        if let Some((_, done_tx)) = st.pending.remove(&rid) {
            let _ = done_tx.send(Err(CommandError::Disconnected));
        }
    }
    drop(st);
    let _ = events.send(HubEvent::ConnectorDisconnected { connector_id: id.to_string() });
}
```
(Note: `send_command`, event fan-out, liveness, strikes, and cleanup are written here once; Tasks 5–6 add their *tests* and fix anything those tests flush out — do not re-implement.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test -p omnibus-hub`
Expected: PASS — fixtures + 3 handshake tests. Zero warnings.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: hub core with discovery file, handshake, registry, origin rejection"
```

---

### Task 5: Command routing, correlation, timeout — tests

**Files:**
- Test: `crates/omnibus-hub/tests/commands.rs`

**Interfaces:**
- Consumes: `Hub::send_command` and `HubEvent::{CommandSent, ResponseReceived}` from Task 4.

- [ ] **Step 1: Write the tests**

`crates/omnibus-hub/tests/commands.rs`:
```rust
use futures_util::{SinkExt, StreamExt};
use omnibus_hub::{CommandError, Hub, HubConfig};
use serde_json::{json, Value};
use std::time::Duration;

/// Starts a hub and a raw scripted connector that answers every command
/// with `{ "echo": <args> }` (and answers pings). Returns the connector id.
async fn hub_with_echo_connector(cfg: HubConfig) -> (Hub, String, tempfile::TempDir) {
    let dir = tempfile::tempdir().unwrap();
    let hub = Hub::start(HubConfig { data_dir: dir.path().to_path_buf(), ..cfg }).await.unwrap();
    let (mut ws, _) =
        tokio_tungstenite::connect_async(format!("ws://127.0.0.1:{}", hub.port())).await.unwrap();
    ws.send(
        json!({"v":1,"id":"h","kind":"hello","payload":{"name":"echo","kind":"fake","protocolVersion":1,"capabilities":["workspace"]}})
            .to_string()
            .into(),
    )
    .await
    .unwrap();
    let welcome: Value =
        serde_json::from_str(ws.next().await.unwrap().unwrap().to_text().unwrap()).unwrap();
    let id = welcome["payload"]["connectorId"].as_str().unwrap().to_string();
    tokio::spawn(async move {
        while let Some(Ok(frame)) = ws.next().await {
            let Ok(txt) = frame.to_text() else { continue };
            let Ok(env) = serde_json::from_str::<Value>(txt) else { continue };
            match env["kind"].as_str() {
                Some("ping") => {
                    let pong = json!({"v":1,"id":"p","kind":"pong","payload":{}});
                    let _ = ws.send(pong.to_string().into()).await;
                }
                Some("command") => {
                    let resp = json!({"v":1,"id":"r","kind":"response","payload":{
                        "requestId": env["id"], "ok": true, "result": {"echo": env["payload"]["args"]}
                    }});
                    let _ = ws.send(resp.to_string().into()).await;
                }
                _ => {}
            }
        }
    });
    (hub, id, dir)
}

#[tokio::test]
async fn routes_command_and_correlates_response() {
    let dir = tempfile::tempdir().unwrap();
    let (hub, id, _dir) =
        hub_with_echo_connector(HubConfig::new(dir.path().to_path_buf())).await;
    let result = hub.send_command(&id, "workspace.open", json!({"path": "/tmp/x"})).await.unwrap();
    assert_eq!(result, json!({"echo": {"path": "/tmp/x"}}));
}

#[tokio::test]
async fn unknown_connector_fails_fast() {
    let dir = tempfile::tempdir().unwrap();
    let hub = Hub::start(HubConfig::new(dir.path().to_path_buf())).await.unwrap();
    let err = hub.send_command("nope", "x", json!({})).await.unwrap_err();
    assert!(matches!(err, CommandError::UnknownConnector(_)));
}

#[tokio::test]
async fn command_times_out_when_connector_never_answers() {
    // Deaf connector: registers, then reads nothing and answers nothing.
    let dir = tempfile::tempdir().unwrap();
    let mut cfg = HubConfig::new(dir.path().to_path_buf());
    cfg.command_timeout = Duration::from_millis(200);
    let hub = Hub::start(cfg).await.unwrap();
    let (mut ws, _) =
        tokio_tungstenite::connect_async(format!("ws://127.0.0.1:{}", hub.port())).await.unwrap();
    ws.send(
        json!({"v":1,"id":"h","kind":"hello","payload":{"name":"deaf","kind":"fake","protocolVersion":1,"capabilities":[]}})
            .to_string()
            .into(),
    )
    .await
    .unwrap();
    let welcome: Value =
        serde_json::from_str(ws.next().await.unwrap().unwrap().to_text().unwrap()).unwrap();
    let id = welcome["payload"]["connectorId"].as_str().unwrap().to_string();

    let started = std::time::Instant::now();
    let err = hub.send_command(&id, "workspace.open", json!({})).await.unwrap_err();
    assert!(matches!(err, CommandError::Timeout));
    assert!(started.elapsed() < Duration::from_secs(2), "timeout must respect config");
}
```

- [ ] **Step 2: Run tests**

Run: `cargo test -p omnibus-hub --test commands`
Expected: PASS (the implementation landed in Task 4). If any test fails, fix `hub.rs` — the tests are the contract, do not weaken them.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "test: command routing, correlation, and timeout coverage"
```

---

### Task 6: Events, liveness, disconnect + headless example

**Files:**
- Create: `crates/omnibus-hub/examples/headless.rs`
- Test: `crates/omnibus-hub/tests/events.rs`

**Interfaces:**
- Consumes: `Hub`, `HubEvent`, `hub_with_echo_connector`-style raw clients.
- Produces: `cargo run -p omnibus-hub --example headless` — starts a hub in `$OMNIBUS_DATA_DIR` (default `~/Library/Application Support/com.omnibus.dev`), prints every `HubEvent` as one JSON line to stdout; with `--probe` it additionally sends `probe.echo {"n":1}` to each newly connected connector and prints `{"probe": {...}}`. Task 8's SDK integration test shells out to this binary.

- [ ] **Step 1: Write the tests**

`crates/omnibus-hub/tests/events.rs`:
```rust
use futures_util::{SinkExt, StreamExt};
use omnibus_hub::{Hub, HubConfig, HubEvent};
use serde_json::{json, Value};
use std::time::Duration;

async fn register(port: u16, name: &str) -> tokio_tungstenite::WebSocketStream<
    tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
> {
    let (mut ws, _) = tokio_tungstenite::connect_async(format!("ws://127.0.0.1:{port}")).await.unwrap();
    ws.send(
        json!({"v":1,"id":"h","kind":"hello","payload":{"name":name,"kind":"fake","protocolVersion":1,"capabilities":[]}})
            .to_string()
            .into(),
    )
    .await
    .unwrap();
    ws.next().await; // welcome
    ws
}

async fn next_event(rx: &mut tokio::sync::broadcast::Receiver<HubEvent>) -> HubEvent {
    tokio::time::timeout(Duration::from_secs(2), rx.recv()).await.unwrap().unwrap()
}

#[tokio::test]
async fn fans_out_connector_events_to_subscribers() {
    let dir = tempfile::tempdir().unwrap();
    let hub = Hub::start(HubConfig::new(dir.path().to_path_buf())).await.unwrap();
    let mut rx = hub.subscribe();
    let mut ws = register(hub.port(), "emitter").await;
    assert!(matches!(next_event(&mut rx).await, HubEvent::ConnectorConnected { .. }));

    ws.send(
        json!({"v":1,"id":"e","kind":"event","payload":{"name":"editor.fileOpened","data":{"path":"a.ts"}}})
            .to_string()
            .into(),
    )
    .await
    .unwrap();
    match next_event(&mut rx).await {
        HubEvent::EventReceived { name, data, .. } => {
            assert_eq!(name, "editor.fileOpened");
            assert_eq!(data, json!({"path": "a.ts"}));
        }
        other => panic!("expected EventReceived, got {other:?}"),
    }
}

#[tokio::test]
async fn detects_dead_connector_via_missed_pongs() {
    let dir = tempfile::tempdir().unwrap();
    let mut cfg = HubConfig::new(dir.path().to_path_buf());
    cfg.ping_interval = Duration::from_millis(100);
    let hub = Hub::start(cfg).await.unwrap();
    let mut rx = hub.subscribe();
    let _ws = register(hub.port(), "silent").await; // never answers pings
    assert!(matches!(next_event(&mut rx).await, HubEvent::ConnectorConnected { .. }));
    let deadline = std::time::Instant::now();
    loop {
        if let HubEvent::ConnectorDisconnected { .. } = next_event(&mut rx).await { break }
        assert!(deadline.elapsed() < Duration::from_secs(2), "no disconnect within 2s");
    }
    assert!(hub.connectors().await.is_empty());
}

#[tokio::test]
async fn closes_connection_after_three_bad_frames() {
    let dir = tempfile::tempdir().unwrap();
    let hub = Hub::start(HubConfig::new(dir.path().to_path_buf())).await.unwrap();
    let mut ws = register(hub.port(), "garbler").await;
    for _ in 0..3 {
        ws.send("not json".to_string().into()).await.unwrap();
    }
    // After 3 strikes the hub breaks the loop; we should observe the close
    // (three bad_message error frames may arrive first).
    let mut closed = false;
    for _ in 0..10 {
        match tokio::time::timeout(Duration::from_secs(2), ws.next()).await {
            Ok(None) | Ok(Some(Err(_))) | Err(_) => { closed = true; break; }
            Ok(Some(Ok(frame))) => {
                if frame.is_close() { closed = true; break; }
            }
        }
    }
    assert!(closed, "hub did not close after 3 bad frames");
}
```

- [ ] **Step 2: Run tests**

Run: `cargo test -p omnibus-hub --test events`
Expected: PASS against the Task 4 implementation; fix `hub.rs` if not — tests are the contract.

- [ ] **Step 3: Headless example**

`crates/omnibus-hub/examples/headless.rs`:
```rust
//! Runs the hub without Tauri. Prints every HubEvent as one JSON line.
//! `--probe`: send `probe.echo {"n":1}` to each connector as it connects and
//! print the outcome — used by the connector-sdk integration test.
use omnibus_hub::{Hub, HubConfig, HubEvent};
use serde_json::json;

#[tokio::main]
async fn main() {
    let data_dir = match std::env::var("OMNIBUS_DATA_DIR") {
        Ok(dir) => dir.into(),
        Err(_) => dirs::data_dir().expect("no platform data dir").join("com.omnibus.dev"),
    };
    let probe = std::env::args().any(|a| a == "--probe");
    let hub = Hub::start(HubConfig::new(data_dir)).await.expect("hub failed to start");
    eprintln!("hub listening on 127.0.0.1:{}", hub.port());
    let mut events = hub.subscribe();
    while let Ok(ev) = events.recv().await {
        println!("{}", serde_json::to_string(&ev).unwrap());
        if probe {
            if let HubEvent::ConnectorConnected { connector } = &ev {
                let outcome = hub.send_command(&connector.id, "probe.echo", json!({"n": 1})).await;
                println!(
                    "{}",
                    json!({"probe": {"ok": outcome.is_ok(), "result": outcome.ok()}})
                );
            }
        }
    }
}
```
Move `dirs = "5"` usage note: examples resolve against `[dev-dependencies]`, which already has `dirs` (Task 3).

- [ ] **Step 4: Verify example runs**

Run: `OMNIBUS_DATA_DIR=$(mktemp -d) cargo run -p omnibus-hub --example headless`
Expected: prints `hub listening on 127.0.0.1:<port>` and blocks. Ctrl-C to stop.
Run: `cargo test -p omnibus-hub` — everything green, zero warnings.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: event fan-out, liveness, bad-frame strikes verified; add headless example"
```

---

### Task 7: Embed the hub in the Tauri shell

**Files:**
- Modify: `apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `Hub`, `HubConfig`, `ConnectorInfo`, `HubEvent`.
- Produces (frontend contract for Task 10): Tauri command `connectors() -> ConnectorInfo[]`; Tauri command `send_command(target: string, name: string, args: unknown) -> unknown` (rejects with a string); Tauri event `"hub-event"` whose payload is a `HubEvent` serialized with camelCase fields and a `type` tag.

- [ ] **Step 1: Wire it up**

Add to `apps/desktop/src-tauri/Cargo.toml` dependencies:
```toml
omnibus-hub = { path = "../../../crates/omnibus-hub" }
```

Replace `apps/desktop/src-tauri/src/lib.rs`:
```rust
use omnibus_hub::{ConnectorInfo, Hub, HubConfig};
use serde_json::Value;
use tauri::{Emitter, Manager, State};

struct HubHandle(Hub);

/// Snapshot of connected connectors for the UI.
#[tauri::command]
async fn connectors(state: State<'_, HubHandle>) -> Result<Vec<ConnectorInfo>, String> {
    Ok(state.0.connectors().await)
}

/// Routes a command to a connector and returns its result (or an error string).
#[tauri::command]
async fn send_command(
    state: State<'_, HubHandle>,
    target: String,
    name: String,
    args: Value,
) -> Result<Value, String> {
    state.0.send_command(&target, &name, args).await.map_err(|e| e.to_string())
}

/// Builds and runs the OmniBus Tauri application: starts the hub on launch
/// and forwards its event stream to the frontend as `hub-event`.
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let hub = tauri::async_runtime::block_on(Hub::start(HubConfig::new(data_dir)))?;
            let mut events = hub.subscribe();
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                while let Ok(ev) = events.recv().await {
                    let _ = handle.emit("hub-event", &ev);
                }
            });
            app.manage(HubHandle(hub));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![connectors, send_command])
        .run(tauri::generate_context!())
        .expect("error while running OmniBus");
}
```

- [ ] **Step 2: Verify manually**

Run: `pnpm --filter desktop tauri dev`. In a second terminal:
```bash
cat ~/Library/Application\ Support/com.omnibus.dev/hub.json
```
Expected: `{"port":<n>}` (fresh port each launch). Window opens; `cargo check` warning-free.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: start hub inside Tauri shell, expose commands and hub-event stream"
```

---

### Task 8: Connector SDK + integration test against the headless hub

**Files:**
- Create: `packages/connector-sdk/{package.json, README.md, vitest.config.ts, src/index.ts}`
- Test: `packages/connector-sdk/test/integration.test.ts`

**Interfaces:**
- Consumes: `@omnibus/protocol` (`Envelope`, `PROTOCOL_VERSION`); the headless example from Task 6.
- Produces (contract for Task 9):
  - `connect(opts: { name: string; kind: "fake" | "vscode" | "chrome"; capabilities: string[]; hubFile?: string }): Promise<Connector>` — resolves after the first `welcome`.
  - `Connector.onCommand(name: string, handler: (args: unknown) => unknown | Promise<unknown>)`
  - `Connector.emit(name: string, data: unknown)`
  - `Connector.close()`; `Connector.connectorId: string | null`.

- [ ] **Step 1: Package + failing integration test**

`packages/connector-sdk/package.json`:
```json
{
  "name": "@omnibus/connector-sdk",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": { "test": "vitest run" },
  "dependencies": {
    "@omnibus/protocol": "workspace:*",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/ws": "^8.5.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

`packages/connector-sdk/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

// Long timeouts: the integration test compiles and spawns the Rust headless hub.
export default defineConfig({
  test: { testTimeout: 60_000, hookTimeout: 240_000 },
});
```

`packages/connector-sdk/README.md`: two sentences — TS SDK for OmniBus connectors (discovery, handshake, reconnect); see `connectors/fake` for the reference example; `pnpm test` builds the Rust headless hub first.

`packages/connector-sdk/test/integration.test.ts`:
```ts
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, type Connector } from "../src/index";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const headlessBin = join(repoRoot, "target", "debug", "examples", "headless");

function startHub(dataDir: string) {
  const child = spawn(headlessBin, ["--probe"], {
    env: { ...process.env, OMNIBUS_DATA_DIR: dataDir },
  });
  const lines: string[] = [];
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    for (const l of chunk.split("\n")) if (l.trim()) lines.push(l.trim());
  });
  return { child, lines };
}

async function until(pred: () => boolean, ms = 15000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > ms) throw new Error("condition not met in time");
    await new Promise((r) => setTimeout(r, 50));
  }
}

const probeLines = (lines: string[]) => lines.filter((l) => l.includes('"probe"'));

describe("connector-sdk against headless hub", () => {
  let dataDir: string;
  let hub: { child: ChildProcess; lines: string[] };
  let conn: Connector | undefined;

  beforeAll(() => {
    const build = spawnSync("cargo", ["build", "-p", "omnibus-hub", "--example", "headless"], {
      cwd: repoRoot,
      stdio: "inherit",
    });
    expect(build.status).toBe(0);
    dataDir = mkdtempSync(join(tmpdir(), "omnibus-sdk-test-"));
    hub = startHub(dataDir);
  });

  afterAll(() => {
    conn?.close();
    hub.child.kill();
  });

  it("discovers the hub, registers, and answers a command", async () => {
    await until(() => existsSync(join(dataDir, "hub.json")));
    // Handlers must be registered via `setup` (which runs before dialing):
    // the probing hub sends its command immediately on connect.
    conn = await connect(
      {
        name: "sdk-test",
        kind: "fake",
        capabilities: ["probe"],
        hubFile: join(dataDir, "hub.json"),
      },
      (c) => c.onCommand("probe.echo", (args) => ({ echoed: args }))
    );
    expect(conn.connectorId).toBeTruthy();

    await until(() => probeLines(hub.lines).length >= 1);
    const probe = JSON.parse(probeLines(hub.lines)[0]).probe;
    expect(probe.ok).toBe(true);
    expect(probe.result).toEqual({ echoed: { n: 1 } });
  }, 30000);

  it("reconnects with backoff after a hub restart", async () => {
    hub.child.kill();
    await new Promise((r) => setTimeout(r, 500));
    hub = startHub(dataDir); // new port, hub.json rewritten; SDK must re-read it
    await until(() => probeLines(hub.lines).length >= 1, 20000);
    const probe = JSON.parse(probeLines(hub.lines)[0]).probe;
    expect(probe.ok).toBe(true);
  }, 40000);
});
```
Notes on the contract this test pins down:
- `connect(opts, setup?)` runs `setup(connector)` **before dialing**, so handlers exist before the first command can arrive (the probing hub sends immediately on connect). Task 9 uses the same form.
- Handlers registered once must still answer after a hub restart — that's the point of the second test.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm install && pnpm --filter @omnibus/connector-sdk test`
Expected: FAIL — cannot resolve `../src/index`.

- [ ] **Step 3: Implement the SDK**

`packages/connector-sdk/src/index.ts`:
```ts
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { Envelope, PROTOCOL_VERSION } from "@omnibus/protocol";

export interface ConnectOptions {
  name: string;
  kind: "fake" | "vscode" | "chrome";
  capabilities: string[];
  /** Override the discovery file path (tests). */
  hubFile?: string;
}

export type CommandHandler = (args: unknown) => unknown | Promise<unknown>;

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

/** A live connection to the OmniBus hub that survives hub restarts. */
export class Connector {
  connectorId: string | null = null;
  private handlers = new Map<string, CommandHandler>();
  private ws: WebSocket | null = null;
  private closed = false;
  private backoff = INITIAL_BACKOFF_MS;

  constructor(private opts: ConnectOptions) {}

  /** Registers a handler for a command name. Survives reconnects. */
  onCommand(name: string, handler: CommandHandler): void {
    this.handlers.set(name, handler);
  }

  /** Emits an unsolicited event to the hub. Dropped if not connected. */
  emit(name: string, data: unknown): void {
    this.sendFrame({ kind: "event", payload: { name, data } });
  }

  /** Closes the connection permanently (no reconnect). */
  close(): void {
    this.closed = true;
    this.ws?.close();
  }

  private hubFile(): string {
    return (
      this.opts.hubFile ??
      join(homedir(), "Library", "Application Support", "com.omnibus.dev", "hub.json")
    );
  }

  private sendFrame(frame: { kind: string; payload: unknown }): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ v: PROTOCOL_VERSION, id: randomUUID(), ...frame }));
    }
  }

  /** Resolves after the first successful welcome; keeps reconnecting after that. */
  start(): Promise<void> {
    return new Promise((resolve, reject) => this.dial(resolve, reject));
  }

  private dial(onWelcome?: () => void, onFatal?: (e: Error) => void): void {
    let port: number;
    try {
      // Re-read on every attempt: a restarted hub writes a fresh port.
      port = JSON.parse(readFileSync(this.hubFile(), "utf8")).port;
    } catch {
      this.scheduleRedial(onWelcome, onFatal);
      return;
    }
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    this.ws = ws;
    ws.on("open", () => {
      this.sendFrame({
        kind: "hello",
        payload: {
          name: this.opts.name,
          kind: this.opts.kind,
          protocolVersion: PROTOCOL_VERSION,
          capabilities: this.opts.capabilities,
        },
      });
    });
    ws.on("message", (raw) => void this.handleFrame(raw.toString(), onWelcome, onFatal));
    ws.on("close", () => this.scheduleRedial(onWelcome, onFatal));
    ws.on("error", () => {
      /* a close event follows; redial happens there */
    });
  }

  private async handleFrame(
    raw: string,
    onWelcome?: () => void,
    onFatal?: (e: Error) => void
  ): Promise<void> {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return;
    }
    const parsed = Envelope.safeParse(json);
    if (!parsed.success) return;
    const env = parsed.data;
    switch (env.kind) {
      case "welcome":
        this.connectorId = env.payload.connectorId;
        this.backoff = INITIAL_BACKOFF_MS;
        onWelcome?.();
        break;
      case "ping":
        this.sendFrame({ kind: "pong", payload: {} });
        break;
      case "command": {
        const handler = this.handlers.get(env.payload.name);
        let payload;
        try {
          if (!handler) throw new Error(`no handler for ${env.payload.name}`);
          payload = { requestId: env.id, ok: true, result: await handler(env.payload.args) };
        } catch (e) {
          payload = { requestId: env.id, ok: false, error: String(e) };
        }
        this.sendFrame({ kind: "response", payload });
        break;
      }
      case "error":
        if (env.payload.code === "version_mismatch") {
          // Spec: surface clearly and do NOT retry.
          this.closed = true;
          const err = new Error(
            "hub requires a different protocol version — update this connector"
          );
          if (onFatal) onFatal(err);
          else console.error(err.message);
        }
        break;
    }
  }

  private scheduleRedial(onWelcome?: () => void, onFatal?: (e: Error) => void): void {
    if (this.closed) return;
    setTimeout(() => this.dial(onWelcome, onFatal), this.backoff);
    this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
  }
}

/**
 * Connects to the hub. `setup` runs before dialing so command handlers are
 * registered before the first command can arrive.
 */
export async function connect(
  opts: ConnectOptions,
  setup?: (c: Connector) => void
): Promise<Connector> {
  const connector = new Connector(opts);
  setup?.(connector);
  await connector.start();
  return connector;
}
```
One subtlety the second integration test exercises: after `welcome` resolves the original promise, later `onWelcome` calls are harmless no-op resolves. The reconnect dial reuses the same callbacks; a promise resolves only once, which is exactly what we want.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @omnibus/connector-sdk test`
Expected: PASS — both tests (first run includes a cargo build; allow a few minutes).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: connector SDK with discovery, handshake, and reconnect, tested against headless hub"
```

---

### Task 9: Fake connector CLI

**Files:**
- Create: `connectors/fake/{package.json, README.md, src/state.ts, src/main.ts}`
- Test: `connectors/fake/test/state.test.ts`

**Interfaces:**
- Consumes: `connect(opts, setup)` from `@omnibus/connector-sdk`.
- Produces: `pnpm --filter fake-connector start [-- --chatty]` — the process the success criteria are demonstrated with. Command surface: `workspace.open {path}`, `workspace.state {}`, `editor.openFiles {}`.

- [ ] **Step 1: Failing unit test for the in-memory state**

`connectors/fake/package.json`:
```json
{
  "name": "fake-connector",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "tsx src/main.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@omnibus/connector-sdk": "workspace:*",
    "tsx": "^4.19.0"
  },
  "devDependencies": { "typescript": "^5.6.0", "vitest": "^2.1.0" }
}
```

`connectors/fake/README.md`: what it is (simulated VS Code used to validate the architecture; reference SDK example), `pnpm --filter fake-connector start -- --chatty`.

`connectors/fake/test/state.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { createWorkspace } from "../src/state";

describe("fake workspace state", () => {
  it("opens a workspace and resets open files", () => {
    const ws = createWorkspace();
    ws.openFile("stale.ts");
    expect(ws.open("/tmp/demo")).toEqual({ opened: "/tmp/demo" });
    expect(ws.state).toEqual({ root: "/tmp/demo", openFiles: [] });
  });

  it("tracks opened files without duplicates", () => {
    const ws = createWorkspace();
    ws.openFile("a.ts");
    ws.openFile("a.ts");
    ws.openFile("b.ts");
    expect(ws.state.openFiles).toEqual(["a.ts", "b.ts"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm install && pnpm --filter fake-connector test`
Expected: FAIL — cannot resolve `../src/state`.

- [ ] **Step 3: Implement**

`connectors/fake/src/state.ts`:
```ts
export interface WorkspaceState {
  root: string | null;
  openFiles: string[];
}

/** In-memory stand-in for a VS Code workspace. */
export function createWorkspace() {
  const state: WorkspaceState = { root: null, openFiles: [] };
  return {
    state,
    open(path: string) {
      state.root = path;
      state.openFiles = [];
      return { opened: path };
    },
    openFile(path: string) {
      if (!state.openFiles.includes(path)) state.openFiles.push(path);
    },
  };
}
```
(Note: `open()` replaces `openFiles` with a fresh array — `state` is returned by reference to callers, so `workspace.state` reads stay correct because reads go through this same object.)

`connectors/fake/src/main.ts`:
```ts
import { connect } from "@omnibus/connector-sdk";
import { createWorkspace } from "./state";

const chatty = process.argv.includes("--chatty");
const ws = createWorkspace();

const connector = await connect(
  { name: "fake-vscode", kind: "fake", capabilities: ["workspace", "editor"] },
  (c) => {
    c.onCommand("workspace.open", (args) => ws.open((args as { path: string }).path));
    c.onCommand("workspace.state", () => ws.state);
    c.onCommand("editor.openFiles", () => ({ openFiles: ws.state.openFiles }));
  }
);
console.log(`fake-vscode connected as ${connector.connectorId}`);

if (chatty) {
  const files = ["src/main.ts", "src/app.ts", "README.md", "package.json"];
  let i = 0;
  setInterval(() => {
    const path = files[i++ % files.length];
    ws.openFile(path);
    connector.emit("editor.fileOpened", { path });
  }, 3000);
}
```

- [ ] **Step 4: Run tests, then verify against the real hub**

Run: `pnpm --filter fake-connector test`
Expected: PASS.

Manual check: start `pnpm --filter desktop tauri dev`, then `pnpm --filter fake-connector start -- --chatty` — its console prints `fake-vscode connected as <uuid>`; the app's terminal/devtools shows hub events flowing.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: fake VS Code connector CLI with chatty mode"
```

---

### Task 10: Dev-console UI

**Files:**
- Create: `apps/desktop/src/store.ts`, `apps/desktop/src/panels/{ConnectorsPanel.tsx, LogPanel.tsx, CommandSender.tsx}`
- Modify: `apps/desktop/src/App.tsx`

**Interfaces:**
- Consumes: Tauri commands `connectors` / `send_command` and event `"hub-event"` from Task 7 (payload: `{ type: "connectorConnected" | "connectorDisconnected" | "commandSent" | "responseReceived" | "eventReceived", ...camelCase fields }`).

- [ ] **Step 1: Store**

`apps/desktop/src/store.ts`:
```ts
import { create } from "zustand";

export interface ConnectorInfo {
  id: string;
  name: string;
  kind: string;
  capabilities: string[];
}

export interface ConnectorRow extends ConnectorInfo {
  connected: boolean;
  connectedSince: string;
}

export interface LogEntry {
  seq: number;
  at: string;
  type: string;
  [key: string]: unknown;
}

const MAX_LOG = 500;
let seq = 0;

interface Store {
  connectors: ConnectorRow[];
  log: LogEntry[];
  paused: boolean;
  setConnectors: (live: ConnectorInfo[]) => void;
  append: (event: { type: string; [key: string]: unknown }) => void;
  togglePause: () => void;
}

export const useStore = create<Store>((set) => ({
  connectors: [],
  log: [],
  paused: false,
  // Live list from the hub; anything previously seen but now absent is
  // kept and shown as disconnected (spec: status dot).
  setConnectors: (live) =>
    set((s) => {
      const rows: ConnectorRow[] = live.map((c) => {
        const prev = s.connectors.find((p) => p.id === c.id);
        return { ...c, connected: true, connectedSince: prev?.connectedSince ?? new Date().toLocaleTimeString() };
      });
      const gone = s.connectors
        .filter((p) => !live.some((c) => c.id === p.id))
        .map((p) => ({ ...p, connected: false }));
      return { connectors: [...rows, ...gone] };
    }),
  append: (event) =>
    set((s) => ({
      log: [...s.log.slice(-(MAX_LOG - 1)), { seq: seq++, at: new Date().toLocaleTimeString(), ...event }],
    })),
  togglePause: () => set((s) => ({ paused: !s.paused })),
}));
```

- [ ] **Step 2: Panels**

`apps/desktop/src/panels/ConnectorsPanel.tsx`:
```tsx
import { useStore } from "../store";

export function ConnectorsPanel() {
  const connectors = useStore((s) => s.connectors);
  return (
    <div className="row-span-2 border-r border-neutral-700 p-3 overflow-y-auto">
      <h2 className="text-neutral-400 uppercase text-xs mb-2">Connectors</h2>
      {connectors.length === 0 && <div className="text-neutral-500">none connected</div>}
      {connectors.map((c) => (
        <div key={c.id} className="border border-neutral-700 p-2 mb-2">
          <div>
            <span className={c.connected ? "text-green-500" : "text-red-500"}>●</span> {c.name}{" "}
            <span className="text-neutral-500">({c.kind})</span>
          </div>
          <div className="text-neutral-500 break-all text-xs">{c.id}</div>
          <div className="text-neutral-400 text-xs">{c.capabilities.join(", ") || "—"}</div>
          <div className="text-neutral-500 text-xs">since {c.connectedSince}</div>
        </div>
      ))}
    </div>
  );
}
```

`apps/desktop/src/panels/LogPanel.tsx`:
```tsx
import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";

const KINDS = [
  "all",
  "connectorConnected",
  "connectorDisconnected",
  "commandSent",
  "responseReceived",
  "eventReceived",
];

export function LogPanel() {
  const log = useStore((s) => s.log);
  const paused = useStore((s) => s.paused);
  const togglePause = useStore((s) => s.togglePause);
  const connectors = useStore((s) => s.connectors);
  const [kindFilter, setKindFilter] = useState("all");
  const [connFilter, setConnFilter] = useState("all");
  const scroller = useRef<HTMLDivElement>(null);

  const entryConnectorId = (e: Record<string, unknown>) =>
    (e.connectorId as string | undefined) ??
    (e.connector as { id?: string } | undefined)?.id;

  const shown = log.filter(
    (e) =>
      (kindFilter === "all" || e.type === kindFilter) &&
      (connFilter === "all" || entryConnectorId(e) === connFilter)
  );

  useEffect(() => {
    if (!paused) scroller.current?.scrollTo(0, scroller.current.scrollHeight);
  }, [log, paused]);

  return (
    <div className="flex flex-col border-b border-neutral-700 min-h-0">
      <div className="flex gap-2 p-2 border-b border-neutral-800 items-center">
        <h2 className="text-neutral-400 uppercase text-xs flex-1">Activity log</h2>
        <select value={connFilter} onChange={(e) => setConnFilter(e.target.value)} className="bg-neutral-800 p-1">
          <option value="all">all connectors</option>
          {connectors.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className="bg-neutral-800 p-1">
          {KINDS.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
        <button onClick={togglePause} className="bg-neutral-800 px-2 py-1">
          {paused ? "resume" : "pause"}
        </button>
      </div>
      <div ref={scroller} className="flex-1 overflow-y-auto p-2 text-xs">
        {shown.map((e) => (
          <div key={e.seq} className="whitespace-pre-wrap break-all">
            <span className="text-neutral-500">{e.at}</span>{" "}
            <span className="text-neutral-400">{e.type}</span> {JSON.stringify(e)}
          </div>
        ))}
      </div>
    </div>
  );
}
```

`apps/desktop/src/panels/CommandSender.tsx`:
```tsx
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useStore } from "../store";

export function CommandSender() {
  const connectors = useStore((s) => s.connectors);
  const [target, setTarget] = useState("");
  const [name, setName] = useState("workspace.open");
  const [args, setArgs] = useState('{"path": "/tmp/demo"}');
  const [result, setResult] = useState("");

  async function send() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(args);
    } catch {
      setResult("error: args is not valid JSON");
      return;
    }
    try {
      const res = await invoke("send_command", { target, name, args: parsed });
      setResult(JSON.stringify(res, null, 2));
    } catch (e) {
      setResult(`error: ${e}`);
    }
  }

  return (
    <div className="p-2 flex gap-2 min-h-0">
      <div className="flex flex-col gap-2 w-72">
        <select value={target} onChange={(e) => setTarget(e.target.value)} className="bg-neutral-800 p-1">
          <option value="">pick a connector</option>
          {connectors.filter((c) => c.connected).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="command name"
          className="bg-neutral-800 p-1"
        />
        <button onClick={send} disabled={!target} className="bg-neutral-700 py-1 disabled:opacity-40">
          send
        </button>
      </div>
      <textarea value={args} onChange={(e) => setArgs(e.target.value)} className="bg-neutral-800 p-1 flex-1" />
      <pre className="flex-1 overflow-auto bg-neutral-950 p-2 text-xs">{result}</pre>
    </div>
  );
}
```

`apps/desktop/src/App.tsx`:
```tsx
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { CommandSender } from "./panels/CommandSender";
import { ConnectorsPanel } from "./panels/ConnectorsPanel";
import { LogPanel } from "./panels/LogPanel";
import { useStore, type ConnectorInfo } from "./store";

export default function App() {
  const append = useStore((s) => s.append);
  const setConnectors = useStore((s) => s.setConnectors);

  useEffect(() => {
    const refresh = () => invoke<ConnectorInfo[]>("connectors").then(setConnectors);
    refresh();
    const unlisten = listen<{ type: string; [k: string]: unknown }>("hub-event", (e) => {
      append(e.payload);
      if (e.payload.type === "connectorConnected" || e.payload.type === "connectorDisconnected") {
        refresh();
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [append, setConnectors]);

  return (
    <div className="h-screen bg-neutral-900 text-neutral-200 grid grid-cols-[300px_1fr] grid-rows-[1fr_200px] font-mono text-sm">
      <ConnectorsPanel />
      <LogPanel />
      <CommandSender />
    </div>
  );
}
```

- [ ] **Step 3: Verify manually**

Run `pnpm --filter desktop tauri dev`, then `pnpm --filter fake-connector start -- --chatty`:
- fake-vscode appears with green dot, capabilities `workspace, editor`.
- chatty events stream into the log; filters and pause work.
- send `workspace.open` with `{"path": "/tmp/demo"}` → response `{ "opened": "/tmp/demo" }` shown inline and in the log.
- Ctrl-C the connector → dot turns red within ~5 s (with default 5 s pings allow up to ~15 s); restart it → green again.
Also: `pnpm --filter desktop build` passes (tsc strict, no errors).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: dev-console UI with connectors, activity log, and command sender panels"
```

---

### Task 11: Walk the success criteria + Definition of Done

**Files:**
- Modify: `README.md` (root — add the demo walkthrough), any file that needs fixes found here.

- [ ] **Step 1: Full test sweep**

Run: `cargo test` → all green, zero warnings.
Run: `pnpm test` → protocol, connector-sdk, fake-connector suites green.
Run: `cargo build` and `pnpm build` → warning-free.

- [ ] **Step 2: Walk spec success criteria 1–6 live**

With `pnpm --filter desktop tauri dev` + `pnpm --filter fake-connector start -- --chatty`, check each criterion from the spec in order (launch → register → command → events → kill → restart). Fix anything that fails before proceeding; criterion 7 was Step 1.

- [ ] **Step 3: Docs**

Root `README.md`: add a "Try it" section — the two commands above plus what you should see. Confirm every package/crate README exists and is accurate. Confirm no stray TODOs: `grep -rn "TODO" --include="*.{ts,tsx,rs}" .` (explained TODOs only).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "docs: demo walkthrough; phases 1-4 success criteria verified"
```

---

## Self-review notes

- Spec coverage: discovery file (T4), handshake + version mismatch (T4), Origin rejection (T4), routing + 10 s timeout (T4/T5), events fan-out (T6), liveness 5 s/2-miss (T6), 3-strike bad frames (T6), late-reply drop (T4 impl, logged), reconnection with backoff + hub.json re-read (T8), capabilities declared-not-enforced (T4 stores, T10 displays, nothing checks), three-panel UI (T10), headless example (T6), all seven success criteria (T11). Fixtures tested from both sides (T2/T3).
- Deliberate deviation from pure TDD in Tasks 4–6: the hub's connection loop is one coherent unit; it lands complete in Task 4 with handshake tests, and Tasks 5–6 add the remaining contract tests. Splitting the loop implementation across three tasks would mean committing intentionally broken intermediate states.
- Type consistency checked: `connect(opts, setup)` (T8 ↔ T9), `HubEvent` camelCase tags (T4 ↔ T7 ↔ T10 `KINDS`), `ConnectorInfo` fields (T4 ↔ T7 ↔ T10), fixture paths (T2 ↔ T3).
