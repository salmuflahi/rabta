import * as React from "react";
import { Icon } from "@/components/ui/icon";
import { Sheet } from "@/components/ui/sheet";
import { canSee, neverSees } from "@/lib/connectorFacts";
import { decidePairing } from "@/lib/pairing";
import { useStore, type PendingPairing } from "@/store";

/**
 * How long both decisions stay inert after the sheet appears.
 *
 * A pairing request arrives unprompted — the user did not open this sheet,
 * it appeared over whatever they were doing. Without a delay, a Return or a
 * click already in flight lands on a button that was not there a frame ago.
 * Not configurable and not skippable: the whole point is that it cannot be
 * raced.
 */
export const ARM_DELAY_MS = 350;

function kindLabel(kind: string): string {
  if (kind === "browser") return "browser extension";
  if (kind === "editor") return "editor extension";
  return kind;
}

/** One of the two permission columns. `ok` for what it can see, `bad` for
 * what it structurally cannot — the same pairing the Connectors detail view
 * uses, so approving and inspecting later show the same two lists. */
function PermissionCard({
  tone,
  heading,
  lines,
}: {
  tone: "ok" | "bad";
  heading: string;
  lines: string[];
}) {
  return (
    <div className="min-w-0 flex-1 rounded-[9px] bg-secondary p-3">
      <div className={tone === "ok" ? "text-meta font-510 text-ok" : "text-meta font-510 text-bad"}>
        {heading}
      </div>
      <ul className="mt-2 space-y-1.5">
        {lines.map((line) => (
          <li key={line} className="flex gap-1.5 text-meta text-muted-foreground">
            <Icon
              name={tone === "ok" ? "check" : "x"}
              className={tone === "ok" ? "mt-0.5 size-3 shrink-0 text-ok" : "mt-0.5 size-3 shrink-0 text-bad"}
            />
            <span className="min-w-0">{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The moment a connector asks to talk to Rabta.
 *
 * This replaced a full-width banner rendered above the toolbar, which pushed
 * the whole application down every time a request arrived. It is a sheet
 * rather than a smaller floating banner for a reason beyond layout: this is
 * the one moment Rabta's promise — nothing leaves this Mac — is actually
 * tested by the user, and "Chrome wants to connect" with two buttons gives
 * them nothing to decide with. The Can see / Never sees pair is derived from
 * the capabilities *this* request declared, so a connector asking for more
 * than its kind normally does looks different from one that is not.
 *
 * Suppressed on the Connectors view, which shows its own in-context
 * PairingCard — otherwise the same request appears twice on one screen.
 */
export function PairingSheet() {
  const pairings = useStore((s) => s.pairings);
  const removePairing = useStore((s) => s.removePairing);
  const view = useStore((s) => s.view);
  const [dismissed, setDismissed] = React.useState<string[]>([]);

  const queue = pairings.filter((p) => !dismissed.includes(p.pairingId));
  const current: PendingPairing | undefined = view === "connectors" ? undefined : queue[0];

  const [armed, setArmed] = React.useState(false);
  React.useEffect(() => {
    if (!current) return;
    setArmed(false);
    const id = setTimeout(() => setArmed(true), ARM_DELAY_MS);
    return () => clearTimeout(id);
  }, [current?.pairingId]);

  if (!current) return null;

  // PendingPairing carries no capability list yet. canSee/neverSees tolerate
  // an empty one — neverSees always returns its baseline — so the Never sees
  // column is never empty even before the hub forwards capabilities.
  const capabilities: string[] = [];

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        // Closing without a decision leaves the request pending; it stays on
        // the Connectors view to be found again.
        if (!open) setDismissed((d) => [...d, current.pairingId]);
      }}
      title={`${current.name} wants to connect`}
      subtitle={`A ${kindLabel(current.kind)} on this Mac is asking to talk to Rabta. Nothing is shared until you approve it.`}
      cancelLabel="Not now"
      enterAdvances={false}
      secondary={{
        label: "Deny",
        tone: "bad",
        disabled: !armed,
        onClick: () => {
          // The handler guard is the real protection; `disabled` is what the
          // user and the test see. A disabled attribute alone can be defeated
          // by a synthetic click.
          if (!armed) return;
          decidePairing(current, false, removePairing);
        },
      }}
      primary={{
        label: "Approve",
        disabled: !armed,
        onClick: () => {
          // Same belt-and-braces guard as Deny above — see the comment there.
          if (!armed) return;
          decidePairing(current, true, removePairing);
        },
      }}
    >
      <div className="flex gap-2.5 pb-2">
        <PermissionCard tone="ok" heading="Can see" lines={canSee(capabilities)} />
        <PermissionCard tone="bad" heading="Never sees" lines={neverSees(capabilities)} />
      </div>
      <p className="flex items-center gap-1.5 pb-3 text-meta text-tertiary-foreground">
        <Icon name="lock" className="size-3 shrink-0" />
        Talks to Rabta on this Mac only — nothing leaves it.
      </p>
      {queue.length > 1 && (
        <p className="pb-2 text-meta tabular-nums text-tertiary-foreground">1 of {queue.length}</p>
      )}
    </Sheet>
  );
}
