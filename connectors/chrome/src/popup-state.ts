/* What the popup says, and when — kept free of the DOM so it can be tested the
 * way tabs.ts is.
 *
 * The previous popup read the pairing token off disk and called that "paired".
 * A token is a fact about storage, not about the socket, so it reported
 * "paired" with the hub closed — which is precisely the situation someone is in
 * when they open the popup to find out what is wrong.
 */

export interface ConnectorStatus {
  connected: boolean;
  connecting: boolean;
  paired: boolean;
  port: number;
}

/** Each state names what is true, then what to do about it. */
export const STATES = {
  connected: {
    label: "Connected",
    detail: "Tabs are saved with the task you have open in Rabta.",
  },
  pairing: {
    label: "Pairing…",
    detail: "Approve this browser in Rabta if it asks.",
  },
  unpaired: {
    label: "Not paired yet",
    detail: "Open Rabta to pair this browser. It only has to happen once.",
  },
  offline: {
    label: "Rabta isn’t running",
    detail: "Open Rabta and this reconnects on its own.",
  },
} as const;

export type PopupState = keyof typeof STATES;

export function stateFrom(status: ConnectorStatus): PopupState {
  /* The live socket outranks every other signal. */
  if (status.connected) return "connected";
  if (!status.paired) return status.connecting ? "pairing" : "unpaired";
  return "offline";
}
