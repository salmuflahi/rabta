# Store listing copy

Ready-to-paste copy for each store form. Keep versions/names in sync with the
manifests (see `docs/RELEASE.md` §0).

---

## Chrome Web Store — "Rabta Connector"

**Item name:** Rabta Connector

**Summary** (≤132 chars):
> Lets Rabta capture and restore your browser tabs as part of a task's
> workspace. Local-only — nothing leaves your machine.

**Description:**
> Rabta is a local-first "shared brain" for your dev tools: it captures the
> state of a task — editor files, terminals, git branch, and browser tabs — and
> restores it on demand when you switch back.
>
> This extension is the browser half. It connects to the Rabta desktop app
> running on your own machine and lets it snapshot the tabs that belong to a
> task, then reopen them when you resume that task.
>
> • Local-first: talks only to the Rabta app on 127.0.0.1 — no cloud account,
>   no servers, no telemetry.
> • You approve the connection: the extension pairs with Rabta only after you
>   click Approve in the app.
> • Nothing is captured until you save a capsule, and only tab URLs are read.
>
> Requires the Rabta desktop app.

**Category:** Developer Tools

**Permission justification** (asked during review):
> `tabs` — Rabta reads the URLs of your open tabs to snapshot them into a task's
> capsule and reopens them when you restore that task. Tab data is sent only to
> the Rabta desktop app on the same machine (127.0.0.1) over an authenticated
> local connection you approve; it is never transmitted off-device.

**Privacy:** single purpose — "Capture and restore browser tabs as part of a
local task workspace for the Rabta desktop app." No remote data collection.

---

## VS Code Marketplace / Open VSX — "Rabta Connector"

Used for both registries (same `.vsix`). Marketplace serves VS Code; Open VSX
serves **Cursor / VSCodium / Windsurf**.

**Display name:** Rabta Connector

**Short description** (manifest `description`):
> Connects your editor to the Rabta desktop app so it can capture and restore
> your open files, terminals, and workspace per task. Local-only.

**Overview / README** (see `connectors/vscode/README.md`):
> Rabta captures a task's whole workspace — editor, terminals, git branch, and
> browser tabs — and restores it when you switch back. This extension is the
> editor half: it connects to the Rabta desktop app on your machine and lets it
> snapshot which files and terminals are open, then reopen them on resume.
>
> - Local-first: connects only to Rabta on 127.0.0.1; no cloud, no telemetry.
> - Authenticated automatically via a per-run secret the app writes locally —
>   no sign-in.
> - Works in VS Code and Cursor.
>
> Requires the Rabta desktop app.

**Categories:** Other, Snippets → prefer **"Other"** (it's an integration).
**Keywords/tags:** rabta, workspace, restore, session, tasks, context-switch.

---

## Notes before publishing

- `connectors/vscode/package.json` is missing `repository`, `icon`, and a README
  link — Marketplace/Open VSX listings look bare without them. Add a
  `repository` URL once the code is hosted, and a 128×128 `icon` PNG; the README
  is added (`connectors/vscode/README.md`).
- The Chrome item gets a **new Store-assigned extension ID** distinct from the
  unpacked dev ID — fine (pairing is approved per-connector), but add a `"key"`
  to `connectors/chrome/manifest.json` first if you want a stable ID across
  dev and prod.
