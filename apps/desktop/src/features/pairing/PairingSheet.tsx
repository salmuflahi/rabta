import * as React from "react";
import { Icon } from "@/components/ui/icon";
import { PermissionCard } from "@/components/ui/permission-card";
import { Sheet } from "@/components/ui/sheet";
import { canSee, capabilitiesForKind, neverSees } from "@/lib/connectorFacts";
import { kindCategory } from "@/lib/connectors";
import { decidePairing } from "@/lib/pairing";
import { useStore, type PendingPairing } from "@/store";

/** "A" or "An", agreeing with the leading sound of `noun` — every
 * `kindCategory()` value is a plain English word ("browser", "editor",
 * "test", "connector"), so a first-letter vowel check is enough; no need to
 * special-case acronym-style "an FBI". Local to this file: it's the only
 * place either kind helper is dropped into an "A ___ is asking..." sentence
 * — `kindLabel`'s two other call sites (App.tsx, ConnectorsPage.tsx) put
 * the word in parentheses instead, where no article is needed at all. */
function withArticle(noun: string): string {
  return /^[aeiou]/i.test(noun) ? `An ${noun}` : `A ${noun}`;
}

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

/**
 * The moment a connector asks to talk to Rabta.
 *
 * This replaced a full-width banner rendered above the toolbar, which pushed
 * the whole application down every time a request arrived. It is a sheet
 * rather than a smaller floating banner for a reason beyond layout: this is
 * the one moment Rabta's promise — nothing leaves this Mac — is actually
 * tested by the user, and "Chrome wants to connect" with two buttons gives
 * them nothing to decide with. The Can see / Never sees pair renders through
 * the same PermissionCard the Connectors detail page shows after approval,
 * so consenting now and inspecting later are visibly the same claim.
 *
 * What feeds that pair is `capabilitiesForKind`'s, not this request's own:
 * `PendingPairing` doesn't carry real declared capabilities yet — the hub
 * only learns them on `hello`, after pairing is already decided (see
 * `capabilitiesForKind`'s doc comment) — so this shows what a connector of
 * this *kind* typically asks for, grounded in the same facts
 * connectorFacts.ts documents elsewhere, not this specific request's actual
 * declaration. The line under the cards says exactly that, so the sheet
 * never overstates what it actually knows.
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

  // The last request actually shown, kept one render past `current` clearing
  // so Sheet still has real title/subtitle/children to animate out with. If
  // this component bailed out (`return null`) the instant `current` went
  // undefined, Sheet would unmount outright instead of ever receiving a
  // true→false `open` transition — Radix would have no chance to play the
  // close it plays everywhere else, and the sheet would just vanish. This is
  // the same "remember a previous value" pattern React's own docs use for
  // deriving state from a changing prop: guarded by the identity check below,
  // it only updates when a *new* request arrives, never on the render where
  // one clears.
  const [shown, setShown] = React.useState<PendingPairing | undefined>(current);
  if (current && current !== shown) setShown(current);

  const [armedId, setArmedId] = React.useState<string | null>(null);
  // Derived from `current`, not effect-set. An earlier version reset a plain
  // `armed` boolean from inside a useEffect keyed on `current?.pairingId`.
  // That effect runs after React commits — so for the one render where
  // `current` moves on to the next request in the queue, that render's
  // `disabled` attribute *and* its handler closure both still read the
  // *previous* request's `armed = true`. A click landing in that single
  // render could approve or deny a request that had been on screen for 0ms:
  // the exact race ARM_DELAY_MS exists to prevent. Comparing ids directly
  // means `armed` is correct in the very render `current` changes — there is
  // no effect in between for a click to land inside.
  const armed = armedId !== null && armedId === current?.pairingId;

  React.useEffect(() => {
    if (!current) return;
    const id = setTimeout(() => setArmedId(current.pairingId), ARM_DELAY_MS);
    return () => clearTimeout(id);
  }, [current?.pairingId]);

  if (!shown) return null;

  // What a connector of this *kind* typically asks for, not this specific
  // request's real declaration — PendingPairing doesn't carry that yet (see
  // capabilitiesForKind's doc comment for why). The Never sees column is
  // never empty regardless, since neverSees always includes its
  // capability-independent baseline.
  const capabilities = capabilitiesForKind(shown.kind);
  // Built as one string, like `subtitle` below, rather than interpolated
  // directly in JSX — one text node instead of several sibling ones, which
  // is what lets a test match the whole sentence with one getByText call.
  const capabilityCaveat = `What ${kindCategory(shown.kind)}s typically ask for — not what this one declared. The real list shows on Connectors once it's connected.`;

  return (
    <Sheet
      open={!!current}
      onOpenChange={(open) => {
        // Closing without a decision leaves the request pending; it stays on
        // the Connectors view to be found again.
        if (!open) setDismissed((d) => [...d, shown.pairingId]);
      }}
      title={`${shown.name} wants to connect`}
      subtitle={`${withArticle(kindCategory(shown.kind))} on this Mac is asking to talk to Rabta. Nothing is shared until you approve it.`}
      cancelLabel="Not now"
      enterAdvances={false}
      secondary={{
        label: "Deny",
        tone: "bad",
        disabled: !armed,
        onClick: () => {
          // The handler guard is the real protection; `disabled` is what the
          // user and the test see. A disabled attribute alone can be defeated
          // by a synthetic click. `!current` can only be true while the sheet
          // is animating out with no live request behind it — armed is
          // already false then too, but this also satisfies TypeScript that
          // `current` is defined before it reaches decidePairing.
          if (!armed || !current) return;
          decidePairing(current, false, removePairing);
        },
      }}
      primary={{
        label: "Approve",
        disabled: !armed,
        onClick: () => {
          // Same belt-and-braces guard as Deny above — see the comment there.
          if (!armed || !current) return;
          decidePairing(current, true, removePairing);
        },
      }}
    >
      <div className="grid grid-cols-2 gap-2.5 pb-2">
        <PermissionCard tone="ok" heading="Can see" glyph="check" lines={canSee(capabilities)} />
        <PermissionCard tone="bad" heading="Never sees" glyph="x" lines={neverSees(capabilities)} />
      </div>
      {/* The pair above is what this *kind* of connector typically asks for,
          not this specific request's real declaration — the hub doesn't
          know that yet (see capabilitiesForKind's doc comment). Said
          plainly rather than left implied, so the sheet never reads as more
          certain than it is. */}
      <p className="pb-2 text-meta text-tertiary-foreground">{capabilityCaveat}</p>
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
