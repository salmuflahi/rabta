const statusEl = document.getElementById("status")!;
const portInput = document.getElementById("port") as HTMLInputElement;

chrome.storage.local.get(["omnibusPort", "omnibusToken"]).then(({ omnibusPort, omnibusToken }) => {
  statusEl.textContent = omnibusToken ? "paired" : "not paired";
  if (omnibusPort) portInput.value = String(omnibusPort);
});

document.getElementById("save")!.addEventListener("click", async () => {
  const port = Number(portInput.value) || 17872;
  await chrome.storage.local.set({ omnibusPort: port });
  chrome.runtime.reload();
});
document.getElementById("repair")!.addEventListener("click", async () => {
  await chrome.storage.local.remove("omnibusToken");
  chrome.runtime.reload();
});
