import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useStore, type ConnectorRow } from "@/store";

// Connector types Rabta ships an integration for. The popover always lists
// these so a user can see what's available, connected or not.
const KNOWN_CONNECTORS: { kind: string; name: string }[] = [
  { kind: "vscode", name: "VS Code" },
  { kind: "chrome", name: "Chrome" },
];

type ConnState = "connected" | "offline" | "absent";

function connStateStyles(state: ConnState): { dot: string; text: string; label: string } {
  switch (state) {
    case "connected":
      return { dot: "bg-success", text: "text-success", label: "Connected" };
    case "offline":
      return { dot: "bg-warning", text: "text-warning", label: "Offline" };
    default:
      return { dot: "bg-muted-foreground/40", text: "text-muted-foreground", label: "Not connected" };
  }
}

/** One row per known connector plus any other live connector kind (e.g. a
 * dev fake), each with its current connection state. */
function connectionRows(connectors: ConnectorRow[]): { key: string; name: string; state: ConnState }[] {
  const rows = KNOWN_CONNECTORS.map(({ kind, name }) => {
    const matches = connectors.filter((c) => c.kind === kind);
    const state: ConnState = matches.some((c) => c.connected)
      ? "connected"
      : matches.length > 0
        ? "offline"
        : "absent";
    return { key: kind, name, state };
  });
  const extra = connectors
    .filter((c) => !KNOWN_CONNECTORS.some((k) => k.kind === c.kind))
    .map((c) => ({ key: c.id, name: c.name, state: (c.connected ? "connected" : "offline") as ConnState }));
  return [...rows, ...extra];
}

function ConnectionIndicator() {
  const connectors = useStore((s) => s.connectors);
  const hubPort = useStore((s) => s.hubPort);
  const setView = useStore((s) => s.setView);
  const connectedCount = connectors.filter((c) => c.connected).length;
  const rows = connectionRows(connectors);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${connectedCount} connector${connectedCount === 1 ? "" : "s"} connected. Open connection status.`}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors duration-[120ms] hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              connectedCount > 0 ? "bg-success" : "bg-muted-foreground/40",
            )}
          />
          <span className="truncate">{connectedCount} connected</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-64 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
      >
        <p className="text-meta font-medium text-popover-foreground">Connections</p>
        <p className="mt-0.5 text-label text-muted-foreground">Local hub · 127.0.0.1:{hubPort ?? "…"}</p>
        <div className="mt-3 flex flex-col gap-2">
          {rows.map(({ key, name, state }) => {
            const s = connStateStyles(state);
            return (
              <div key={key} className="flex items-center gap-2 text-meta">
                <span className={cn("size-2 shrink-0 rounded-full", s.dot)} />
                <span className="min-w-0 flex-1 truncate text-foreground">{name}</span>
                <span className={cn("shrink-0 text-label", s.text)}>{s.label}</span>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setView("connectors")}
          className="mt-3 w-full border-t border-border pt-3 text-left text-label font-medium text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Manage connectors →
        </button>
      </PopoverContent>
    </Popover>
  );
}

export function Titlebar() {
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const setCommandOpen = useStore((s) => s.setCommandOpen);

  return (
    <header
      data-tauri-drag-region
      className={cn(
        "grid h-16 shrink-0 items-center border-b border-border/50 bg-background transition-[grid-template-columns] duration-200 ease-out",
        // Left column mirrors the sidebar width so the workspace region (and
        // the search centered within it) tracks the sidebar as it collapses.
        collapsed ? "grid-cols-[68px_1fr]" : "grid-cols-[276px_1fr]",
      )}
    >
      {/* Over the sidebar: draggable space that also clears the macOS
          traffic lights (top-left). */}
      <div className="h-full" />

      <div className="grid h-full grid-cols-[1fr_auto_1fr] items-center gap-2 px-4">
        <div />
        <div className="flex min-w-0 justify-center">
          <Button
            variant="outline"
            className="h-8 min-w-0 max-w-[min(360px,100%)] justify-between gap-3 px-3 text-muted-foreground sm:gap-6"
            onClick={() => setCommandOpen(true)}
          >
            <span className="flex min-w-0 items-center gap-2">
              <Search className="size-3.5 shrink-0 sm:hidden" />
              <span className="hidden truncate text-sm sm:inline">Search or jump to…</span>
            </span>
            <Kbd className="shrink-0">⌘K</Kbd>
          </Button>
        </div>
        <div className="flex min-w-0 items-center justify-end">
          <ConnectionIndicator />
        </div>
      </div>
    </header>
  );
}
