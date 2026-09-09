# One Rabta, connected work

Rabta should grow as a suite whose products stand on their own and hand work to each other. A shared logo is useful; a useful handoff is what makes the family worth using.

## Product map

| Product   | Job                                                                             | Boundary                                                                            |
| --------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Workspace | Return to the windows, files and tools around a task                            | Desktop restore capabilities depend on supported connectors and OS permissions      |
| Studio    | Edit, convert, inspect and prepare assets; everyday utilities in the same place | Utilities are free and local in this release; no subscription or AI promise implied |
| Companion | Fast access to the task and relevant tools from a compact overlay               | Existing app companion remains; new utility-to-overlay handoffs are proposed        |
| Connect   | Share chosen workspace context with other apps and AI                           | Scope must be visible; do not imply file contents or unrestricted computer access   |
| Team      | Coordinate a shared outcome with collaborators                                  | Discovery only; no invented real-time collaboration capability                      |

Market means merchandise and stays deferred. Do not create a second Studio/Creative product or five separate onboarding flows. Pricing and subscription choices remain undecided.

## Updated scope — 2026-09-09

The user clarified that the entire Vorssaint native toolkit belongs inside Rabta. `native-suite-parity.md` now owns the complete 57-feature scope and integration decision. The baseline below is not fulfillment of that request. `account-policy.md` replaces the blanket no-account rule with one optional family identity and explicit saved-data scopes.

## The handoff worth building next

A user captures a design detail, opens it in Studio, removes a background, resizes the export and keeps the resulting asset with its Workspace. Companion can reopen that asset and the relevant tool. Connect can supply an explicitly selected asset or workspace reference to an AI. Start with this real handoff before introducing more product names.

The current change establishes shared utilities, not this complete asset-handoff pipeline. The next architecture step is a typed local asset record (file URI, MIME type, source tool, derived outputs, workspace ID), an explicit Open in Studio action and a predictable export destination. Do not upload assets or share them with an AI silently.

## Shipped source in this change

15 portable tools shared by website and desktop: scratchpad, snippets, manual clipboard shelf, link cleaning, focus timer, calculator, unit converter, text transforms, JSON formatting, CSV/JSON conversion, encoding, SHA-256, passwords/UUIDs, color/contrast and safe batch-renamed ZIP exports. Website retains its nine existing image/SVG/media tools, giving 24 web utilities total.

The desktop adds Utilities navigation, command-palette page navigation and Cmd+6. Source includes native Mac keep-awake, primary-display window layouts with undo, system volume/input controls, interactive PNG capture and on-demand system information. Native code is not yet verified on macOS and must not be advertised as a released signed app feature until tested.

## Vorssaint reference coverage and next work

Reference: https://github.com/vorssaint/vorssaint-utils (reviewed 2026-09-09). This is independent Rabta implementation; no upstream implementation source or branding was copied. Upstream is GPL-3.0-or-later; Rabta remains MIT for its independently authored source.

| Area in reference               | Current Rabta addition                                             | Work remaining                                                                                          |
| ------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Scratchpad, snippets, clipboard | Local notes, reusable snippets, manual text shelf                  | Background clipboard history, retention controls, hotkey expansion, file shelf                          |
| Quick tools                     | Links, calculator, colors, conversions, focus, batch rename        | OCR, global picker, radial menus and richer cross-app command actions                                   |
| Keep awake                      | Finite native caffeinate session, stop and cleanup                 | Scheduling / task-bound sessions after real Mac validation                                              |
| Windows                         | Explicit halves/corners/center/maximize on primary display; undo   | Multi-display geometry, edge dragging, app switcher, Dock previews, shortcuts, close/quit protection    |
| Audio                           | System output volume/mute and software input level                 | Per-app mixer/routing, devices, hardware mic behavior, music launch suppression                         |
| System                          | On-demand OS, CPU model, RAM capacity, battery and storage         | Live CPU/GPU/network, fan control, temperatures, configurable alerts                                    |
| Capture                         | Interactive native PNG capture                                     | Editor handoff, screen recorder/editor, camera preview, OCR                                             |
| Files                           | Batch export without mutating originals; existing media conversion | Finder cut/paste, DMG installation, cleaner/uninstaller, update tools, Homebrew manager                 |
| Input / displays                | No implementation in this change                                   | Mouse/key remapping, scroll controls, debounce, DDC brightness, Bluetooth sleep behavior, cleaning mode |

Prioritize a polished capture-to-Studio handoff, searchable tool shortcuts and a consent-based clipboard shelf. Per-app audio, Dock integration and hardware control are distinct native projects, not superficial UI cards.

## Release checks

- Shared core tests and desktop frontend typecheck/build.
- Browser validation of editors, errors, search, persistence and result controls.
- Site production build and existing integration tests.
- Before desktop release: cargo check, automated Rust tests and real macOS checks for Accessibility denial/approval, screen capture cancellation/save, displays with Dock on each edge, app exit cleanup, unsupported audio devices and busy-state recovery.
- No native Mac success claim from a Linux/browser preview.
