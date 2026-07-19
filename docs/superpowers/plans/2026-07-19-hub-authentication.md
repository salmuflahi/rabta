# Hub Authentication (Phase 10a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mandatory hub auth: per-run shared secret in `hub.json` (0600), persistent per-connector tokens via user-approved pairing, origin policy; SDK authenticates transparently; existing connectors unchanged.

**Architecture:** Hub generates the secret and validates against it plus a caller-provided live token map (`Arc<RwLock<HashMap<"name/kind", token>>>`) — hub stays db-free. Desktop loads/persists tokens (`connectors.token`), exposes pairing commands, renders an approve/deny banner. Protocol gains optional hello credentials + `pair`/`paired` kinds.

**Spec:** `docs/superpowers/specs/2026-07-19-omnibus-hub-authentication-design.md`.

## Global Constraints

- Auth rule at hello, exactly: accept iff `hello.secret == hub_secret` OR `hello.token == tokens["{name}/{kind}"]`; else `error: auth_failed` + close, never registered.
- Origin policy: absent → allow; `chrome-extension://`/`moz-extension://` prefix → allow; anything else → reject at handshake.
- `hub.json` = `{ "port": u16, "secret": String }`, mode 0600, secret fresh per `Hub::start`.
- Pairing: first-frame `pair{name,kind}` only; one per connection; park with configurable timeout (default 120 s, `HubConfig.pairing_timeout`); approve → `paired{token}` then close; deny → `pairing_denied`; timeout → `pairing_timeout`.
- SDK: secret auto-read per dial; `auth_failed` fatal (no redial), message mentions re-pairing/restart.
- Protocol `v` stays 1; additions are optional fields + new kinds; fixtures updated BOTH sides (12 fixtures total).
- Every existing raw-hello test site authenticates via `hub.secret()` (new getter). No connector source changes (fake, vscode extension untouched).
- Environment: cargo NOT on default PATH (`export PATH="$HOME/.cargo/bin:$PATH"`); generous timeouts; nothing under `.superpowers/` committed. Warning-free; docs on public items.

---

### Task 1: Protocol additions + fixtures (both sides)

**Files:**
- Modify: `packages/protocol/src/index.ts`, `crates/omnibus-hub/src/protocol.rs`
- Create: `packages/protocol/fixtures/{hello-secret.json, hello-token.json, pair.json, paired.json}`
- Modify tests: `crates/omnibus-hub/tests/fixtures.rs` (count 8 → 12)

**Interfaces:** `HelloPayload += secret?: string, token?: string`; new kinds `pair{name, kind}` / `paired{token}`; Rust `Hello { …, secret: Option<String>, token: Option<String> }` (skip_serializing_if none, default), `Pair { name, kind: ConnectorKind }`, `Paired { token }`, `Message::{Pair, Paired}`.

- [ ] **Step 1: fixtures + failing tests**

`fixtures/hello-secret.json`:
```json
{ "v": 1, "id": "91111111-1111-1111-1111-111111111111", "kind": "hello", "payload": { "name": "fake-vscode", "kind": "fake", "protocolVersion": 1, "capabilities": ["workspace"], "secret": "s3cret" } }
```
`fixtures/hello-token.json`:
```json
{ "v": 1, "id": "92222222-2222-2222-2222-222222222222", "kind": "hello", "payload": { "name": "chrome", "kind": "chrome", "protocolVersion": 1, "capabilities": ["tabs"], "token": "tok-123" } }
```
`fixtures/pair.json`:
```json
{ "v": 1, "id": "93333333-3333-3333-3333-333333333333", "kind": "pair", "payload": { "name": "chrome", "kind": "chrome" } }
```
`fixtures/paired.json`:
```json
{ "v": 1, "id": "94444444-4444-4444-4444-444444444444", "kind": "paired", "payload": { "token": "tok-123" } }
```
Update `crates/omnibus-hub/tests/fixtures.rs` count assertion to 12 (message: "expected all 12 fixtures").

- [ ] **Step 2: RED** — `pnpm --filter @omnibus/protocol test` (unknown kind `pair`) and `cargo test -p omnibus-hub --test fixtures` both fail.

