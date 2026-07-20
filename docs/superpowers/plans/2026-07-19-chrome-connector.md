# Chrome Connector (Phase 10b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An MV3 Chrome extension that pairs with the authed hub, stores its token, reads/opens tabs; tabs join capsules; a stable browser-facing hub port.

**Architecture:** Hub gains an optional preferred port (browser needs a stable one). `capsules.rs` gains a `chrome` kind (capture via `workspace.state`, restore via `tabs.open`, additive — no continuation). The extension reuses `@omnibus/protocol` but not the Node SDK: a pure `tabs.ts` (tested), a `connection.ts` transport state machine with injected socket/storage (tested), and a thin `background.ts` service worker (live-verified).

**Spec:** `docs/superpowers/specs/2026-07-19-omnibus-chrome-connector-design.md`.

## Global Constraints

- No protocol changes, no SDK changes. Extension imports `@omnibus/protocol` only (browser-safe); never Node `ws`/`fs`.
- Privacy (test-enforced in `tabs.ts`): only `http`/`https`, non-incognito tabs; dedupe by url; never page content (no content scripts, no host permissions in the manifest).
- Chrome kind: `name:"chrome"`, `kind:"chrome"`, capabilities `["tabs"]`; commands `workspace.state`→`{tabs:[{url,title}]}`, `tabs.open{url}`, `tabs.focus{url}`; events `tab.opened`/`tab.closed`.
- Capsule chrome restore is additive (no window reload, no pending); failures collected, never fatal; no-browser → skipped, other kinds proceed.
- Hub `preferred_port` default `0` (OS-assigned — existing behavior/tests unchanged); desktop sets `17872` with fallback.
- Token-rejection recovery for the browser DIVERGES from the SDK: `auth_failed` clears the stored token and re-pairs (backoff-rate-limited), not permanent stop.
- Environment: cargo NOT on default PATH (`export PATH="$HOME/.cargo/bin:$PATH"`); generous timeouts; nothing under `.superpowers/` committed. Warning-free; docs on public items.

---

### Task 1: Stable browser-facing hub port

**Files:**
- Modify: `crates/omnibus-hub/src/hub.rs`, `apps/desktop/src-tauri/src/lib.rs`, `apps/desktop/src/App.tsx`, `apps/desktop/src/store.ts`
- Test: `crates/omnibus-hub/tests/auth.rs` (append — it already has hub-start helpers)

**Interfaces:** `HubConfig += preferred_port: u16` (default `0`); `Hub::start` binds it when non-zero, else OS-assigned; falls back to OS-assigned when the preferred port is taken. Tauri command `hub_port() -> u16`.

- [ ] **Step 1: Failing tests** — append to `crates/omnibus-hub/tests/auth.rs`:
```rust
#[tokio::test]
async fn preferred_port_is_used_when_free() {
    // Grab a free port, release it, then ask the hub to prefer it.
    let probe = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let wanted = probe.local_addr().unwrap().port();
    drop(probe);
    let dir = tempfile::tempdir().unwrap();
    let mut cfg = HubConfig::new(dir.path().to_path_buf());
    cfg.preferred_port = wanted;
    let hub = Hub::start(cfg).await.unwrap();
    assert_eq!(hub.port(), wanted);
}

#[tokio::test]
async fn falls_back_when_preferred_port_taken() {
    // Occupy a port, then ask the hub to prefer it — it must still start elsewhere.
    let squatter = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let taken = squatter.local_addr().unwrap().port();
    let dir = tempfile::tempdir().unwrap();
    let mut cfg = HubConfig::new(dir.path().to_path_buf());
    cfg.preferred_port = taken;
    let hub = Hub::start(cfg).await.unwrap();
    assert_ne!(hub.port(), taken);
    assert!(hub.port() != 0);
}
```

- [ ] **Step 2: RED** — `cargo test -p omnibus-hub --test auth` → no field `preferred_port`.

- [ ] **Step 3: Implement**

