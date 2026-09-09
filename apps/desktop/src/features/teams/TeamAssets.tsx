import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { prepareTeamAsset, roomPath, teamRequest, type TeamAsset, type TeamConnection } from "./client";

export function TeamAssets({ connection, assets, canWrite, canRemoveAny = false, onChange }: {
  connection: TeamConnection; assets: TeamAsset[]; canWrite: boolean; canRemoveAny?: boolean; onChange: () => Promise<unknown>;
}) {
  const [selected, setSelected] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<TeamAsset | null>(null);
  const [previewData, setPreviewData] = useState<{ url?: string; text?: string }>({});
  const [previewError, setPreviewError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [removing, setRemoving] = useState<TeamAsset | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const pending = useRef(false);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    setPreviewData({}); setPreviewError("");
    if (!preview) return;
    const abort = new AbortController();
    let url: string | undefined;
    setPreviewLoading(true);
    void teamRequest<Blob>(connection.endpoint, roomPath(connection, `/assets/${encodeURIComponent(preview.id)}`), connection.memberKey, { binary: true, signal: abort.signal })
      .then(async blob => {
        if (abort.signal.aborted) return;
        if (["image/png", "image/jpeg", "image/webp"].includes(preview.mimeType)) {
          url = URL.createObjectURL(blob); setPreviewData({ url });
        } else {
          const text = await blob.text();
          if (!abort.signal.aborted) setPreviewData({ text });
        }
      }).catch(error => { if (!abort.signal.aborted) setPreviewError(error instanceof Error ? error.message : "Could not load this file."); })
      .finally(() => { if (!abort.signal.aborted) setPreviewLoading(false); });
    return () => { abort.abort(); if (url) URL.revokeObjectURL(url); };
  }, [preview, connection]);
  async function upload() {
    if (!selected || pending.current) return;
    pending.current = true; setBusy(true); setError(""); setMessage("");
    controller.current = new AbortController();
    try {
      const body = await prepareTeamAsset(selected);
      await teamRequest(connection.endpoint, roomPath(connection, "/assets"), connection.memberKey, { method: "POST", body, signal: controller.current.signal });
      setMessage(`${selected.name} shared with the workspace.`); setSelected(null);
      if (input.current) input.current.value = "";
      await onChange().catch(() => setMessage("File shared. Reconnect to refresh the file list."));
    } catch (error) {
      setError(controller.current.signal.aborted ? "Upload stopped. Refresh the workspace before retrying; the host may have received the file." : error instanceof Error ? error.message : "Could not upload. Your selected file is still here.");
    } finally { pending.current = false; setBusy(false); }
  }
  async function remove() {
    if (!removing || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      await teamRequest(connection.endpoint, roomPath(connection, `/assets/${encodeURIComponent(removing.id)}`), connection.memberKey, { method: "DELETE" });
      setMessage(`${removing.name} removed from the workspace.`); setRemoving(null);
      await onChange().catch(() => setMessage("File removed. Reconnect to refresh the file list."));
    } catch (error) { setError(error instanceof Error ? error.message : "Could not remove this file."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <section aria-labelledby="teams-assets-title" className="teams-assets">
    <div className="teams-section-heading"><div><h2 id="teams-assets-title">Shared files</h2><p className="teams-muted">Choose exactly what teammates can see.</p></div><span className="teams-count">{assets.length}</span></div>
    <label htmlFor="teams-file">Choose a file to share</label>
    <Input id="teams-file" ref={input} type="file" accept=".png,.jpg,.jpeg,.webp,.txt,.md,.json" disabled={busy} aria-describedby="teams-file-help teams-file-error"
      onChange={event => { setSelected(event.target.files?.[0] ?? null); setError(""); setMessage(""); }} />
    <p id="teams-file-help" className="teams-help">Images, text, Markdown, or JSON · Up to 2 MB. Selecting a file does not upload it.</p>
    {selected && <div className="teams-actions"><span className="teams-file-name">{selected.name} · {(selected.size / 1024).toFixed(0)} KB</span>
      <Button variant="primary" size="sm" disabled={busy || !canWrite} aria-busy={busy} onClick={() => void upload()}>{busy ? "Sharing…" : "Share file"}</Button>
      {busy ? <Button size="sm" onClick={() => controller.current?.abort()}>Cancel upload</Button> : <Button variant="ghost" size="sm" onClick={() => { setSelected(null); if (input.current) input.current.value = ""; }}>Remove selection</Button>}
    </div>}
    <p id="teams-file-error" role="alert" className="teams-error">{error}</p><p role="status" className="teams-help">{message}</p>
    {assets.length === 0 ? <p className="teams-empty">No files shared yet.</p> : <ul className="teams-file-list">{assets.slice(-100).map(asset => <li key={asset.id}><span><strong>{asset.name}</strong><small>{(asset.size / 1024).toFixed(0)} KB · {new Date(asset.createdAt).toLocaleString()}</small></span><div className="teams-actions"><Button size="sm" variant="outline" onClick={() => setPreview(asset)} aria-label={`Preview ${asset.name}`}>Preview</Button>{(canRemoveAny || asset.ownerId === connection.memberId) && <Button size="sm" variant="ghost" disabled={!canWrite || busy} onClick={() => setRemoving(asset)} aria-label={`Remove ${asset.name}`}>Remove</Button>}</div></li>)}</ul>}
    {assets.length > 100 && <p className="teams-help">Showing the newest 100 shared files.</p>}
    <Dialog open={!!preview} onOpenChange={open => { if (!open) setPreview(null); }}><DialogContent className="teams-dialog teams-file-dialog"><DialogHeader><DialogTitle>{preview?.name ?? "File preview"}</DialogTitle><DialogDescription>Explicitly shared with everyone in this workspace.</DialogDescription></DialogHeader>
      {previewLoading && <p role="status">Loading file…</p>}{previewError && <p role="alert" className="teams-error">{previewError}</p>}
      {previewData.url && <img className="teams-image-preview" src={previewData.url} alt={preview?.name ?? "Shared image"} />}
      {previewData.text !== undefined && <pre className="teams-text-preview">{previewData.text}</pre>}
    </DialogContent></Dialog>
    <Dialog open={!!removing} onOpenChange={open => { if (!open && !busy) setRemoving(null); }}><DialogContent className="teams-dialog"><DialogHeader><DialogTitle>Remove {removing?.name}?</DialogTitle><DialogDescription>This removes the shared copy from the workspace. Your original file stays on your Mac. Copies teammates already saved cannot be recalled.</DialogDescription></DialogHeader><div className="teams-actions"><Button autoFocus disabled={busy} onClick={() => setRemoving(null)}>Keep file</Button><Button variant="destructive" disabled={busy || !canWrite} onClick={() => void remove()}>Remove shared file</Button></div><p role="alert" className="teams-error">{error}</p></DialogContent></Dialog>
  </section>;
}
