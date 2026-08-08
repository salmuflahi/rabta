import { Cable, Code2, Globe, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { kindLabel } from "@/lib/connectors";
import { relativeTime } from "@/lib/humanize";
import { decidePairing } from "@/lib/pairing";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/shell/PageHeader";
import { useStore, type ConnectorRow, type PendingPairing } from "@/store";

function PairingCard({
  pairing,
  onDecide,
  accented = false,
}: {
  pairing: PendingPairing;
  onDecide: (pairing: PendingPairing, ok: boolean) => void;
  accented?: boolean;
}) {
  return (
    <Card className="mb-3 border border-warning/30 bg-warning/10 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm text-foreground">
          <span className="font-medium">{pairing.name}</span>{" "}
          <span className="text-muted-foreground">({kindLabel(pairing.kind)})</span> wants to connect
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => onDecide(pairing, false)}>
            Deny
          </Button>
          <Button size="sm" variant={accented ? "primary" : "secondary"} onClick={() => onDecide(pairing, true)}>
            Approve
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ConnectorCard({ connector }: { connector: ConnectorRow }) {
  return (
    <Card className="card-lift p-4">
      <div className="flex items-start gap-3">
        {connector.connected ? (
          // A live connection literally breathes — a slow halo behind a solid
          // dot. Only rendered when actually connected, so it's honest.
          <span aria-hidden className="relative mt-1.5 flex size-2.5 shrink-0 items-center justify-center">
            <span className="absolute inline-flex size-full animate-live-ping rounded-full bg-success" />
            <span className="relative inline-flex size-2.5 rounded-full bg-success ring-4 ring-success/15" />
          </span>
        ) : (
          <span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full bg-muted-foreground/40" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="min-w-0 truncate text-card font-medium text-foreground">{connector.name}</p>
            <Badge variant="outline" className="shrink-0 text-label">
              {kindLabel(connector.kind)}
            </Badge>
            {connector.version && (
              <span className="shrink-0 rounded-full bg-muted/60 px-1.5 py-0.5 font-mono text-label text-muted-foreground">
                v{connector.version}
              </span>
            )}
          </div>
          <p className={cn("mt-1 text-meta", connector.connected ? "text-success" : "text-muted-foreground")}>
            {connector.connected
              ? `Connected · since ${relativeTime(connector.connectedSince)}`
              : `Offline · last seen ${relativeTime(connector.connectedSince)}`}
          </p>
          {connector.capabilities.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {connector.capabilities.map((cap) => (
                <span
                  key={cap}
                  className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-label text-muted-foreground"
                >
                  {cap}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-label text-muted-foreground/70">No capabilities reported</p>
          )}
        </div>
      </div>
    </Card>
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
  const subtitle = `${connectedCount} connected`;

  return (
    <div>
      <PageHeader eyebrow="CONNECTIONS" title="Connectors" subtitle={subtitle} />

      {pairings.length > 0 && (
        <div className="mb-6">
          {pairings.map((p, i) => (
            <PairingCard key={p.pairingId} pairing={p} onDecide={decide} accented={i === 0} />
          ))}
        </div>
      )}

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
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
          {connectors.map((c) => (
            <ConnectorCard key={c.id} connector={c} />
          ))}
        </div>
      )}
    </div>
  );
}
