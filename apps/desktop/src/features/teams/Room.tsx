import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Surface } from "@/components/ui/surface";
import { useStore, type Task, type TaskResource } from "@/store";
import { useRestore } from "@/restore/RestoreExperience";
import { activateSummaryToResult, type ActivateSummary } from "@/restore/normalize";
import type { RestoreTool } from "@/restore/types";
import { appendEntry, readSnapshot, readThread, storeSnapshot, TeamRequestError, type EntryKind, type StoredSnapshot, type TeamConnection, type TeamCursor, type TeamEntry, type TeamMember, type TeamPlace, type TeamState } from "./client";
import { Cursors } from "./Cursors";
import { buildSnapshot, describeSnapshot, snapshotIsEmpty } from "./snapshot";
import { acknowledgements, handoffAnswer, initials, KIND_VERBS, nextLamport, orderEntries, personColor, placeLabel, taskIdFor, threadMarkdown, waitingFor } from "./thread";
import { useTogether } from "./together";

export interface RoomProps {
  connection: TeamConnection;
  state: TeamState;
  live: boolean;
  cursors: Record<string, TeamCursor>;
  threadVersion: number;
  refresh: () => Promise<unknown>;
  onRemoveMember?: (member: TeamMember) => void;
}
type ComposerKind = Extract<EntryKind, "knot" | "request" | "decision" | "handoff">;
const COMPOSER: { kind: ComposerKind; label: string; verb: string; hint: string }[] = [
  { kind: "knot", label: "Knot", verb: "Tie the knot", hint: "A note tied to a place. Teammates open the place, not a screenshot of it." },
  { kind: "request", label: "Request", verb: "Ask", hint: "A question or an ask, with the place it is about." },
  { kind: "decision", label: "Decision", verb: "Decide", hint: "Written once, acknowledged by everyone it affects. Never lost in chat." },
  { kind: "handoff", label: "Hand off", verb: "Hand off", hint: "Your capsule and the next step go to one teammate. Nothing opens on their Mac until they step in." },
];
const TOOL_NAMES: Record<string, string> = { vscode: "VS Code", chrome: "Chrome", git: "Git" };
const MEMORY_KEY = "rabta.teams.threadTasks";
type Memory = Record<string, { projectId: string; taskId: string }>;
function readMemory(roomId: string): Memory {
  try { const all = JSON.parse(localStorage.getItem(MEMORY_KEY) ?? "{}") as Record<string, Memory>; return all[roomId] ?? {}; } catch { return {}; }
}
function writeMemory(roomId: string, memory: Memory) {
  try { const all = JSON.parse(localStorage.getItem(MEMORY_KEY) ?? "{}") as Record<string, Memory>; all[roomId] = memory; localStorage.setItem(MEMORY_KEY, JSON.stringify(all)); } catch { /* Remembering is a convenience. */ }
}
const describe = (error: unknown, fallback: string) => error instanceof Error ? error.message : typeof error === "string" ? error : fallback;
const person = (id: string, members: TeamMember[]) => ({ "--person": personColor(id, members) } as CSSProperties);

/**
 * The Room: who is here, the thread of the work, and the capsule that lets a
 * teammate step into it. Everything the service stores is references; every
 * open happens through the normal restore, with its receipt.
 */
