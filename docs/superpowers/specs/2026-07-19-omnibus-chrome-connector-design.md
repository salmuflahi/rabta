# OmniBus — Chrome Connector (Phase 10b)

**Date:** 2026-07-19
**Status:** Implemented
**Scope:** A Chrome (MV3) extension that pairs with the hub, stores its token, and reads/opens browser tabs; tabs join capsules; a stable browser-facing hub port.
**Out of scope:** Firefox packaging (the code is WebExtension-portable but only Chrome is tested), tab groups / pinned / muted state, scroll or form state, history, cookies, per-window layout, incognito (deliberately excluded — see privacy).

Builds on merged phases 1–10a. This is the last connector and completes the vision's eleven-phase spine (phase 11, GitHub, is integration on top, not a new connector). It is the first connector that lives in a browser sandbox — it cannot read `hub.json` and cannot run the Node SDK, so both **discovery** and **transport** are new.

---

## Goal

**What:** OmniBus can see and restore your browser tabs. Install the extension, pair it once (approve the banner from 10a), and Chrome appears as a `chrome` connector; saving a task captures its open tab URLs, activating restores them. Nothing about a page's *content* is ever read.

```
   Chrome (MV3)                              OmniBus Desktop
   ┌────────────────────────┐               ┌──────────────┐
   │ service worker         │   ws://127.   │     Hub      │
   │  connection.ts ◄───────┼──0.0.1:17872─►│ (10a auth)   │
   │   pair → [banner] →    │   hello{token}└──────┬───────┘
   │   token in chrome.     │                      │
   │   storage.local        │              capsules.rs adds
   │  tabs.ts (pure)        │              a "chrome" kind
   │  chrome.tabs API       │                      │
   └────────────────────────┘               tabs ──► task_resources
```

### Success criteria

