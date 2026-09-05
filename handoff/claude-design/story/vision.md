# OmniBus — Vision

> "OmniBus" is a temporary working name. Branding, colors, and typography are placeholders.
> Core vision recorded at project kickoff 2026-07-17; privacy principles added 2026-07-18.

## Problem

Developers lose context every time they switch tasks: branches, files, browser tabs, issues, terminals, dev servers — rebuilt manually dozens of times a week.

## Core idea

A local desktop platform that acts as a shared "brain" for dev tools. Work is organized around **Tasks**, not applications. Apps become tools attached to a task.

"USB-C for software" — every application connects once, then can communicate with every other connected application through OmniBus. Not an AI product; AI may enhance it later but never defines it.

```
   VS Code      Chrome      Terminal      Git
      │            │            │           │
      └────────────┴─────┬──────┴───────────┘
                         │  (each connects once)
                     ┌───┴───┐
                     │OmniBus│   local hub — apps never
                     └───┬───┘   talk to each other directly
                         │
                   Task Capsules
              (the state of your work)
```

## Primary object: Task Capsule

Stores everything required to resume work: project, repository, branch, open files, cursor positions, browser tabs, dev URL, terminal working directories, connected resources. Activating a task makes every connected application restore its own state.

## MVP (v0.1)

Perfect task switching, nothing else: select a task → correct VS Code workspace + files, safe branch switch, browser tabs, dev URL, terminal in the right directory — previous task's state saved, next one restored. No AI, no automation rules, no cloud sync, no marketplace.

## Architecture

Local-first, no cloud backend. Desktop app (Tauri) → Local Event Hub → Connectors → Applications. Apps never talk to each other directly; everything goes through OmniBus. Never exposed over the internet.

## Stack

Tauri 2, React, TypeScript, Tailwind, Zustand, Vite · Rust, Tokio, Serde · SQLite · local WebSocket + shared protocol package · VS Code & Chrome extensions · Git.

## Privacy Principles

OmniBus's entire value depends on trust. There is a categorical difference between
"OmniBus is spying on everything I do" and "OmniBus remembers the state of the tools
I've explicitly connected" — those are two different products, and we are building
the second one. Every design decision is bound by these principles:

- Local-first by default.
- Never upload user data without explicit consent.
- Never record keystrokes or clipboard contents.
- Never store file contents.
- Never store terminal output.
- Store the minimum metadata required to restore a task.
- Give users visibility into and control over what is remembered.

### What OmniBus must NEVER silently record

- Every website the user visits.
- Every keystroke.
- Clipboard contents.
- Terminal output.
- File contents.
- Passwords.
- Browser history.
- Messages or email.
- Screen recordings.

If people believe it does any of these, many won't install it.

### What it SHOULD store

Only what's necessary to restore a task. For example:

VS Code:

```json
{
  "workspace": "/Projects/OmniBus",
  "openFiles": [
    "src/main.ts",
    "src/hub.rs"
  ]
}
```

Chrome:

```json
{
  "tabs": [
    "http://localhost:3000",
    "https://github.com/.../issues/42"
  ]
}
```

Terminal:

```json
{
  "cwd": "/Projects/OmniBus"
}
```

Notice what is **not** stored: the code in the files, the contents of the web pages,
the terminal history, what was typed. Only enough metadata to restore the workspace.

### Visibility and control (planned product work)

Two features follow directly from these principles and belong in the roadmap
before public release:

1. **A "Data OmniBus stores" screen** — an explicit, always-accessible list:
   stored (workspace paths, open file paths, browser URLs for connected sessions,
   git branch, dev server URL) vs never stored (keystrokes, file contents,
   passwords, clipboard, screen recordings).
2. **Per-item memory controls** — checkboxes, not defaults forced on:

```text
Workspace Memory

☑ Remember browser tabs
☑ Remember open files
☑ Remember terminal directories
☐ Remember window layout
☐ Remember browser tabs in Incognito
```

These principles are also a differentiator worth stating plainly: your data never
leaves your computer, and OmniBus stores only what it needs to restore your
workspace — never your code, keystrokes, or browsing history.

## Phases

1. Desktop shell (Tauri app only)
2. Shared protocol (events, commands, registration, responses)
3. Fake connector (simulated VS Code; validate architecture first)
4. Local hub (registration, routing, sessions, auth tokens, permission checks)
5. SQLite DB (projects, tasks, task resources, events, connectors)
6. Manual project registration (name, repo path, dev URL, default branch — owner dropped: single-user, local-first)
7. VS Code connector (open workspace/files, read state, terminals, status)
8. Task Capsules (save/restore state across all connectors)
9. Safe Git ops (status, branch, fetch, checkout, create branch — never force-checkout/reset/discard/auto-stash)
10. Chrome connector (read/open/focus/save/restore tabs)
11. GitHub integration (read issues, associate with projects, capsules from issues, branch names like `issue-42-fix-login`)

## v0.1 success criteria

Another developer can install OmniBus + connectors, register a project, create multiple tasks, switch between them, and have files, tabs, branches, and terminals restored — resuming work instantly.

## Future roadmap

Docker/Postman/Figma/Linear/Jira connectors, plugin SDK, automation rules, AI suggestions, cloud sync, team collaboration. Privacy-visibility screen and per-item memory controls (see Privacy Principles) before public release.

## Design philosophy

Minimal, fast, native-feeling, dark-mode first, professional. No flashy animations. Responsiveness, clarity, simplicity.

## Development principles

1. Architecture before features. 2. Modular everything. 3. Connectors independent. 4. Never sacrifice user safety for convenience. 5. Local-first. 6. Avoid unnecessary AI. 7. Build for real problems, not impressiveness. 8. DX above everything. 9. Clean, maintainable, documented code. 10. Every feature strengthens effortless task switching.