export function Room({ connection, state, live, cursors, threadVersion, refresh, onRemoveMember }: RoomProps) {
  const me = state.me.id;
  const members = state.members;
  const threads = useMemo(() => [...(state.threads ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [state.threads]);
  const inbox = state.inbox ?? [];
  const projects = useStore(s => s.projects);
  const focusMode = useStore(s => s.prefs.focusMode);
  const setActiveTaskId = useStore(s => s.setActiveTaskId);
  const bumpActivation = useStore(s => s.bumpActivation);
  const restore = useRestore();
  const stageRef = useRef<HTMLElement | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [entries, setEntries] = useState<TeamEntry[]>([]);
  const [entriesError, setEntriesError] = useState("");
  const [capsule, setCapsule] = useState<StoredSnapshot | null>(null);
  const [capsuleError, setCapsuleError] = useState("");
  const [projectId, setProjectId] = useState("");
  const [memory, setMemory] = useState<Memory>(() => readMemory(state.room.id));
  const [together, setTogether] = useState(false);
  const [leading, setLeading] = useState(false);
  const [following, setFollowing] = useState<string | null>(null);
  const [kind, setKind] = useState<ComposerKind>("knot");
  const [text, setText] = useState("");
  const [placeIndex, setPlaceIndex] = useState("");
  const [to, setTo] = useState("");
  const [attach, setAttach] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [composingNew, setComposingNew] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const pending = useRef(false);
  const current = threads.find(thread => thread.id === selected) ?? null;
  const ordered = useMemo(() => orderEntries(entries), [entries]);
  const project = projects.find(item => item.id === projectId);
  const vscode = useStore(s => s.connectors.find(c => c.kind === "vscode" && c.connected)?.id ?? null);
  const name = (id: string) => members.find(member => member.id === id)?.displayName ?? "Former member";

  useEffect(() => { if (!selected && threads[0]) setSelected(threads[0].id); }, [selected, threads]);
  useEffect(() => { if (!projectId && projects.length) setProjectId((capsule && projects.find(item => item.name === capsule.snapshot.project.name)) ?.id ?? projects[0].id); }, [projectId, projects, capsule]);
  // The thread's entries, refetched on every live append.
  useEffect(() => {
    if (!selected || !current) { setEntries([]); return; }
    const controller = new AbortController();
    readThread(connection, selected, controller.signal).then(result => { if (!controller.signal.aborted) { setEntries(result.entries); setEntriesError(""); } })
      .catch(error => { if (!controller.signal.aborted) setEntriesError(describe(error, "The thread could not be loaded.")); });
    return () => controller.abort();
  }, [connection, selected, current, threadVersion]);
  // The latest capsule on the thread.
  const capsuleHash = current?.lastSnapshot ?? null;
  useEffect(() => {
    if (!capsuleHash) { setCapsule(null); setCapsuleError(""); return; }
    const controller = new AbortController();
    readSnapshot(connection, capsuleHash, controller.signal).then(result => { if (!controller.signal.aborted) { setCapsule(result); setCapsuleError(""); } })
      .catch(error => { if (!controller.signal.aborted) setCapsuleError(describe(error, "The capsule could not be loaded.")); });
    return () => controller.abort();
  }, [connection, capsuleHash]);
  useEffect(() => { if (!live) { setTogether(false); setLeading(false); setFollowing(null); } }, [live]);
  useEffect(() => { if (following && !cursors[following]) setFollowing(null); }, [following, cursors]);

  const { editorConnected } = useTogether({ connection, me, members, cursors, task: selected, projectRoot: project?.repoPath ?? null, stageRef, enabled: together && live, leading, following, onError: setError });

  const places = useMemo<TeamPlace[]>(() => capsule ? [
    ...capsule.snapshot.files.map(path => ({ type: "file", path } as TeamPlace)),
    ...capsule.snapshot.folders.map(path => ({ type: "folder", path } as TeamPlace)),
    ...capsule.snapshot.links.map(url => ({ type: "link", url } as TeamPlace)),
  ] : [], [capsule]);

  async function guarded<T>(label: string, work: () => Promise<T>): Promise<T | undefined> {
    if (pending.current) { setError("Wait for the current change to finish."); return; }
    pending.current = true; setBusy(label); setError(""); setMessage("");
    try { return await work(); }
    catch (error) {
      if (error instanceof TeamRequestError && error.status === 409) void refresh().catch(() => {});
      setError(describe(error, "The change did not reach the room. Nothing was lost on your Mac."));
      return undefined;
    } finally { pending.current = false; setBusy(""); }
  }
  /** Describes the active capsule as references and stores it in the room. */
  async function captureCapsule(): Promise<string> {
    const activeId = await invoke<string | null>("active_task");
    if (typeof activeId !== "string" || !activeId) throw new Error("Open a capsule first. The snapshot describes what you have open, as references.");
    for (const candidate of useStore.getState().projects) {
      const tasks = await invoke<Task[]>("list_tasks", { projectId: candidate.id });
      const task = Array.isArray(tasks) ? tasks.find(item => item.id === activeId) : undefined;
      if (!task) continue;
      const resources = await invoke<TaskResource[]>("task_resources", { taskId: task.id });
      const snapshot = buildSnapshot(task, candidate, Array.isArray(resources) ? resources : []);
      if (snapshotIsEmpty(snapshot)) throw new Error("Your capsule has nothing a teammate could open. Save it with a connected tool first.");
      return (await storeSnapshot(connection, snapshot)).hash;
    }
    throw new Error("Your active capsule belongs to no project on this Mac.");
  }
  async function append(task: string, entry: Omit<Parameters<typeof appendEntry>[2], "lamport" | "prev" | "idempotencyKey">, known = ordered) {
    const result = await appendEntry(connection, task, { ...entry, lamport: nextLamport(known), prev: known[known.length - 1]?.hash ?? null, idempotencyKey: crypto.randomUUID() });
    if (task === selected) setEntries(previous => previous.some(item => item.hash === result.entry.hash) ? previous : [...previous, result.entry]);
    await refresh().catch(() => {});
    return result;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = text.trim();
    if (!body) { setError(kind === "handoff" ? "Write the next step for your teammate." : "Write the note first."); document.getElementById("teams-knot-text")?.focus(); return; }
    let task = composingNew || !current ? null : current.id; let title = current?.title;
    if (!task) {
      if (!newTitle.trim()) { setError("Name the thread: the task it is about."); document.getElementById("teams-thread-title")?.focus(); return; }
      task = taskIdFor(newTitle.trim()); title = newTitle.trim();
    }
    if (kind === "handoff" && !to) { setError("Choose who this goes to."); return; }
    const place = placeIndex === "" ? null : places[Number(placeIndex)] ?? null;
    await guarded(COMPOSER.find(item => item.kind === kind)!.verb, async () => {
      const snapshot = attach || kind === "handoff" ? await captureCapsule() : null;
      await append(task!, { kind, text: body, place, snapshot, to: kind === "handoff" ? to : undefined, title }, task === selected ? ordered : []);
      setText(""); setPlaceIndex(""); setAttach(false); setNewTitle(""); setComposingNew(false);
      if (task !== selected) setSelected(task);
      setMessage(kind === "handoff" ? `Handed off to ${name(to)}. They see it the moment they look.` : kind === "decision" ? "Decision recorded. Teammates acknowledge it on the thread." : "Added to the thread.");
    });
  }
  async function answer(handoff: TeamEntry, verdict: "accept" | "decline", known = ordered) {
    await append(handoff.task, { kind: verdict, target: handoff.hash }, known);
  }
  function stepIn(stored: StoredSnapshot, handoff?: TeamEntry) {
    if (!project) { setError("Choose which of your projects holds this work, then step in."); return; }
    setError(""); setMessage("");
    const snapshot = stored.snapshot;
    const tools: RestoreTool[] = [];
    if (snapshot.files.length || snapshot.folders.length) tools.push({ id: "vscode", name: TOOL_NAMES.vscode, kind: "vscode" });
    if (snapshot.links.length) tools.push({ id: "chrome", name: TOOL_NAMES.chrome, kind: "chrome" });
    if (snapshot.branch) tools.push({ id: "git", name: TOOL_NAMES.git, kind: "git" });
    const task = handoff?.task ?? current?.id ?? null;
    restore.start({
      title: "Stepping in", subtitle: snapshot.title, tools,
      run: async () => {
        const imported = await invoke<{ task: Task }>("import_task_snapshot", { projectId: project.id, snapshot });
        const summary = await invoke<ActivateSummary>("activate_task", { taskId: imported.task.id, focusMode });
        setActiveTaskId(imported.task.id); bumpActivation();
        if (task) { const next = { ...memory, [task]: { projectId: project.id, taskId: imported.task.id } }; setMemory(next); writeMemory(state.room.id, next); }
        if (handoff && handoff.to === me && !handoffAnswer(entries, handoff)) await answer(handoff, "accept").catch(error => setError(describe(error, "You are in, but the room could not record it.")));
        return activateSummaryToResult(summary, tools);
      },
    });
  }
  async function stepInto(handoff: TeamEntry) {
    if (!handoff.snapshot) return;
    const stored = capsule?.hash === handoff.snapshot ? capsule : await guarded("Loading capsule", () => readSnapshot(connection, handoff.snapshot!));
    if (stored) stepIn(stored, handoff);
  }
  async function openPlace(place: TeamPlace) {
    setError(""); setMessage("");
    try {
      if (place.type === "link") { await invoke("open_url", { url: place.url }); return; }
      if (place.type === "file" || place.type === "folder") {
        if (!project) { setError("Choose the project this thread is about to open its places here."); return; }
        if (!vscode) { setMessage("Connect VS Code to jump to places from the thread."); return; }
        await invoke("send_command", { target: vscode, name: "editor.reveal", args: { path: `${project.repoPath.replace(/\/+$/, "")}/${place.path}`, line: place.type === "file" ? place.line ?? 1 : 1, column: place.type === "file" ? place.column ?? 1 : 1 } });
        return;
      }
      setMessage(`${placeLabel(place)} is a commit reference. Check it out in your own tool.`);
    } catch (error) { setError(describe(error, "The place could not be opened.")); }
  }
  async function copyMarkdown() {
    if (!current) return;
    try { await navigator.clipboard.writeText(threadMarkdown(current.title, entries, members)); setMessage("Thread copied as Markdown, ready for a pull request."); }
    catch { setError("Clipboard unavailable."); }
  }
  const cursorFor = (id: string) => cursors[id];
  const threadTitle = (task: string | null) => threads.find(thread => thread.id === task)?.title ?? task ?? "";
  const canWrite = live && !busy;
  const remembered = current ? memory[current.id] : undefined;
  const activeKind = COMPOSER.find(item => item.kind === kind)!;

  return <section className="teams-room" aria-label="The Room" ref={stageRef}>
    <Cursors cursors={cursors} members={members} me={me} />
    <div className="teams-people" aria-label="People">
      <ul className="teams-people-list">
        {members.slice(0, 100).map(member => {
          const cursor = cursorFor(member.id);
          const here = !!cursor;
          const sub = cursor?.task ? `in ${threadTitle(cursor.task)}` : here ? "Together" : member.status === "working" ? "Working" : member.status === "away" ? "Away" : "Presence not active";
          return <li key={member.id} className="teams-person" style={person(member.id, members)} data-here={here || undefined}>
            <span className="teams-person-avatar" aria-hidden="true">{initials(member.displayName)}</span>
            <span className="teams-person-text"><strong>{member.displayName}{member.id === me ? " (you)" : ""}{cursor?.leading ? <em className="teams-lead-badge">Leading</em> : null}</strong><small>{sub}{!live ? " · last received" : ""}</small></span>
            {member.id !== me && together && cursor && (cursor.leading || cursor.editor) && <Button size="sm" variant={following === member.id ? "primary" : "ghost"} aria-pressed={following === member.id} onClick={() => setFollowing(following === member.id ? null : member.id)}>{following === member.id ? "Following" : "Follow"}</Button>}
            {onRemoveMember && state.me.role === "owner" && member.id !== me && <Button variant="ghost" size="sm" aria-label={`Remove ${member.displayName}`} onClick={() => onRemoveMember(member)}>Remove</Button>}
          </li>;
        })}
      </ul>
      <div className="teams-together">
        <label><input type="checkbox" checked={together} disabled={!live} onChange={event => { setTogether(event.target.checked); if (!event.target.checked) { setLeading(false); setFollowing(null); } }} />Together: share my cursor</label>
        {together && <Button size="sm" variant={leading ? "primary" : "outline"} aria-pressed={leading} onClick={() => setLeading(value => !value)}>{leading ? "Leading" : "Lead"}</Button>}
        <p className="teams-help">{together ? editorConnected ? "Your pointer here and your editor cursor are visible to the room while this is on." : "Your pointer here is visible to the room. Connect VS Code to share your editor cursor too." : "Off by default. Nothing about your cursor leaves this Mac until you turn it on."}</p>
      </div>
    </div>
    <div className="teams-room-grid">
      <Surface variant="raised" className="teams-thread-column">
        <div className="teams-section-heading"><div><span className="teams-eyebrow">Thread</span><h2>{current && !composingNew ? current.title : "Start a thread"}</h2></div>
          <div className="teams-actions">{current && <Button size="sm" variant="ghost" onClick={() => void copyMarkdown()}>Copy as Markdown</Button>}<Button size="sm" variant={composingNew ? "primary" : "outline"} aria-pressed={composingNew} onClick={() => { setComposingNew(value => !value); setError(""); }}>New thread</Button></div></div>
        {inbox.length > 0 && <ul className="teams-inbox" aria-label="Waiting for you">{inbox.slice(0, 20).map(item => <li key={item.hash} style={person(item.author, members)}>
          <span className="teams-person-avatar" aria-hidden="true">{initials(name(item.author))}</span>
          <div><strong>{name(item.author)} handed you {item.title}</strong><p>{item.text}</p><small>Waiting {waitingFor(item)}</small></div>
          <div className="teams-actions"><Button size="sm" variant="primary" disabled={!canWrite} onClick={() => { setSelected(item.task); void stepInto(item); }}>Step in</Button><Button size="sm" variant="ghost" disabled={!canWrite} onClick={() => void guarded("Declining", () => answer(item, "decline", item.task === selected ? ordered : []))}>Decline</Button></div>
        </li>)}</ul>}
        {threads.length > 0 && <div className="teams-thread-list" role="tablist" aria-label="Threads">{threads.slice(0, 60).map(thread => <button key={thread.id} type="button" role="tab" aria-selected={thread.id === selected && !composingNew} className="teams-thread-chip" onClick={() => { setSelected(thread.id); setComposingNew(false); }}>
          <span>{thread.title}</span><small>{thread.entries} · {waitingFor({ createdAt: thread.updatedAt } as TeamEntry)}</small>
        </button>)}</div>}
        {!composingNew && current && <ol className="teams-knots" aria-label={`Entries in ${current.title}`}>
          {entriesError && <li className="teams-error" role="alert">{entriesError}</li>}
          {ordered.map(entry => {
            const acks = entry.kind === "decision" ? acknowledgements(entries, entry) : [];
            const reply = entry.kind === "handoff" ? handoffAnswer(entries, entry) : undefined;
            return <li key={entry.hash} className="teams-knot" data-kind={entry.kind} style={person(entry.author, members)}>
              <span className="teams-person-avatar" aria-hidden="true">{initials(name(entry.author))}</span>
              <div className="teams-knot-body">
                <p className="teams-knot-head"><strong>{name(entry.author)}</strong> {KIND_VERBS[entry.kind]}{entry.to ? ` to ${name(entry.to)}` : ""} <time dateTime={entry.createdAt}>{waitingFor(entry)}</time></p>
                {entry.text && <p className="teams-knot-text">{entry.text}</p>}
                <div className="teams-knot-meta">
                  {entry.place && <button type="button" className="teams-chip" onClick={() => void openPlace(entry.place!)}>{placeLabel(entry.place)}</button>}
                  {entry.snapshot && <span className="teams-chip teams-chip-quiet">capsule {entry.snapshot.slice(0, 7)}</span>}
                  {entry.kind === "decision" && <span className="teams-acks">{acks.length ? `Acknowledged by ${acks.map(name).join(", ")}` : "No one has acknowledged this yet"}</span>}
                  {entry.kind === "decision" && entry.author !== me && !acks.includes(me) && <Button size="sm" variant="outline" disabled={!canWrite} onClick={() => void guarded("Acknowledging", () => append(entry.task, { kind: "acknowledge", target: entry.hash }))}>Acknowledge</Button>}
                  {entry.kind === "handoff" && (reply ? <span className="teams-acks">{name(reply.author)} {reply.kind === "accept" ? "stepped in" : "declined"}</span> : entry.to === me ? <>
                    <Button size="sm" variant="primary" disabled={!canWrite} onClick={() => void stepInto(entry)}>Step in</Button>
                    <Button size="sm" variant="ghost" disabled={!canWrite} onClick={() => void guarded("Declining", () => answer(entry, "decline"))}>Decline</Button>
                  </> : <span className="teams-acks">Waiting {waitingFor(entry)}</span>)}
                </div>
              </div>
            </li>;
          })}
          {!entriesError && ordered.length === 0 && <li className="teams-empty">Nothing on this thread yet.</li>}
        </ol>}
        {!current && !composingNew && <p className="teams-empty">No threads yet. Start one for the task you are on; every knot, request and decision about it lives there.</p>}
        <form noValidate className="teams-composer" aria-busy={!!busy} onSubmit={event => void submit(event)}>
          {(composingNew || !current) && <><label htmlFor="teams-thread-title">Thread</label><Input id="teams-thread-title" maxLength={160} value={newTitle} onChange={event => setNewTitle(event.target.value)} placeholder="The task this is about" /></>}
          <div className="teams-kinds" role="radiogroup" aria-label="What are you adding?">{COMPOSER.map(item => <button key={item.kind} type="button" role="radio" aria-checked={kind === item.kind} className="teams-kind" onClick={() => setKind(item.kind)}>{item.label}</button>)}</div>
          <p className="teams-help">{activeKind.hint}</p>
          <label htmlFor="teams-knot-text">{kind === "handoff" ? "Next step" : kind === "request" ? "Your ask" : kind === "decision" ? "The decision" : "Your note"}</label>
          <Textarea id="teams-knot-text" rows={3} maxLength={5000} value={text} onChange={event => setText(event.target.value)} className="resize-none" placeholder={kind === "handoff" ? "What should they do first?" : "Short and specific. The place says the rest."} />
          <div className="teams-composer-row">
            {places.length > 0 && <label>Place<select value={placeIndex} onChange={event => setPlaceIndex(event.target.value)} className="teams-select"><option value="">No place</option>{places.map((place, index) => <option key={index} value={index}>{placeLabel(place)}</option>)}</select></label>}
            {kind === "handoff" && <label>To<select value={to} onChange={event => setTo(event.target.value)} className="teams-select"><option value="">Choose a teammate</option>{members.filter(member => member.id !== me).map(member => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></label>}
            {kind !== "handoff" && <label className="teams-check"><input type="checkbox" checked={attach} onChange={event => setAttach(event.target.checked)} />Attach my current capsule</label>}
          </div>
          <div className="teams-actions"><Button type="submit" variant="primary" disabled={!canWrite} aria-busy={busy === activeKind.verb}>{activeKind.verb}</Button><span className="teams-help">{kind === "handoff" ? "Sends your capsule as references. Files never leave your Mac." : attach ? "Your capsule goes along as references." : ""}</span></div>
        </form>
        <p role="status" className="teams-feedback">{message}</p><p role="alert" className="teams-error">{error}</p>
      </Surface>
      <Surface className="teams-capsule-column">
        <div className="teams-section-heading"><div><span className="teams-eyebrow">Capsule</span><h2>{capsule ? capsule.snapshot.title : "Nothing to step into yet"}</h2></div></div>
        {capsuleError && <p className="teams-error" role="alert">{capsuleError}</p>}
        {capsule ? <>
          <p className="teams-muted">{name(capsule.author)} · {capsule.snapshot.project.name} · {describeSnapshot(capsule.snapshot)}</p>
          {capsule.snapshot.note && <p className="teams-knot-text">{capsule.snapshot.note}</p>}
          <div className="teams-chips">
            {capsule.snapshot.branch && <span className="teams-chip teams-chip-quiet">branch {capsule.snapshot.branch}</span>}
            {capsule.snapshot.files.slice(0, 40).map(path => <button key={path} type="button" className="teams-chip" data-active={path === capsule.snapshot.activeFile || undefined} onClick={() => void openPlace({ type: "file", path })}>{path}</button>)}
            {capsule.snapshot.folders.slice(0, 20).map(path => <span key={path} className="teams-chip teams-chip-quiet">{path}/</span>)}
            {capsule.snapshot.links.slice(0, 20).map(url => <button key={url} type="button" className="teams-chip" onClick={() => void openPlace({ type: "link", url })}>{placeLabel({ type: "link", url })}</button>)}
          </div>
          <div className="teams-step-in">
            <label htmlFor="teams-project">Your copy of this project</label>
            <select id="teams-project" className="teams-select" value={projectId} onChange={event => setProjectId(event.target.value)} disabled={!projects.length}>{!projects.length && <option value="">Add a project in Rabta first</option>}{projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <div className="teams-actions">
              <Button variant="primary" disabled={!project || restore.active} onClick={() => stepIn(capsule)}>Step in</Button>
              {remembered && <span className="teams-help">You stepped into this thread before; stepping in again makes a fresh capsule.</span>}
            </div>
            <p className="teams-help">Creates a capsule on this Mac from these references, then opens it with the usual receipt. Paths outside your project folder are skipped.</p>
          </div>
        </> : <p className="teams-empty">A hand-off or a knot with a capsule attached lands here, ready to open on your Mac.</p>}
      </Surface>
    </div>
    {restore.node}
  </section>;
}
