import { invoke } from "@tauri-apps/api/core";
import { toastErr, toastOk } from "@/lib/toast";

interface SaveSummary {
  captured: string[];
  skipped: string[];
}

/**
 * Capture the active task's workspace (editor files/terminals, browser tabs,
 * git branch) into its capsule. Shared by the ⌘S global shortcut and the
 * command palette so a save can be triggered from anywhere — not only the
 * Capsules page's "Save State" button. The Capsules page keeps its own richer
 * save() (busy state + resource refresh); this is the fire-from-anywhere path.
 */
export async function saveCapsule(taskId: string): Promise<void> {
  try {
    const s = await invoke<SaveSummary>("save_capsule", { taskId });
    toastOk(
      s.captured.length ? "Saved state" : "Nothing connected to save",
      s.captured.length ? s.captured.join(", ") : undefined,
    );
  } catch (e) {
    toastErr(e);
  }
}