- [ ] **Step 3: implement**

TS (`packages/protocol/src/index.ts`): add to `HelloPayload`:
```ts
  secret: z.string().min(1).optional(),
  token: z.string().min(1).optional(),
```
add payloads + union entries:
```ts
export const PairPayload = z.object({ name: z.string().min(1), kind: ConnectorKind });
export const PairedPayload = z.object({ token: z.string().min(1) });
```
```ts
  z.object({ ...base, kind: z.literal("pair"), payload: PairPayload }),
  z.object({ ...base, kind: z.literal("paired"), payload: PairedPayload }),
```

Rust (`protocol.rs`): extend `Hello`:
```rust
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub secret: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
```
new structs + variants:
```rust
/// Pairing request: sent instead of `hello` by connectors with no credentials.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Pair {
    pub name: String,
    pub kind: ConnectorKind,
}

/// Pairing approval carrying the newly issued persistent token.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Paired {
    pub token: String,
}
```
`Message` gains `Pair(Pair)` and `Paired(Paired)` (lowercase tags via the existing rename_all).

- [ ] **Step 4: GREEN** — both fixture suites pass (TS 14 tests: 12 round-trips + 2 negatives; Rust 12-count). Full `pnpm test` + `cargo test` — EXPECT hub/SDK/capsule suites still green (auth not enforced yet; hello extras are optional).
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: protocol credentials and pairing kinds with fixtures"`

---

### Task 2: Hub auth gate, origin policy, pairing surface

**Files:**
- Modify: `crates/omnibus-hub/src/hub.rs`, existing hub tests (`tests/handshake.rs`, `tests/commands.rs`, `tests/events.rs`)
- Test: `crates/omnibus-hub/tests/auth.rs` (new)

**Interfaces (Tasks 3–4 + all test updates rely on):**
- `HubConfig += tokens: Arc<RwLock<HashMap<String, String>>>` (key `"{name}/{kind}"`; `HubConfig::new` defaults empty) and `pairing_timeout: Duration` (default 120 s).
- `Hub::secret(&self) -> &str` (per-start uuid; also written to `hub.json` with the port, file chmod 0600).
- `HubEvent::PairingRequested { pairing_id, name, kind }` (camelCase like the rest).
- `Hub::pending_pairings(&self) -> Vec<(String, String, String)>` (id, name, kind — async like `connectors`).
- `Hub::resolve_pairing(&self, pairing_id: &str, token: Option<String>) -> bool` (false = unknown/expired; async).

