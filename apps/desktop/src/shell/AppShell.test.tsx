import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/smoke-utils";
import { useStore } from "@/store";
import { AppShell } from "./AppShell";

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

  // The handoff is explicit that collapsing is instant — "Animating it was
  // tried and cut." Any `transition` touching grid-template-columns (or the
  // custom property driving it) would reintroduce that.
  it.each([true, false])("never puts a transition on the grid track (collapsed=%s)", (collapsed) => {
    useStore.setState({ sidebarCollapsed: collapsed, fullscreen: false });
    const { container } = renderWithProviders(<AppShell>content</AppShell>);
    const grid = gridEl(container);
    expect(grid.style.transition).toBe("");
  });
});
