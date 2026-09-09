// JavaScript for Automation. Every request arrives as JSON argv, never script source.
ObjC.import("AppKit");

function optional(read, fallback) {
  try { return read(); } catch (_) { return fallback; }
}

// NSScreen uses bottom-left coordinates; Accessibility uses the primary display's
// top-left origin. Keep the primary height even when arranging another display.
function accessibleFrame(frame, primaryTop) {
  return {
    x: frame.origin.x,
    y: primaryTop - frame.origin.y - frame.size.height,
    width: frame.size.width,
    height: frame.size.height,
  };
}

function layoutFrame(visible, layout, gap) {
  if (!Number.isInteger(gap) || gap < 0 || gap > 64)
    throw new Error("Choose a gap between 0 and 64 pixels.");
  const full = {
    x: visible.x + gap, y: visible.y + gap,
    width: visible.width - 2 * gap, height: visible.height - 2 * gap,
  };
  const grids = {
    left: [2, 1, 0, 0], right: [2, 1, 1, 0],
    "top-left": [2, 2, 0, 0], "top-right": [2, 2, 1, 0],
    "bottom-left": [2, 2, 0, 1], "bottom-right": [2, 2, 1, 1],
    "left-third": [3, 1, 0, 0], "center-third": [3, 1, 1, 0],
    "right-third": [3, 1, 2, 0],
    "top-left-sixth": [3, 2, 0, 0], "top-center-sixth": [3, 2, 1, 0],
    "top-right-sixth": [3, 2, 2, 0], "bottom-left-sixth": [3, 2, 0, 1],
    "bottom-center-sixth": [3, 2, 1, 1], "bottom-right-sixth": [3, 2, 2, 1],
  };
  if (Object.prototype.hasOwnProperty.call(grids, layout)) {
    const grid = grids[layout], columns = grid[0], rows = grid[1];
    full.width = (full.width - (columns - 1) * gap) / columns;
    full.height = (full.height - (rows - 1) * gap) / rows;
    full.x += grid[2] * (full.width + gap);
    full.y += grid[3] * (full.height + gap);
  } else if (layout === "center") {
    const width = Math.min(full.width, 1100), height = Math.min(full.height, 780);
    full.x += (full.width - width) / 2;
    full.y += (full.height - height) / 2;
    full.width = width;
    full.height = height;
  } else if (layout !== "maximize") {
    throw new Error("Unknown window layout.");
  }
  if (full.width < 100 || full.height < 100)
    throw new Error("This display is too small for that layout and gap.");
  return {
    x: Math.round(full.x), y: Math.round(full.y),
    width: Math.round(full.width), height: Math.round(full.height),
  };
}

function readDisplays() {
  const screens = $.NSScreen.screens;
  if (!screens.count) throw new Error("No connected display is available.");
  const first = screens.objectAtIndex(0).frame;
  const primaryTop = first.origin.y + first.size.height;
  const result = [];
  for (let index = 0; index < screens.count; index++) {
    const screen = screens.objectAtIndex(index);
    result.push({
      id: String(ObjC.unwrap(screen.deviceDescription.objectForKey("NSScreenNumber"))),
      name: optional(function () { return ObjC.unwrap(screen.localizedName); }, "Display " + (index + 1)),
      primary: index === 0,
      frame: accessibleFrame(screen.frame, primaryTop),
      visibleFrame: accessibleFrame(screen.visibleFrame, primaryTop),
    });
  }
  return result;
}

function displayForWindow(rect, displays) {
  let best = null, maximum = 0;
  for (let i = 0; i < displays.length; i++) {
    const f = displays[i].frame;
    const overlap = Math.max(0, Math.min(rect.x + rect.width, f.x + f.width) - Math.max(rect.x, f.x)) *
      Math.max(0, Math.min(rect.y + rect.height, f.y + f.height) - Math.max(rect.y, f.y));
    if (overlap > maximum) { maximum = overlap; best = displays[i].id; }
  }
  return best;
}

