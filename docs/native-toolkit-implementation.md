# Native toolkit implementation — September 9, 2026

This is independently authored source for the Rabta desktop app. No Vorssaint source was imported, and the repository license is unchanged. These capabilities add working native operations; they do not complete the 57-row parity checklist in `native-suite-parity.md`.

## Native service

`apps/desktop/src-tauri/src/native-toolkit.m` is compiled into the Mac executable by `build.rs`, using the selected Rust target architecture and a macOS 11.0 minimum. AppKit, Foundation, Vision, CoreAudio and IOKit are linked system frameworks. The installed app does not need Xcode or Swift installed. Non-Mac Rust targets do not compile or link the Objective-C service, and its commands return an explicit unsupported-platform error.

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

## Clipboard privacy and lifecycle

- Disabled on launch. An app-owned consent dialog explains collection before enabling. The initial clipboard is not imported: enable/resume/settings changes establish a counter-only baseline.
- Text stays in Rust memory; at most 100 entries, 32 KiB per entry and 2 MB in total. Retention choices are 1, 8 or 24 hours, measured with a monotonic clock. Pins reorder entries but never bypass expiry or storage limits.
- Pause skips pasteboard reads. Disable clears remembered entries. Closing the app clears memory and stops the single owner-managed worker. Closing only the Utilities panel leaves an explicitly enabled session running, which the consent text explains.
- Common password-manager bundle IDs remain excluded. Apps' concealed/transient/auto-generated/password pasteboard markers are rejected before reading text. Unknown frontmost-app identity fails closed. This cannot identify every unmarked secret copied from arbitrary apps or an app transition; the UI clearly tells users to pause before sensitive copies.
- Configurable exclusions use the frontmost application's bundle ID when the worker checks the clipboard, up to 500 ms after copying. Rapid app switches can hide the actual source. The UI names this limitation and does not claim source attribution. Up to 100 custom bundle IDs are normalized/deduplicated alongside protected defaults; saved settings round-trip. Pause/disable bypass unrelated preference validation and native calls, so invalid settings cannot trap a user in active collection. An explicit `updatePreferences` flag distinguishes settings saves: valid paused edits apply without a native read, while invalid saves report an error and preserve both the pause and the previous valid preferences.
- Settings/clear/copy changes invalidate in-flight samples. Clear establishes a new baseline so the unchanged system clipboard is not re-imported. No action changes the system clipboard except an explicit Copy button.
- No team sync, telemetry, account persistence, logs containing entries, or automatic AI access.

## Captures and exports

Text recognition uses an explicit macOS screencapture selector. A random mode-0700 temporary directory holds the selected PNG, and an RAII cleanup owner remains with the Vision worker even if the caller times out or navigates away. Cancellation and failure remove captures; a timed-out Vision operation cleans up when its worker completes. Results remain in the current React panel until cleared or unmounted. Recognized barcode contents are plain text.

`utility_export_file({ filename, base64 })` rejects paths/control characters and oversized input. The main-thread NSSavePanel owns destination selection and overwrite confirmation; writes happen after selection through atomic `NSData` saving. A canceled chooser returns `{ cancelled: true }`, never a success path. The caller must only announce successful saving when `cancelled` is false. A cloud/AI caller cannot invoke arbitrary bridge operations.

## Verification

- TypeScript project build passed after integrating these panels.
- Five UI tests passed: no history enable before explicit confirmation; clear cancellation preserves entries; paused preference saves preserve pause; OCR cancellation preserves previous results; no metrics polling before start and no stale response after pause.
- Twelve native window-script tests passed under Node. Six window-validation Rust tests, six clipboard Rust tests and two sampling Rust tests were added; Rust/Cargo and Apple frameworks are not installed in this Linux workspace, so these require the Mac CI gate.
- Native Objective-C compile, permissions, actual pasteboard markers, audio device disconnect, screen capture cancellation, mixed-scale displays, and NSSavePanel cancellation/overwrite/save must be exercised on a Mac. A passing JavaScript suite does not prove native runtime acceptance.
- The existing shared UI owners remain Button, Input, Textarea, authored Select, and Radix Dialog. Dialogs place initial focus on Cancel and restore the opener. Search fields expose a clear action; background polling skips hidden documents and ignores stale responses.
- The whole-repository strict premium audit reported 43 findings (7 unresolved authored-select ownership detections, 36 existing/shared/gallery findings). None target `MacControls.tsx`; the whole app is not claimed to pass that audit.

Apple API references: [NSPasteboard changeCount](https://developer.apple.com/documentation/appkit/nspasteboard/changecount), [Vision text recognition](https://developer.apple.com/documentation/vision/vnrecognizetextrequest), [Vision document/text/barcode processing](https://developer.apple.com/videos/play/wwdc2021/10041/), and [CoreAudio default output](https://developer.apple.com/documentation/coreaudio/kaudiohardwarepropertydefaultoutputdevice).
