// JavaScript for Automation, run by macOS osascript. Data arrives through argv.
ObjC.import("AppKit");
function run(argv) {
  const request = JSON.parse(argv[0]);
  const process = Application("System Events").processes.byName(request.app);
  if (!process.exists()) throw new Error("The selected app is no longer open.");
  if (!process.windows().length)
    throw new Error("This app has no available window.");
  const window = process.windows[0];
  const title = window.name();
  if (request.restore && title !== request.restore.title)
    throw new Error(
      "The selected window changed. Select the original window before restoring.",
    );
  const old = window.position(),
    size = window.size();
  const before = {
    app: request.app,
    title: title,
    x: old[0],
    y: old[1],
    width: size[0],
    height: size[1],
  };
  let x, y, width, height;
  if (request.restore) {
    x = request.restore.x;
    y = request.restore.y;
    width = request.restore.width;
    height = request.restore.height;
  } else {
    const screen = $.NSScreen.screens.objectAtIndex(0),
      frame = screen.frame,
      visible = screen.visibleFrame;
    const gap = request.gap,
      fullWidth = visible.size.width - 2 * gap,
      fullHeight = visible.size.height - 2 * gap;
    x = visible.origin.x + gap;
    y = frame.size.height - visible.origin.y - visible.size.height + gap;
    width = fullWidth;
    height = fullHeight;
    switch (request.layout) {
      case "left":
        width = (fullWidth - gap) / 2;
        break;
      case "right":
        width = (fullWidth - gap) / 2;
        x += width + gap;
        break;
      case "top-left":
        width = (fullWidth - gap) / 2;
        height = (fullHeight - gap) / 2;
        break;
      case "top-right":
        width = (fullWidth - gap) / 2;
        height = (fullHeight - gap) / 2;
        x += width + gap;
        break;
      case "bottom-left":
        width = (fullWidth - gap) / 2;
        height = (fullHeight - gap) / 2;
        y += height + gap;
        break;
      case "bottom-right":
        width = (fullWidth - gap) / 2;
        height = (fullHeight - gap) / 2;
        x += width + gap;
        y += height + gap;
        break;
      case "center":
        width = Math.min(fullWidth, 1100);
        height = Math.min(fullHeight, 780);
        x += (fullWidth - width) / 2;
        y += (fullHeight - height) / 2;
        break;
      case "maximize":
        break;
      default:
        throw new Error("Unknown window layout.");
    }
  }
  process.frontmost = true;
  window.position = [Math.round(x), Math.round(y)];
  window.size = [Math.round(width), Math.round(height)];
  return JSON.stringify(before);
}