function readWindowId(window) {
  const value = optional(function () { return window.id(); }, null);
  return Number.isInteger(value) && value > 0 ? value : null;
}
function minimized(window) {
  return optional(function () { return window.attributes.byName("AXMinimized").value() === true; }, false);
}
function closeButton(window) {
  const attribute = optional(function () { return window.attributes.byName("AXCloseButton").value(); }, null);
  if (attribute) return attribute;
  const buttons = window.buttons();
  for (let i = 0; i < buttons.length; i++) {
    if (optional(function () { return buttons[i].subrole(); }, "") === "AXCloseButton") return buttons[i];
  }
  return null;
}
function targetFor(process, window, index) {
  return { pid: process.unixId(), app: process.name(), index: index,
    title: String(optional(function () { return window.name(); }, "")), windowId: readWindowId(window) };
}
function assertTarget(actual, expected) {
  if (actual.pid !== expected.pid || actual.app !== expected.app || actual.title !== expected.title ||
      (expected.windowId !== null && expected.windowId !== undefined && actual.windowId !== expected.windowId)) {
    throw new Error("The selected window changed. Refresh the window list and select it again.");
  }
}
function resolveWindow(events, request) {
  let process, window, index = 0;
  if (request.target) {
    const matches = events.processes.whose({unixId: request.target.pid})();
    if (matches.length !== 1) throw new Error("The selected app is no longer open.");
    process = matches[0];
    const windows = process.windows();
    if (request.target.windowId !== null && request.target.windowId !== undefined) {
      index = -1;
      for (let i = 0; i < windows.length; i++) {
        if (readWindowId(windows[i]) === request.target.windowId) { index = i; break; }
      }
    } else {
      index = request.target.index;
      // Index-only windows need a unique title so close cannot select a reordered twin.
      let matchingTitles = 0;
      for (let i = 0; i < windows.length; i++) {
        if (String(optional(function () { return windows[i].name(); }, "")) === request.target.title) matchingTitles++;
      }
      if (matchingTitles > 1)
        throw new Error("This app has multiple windows with the same title and no stable window IDs. Choose the window inside the app.");
    }
    if (index < 0 || index >= windows.length) throw new Error("The selected window is no longer available. Refresh the list.");
    window = windows[index];
    assertTarget(targetFor(process, window, index), request.target);
  } else {
    // Backward compatibility for the existing arrange-front-window command.
    process = events.processes.byName(request.app);
    if (!process.exists()) throw new Error("The selected app is no longer open.");
    const windows = process.windows();
    if (!windows.length) throw new Error("This app has no available window.");
    window = windows[0];
  }
  return {process: process, window: window, index: index};
}
function placement(selected) {
  const p = selected.window.position(), size = selected.window.size();
  const target = targetFor(selected.process, selected.window, selected.index);
  return {app: target.app, title: target.title, x: p[0], y: p[1], width: size[0], height: size[1], target: target};
}

function run(argv) {
  const request = JSON.parse(argv[0]), events = Application("System Events");
  const operation = request.operation || "arrange";
  if (["list", "action", "arrange"].indexOf(operation) < 0) throw new Error("Unknown window operation.");
  if (operation === "list") {
    const displays = readDisplays(), windows = [], warnings = [];
    // The initial call intentionally propagates permission errors to the caller.
    const processes = events.processes.whose({backgroundOnly: false})();
    for (let p = 0; p < processes.length; p++) {
      const process = processes[p];
      const name = optional(function () { return process.name(); }, "Application");
      try {
        const appWindows = process.windows(), hidden = !process.visible();
        for (let w = 0; w < appWindows.length; w++) {
          if (windows.length >= 250) {
            warnings.push("Only the first 250 available windows are shown.");
            return JSON.stringify({windows: windows, displays: displays, warnings: warnings});
          }
          try {
            const selected = {process: process, window: appWindows[w], index: w};
            const before = placement(selected);
            windows.push({ target: before.target,
              x: before.x, y: before.y, width: before.width, height: before.height,
              minimized: minimized(appWindows[w]), appHidden: hidden,
              canClose: optional(function () { const b = closeButton(appWindows[w]); return !!b && b.enabled(); }, false),
              displayId: displayForWindow(before, displays) });
          } catch (_) { warnings.push(name + ": a window could not be read. It may have closed or blocked Accessibility access."); }
        }
      } catch (_) { warnings.push(name + ": windows are unavailable. Check Accessibility and Automation access."); }
    }
    return JSON.stringify({windows: windows, displays: displays, warnings: warnings});
  }
  const selected = resolveWindow(events, request), process = selected.process, window = selected.window;
  if (operation === "action") {
    if (request.action === "focus") {
      process.visible = true;
      if (minimized(window)) window.attributes.byName("AXMinimized").value = false;
      process.frontmost = true;
      window.actions.byName("AXRaise").perform();
    } else if (request.action === "minimize") {
      window.attributes.byName("AXMinimized").value = true;
    } else if (request.action === "close") {
      const button = closeButton(window);
      if (!button || !button.enabled()) throw new Error("This window does not expose a close button.");
      button.actions.byName("AXPress").perform();
      // The target app retains its own unsaved-document confirmation. Do not answer it.
    } else { throw new Error("Unknown window action."); }
    return JSON.stringify({action: request.action, app: request.target.app, title: request.target.title});
  }
  const before = placement(selected);
  let next;
  if (request.restore) {
    if (before.title !== request.restore.title || before.app !== request.restore.app)
      throw new Error("Select the original window before restoring its placement.");
    next = request.restore;
  } else {
    const displays = readDisplays();
    let display = displays[0];
    if (request.displayId !== null && request.displayId !== undefined) {
      display = null;
      for (let d = 0; d < displays.length; d++) if (displays[d].id === request.displayId) display = displays[d];
      if (!display) throw new Error("That display was disconnected. Refresh the window list.");
    }
    next = layoutFrame(display.visibleFrame, request.layout, request.gap);
  }
  if (minimized(window)) window.attributes.byName("AXMinimized").value = false;
  process.visible = true;
  process.frontmost = true;
  window.position = [Math.round(next.x), Math.round(next.y)];
  window.size = [Math.round(next.width), Math.round(next.height)];
  window.position = [Math.round(next.x), Math.round(next.y)];
  return JSON.stringify(before);
}
