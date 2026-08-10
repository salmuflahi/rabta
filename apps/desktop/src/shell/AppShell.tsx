import type { CSSProperties, ReactNode } from "react";
import { useStore } from "@/store";
import { Sidebar } from "./Sidebar";
import { SidebarToggle } from "./SidebarToggle";
import { StatusBar } from "./StatusBar";
import { Toolbar } from "./Toolbar";
import { SIDEBAR_EXPANDED_WIDTH_PX } from "./titlebar";

// One source of truth for the sidebar/main boundary. The first grid track is a
// single `--sidebar-width` custom property (216px — see
// SIDEBAR_EXPANDED_WIDTH_PX in titlebar.ts).
//
// Collapsed is zero width, not a narrowed icon rail — the prototype's own
// sidebar style is unambiguous: `s.sidebar ? "flex:0 0 216px;border-right-
// width:0.5px;" : "flex:0 0 0px;border-right-width:0px;"`. There used to be
// an 88px `COLLAPSED_WIDTH` rail here, sized so macOS's traffic lights (a
// ~52px span at x≈18) still had clearance — that clearance need moved into
// the chrome instead (see titlebar.ts's shared geometry), so nothing here
// reserves room for the lights any more. No named constant replaces it:
// the collapsed track is simply 0.
//
// Phase 2 makes the boundary *move* rather than jump. `--sidebar-width` is
// registered as a `<length>` in index.css, which is what makes it
// interpolable; the `.sidebar-track` class there carries the 280ms macOS
// curve. This is a deliberate divergence from the handoff's "collapse is
// instant, not animated" — see SIDEBAR_MOTION_MS in titlebar.ts for the
// full note. The sidebar's own content stays mounted for the duration of
// the slide (useSidebarPresence) so what leaves the screen is the sidebar,
// not an empty panel.
export function AppShell({ children }: { children: ReactNode }) {
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const view = useStore((s) => s.view);

  const shellStyle = {
    gridTemplateColumns: "var(--sidebar-width) minmax(0, 1fr)",
    "--sidebar-width": collapsed ? "0px" : `${SIDEBAR_EXPANDED_WIDTH_PX}px`,
  } as CSSProperties;

  return (
    // The prototype (Rabta - Console v2.dc.html) draws the status bar as a
    // full-window footer — a sibling of the sidebar/workspace row, not
    // nested inside the workspace column — so it spans under the sidebar
    // too, not just under the toolbar. The outer flex-col here reproduces
    // that: the grid stays the sidebar/main split, StatusBar sits below it
    // at the full shell width.
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* The grid columns are the single source of truth for the sidebar/main
          boundary — one continuous vertical edge, no separate title-bar backing.
          `overflow-hidden` + `min-h-0` on every region keep the shell fixed and
          scroll only the workspace, so the sidebar never moves under the lights. */}
      <div className="sidebar-track relative grid min-h-0 flex-1 overflow-hidden" style={shellStyle}>
        <Sidebar />

        {/* The sidebar toggle is drawn once, here, pinned over the top-left
            corner of the whole shell rather than by whichever column
            happens to be beneath it. That's what keeps it from disappearing
            in fullscreen and from flickering in and out mid-animation —
            see SidebarToggle for the full history. It's a sibling of both
            columns and this grid is `relative`, so it stays put while the
            boundary slides underneath it. */}
        <SidebarToggle />

        {/* A barely-there light pool near the top of the workspace gives the
            cards a lit canvas to lift off of instead of a flat fill. Lives on
            the non-scrolling column so it stays put; the main region is
            transparent over it. Tuned faint (card tone at low alpha) and
            theme-safe — reads on ivory and petrol alike. */}
        <div
          className="flex min-h-0 min-w-0 flex-col overflow-hidden"
          style={{
            background:
              "radial-gradient(120% 55% at 50% 0%, hsl(var(--card) / 0.55), transparent 60%), hsl(var(--background))",
          }}
        >
          <Toolbar />
          <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-x-none p-4">
            {/* Only the workspace scrolls / transitions; the frame is fixed. */}
            <div key={view} className="animate-page-in">
              {children}
            </div>
          </main>
        </div>
      </div>
      <StatusBar />
    </div>
  );
}
