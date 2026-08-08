import type { CSSProperties, ReactNode } from "react";
import { useStore } from "@/store";
import { Sidebar } from "./Sidebar";
import { Toolbar } from "./Toolbar";

// One source of truth for the sidebar/main boundary. The first grid track is a
// single `--sidebar-width` custom property; collapsing animates that width with
// the shared sidebar duration + settling ease, and the workspace (the
// `minmax(0,1fr)` track) grows into the freed space in the very same
// transition.
const EXPANDED_WIDTH = 208;

// The collapsed rail stays 88px: macOS overlays the traffic lights at x≈18
// with a ~52px span, so anything narrower clips them. With the tighter row
// metrics the icon tile no longer fills that rail, so icons centre in it and
// shift ~17px during the transition — the previous "icons never move
// horizontally" invariant is deliberately traded for the tighter open rail.
const COLLAPSED_WIDTH = 88;

export function AppShell({ children }: { children: ReactNode }) {
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const view = useStore((s) => s.view);

  const shellStyle = {
    gridTemplateColumns: "var(--sidebar-width) minmax(0, 1fr)",
    "--sidebar-width": `${collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH}px`,
    transition: "grid-template-columns var(--motion-sidebar) var(--ease-standard)",
  } as CSSProperties;

  return (
    // The grid columns are the single source of truth for the sidebar/main
    // boundary — one continuous vertical edge, no separate title-bar backing.
    // `overflow-hidden` + `min-h-0` on every region keep the shell fixed and
    // scroll only the workspace, so the sidebar never moves under the lights.
    <div className="relative grid h-full min-h-0 overflow-hidden" style={shellStyle}>
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
  );
}
