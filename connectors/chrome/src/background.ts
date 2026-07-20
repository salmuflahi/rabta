import { Connection, nativeSocket } from "./connection";
import { isRestorableUrl, snapshotTabs, type RawTab } from "./tabs";

const DEFAULT_PORT = 17872;

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

async function connect(port: number) {
  connection?.close();
  connection = new Connection({
    name: "chrome",
    kind: "chrome",
    capabilities: ["tabs"],
    port,
    makeSocket: (url) => nativeSocket(url),
    store,
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
      throw new Error(`no handler for ${name}`);
    },
  });
  connection.start();
}

// Emit tab lifecycle events (http/https only).
chrome.tabs.onCreated.addListener((t) => {
  if (t.url && isRestorableUrl(t.url)) connection?.emit("tab.opened", { url: t.url });
});
chrome.tabs.onRemoved.addListener(() => {
  /* url unknown at removal without extra bookkeeping; opened covers the log */
});

chrome.storage.local.get("omnibusPort").then(({ omnibusPort }) => connect(omnibusPort ?? DEFAULT_PORT));
