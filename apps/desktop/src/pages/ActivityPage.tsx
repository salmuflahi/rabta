import { useEffect, useMemo, useRef, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { describeEvent, relativeTime } from "@/lib/humanize";
import { cn } from "@/lib/utils";
import { useStore, type LogEntry } from "@/store";

/** An event older than this reads as history rather than "just now", and
 * the handoff renders it in tertiary text. One hour, per its Activity
 * section: "events older than an hour render in tertiary text".
 *
 * Age is decided by the timestamp alone, deliberately — NOT by the entry's
 * `historical` flag, which only means "came from the persisted log at
 * startup" rather than "arrived live on this connection". Right after
 * launch every event is historical, including the one from three minutes
 * ago, and dimming the whole list is the opposite of what this treatment
 * is for. */
const AGED_MS = 60 * 60 * 1000;

function entryConnectorId(e: LogEntry): string | undefined {
  return (e.connectorId as string | undefined) ?? (e.connector as { id?: string } | undefined)?.id;
}

/** Mirrors one event row: no leading icon (the real row has none), a
 * flex-1 title bar and a trailing time-width bar — the row's own
 * `gap-3 rounded-[7px] px-2.5 py-[7px]`. */
function ActivityRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-[7px] px-2.5 py-[7px]">
      <Skeleton className="h-3.5 flex-1" />
      <Skeleton className="h-2.5 w-10 shrink-0" />
    </div>
  );
}

/**
 * Stands in for `ActivityPage` before `connectorsAndLogLoaded` — the whole
 * screen swaps out (matching Overview/Projects), including the filter bar:
 * `shown.length` and the Select's connector options both depend on data
 * that has not arrived yet, so real controls acting on it would be
 * half-functional rather than merely undecorated. The details pane mirrors
 * its populated shape (a title + meta line), the same convention
 * `OverviewSkeleton`'s hero uses rather than pre-empting the genuinely-empty
 * "Select an event" state.
 */
function ActivitySkeleton() {
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_320px] overflow-hidden">
      <div className="flex min-h-0 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center gap-2.5 px-4 pb-1 pt-2.5">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-28" />
          <div className="flex-1" />
          <Skeleton className="h-2.5 w-14" />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-4 pt-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <ActivityRowSkeleton key={i} />
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-col overflow-hidden border-l-[0.5px] border-border bg-muted/40">
        <div className="shrink-0 px-[18px] pt-4">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="mt-[7px] h-4 w-full" />
          <Skeleton className="mt-1 h-2.5 w-32" />
        </div>
      </div>
    </div>
  );
}

/**
 * Activity — the handoff's two-pane event browser.
 *
 * Left: the event list, with an apps filter and a count above it. Right, in
 * a fixed 320px grouped column: the selected event's sentence, where it
 * came from, and its raw JSON payload in a selectable mono block.
 *
 * The payload used to be a `<details>` toggle inside every row, so reading
 * one meant expanding it in place and pushing the rest of the list down.
 * A dedicated pane means the payload is always readable without disturbing
 * what you were scanning.
 */
