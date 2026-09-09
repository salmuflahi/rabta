import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../src/utility-window.js", import.meta.url), "utf8");
function script(extra = {}) {
  const context = vm.createContext({ObjC: {import() {}, unwrap: (value) => value}, ...extra});
  vm.runInContext(source, context);
  return context;
}
function plain(value) { return JSON.parse(JSON.stringify(value)); }
const api = script();
const primary = {x: 0, y: 25, width: 1440, height: 835};
function screen(id, x, y, width, height) {
  return {
    frame: {origin: {x, y}, size: {width, height}},
    visibleFrame: {origin: {x, y: y + 40}, size: {width, height: height - 65}},
    deviceDescription: {objectForKey: () => id},
    localizedName: "Display " + id,
  };
}
function fixture(windows, {hidden = false} = {}) {
  const process = {unixId: () => 42, name: () => "TextEdit", windows: () => windows, visible: () => !hidden};
  const screens = [screen(1, 0, 0, 1440, 900), screen(2, -1920, 200, 1920, 1080)];
  const events = {processes: {
    whose: (criteria) => () => ("unixId" in criteria && criteria.unixId !== 42 ? [] : [process]),
    byName: () => ({...process, exists: () => true}),
  }};
  return script({Application: () => events, $: {NSScreen: {screens: {
    count: screens.length, objectAtIndex: (index) => screens[index],
  }}}});
}
function fakeWindow({id = 82, title = "Draft", isMinimized = false} = {}) {
  const calls = [], rect = {position: [-1900, -100], size: [900, 700]};
  const close = {enabled: () => true, actions: {byName: (action) => ({perform: () => calls.push(action)})}};
  const minimum = {value: () => isMinimized};
  const window = {
    id: () => id, name: () => title,
    attributes: {byName: (name) => name === "AXMinimized" ? minimum : {value: () => close}},
    buttons: () => [close],
    actions: {byName: (action) => ({perform: () => calls.push(action)})},
  };
  for (const name of ["position", "size"]) {
    Object.defineProperty(window, name, {
      get: () => () => rect[name],
      set: (value) => { rect[name] = value; calls.push(name); },
    });
  }
  return {window, calls, rect, minimum};
}
function target(extra = {}) { return {pid: 42, app: "TextEdit", index: 0, title: "Draft", windowId: 82, ...extra}; }
function run(context, request) { return JSON.parse(context.run([JSON.stringify(request)])); }

test("secondary displays above/left use the primary top as AX origin", () => {
  assert.deepEqual(plain(api.accessibleFrame({origin: {x: -1920, y: 240}, size: {width: 1920, height: 1080}}, 900)),
    {x: -1920, y: -420, width: 1920, height: 1080});
  assert.deepEqual(plain(api.accessibleFrame({origin: {x: 0, y: -1080}, size: {width: 1920, height: 1080}}, 900)),
    {x: 0, y: 900, width: 1920, height: 1080});
});

test("thirds and sixths fill available space with consistent margins and gaps", () => {
  const thirds = ["left-third", "center-third", "right-third"].map((layout) => api.layoutFrame(primary, layout, 12));
  assert.equal(thirds[0].x, 12);
  assert.equal(thirds[0].y, 37);
  assert.ok(Math.abs(thirds[2].x + thirds[2].width - 1428) <= 1);
  for (let i = 1; i < 3; i++) assert.ok(Math.abs(thirds[i].x - (thirds[i - 1].x + thirds[i - 1].width) - 12) <= 1);
  const top = api.layoutFrame(primary, "top-center-sixth", 12);
  const bottom = api.layoutFrame(primary, "bottom-center-sixth", 12);
  assert.equal(top.x, thirds[1].x);
  assert.ok(Math.abs(bottom.y - top.y - top.height - 12) <= 1);
  assert.ok(Math.abs(bottom.y + bottom.height - (primary.y + primary.height - 12)) <= 1);
});

test("layout rejects invalid names, hostile object keys, large gaps and unusable displays", () => {
  for (const layout of ["constructor", "__proto__", "run script"]) assert.throws(() => api.layoutFrame(primary, layout, 12), /Unknown window layout/);
  for (const gap of [-1, 65, 1.5]) assert.throws(() => api.layoutFrame(primary, "left", gap), /gap/);
  assert.throws(() => api.layoutFrame({x: 0, y: 0, width: 250, height: 250}, "left-third", 64), /too small/);
});

