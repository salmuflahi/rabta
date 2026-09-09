# Rabta native toolkit: full reference scope

Owner instruction, 2026-09-09: combine the Vorssaint feature set with Rabta, improve it, and add useful capabilities. The earlier fifteen browser utilities are a starting implementation, **not fulfillment of this request**. This document supersedes the narrower priority list in rabta-suite.md.

Reference snapshot: [vorssaint/vorssaint-utils](https://github.com/vorssaint/vorssaint-utils/tree/52dbc100a44399c4ad6b980532ae5016457c0078), reviewed 2026-09-09. Its FeatureCatalog declares **57 top-level native features**. The rows below are independently written acceptance descriptions, not imported implementation source. README subfeatures remain in scope even when grouped into one row.

## Integration decision

Two real implementation paths exist:

| Path                                                        | Consequence                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reuse the native engine and adapt its presentation to Rabta | Fastest route to the full native feature set. Upstream code is GPL-3.0-or-later. Plan a GPL-compliant combined desktop distribution, preserve notices, publish corresponding source and build instructions, and use Rabta's own identity and signing. Do not assume putting the engine in a helper avoids GPL obligations. Requires the owner's licensing decision before importing and distributing it. |
| Independently implement equivalent capabilities             | Preserve independently authored licensing, but each native service must actually be built and verified. This is a substantial Mac engineering program, not a site refresh. Do not claim full parity while only browser counterparts exist.                                                                                                                                                               |

The upstream [LICENSE](https://github.com/vorssaint/vorssaint-utils/blob/main/LICENSE) permits charging for copies and support, and sets requirements for modified/combined distributions and corresponding source. A subscription is not itself incompatible with GPL. Separate cloud services require their own architectural/license assessment; do not promise that every part of a tightly integrated system can remain closed.

No Vorssaint source was imported and Rabta's license was not changed in this account update. This decision is separate from implementing Rabta accounts.

## One app, specific ownership

The intended desktop experience has one Rabta shell, one command search, one menu-bar/Companion entry and one settings center. Users choose the modules they need. A separate Vorssaint app launched beside Rabta is not the requested integration.

The current Rust hub and SQLite database continue to own workspace capture, restore and connector pairing. A native Swift service layer owns AppKit, Accessibility, ScreenCaptureKit, CoreAudio and hardware access. The React surface owns the shared product UI. Native capture, switcher and overlay windows stay native where latency and OS behavior require it.

Before importing an engine, inventory service startup in AppDelegate/FeatureRuntime. Extract lifecycle entry points, centralize defaults, replace upstream app/update identifiers, and assign each background observer exactly one owner. Disabled modules must release observers, timers, taps and audio sessions. A failed module must not crash workspace restoration.

The local bridge is versioned, authenticated and allowlisted. Each request has an ID, feature ID, named operation and validated input; each result reports success, cancellation, unsupported hardware, denied permission or failure. Cancellation and shutdown must release native resources. Do not expose arbitrary shell execution or forward cloud/AI requests to this bridge without distinct approved scopes.

## Complete parity checklist

All rows require real macOS verification. “Partial source” below means an earlier, smaller independent implementation exists; it does not mean reference parity or a verified native release.

| Reference ID         | Required behavior / acceptance                                                                                              | Rabta baseline                                                            |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| switcher             | Searchable app/window previews; minimized windows; multi-display behavior; per-app preview exclusions                       | Missing                                                                   |
| dockPreview          | Clickable Dock thumbnails; drag/snap; middle-close; pin; minimal mode                                                       | Missing                                                                   |
| dockClick            | Repeat click can minimize, hide or cycle the appropriate app windows                                                        | Missing                                                                   |
| windowMaximizer      | Green button maximizes without creating a new Space; preserve normal alternatives                                           | Missing                                                                   |
| windowLayout         | Halves, thirds, sixths, corners, center, maximize, gaps, multiple displays, edge snapping, modifier drag/resize and undo    | Partial source: primary-display explicit layouts only                     |
| autoQuit             | Optional last-window auto-quit with app exclusions                                                                          | Missing                                                                   |
| scrollInverter       | Independent vertical/horizontal mouse inversion without changing trackpad behavior                                          | Missing                                                                   |
| focusFollowsMouse    | Configurable focus delay; ignore dragging and modifier conflicts                                                            | Missing                                                                   |
| smoothScroll         | Adjustable smooth scrolling with app exclusions                                                                             | Missing                                                                   |
| mouseAcceleration    | Disable acceleration and restore the prior setting on disengagement                                                         | Missing                                                                   |
| mouseNavigation      | Side-button browser/navigation behavior                                                                                     | Missing                                                                   |
| mouseButtonShortcuts | Extra-button and wheel mappings to keys/actions; per-app rules                                                              | Missing                                                                   |
| middleClick          | Trackpad three-finger middle-click without breaking ordinary gestures                                                       | Missing                                                                   |
| mouseClickDebounce   | Configurable filtering with device/app exclusions                                                                           | Missing                                                                   |
| keyboardDebounce     | Duplicate-key filtering without breaking intentional repeats                                                                | Missing                                                                   |
| textSnippets         | Global trigger expansion, variables, folders, search and quick selection                                                    | Partial: local text templates; no expansion service                       |
| superKey             | Modifier remapping, tap actions and app pauses                                                                              | Missing                                                                   |
| quitWindowProtection | Hold/double-press/modifier protection for closing and quitting; per-app settings                                            | Missing                                                                   |
| clipboardHistory     | Text/image/file capture, pins, search, previews, quick paste; explicit retention and exclusions                             | Missing; manual text shelf is not history                                 |
| pastePlain           | Paste unformatted while preserving the prior clipboard                                                                      | Missing                                                                   |
| finderCutPaste       | Finder cut/paste and image-clipboard-to-PNG behavior                                                                        | Missing                                                                   |
| finderRename         | Configurable Finder rename shortcut                                                                                         | Missing; batch ZIP rename is different                                    |
| shelf                | Floating drag shelf for files/text/links; pin, share, send and clear policies                                               | Missing                                                                   |
| urlCleaner           | On-demand and optional clipboard cleaning, configurable tracking parameters                                                 | Partial: explicit text URL cleaner                                        |
| diskImageInstaller   | Confirm app destination, install from DMG, eject and optional source cleanup                                                | Missing                                                                   |
| mixer                | Per-app volume/boost and output routing as well as system volume                                                            | Missing; system volume alone is not parity                                |
| soundOutputSwitcher  | Preferred/quick-cycled output devices and disconnect behavior                                                               | Missing                                                                   |
| micMute              | Preferred input and reliable mute across supported devices                                                                  | Partial source: software input-level control only                         |
| musicBlock           | Optional suppression of unwanted Music launches                                                                             | Missing                                                                   |
| keepAwake            | Finite/manual/power/app-driven sessions, display behavior, lock pause and supported lid behavior                            | Partial source: finite caffeinate session                                 |
| brightness           | Per-display brightness with supported DDC and explicit dimming fallback                                                     | Missing                                                                   |
| extraBrightness      | Supported XDR controls with hardware gating and restoration                                                                 | Missing                                                                   |
| bluetoothSleep       | Optional disable on sleep; restore only state changed by Rabta                                                              | Missing                                                                   |
| quickLauncher        | Configurable quick access to native actions and applications                                                                | Missing                                                                   |
| quickToggles         | Useful native controls with real state, permissions and shortcuts                                                           | Partial source: a few explicit Mac controls                               |
| colorPicker          | Global pixel picker with magnification, format choices and system fallback                                                  | Partial: browser color entry/eyedropper support                           |
| screenOCR            | Offline screen text extraction and QR recognition                                                                           | Missing                                                                   |
| cleaningMode         | Temporary keyboard lock/display dim with a reliable documented exit                                                         | Missing                                                                   |
| mediaTools           | Image batches, compression, resizing, crop, watermarks, video trims, GIF and presets                                        | Partial: browser image/SVG/media tools; native editor integration missing |
| cleaner              | Reviewed caches/logs/leftovers; scheduled rules; explicit space estimate and results                                        | Missing                                                                   |
| uninstaller          | App removal with related files listed and unchecked by default                                                              | Missing                                                                   |
| homebrew             | Package discovery, state, install/update/uninstall with explicit commands and results                                       | Missing                                                                   |
| appUpdates           | Source-aware update checks; explicit source switching and failure recovery                                                  | Missing                                                                   |
| screenshot           | Unified area/window/screen/frozen/scrolling capture; annotations/redaction/crop/background; save/copy/drag/history          | Partial source: interactive PNG capture only                              |
| cameraPreview        | Camera selection, preview and permission lifecycle                                                                          | Missing                                                                   |
| radialMenu           | Custom profiles, submenus, apps/files/links/keys/media actions                                                              | Missing                                                                   |
| scratchpad           | Floating multi-note surface, Markdown, autosave/export and optional expiry                                                  | Partial: browser/local scratchpad                                         |
| commandBar           | Global movable search for actions/apps/windows/snippets/history/files; math, units, dates, emoji; aliases and ranking reset | Partial: app navigation palette and separate calculators                  |
| screenRecorder       | Region/window/display, system audio+mic, pause/resume, trim/cut/zoom/cursor/text/blur/background, video/GIF export          | Missing                                                                   |
| killProcess          | Inspect process and explicitly end it; distinguish quit/force-quit, protect critical processes                              | Missing                                                                   |
| monitorCPU           | Live CPU usage/history/temperature and configurable thresholds where supported                                              | Missing; CPU model is not live monitoring                                 |
| monitorGPU           | Hardware-supported live GPU metrics/history                                                                                 | Missing                                                                   |
| monitorMemory        | Live pressure/usage/swap with thresholds                                                                                    | Missing; RAM capacity is not monitoring                                   |
| monitorNetwork       | Live rates, session totals and explicit speed test                                                                          | Missing                                                                   |
| monitorDisk          | Storage/activity and threshold alerts                                                                                       | Partial: on-demand storage information only                               |
| monitorPower         | Charge, temperature, health, time, cycles and power where supported                                                         | Partial: on-demand battery readout only                                   |
| fanControl           | Hardware detection, live RPM, optional manual/curve controls and reliable return to automatic                               | Missing; retain experimental status                                       |

Cross-cutting reference behavior also belongs in parity: settings search, shortcut editing/conflicts, per-app exceptions, module availability, permission status, startup recovery, menu-bar customization and teardown. Messaging-download organization belongs to the file-cleaning/media workflow, not a separate invented product.

## What makes the combined app better

1. Capture an image → edit in Studio → save the output with the active Workspace → reopen from Companion. Preserve the original and record derivation; no manual copying between product silos.
2. Capture a workspace's actual layout and relevant tools, then restore across supported monitors with a preview, path remapping and per-item results. Never restore into a destructive Git or file action silently.
3. Make commands context-aware: the active workspace determines recent files, capture destinations and pinned tools. One hotkey opens the same action catalog from anywhere.
4. Save chosen tool presets to the account. Local operation survives sign-out or network failure; show unsynced/conflict state clearly.
5. Give an AI a selected asset or workspace briefing with narrow read/action scopes. The AI does not receive the whole clipboard, desktop or native administrator capabilities because it is connected.

Team collaboration follows a separate product brief. Merchandise and subscription pricing remain deferred. These improvements are planned acceptance outcomes, not claims about the current release.

## Shipping gates

Choose the source-reuse/license path first. Pin any imported source to a reviewed commit and preserve its license, attribution and modifications record. Audit OS/hardware minimums: the referenced native package targets macOS 14, while the older Rabta download describes macOS 11. Do not silently change an existing download's compatibility claim before a new build exists.

On a real Mac, verify permission granted/denied/revoked, sleep/wake, multiple displays and mixed scale, app exits/crashes, excluded apps, cancellation, memory/CPU idle budget and hotkey conflicts. Destructive, audio-capture and hardware-control modules require targeted manual checks. Build/sign/notarize Rabta itself and test one-app installation/update/removal. A Linux build or passing browser tests cannot satisfy these gates.
