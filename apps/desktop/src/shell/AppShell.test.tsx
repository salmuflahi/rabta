import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/smoke-utils";
import { useStore } from "@/store";
import { AppShell } from "./AppShell";
import { SIDEBAR_MOTION_MS } from "./titlebar";

/** The sidebar/main split lives on a single grid element whose first track
 * is driven entirely by the `--sidebar-width` custom property (see
 * AppShell.tsx's own comment on why). These tests pin the two states the
 * prototype (Rabta - Console v2.dc.html) specifies for that property:
 * `s.sidebar ? "flex:0 0 216px;border-right-width:0.5px;" : "flex:0 0
 * 0px;border-right-width:0px;"` — collapsed is zero width, not a narrowed
 * icon rail. There used to be an 88px `COLLAPSED_WIDTH` rail here (removed
 * by the collapse-fix task); this file replaces whatever asserted that
 * number. */
function gridEl(container: HTMLElement): HTMLElement {
  // The grid is the only element in the tree whose inline style declares
  // the custom property — found by content rather than a brittle selector
  // path, so restructuring unrelated wrapper divs doesn't break this test.
  const all = Array.from(container.querySelectorAll<HTMLElement>("*"));
  const grid = all.find((el) => el.style.getPropertyValue("--sidebar-width") !== "");
  expect(grid, "no element declares --sidebar-width").not.toBeUndefined();
  return grid!;
}

describe("AppShell sidebar collapse", () => {
  it("collapses the sidebar track to zero width", () => {
    useStore.setState({ sidebarCollapsed: true, fullscreen: false });
    const { container } = renderWithProviders(<AppShell>content</AppShell>);
    const grid = gridEl(container);
    expect(grid.style.getPropertyValue("--sidebar-width")).toBe("0px");
  });

  it("expands the sidebar track to 216px", () => {
    useStore.setState({ sidebarCollapsed: false, fullscreen: false });
    const { container } = renderWithProviders(<AppShell>content</AppShell>);
    const grid = gridEl(container);
    expect(grid.style.getPropertyValue("--sidebar-width")).toBe("216px");
  });

  // SUPERSEDED CONTRACT. This used to assert the grid track carried *no*
  // transition, on the handoff's "Sidebar collapse is instant, not
  // animated. Animating it was tried and cut." Phase 2 reverses that on the
  // product owner's explicit call: the panel slides out and back.
  //
  // The mechanism is a registered custom property — `@property
  // --sidebar-width { syntax: "<length>" }` in index.css — because an
  // unregistered custom property is an untyped token and snaps between
  // values however smooth the transition declaration looks. The transition
  // itself rides on the `.sidebar-track` class rather than an inline style,
  // so the global prefers-reduced-motion rule can still clamp it.
  it.each([true, false])("animates the grid track (collapsed=%s)", (collapsed) => {
    useStore.setState({ sidebarCollapsed: collapsed, fullscreen: false });
    const { container } = renderWithProviders(<AppShell>content</AppShell>);
    expect(gridEl(container).className.split(/\s+/)).toContain("sidebar-track");
  });

  it("registers --sidebar-width as an interpolable length", () => {
    // Read the stylesheet rather than the DOM: jsdom has no @property
    // support, so this is the only place the registration can be verified,
    // and a plain `transition: --sidebar-width` without it would silently
    // do nothing in the real app.
    const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");
    expect(css).toMatch(/@property\s+--sidebar-width\s*\{[^}]*syntax:\s*"<length>"/);
    expect(css).toMatch(/\.sidebar-track\s*\{[^}]*transition:\s*--sidebar-width/);
    // Same 280ms in the stylesheet, the Tailwind `duration-sidebar` token
    // and the JS constant that times the content's unmount.
    expect(css).toMatch(new RegExp(`\\.sidebar-track\\s*\\{[^}]*${SIDEBAR_MOTION_MS}ms`));
  });
});
