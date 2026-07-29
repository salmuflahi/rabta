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

## Status & notes

- **Open VSX:** ✅ published — `rabta-connect.rabta-vscode` 0.1.0:
  <https://open-vsx.org/extension/rabta-connect/rabta-vscode> (serves Cursor /
  VSCodium / Windsurf).
- **Chrome Web Store:** ⏳ pending review — item "Rabta Connector", **Store id
  `aaombpafbhjkoinppogieaclijddlebo`**, publisher `rabta-connect`. The older item
  under a prior account (id `eglannhohnfalopddjbjhgiimeblmgbj`) is **obsolete** —
  do not link or resubmit it. Rabta hardcodes **no** Store id (the hub accepts
  valid `chrome-extension://` origins and pairing is approved in-app per
  connector), so the new id needs no code change.
- **VS Code Marketplace (Microsoft):** not yet published (Azure DevOps PAT
  blocker). Don't claim Marketplace publication anywhere until it's live.
- **Website / download:** <https://salmuflahi.github.io/rabta/> · DMG
  <https://github.com/salmuflahi/rabta/releases/download/v0.1.0/Rabta_0.1.0_aarch64.dmg>
  (SHA-256 `3978ec57af7d37ab32670033d679c21a28cf74cebb0435ce011049e05635c655`).
- `connectors/vscode/package.json` still lacks `repository`/`icon` — Marketplace
  listings look bare without them. A public `repository` URL now exists (the
  website repo, `salmuflahi/rabta`) if you want to add it in a future 0.1.1
  (don't republish 0.1.0 to Open VSX just for this — see RELEASE.md).