`hub.rs` — add to `HubConfig`:
```rust
    /// Preferred TCP port for discoverability by clients that can't read
    /// `hub.json` (browsers). `0` means OS-assigned (native default). If the
    /// preferred port is taken, the hub falls back to an OS-assigned one.
    pub preferred_port: u16,
```
(default `0` in `HubConfig::new`.) In `Hub::start`, replace the `TcpListener::bind("127.0.0.1:0")` with:
```rust
        let listener = match cfg.preferred_port {
            0 => TcpListener::bind("127.0.0.1:0").await?,
            p => match TcpListener::bind(("127.0.0.1", p)).await {
                Ok(l) => l,
                Err(_) => TcpListener::bind("127.0.0.1:0").await?,
            },
        };
```

`apps/desktop/src-tauri/src/lib.rs` — where `HubConfig::new(data_dir)` is built for the app, set `hub_cfg.preferred_port = 17872;` (before `Hub::start`). Add a command:
```rust
/// The port the hub actually bound (browser extensions may need it if the
/// preferred port was taken).
#[tauri::command]
fn hub_port(hub: State<'_, HubHandle>) -> u16 {
    hub.0.port()
}
```
Register `hub_port` (25 commands).

`apps/desktop/src/store.ts` — add `hubPort: number | null` + `setHubPort`.
`apps/desktop/src/App.tsx` — on mount `invoke<number>("hub_port").then(setHubPort).catch(()=>{})`; render a tiny muted line in the header: `<span className="text-neutral-600 text-xs ml-auto">hub 127.0.0.1:{hubPort ?? "…"}</span>`.

- [ ] **Step 4: GREEN** — `cargo test -p omnibus-hub` green (auth now 11), zero warnings; `pnpm --filter desktop build` green.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: stable preferred hub port with OS-assigned fallback"`

---

### Task 2: `chrome` capsule kind

**Files:**
- Modify: `apps/desktop/src-tauri/src/capsules.rs`
- Test: `apps/desktop/src-tauri/tests/capsules.rs` (append)

**Interfaces:** `CAPTURABLE += "chrome"`; new `restore_chrome` arm; capture uniform via `workspace.state`.

- [ ] **Step 1: Failing tests** — append to `tests/capsules.rs` (reuse the existing `scripted_connector`/`state`/`setup` helpers; the connector helper already authenticates and takes a kind — match its current signature). Add a tabs-state helper:
```rust
fn tabs_state(urls: &[&str]) -> Value {
    json!({ "tabs": urls.iter().map(|u| json!({"url": u, "title": u})).collect::<Vec<_>>() })
}

#[tokio::test]
async fn save_capsule_captures_chrome_tabs() {
    let (hub, db, capsules, task_id, _dir) = setup().await;
    let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
    // Scripted chrome-kind connector answering workspace.state with tabs.
    let _c = scripted_connector_kind(&hub, "chrome", "chrome", tx, |name, _| match name {
        "workspace.state" => tabs_state(&["https://a.test", "https://b.test"]),
        _ => json!({}),
    })
    .await;
    tokio::time::sleep(std::time::Duration::from_millis(120)).await;

    let summary = capsules.save_capsule(&task_id).await.unwrap();
    assert!(summary.captured.contains(&"chrome".to_string()), "got {summary:?}");
    let rows = db.task_resources(&task_id).unwrap();
    let chrome = rows.iter().find(|r| r.connector_kind == "chrome").unwrap();
    assert_eq!(chrome.payload["tabs"][0]["url"], "https://a.test");
}

#[tokio::test]
async fn activate_opens_chrome_tabs_additively() {
    let (hub, db, capsules, task_id, _dir) = setup().await;
    db.replace_task_resources(&task_id, "chrome", "workspace", &tabs_state(&["https://x.test", "https://y.test"]))
        .unwrap();
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
    let _c = scripted_connector_kind(&hub, "chrome", "chrome", tx, |_, _| json!({})).await;
    tokio::time::sleep(std::time::Duration::from_millis(120)).await;

    let summary = capsules.activate_task(&task_id).await.unwrap();
    assert!(summary.applied.contains(&"chrome".to_string()), "got {summary:?}");
    assert!(summary.pending.is_empty(), "chrome restore is not deferred");

    let mut opened = vec![];
    while let Ok((name, args)) = rx.try_recv() {
        if name == "tabs.open" {
            opened.push(args["url"].as_str().unwrap().to_string());
        }
    }
    assert!(opened.contains(&"https://x.test".to_string()), "got {opened:?}");
    assert!(opened.contains(&"https://y.test".to_string()), "got {opened:?}");
}

#[tokio::test]
async fn activate_chrome_without_browser_is_skipped() {
    let (_hub, db, capsules, task_id, _dir) = setup().await;
    db.replace_task_resources(&task_id, "chrome", "workspace", &tabs_state(&["https://z.test"]))
        .unwrap();
    let summary = capsules.activate_task(&task_id).await.unwrap();
    assert!(summary.skipped.contains(&"chrome".to_string()), "got {summary:?}");
}
```
NOTE: if the current helper is named `scripted_connector` and takes `(&hub, kind, name, tx, respond)` or `(&hub, name, kind, tx, respond)`, use that exact form and drop the `_kind` suffix — match what Task-8/9/10a left in the file. The three arguments needed are: hub (for the secret), the connector's `name` and `kind` (both `"chrome"` here), the seen-channel, and the responder.

