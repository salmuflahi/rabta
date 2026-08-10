import { relativeTime } from "@/lib/humanize";
import { cn } from "@/lib/utils";
import { useStore } from "@/store";

/**
 * "1 connector online" / "2 connectors online" / "No connectors online" —
 * the pluralization pattern this project already uses elsewhere
 * (SettingsPage.tsx's "N tools are connected"). Deliberately not the
 * prototype's hardcoded "Cursor and Chrome connected": that string would be
 * a lie the moment either connector drops, or a lie of omission the moment
 * a third one (or neither) is what's actually connected.
 */
function connectorStatusText(connectedCount: number): string {
  if (connectedCount === 0) return "No connectors online";
  return `${connectedCount} connector${connectedCount === 1 ? "" : "s"} online`;
}

/**
 * The window-chrome footer: 26px, chrome-toned, a 0.5px top hairline —
 * matching the prototype's `Rabta - Console v2.dc.html` markup (the source
 * of truth here; the README's prose repeats the same values but the markup
 * is what was actually measured against). Hidden entirely (not just
 * visually) when Settings › Window › Status bar is off — see
 * `readPrefs`'s `statusbar` validation in store.ts.
 *
 * Left: a dot + real connector count, never a hardcoded name pair — see
 * `connectorStatusText`. Colour is never the only signal (the dot alone
 * conveys nothing to a screen reader, and nothing at all in grayscale): the
 * words next to it carry the actual state, matching the pattern
 * ConnectorsPage's own `StatusDot` already established.
 *
 * Right: the time of the most recently logged hub event. The prototype's
 * placeholder reads "Last capture 12m ago", but nothing in this app's
 * accessible state currently records a capsule-capture timestamp globally
 * (per-capsule saved-ago times are fetched per-page, not held in the
 * store) — claiming "capture" here would overstate what the software
 * tracks. `store.log` is real, already-global state with real timestamps,
 * so this reports honestly against that instead: "Last activity {relative
 * time}", or "No activity yet" before anything has happened.
 */
export function StatusBar() {
  const enabled = useStore((s) => s.prefs.statusbar);
  const connectors = useStore((s) => s.connectors);
  const log = useStore((s) => s.log);

  if (!enabled) return null;

  const connectedCount = connectors.filter((c) => c.connected).length;
  const statusText = connectorStatusText(connectedCount);

  const lastEntry = log[log.length - 1];
  const activityText = lastEntry ? `Last activity ${relativeTime(lastEntry.at)}` : "No activity yet";

  return (
    <div
      data-testid="status-bar"
      className="flex h-[26px] shrink-0 items-center gap-[18px] overflow-hidden whitespace-nowrap border-t-[0.5px] border-border bg-background px-3 text-meta text-muted-foreground"
    >
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            connectedCount > 0 ? "bg-ok" : "bg-muted-foreground/40",
          )}
        />
        <span className="truncate">{statusText}</span>
      </span>
      <span className="ml-auto shrink-0">{activityText}</span>
    </div>
  );
}
