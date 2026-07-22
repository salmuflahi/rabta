import { invoke } from "@tauri-apps/api/core";
import { toastErr, toastOk } from "@/lib/toast";
import type { PendingPairing } from "@/store";

/**
 * Approves or denies a pending connector pairing request, then clears it
 * from the store regardless of outcome. Shared between the App-level
 * pairing banner and the Connectors page so both surfaces invoke the same
 * `approve_pairing`/`deny_pairing` command and show the same toast.
 */
export async function decidePairing(
  pairing: PendingPairing,
  ok: boolean,
  removePairing: (pairingId: string) => void
) {
  try {
    await invoke(ok ? "approve_pairing" : "deny_pairing", { pairingId: pairing.pairingId });
    toastOk(ok ? `${pairing.name} connected` : `Denied ${pairing.name}`);
  } catch (e) {
    toastErr(e);
  }
  removePairing(pairing.pairingId);
}
