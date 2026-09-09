# Native toolkit implementation — September 9, 2026

This is independently authored source for the Rabta desktop app. No Vorssaint source was imported, and the repository license is unchanged. These capabilities add working native operations; they do not complete the 57-row parity checklist in `native-suite-parity.md`.

## Native service

`apps/desktop/src-tauri/src/native-toolkit.m` is compiled into the Mac executable by `build.rs`, using the selected Rust target architecture and a macOS 11.0 minimum. AppKit, Foundation, Vision, CoreAudio, IOKit, ApplicationServices, CoreGraphics, QuartzCore, AVFoundation and UniformTypeIdentifiers are linked system frameworks; `src-tauri/Info.plist` carries the camera, microphone and Apple Events usage descriptions macOS shows on first use. The installed app does not need Xcode or Swift installed. Non-Mac Rust targets do not compile or link the Objective-C service, and its commands return an explicit unsupported-platform error.

`utility-native.rs` owns the private C ABI call and response lifetime. The generic operation dispatcher is not a Tauri command. Only named handlers are registered. This service has no network access and never turns user input into shell, AppleScript or JavaScript source. Existing explicit window commands keep their bounded, static osascript helper. The higher-privilege native commands are not exposed to team rooms or AI actions.

## Added capabilities and honest limits

| Capability | Implemented behavior | Remaining limits |
| --- | --- | --- |
| Live CPU | Mach tick deltas, real 2-second samples and 30-reading history; pause and hidden-panel lifecycle | No temperature, GPU, fan control or threshold notification |
| Live memory | Physical capacity, active/wired/compressed estimate, compressed footprint, swap used | Not Activity Monitor's pressure calculation; no pressure alerts |
| Network | Per-interface receive/send rates based on actual counters and elapsed time; reset/wake baselines avoid negative/spiky rates | No speed test, per-app attribution or persistent session totals; separate VPN/physical interfaces avoid fabricated aggregate totals |
| Disk and power | Home-volume capacity/free space; internal battery percentage, charging/power state and time estimate where reported | No disk activity, cycle counts, thermal, wattage or hardware health claims |
| Audio output | Enumerate connected output devices, show current system device, explicitly switch via CoreAudio; revalidate disconnected devices | No per-app mixing, boost, routing, auto-preference cycling or microphone hardware mute |
| Screen text | Explicit area/window selection followed by offline Vision accurate text and barcode recognition; language auto-detection on macOS 13+ | No scrolling/frozen capture, annotation or automatic QR link opening; recognition accuracy requires user review |
| Clipboard | Explicitly enabled text history, pause/resume, search, pin, copy, delete/clear, retention and app exclusions | Text only; no image/file history, global shortcut picker or simulated quick-paste |
| Native export | Explicit NSSavePanel destination, cancellation result, atomic write, up to 100 MiB decoded file | Larger exports need smaller selections; native UI remains a Mac verification gate |
| Windows | Real searchable inventory/focus/minimize/native close; multi-display halves/quarters/thirds/sixths/gaps/undo | See `native-windows-implementation.md`; no thumbnail previews/Dock interception/automatic snapping |
| GPU | IOAccelerator `PerformanceStatistics` utilization, renderer/tiler load and in-use memory per accelerator, joined to the live monitor | Key names vary by driver; unavailable values are reported as such, no history or thresholds |
| Input service | One session event tap on its own run loop: wheel inversion (mouse only), click/key debounce, Cmd+Q/Cmd+W hold or double press, Cmd+Shift+V plain paste, button 3/4 navigation and button→shortcut mappings, focus-follows-pointer, snippet expansion with variables, cleaning mode, per-app pass-through | Requires Accessibility (and Input Monitoring on newer macOS); shortcuts use ANSI key positions; snippet expansion is not exempt in secure fields; no smooth scrolling, acceleration control, three-finger click or modifier remapping |
| Apps and processes | Running-app inventory with layer-0 window counts, `ps` process list, quit/force quit through NSRunningApplication, signals for other processes, installed-app scan, NSWorkspace launch | macOS components, system executable folders and Rabta itself are protected; window counts need no Screen Recording access |
| Uninstaller and disk images | Related files by exact bundle ID or name, identity re-read with `defaults`, Trash through NSFileManager; `hdiutil` read-only attach, `ditto` copy, eject, optional image to Trash | No .pkg installation; license-agreement images need Finder; Trash results are reported per item |
| Cleaner | Fixed regenerable-folder categories scanned with sizes and a walk budget; removal only of paths a scan lists; Trash or permanent | No scheduling; symlinks are never followed or removed |
| Homebrew and updates | Allowlisted `brew` commands with validated names and the exact command/output shown; `softwareupdate -l`, `brew outdated --json=v2`, `mas outdated` | Requires Homebrew; one action at a time; macOS updates install only through System Settings |
| Recorder and camera | `screencapture -v` display/region sessions with cursor, click, microphone and time-limit options, stopped with SIGINT; AVFoundation camera list, authorization and floating preview | No pause/resume, system audio or in-app trimming beyond the media tool; camera preview is never recorded |
| Watchers | One polling worker for auto-quit (windows seen, then none for a grace period, once per app) and the Music block (launches after enabling, with a 10-minute allowance) | Apps are asked to quit normally; the worker stops with the settings or with Rabta |

## Clipboard privacy and lifecycle

