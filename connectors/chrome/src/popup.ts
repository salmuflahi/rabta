import { isRestorableUrl } from "./tabs";
import { STATES, stateFrom, type ConnectorStatus, type PopupState } from "./popup-state";

/* The popup's whole job is to answer one question honestly: is this browser
   connected to Rabta right now. The previous version answered a different one —
   whether a pairing token existed on disk — and so reported "paired" while the
   hub was closed, which is exactly the state a confused user is in. */

const DEFAULT_PORT = 17872;

const stateEl = document.querySelector<HTMLElement>(".state")!;
const labelEl = document.querySelector<HTMLElement>("[data-state-label]")!;
const detailEl = document.querySelector<HTMLElement>("[data-state-detail]")!;
const readoutEl = document.querySelector<HTMLElement>("[data-readout]")!;
const tabCountEl = document.querySelector<HTMLElement>("[data-tab-count]")!;
const portInput = document.querySelector<HTMLInputElement>("#port")!;
const advancedStatus = document.querySelector<HTMLElement>("[data-advanced-status]")!;

function render(state: PopupState) {
  stateEl.dataset.state = state;
  labelEl.textContent = STATES[state].label;
  detailEl.textContent = STATES[state].detail;
  /* A count of tabs that are not going anywhere is noise. */
  readoutEl.hidden = state !== "connected";
}

/* The honest count: exactly the tabs that would be captured — http and https,
   never incognito — not every tab the window happens to hold. */
async function countRestorableTabs(): Promise<number> {
  const tabs = await chrome.tabs.query({});
  return tabs.filter((t) => !t.incognito && isRestorableUrl(t.url ?? "")).length;
}

async function refresh() {
  let status: ConnectorStatus | undefined;
  try {
    status = await chrome.runtime.sendMessage({ type: "rabta:status" });
  } catch {
    /* Worker asleep or gone. The markup already ships the offline case. */
  }

  if (!status) {
    render("offline");
    return;
  }

  portInput.value = status.port === DEFAULT_PORT ? "" : String(status.port);
  render(stateFrom(status));

  if (status.connected) {
    tabCountEl.textContent = String(await countRestorableTabs());
  }
}

document.querySelector("#save")!.addEventListener("click", async () => {
  const port = Number(portInput.value) || DEFAULT_PORT;
  await chrome.storage.local.set({ omnibusPort: port });
  advancedStatus.textContent = `Reconnecting on port ${port}…`;
  chrome.runtime.reload();
});

document.querySelector("#forget")!.addEventListener("click", async () => {
  await chrome.storage.local.remove("omnibusToken");
  advancedStatus.textContent = "Pairing forgotten. Rabta will ask again.";
  chrome.runtime.reload();
});

void refresh();
