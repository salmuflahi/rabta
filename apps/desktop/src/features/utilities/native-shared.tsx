import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

/** One in-flight native action per panel, with its notice or error line. */
export function useNativeAction() {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const pending = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  /** One piece of work at a time; `done` turns its result into the notice. */
  const task = async <T,>(work: () => Promise<T>, done: (value: T) => string) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); setNotice("");
    try { const data = await work(); if (mounted.current) setNotice(done(data)); }
    catch (error) { if (mounted.current) setError(String(error)); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  };
  const run = <T,>(command: string, args: Record<string, unknown>, done: (value: T) => string) => task(() => invoke<T>(command, args), done);
  const clear = () => { setError(""); setNotice(""); };
  return { busy, run, task, clear, feedback: <p className={`rk-status ${error ? "rk-error" : ""}`} role={error ? "alert" : "status"}>{error || notice}</p> };
}
/** Confirmation with initial focus on Cancel and focus returned to the opener. */
export function NativeConfirmation({ title, description, action, confirm, close, destructive }: { title: string; description: string; action: string; confirm: () => void; close: () => void; destructive?: boolean }) {
  const cancel = useRef<HTMLButtonElement>(null);
  const opener = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  return <Dialog open onOpenChange={(open) => { if (!open) close(); }}><DialogContent onOpenAutoFocus={(event) => { event.preventDefault(); cancel.current?.focus(); }} onCloseAutoFocus={(event) => { event.preventDefault(); opener.current?.focus(); }}>
    <DialogTitle>{title}</DialogTitle><DialogDescription className="whitespace-pre-line">{description}</DialogDescription>
    <div className="rk-actions"><Button ref={cancel} onClick={close}>Cancel</Button><Button variant={destructive ? "destructive" : undefined} onClick={() => { close(); confirm(); }}>{action}</Button></div>
  </DialogContent></Dialog>;
}
export type Confirmation = { title: string; description: string; action: string; perform: () => void; destructive?: boolean };
export const sizeText = (bytes: number | null | undefined) => bytes == null ? "Unavailable" : bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GiB` : bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MiB` : bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KiB` : `${bytes} B`;
export const lines = (text: string) => text.split("\n").map((line) => line.trim()).filter(Boolean);