- [ ] **Step 2: RED** — `cargo test -p omnibus-desktop --test capsules` → chrome not captured/restored.

- [ ] **Step 3: Implement in `capsules.rs`**

1. `const CAPTURABLE: &[&str] = &["vscode", "fake", "chrome"];`
2. In `activate_task`'s connector loop, add a `"chrome"` arm alongside `"vscode"`/`"fake"`:
```rust
                "chrome" => {
                    self.restore_chrome(conn, &r.payload, &mut errors).await;
                    applied.push("chrome".to_string());
                }
```
(placement: same match that currently dispatches vscode/fake; chrome never defers, so it always pushes `applied` unless the connector is absent — absence is already handled by the earlier `find(...)` → `skipped` guard.)
3. New method:
```rust
    /// Restores browser tabs additively: opens each captured url. Non-
    /// destructive (never closes the user's current tabs), so — unlike
    /// vscode's workspace.open — there is no window reload and no pending
    /// continuation. Individual failures are collected, never fatal.
    async fn restore_chrome(&self, conn: &ConnectorInfo, payload: &Value, errors: &mut Vec<String>) {
        let urls: Vec<String> = payload["tabs"]
            .as_array()
            .map(|a| a.iter().filter_map(|t| t["url"].as_str().map(String::from)).collect())
            .unwrap_or_default();
        for url in urls {
            if let Err(e) =
                self.hub.send_command(&conn.id, "tabs.open", json!({ "url": url })).await
            {
                errors.push(format!("tabs.open {url}: {e}"));
            }
        }
    }
```

- [ ] **Step 4: GREEN** — `cargo test -p omnibus-desktop` green (capsules +3), zero warnings; run capsules 2x. Full `cargo test` green.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: capsules capture and restore chrome tabs additively"`

---

### Task 3: Chrome connector scaffold + pure `tabs.ts`

**Files:**
- Create: `connectors/chrome/{package.json, tsconfig.json, esbuild.mjs, README.md, manifest.json, src/tabs.ts}`
- Test: `connectors/chrome/test/tabs.test.ts`

**Interfaces:** `tabs.ts` exports `RawTab { url, title, incognito }`, `Tab { url, title }`, `TabsState { tabs: Tab[] }`, `snapshotTabs(raw: RawTab[]) -> TabsState`, `isRestorableUrl(url) -> boolean`.

- [ ] **Step 1: Scaffold + failing tests**

`connectors/chrome/package.json`:
```json
{
  "name": "omnibus-chrome",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node esbuild.mjs",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": { "@omnibus/protocol": "workspace:*" },
  "devDependencies": {
    "@types/chrome": "^0.0.270",
    "@types/node": "^22.0.0",
    "esbuild": "^0.24.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

`connectors/chrome/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "types": ["chrome"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src", "test"]
}
```

`connectors/chrome/esbuild.mjs`:
```js
// Bundles the extension's two entry points; @omnibus/protocol is inlined.
import { build } from "esbuild";