export function ActivityPage() {
  const log = useStore((s) => s.log);
  const paused = useStore((s) => s.paused);
  const togglePause = useStore((s) => s.togglePause);
  const connectors = useStore((s) => s.connectors);
  const connectorsAndLogLoaded = useStore((s) => s.connectorsAndLogLoaded);
  const selectedEventSeq = useStore((s) => s.selectedEventSeq);
  const selectEvent = useStore((s) => s.selectEvent);
  const scroller = useRef<HTMLDivElement>(null);

  // The handoff's Activity screen has one filter button ("All apps") and a
  // count. The kind filter and free-text search this page shipped with are
  // dropped from the chrome — the payload pane is a better answer to "what
  // was in that event?" than a text query over stringified JSON was — but
  // filtering by app is kept, because the handoff asks for it and it is the
  // one filter that answers a question the list can't.
  //
  // Local state, deliberately, not the store's `selectedConnectorId`: that
  // field is the Connectors screen's *selection*, and sharing it would mean
  // narrowing this list also moved the cursor over there (and back again).
  // A filter is not a selection.
  const [connFilter, setConnFilter] = useState("all");

  const resolveName = (id: string) => connectors.find((c) => c.id === id)?.name;

  const shown = useMemo(
    () => (connFilter === "all" ? log : log.filter((e) => entryConnectorId(e) === connFilter)),
    [log, connFilter],
  );

  // Newest last, and the view follows it unless the user paused scrolling.
  useEffect(() => {
    if (!paused) scroller.current?.scrollTo(0, scroller.current.scrollHeight);
  }, [log, paused]);

  // Tolerates a stale seq: the log is a ring buffer, so the selected event
  // can age out from under the selection.
  const selected = shown.find((e) => e.seq === selectedEventSeq) ?? shown[shown.length - 1] ?? null;
  const now = Date.now();

  // `log` starts empty and is filled by App.tsx after mount — without this
  // gate, a user whose landing page is Activity sees "Nothing yet" flash
  // before the real (possibly non-empty) log arrives.
  if (!connectorsAndLogLoaded) return <ActivitySkeleton />;

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_320px] overflow-hidden">
      <div className="flex min-h-0 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center gap-2.5 px-4 pb-1 pt-2.5">
          <Select
            value={connFilter}
            onValueChange={setConnFilter}
          >
            <SelectTrigger className="h-6 w-auto gap-1.5 rounded-md border-[0.5px] px-2.5 text-sub">
              <SelectValue placeholder="All apps" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All apps</SelectItem>
              {connectors.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Only controls whether the view follows the newest event — the
              feed itself keeps recording. Labelled for what it does. */}
          <button
            type="button"
            onClick={togglePause}
            aria-label={paused ? "Resume auto-scroll" : "Pause auto-scroll"}
            className="inline-flex h-6 shrink-0 cursor-default items-center rounded-md bg-secondary px-2.5 text-sub text-foreground shadow-[0_0_0_0.5px_hsl(var(--border))] transition-colors duration-fast ease-standard hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {paused ? "Resume scroll" : "Pause scroll"}
          </button>

          <div className="flex-1" />
          <span className="text-meta tabular-nums text-tertiary-foreground">
            {shown.length} {shown.length === 1 ? "event" : "events"}
          </span>
        </div>

        <div ref={scroller} data-event-list className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-4 pt-1">
          {shown.length === 0 ? (
            <p className="px-2 pt-3 text-meta text-muted-foreground">
              {connFilter === "all"
                ? "Nothing yet — connector events, commands and responses show up here as they happen."
                : "Nothing from that app yet."}
            </p>
          ) : (
            shown.map((e) => {
              const isSelected = selected?.seq === e.seq;
              const aged = now - Date.parse(e.at) > AGED_MS;
              return (
                <button
                  key={e.seq}
                  type="button"
                  aria-current={isSelected ? "true" : undefined}
                  onClick={() => selectEvent(e.seq)}
                  className={cn(
                    // Neutral selection, as on every other list in this app
                    // — see CapsulesPage for the full note.
                    "flex w-full cursor-default items-center gap-3 rounded-[7px] px-2.5 py-[7px] text-left transition-colors duration-fast ease-standard",
                    isSelected ? "bg-secondary" : "hover:bg-hover",
                  )}
                >
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-body",
                      isSelected && "font-510",
                      aged ? "text-tertiary-foreground" : "text-foreground",
                    )}
                  >
                    {describeEvent(e, resolveName).sentence}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-meta tabular-nums",
                      aged ? "text-tertiary-foreground" : "text-muted-foreground",
                    )}
                  >
                    {relativeTime(e.at)}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      <aside
        data-event-details
        aria-label="Details"
        className="flex min-h-0 flex-col overflow-hidden border-l-[0.5px] border-border bg-muted/40"
      >
        <div className="shrink-0 px-[18px] pt-4">
          <p className="text-sub font-semibold text-muted-foreground">Details</p>
          {selected ? (
            <>
              <p className="mt-[7px] text-card-title font-590 leading-[1.4] text-foreground">
                {describeEvent(selected, resolveName).sentence}
              </p>
              <p className="mt-1 text-meta text-tertiary-foreground">
                {[
                  selected.type,
                  entryConnectorId(selected) ? resolveName(entryConnectorId(selected)!) : null,
                  relativeTime(selected.at),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </>
          ) : (
            <p className="mt-[7px] text-sub text-muted-foreground">Select an event to see its payload.</p>
          )}
        </div>
        {selected && (
          <div className="min-h-0 flex-1 overflow-y-auto px-[18px] pb-[18px] pt-3">
            {/* Payloads are selectable — the rest of the chrome isn't. This
                is the one place a user legitimately needs to copy a raw
                value out of the app. */}
            <pre className="select-text overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-card p-3 font-mono text-payload text-muted-foreground shadow-grouped">
              {JSON.stringify(selected, null, 2)}
            </pre>
          </div>
        )}
      </aside>
    </div>
  );
}