- [ ] **Step 1: failing tests** — `tests/auth.rs`:
```rust
use futures_util::{SinkExt, StreamExt};
use omnibus_hub::{Hub, HubConfig, HubEvent};
use serde_json::{json, Value};
use std::time::Duration;

async fn start() -> (Hub, tempfile::TempDir) {
    let dir = tempfile::tempdir().unwrap();
    (Hub::start(HubConfig::new(dir.path().to_path_buf())).await.unwrap(), dir)
}

async fn hello_with(port: u16, extra: Value) -> Value {
    let (mut ws, _) =
        tokio_tungstenite::connect_async(format!("ws://127.0.0.1:{port}")).await.unwrap();
    let mut payload = json!({"name":"t","kind":"fake","protocolVersion":1,"capabilities":[]});
    for (k, v) in extra.as_object().unwrap() {
        payload[k] = v.clone();
    }
    ws.send(json!({"v":1,"id":"h","kind":"hello","payload":payload}).to_string().into())
        .await
        .unwrap();
    serde_json::from_str(ws.next().await.unwrap().unwrap().to_text().unwrap()).unwrap()
}

#[tokio::test]
async fn hello_without_credentials_is_auth_failed() {
    let (hub, _d) = start().await;
    let reply = hello_with(hub.port(), json!({})).await;
    assert_eq!(reply["payload"]["code"], "auth_failed");
    assert!(hub.connectors().await.is_empty());
}

#[tokio::test]
async fn wrong_secret_rejected_correct_secret_accepted() {
    let (hub, _d) = start().await;
    let bad = hello_with(hub.port(), json!({"secret": "wrong"})).await;
    assert_eq!(bad["payload"]["code"], "auth_failed");
    let good = hello_with(hub.port(), json!({"secret": hub.secret()})).await;
    assert_eq!(good["kind"], "welcome");
}

#[tokio::test]
async fn token_auth_uses_live_map_keyed_by_name_and_kind() {
    let dir = tempfile::tempdir().unwrap();
    let cfg = HubConfig::new(dir.path().to_path_buf());
    cfg.tokens.write().unwrap().insert("t/fake".into(), "tok-1".into());
    let hub = Hub::start(cfg).await.unwrap();
    assert_eq!(hello_with(hub.port(), json!({"token": "tok-1"})).await["kind"], "welcome");
    assert_eq!(
        hello_with(hub.port(), json!({"token": "nope"})).await["payload"]["code"],
        "auth_failed"
    );
}

#[tokio::test]
async fn hub_json_has_secret_and_0600() {
    use std::os::unix::fs::PermissionsExt;
    let (hub, dir) = start().await;
    let path = dir.path().join("hub.json");
    let disco: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
    assert_eq!(disco["secret"], json!(hub.secret()));
    assert_eq!(std::fs::metadata(&path).unwrap().permissions().mode() & 0o777, 0o600);
}

#[tokio::test]
async fn pairing_approve_issues_working_token() {
    let dir = tempfile::tempdir().unwrap();
    let mut cfg = HubConfig::new(dir.path().to_path_buf());
    cfg.pairing_timeout = Duration::from_secs(5);
    let hub = Hub::start(cfg).await.unwrap();
    let mut events = hub.subscribe();

    let (mut ws, _) =
        tokio_tungstenite::connect_async(format!("ws://127.0.0.1:{}", hub.port())).await.unwrap();
    ws.send(
        json!({"v":1,"id":"p","kind":"pair","payload":{"name":"chrome","kind":"chrome"}})
            .to_string()
            .into(),
    )
    .await
    .unwrap();

    let pairing_id = loop {
        match tokio::time::timeout(Duration::from_secs(2), events.recv()).await.unwrap().unwrap() {
            HubEvent::PairingRequested { pairing_id, name, kind } => {
                assert_eq!((name.as_str(), kind.as_str()), ("chrome", "chrome"));
                break pairing_id;
            }
            _ => continue,
        }
    };
    assert_eq!(hub.pending_pairings().await.len(), 1);
    assert!(hub.resolve_pairing(&pairing_id, Some("tok-new".into())).await);

    let paired: Value =
        serde_json::from_str(ws.next().await.unwrap().unwrap().to_text().unwrap()).unwrap();
    assert_eq!(paired["kind"], "paired");
    assert_eq!(paired["payload"]["token"], "tok-new");

    // The issued token must authenticate (caller inserts into the map —
    // mirror what the desktop layer does).
    hub_insert_token(&hub, "chrome/chrome", "tok-new");
    let ok = hello_with_kind(hub.port(), "chrome", json!({"token": "tok-new"})).await;
    assert_eq!(ok["kind"], "welcome");
}

#[tokio::test]
async fn pairing_deny_and_timeout() {
    let dir = tempfile::tempdir().unwrap();
    let mut cfg = HubConfig::new(dir.path().to_path_buf());
    cfg.pairing_timeout = Duration::from_millis(300);
    let hub = Hub::start(cfg).await.unwrap();
    let mut events = hub.subscribe();

    // Deny.
    let (mut ws, _) =
        tokio_tungstenite::connect_async(format!("ws://127.0.0.1:{}", hub.port())).await.unwrap();
    ws.send(json!({"v":1,"id":"p","kind":"pair","payload":{"name":"a","kind":"chrome"}}).to_string().into())
        .await
        .unwrap();
    let id = loop {
        if let Ok(Ok(HubEvent::PairingRequested { pairing_id, .. })) =
            tokio::time::timeout(Duration::from_secs(2), events.recv()).await.map(|r| r)
        {
            break pairing_id;
        }
    };
    assert!(hub.resolve_pairing(&id, None).await);
    let denied: Value =
        serde_json::from_str(ws.next().await.unwrap().unwrap().to_text().unwrap()).unwrap();
    assert_eq!(denied["payload"]["code"], "pairing_denied");

    // Timeout.
    let (mut ws2, _) =
        tokio_tungstenite::connect_async(format!("ws://127.0.0.1:{}", hub.port())).await.unwrap();
    ws2.send(json!({"v":1,"id":"p","kind":"pair","payload":{"name":"b","kind":"chrome"}}).to_string().into())
        .await
        .unwrap();
    let timed: Value =
        serde_json::from_str(ws2.next().await.unwrap().unwrap().to_text().unwrap()).unwrap();
    assert_eq!(timed["payload"]["code"], "pairing_timeout");
    assert!(hub.pending_pairings().await.is_empty());
}

#[tokio::test]
async fn origin_policy_matrix() {
    use tokio_tungstenite::tungstenite::{client::IntoClientRequest, http::HeaderValue};
    let (hub, _d) = start().await;
    for (origin, allowed) in [
        ("chrome-extension://abcdefg", true),
        ("moz-extension://abcdefg", true),
        ("https://evil.example", false),
        ("http://localhost:5173", false),
    ] {
        let mut req =
            format!("ws://127.0.0.1:{}", hub.port()).into_client_request().unwrap();
        req.headers_mut().insert("Origin", HeaderValue::from_static(origin));
        let attempt = tokio_tungstenite::connect_async(req).await;
        assert_eq!(attempt.is_ok(), allowed, "origin {origin}");
    }
}
```
Helpers `hello_with_kind` (like `hello_with` but parameterized kind) and `hub_insert_token` (`hub.tokens_handle().write().unwrap().insert(...)` — add `Hub::tokens_handle(&self) -> Arc<RwLock<HashMap<String,String>>>` returning a clone of the config map for exactly this purpose; the desktop layer uses the same handle).

