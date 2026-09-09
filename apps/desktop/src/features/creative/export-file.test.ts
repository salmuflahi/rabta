import { afterEach, expect, it, vi } from "vitest";
import { exportBlob, MAX_EXPORT_BYTES } from "@/lib/export-file";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  vi.restoreAllMocks();
  invoke.mockReset();
});

it("sends exact binary contents to the native save panel and preserves cancellation", async () => {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  invoke.mockResolvedValue({ cancelled: true });
  expect(await exportBlob(new Blob([new Uint8Array([0, 1, 255])]), "photo.png")).toEqual({ cancelled: true });
  expect(invoke).toHaveBeenCalledWith("utility_export_file", { filename: "photo.png", base64: "AAH/" });
});

it("reports native write failures without falling back to browser or claiming saved", async () => {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  invoke.mockRejectedValue(new Error("Disk is full"));
  await expect(exportBlob(new Blob(["content"]), "result.txt")).rejects.toThrow("Disk is full");
});

it("rejects invalid names and oversized output before encoding or native calls", async () => {
  await expect(exportBlob(new Blob(["content"]), "../result.txt")).rejects.toThrow(/filename/);
  const large = new Blob(["content"]);
  Object.defineProperty(large, "size", { value: MAX_EXPORT_BYTES + 1 });
  await expect(exportBlob(large, "clip.wav")).rejects.toThrow(/100 MB/);
  expect(invoke).not.toHaveBeenCalled();
});
