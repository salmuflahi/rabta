import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import { Sidebar } from "./Sidebar";
import { Titlebar } from "./Titlebar";

export function AppShell({ children }: { children: ReactNode }) {
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const view = useStore((s) => s.view);

  return (
    <div className="flex h-full flex-col overflow-x-hidden">
      <Titlebar />
      <div
        className={cn(
          "grid min-h-0 min-w-0 flex-1 transition-[grid-template-columns] duration-200 ease-out",
          // Labels fade faster than this (150ms) so they clear before the
          // width finishes collapsing. Rail stays a clean icon column.
          collapsed ? "grid-cols-[68px_1fr]" : "grid-cols-[276px_1fr]"
        )}
      >
        <Sidebar />
        <main className="min-w-0 overflow-y-auto overflow-x-hidden bg-background p-9">
          {/* Re-key on the active view so each switch quietly fades + rises
              in rather than snapping. */}
          <div key={view} className="animate-page-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
