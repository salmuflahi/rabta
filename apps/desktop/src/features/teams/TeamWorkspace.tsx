import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Surface } from "@/components/ui/surface";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FamilyEmblem } from "@/components/brand/FamilyEmblem";
import { roomPath, teamRequest, TeamRequestError, type TeamLane, type TeamMember, type TeamProposal } from "./client";
import { ConnectionForm, SecretInput } from "./ConnectionForm";
import { Room } from "./Room";
import { TeamAssets } from "./TeamAssets";
import { useTeamRoom } from "./useTeamRoom";

type Draft = { title: string; content: string; revision: number };
export function TeamWorkspace() {
  const room = useTeamRoom();
  const { connection, state, connectionState, connectionError } = room;
  const [draft, setDraft] = useState<Draft | null>(null);
  const draftRef = useRef(draft); draftRef.current = draft;
  const [shareTyping, setShareTyping] = useState(false);
  const [presence, setPresence] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const [compare, setCompare] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsFeedback, setDetailsFeedback] = useState("");
  const [invite, setInvite] = useState("");
  const [inviteFeedback, setInviteFeedback] = useState("");
  const [proposalTarget, setProposalTarget] = useState<TeamLane | null>(null);
  const [proposalText, setProposalText] = useState({ title: "", content: "" });
  const [proposalError, setProposalError] = useState("");
  const proposalAttempt = useRef<{ payload: string; key: string } | null>(null);
  const [applying, setApplying] = useState<TeamProposal | null>(null);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const pending = useRef(false);
  const composing = useRef(false);
  const editVersion = useRef(0);
  const lastServer = useRef<TeamLane | undefined>();
  const saveRef = useRef<(publish: boolean) => Promise<void>>(async () => {});
  const own = state?.lanes.find(lane => lane.memberId === state.me.id);
  const dirty = !!draft && (!!own ? draft.title !== own.title || draft.content !== own.content : !!(draft.title || draft.content));
  const canWrite = connectionState === "live" && !busy;
  const currentMemberId = state?.me.id;
  useEffect(() => {
    if (!own) return;
    const previous = lastServer.current;
    setDraft(current => !current || !previous || (current.title === previous.title && current.content === previous.content)
      ? { title: own.title, content: own.content, revision: own.revision } : current);
    lastServer.current = own;
  }, [own]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (!connection || !presence) return;
    const heartbeat = () => { void teamRequest(connection.endpoint, roomPath(connection, "/presence"), connection.memberKey, {
      method: "POST", body: { status: document.visibilityState === "hidden" ? "away" : "working" },
    }).catch(() => { /* Connection health comes from the state and event channel. */ }); };
    heartbeat();
    const timer = setInterval(heartbeat, 30_000);
    document.addEventListener("visibilitychange", heartbeat);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", heartbeat); };
  }, [connection, presence]);
  async function operation<T>(label: string, path: string, body?: unknown, method = "POST"): Promise<T | undefined> {
    if (!connection || pending.current) throw new Error("Wait for the current workspace change to finish.");
    pending.current = true; setBusy(label); setError(""); setMessage("");
    try {
      const response = await teamRequest<T>(connection.endpoint, roomPath(connection, path), connection.memberKey, { method, body });
      try { await room.refresh(); } catch { setMessage("Change saved. Reconnect to refresh the workspace view."); }
      return response;
    } catch (error) {
      if (error instanceof TeamRequestError && error.status === 409) {
        setError(`${error.message} The latest workspace is being loaded; review it before trying again.`);
        void room.refresh().catch(() => {});
      } else setError(error instanceof Error ? error.message : "Could not save this change. Your edits are still here.");
      throw error;
    } finally { pending.current = false; setBusy(""); }
  }
  async function save(publish: boolean) {
    if (!connection || !draftRef.current || pending.current || composing.current) return;
    const started = draftRef.current;
    if (!started.title.trim()) { setError("Give your working draft a title before saving."); document.getElementById("teams-lane-title")?.focus(); setShareTyping(false); return; }
    const version = editVersion.current;
    pending.current = true; setBusy(publish ? "Publishing" : "Saving"); setError(""); setMessage("");
    try {
      const lane = own && own.revision === started.revision && own.title === started.title && own.content === started.content ? own : (await teamRequest<{ lane: TeamLane }>(connection.endpoint, roomPath(connection, "/lane"), connection.memberKey, {
        method: "PUT", body: { expectedRevision: started.revision, title: started.title, content: started.content },
      })).lane;
      setDraft(current => current ? { ...current, revision: lane.revision } : current);
      if (publish) await teamRequest(connection.endpoint, roomPath(connection, "/lane/publish"), connection.memberKey, { method: "POST", body: { expectedRevision: lane.revision } });
      await room.refresh();
      if (version === editVersion.current) setMessage(publish ? "Preview shared with the workspace." : "Draft saved privately to your workspace host.");
      setConflict(false);
    } catch (error) {
      setShareTyping(false);
      if (error instanceof TeamRequestError && error.status === 409) {
        setConflict(true); setError("A newer version is on the workspace. Your edits are still here. Compare before saving again.");
        void room.refresh().catch(() => {});
      } else setError(error instanceof Error ? error.message : "Could not save. Your draft is still here.");
    } finally { pending.current = false; setBusy(""); }
  }
  saveRef.current = save;
  useEffect(() => {
    if (!shareTyping || !dirty || busy || connectionState !== "live" || conflict) return;
    const timer = setTimeout(() => { if (!composing.current) void saveRef.current(true); }, 900);
    return () => clearTimeout(timer);
  }, [shareTyping, dirty, draft?.title, draft?.content, busy, connectionState, conflict]);
  const updateDraft = (patch: Partial<Draft>) => {
    editVersion.current++;
    setDraft(current => ({ title: "", content: "", revision: own?.revision ?? 0, ...current, ...patch }));
    setMessage("");
  };
  function memberName(id: string) { return state?.members.find(member => member.id === id)?.displayName ?? "Former member"; }
  async function sendProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!proposalTarget || pending.current) return;
    if (!proposalText.title.trim()) { setProposalError("Give this proposed version a title."); document.getElementById("teams-proposal-title")?.focus(); return; }
    setProposalError("");
    try {
      const payload = { targetMemberId: proposalTarget.memberId, targetRevision: proposalTarget.revision, ...proposalText };
      const fingerprint = JSON.stringify(payload);
      if (proposalAttempt.current?.payload !== fingerprint) proposalAttempt.current = { payload: fingerprint, key: crypto.randomUUID() };
      await operation("Sending suggestion", "/proposals", { ...payload, idempotencyKey: proposalAttempt.current.key });
      proposalAttempt.current = null;
      setProposalTarget(null); setMessage("Suggestion sent for review. Their work has not changed.");
    } catch (error) { setProposalError(error instanceof Error ? error.message : "Could not send. Your suggestion is still here."); }
  }
  async function createInvitation() {
    try {
      const result = await operation<{ invitationKey: string }>("Creating invitation", "/invitations", {});
      if (result) { setInvite(result.invitationKey); setInviteFeedback(""); }
    } catch { /* Owned page error remains visible. */ }
  }
  async function copyInvitation() {
    try { await navigator.clipboard.writeText(invite); setInviteFeedback("Invitation copied. Share it privately with one teammate."); }
    catch { setInviteFeedback("Clipboard unavailable. Show the invitation and copy it manually."); document.getElementById("teams-new-invitation")?.focus(); }
  }
  async function changePresence(next: boolean) {
    if (!connection) return;
    try {
      await operation("Updating presence", "/presence", { status: next ? "working" : "offline" });
      setPresence(next);
    } catch { /* Keep the previous permission setting. */ }
  }
  function disconnect() {
    if (connection && presence) void teamRequest(connection.endpoint, roomPath(connection, "/presence"), connection.memberKey, { method: "POST", body: { status: "offline" } }).catch(() => {});
    room.disconnect(); setDraft(null); lastServer.current = undefined; setPresence(false); setShareTyping(false);
    setError(""); setMessage(""); setConflict(false); setDisconnectOpen(false); setInvite("");
  }

  if (!connection) return <ConnectionForm onConnect={room.connect} />;
  return <div className="teams-workspace">
    <header className="teams-workspace-header"><div><span className="teams-eyebrow"><FamilyEmblem product="teams" size={27} /> Rabta Teams</span><h1>{state?.room.name ?? "Opening workspace…"}</h1></div>
      <div className="teams-actions"><span className={`teams-connection teams-connection-${connectionState}`}><i aria-hidden="true" />{connectionState === "live" ? "Live updates connected" : connectionState === "connecting" ? "Connecting…" : connectionState === "expired" ? "Access ended" : "Updates disconnected"}</span>
        {state?.me.role === "owner" && <Button variant="outline" onClick={() => { setInviteOpen(true); setInviteFeedback(""); }}>Invite teammate</Button>}
        <Button variant="ghost" onClick={() => setDetailsOpen(true)}>Connection details</Button>
        <Button variant="ghost" disabled={!!busy} onClick={() => setDisconnectOpen(true)}>Disconnect</Button></div>
    </header>
    {connectionError && <div className="teams-banner" role="alert"><p>{connectionError} {state ? "Showing the last received work." : "Check the workspace host."}</p><Button onClick={room.reconnect}>Reconnect</Button></div>}
    {!state ? <Surface className="teams-loading"><p role="status">{connectionState === "connecting" ? "Loading your team’s workspace…" : "Your workspace could not be loaded."}</p></Surface> : <>
      <Room connection={connection} state={state} live={connectionState === "live"} cursors={room.cursors} threadVersion={room.threadVersion} refresh={room.refresh} onRemoveMember={setRemoving} />
      <div className="teams-work-grid">
        <Surface variant="raised" className="teams-own-lane"><div className="teams-section-heading"><div><span className="teams-eyebrow">Your lane</span><h2>Make space for your next idea.</h2></div><span className="teams-count">Revision {own?.revision ?? 0}</span></div>
          <p className="teams-muted">Only you edit this draft. Teammates see the preview you publish.</p>
          <form noValidate aria-busy={!!busy} onSubmit={event => { event.preventDefault(); void save(false); }} className="teams-form">
            <label htmlFor="teams-lane-title">What are you working on?</label><Input id="teams-lane-title" aria-invalid={!!error && !draft?.title.trim() || undefined} aria-describedby="teams-lane-error" maxLength={160} value={draft?.title ?? ""} onChange={event => updateDraft({ title: event.target.value })} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} placeholder="A launch plan, a rough cut, the next release…" />
            <label htmlFor="teams-lane-content">Your working draft</label><Textarea id="teams-lane-content" value={draft?.content ?? ""} maxLength={100_000} onChange={event => updateDraft({ content: event.target.value })}
              onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; if (shareTyping) void saveRef.current(true); }}
              placeholder="Write, plan, or paste the work you want to share. Other apps and files stay private." className="teams-editor resize-none" rows={14} />
            <div className="teams-sharing-controls"><label><input type="checkbox" checked={shareTyping} disabled={!canWrite || conflict} onChange={event => { setShareTyping(event.target.checked); if (event.target.checked) void save(true); }} />Share edits as I type</label><p>When enabled, this lane’s text is saved and published after you pause. This does not share your screen.</p><label><input type="checkbox" checked={presence} disabled={!canWrite} onChange={event => void changePresence(event.target.checked)} />Show when I’m working here</label></div>
            <div className="teams-actions"><Button type="submit" variant="outline" disabled={!canWrite || !draft || conflict} aria-busy={busy === "Saving"}>Save private draft</Button><Button type="button" variant="primary" disabled={!canWrite || !draft || conflict} aria-busy={busy === "Publishing"} onClick={() => void save(true)}>Publish preview</Button><span className="teams-help">{busy || (shareTyping ? "Sharing edits is on" : dirty ? "Unsaved edits" : "Draft up to date")}</span></div>
            {own?.publishedAt && <Button type="button" variant="ghost" size="sm" disabled={!canWrite} onClick={() => { setShareTyping(false); void operation("Removing preview", "/lane/publish", undefined, "DELETE").then(() => setMessage("Your preview is no longer shared. Your private draft is still saved.")).catch(() => {}); }}>Stop sharing my preview</Button>}
          </form>
          <p role="status" className="teams-feedback">{message}</p><p id="teams-lane-error" role="alert" className="teams-error">{error}</p>
          {conflict && <Button variant="outline" onClick={() => setCompare(true)}>Compare latest version</Button>}
        </Surface>
        <section className="teams-live-lanes" aria-labelledby="teams-previews-title"><div className="teams-section-heading"><div><h2 id="teams-previews-title">Across the room</h2><p className="teams-muted">Published work, updated as teammates share.</p></div></div>
          {state.lanes.filter(lane => lane.memberId !== currentMemberId).length === 0 ? <Surface className="teams-empty-preview"><FamilyEmblem product="teams" size={46} /><h3>Shared work will appear here.</h3><p>Invite a teammate and ask them to publish their first preview. Everyone keeps control of their own lane.</p></Surface> : <div className="teams-previews">{state.lanes.filter(lane => lane.memberId !== currentMemberId).slice(0, 100).map(lane => <Surface className="teams-preview" key={lane.memberId}><header><strong>{memberName(lane.memberId)}</strong><span>Revision {lane.revision}</span></header><h3>{lane.title || "Untitled work"}</h3><pre>{lane.content || "No text in this preview."}</pre><footer><small>{lane.publishedAt ? `Shared ${new Date(lane.publishedAt).toLocaleString()}` : "Published preview"}</small><Button size="sm" variant="outline" disabled={!canWrite} onClick={() => { setProposalTarget(lane); setProposalText({ title: lane.title, content: lane.content }); setProposalError(""); }}>Suggest changes</Button></footer></Surface>)}</div>}
        </section>
      </div>
      <Surface className="teams-review-section"><div className="teams-section-heading"><div><h2>Review together</h2><p className="teams-muted">Suggestions never replace someone else’s work automatically.</p></div></div>
        {state.proposals.length === 0 ? <p className="teams-empty">No suggestions yet. Open a teammate’s preview to suggest a change.</p> : <ul className="teams-proposal-list">{state.proposals.slice(-100).reverse().map(proposal => <li key={proposal.id}><div className="teams-proposal-heading"><div><strong>{proposal.title}</strong><p>{memberName(proposal.sourceMemberId)} → {memberName(proposal.targetMemberId)} · Based on revision {proposal.targetRevision}</p></div><span className="teams-proposal-status">{proposal.status}</span></div><details><summary>Read proposed version</summary><pre>{proposal.content}</pre></details>
          {proposal.targetMemberId === currentMemberId && <div className="teams-actions">{proposal.status === "pending" && <><Button size="sm" variant="primary" disabled={!canWrite} onClick={() => void operation("Accepting suggestion", `/proposals/${proposal.id}/review`, { decision: "accept", expectedRevision: proposal.revision }).catch(() => {})}>Accept for review</Button><Button size="sm" variant="ghost" disabled={!canWrite} onClick={() => void operation("Declining suggestion", `/proposals/${proposal.id}/review`, { decision: "decline", expectedRevision: proposal.revision }).catch(() => {})}>Decline</Button></>}{proposal.status === "accepted" && <><Button size="sm" variant="primary" disabled={!canWrite || dirty} onClick={() => setApplying(proposal)}>Apply to my draft</Button>{dirty && <span className="teams-help">Save or resolve your current edits before applying.</span>}</>}</div>}
        </li>)}</ul>}
      </Surface>
      <Surface className="teams-assets-surface"><TeamAssets connection={connection} assets={state.assets} canWrite={connectionState === "live"} canRemoveAny={state.me.role === "owner"} onChange={room.refresh} /></Surface>
    </>}
    <Dialog open={!!proposalTarget} onOpenChange={open => { if (!open && !busy) setProposalTarget(null); }}><DialogContent className="teams-dialog"><DialogHeader><DialogTitle>Suggest a version for {proposalTarget ? memberName(proposalTarget.memberId) : "your teammate"}</DialogTitle><DialogDescription>They can review and apply this version. Their current work stays unchanged until then.</DialogDescription></DialogHeader><form noValidate onSubmit={event => void sendProposal(event)} className="teams-form"><label htmlFor="teams-proposal-title">Proposed title</label><Input id="teams-proposal-title" disabled={!!busy} aria-invalid={!!proposalError && !proposalText.title.trim() || undefined} aria-describedby="teams-proposal-error" value={proposalText.title} onChange={event => setProposalText(current => ({ ...current, title: event.target.value }))} maxLength={160} /><label htmlFor="teams-proposal-content">Proposed text</label><Textarea id="teams-proposal-content" disabled={!!busy} aria-describedby="teams-proposal-error" className="teams-editor resize-none" rows={10} value={proposalText.content} onChange={event => setProposalText(current => ({ ...current, content: event.target.value }))} maxLength={100_000} /><p id="teams-proposal-error" role="alert" className="teams-error">{proposalError}</p><Button variant="primary" type="submit" disabled={!!busy} aria-busy={!!busy}>Send for review</Button></form></DialogContent></Dialog>
    <Dialog open={inviteOpen} onOpenChange={open => { setInviteOpen(open); if (!open) setInvite(""); }}><DialogContent className="teams-dialog"><DialogHeader><DialogTitle>Bring someone into the room.</DialogTitle><DialogDescription>Share this workspace address and a private invitation with your teammate. They can read published previews and shared files.</DialogDescription></DialogHeader><label htmlFor="teams-share-address">Workspace address</label><Input id="teams-share-address" readOnly value={connection.endpoint} />{connection.endpoint.startsWith("http:") && <p className="teams-help">This address works on this Mac only. To connect another Mac, your host needs an HTTPS address.</p>}{invite ? <><label htmlFor="teams-new-invitation">Private invitation</label><SecretInput id="teams-new-invitation" label="Private invitation" readOnly value={invite} /><Button onClick={() => void copyInvitation()}>Copy invitation</Button></> : <Button variant="primary" disabled={!canWrite} onClick={() => void createInvitation()}>Create invitation</Button>}<p role="status">{inviteFeedback}</p><p role="alert" className="teams-error">{error}</p></DialogContent></Dialog>
    <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}><DialogContent className="teams-dialog"><DialogHeader><DialogTitle>Your private connection details</DialogTitle><DialogDescription>Save these in your password manager before quitting. The member key gives access as you; keep it private. Use invitations to bring in teammates.</DialogDescription></DialogHeader><label htmlFor="teams-private-address">Workspace address</label><Input id="teams-private-address" readOnly value={connection.endpoint} /><label htmlFor="teams-private-id">Workspace ID</label><Input id="teams-private-id" readOnly value={connection.roomId} /><label htmlFor="teams-private-key">Your member key</label><SecretInput id="teams-private-key" label="Your member key" readOnly value={connection.memberKey} /><Button onClick={() => { void navigator.clipboard.writeText(connection.memberKey).then(() => setDetailsFeedback("Member key copied. Save it privately with the workspace address and ID.")).catch(() => setDetailsFeedback("Clipboard unavailable. Show your member key and copy it manually.")); }}>Copy my member key</Button><p role="status">{detailsFeedback}</p></DialogContent></Dialog>
    <Dialog open={compare} onOpenChange={setCompare}><DialogContent className="teams-dialog"><DialogHeader><DialogTitle>Review the newer version</DialogTitle><DialogDescription>Your edits have been kept. Choose which text should be in your editor before saving again.</DialogDescription></DialogHeader><div className="teams-comparison"><section><h3>Latest on workspace · revision {own?.revision}</h3><strong>{own?.title}</strong><pre>{own?.content}</pre></section><section><h3>Your unsaved text</h3><strong>{draft?.title}</strong><pre>{draft?.content}</pre></section></div><div className="teams-actions"><Button onClick={() => { if (own) setDraft({ title: own.title, content: own.content, revision: own.revision }); setConflict(false); setError(""); setCompare(false); }}>Use latest text</Button><Button variant="primary" onClick={() => { if (own) setDraft(current => current ? { ...current, revision: own.revision } : current); setConflict(false); setError(""); setCompare(false); setMessage("Your text is ready to save as the next revision. Review it before saving."); }}>Keep my text for next save</Button></div></DialogContent></Dialog>
    <Dialog open={!!applying} onOpenChange={open => { if (!open) setApplying(null); }}><DialogContent className="teams-dialog"><DialogHeader><DialogTitle>Apply this suggested version?</DialogTitle><DialogDescription>This replaces your saved lane draft with the reviewed title and text. Your published preview stays as it is until you publish again.</DialogDescription></DialogHeader><div className="teams-actions"><Button autoFocus onClick={() => setApplying(null)}>Keep current draft</Button><Button variant="primary" disabled={!canWrite} onClick={() => { if (!applying) return; void operation("Applying suggestion", `/proposals/${applying.id}/apply`, { expectedRevision: applying.revision, targetRevision: applying.targetRevision }).then(() => { setApplying(null); setShareTyping(false); setMessage("Suggested version applied to your private draft."); }).catch(() => setApplying(null)); }}>Apply suggested version</Button></div></DialogContent></Dialog>
    <Dialog open={!!removing} onOpenChange={open => { if (!open) setRemoving(null); }}><DialogContent className="teams-dialog"><DialogHeader><DialogTitle>Remove {removing?.displayName}?</DialogTitle><DialogDescription>Their current connection will lose access to this workspace. They will need a new invitation to return.</DialogDescription></DialogHeader><div className="teams-actions"><Button autoFocus onClick={() => setRemoving(null)}>Keep member</Button><Button variant="destructive" disabled={!canWrite} onClick={() => { if (!removing) return; void operation("Removing member", `/members/${removing.id}`, undefined, "DELETE").then(() => setRemoving(null)).catch(() => {}); }}>Remove member</Button></div><p role="alert" className="teams-error">{error}</p></DialogContent></Dialog>
    <Dialog open={disconnectOpen} onOpenChange={setDisconnectOpen}><DialogContent className="teams-dialog"><DialogHeader><DialogTitle>Disconnect from this workspace?</DialogTitle><DialogDescription>{dirty ? "Your unsaved text will be discarded. " : ""}Saved work remains on the host. Save your private connection details to reconnect as the same member; this app clears the key on disconnect.</DialogDescription></DialogHeader><div className="teams-actions"><Button autoFocus onClick={() => setDisconnectOpen(false)}>Stay connected</Button><Button variant="outline" onClick={() => { setDisconnectOpen(false); setDetailsOpen(true); }}>View connection details</Button><Button variant="outline" onClick={disconnect}>Disconnect</Button></div></DialogContent></Dialog>
  </div>;
}
