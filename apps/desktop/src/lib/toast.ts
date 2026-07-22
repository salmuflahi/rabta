import { toast } from "@/components/ui/sonner";

/** Success toast for a completed action, e.g. `toastOk("Task added")`. */
export function toastOk(message: string, description?: string) {
  toast.success(message, description ? { description } : undefined);
}

/** Error toast for a caught `catch (e)` — mirrors the prior `String(e)` display. */
export function toastErr(e: unknown) {
  toast.error(typeof e === "string" ? e : String(e));
}
