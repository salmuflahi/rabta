import {
  History,
  Link,
  MessageSquare,
  Plug,
  PlugZap,
  Search,
  Send,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Row } from "@/components/ui/row";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Section } from "@/components/ui/section";
import { Surface } from "@/components/ui/surface";
import { describeEvent, relativeTime } from "@/lib/humanize";
import { cn } from "@/lib/utils";
import { useStore, type LogEntry } from "@/store";

const KINDS: { value: string; label: string }[] = [
  { value: "all", label: "All Kinds" },
  { value: "connectorConnected", label: "Connector Connected" },
  { value: "connectorDisconnected", label: "Connector Disconnected" },
  { value: "commandSent", label: "Command Sent" },
  { value: "responseReceived", label: "Response Received" },
  { value: "eventReceived", label: "Event Received" },
];

// Maps `describeEvent(...).icon` strings to lucide icons. "connector" is
// refined further below (PlugZap for connect, Plug for disconnect) using the
// entry's own `type`, since describeEvent doesn't distinguish the two.
const ICONS: Record<string, LucideIcon> = {
  connector: Plug,
  command: Send,
  response: MessageSquare,
  event: Zap,
  pairing: Link,
  generic: History,
};

function iconFor(entry: LogEntry, icon: string): LucideIcon {
  if (entry.type === "connectorConnected") return PlugZap;
  return ICONS[icon] ?? ICONS.generic;
}

function entryConnectorId(e: LogEntry) {
  return (e.connectorId as string | undefined) ?? (e.connector as { id?: string } | undefined)?.id;
}

function LogRow({
  entry,
  resolveName,
}: {
  entry: LogEntry;
  resolveName: (id: string) => string | undefined;
}) {
  const { icon, sentence } = describeEvent(entry, resolveName);
  const Icon = iconFor(entry, icon);

  return (
    <Row
      className={cn(entry.historical && "opacity-60")}
      leading={
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="size-3.5" />
        </span>
      }
      title={sentence}
      subtitle={
        <details className="group min-w-0">
          <summary className="cursor-pointer select-none rounded-sm text-label text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Details
          </summary>
          <pre className="mt-1 max-h-40 min-w-0 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/40 p-2 font-mono text-label text-muted-foreground">
            {JSON.stringify(entry, null, 2)}
          </pre>
        </details>
      }
      trailing={
        <div className="flex items-center gap-2">
          {entry.historical && (
            <Badge variant="secondary" className="text-label">
              Historical
            </Badge>
          )}
          <span className="font-mono text-label tabular-nums text-muted-foreground">
            {relativeTime(entry.at)}
          </span>
        </div>
      }
    />
  );
}

export function ActivityPage() {
  const log = useStore((s) => s.log);
  const paused = useStore((s) => s.paused);
  const togglePause = useStore((s) => s.togglePause);
  const connectors = useStore((s) => s.connectors);
  const [kindFilter, setKindFilter] = useState("all");
  const [connFilter, setConnFilter] = useState("all");
  const [query, setQuery] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  const resolveName = (id: string) => connectors.find((c) => c.id === id)?.name;

  const q = query.trim().toLowerCase();
  const shown = log.filter((e) => {
    if (kindFilter !== "all" && e.type !== kindFilter) return false;
    if (connFilter !== "all" && entryConnectorId(e) !== connFilter) return false;
    if (q) {
      // Match the humanized sentence a user actually reads, plus the raw
      // payload (branch names, paths, error strings) they might be hunting for.
      const hay = `${describeEvent(e, resolveName).sentence} ${JSON.stringify(e)}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  useEffect(() => {
    if (!paused) scroller.current?.scrollTo(0, scroller.current.scrollHeight);
  }, [log, paused]);

  const subtitle = `${log.length} ${log.length === 1 ? "event" : "events"}`;
  const isFiltered = kindFilter !== "all" || connFilter !== "all" || q !== "";

  return (
    <div className="flex h-full flex-col">
      {/* The toolbar now names the page (Task 11); this stays for the
          existing findByText/getByText("Activity") contract and screen
          readers. The total event count is genuinely useful — kept, but
          moved onto the Events section below (as its action) rather than
          restated up here, since it only means something once there is a
          list of events under it. */}
      <h2 className="sr-only">Activity</h2>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search activity…"
            aria-label="Search activity"
            className="w-56 pl-8"
          />
        </div>

        <Select value={connFilter} onValueChange={setConnFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Connectors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Connectors</SelectItem>
            {connectors.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={kindFilter} onValueChange={setKindFilter}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="All Kinds" />
          </SelectTrigger>
          <SelectContent>
            {KINDS.map((k) => (
              <SelectItem key={k.value} value={k.value}>
                {k.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Only controls whether the view follows the newest event — the feed
            itself keeps recording. Labelled for what it actually does. */}
        <Button
          variant="outline"
          onClick={togglePause}
          aria-label={paused ? "Resume auto-scroll" : "Pause auto-scroll"}
        >
          {paused ? "Resume scroll" : "Pause scroll"}
        </Button>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={<History />}
          title={isFiltered ? "No matching activity" : "No activity yet"}
          description="Connector events, commands, and responses will show up here as they happen."
        />
      ) : (
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
          <Section
            label="Events"
            className="pb-4"
            action={<span className="text-meta text-muted-foreground">{subtitle}</span>}
          >
            <Surface>
              {shown.map((e) => (
                <LogRow key={e.seq} entry={e} resolveName={resolveName} />
              ))}
            </Surface>
          </Section>
        </div>
      )}
    </div>
  );
}
