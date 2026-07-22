import { History } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/shell/PageHeader";
import { useStore, type LogEntry } from "@/store";

const KINDS: { value: string; label: string }[] = [
  { value: "all", label: "All Kinds" },
  { value: "connectorConnected", label: "Connector Connected" },
  { value: "connectorDisconnected", label: "Connector Disconnected" },
  { value: "commandSent", label: "Command Sent" },
  { value: "responseReceived", label: "Response Received" },
  { value: "eventReceived", label: "Event Received" },
];

function entryConnectorId(e: LogEntry) {
  return (e.connectorId as string | undefined) ?? (e.connector as { id?: string } | undefined)?.id;
}

function LogRow({ entry }: { entry: LogEntry }) {
  return (
    <div className={`rounded-md border border-border/60 p-2 ${entry.historical ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{entry.at}</span>
        {entry.historical && <Badge variant="outline">[hist]</Badge>}
        <Badge>{entry.type}</Badge>
      </div>
      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-xs text-muted-foreground">
        {JSON.stringify(entry)}
      </pre>
    </div>
  );
}

export function ActivityPage() {
  const log = useStore((s) => s.log);
  const paused = useStore((s) => s.paused);
  const togglePause = useStore((s) => s.togglePause);
  const connectors = useStore((s) => s.connectors);
  const [kindFilter, setKindFilter] = useState("all");
  const [connFilter, setConnFilter] = useState("all");
  const scroller = useRef<HTMLDivElement>(null);

  const shown = log.filter(
    (e) =>
      (kindFilter === "all" || e.type === kindFilter) &&
      (connFilter === "all" || entryConnectorId(e) === connFilter)
  );

  useEffect(() => {
    if (!paused) scroller.current?.scrollTo(0, scroller.current.scrollHeight);
  }, [log, paused]);

  const subtitle = `${log.length} ${log.length === 1 ? "event" : "events"}`;

  return (
    <div className="flex h-full flex-col">
      <PageHeader eyebrow="HISTORY" title="Activity" subtitle={subtitle} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={connFilter} onValueChange={setConnFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All connectors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All connectors</SelectItem>
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

        <Button variant="outline" onClick={togglePause}>
          {paused ? "Resume" : "Pause"}
        </Button>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={<History />}
          title="No activity yet"
          description="Connector events, commands, and responses will show up here as they happen."
        />
      ) : (
        <div ref={scroller} className="flex-1 min-h-0 overflow-y-auto">
          <div className="flex flex-col gap-2 pb-4">
            {shown.map((e) => (
              <LogRow key={e.seq} entry={e} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
