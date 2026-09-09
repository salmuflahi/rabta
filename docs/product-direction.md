# Rabta: less setup, fewer interruptions

User direction, September 9, 2026: put the useful tools in the Mac app, keep the everyday experience simple, support different kinds of work, and let teams work together without overwriting one another. Implemented capability and public claims must agree.

## One app, chosen tools

Rabta keeps one workspace shell, one tool search and one settings system. Everyday, Developer, Creator and Student modes prioritize different tools. Modes are local preferences, not separate products or paywalls. All tools remain searchable. Advanced controls are opt-in.

The desktop toolbox owns the working file processors. Website tool URLs describe the tools and direct people to the desktop download/preview. The website must distinguish the original signed 0.1.0 app from new preview builds.

## Teams: independent work, shared understanding

Each member has a private, versioned text work area. People explicitly publish a snapshot or opt into sharing while they type. Everyone else can inspect the published preview while continuing their own work. Shared images and reference files are deliberately uploaded, with visible size/type limits.

Changes to someone else's work are proposals. Only the recipient can review and apply them; application checks the current revision. A stale proposal cannot overwrite a newer draft. Published content and private drafts are different records. Revoking membership ends live access and subsequent reads, but cannot recall material a member already downloaded.

The implementation in `services/teams` is a self-hosted preview: authenticated HTTP/SSE, single-use invitations, reconnect, persistence, private lanes and reviewed replacement proposals. It does not mirror arbitrary Mac windows, merge binary design files, operate teammates' apps, or provide a managed cloud service. A private draft is hidden from other members, not from the administrator operating the service; it is not end-to-end encrypted.

Next substantial collaboration work: explicitly selected app-window preview streaming; per-asset comments and revision comparison; independent repository worktrees with reviewed diffs; managed membership/identity and operational backups. Each needs its own working acceptance test before being advertised as available.

## AI as an optional tool user

The MCP package exposes bounded calculation, unit conversion, text/data conversion, URL cleanup and color contrast using the exact desktop utility algorithms. Inputs are supplied explicitly. These transformations do not read clipboard contents, scan files or operate native controls. Existing capsule capture/restore still uses the opt-in local agent socket.

A wider AI tool interface should expose individual operations with input schemas, selected resource access, cancellation and actual results. Native writes, sharing, publishing and deletion need explicit scopes and review. A single permission must not silently grant access to every tool. No paid model, hosted inference or autonomous posting is enabled in this change.

## Useful professional workflows

- Everyday: restore a task, find an explicitly saved clipboard item, clean a link, adjust a file, focus.
- Developer: text/JSON/CSV tools, encoding, hashes, timestamps, diffs, workspace context and the MCP utility interface.
- Creator: image cleanup and export, SVG components, supported local video/audio trimming/conversion, content planning and calendar reminders.
- Student: study cards derived from entered notes, self-testing, focus and unit conversion. This is not an AI homework solver and does not invent sources.
- Architects and other visual professionals: investigate scaled image/PDF markup, named review proposals and revision comparison using real project files. Do not claim CAD/BIM editing or code-compliant architectural advice.

## Sustainable free core — recommendation, no billing change

Keep local personal tools free. Evaluate paid managed Teams hosting, shared storage/history, organization administration and optional hosted AI usage against actual operating cost. Self-hosted source and existing MIT rights remain available. Do not promise unlimited hosted storage/AI or charge a subscription before the service and its value are operational. No price, payment collection or usage tracking is introduced here.

## Remaining release gates

`native-suite-parity.md` retains the complete 57-feature reference scope, including incomplete rows. Independently authored additions do not imply full reference parity. Native previews must pass the Mac workflow and on-device permission, multi-display, sleep/wake and resource-cleanup checks. Automatic social publishing additionally needs registered platform applications, user OAuth connections, approved scopes and genuine provider responses; calendar export is only a reminder.
