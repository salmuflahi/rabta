# OmniBus — Hub Authentication (Phase 10a)

**Date:** 2026-07-19
**Status:** Implemented
**Scope:** Mandatory hub authentication: per-run shared secret via `hub.json` (0600), persistent per-connector tokens via a user-approved pairing flow, origin policy, SDK + desktop + UI wiring.
**Out of scope:** the Chrome connector itself (phase 10b), TLS (localhost only), token rotation/expiry, multi-user.

This closes the foundation spec's standing deferral: *"authentication must land before the Chrome connector phase"*. The reserved `connectors.token` column gets its reader.

---

## Goal

**What:** every hub connection authenticates or is refused. Local processes that can read the user's app-data dir authenticate invisibly (shared secret in `hub.json`); anything that can't read files — i.e. a browser — must be explicitly paired by the user once, receiving a persistent token. A random webpage can no longer even register.

```
  Threat: any webpage can open ws://127.0.0.1:<port>

  native connector ──► reads hub.json (0600) ──► hello{secret} ──► accepted
  browser ext ──────► can't read files ─────► hello{token}  ──► accepted (if paired)
                                        └───► pair{name,kind} ──► USER APPROVES ──► paired{token}
  webpage ──────────► http(s) Origin ────────────────────────────► rejected at handshake
                      no secret, no token, no approved pairing ──► auth_failed
```

### Success criteria

1. A hello with neither valid secret nor valid token → `error: auth_failed`, connection closed, connector never registered (test-enforced).
2. Existing connectors (fake, vscode extension, SDK tests) keep working with **zero code changes in the connectors themselves** — the SDK reads the secret from `hub.json` automatically.
3. `hub.json` is written mode **0600** and now contains `{ port, secret }`; the secret is fresh per hub start.
4. Pairing end-to-end: a connector sends `pair{name,kind}` → the app shows an approve/deny banner → approve issues a token (persisted in `connectors.token`, live in the hub immediately) → the connector re-hellos with the token and is accepted; deny closes with `pairing_denied`. Tokens survive app restarts (loaded from the db at startup).
5. Origin policy: `http`/`https` origins rejected at the WebSocket handshake; absent origin and `chrome-extension://` origins may proceed to auth/pairing (test-enforced).
6. `auth_failed` is fatal in the SDK (clear message, no retry loop), like `version_mismatch`.
7. All suites green/warning-free; every existing raw-WebSocket test updated to authenticate.

## Non-goals

- No Chrome extension (10b). No token expiry/rotation (revocation = clearing the column; a management UI can come later). No TLS. No per-capability permissions (enforcement still deferred). No change to command routing, capsules, or persistence semantics.

## Key decision: two credential classes, one gate

**What:** hello gains optional `secret` and `token` fields; the hub accepts a connection iff `secret == hub_secret` **or** `token == tokens[(name, kind)]`. Everything else: `auth_failed`.

**Why:** the filesystem *is* the trust boundary for local processes — if a process can read the user's app-data dir, it can already do worse than talk to the hub; a per-run secret there costs zero UX and stops every browser. Tokens exist solely for the one client class that can't read files, and their issuance is exactly the moment to put a human in the loop (trust surface: the pairing banner).

**Why not tokens for everyone:** pairing ceremonies for the fake connector and editor extension would add friction to every dev loop for no additional protection.

## Key decision: the hub stays db-free

`HubConfig` gains `secret: String` and `tokens: Arc<RwLock<HashMap<String, String>>>` (key `"{name}/{kind}"`). The desktop app loads the map from `connectors.token` at startup and writes through on pairing approval (new `Db::set_connector_token` / `Db::connector_tokens`). The hub validates against the live map — approvals take effect without restart; the hub never touches storage.

## Protocol additions (v stays 1 — additive, all first-party clients)

- `hello` payload: `+ secret?: string`, `+ token?: string`.
- New kinds: `pair` → `{ name, kind }` (sent as the first frame instead of hello); `paired` → `{ token }`.
- New error codes: `auth_failed`, `pairing_denied`, `pairing_timeout`.
- Fixtures updated on both sides (hello with secret; hello with token; pair; paired).

## Pairing flow

1. Connector (no credentials) sends `pair { name, kind }` as its first frame.
2. Hub parks the connection (timeout 120 s → `pairing_timeout`), emits `HubEvent::PairingRequested { pairing_id, name, kind }`.
3. UI banner (app-wide, top of window): "*{name}* ({kind}) wants to connect — approve / deny".
4. Approve → desktop generates a token (uuid), persists it (`set_connector_token`, upserting the connector row), inserts into the live map, calls `hub.resolve_pairing(pairing_id, Some(token))` → hub sends `paired { token }` and closes; the connector reconnects with `hello { token }`.
   Deny → `resolve_pairing(id, None)` → `error: pairing_denied`, closed.
5. One pending pairing per connection; duplicate `pair` frames are `bad_message`.

Hub surface additions: `HubEvent::PairingRequested`, `hub.resolve_pairing(pairing_id, Option<token>)`, plus `pending_pairings()` for UI reload.

## Origin policy (replaces the blanket Origin rejection)

| Origin header | Result |
|---|---|
| absent | proceed to auth (native processes) |
| `chrome-extension://…` (and `moz-extension://`) | proceed to auth/pairing |
| `http://` / `https://` / anything else | rejected at handshake (403) |

## SDK changes

`connect()` reads `secret` from `hub.json` and includes it in hello automatically (opts may override with an explicit `token` for future browser-class reuse). `auth_failed` joins `version_mismatch` as fatal: clear error, `closed = true`, no redial.

## What gets stored (privacy/security)

`connectors.token` per paired connector (a random uuid — no user data). `hub.json` holds the per-run secret at mode 0600. Pairing events carry name/kind only.

## Error handling

| Failure | Behavior |
|---|---|
| Wrong/missing credentials | `auth_failed`, close, never registered |
| Pairing denied | `pairing_denied`, close |
| Pairing unanswered 120 s | `pairing_timeout`, close |
| App restart | New secret in fresh `hub.json` (SDK re-reads per dial); tokens reloaded from db |
| Token cleared in db but present in live map | Live map is authoritative until restart (revocation UI is future work; document it) |
| Duplicate `pair` frame / `pair` after hello | `bad_message` strikes |

## Testing

- **Hub:** no-credential rejection; wrong secret; valid secret; valid token; wrong token; pairing approve → token works on re-hello; deny; timeout (shortened in tests); origin matrix (absent / chrome-extension / https); duplicate pair.
- **Protocol fixtures:** new/updated fixtures round-trip both sides.
- **SDK:** secret auto-read (integration vs headless hub now generating a secret); auth_failed fatality (unit, mocked hub.json + scripted server).
- **Existing suites:** every raw-hello test site updated to read the secret from its temp `hub.json`; capsule/recorder/headless flows keep passing.
- **UI:** banner walkthrough (approve path exercised by 10b's real extension; here via a scripted pair request).

## Build order

1. Protocol additions + fixtures (TS + Rust).
2. Hub: auth gate, origin policy, pairing surface + all hub-test updates.
3. SDK secret support + fatal auth_failed; db token methods.
4. Desktop wiring (token map load, approve/deny commands, banner) + remaining test updates.
5. Sweep + walkthrough + docs.