for (const entry of ["background", "popup"]) {
  await build({
    entryPoints: [`src/${entry}.ts`],
    outfile: `dist/${entry}.js`,
    bundle: true,
    format: "esm",
    target: "chrome116",
    sourcemap: true,
  });
}
```

`connectors/chrome/manifest.json`:
```json
{
  "manifest_version": 3,
  "name": "OmniBus Connector",
  "version": "0.1.0",
  "description": "Connects this browser's tabs to the local OmniBus hub.",
  "permissions": ["tabs", "storage"],
  "background": { "service_worker": "dist/background.js", "type": "module" },
  "action": { "default_popup": "popup.html" }
}
```
(No `host_permissions`, no `content_scripts` — the privacy ceiling is visible here.)

`connectors/chrome/README.md`: what it is (the browser connector; pairs via 10a, stores its token in `chrome.storage.local`); how to build (`pnpm --filter omnibus-chrome build`); how to load (`open -a "Google Chrome" --args --load-extension=$PWD/connectors/chrome`); privacy note (only http/https tab URLs + titles, never page content, no incognito); tests (`pnpm --filter omnibus-chrome test`).

`connectors/chrome/test/tabs.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { isRestorableUrl, snapshotTabs } from "../src/tabs";

const tab = (url: string, incognito = false, title = url) => ({ url, title, incognito });

describe("snapshotTabs", () => {
  it("keeps only http/https non-incognito tabs, deduped", () => {
    const state = snapshotTabs([
      tab("https://a.test"),
      tab("chrome://settings"),
      tab("http://b.test"),
      tab("https://a.test"), // dup
      tab("file:///etc/hosts"),
      tab("https://secret.test", true), // incognito
      tab("chrome-extension://x/popup.html"),
    ]);
    expect(state.tabs.map((t) => t.url)).toEqual(["https://a.test", "http://b.test"]);
  });

  it("carries titles and handles empty", () => {
    expect(snapshotTabs([]).tabs).toEqual([]);
    expect(snapshotTabs([tab("https://x.test", false, "X")]).tabs).toEqual([
      { url: "https://x.test", title: "X" },
    ]);
  });
});

describe("isRestorableUrl", () => {
  it("accepts http/https only", () => {
    expect(isRestorableUrl("https://x.test")).toBe(true);
    expect(isRestorableUrl("http://x.test")).toBe(true);
    expect(isRestorableUrl("chrome://x")).toBe(false);
    expect(isRestorableUrl("file:///x")).toBe(false);
    expect(isRestorableUrl("javascript:alert(1)")).toBe(false);
  });
});
```

- [ ] **Step 2: RED** — `pnpm install && pnpm --filter omnibus-chrome test` → cannot resolve `../src/tabs`.

- [ ] **Step 3: Implement `connectors/chrome/src/tabs.ts`**
```ts
/** A browser tab reduced to the fields capture needs (matches chrome.tabs.Tab). */
export interface RawTab {
  url: string;
  title: string;
  incognito: boolean;
}

/** A captured tab on the wire. */
export interface Tab {
  url: string;
  title: string;
}

/** The `workspace.state` reply shape for the chrome connector. */
export interface TabsState {
  tabs: Tab[];
}

const HTTP = /^https?:\/\//i;

/** Only http/https URLs are ever captured or restored (privacy: no chrome://,
 * file://, extension pages, or javascript: URLs). */
export function isRestorableUrl(url: string): boolean {
  return HTTP.test(url);
}

/** Maps raw tabs to the wire state: http/https and non-incognito only,
 * deduped by url in first-seen order. Never touches page content. */
export function snapshotTabs(raw: RawTab[]): TabsState {
  const seen = new Set<string>();
  const tabs: Tab[] = [];
  for (const t of raw) {
    if (t.incognito || !isRestorableUrl(t.url) || seen.has(t.url)) continue;
    seen.add(t.url);
    tabs.push({ url: t.url, title: t.title });
  }
  return { tabs };
}
```

- [ ] **Step 4: GREEN** — `pnpm --filter omnibus-chrome test` (4 tests) + `pnpm --filter omnibus-chrome typecheck` clean. Workspace `pnpm test` green.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: chrome connector scaffold with pure, tested tabs module"`

