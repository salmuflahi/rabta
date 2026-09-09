import { invoke } from "@tauri-apps/api/core";

export type ExportResult = { cancelled: boolean; path?: string };
export const MAX_EXPORT_BYTES = 100 * 1024 * 1024;

/** Save through the Mac save panel; a web preview uses its browser download UI. */
export async function exportBlob(blob: Blob, filename: string): Promise<ExportResult> {
  if (!blob.size) throw new Error("The result is empty. Create a new export first.");
  if (blob.size > MAX_EXPORT_BYTES) throw new Error("This export exceeds 100 MB. Shorten the clip or choose a smaller output.");
  if (!filename || /[\\/:\x00-\x1f\x7f]/.test(filename) || new TextEncoder().encode(filename).length > 240) {
    throw new Error("Choose a filename under 240 bytes without slashes or control characters.");
  }
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read the export. Try creating it again."));
      reader.onabort = () => reject(new Error("Saving was interrupted. Your original is unchanged."));
      reader.onload = () => {
        if (typeof reader.result !== "string" || !reader.result.includes(",")) {
          reject(new Error("Could not prepare this file for saving."));
          return;
        }
        resolve(reader.result.slice(reader.result.indexOf(",") + 1));
      };
      reader.readAsDataURL(blob);
    });
    return invoke<ExportResult>("utility_export_file", { filename, base64 });
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  try {
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return { cancelled: false };
}
