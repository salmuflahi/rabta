import { act, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { expectAtMostOneAccent } from "@/test/accent";
import { renderWithProviders } from "@/test/smoke-utils";
import { useStore } from "@/store";
import { Sidebar } from "./Sidebar";
import { SIDEBAR_EXPANDED_WIDTH_PX } from "./titlebar";

/** Whole-token class match — see src/test/no-box.ts for why a substring
 * search (e.g. `bg-primary` matching inside `bg-primary-foreground`) isn't
 * a real assertion. */
function hasClassToken(className: string, token: string): boolean {
  return className.split(/\s+/).includes(token);
}

const STORE_DEFAULTS = {
  view: "capsules" as const,
  sidebarCollapsed: false,
};

describe("Sidebar collapse", () => {
  beforeEach(() => {
    localStorage.clear();
    useStore.setState(STORE_DEFAULTS);
  });

  it("toggleSidebar flips state and persists to localStorage", () => {
    expect(useStore.getState().sidebarCollapsed).toBe(false);

    useStore.getState().toggleSidebar();
    expect(useStore.getState().sidebarCollapsed).toBe(true);
    expect(localStorage.getItem("rabta.sidebarCollapsed")).toBe("true");

    useStore.getState().toggleSidebar();
    expect(useStore.getState().sidebarCollapsed).toBe(false);
    expect(localStorage.getItem("rabta.sidebarCollapsed")).toBe("false");
  });

  // OLD CONTRACT (superseded): this test used to assert that collapsing
  // left an 88px icon-only rail behind — nav labels stayed mounted at
  // opacity-0 while the icon buttons remained visible and addressable via
  // an "Overview (⌘1)"-style aria-label. The prototype (Rabta - Console
  // v2.dc.html) draws the collapsed sidebar at zero width with no border —
  // "gone, not a rail" — so there is no icon rail left to keep addressable.
  // Traffic lights and the sidebar toggle move into the Toolbar instead
  // (see Toolbar.test.tsx's "sidebar toggle + traffic lights" describe).
  it("renders no nav content at all once collapsed — the sidebar disappears, it doesn't narrow to an icon rail", async () => {
    useStore.setState({ sidebarCollapsed: false });
    renderWithProviders(<Sidebar />);
    // Expanded: the label is visible and not aria-hidden.
    const expanded = screen.getByText("Overview");
    expect(expanded).toBeInTheDocument();
    expect(expanded.closest("[aria-hidden='true']")).toBeNull();

    // Sidebar reads sidebarCollapsed via useStore, so flipping it in the
    // store re-renders the already-mounted component (no `rerender` needed).
    act(() => {
      useStore.setState({ sidebarCollapsed: true });
    });

    // Phase 2 animates the collapse, so the contents outlive the flag by
    // one animation — they have to, or what slides off the left of the
    // window is an empty petrol box rather than the sidebar. During that
    // window they're already out of the page: aria-hidden, and `inert` so
    // nothing inside can be tabbed to or clicked.
    const leaving = screen.getByText("Overview");
    expect(leaving.closest("[aria-hidden='true']")).not.toBeNull();

    // Then they go, for real: no labels, no icon-only buttons to address.
    // Not merely invisible — not rendered.
    await waitFor(() => {
      expect(screen.queryByText("Overview")).toBeNull();
    });
    expect(screen.queryByRole("button", { name: /Overview/ })).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("collapses to zero width with no right border", () => {
    useStore.setState({ sidebarCollapsed: true });
    const { container } = renderWithProviders(<Sidebar />);
    const aside = container.querySelector("aside");
    expect(aside).not.toBeNull();
    const classes = (aside!.getAttribute("class") || "").split(/\s+/);
    expect(classes).toContain("w-0");
    // Whole-token match: no border-r utility of any kind (not even
    // border-r-0 masking a leftover border-color class) should remain.
    expect(classes.some((c) => c === "border-r" || c.startsWith("border-r-"))).toBe(false);
  });

  it("keeps the expanded sidebar's border and width untouched", () => {
    useStore.setState({ sidebarCollapsed: false });
    const { container } = renderWithProviders(<Sidebar />);
    // The `aside` is now only the clipping frame — its width is the
    // animating grid track. The hairline moved onto the fixed-width content
    // column inside it, so it travels with the panel instead of lingering
    // as a 1px seam once the track reaches zero.
    const aside = container.querySelector("aside");
    expect(aside).not.toBeNull();
    expect((aside!.getAttribute("class") || "").split(/\s+/)).not.toContain("w-0");

    const column = aside!.firstElementChild as HTMLElement | null;
    expect(column).not.toBeNull();
    expect(column!.className.split(/\s+/)).toContain("border-r");
    expect(column!.style.width).toBe(`${SIDEBAR_EXPANDED_WIDTH_PX}px`);
  });

  // The panel slides off the left of the window rather than being wiped
  // from the right: the content column is pinned to the *right* edge of the
  // frame, so narrowing the frame walks the column out of view with its
  // 216px layout intact. Anchored left it would look like a wipe, and every
  // nav row would reflow on every frame.
  it("anchors the content column to the frame's right edge so it slides out", () => {
    useStore.setState({ sidebarCollapsed: false });
    const { container } = renderWithProviders(<Sidebar />);
    const column = container.querySelector("aside")!.firstElementChild as HTMLElement;
    const classes = column.className.split(/\s+/);
    expect(classes).toContain("absolute");
    expect(classes).toContain("right-0");
    expect(container.querySelector("aside")!.className.split(/\s+/)).toContain("overflow-hidden");
  });
});

describe("sidebar chrome", () => {
  // The tiled mark is petrol on a petrol sidebar — invisible. Chrome uses
  // an INLINE monochrome mark, not an <img>: rabta-mark-mono.svg is filled
  // with currentColor, and an SVG loaded through <img src> is an isolated
  // document where currentColor resolves to black. Inlining is what makes
  // the fill inherit the sidebar's ivory.
  it("inlines the mark so it inherits the sidebar's colour", () => {
    const { container } = renderWithProviders(<Sidebar />);
    expect(container.querySelector("img[alt='Rabta']")).toBeNull();
    const svg = container.querySelector("svg[data-brand-mark]");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("aria-label")).toBe("Rabta");
    // currentColor is the whole point — a hardcoded fill would defeat it.
    expect(svg!.innerHTML).toMatch(/currentColor/);
    expect(svg!.innerHTML).not.toMatch(/#102526/);
  });

  // The Context Fold put a second permanent orange element on every screen,
  // which is one more than the accent rule allows.
  it("draws no context fold on nav rows", () => {
    const { container } = renderWithProviders(<Sidebar />);
    expect(container.querySelector("[data-context-fold]")).toBeNull();
    expect(container.innerHTML).not.toMatch(/clip-path:polygon/);
  });
});

describe("sidebar grouping and privacy copy (Task 9)", () => {
  beforeEach(() => {
    useStore.setState({ view: "capsules", sidebarCollapsed: false, fullscreen: false });
  });

  it("renders both nav group headers", () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByText("Workspace")).toBeInTheDocument();
    expect(screen.getByText("This Mac")).toBeInTheDocument();
  });

  // The handoff calls this copy out explicitly as the product's
  // positioning — it ships verbatim, not paraphrased.
  it("renders the local-only shield line verbatim", () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByText("Everything stays on this Mac")).toBeInTheDocument();
  });

  // DELIBERATE DIVERGENCE FROM THE HANDOFF: the handoff fills the selected
  // nav row with the accent. This app uses the neutral `--secondary`
  // surface instead — an accent fill on the sidebar would be permanent on
  // every screen and compete with the toolbar's contextual accent action.
  // This test pins that choice down directly: no element anywhere in the
  // rendered sidebar carries `bg-primary`, regardless of which row is
  // selected.
  it.each(["overview", "capsules", "projects", "connectors", "activity", "settings"] as const)(
    "selected row (%s) is neutral — no bg-primary anywhere in the shell",
    (view) => {
      useStore.setState({ view, sidebarCollapsed: false, fullscreen: false });
      const { container } = renderWithProviders(<Sidebar />);

      const offenders = Array.from(container.querySelectorAll<HTMLElement>("*")).filter((el) =>
        hasClassToken(el.getAttribute("class") || "", "bg-primary"),
      );
      expect(offenders).toHaveLength(0);

      // The selected row's own surface really is the neutral secondary
      // token, not just "not primary" — pins the positive case too.
      const activeButton = container.querySelector("button[aria-current='page']");
      expect(activeButton).not.toBeNull();
      const activeButtonClass = activeButton!.getAttribute("class") || "";
      const groupPill = activeButton!
        .closest("[data-nav-group]")
        ?.querySelector(":scope > [aria-hidden]");
      const paintsNeutralSurface =
        hasClassToken(activeButtonClass, "bg-secondary") ||
        (groupPill !== undefined &&
          groupPill !== null &&
          hasClassToken(groupPill.getAttribute("class") || "", "bg-secondary"));
      expect(paintsNeutralSurface).toBe(true);
    },
  );

  it("keeps the shell within the one-accent-per-view budget", () => {
    const { container } = renderWithProviders(<Sidebar />);
    expectAtMostOneAccent(container);
  });
});
