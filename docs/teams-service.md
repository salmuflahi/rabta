# Rabta Teams service

Rabta Teams now has a runnable collaboration service and a desktop client. A room gives each person a private work lane. People publish a selected preview, or explicitly enable live sharing in the client, so teammates can follow the work while continuing in their own lane. A teammate proposes a change against a published revision. Only the recipient can accept it and explicitly apply it; acceptance alone changes no work.

This service synchronizes text briefs, presence and explicitly uploaded preview assets. It does not synchronize arbitrary application files, control another Mac, capture a desktop, grant repository access, provide shared application cursors, or perform an automatic merge. Work remains independent until the recipient reviews an integration proposal. It is a self-hostable implementation, not an already provisioned Rabta cloud service.

## Run locally

Requires Node 22 or newer. There are no runtime packages to install.

1. Generate a cryptographically random administration key of at least 32 characters and supply it through `RABTA_TEAMS_BOOTSTRAP_KEY`. Use URL-safe base64 characters. For example, `node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))"` generates a new value; keep it in the server's environment or secret manager.
2. Set `RABTA_TEAMS_DATA_DIR` to a private directory outside the source checkout. The default is `.rabta-teams` under the server's current working directory.
3. Run `node services/teams/server.mjs` from the repository root. The default address is `http://127.0.0.1:47831`.
4. Open Teams in Rabta and use that address. The first owner creates a room using the administration key. The returned member key is the owner's room credential, with narrower scope than the administration key.
5. Create a single-use invitation for a teammate. Give that person the invitation and server address using a channel you already trust. The teammate chooses a display name and joins. No email or password is required by this service.

The administration key creates rooms; it cannot read an existing room without that room's member key. Member credentials and invitation secrets are returned only when created. They are never put in URL parameters, service logs or plaintext persistent state. The desktop client keeps connection credentials in session memory; leaving the session or restarting the app requires reconnecting. Keep the owner's member key if the room must survive a client restart. Lost keys cannot be recovered from their stored hashes.

For development previews, add the exact browser origin to `RABTA_TEAMS_ORIGINS`. This is a comma-separated replacement for the allowlist. The default origins are `tauri://localhost`, `http://tauri.localhost` and `https://tauri.localhost`; arbitrary websites are denied. Include both native and desired development origins when overriding it.

## A real team server

Remote clients must connect over HTTPS. To bind beyond loopback, set `RABTA_TEAMS_HOST`, `RABTA_TEAMS_TLS_CERT` and `RABTA_TEAMS_TLS_KEY` to a server address and valid certificate/key file paths. The server rejects a non-loopback HTTP listener. `RABTA_TEAMS_PORT` defaults to 47831. Alternatively, an HTTPS reverse proxy may connect to the loopback listener on the same host; do not expose that internal listener externally. Configure the proxy to preserve SSE streaming, disable response buffering, and allow a long-lived connection. Use a certificate trusted by clients; the desktop client does not bypass TLS verification.

Run exactly one process for a data directory. The `service.lock` file prevents concurrent writers. On clean shutdown the lock is removed. After a crash, an administrator must first verify that no service instance is running, then remove the stale lock. Do not automate removal while another process could still hold the directory.

The host needs Node 22+, a Linux/macOS filesystem that supports atomic rename and file/directory synchronization, and durable private storage. Reserve at least 128 MiB for the live 64 MiB store plus its temporary replacement, with additional space for backups. A starting allocation of one CPU and 1 GiB RAM allows room for JSON serialization and copies; this is an operational estimate, not a measured capacity guarantee. CPU, memory and write latency need load validation against the intended team size before a hosted rollout.

This first service uses an atomic JSON store with file and directory synchronization before acknowledging a write. It makes a private temporary file, flushes it, atomically renames it and flushes the containing directory. Operations serialize within the process, including revision checks. A failed write does not publish an in-memory mutation. Invalid state at startup fails closed rather than silently erasing work. Back up `state.json` using encrypted storage with access restricted to the operator. Directory/file modes are 0700/0600 when created; the operator must secure the containing filesystem and any backups.

Current deployment limits are 100 rooms, 100 active members per room, 1,000 shared assets and 10,000 proposals per room, and 64 MiB for the complete serialized store. Each asset is at most 2 MiB, each lane/proposal content at most 100,000 characters, and each request body at most 2,850,000 bytes. Assets are explicitly selected PNG, JPEG, WebP, plain text, Markdown or JSON; image signatures are checked, SVG/HTML are rejected, and downloads have `nosniff` and attachment headers. Files are never executed. Requests are limited to 600 per member per minute; unauthenticated/invalid-key requests share an IP budget. Each member can have at most five SSE connections.

State and assets remain until explicitly removed or the operator deletes the stored room/server data. Preview withdrawal, asset removal and member revocation stop future service access; they cannot recall content already viewed or downloaded. Drafts are private from other room members, including the owner, at the API level. The self-hosting operator can read the local database; this is not end-to-end encryption. A hosted offering needs a published retention/recovery policy and operational capacity work before release.

## HTTP API, version 1

Requests with bodies use JSON. Room routes require `Authorization: Bearer <memberKey>`. Do not put credentials in query parameters; the service rejects query strings. The two initial endpoints are:

| Method and path | Request | Response |
| --- | --- | --- |
| `POST /v1/rooms` | Administration key in bearer header; `{name, displayName, memberKey?, idempotencyKey?}` | `{roomId, memberId, memberKey}` |
| `POST /v1/invitations/accept` | `{invitationKey, displayName, memberKey?, idempotencyKey?}`; no member credential yet | `{roomId, memberId, memberKey}` |

