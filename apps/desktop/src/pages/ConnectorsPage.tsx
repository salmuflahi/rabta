import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { PermissionCard } from "@/components/ui/permission-card";
import { Surface } from "@/components/ui/surface";
import { canSee, capabilityFacts, neverSees } from "@/lib/connectorFacts";
import { kindLabel } from "@/lib/connectors";
import { describeEvent, relativeTime } from "@/lib/humanize";
import { decidePairing } from "@/lib/pairing";
import { cn } from "@/lib/utils";
import { useStore, type ConnectorRow, type PendingPairing } from "@/store";

/**
 * The page's one raised surface, and the home of its one primary action.
 * Every request gets Deny + Approve, but only the first Approve carries
 * `variant="primary"` — N pending requests must never mean N orange
 * buttons.
 *
 * Differentiated with `bg-warn-soft` alone, on top of `variant="raised"`'s
 * own elevation — never a border. Surface owns depth via a lit, elevated
 * plane, not a drawn outline, and that holds even for a state as urgent as
 * a pending pairing.
 */
function PendingPairings({
  pairings,
  onDecide,
}: {
  pairings: PendingPairing[];
  onDecide: (pairing: PendingPairing, ok: boolean) => void;
}) {
  return (
    <Surface variant="raised" className="m-3 mb-0 bg-warn-soft p-4">
      <div className="flex flex-col divide-y divide-warn/20">
        {pairings.map((p, i) => (
          <div
            key={p.pairingId}
            className={cn("flex items-center justify-between gap-3 py-2.5", i === 0 && "pt-0", "last:pb-0")}
          >
            <p className="min-w-0 truncate text-body text-foreground">
              <span className="font-510">{p.name}</span>{" "}
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

/** A live connection literally breathes — a slow halo behind a solid dot.
 * Only rendered when actually connected, so it's honest. */
function LiveDot({ connected, size = 10 }: { connected: boolean; size?: number }) {
  if (!connected) {
    return (
      <span
        aria-hidden
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full bg-muted-foreground/40"
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className="relative flex shrink-0 items-center justify-center"
    >
      <span className="absolute inline-flex size-full animate-live-ping rounded-full bg-ok" />
      <span className="relative inline-flex size-full rounded-full bg-ok" />
    </span>
  );
}

/** Real, do-it-now install steps — the app used to say "install the
 * extension" with no how. Extensions are sideloaded (no marketplace yet),
 * so these are the actual manual steps, honestly stated. */
function ConnectHowTo({ icon, title, steps }: { icon: IconName; title: string; steps: string[] }) {
  return (
    <div className="rounded-[10px] bg-card p-4 shadow-raised">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent-soft text-accent-text">
          <Icon name={icon} className="size-4" />
        </span>
        <p className="text-body font-510 text-foreground">{title}</p>
      </div>
      <ol className="flex flex-col gap-2">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-2.5 text-meta text-muted-foreground">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-label font-510 text-foreground">
              {i + 1}
            </span>
            <span className="leading-relaxed">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function GroupHeading({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <p className={cn("pl-0.5 text-sub font-semibold text-muted-foreground", className)}>{children}</p>
  );
}

function ConnectorDetail({ connector }: { connector: ConnectorRow }) {
  const log = useStore((s) => s.log);
  const connectors = useStore((s) => s.connectors);
  const resolveName = (id: string) => connectors.find((c) => c.id === id)?.name;

  // This connector's own traffic, newest first. Filtered by the session id
  // the hub stamps on each event — an event that names no connector is not
  // attributed to this one.
  const traffic = [...log]
    .filter((e) => e.connectorId === connector.id)
    .slice(-8)
    .reverse();

  const caps = capabilityFacts(connector.capabilities);

  return (
    <div className="mx-auto max-w-[720px] px-8 pb-10 pt-[30px]">
      <div className="flex items-center gap-2.5">
        <LiveDot connected={connector.connected} />
        <h2 className="text-title font-640 text-foreground">{connector.name}</h2>
      </div>
      <p className="mt-1.5 text-sub text-muted-foreground">
        {/* Colour is never the only signal: the dot carries the glance, this
            line carries the meaning. "approved by you" is the literal truth
            of how pairing works here — there is no account and no server
            that could have approved it instead. */}
        {connector.connected
          ? `Connected ${relativeTime(connector.connectedSince)} · approved by you`
          : `Offline · last seen ${relativeTime(connector.connectedSince)}`}
        {connector.version && ` · v${connector.version}`}
      </p>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PermissionCard heading="Can see" tone="ok" glyph="check" lines={canSee(connector.capabilities)} />
        <PermissionCard
          heading="Never sees"
          tone="bad"
          glyph="x"
          lines={neverSees(connector.capabilities)}
        />
      </div>

      <GroupHeading className="mt-7">What it does</GroupHeading>
      <div className="mt-[7px] overflow-hidden rounded-[10px] bg-card shadow-raised">
        <div className="divide-y-[0.5px] divide-border">
          {caps.length === 0 ? (
            <p className="px-4 py-2.5 text-sub text-muted-foreground">
              This connector declared no capabilities.
            </p>
          ) : (
            caps.map((cap) => (
              <div key={cap.name} className="flex items-center gap-3.5 px-4 py-2.5">
                <span className="w-[150px] shrink-0 font-mono text-meta text-foreground">{cap.name}</span>
                <span className="min-w-0 flex-1 truncate text-sub text-muted-foreground">{cap.use}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <GroupHeading className="mt-7">Recent</GroupHeading>
      <div className="mt-[7px] overflow-hidden rounded-[10px] bg-card shadow-raised">
        <div className="divide-y-[0.5px] divide-border">
          {traffic.length === 0 ? (
            <p className="px-4 py-2.5 text-sub text-muted-foreground">
              Nothing from this connector yet.
            </p>
          ) : (
            traffic.map((e) => (
              <div key={e.seq} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sub text-foreground">
                  {describeEvent(e, resolveName).sentence}
                </span>
                <span className="shrink-0 text-meta text-tertiary-foreground">{relativeTime(e.at)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Privacy copy is a product requirement, not decoration. */}
      <div className="mt-[26px] flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-meta text-tertiary-foreground">
          <Icon name="lock" className="size-3 shrink-0" />
          Talks to Rabta on this Mac only — nothing leaves it.
        </p>
        {/* The handoff puts a Disconnect text button here. There is no
            disconnect command in this app — connectors hold the socket and
            drop it themselves — so rather than draw a button that would
            either do nothing or lie about what it did, the truthful thing
            is said instead. Restore it the day the command exists. */}
        <p className="shrink-0 text-sub text-tertiary-foreground">
          {connector.connected ? "Quit the app to disconnect it" : "Not connected"}
        </p>
      </div>
    </div>
  );
}

/**
 * Connectors — the handoff's master/detail screen.
 *
 * Left: what's paired, live. Right: what the selected one can and cannot
 * see, what each of its capabilities is for, and what it has actually done
 * recently. The old page was a flat list of rows whose entire answer to
 * "what does this thing read?" was a mono run of raw capability tokens.
 */
export function ConnectorsPage() {
  const connectors = useStore((s) => s.connectors);
  const pairings = useStore((s) => s.pairings);
  const removePairing = useStore((s) => s.removePairing);
  const selectedConnectorId = useStore((s) => s.selectedConnectorId);
  const selectConnector = useStore((s) => s.selectConnector);

  function decide(pairing: PendingPairing, ok: boolean) {
    decidePairing(pairing, ok, removePairing);
  }

  // Tolerates a stale id: a connector can go away between selection and
  // render (that is the normal case here, not the exception).
  const selected = connectors.find((c) => c.id === selectedConnectorId) ?? connectors[0] ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {pairings.length > 0 && <PendingPairings pairings={pairings} onDecide={decide} />}

      <div className="grid min-h-0 flex-1 grid-cols-[296px_minmax(0,1fr)] overflow-hidden">
        <div
          data-connector-list
          className="min-h-0 overflow-y-auto border-r-[0.5px] border-border px-2 pb-3 pt-2.5"
        >
          {connectors.length === 0 ? (
            <p className="px-2 pt-2 text-meta text-muted-foreground">Nothing paired yet.</p>
          ) : (
            connectors.map((c) => {
              const isSelected = selected?.id === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-current={isSelected ? "true" : undefined}
                  onClick={() => selectConnector(c.id)}
                  className={cn(
                    "block w-full cursor-default rounded-md px-2 py-1.5 text-left transition-colors duration-fast ease-standard",
                    isSelected ? "bg-secondary" : "hover:bg-hover",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <LiveDot connected={c.connected} size={7} />
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-body text-foreground",
                        isSelected && "font-510",
                      )}
                    >
                      {c.name}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 block pl-[15px] text-meta",
                      c.connected ? "text-ok" : "text-tertiary-foreground",
                    )}
                  >
                    {c.connected ? "Connected" : "Offline"}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <aside data-connector-detail aria-label="Details" className="min-h-0 overflow-y-auto">
          {selected ? (
            <ConnectorDetail connector={selected} />
          ) : (
            <div className="mx-auto max-w-[720px] px-8 pb-10 pt-[30px]">
              <p className="text-card-title font-590 text-foreground">No connectors yet</p>
              <p className="mt-1 max-w-[440px] text-sub leading-[1.55] text-muted-foreground">
                Connect your editor and browser so Rabta can capture and restore a task's workspace.
                Each pairs automatically the first time it runs — no accounts, no keys.
              </p>
              <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
                <ConnectHowTo
                  icon="code"
                  title="VS Code or Cursor"
                  steps={[
                    "Grab the Rabta extension (a .vsix file) from your Rabta download.",
                    "In the editor, open the Command Palette → “Extensions: Install from VSIX…” → pick it.",
                    "Reload the window — it pairs with Rabta automatically.",
                  ]}
                />
                <ConnectHowTo
                  icon="globe"
                  title="Chrome"
                  steps={[
                    "Open chrome://extensions and turn on Developer mode.",
                    "Click “Load unpacked” and select the rabta-chrome folder from your download.",
                    "Approve the pairing prompt when it shows up here.",
                  ]}
                />
              </div>
              <p className="mt-6 flex items-center gap-1.5 text-meta text-tertiary-foreground">
                <Icon name="lock" className="size-3 shrink-0" />
                Talks to Rabta on this Mac only — nothing leaves it.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