---

### Task 4: `connection.ts` transport state machine

**Files:**
- Create: `connectors/chrome/src/connection.ts`
- Test: `connectors/chrome/test/connection.test.ts`

**Interfaces:** `SocketLike`, `TokenStore`, `ConnectionOptions`, `Connection` with `start()`; the token lifecycle (pair → persist → hello{token} → auth_failed-clears-and-repairs) is the security-critical surface.

- [ ] **Step 1: Failing tests** — `connectors/chrome/test/connection.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Connection, type SocketLike, type TokenStore } from "../src/connection";

/** A fake socket the test drives directly. */
class FakeSocket implements SocketLike {
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((data: string) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.onclose?.();
  }
  // test helpers
  open() {
    this.onopen?.();
  }
  deliver(frame: object) {
    this.onmessage?.(JSON.stringify(frame));
  }
  lastKind() {
    return JSON.parse(this.sent[this.sent.length - 1]).kind;
  }
  lastPayload() {
    return JSON.parse(this.sent[this.sent.length - 1]).payload;
  }
}

class MemStore implements TokenStore {
  constructor(public value: string | null = null) {}
  async get() {
    return this.value;
  }
  async set(v: string) {
    this.value = v;
  }
  async remove() {
    this.value = null;
  }
}

function connectionWith(store: TokenStore) {
  const sockets: FakeSocket[] = [];
  const conn = new Connection({
    name: "chrome",
    kind: "chrome",
    capabilities: ["tabs"],
    port: 17872,
    makeSocket: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    store,
    onCommand: (name, args) => ({ echoed: { name, args } }),
  });
  return { conn, sockets };
}

describe("Connection token lifecycle", () => {
  beforeEach(() => vi.useRealTimers());

  it("first run pairs, persists the token, then hellos with it", async () => {
    const store = new MemStore(null);
    const { conn, sockets } = connectionWith(store);
    conn.start();
    sockets[0].open();
    expect(sockets[0].lastKind()).toBe("pair");

    sockets[0].deliver({ v: 1, id: "p", kind: "paired", payload: { token: "tok-1" } });
    await vi.waitFor(() => expect(store.value).toBe("tok-1"));
    // reconnect (new socket) hellos with the stored token
    await vi.waitFor(() => expect(sockets.length).toBe(2));
    sockets[1].open();
    expect(sockets[1].lastKind()).toBe("hello");
    expect(sockets[1].lastPayload().token).toBe("tok-1");
  });

  it("with a stored token, hellos immediately (no pair)", () => {
    const { conn, sockets } = connectionWith(new MemStore("tok-existing"));
    conn.start();
    sockets[0].open();
    expect(sockets[0].lastKind()).toBe("hello");
    expect(sockets[0].lastPayload().token).toBe("tok-existing");
  });

  it("auth_failed clears the token and falls back to pairing", async () => {
    const store = new MemStore("stale");
    const { conn, sockets } = connectionWith(store);
    conn.start();
    sockets[0].open();
    expect(sockets[0].lastKind()).toBe("hello");
    sockets[0].deliver({ v: 1, id: "e", kind: "error", payload: { code: "auth_failed", message: "no" } });
    await vi.waitFor(() => expect(store.value).toBeNull());
    await vi.waitFor(() => expect(sockets.length).toBe(2));
    sockets[1].open();
    expect(sockets[1].lastKind()).toBe("pair");
  });

  it("answers ping with pong and dispatches commands", async () => {
    const { conn, sockets } = connectionWith(new MemStore("t"));
    conn.start();
    sockets[0].open();
    sockets[0].deliver({ v: 1, id: "w", kind: "welcome", payload: { connectorId: "c1" } });
    sockets[0].deliver({ v: 1, id: "pi", kind: "ping", payload: {} });
    expect(sockets[0].lastKind()).toBe("pong");
    sockets[0].deliver({
      v: 1,
      id: "cmd1",
      kind: "command",
      payload: { target: "c1", name: "tabs.open", args: { url: "https://x.test" } },
    });
    await vi.waitFor(() => expect(sockets[0].lastKind()).toBe("response"));
    const resp = sockets[0].lastPayload();
    expect(resp.requestId).toBe("cmd1");
    expect(resp.ok).toBe(true);
    expect(resp.result).toEqual({ echoed: { name: "tabs.open", args: { url: "https://x.test" } } });
  });
});
```

