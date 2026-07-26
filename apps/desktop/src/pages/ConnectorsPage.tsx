import { Cable } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { relativeTime } from "@/lib/humanize";
import { decidePairing } from "@/lib/pairing";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/shell/PageHeader";
import { useStore, type ConnectorRow, type PendingPairing } from "@/store";

// Friendly display names for the raw connector kind.
const KIND_LABEL: Record<string, string> = {
  vscode: "VS Code",
  cursor: "Cursor",
  chrome: "Chrome",
  fake: "Fake",
};

function PairingCard({
  pairing,
  onDecide,
}: {
  pairing: PendingPairing;
  onDecide: (pairing: PendingPairing, ok: boolean) => void;
}) {
  return (
    <Card className="mb-3 border-warning/30 bg-warning/10 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm text-foreground">
          <span className="font-medium">{pairing.name}</span>{" "}
          <span className="text-muted-foreground">({KIND_LABEL[pairing.kind] ?? pairing.kind})</span> wants to connect
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => onDecide(pairing, false)}>
            Deny
          </Button>
          <Button size="sm" onClick={() => onDecide(pairing, true)}>
            Approve
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ConnectorCard({ connector }: { connector: ConnectorRow }) {
  const kindLabel = KIND_LABEL[connector.kind] ?? connector.kind;
  return (
    <Card className="card-lift p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn(
            "mt-1.5 size-2.5 shrink-0 rounded-full",
            connector.connected ? "bg-success ring-4 ring-success/15" : "bg-muted-foreground/40",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="min-w-0 truncate text-card font-medium text-foreground">{connector.name}</p>
            <Badge variant="outline" className="shrink-0 text-label">
              {kindLabel}
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
          <p className="mt-2 truncate font-mono text-label text-muted-foreground/60">{connector.id}</p>
        </div>
      </div>
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
          {pairings.map((p) => (
            <PairingCard key={p.pairingId} pairing={p} onDecide={decide} />
          ))}
        </div>
      )}

      {connectors.length === 0 ? (
        <EmptyState
          icon={<Cable />}
          title="No connectors yet"
          description="Install the VS Code (or Cursor) extension and the Chrome extension, then open them once — each one pairs with Rabta automatically and shows up here."
        />
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
