/**
 * The checksum copy control on /setup/. It is `hidden` in the markup and
 * revealed here, so a scriptless page never shows a dead button.
 */
export function initCopy(root: ParentNode = document, env: Window = window): () => void {
  const offs: Array<() => void> = [];
  root.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((btn) => {
    const label = btn.querySelector("[data-copy-label]");
    const original = label ? label.textContent : "";
    const status = btn.parentElement ? btn.parentElement.querySelector("[data-copy-status]") : null;
    let revert = 0;

    btn.hidden = false;

    const onClick = async () => {
      const say = (text: string, spoken: string) => {
        if (label) label.textContent = text;
        if (status) status.textContent = spoken;
        env.clearTimeout(revert);
        revert = env.setTimeout(() => {
          if (label) label.textContent = original;
          if (status) status.textContent = "";
        }, 2000);
      };
      try {
        await env.navigator.clipboard.writeText(btn.dataset.copy || "");
        say("Copied", "Checksum copied to the clipboard");
      } catch {
        say("Select it", "Could not copy. Select the checksum and copy it yourself.");
      }
    };
    btn.addEventListener("click", onClick);
    offs.push(() => btn.removeEventListener("click", onClick));
  });
  return () => offs.forEach((off) => off());
}