- [ ] **Step 2: RED** — `pnpm --filter omnibus-chrome test` → cannot resolve `../src/connection`.

- [ ] **Step 3: Implement `connectors/chrome/src/connection.ts`**
```ts
import { Envelope, PROTOCOL_VERSION } from "@omnibus/protocol";

/** The subset of WebSocket the connection uses; injectable for tests. */
export interface SocketLike {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((data: string) => void) | null;
  onclose: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
}

/** Persistent token storage (chrome.storage.local in the browser). */
export interface TokenStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  remove(): Promise<void>;
}

export interface ConnectionOptions {
  name: string;
  kind: "chrome";
  capabilities: string[];
  port: number;
  makeSocket: (url: string) => SocketLike;
  store: TokenStore;
  onCommand: (name: string, args: unknown) => unknown | Promise<unknown>;
  onStatus?: (s: "connecting" | "pairing" | "connected" | "denied") => void;
}

const INITIAL_BACKOFF = 1_000;
const MAX_BACKOFF = 30_000;
let uid = 0;

/**
 * Browser-side transport for the OmniBus protocol. Discovers the hub at a
 * fixed port, pairs on first run (token persisted), and thereafter
 * authenticates with the stored token. Diverges from the Node SDK on one
 * point: `auth_failed` clears the stored token and re-pairs (a browser can't
 * re-read a secret), rate-limited by the reconnect backoff.
 */
export class Connection {
  private ws: SocketLike | null = null;
  private token: string | null = null;
  private closed = false;
  private backoff = INITIAL_BACKOFF;

  constructor(private opts: ConnectionOptions) {}

  /** Begins connecting and keeps reconnecting until `close()`. */
  start(): void {
    void this.dial();
  }

  /** Permanently stops (no reconnect). */
  close(): void {
    this.closed = true;
    this.ws?.close();
  }

  private send(kind: string, payload: unknown): void {
    this.ws?.send(JSON.stringify({ v: PROTOCOL_VERSION, id: `m${uid++}`, kind, payload }));
  }

  private async dial(): Promise<void> {
    this.token = await this.opts.store.get();
    const ws = this.opts.makeSocket(`ws://127.0.0.1:${this.opts.port}`);
    this.ws = ws;
    ws.onopen = () => {
      if (this.token) {
        this.opts.onStatus?.("connecting");
        this.send("hello", {
          name: this.opts.name,
          kind: this.opts.kind,
          protocolVersion: PROTOCOL_VERSION,
          capabilities: this.opts.capabilities,
          token: this.token,
        });
      } else {
        this.opts.onStatus?.("pairing");
        this.send("pair", { name: this.opts.name, kind: this.opts.kind });
      }
    };
    ws.onmessage = (data) => void this.onFrame(data);
    ws.onclose = () => this.scheduleRedial();
    ws.onerror = () => {
      /* a close follows; redial happens there */
    };
  }

  private async onFrame(data: string): Promise<void> {
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }
    const parsed = Envelope.safeParse(json);
    if (!parsed.success) return;
    const env = parsed.data;
    switch (env.kind) {
      case "welcome":
        this.backoff = INITIAL_BACKOFF;
        this.opts.onStatus?.("connected");
        break;
      case "paired":
        // First-run pairing approved: persist the token and reconnect to
        // authenticate with it (the parked pairing connection is now closed
        // by the hub).
        await this.opts.store.set(env.payload.token);
        this.token = env.payload.token;
        this.ws?.close();
        break;
      case "ping":
        this.send("pong", {});
        break;
      case "command": {
        let payload: unknown;
        try {
          payload = {
            requestId: env.id,
            ok: true,
            result: await this.opts.onCommand(env.payload.name, env.payload.args),
          };
        } catch (e) {
          payload = { requestId: env.id, ok: false, error: String(e) };
        }
        this.send("response", payload);
        break;
      }
      case "error":
        if (env.payload.code === "auth_failed") {
          // Stored token no longer valid (e.g. hub db reset): drop it and
          // re-pair. Backoff rate-limits any pathological loop.
          await this.opts.store.remove();
          this.token = null;
          this.ws?.close();
        } else if (env.payload.code === "pairing_denied" || env.payload.code === "pairing_timeout") {
          this.opts.onStatus?.("denied");
          this.ws?.close();
        }
        break;
    }
  }

  private scheduleRedial(): void {
    if (this.closed) return;
    setTimeout(() => void this.dial(), this.backoff);
    this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF);
  }
}
```
Notes for the implementer: the `paired`/`auth_failed` paths call `this.ws?.close()`, which fires `onclose` → `scheduleRedial` → `dial()` re-reads the (now updated) token. The tests drive `FakeSocket.close()` synchronously, so redial is scheduled via `setTimeout(…, backoff)`; the tests use `vi.waitFor` (real timers) to await the next socket. Keep `backoff` reset only on `welcome`.

- [ ] **Step 4: GREEN** — `pnpm --filter omnibus-chrome test` (all pass) + typecheck clean; workspace `pnpm test` green.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: chrome connector transport state machine with injected-socket tests"`

