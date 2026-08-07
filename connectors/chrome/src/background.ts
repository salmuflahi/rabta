import { Connection, nativeSocket } from "./connection";
import {
  closePlan,
  isRestorableUrl,
  snapshotTabs,
  tabsMatchingUrlExactly,
  type CloseCandidate,
  type RawTab,
} from "./tabs";
import { installTabListeners } from "./tab-events";

const DEFAULT_PORT = 17872;
const RECONNECT_ALARM = "omnibus-reconnect";

/** chrome.storage.local-backed token store. */
const store = {
  async get() {
    return (await chrome.storage.local.get("omnibusToken")).omnibusToken ?? null;
  },
  async set(token: string) {
    await chrome.storage.local.set({ omnibusToken: token });
  },
  async remove() {
    await chrome.storage.local.remove("omnibusToken");
  },
};

async function readTabs(): Promise<RawTab[]> {
  const tabs = await chrome.tabs.query({});
  return tabs.map((t) => ({
    url: t.url ?? "",
    title: t.title ?? "",
    incognito: t.incognito ?? false,
  }));
}

let connection: Connection | undefined;
let connected = false;
// In-flight guard: true from the moment connect() starts until the
// connection either succeeds or actually drops. Prevents the keepalive
// alarm from racing the storage-port read on service-worker wake and
// standing up two Connections. Cleared on "disconnected" (not "denied" or
// any transient status) so a real socket drop can still be reconnected.
let connecting = false;
let currentPort = DEFAULT_PORT;

async function connect(port: number) {
  if (connecting) return;
  connecting = true;
  currentPort = port;
  connection?.close();
  connected = false;
  connection = new Connection({
    name: "chrome",
    kind: "chrome",
    capabilities: ["tabs"],
    version: chrome.runtime.getManifest().version,
    port,
    makeSocket: (url) => nativeSocket(url),
    store,
    onStatus: (s) => {
      connected = s === "connected";
      if (s === "disconnected") connecting = false;
    },
    onCommand: async (name, args) => {
      if (name === "workspace.state") return snapshotTabs(await readTabs());
      if (name === "tabs.open") {
        const { url } = args as { url: string };
        if (!isRestorableUrl(url)) throw new Error(`refusing non-http(s) url: ${url}`);
        await chrome.tabs.create({ url });
        return { opened: url };
      }
      if (name === "tabs.focus") {
        const { url } = args as { url: string };
        const [existing] = await chrome.tabs.query({ url });
        if (existing?.id != null) {
          await chrome.tabs.update(existing.id, { active: true });
          return { focused: url };
        }
        await chrome.tabs.create({ url });
        return { opened: url };
      }
      if (name === "tabs.close") {
        const { url } = args as { url: string };
        // `chrome.tabs.query({ url })` treats `url` as a match PATTERN, not
        // a literal — fetch everything and filter to an exact match here
        // instead (see `tabsMatchingUrlExactly`), the same way `readTabs`
        // already fetches everything for capture.
        const allTabs = await chrome.tabs.query({});
        const candidates: CloseCandidate[] = allTabs.map((t) => ({
          id: t.id,
          url: t.url ?? "",
          pinned: t.pinned ?? false,
          incognito: t.incognito ?? false,
          windowId: t.windowId,
        }));
        const matches = tabsMatchingUrlExactly(candidates, url);
        if (matches.length === 0) return { kept: url, reason: "no longer open" };

        // The whole url's outcome must be known before anything closes (see
        // closePlan): gather every match's window's tab count up front,
        // rather than re-querying mid-loop.
        const windowTabCounts: Record<number, number> = {};
        for (const windowId of new Set(matches.map((t) => t.windowId))) {
          windowTabCounts[windowId] = (await chrome.tabs.query({ windowId })).length;
        }

        const plan = closePlan(matches, windowTabCounts);
        if ("kept" in plan) return { kept: url, reason: plan.reason };
        await chrome.tabs.remove(plan.close);
        return { closed: url };
      }
      throw new Error(`no handler for ${name}`);
    },
  });
  connection.start();
}

// Emit reliable tab lifecycle events (committed http/https, non-incognito
// only): onUpdated for opens (onCreated's `pendingUrl` is not a committed
// url), onRemoved + the returned tabId→url map for closes. See tab-events.ts.
installTabListeners(chrome.tabs, (name, data) => connection?.emit(name, data));

// MV3 keepalive: the service worker can be suspended while the hub is down
// (nothing is keeping it warm — the ping-based lifetime trick only helps
// once a WebSocket is already open), which would otherwise strand the
// extension disconnected until some unrelated event revives it. A periodic
// alarm gives Chrome a reason to wake the worker and retry the connection.
// Registered at top level (not inside a callback) so it survives service
// worker restarts, per MV3 requirements.
chrome.alarms.create(RECONNECT_ALARM, { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RECONNECT_ALARM && !connected) {
    // connect() closes any prior connection first, so this can't stack.
    void connect(currentPort);
  }
});

/* The popup used to read the stored token and call that "paired", which is a
   fact about disk, not about the connection: it said paired while the hub was
   closed. The worker is the only thing that knows whether the socket is up, so
   it answers for itself. */
export interface ConnectorStatus {
  connected: boolean;
  connecting: boolean;
  paired: boolean;
  port: number;
}

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.type !== "rabta:status") return undefined;
  void store.get().then((token) => {
    const status: ConnectorStatus = {
      connected,
      connecting: connecting && !connected,
      paired: token !== null,
      port: currentPort,
    };
    respond(status);
  });
  return true; // the reply is async
});

chrome.storage.local.get("omnibusPort").then(({ omnibusPort }) => connect(omnibusPort ?? DEFAULT_PORT));