The desktop client generates a random member key and idempotency key **before** submitting a create/join request and retains the pair while retrying. Supply both fields together. Member keys use at least 32 random bytes encoded as URL-safe base64 (43 characters); never derive them from a name or password. An identical request after a lost response returns the same membership, even after a service restart, without creating duplicate rooms or consuming a second invitation. Changing payload under the same idempotency key is a conflict. Invitation retries cannot restore revoked membership. The service stores only key/request digests and a request fingerprint. Older callers that omit this pair get a server-generated key but cannot recover a lost response; new clients should always provide the pair.

The following paths are relative to `/v1/rooms/:roomId`:

| Method and path | Behavior |
| --- | --- |
| `GET /state` | Member-scoped room, members, own draft, others' published lanes, relevant proposals and asset metadata. |
| `PUT /lane` | `{expectedRevision, title, content}` saves only the caller's private draft. Returns `{lane}`. |
| `POST /lane/publish` | `{expectedRevision}` shares an exact draft snapshot. Returns `{lane}`. |
| `DELETE /lane/publish` | Withdraws the caller's shared preview; private work remains. |
| `POST /invitations` | Owner only, `{}`. Returns `{invitationId, invitationKey, expiresAt}`. Single use, expires after 24 hours. |
| `DELETE /invitations/:id` | Owner revokes an unused invitation. |
| `DELETE /members/:id` | Owner revokes a member; the owner cannot revoke themselves. Active streams are terminated. |
| `POST /presence` | `{status: "working" | "away" | "offline"}` records explicit presence. |
| `GET /events` | Authenticated SSE using streaming `fetch`, not an unauthenticated `EventSource` URL. |
| `POST /proposals` | `{targetMemberId, targetRevision, title, content, idempotencyKey}`. Targets another member's published revision. Returns `{proposal}`. |
| `POST /proposals/:id/review` | Recipient only; `{expectedRevision, decision: "accept" | "decline"}`. Returns `{proposal, lane}`. |
| `POST /proposals/:id/apply` | Recipient only; `{expectedRevision, targetRevision}`. Applies an accepted proposal to the recipient's private draft. Returns `{proposal, lane}`. |
| `POST /assets` | `{name, mimeType, contentBase64}` uploads a selected file for all current room members. Returns `{asset}` metadata. |
| `GET /assets/:id` | Authenticated download. |
| `DELETE /assets/:id` | Removes an asset; uploader or room owner only. |

`GET /health` returns `{status: "ok", service: "rabta-teams", version: 1}` without accessing a room. Unknown paths return 404. API errors return `{error: {code, message, details?}}`; revision conflicts use status 409 and `details.currentRevision`.

`GET /state` returns:

```ts
type Member = { id: string; displayName: string; role: "owner" | "member" };
type Lane = {
  memberId: string; revision: number; title: string; content: string;
  updatedAt: string; publishedAt: string | null; private: boolean;
};
type Proposal = {
  id: string; sourceMemberId: string; targetMemberId: string;
  targetRevision: number; title: string; content: string;
  status: "pending" | "accepted" | "declined" | "applied";
  revision: number; createdAt: string; updatedAt: string;
};
type RoomState = {
  room: { id: string; name: string; createdAt: string };
  me: Member;
  members: (Member & {
    status: "working" | "away" | "offline"; lastSeenAt: string | null;
  })[];
  lanes: Lane[];
  proposals: Proposal[];
  assets: {
    id: string; name: string; mimeType: string; size: number;
    ownerId: string; createdAt: string;
  }[];
  revision: number;
};
```

An unpublished teammate has no lane in the response. The caller's own lane is their private draft, even if an older preview is shared. A later private edit does not silently update the shared preview. Proposal content is visible only to its sender and recipient; room ownership does not grant access to others' proposals.

## Concurrency and recovery contract

- Draft revision starts at zero and advances on each successful save or proposal application. Every mutation checks the expected revision inside the serialized transaction. Two clients saving the same revision cannot both succeed.
- Proposals target a published revision. If the recipient has changed their private draft, acceptance fails with a conflict. If they edit after accepting, application fails with a conflict. The sender must refresh the published work and create a reviewed replacement proposal. The service never force-applies stale work.
- Repeating a proposal send with the same idempotency key and payload returns the existing proposal. Reusing the key for a different payload is a conflict. Acceptance, application and publication are separate actions. Applying a proposal does not automatically publish the resulting private work.
- SSE sends `ready` with `{revision}`, `change` with `{revision}`, `presence` with `{memberId,status,lastSeenAt}`, and `revoked` with `{}`. Heartbeat comments arrive every 15 seconds. Events contain no draft contents or credentials. Refresh `/state` after `ready` or `change`; reconnect always obtains the current state, so missing historical events cannot lose saved work.
- Send presence every 30 seconds while connected and opted in. Presence older than 90 seconds appears offline in state. Presence is transient and clears on service restart; document contents persist.
- Network errors preserve the local draft. A client must resolve a stale revision explicitly rather than automatically adopting the server's revision and retrying its old text. Clients must never execute a command merely because it appears in a brief, proposal or uploaded document.

## Verification

Run `node --test services/teams/server.test.mjs` from the repository root. The suite creates real HTTP servers and independent client credentials against temporary durable directories. It verifies private lane isolation, concurrent same-lane conflicts, published previews and withdrawal, proposal ownership and review/application races, idempotent sending, room isolation, single-use/revoked invitations, lost-response create/join recovery, live presence and revocation, asset upload/download/deletion permissions and size limits, restart/reconnect, origin and request limits, single-writer locking, and corrupt-state recovery.

These tests establish service behavior. They do not claim load testing, an external security review, a managed deployment, or verification of every desktop interaction on a real Mac.