---

### Task 5: Service worker glue, popup, bundle

**Files:**
- Create: `connectors/chrome/src/background.ts`, `connectors/chrome/src/popup.ts`, `connectors/chrome/popup.html`
- Modify: root `.gitignore` (ensure `connectors/chrome/dist/` ignored — the generic `dist/` rule already covers it; verify)

**Interfaces:** consumes `tabs.ts` + `connection.ts` + the `chrome` API; produces `dist/background.js`, `dist/popup.js`.

- [ ] **Step 1: `src/background.ts`**
```ts
import { Connection } from "./connection";
import { isRestorableUrl, snapshotTabs, type RawTab } from "./tabs";

const DEFAULT_PORT = 17872;

/** chrome.storage.local-backed token store. */
const store = {
  async get() {
    return (await chrome.storage.local.get("omnibusToken")).omnibusToken ?? null;
  },
  async set(token: string) {
    await chrome.storage.local.set({ omnibusToken: token });
  },
  async remove() {
    await chrome.storage.local.remove("omnibusToken");
  },
};

async function readTabs(): Promise<RawTab[]> {
  const tabs = await chrome.tabs.query({});
  return tabs.map((t) => ({
    url: t.url ?? "",
    title: t.title ?? "",
    incognito: t.incognito ?? false,
  }));
}

let connection: Connection | undefined;

async function connect(port: number) {
  connection?.close();
  connection = new Connection({
    name: "chrome",
    kind: "chrome",
    capabilities: ["tabs"],
    port,
    makeSocket: (url) => new WebSocket(url) as unknown as import("./connection").SocketLike,
    store,
    onCommand: async (name, args) => {
      if (name === "workspace.state") return snapshotTabs(await readTabs());
      if (name === "tabs.open") {
        const { url } = args as { url: string };
        if (!isRestorableUrl(url)) throw new Error(`refusing non-http(s) url: ${url}`);
        await chrome.tabs.create({ url });
        return { opened: url };
      }
      if (name === "tabs.focus") {
        const { url } = args as { url: string };
        const [existing] = await chrome.tabs.query({ url });
        if (existing?.id != null) {
          await chrome.tabs.update(existing.id, { active: true });
          return { focused: url };
        }
        await chrome.tabs.create({ url });
        return { opened: url };
      }
      throw new Error(`no handler for ${name}`);
    },
  });
  connection.start();
}

// Emit tab lifecycle events (http/https only).
chrome.tabs.onCreated.addListener((t) => {
  if (t.url && isRestorableUrl(t.url)) emit("tab.opened", { url: t.url });
});
chrome.tabs.onRemoved.addListener(() => {
  /* url unknown at removal without extra bookkeeping; opened covers the log */
});
function emit(name: string, data: unknown) {
  // Connection has no public emit in the MVP surface; wire through if added.
  void name;
  void data;
}

chrome.storage.local.get("omnibusPort").then(({ omnibusPort }) => connect(omnibusPort ?? DEFAULT_PORT));
```
NOTE: the `emit` stub is intentional — the MVP proves capture/restore + lifecycle log via the hub, and the plan's success criteria for events are covered by the connector emitting on `onCreated`. If wiring an `emit` through `Connection` is trivial (add a public `emit(name, data)` that sends an `event` frame when connected), do so and replace the stub; otherwise leave events to a follow-up and note it. Prefer adding the one-line `emit` to `Connection` (send `"event"` frame) so `tab.opened` reaches the activity log per criterion 4.

