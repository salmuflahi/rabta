import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Surface } from "@/components/ui/surface";
import { FamilyEmblem } from "@/components/brand/FamilyEmblem";
import { normalizeEndpoint, teamRequest, type TeamConnection, type TeamCredentials, type TeamState } from "./client";

export function SecretInput({ id, value, onChange, readOnly = false, label, invalid, disabled, descriptionId }: {
  id: string; value: string; onChange?: (value: string) => void; readOnly?: boolean; label: string;
  invalid?: boolean; disabled?: boolean; descriptionId?: string;
}) {
  const [visible, setVisible] = useState(false);
  return <div className="teams-secret"><Input id={id} aria-label={label} type={visible ? "text" : "password"}
    value={value} onChange={event => onChange?.(event.target.value)} readOnly={readOnly}
    autoComplete="off" spellCheck={false} aria-invalid={invalid || undefined} aria-describedby={descriptionId} disabled={disabled} />
    <Button type="button" variant="ghost" size="sm" aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
      aria-pressed={visible} onClick={() => setVisible(value => !value)}>{visible ? "Hide" : "Show"}</Button></div>;
}

export function ConnectionForm({ onConnect }: { onConnect: (connection: TeamConnection) => void }) {
  const [create, setCreate] = useState(false);
  const [resume, setResume] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [endpoint, setEndpoint] = useState("http://127.0.0.1:47831");
  const [displayName, setDisplayName] = useState("");
  const [roomName, setRoomName] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [invalidField, setInvalidField] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const enrollment = useRef<{ fingerprint: string; memberKey: string; idempotencyKey: string } | null>(null);
  const endpointInput = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const roomInput = useRef<HTMLInputElement>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    setInvalidField("");
    let address: string;
    try { address = normalizeEndpoint(endpoint); } catch (error) {
      setError((error as Error).message); setInvalidField("endpoint"); endpointInput.current?.focus(); return;
    }
    if (!resume && !displayName.trim()) { setError("Enter the name your teammates should see."); setInvalidField("name"); nameInput.current?.focus(); return; }
    if (resume && !roomId.trim()) { setError("Enter the workspace ID from your saved connection details."); setInvalidField("roomId"); document.getElementById("teams-room-id")?.focus(); return; }
    if (create && !roomName.trim()) { setError("Give your shared workspace a name."); setInvalidField("roomName"); roomInput.current?.focus(); return; }
    if (!key.trim()) { setError(resume ? "Enter your private member key." : create ? "Enter the setup key from your workspace host." : "Enter an invitation from your workspace owner."); setInvalidField("key"); document.getElementById("teams-connection-key")?.focus(); return; }
    pending.current = true; setBusy(true); setError("");
    try {
      let credentials: TeamCredentials;
      if (resume) {
        const state = await teamRequest<TeamState>(address, `/v1/rooms/${encodeURIComponent(roomId.trim())}/state`, key.trim());
        credentials = { roomId: state.room.id, memberId: state.me.id, memberKey: key.trim() };
      } else {
        const fingerprint = JSON.stringify({ address, create, key: key.trim(), name: roomName.trim(), displayName: displayName.trim() });
        if (enrollment.current?.fingerprint !== fingerprint) enrollment.current = {
          fingerprint, memberKey: `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", ""), idempotencyKey: crypto.randomUUID(),
        };
        const retry = { memberKey: enrollment.current.memberKey, idempotencyKey: enrollment.current.idempotencyKey };
        credentials = create
          ? await teamRequest<TeamCredentials>(address, "/v1/rooms", key.trim(), { method: "POST", body: { name: roomName.trim(), displayName: displayName.trim(), ...retry } })
          : await teamRequest<TeamCredentials>(address, "/v1/invitations/accept", undefined, { method: "POST", body: { invitationKey: key.trim(), displayName: displayName.trim(), ...retry } });
      }
      enrollment.current = null;
      setKey("");
      onConnect({ ...credentials, endpoint: address });
    } catch (error) { setError(error instanceof Error ? error.message : "Could not connect. Check the details and try again."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <div className="teams-entry">
    <header className="teams-intro"><span className="teams-eyebrow"><FamilyEmblem product="teams" size={30} /> Rabta Teams</span>
      <h1>Room to work.<br />Together.</h1>
      <p>Keep your own working space. Share a live preview when you’re ready, follow your teammates, and review changes before they enter your work.</p>
      <ul className="teams-principles"><li><strong>Your own lane</strong><span>Your draft stays yours to edit.</span></li><li><strong>A shared view</strong><span>Publish previews and selected files.</span></li><li><strong>Changes by agreement</strong><span>Review suggestions before applying them.</span></li></ul>
    </header>
    <Surface variant="raised" className="teams-connect-panel">
      <h2>{resume ? "Return to your workspace" : create ? "Create a workspace" : "Join your team"}</h2>
      <p className="teams-muted">{resume ? "Use the private connection details you saved earlier." : create ? "Use the setup key from the person hosting your team workspace." : "Get a workspace address and invitation from your team’s owner."}</p>
      <form noValidate onSubmit={submit} aria-busy={busy} className="teams-form">
        <label htmlFor="teams-endpoint">Workspace address</label>
        <Input id="teams-endpoint" ref={endpointInput} value={endpoint} onChange={event => setEndpoint(event.target.value)} type="url" spellCheck={false} aria-describedby="teams-host-help teams-connect-error" aria-invalid={invalidField === "endpoint" || undefined} disabled={busy} />
        <p id="teams-host-help" className="teams-help">Your team needs a running Rabta Teams host. The default address connects to a host on this Mac.</p>
        {resume ? <><label htmlFor="teams-room-id">Workspace ID</label><Input id="teams-room-id" value={roomId} onChange={event => setRoomId(event.target.value)} spellCheck={false} aria-invalid={invalidField === "roomId" || undefined} aria-describedby="teams-connect-error" disabled={busy} /></> : <><label htmlFor="teams-display-name">Your name</label>
        <Input id="teams-display-name" ref={nameInput} value={displayName} onChange={event => setDisplayName(event.target.value)} autoComplete="name" maxLength={80} aria-describedby="teams-connect-error" aria-invalid={invalidField === "name" || undefined} disabled={busy} /></>}
        {create && <><label htmlFor="teams-room-name">Workspace name</label><Input id="teams-room-name" ref={roomInput} value={roomName} onChange={event => setRoomName(event.target.value)} maxLength={120} aria-describedby="teams-connect-error" aria-invalid={invalidField === "roomName" || undefined} disabled={busy} /></>}
        <label htmlFor="teams-connection-key">{resume ? "Member key" : create ? "Setup key" : "Invitation"}</label>
        <SecretInput id="teams-connection-key" value={key} onChange={setKey} label={resume ? "Member key" : create ? "Setup key" : "Invitation"} invalid={invalidField === "key"} disabled={busy} descriptionId="teams-connect-error" />
        <p id="teams-connect-error" role="alert" className="teams-feedback teams-error">{error}</p>
        <Button type="submit" variant="primary" disabled={busy} className="teams-submit">{busy ? "Connecting…" : resume ? "Reconnect" : create ? "Create workspace" : "Join workspace"}</Button>
        <Button type="button" variant="link" disabled={busy} onClick={() => { setCreate(value => resume ? false : !value); setResume(false); setKey(""); setError(""); }}>{create || resume ? "I have an invitation" : "Set up a new workspace"}</Button>
        {!create && !resume && <Button type="button" variant="link" disabled={busy} onClick={() => { setResume(true); setKey(""); setError(""); }}>Reconnect with a saved key</Button>}
      </form>
      <p className="teams-help">Only what you choose to share reaches this workspace. Your screen and other apps stay private. Connection keys stay in memory until you quit.</p>
    </Surface>
  </div>;
}