- Disabled on launch. An app-owned consent dialog explains collection before enabling. The initial clipboard is not imported: enable/resume/settings changes establish a counter-only baseline.
- Text stays in Rust memory; at most 100 entries, 32 KiB per entry and 2 MB in total. Retention choices are 1, 8 or 24 hours, measured with a monotonic clock. Pins reorder entries but never bypass expiry or storage limits.
- Pause skips pasteboard reads. Disable clears remembered entries. Closing the app clears memory and stops the single owner-managed worker. Closing only the Utilities panel leaves an explicitly enabled session running, which the consent text explains.
- Common password-manager bundle IDs remain excluded. Apps' concealed/transient/auto-generated/password pasteboard markers are rejected before reading text. Unknown frontmost-app identity fails closed. This cannot identify every unmarked secret copied from arbitrary apps or an app transition; the UI clearly tells users to pause before sensitive copies.
- Configurable exclusions use the frontmost application's bundle ID when the worker checks the clipboard, up to 500 ms after copying. Rapid app switches can hide the actual source. The UI names this limitation and does not claim source attribution. Up to 100 custom bundle IDs are normalized/deduplicated alongside protected defaults; saved settings round-trip. Pause/disable bypass unrelated preference validation and native calls, so invalid settings cannot trap a user in active collection. An explicit `updatePreferences` flag distinguishes settings saves: valid paused edits apply without a native read, while invalid saves report an error and preserve both the pause and the previous valid preferences.
- Settings/clear/copy changes invalidate in-flight samples. Clear establishes a new baseline so the unchanged system clipboard is not re-imported. No action changes the system clipboard except an explicit Copy button.
- No team sync, telemetry, account persistence, logs containing entries, or automatic AI access.

## Input service lifecycle

- Nothing runs until a configuration with at least one feature is applied from the Keyboard and mouse panel, after an in-app consent dialog that names Accessibility access and the fact that every app's input passes through the filter. `inputRequestAccess` triggers the system prompts explicitly.
- The tap thread owns the CFMachPort, its run-loop source and the focus timer; `inputStop`, an all-off configuration, or app exit stops the run loop and releases them. A tap disabled by macOS for a slow callback is re-enabled from the callback.
- Configuration is validated in Rust (`utility-input.rs`: ranges, shortcut grammar, distinct non-overlapping triggers, bundle IDs) before the bridge sees it; the bridge clamps again. Synthetic key events carry a marker in `kCGEventSourceUserData` and are ignored by the tap.
- Cleaning mode swallows keyboard events only; Escape three times within two seconds or the in-app button ends it. Snippet expansion and plain paste replace the pasteboard briefly and restore the previous items; the expansion buffer is cleared on clicks, control keys and app switches and never leaves memory.

## Captures and exports

Text recognition uses an explicit macOS screencapture selector. A random mode-0700 temporary directory holds the selected PNG, and an RAII cleanup owner remains with the Vision worker even if the caller times out or navigates away. Cancellation and failure remove captures; a timed-out Vision operation cleans up when its worker completes. Results remain in the current React panel until cleared or unmounted. Recognized barcode contents are plain text.

`utility_export_file({ filename, base64 })` rejects paths/control characters and oversized input. The main-thread NSSavePanel owns destination selection and overwrite confirmation; writes happen after selection through atomic `NSData` saving. A canceled chooser returns `{ cancelled: true }`, never a success path. The caller must only announce successful saving when `cancelled` is false. A cloud/AI caller cannot invoke arbitrary bridge operations.

## Verification

- Second batch (September 9): 55 Rust unit tests pass on Linux (input configuration and shortcut grammar, process parsing and protection, application-path validation, related-file candidates, disk-image plist parsing, update parsing, Homebrew names and arguments, cleaner scans and removal validation, recorder arguments, watcher decisions, keep-awake arguments); 14 React tests cover consent before the first filter, refused configurations, cleaning-mode confirmation, auto-quit confirmation and normalization, protected processes, launcher pins, unchecked related files, cancelled choosers, cleaner selection, Homebrew confirmation, update listing, recorder options and camera start. The desktop suite (862 tests), TypeScript and the production build pass. The Objective-C additions compile only in the Mac workflow.
- TypeScript project build passed after integrating these panels.
- Five UI tests passed: no history enable before explicit confirmation; clear cancellation preserves entries; paused preference saves preserve pause; OCR cancellation preserves previous results; no metrics polling before start and no stale response after pause.
- Twelve native window-script tests passed under Node. Six window-validation Rust tests, six clipboard Rust tests and two sampling Rust tests were added; Rust/Cargo and Apple frameworks are not installed in this Linux workspace, so these require the Mac CI gate.
- Native Objective-C compile, permissions, actual pasteboard markers, audio device disconnect, screen capture cancellation, mixed-scale displays, and NSSavePanel cancellation/overwrite/save must be exercised on a Mac. A passing JavaScript suite does not prove native runtime acceptance.
- The existing shared UI owners remain Button, Input, Textarea, authored Select, and Radix Dialog. Dialogs place initial focus on Cancel and restore the opener. Search fields expose a clear action; background polling skips hidden documents and ignores stale responses.
- The whole-repository strict premium audit reported 43 findings (7 unresolved authored-select ownership detections, 36 existing/shared/gallery findings). None target `MacControls.tsx`; the whole app is not claimed to pass that audit.

Apple API references: [NSPasteboard changeCount](https://developer.apple.com/documentation/appkit/nspasteboard/changecount), [Vision text recognition](https://developer.apple.com/documentation/vision/vnrecognizetextrequest), [Vision document/text/barcode processing](https://developer.apple.com/videos/play/wwdc2021/10041/), and [CoreAudio default output](https://developer.apple.com/documentation/coreaudio/kaudiohardwarepropertydefaultoutputdevice).