- [ ] **Step 2: RED** — compile errors (no `secret()`, `tokens`, etc.).

- [ ] **Step 3: implement in `hub.rs`**

1. `HubConfig` gains:
```rust
    /// Live token map keyed "{name}/{kind}"; shared with the embedding app,
    /// which owns persistence. The hub only reads it.
    pub tokens: Arc<RwLock<HashMap<String, String>>>,
    /// How long a parked pairing request waits for the user.
    pub pairing_timeout: Duration,
```
(`use std::sync::RwLock;` — defaults in `new()`: empty map, 120 s.)
2. `Hub::start`: `let secret = Uuid::new_v4().to_string();` → write `json!({ "port": port, "secret": secret })`; then
```rust
        let mut perms = std::fs::metadata(&path)?.permissions();
        std::os::unix::fs::PermissionsExt::set_mode(&mut perms, 0o600);
        std::fs::set_permissions(&path, perms)?;
```
store `secret` on `Hub`; add `pub fn secret(&self) -> &str` and `pub fn tokens_handle(&self)`.
3. Origin policy — replace `reject_origin`:
```rust
/// Absent origin (native processes) and browser-extension origins may
/// proceed to authentication; web origins are rejected outright.
fn origin_allowed(req: &Request) -> bool {
    match req.headers().get("origin").and_then(|v| v.to_str().ok()) {
        None => true,
        Some(o) => o.starts_with("chrome-extension://") || o.starts_with("moz-extension://"),
    }
}
```
4. Handshake: first frame match extends to `Message::Pair(p)`:
   - Hello: after version check, auth gate:
```rust
    let token_key = format!("{}/{}", hello.name, kind_tag(hello.kind));
    let authed = hello.secret.as_deref() == Some(secret.as_str())
        || hello
            .token
            .as_deref()
            .is_some_and(|t| cfg.tokens.read().unwrap().get(&token_key).map(String::as_str) == Some(t));
    if !authed {
        // error auth_failed, close, return (never registered)
    }
```
(`kind_tag` = the lowercase str for ConnectorKind — add a small pub(crate) helper or reuse serde.)
   - Pair: create `pairing_id`, `(tx, rx) = oneshot::channel::<Option<String>>()`, insert `(id → (name, kind, tx))` into `state.pairings`, emit `PairingRequested`, then:
