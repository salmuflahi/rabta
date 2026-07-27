import { Search } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useStore, type ConnectorRow } from "@/store";

/** Visible entry point to the ⌘K command palette. Without it the palette is
 * discoverable only by devs who already know the shortcut — so this both opens
 * it (real: toggles the store's commandOpen) and teaches the binding. */
function SearchTrigger() {
  const toggleCommandOpen = useStore((s) => s.toggleCommandOpen);
  return (
    <button
      type="button"
      onClick={toggleCommandOpen}
      aria-label="Search or jump to anything (Command K)"
      className="flex items-center gap-2 rounded-lg border border-border/70 bg-card/60 py-1.5 pl-2.5 pr-1.5 text-meta text-muted-foreground transition-colors duration-fast ease-standard hover:border-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Search className="size-3.5 shrink-0" />
      <span className="hidden sm:inline">Search or jump to…</span>
      <Kbd className="ml-1">⌘K</Kbd>
    </button>
  );
}

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
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors duration-fast ease-standard hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
        <p className="mt-0.5 text-label text-muted-foreground">Local hub · localhost:{hubPort ?? "…"}</p>
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
          className="mt-3 w-full border-t border-border pt-3 text-left text-label font-medium text-primary transition-colors duration-fast ease-standard hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Manage connectors →
        </button>
      </PopoverContent>
    </Popover>
  );
}

/** The workspace toolbar: a slim, mostly-draggable strip that begins at the
 * sidebar boundary. Global search now lives behind ⌘K (see CommandPalette),
 * so the only control here is the connection status. */
export function Toolbar() {
  return (
    <header
      data-tauri-drag-region
      className="flex h-[60px] shrink-0 items-center justify-between gap-3 border-b border-border/50 bg-background px-4"
    >
      <SearchTrigger />
      <ConnectionIndicator />
    </header>
  );
}