- [ ] **Step 2: `popup.html` + `src/popup.ts`** — minimal status + port override:

`popup.html`:
```html
<!doctype html>
<html>
  <body style="width: 240px; font: 13px system-ui; padding: 8px">
    <div id="status">…</div>
    <input id="port" type="number" placeholder="hub port (default 17872)" style="width: 100%; margin-top: 6px" />
    <button id="save" style="margin-top: 6px">save port &amp; reconnect</button>
    <button id="repair" style="margin-top: 6px">re-pair</button>
    <script type="module" src="dist/popup.js"></script>
  </body>
</html>
```

`src/popup.ts`:
```ts
const status = document.getElementById("status")!;
const portInput = document.getElementById("port") as HTMLInputElement;

chrome.storage.local.get(["omnibusPort", "omnibusToken"]).then(({ omnibusPort, omnibusToken }) => {
  status.textContent = omnibusToken ? "paired" : "not paired";
  if (omnibusPort) portInput.value = String(omnibusPort);
});

document.getElementById("save")!.addEventListener("click", async () => {
  const port = Number(portInput.value) || 17872;
  await chrome.storage.local.set({ omnibusPort: port });
  chrome.runtime.reload();
});
document.getElementById("repair")!.addEventListener("click", async () => {
  await chrome.storage.local.remove("omnibusToken");
  chrome.runtime.reload();
});
```

- [ ] **Step 3: Bundle + verify** — `pnpm --filter omnibus-chrome build` → `dist/background.js` + `dist/popup.js`; `pnpm --filter omnibus-chrome typecheck` clean; grep the bundle for Node builtins (`grep -c "require(\"ws\")\|require(\"fs\")" connectors/chrome/dist/background.js` = 0). Confirm `connectors/chrome/dist/` is git-ignored. Full `pnpm test` + `cargo test` green.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: chrome service worker, popup, and bundle"`

---

### Task 6: Walkthrough + docs (controller-run)

- [ ] Full sweep. Live: `pnpm --filter desktop tauri dev`; `pnpm --filter omnibus-chrome build`; `open -a "Google Chrome" --args --load-extension="$PWD/connectors/chrome"`; pairing banner appears in OmniBus → approve → chrome connector green; open a couple tabs; save a task → `chrome: N tabs`; screenshot. The orchestration rests on the Rust integration tests.
- [ ] Docs: README "Try it" chrome step; spec Status → Implemented. Commit: `docs: chrome connector walkthrough; phase 10b success criteria verified`.

---

## Self-review notes

- Coverage: preferred port + fallback (T1), chrome capsule capture/restore/skipped (T2), pure tabs filter incl. incognito+scheme (T3), token lifecycle incl. auth_failed-repair + command/ping (T4), glue+manifest+bundle (T5), walkthrough (T6). Privacy: filtering in the pure module + manifest with no host permissions/content scripts.
- Cross-task: `chrome` kind string consistent (T2 CAPTURABLE / restore, T3 manifest, T4 hello); `workspace.state`→`{tabs}` shape shared by T2 tests, T5 handler, capsule restore reading `payload["tabs"]`; port 17872 in T1 desktop + T4/T5 default.
- Deliberate SDK divergence (auth_failed → re-pair, not fatal) is browser-specific and documented + tested (T4).
- T5 is glue verified by build + live walkthrough (no unit tests), consistent with phase 7's `extension.ts`. The `emit` wire-through is called out as a small addition to `Connection` so criterion 4 (tab events in the log) holds.