```rust
    let outcome = tokio::time::timeout(cfg.pairing_timeout, rx).await;
    state.lock().await.pairings.remove(&pairing_id); // timeout/denial cleanup
    match outcome {
        Ok(Ok(Some(token))) => send `paired {token}`,
        Ok(Ok(None)) | Ok(Err(_)) => send error `pairing_denied`,
        Err(_) => send error `pairing_timeout`,
    }
    return; // connection closes; connector reconnects with hello{token}
```
(resolve_pairing removes the entry when firing, so the post-await remove is a no-op then.)
5. `State += pairings: HashMap<String, (String, String, oneshot::Sender<Option<String>>)>`; `pending_pairings()` snapshots id/name/kind; `resolve_pairing` removes + sends (returns false when absent).
6. `HubEvent += PairingRequested { pairing_id, name, kind }` (String fields).

- [ ] **Step 4: update existing hub tests** — every raw hello in `tests/handshake.rs`, `tests/commands.rs`, `tests/events.rs` gains `"secret": hub.secret()` in its payload (the `hello(...)`/`register(...)` helpers take the secret or the `&Hub`). The version-mismatch test keeps a valid secret (version check precedes auth? — order: version FIRST, then auth, preserving its existing expectation; document that order in a comment).
- [ ] **Step 5: GREEN** — `cargo test -p omnibus-hub` all green (fixtures 12, handshake, commands, events, auth). NOTE: downstream suites (SDK integration, capsules, recorder) now FAIL against an authed hub — expected; they're fixed in Tasks 3–4. Run `cargo test -p omnibus-hub` only for this task's gate and say so in the report.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: hub auth gate, origin policy, and pairing surface"`

---

### Task 3: SDK secret auth + fatal auth_failed; DB token methods

**Files:**
- Modify: `packages/connector-sdk/src/index.ts`, `packages/connector-sdk/test/integration.test.ts`, `packages/connector-sdk/test/close.test.ts`
- Modify: `crates/omnibus-db/src/activity.rs`, `crates/omnibus-db/tests/activity.rs`
- Modify: `crates/omnibus-db/tests/recorder.rs` (authenticate its raw client)

**Interfaces:** SDK `ConnectOptions += token?: string`; hello carries `secret` (from hub.json) or `token` (from opts, wins if set). `Db::set_connector_token(name, kind, token) -> Result<()>` (upsert preserving first_seen semantics), `Db::connector_tokens() -> Result<Vec<(String, String, String)>>` (name, kind, token — only non-null).

- [ ] **Step 1: failing tests**
- SDK: in `integration.test.ts` no changes needed logically (SDK must pick up the secret automatically — the test FAILING before implementation is the RED: run it against the rebuilt authed headless hub). In `close.test.ts`, update the mocked hub.json content to `{"port": 1, "secret": "s"}` (behavioral parity).
- DB — append to `tests/activity.rs`:
```rust
#[test]
fn connector_token_set_and_load() {
    let db = db();
    db.set_connector_token("chrome", "chrome", "tok-1").unwrap();
    assert_eq!(db.connector_tokens().unwrap(), vec![("chrome".into(), "chrome".into(), "tok-1".into())]);
    // Upsert on an existing row keeps identity, replaces token.
    db.upsert_connector("chrome", "chrome", &["tabs".into()]).unwrap();
    db.set_connector_token("chrome", "chrome", "tok-2").unwrap();
    let tokens = db.connector_tokens().unwrap();
    assert_eq!(tokens.len(), 1);
    assert_eq!(tokens[0].2, "tok-2");
    // Rows without tokens are absent.
    db.upsert_connector("vscode", "vscode", &[]).unwrap();
    assert_eq!(db.connector_tokens().unwrap().len(), 1);
}
```
- Recorder test: its raw hello adds `"secret": hub.secret()`.

- [ ] **Step 2: implement**