test("display assignment follows largest overlap and reports offscreen windows", () => {
  const displays = [{id: "a", frame: {x: 0, y: 0, width: 1000, height: 1000}}, {id: "b", frame: {x: 1000, y: 0, width: 1000, height: 1000}}];
  assert.equal(api.displayForWindow({x: 900, y: 20, width: 500, height: 100}, displays), "b");
  assert.equal(api.displayForWindow({x: -500, y: -500, width: 100, height: 100}, displays), null);
});

test("inventory retains minimized windows, hidden apps and all displays", () => {
  const item = fakeWindow({isMinimized: true});
  const response = run(fixture([item.window], {hidden: true}), {operation: "list"});
  assert.equal(response.windows.length, 1);
  assert.equal(response.windows[0].minimized, true);
  assert.equal(response.windows[0].appHidden, true);
  assert.equal(response.windows[0].canClose, true);
  assert.equal(response.windows[0].displayId, "2");
  assert.equal(response.displays.length, 2);
  assert.equal(response.displays[1].frame.y, -380);
  assert.deepEqual(item.calls, []);
});

test("focus unminimizes and raises only the selected stable window after reordering", () => {
  const other = fakeWindow({id: 81, title: "Another"}), selected = fakeWindow({isMinimized: true});
  const response = run(fixture([other.window, selected.window]), {operation: "action", action: "focus", target: target()});
  assert.equal(response.action, "focus");
  assert.equal(selected.minimum.value, false);
  assert.deepEqual(selected.calls, ["AXRaise"]);
  assert.deepEqual(other.calls, []);
});

test("stale title cannot close a different window", () => {
  const selected = fakeWindow({title: "Different"});
  assert.throws(() => run(fixture([selected.window]), {operation: "action", action: "close", target: target()}), /selected window changed/);
  assert.deepEqual(selected.calls, []);
});

test("close rejects ambiguous duplicate titles when no stable window ID is available", () => {
  const first = fakeWindow({id: null}), second = fakeWindow({id: null});
  assert.throws(() => run(fixture([first.window, second.window]), {
    operation: "action", action: "close", target: target({windowId: null}),
  }), /multiple windows with the same title/);
  assert.deepEqual(first.calls, []);
  assert.deepEqual(second.calls, []);
});

test("close invokes only AXPress, leaving the application's save confirmation to the user", () => {
  const selected = fakeWindow();
  run(fixture([selected.window]), {operation: "action", action: "close", target: target()});
  assert.deepEqual(selected.calls, ["AXPress"]);
});

test("layout on disconnected display fails before moving a window", () => {
  const selected = fakeWindow();
  assert.throws(() => run(fixture([selected.window]), {operation: "arrange", target: target(), layout: "left-third", gap: 12, displayId: "99"}), /disconnected/);
  assert.deepEqual(selected.calls, []);
});

test("multi-display placement returns original bounds and restores them", () => {
  const selected = fakeWindow(), context = fixture([selected.window]);
  const before = run(context, {operation: "arrange", target: target(), layout: "bottom-right-sixth", gap: 12, displayId: "2"});
  assert.deepEqual([before.x, before.y, before.width, before.height], [-1900, -100, 900, 700]);
  assert.ok(selected.rect.position[0] < 0);
  assert.ok(selected.rect.size[0] < 650);
  run(context, {operation: "arrange", target: target(), restore: before});
  assert.deepEqual(plain(selected.rect.position), [-1900, -100]);
  assert.deepEqual(plain(selected.rect.size), [900, 700]);
});

test("legacy app/layout/gap command still arranges the app's front window", () => {
  const selected = fakeWindow();
  const before = run(fixture([selected.window]), {app: "TextEdit", layout: "maximize", gap: 12});
  assert.equal(before.app, "TextEdit");
  assert.deepEqual(plain(selected.rect.position), [12, 37]);
  assert.deepEqual(plain(selected.rect.size), [1416, 811]);
});
