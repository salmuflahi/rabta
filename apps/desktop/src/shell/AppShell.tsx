import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Titlebar } from "./Titlebar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <Titlebar />
      <div className="grid min-h-0 flex-1 grid-cols-[220px_1fr]">
        <Sidebar />
        <main className="overflow-y-auto bg-background p-9">{children}</main>
      </div>
    </div>
  );
}
