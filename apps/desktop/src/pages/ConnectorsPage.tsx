import { Cable, Code2, Globe, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Row } from "@/components/ui/row";
import { Section } from "@/components/ui/section";
import { Surface } from "@/components/ui/surface";
import { kindLabel } from "@/lib/connectors";
import { relativeTime } from "@/lib/humanize";
import { decidePairing } from "@/lib/pairing";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/shell/PageHeader";
import { useStore, type ConnectorRow, type PendingPairing } from "@/store";

/**
 * The page's one raised surface, and the home of its one primary action.
 * Every request gets Deny + Approve, but only the first Approve carries
 * `variant="primary"` — N pending requests must never mean N orange
 * buttons (see the "shows only the first pairing card's Approve button..."
 * test, which pins this from both sides).
 *
 * `border` is applied explicitly alongside `border-warning/30`: Surface
 * (like Card, its thin alias) owns elevation via shadow, not a border
 * width, so the warning colour needs its own width utility or it renders
 * as nothing.
 */
function PendingPairings({
  pairings,
  onDecide,
}: {
  pairings: PendingPairing[];
  onDecide: (pairing: PendingPairing, ok: boolean) => void;
}) {
  return (
    <Surface variant="raised" className="mb-6 border border-warning/30 bg-warning/10 p-4">
      <div className="flex flex-col divide-y divide-warning/20">
        {pairings.map((p, i) => (
          <div
            key={p.pairingId}
            className={cn("flex items-center justify-between gap-3 py-2.5", i === 0 && "pt-0", "last:pb-0")}
          >
            <p className="min-w-0 truncate text-sm text-foreground">
              <span className="font-medium">{p.name}</span>{" "}
              <span className="text-muted-foreground">({kindLabel(p.kind)})</span> wants to connect
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => onDecide(p, false)}>
                Deny
              </Button>
              <Button size="sm" variant={i === 0 ? "primary" : "secondary"} onClick={() => onDecide(p, true)}>
                Approve
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Surface>
  );
}

function StatusDot({ connected }: { connected: boolean }) {
  if (connected) {
    // A live connection literally breathes — a slow halo behind a solid
    // dot. Only rendered when actually connected, so it's honest.
    return (
      <span aria-hidden className="relative flex size-2.5 shrink-0 items-center justify-center">
        <span className="absolute inline-flex size-full animate-live-ping rounded-full bg-success" />
        <span className="relative inline-flex size-2.5 rounded-full bg-success ring-4 ring-success/15" />
      </span>
    );
  }
  return <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-muted-foreground/40" />;
}

function ConnectorListRow({ connector }: { connector: ConnectorRow }) {
  // Colour is never the only signal: the dot carries the glance, the word
  // carries the meaning.
  const statusText = connector.connected
    ? `Connected · since ${relativeTime(connector.connectedSince)}`
    : `Offline · last seen ${relativeTime(connector.connectedSince)}`;

  return (
    <Row
      leading={<StatusDot connected={connector.connected} />}
      title={
        <div className="flex items-center gap-2">
          <span className="min-w-0 truncate">{connector.name}</span>
          <Badge variant="outline" className="shrink-0 text-label">
            {kindLabel(connector.kind)}
          </Badge>
          {connector.version && (
            <span className="shrink-0 rounded-full bg-muted/60 px-1.5 py-0.5 font-mono text-label text-muted-foreground">
              v{connector.version}
            </span>
          )}
        </div>
      }
      subtitle={
        <>
          {statusText}
          {connector.capabilities.length > 0 && (
            <span className="ml-2 font-mono text-meta text-muted-foreground/80">
              {connector.capabilities.join(" · ")}
            </span>
          )}
        </>
      }
    />
  );
}

/** Real, do-it-now install steps for a connector — the app used to say
 * "install the extension" with no how. Extensions are sideloaded (no
 * marketplace yet), so these are the actual manual steps, honestly stated. */
function ConnectHowTo({
  icon: Icon,
  title,
  steps,
}: {
  icon: LucideIcon;
  title: string;
  steps: string[];
}) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <p className="text-body font-medium text-foreground">{title}</p>
      </div>
      <ol className="flex flex-col gap-2">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-2.5 text-meta text-muted-foreground">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-label font-medium text-foreground">
              {i + 1}
            </span>
            <span className="leading-relaxed">{step}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

export function ConnectorsPage() {
  const connectors = useStore((s) => s.connectors);
  const pairings = useStore((s) => s.pairings);
  const removePairing = useStore((s) => s.removePairing);

  function decide(pairing: PendingPairing, ok: boolean) {
    decidePairing(pairing, ok, removePairing);
  }

  const connectedCount = connectors.filter((c) => c.connected).length;
  // Avoids the word "connected" so it can't collide with a connector row's
  // own "Connected · since ..." status text in text-content lookups.
  const subtitle = `${connectedCount} ${connectedCount === 1 ? "connector" : "connectors"} online`;

  return (
    <div>
      <PageHeader eyebrow="CONNECTIONS" title="Connectors" subtitle={subtitle} />

      {pairings.length > 0 && <PendingPairings pairings={pairings} onDecide={decide} />}

      {connectors.length === 0 ? (
        <div className="flex flex-col gap-4">
          <EmptyState
            icon={<Cable />}
            title="No connectors yet"
            description="Connect your editor and browser so Rabta can capture and restore a task's workspace. Each pairs automatically the first time it runs — no accounts, no keys."
          />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ConnectHowTo
              icon={Code2}
              title="VS Code or Cursor"
              steps={[
                "Grab the Rabta extension (a .vsix file) from your Rabta download.",
                "In the editor, open the Command Palette → “Extensions: Install from VSIX…” → pick it.",
                "Reload the window — it pairs with Rabta automatically.",
              ]}
            />
            <ConnectHowTo
              icon={Globe}
              title="Chrome"
              steps={[
                "Open chrome://extensions and turn on Developer mode.",
                "Click “Load unpacked” and select the rabta-chrome folder from your download.",
                "Approve the pairing prompt when it shows up here.",
              ]}
            />
          </div>
        </div>
      ) : (
        <Section label="Connections">
          <Surface>
            {connectors.map((c) => (
              <ConnectorListRow key={c.id} connector={c} />
            ))}
          </Surface>
        </Section>
      )}
    </div>
  );
}