SDK (`src/index.ts`):
```ts
  /** Persistent token for browser-class connectors; wins over the secret. */
  token?: string;
```
in `dial()` read both fields:
```ts
      const disco = JSON.parse(readFileSync(this.hubFile(), "utf8"));
      port = disco.port;
      this.secret = typeof disco.secret === "string" ? disco.secret : undefined;
```
(`private secret: string | undefined;`) and in the hello payload:
```ts
          ...(this.opts.token ? { token: this.opts.token } : this.secret ? { secret: this.secret } : {}),
```
`handleFrame` error branch generalizes:
```ts
      case "error":
        if (env.payload.code === "version_mismatch" || env.payload.code === "auth_failed") {
          this.closed = true;
          const err = new Error(
            env.payload.code === "auth_failed"
              ? "hub rejected this connector's credentials — restart the hub or re-pair"
              : "hub requires a different protocol version — update this connector"
          );
          ...existing console.error + onFatal handling...
        }
```

DB (`activity.rs`):
```rust
    /// Stores/replaces the persistent pairing token for a connector identity,
    /// creating the row if the connector has never connected.
    pub fn set_connector_token(&self, name: &str, kind: &str, token: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let ts = now();
        conn.execute(
            "INSERT INTO connectors (id, name, kind, capabilities, token, first_seen, last_seen) \
             VALUES (?1, ?2, ?3, '[]', ?4, ?5, ?5) \
             ON CONFLICT(name, kind) DO UPDATE SET token = ?4",
            params![new_id(), name, kind, token, ts],
        )?;
        Ok(())
    }

    /// All persisted pairing tokens as (name, kind, token).
    pub fn connector_tokens(&self) -> Result<Vec<(String, String, String)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt =
            conn.prepare("SELECT name, kind, token FROM connectors WHERE token IS NOT NULL")?;
        let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }
```

- [ ] **Step 3: GREEN** — `cargo test -p omnibus-db` green; `export PATH="$HOME/.cargo/bin:$PATH" && pnpm --filter @omnibus/connector-sdk test` green against the authed hub (the auto-secret path IS the integration assertion). Full `cargo test` still red only in `omnibus-desktop` capsule tests (Task 4) — state that explicitly.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: SDK secret auth with fatal auth_failed; persisted pairing tokens in db"`

---

### Task 4: Desktop wiring + banner + remaining test updates

**Files:**
- Modify: `apps/desktop/src-tauri/src/lib.rs`, `apps/desktop/src-tauri/tests/capsules.rs`, `apps/desktop/src/App.tsx`, `apps/desktop/src/store.ts`

**Interfaces:** commands `pending_pairings{}` → `{pairingId,name,kind}[]`, `approve_pairing{pairingId}` → `Result<(),String>`, `deny_pairing{pairingId}` → `Result<(),String>` (24 total). Banner consumes `HubEvent::PairingRequested` (`type: "pairingRequested"`, camelCase fields).

- [ ] **Step 1: desktop wiring (lib.rs)**
In `setup`, before `Hub::start`:
```rust
            let mut hub_cfg = HubConfig::new(data_dir);
            for (name, kind, token) in db.connector_tokens().map_err(|e| e.to_string())? {
                hub_cfg.tokens.write().unwrap().insert(format!("{name}/{kind}"), token);
            }
```
Commands:
```rust
/// Pairing requests currently awaiting a decision.
#[tauri::command]
async fn pending_pairings(hub: State<'_, HubHandle>) -> Result<Vec<PendingPairing>, String> {
    Ok(hub
        .0
        .pending_pairings()
        .await
        .into_iter()
        .map(|(pairing_id, name, kind)| PendingPairing { pairing_id, name, kind })
        .collect())
}

/// Issues a persistent token for a pairing request and approves it.
#[tauri::command]
async fn approve_pairing(
    hub: State<'_, HubHandle>,
    db: State<'_, DbHandle>,
    pairing_id: String,
) -> Result<(), String> {
    let pending = hub.0.pending_pairings().await;
    let (_, name, kind) = pending
        .into_iter()
        .find(|(id, _, _)| *id == pairing_id)
        .ok_or("pairing expired or already resolved")?;
    let token = uuid::Uuid::new_v4().to_string();
    {
        let db = db.0.clone();
        let (n, k, t) = (name.clone(), kind.clone(), token.clone());
        tauri::async_runtime::spawn_blocking(move || db.set_connector_token(&n, &k, &t))
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())?;
    }
    hub.0.tokens_handle().write().unwrap().insert(format!("{name}/{kind}"), token.clone());
    if hub.0.resolve_pairing(&pairing_id, Some(token)).await {
        Ok(())
    } else {
        Err("pairing expired before approval".to_string())
    }
}

/// Denies a pairing request.
#[tauri::command]
async fn deny_pairing(hub: State<'_, HubHandle>, pairing_id: String) -> Result<(), String> {
    if hub.0.resolve_pairing(&pairing_id, None).await {
        Ok(())
    } else {
        Err("pairing expired or already resolved".to_string())
    }
}
```
plus `#[derive(Serialize)] #[serde(rename_all="camelCase")] struct PendingPairing { pairing_id: String, name: String, kind: String }` and `uuid` dependency (already transitive via workspace? add `uuid = { version = "1", features = ["v4"] }` to src-tauri deps). Register the three commands.

