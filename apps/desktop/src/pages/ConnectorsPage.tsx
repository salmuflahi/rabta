import { invoke } from "@tauri-apps/api/core";
import { Cable, Circle, CircleDot } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/shell/PageHeader";
import { useStore, type ConnectorRow, type PendingPairing } from "@/store";

function PairingCard({ pairing, onDecide }: { pairing: PendingPairing; onDecide: (id: string, ok: boolean) => void }) {
  return (
    <Card className="mb-3 border-warning/30 bg-warning/10 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-foreground">
          <span className="font-medium">{pairing.name}</span>{" "}
          <span className="text-muted-foreground">({pairing.kind})</span> wants to connect
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => onDecide(pairing.pairingId, false)}>
            Deny
          </Button>
          <Button size="sm" onClick={() => onDecide(pairing.pairingId, true)}>
            Approve
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ConnectorCard({ connector }: { connector: ConnectorRow }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-foreground">{connector.name}</p>
            <Badge variant="outline">{connector.kind}</Badge>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs">
            {connector.connected ? (
              <>
                <CircleDot className="size-3.5 text-success" />
                <span className="text-success">Connected</span>
              </>
            ) : (
              <>
                <Circle className="size-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Last seen {connector.connectedSince}</span>
              </>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {connector.capabilities.join(", ") || "No capabilities reported"}
          </p>
          <p className="mt-1 truncate font-mono text-xs text-muted-foreground/70">{connector.id}</p>
        </div>
      </div>
    </Card>
  );
}

export function ConnectorsPage() {
  const connectors = useStore((s) => s.connectors);
  const pairings = useStore((s) => s.pairings);
  const removePairing = useStore((s) => s.removePairing);

  async function decide(pairingId: string, ok: boolean) {
    try {
      await invoke(ok ? "approve_pairing" : "deny_pairing", { pairingId });
    } catch (e) {
      console.error("pairing decision failed:", e);
    }
    removePairing(pairingId);
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
          description="Editors and browsers connect here once paired — open an OmniBus-aware editor or browser extension to get started."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {connectors.map((c) => (
            <ConnectorCard key={c.id} connector={c} />
          ))}
        </div>
      )}
    </div>
  );
}
