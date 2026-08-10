import type { CSSProperties, ReactNode } from "react";
import { useStore } from "@/store";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { Toolbar } from "./Toolbar";

// One source of truth for the sidebar/main boundary. The first grid track is a
// single `--sidebar-width` custom property.
//
// 216px, matching the prototype markup's `width:216px` on the sidebar's
// inner column (Rabta - Console v2.dc.html) and the README's Window chrome
// section — Task 9 retones this from 208px now that the nav rows carry
// right-aligned counts that need the extra 8px to sit clear of the label.
const EXPANDED_WIDTH = 216;

// Collapsed is zero width, not a narrowed icon rail — the prototype's own
// sidebar style is unambiguous: `s.sidebar ? "flex:0 0 216px;border-right-
// width:0.5px;" : "flex:0 0 0px;border-right-width:0px;"`. There used to be
// an 88px `COLLAPSED_WIDTH` rail here, sized so macOS's traffic lights (a
// ~52px span at x≈18) still had clearance — that clearance need moved to
// the Toolbar instead (see Sidebar.tsx's `SidebarToggleButton` and
// Toolbar.tsx's collapsed-state branch, both built on titlebar.ts's shared
// geometry), so nothing here needs to reserve room for the lights any more.
// No named constant replaces it: the collapsed track is simply 0.
//
// Collapsing is also instant, not animated — "Animating it was tried and
// cut" — so the grid track carries no transition. Only the sidebar's own
// content (labels, icons) still animates in/out; the track itself jumps.
export function AppShell({ children }: { children: ReactNode }) {
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const view = useStore((s) => s.view);

  const shellStyle = {
    gridTemplateColumns: "var(--sidebar-width) minmax(0, 1fr)",
    "--sidebar-width": collapsed ? "0px" : `${EXPANDED_WIDTH}px`,
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
      <div className="relative grid min-h-0 flex-1 overflow-hidden" style={shellStyle}>
        <Sidebar />

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