- [ ] **Step 2: capsule test updates** — `tests/capsules.rs` `scripted_connector`/`scripted_connector_kind` helpers add the secret: pass `hub.secret()` (the helpers already receive `port`; change signatures to take `&Hub` or an extra `secret: &str` and update call sites) → hello payload gains `"secret": secret`.

- [ ] **Step 3: banner UI**
`store.ts`:
```ts
export interface PendingPairing {
  pairingId: string;
  name: string;
  kind: string;
}
```
store fields: `pairings: PendingPairing[]`, `setPairings`, `addPairing` (dedupe by pairingId), `removePairing(id)`.
`App.tsx`: on mount also `invoke<PendingPairing[]>("pending_pairings").then(setPairings)`; in the hub-event listener:
```ts
      if (e.payload.type === "pairingRequested") {
        addPairing({
          pairingId: e.payload.pairingId as string,
          name: e.payload.name as string,
          kind: e.payload.kind as string,
        });
      }
```
render above the header:
```tsx
      {pairings.map((p) => (
        <div key={p.pairingId} className="flex items-center gap-3 p-2 bg-amber-950 border-b border-amber-800 text-sm">
          <span className="flex-1">
            <b>{p.name}</b> ({p.kind}) wants to connect to OmniBus
          </span>
          <button onClick={() => decide(p.pairingId, true)} className="bg-green-900 px-3 py-1">
            approve
          </button>
          <button onClick={() => decide(p.pairingId, false)} className="bg-neutral-800 px-3 py-1">
            deny
          </button>
        </div>
      ))}
```
with:
```ts
  async function decide(pairingId: string, ok: boolean) {
    try {
      await invoke(ok ? "approve_pairing" : "deny_pairing", { pairingId });
    } catch (e) {
      console.error("pairing decision failed:", e);
    }
    removePairing(pairingId);
  }
```

- [ ] **Step 4: GREEN everywhere** — full `cargo test` and `pnpm test` green, zero warnings; `pnpm --filter desktop build` green.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: pairing approvals with persisted tokens and app banner"`

---

### Task 5: Sweep + walkthrough + docs (controller-run)

- [ ] Full sweep; live: app up, scripted `pair` request via a throwaway ws client → banner screenshot; README auth note; spec Status → Implemented. Commit: `docs: hub authentication walkthrough; phase 10a success criteria verified`.

---

## Self-review notes

- Coverage: auth gate + matrix (T2 auth.rs), 0600 + secret in hub.json (T2), pairing approve/deny/timeout incl. issued-token round-trip (T2), origin matrix (T2), SDK auto-secret + fatal auth_failed (T3), token persistence + live-map load (T3/T4), banner + commands (T4), every pre-existing raw-hello site authenticated (T2 hub tests, T3 recorder, T4 capsules; SDK-based tests auto-inherit).
- Cross-task consistency: `tokens_handle` shared by tests (T2) and desktop (T4); token key format `"{name}/{kind}"` appears in T2 gate, T2 test, T4 load + approve; `PairingRequested` camelCase tag consumed by T4 banner.
- Deliberate sequencing: Tasks 2 and 3 leave downstream suites temporarily red (stated in their gates) — full green is Task 4's exit criterion. Reviewers of T2/T3 should hold them to their own crate's suites only.