1. Load the unpacked extension; it sends a `pair` request; the OmniBus approve banner (10a) appears; approving stores a token and the extension reconnects and shows as a `chrome` connector (green) with capability `tabs`.
2. The token persists: reload the extension (or restart Chrome) and it reconnects with `hello{token}` — no re-pairing.
3. `tabs.state` returns only normal `http`/`https` tabs from non-incognito windows — never `chrome://`, extension, `file://`, or incognito URLs (test-enforced on the pure module).
4. `tabs.open{url}` opens a tab; opening a tab (once it commits a non-incognito http/https url, detected via `chrome.tabs.onUpdated` — `onCreated`'s `pendingUrl` is not a committed url and is unreliable) emits `tab.opened`; closing a previously-tracked tab (`chrome.tabs.onRemoved`, looked up in a tabId→url map since `onRemoved` carries no url) emits `tab.closed`; both land in the activity log, and incognito tabs never trigger either event.
5. Saving a task with Chrome connected records a `chrome` capsule row (tab URLs); the task summary shows `chrome: N tabs`.
6. Activating that task opens the captured tabs (additive — never closes the user's current tabs); a `chrome`-kind capsule with no connected browser is reported skipped, editor/git restore proceed regardless.
7. The whole orchestration (capture tabs → rows, restore → `tabs.open` per url) is proven by headless integration tests against a real authed hub with a scripted `chrome`-kind connector — no browser needed.
8. All suites/builds green, warning-free; DoD holds.

## Non-goals

- No content scripts, no host permissions, no page-content access of any kind — the extension is structurally incapable of reading page contents (strongest privacy posture, and a smaller review surface).
- No incognito tabs, ever (see privacy).
- No tab groups/pinned/reorder/active-restore fidelity — MVP restores the *set* of URLs, not their arrangement.
- No SDK changes (the Node SDK can't run in a browser; the browser transport is separate) and no protocol changes (10a's surface + the existing command/event frames suffice).
- No auto-close of the user's existing tabs on restore — restore is purely additive.

---

## Key decision: a stable browser-facing hub port

**What:** the hub gains `HubConfig.preferred_port` (default `0` = OS-assigned, preserving every existing behavior and test). The desktop app sets it to **17872**; `Hub::start` binds that port if free, else falls back to an OS-assigned one. The chosen port is written to `hub.json` as always, and surfaced in the app UI.

**Why:** native connectors read `hub.json` for the port, but a browser extension cannot read files. It needs a *stable, known* port to connect to. An OS-assigned port changes every restart, which a browser can't discover.

**Why not port-scan or manual entry:** scanning localhost hits unrelated services and is slow; manual entry every restart is miserable UX. A fixed default that is stable across restarts (17872 is deterministic, so "reuse" is free) removes both problems. If 17872 is ever taken, the app UI shows the real port and the extension popup accepts an override — the rare fallback stays usable.

**Trade-off accepted:** this evolves phase 1's "OS-assigned only" choice. That's deliberate — the browser is a real client the original decision didn't serve, and "architecture follows the product." Native discovery via `hub.json` is unchanged; hub tests keep `preferred_port: 0`.

## Key decision: a browser connector, not the SDK

**What:** `connectors/chrome` is a standalone MV3 extension. It reuses `@omnibus/protocol` (pure Zod, browser-safe) for frame validation but **not** `@omnibus/connector-sdk` (which uses Node `ws` and reads `hub.json` from disk — neither exists in a browser).

**Why unavoidable:** the browser sandbox has no filesystem and no Node `ws`; the transport must be the browser's native `WebSocket`, the token store must be `chrome.storage.local`, and discovery is the fixed port above. This is genuinely new code, isolated behind the same wire protocol every other connector speaks.

**Structure (mirrors phase 7's pure/adapter split):**

- `src/tabs.ts` — **pure** functions: filter to http/https non-incognito, dedupe, map to wire shapes. Never imports `chrome`. Fully vitest-tested.
- `src/connection.ts` — the transport state machine: discovery, pairing, token persistence, `hello{token}`, ping/pong, reconnect, fatal `auth_failed`. Takes an **injected** WebSocket factory and storage, so its security-critical token flow is unit-tested with a fake socket — no browser.
- `src/background.ts` — the MV3 service worker: wires `connection.ts` to the `chrome.tabs` API and command handlers; the only untested glue.
- `src/popup.{html,ts}` — status, a "connect / re-pair" button, and the port-override field.

## Key decision: MV3 lifetime via the hub's existing ping

**What:** the WebSocket lives in the service worker. The hub already pings every 5 s (phase 4 liveness); Chrome ≥116 resets the service-worker idle timer on WebSocket activity, so the 5 s ping keeps the worker warm *while connected* — no offscreen document.

**Why:** it reuses machinery we already have and keeps the extension minimal. **Gap this doesn't cover:** the ping only helps once a socket is open — while the hub is down (no socket to keep alive), the worker can still be suspended, and nothing wakes it back up to retry. A `chrome.alarms` periodic alarm (`omnibus-reconnect`, every minute, registered at top level for MV3 restart safety) closes that gap: it wakes the worker and re-invokes `connect()` whenever the tracked connection status isn't `"connected"`. **Trade-off / fallback:** if a Chrome build lets the worker die despite WS traffic while connected, OmniBus shows Chrome disconnected until either the alarm fires or an unrelated extension event revives the worker, then `connection.ts` reconnects with its stored token. If this proves flaky in the walkthrough, the documented further hardening is an offscreen document holding the socket — noted, not built.

## Command and event surface

Declared capability: `["tabs"]`. Connector `name: "chrome"`, `kind: "chrome"`.

```
workspace.state  {}            -> { tabs: [{ url, title }] }   (capture; uniform with other kinds)
tabs.open        { url }       -> { opened: url }              (chrome.tabs.create)
tabs.focus       { url }       -> { focused: url } | { opened: url }  (existing tab or new)
```

Events: `tab.opened { url }`, `tab.closed { url }` — http/https only.

Why `workspace.state` on a browser: capsule **capture** stays uniform — the orchestrator calls `workspace.state` on every connected capturable connector and stores the reply. Chrome's reply carries `tabs` instead of `openFiles`; the name is an internal protocol detail, not user-facing. **Restore** is where kinds differ (below).

## Capsules gain a tabs dimension

- **Capture:** unchanged orchestrator loop — `workspace.state` on the connected `chrome` connector, stored as a `task_resources` row (`connector_kind: "chrome"`). `chrome` joins `CAPTURABLE`.
- **Restore (`restore_chrome`, new arm in `capsules.rs`):** read the stored `tabs`, send `tabs.open` per url. **Additive and non-destructive** — unlike vscode's `workspace.open`, opening tabs never reloads or closes anything, so there is **no cross-folder pending/continuation** — restore completes synchronously. Individual `tabs.open` failures are collected into the summary, never fatal. A `chrome` capsule with no connected browser → reported `skipped`, exactly like a disconnected editor.
- Ordering: git first (changes files on disk), then connectors (editor + chrome) — chrome slots into the existing connector loop with its own restore arm.

## What gets stored (privacy) — the load-bearing section

This is the connector the vision's Privacy Principles were written for. Concretely:

- **Only tab URLs and titles** are ever read or stored — via the `tabs` permission, which surfaces `url`/`title` without any page access.
- **No content scripts, no host permissions.** The extension cannot inject into pages or read their DOM, cookies, storage, or forms — not by policy but by construction (the manifest grants no such capability).
- **Only http/https**, non-incognito tabs. `chrome://`, extension pages, `file://`, `view-source:`, and every incognito tab are filtered out in the pure module (test-enforced). This realizes the vision's "✖ browser tabs in Incognito, off by default" exactly — here it's not even a default, it's excluded.
- **Nothing leaves the machine**; the token in `chrome.storage.local` is a random uuid, no user data.

The extension's minimal manifest (`permissions: ["tabs", "storage", "alarms"]` — `alarms` only wakes the service worker to retry the connection, it grants no page access — no `host_permissions`, no `content_scripts`) is itself the privacy guarantee — a reviewer can verify the ceiling of what it can access by reading one file.

## Error handling

| Failure | Behavior |
|---|---|
| Hub not running / wrong port | Extension retries with backoff; popup shows "disconnected"; user can set an override port |
| Never paired (no token) | Sends `pair`; waits for the banner; on `pairing_denied`/`timeout`, popup shows it, user retries |
| Token rejected (`auth_failed`, e.g. hub db reset) | Fatal per 10a; extension clears the stored token and falls back to `pair` (re-pair flow) |
| Service worker evicted | Reconnects with stored token when revived; OmniBus shows disconnected meanwhile |
| `tabs.open` on a malformed url | chrome rejects; handler replies `ok:false`; restore continues |
| Chrome capsule, no browser connected | Reported `skipped`; other kinds still restore |
| Incognito / non-http tab | Never captured (filtered in the pure module) |

## Testing

- **`tabs.ts` (vitest, no `chrome`):** http/https-only filter, incognito exclusion, dedupe, empty, wire-shape mapping.
- **`connection.ts` (vitest, injected fake socket + fake storage):** first-run pairing → token persisted → reconnect sends `hello{token}`; stored-token happy path; `auth_failed` clears token and re-pairs; reconnect backoff; ping→pong.
- **Capsule integration (Rust, real authed hub + scripted `chrome`-kind connector):** capture writes a `chrome` row from `workspace.state`; activate sends `tabs.open` per stored url; chrome-with-no-connector → skipped and other kinds proceed. (Mirrors phase 8's vscode proofs — no browser.)
- **Bundle:** `pnpm --filter omnibus-chrome build` produces `dist/` (service worker + popup), protocol inlined, no Node builtins.
- **Live walkthrough (criteria 1–2,4):** load unpacked in Chrome (`--load-extension`), pair, save/activate a task; the orchestration itself rests on the Rust integration tests.

## Build order

1. Hub `preferred_port` (fallback) + desktop sets 17872 + UI surfaces the port + tests.
2. `capsules.rs` `chrome` kind (CAPTURABLE + `restore_chrome` + dispatch) + scripted-chrome integration tests.
3. `connectors/chrome` scaffold + pure `tabs.ts` + tests.
4. `connection.ts` transport state machine + injected-socket unit tests.
5. `background.ts` + manifest + popup + esbuild bundle.
6. Walkthrough + docs.
