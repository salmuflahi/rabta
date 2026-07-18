# OmniBus — Vision (verbatim from project kickoff, 2026-07-17)

> "OmniBus" is a temporary working name. Branding, colors, and typography are placeholders.

## Problem
Developers lose context every time they switch tasks: branches, files, browser tabs, issues, terminals, dev servers — rebuilt manually dozens of times a week.

## Core idea
A local desktop platform that acts as a shared "brain" for dev tools. Work is organized around **Tasks**, not applications. Apps become tools attached to a task. "USB-C for software" — every application connects once, then can communicate with every other connected application through OmniBus. Not an AI product; AI may enhance it later but never defines it.

## Primary object: Task Capsule
Stores everything required to resume work: project, repository, branch, open files, cursor positions, browser tabs, dev URL, terminal working directories, connected resources. Activating a task makes every connected application restore its own state.

## MVP (v0.1)
Perfect task switching, nothing else: select a task → correct VS Code workspace + files, safe branch switch, browser tabs, dev URL, terminal in the right directory — previous task's state saved, next one restored. No AI, no automation rules, no cloud sync, no marketplace.

## Architecture
Local-first, no cloud backend. Desktop app (Tauri) → Local Event Hub → Connectors → Applications. Apps never talk to each other directly; everything goes through OmniBus. Never exposed over the internet.

## Stack
Tauri 2, React, TypeScript, Tailwind, Zustand, Vite · Rust, Tokio, Serde · SQLite · local WebSocket + shared protocol package · VS Code & Chrome extensions · Git.

## Phases
1. Desktop shell (Tauri app only)
2. Shared protocol (events, commands, registration, responses)
3. Fake connector (simulated VS Code; validate architecture first)
4. Local hub (registration, routing, sessions, auth tokens, permission checks)
5. SQLite DB (projects, tasks, task resources, events, connectors)
6. Manual project registration (name, repo path, dev URL, owner, default branch)
7. VS Code connector (open workspace/files, read state, terminals, status)
8. Task Capsules (save/restore state across all connectors)
9. Safe Git ops (status, branch, fetch, checkout, create branch — never force-checkout/reset/discard/auto-stash)
10. Chrome connector (read/open/focus/save/restore tabs)
11. GitHub integration (read issues, associate with projects, capsules from issues, branch names like `issue-42-fix-login`)

## v0.1 success criteria
Another developer can install OmniBus + connectors, register a project, create multiple tasks, switch between them, and have files, tabs, branches, and terminals restored — resuming work instantly.

## Future roadmap
Docker/Postman/Figma/Linear/Jira connectors, plugin SDK, automation rules, AI suggestions, cloud sync, team collaboration.

## Design philosophy
Minimal, fast, native-feeling, dark-mode first, professional. No flashy animations. Responsiveness, clarity, simplicity.

## Development principles
1. Architecture before features. 2. Modular everything. 3. Connectors independent. 4. Never sacrifice user safety for convenience. 5. Local-first. 6. Avoid unnecessary AI. 7. Build for real problems, not impressiveness. 8. DX above everything. 9. Clean, maintainable, documented code. 10. Every feature strengthens effortless task switching.
