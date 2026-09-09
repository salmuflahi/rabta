# Native windows implementation

Independently authored, 2026-09-09. No upstream implementation was imported.

## Operational source

- On-demand inventory reads each available application window through macOS Accessibility/System Events, including minimized windows and hidden apps. Window titles stay on the local device. Permission failures are surfaced; a partially readable inventory includes warnings.
- Each selected window can be focused, unminimized, minimized, or sent its native close-button action. Close never answers an app's unsaved-document prompt.
- Layouts include halves, quarters, thirds, sixths, centered and maximized placement, with 0–64 point gaps. The user explicitly chooses any connected display; omitted display defaults to the primary display. Available frames respect the menu bar and Dock. Coordinates account for displays above, below, and left of the primary display.
- Each placement returns its original coordinates and window target for one-step undo.
- Stable native window IDs are used when exposed by the app. Otherwise the saved index and title must still match; ambiguous duplicate titles are rejected. A disconnected display or closed/changed window produces an error instead of changing a substitute window.
- There is no background observer, global shortcut interception or screen capture. A single allowlisted osascript process executes an embedded script with JSON data in argv; the process has a timeout and is killed if dropped.

## Tauri registration

Declare the module in the desktop crate:

    #[path = "utility-windows.rs"]
    mod utility_windows;

Register these three commands:

    utility_windows::utility_list_windows,
    utility_windows::utility_window_action,
    utility_windows::utility_place_window,

## Frontend contract

    type Target = {
      pid: number;
      app: string;
      index: number;
      title: string;
      windowId: number | null;
    };
    type Rect = { x: number; y: number; width: number; height: number };
    type Placement = Rect & { target: Target; app: string; title: string };
    type Inventory = {
      windows: (Rect & {
        target: Target;
        minimized: boolean;
        appHidden: boolean;
        canClose: boolean;
        displayId: string | null;
      })[];
      displays: {
        id: string;
        name: string;
        primary: boolean;
        frame: Rect;
        visibleFrame: Rect;
      }[];
      warnings: string[];
    };

| Command | Arguments | Result |
| --- | --- | --- |
| utility_list_windows | {} | Inventory |
| utility_window_action | { target, action: "focus" / "minimize" / "close" } | { action, app, title } |
| utility_place_window | { target, layout, gap, displayId: string or null, restore: Placement or null } | Original Placement |

Layout IDs: left, right, top-left, top-right, bottom-left, bottom-right, center, maximize, left-third, center-third, right-third, top-left-sixth, top-center-sixth, top-right-sixth, bottom-left-sixth, bottom-center-sixth, bottom-right-sixth.

For undo, supply the returned placement.target as target, the returned placement as restore, any valid layout, gap zero, and displayId null. The UI must clearly label Close as an explicit action. Applications may constrain their minimum window size.

The earlier app/layout/gap/restore operation remains compatible through utility_arrange_window; this API still has its original eight-layout Rust allowlist. The new selected-window command exposes the expanded set.

## Verification and remaining scope

    node --test apps/desktop/src-tauri/tests/utility-window.node.mjs

12 passing tests execute the real embedded script in a VM with a simulated macOS bridge, exercising coordinates, layout gaps, display matching, minimized/hidden inventory, window targeting, close behavior, display disconnection, undo, and the legacy command. Six Rust tests cover request and restore validation. Rust/Cargo and a Mac are unavailable in this environment, so Rust tests and actual OS permissions/interactions have not been executed here.

This is not full switcher or layout parity. Screenshot thumbnails, Dock hover previews/click overrides, global switcher shortcuts, edge snapping, modifier drag/resize and green-button interception remain unimplemented. Spaces/full-screen windows and apps with incomplete Accessibility support require explicit Mac validation. JXA launch latency is suitable for on-demand controls, not a replacement for a native animated switcher.

Before release, verify on macOS 11 and a current Mac: first-run Accessibility/Automation denial and approval; two displays with different scaling arranged in every direction; minimized and hidden apps; unsaved TextEdit close confirmation; disappearing displays; duplicate titles; and apps with fixed minimum window sizes.
