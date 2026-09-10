export interface TeamMember {
  id: string;
  displayName: string;
  role: "owner" | "member";
  status: "working" | "away" | "offline";
  lastSeenAt: string | null;
}
export interface TeamLane {
  memberId: string;
  revision: number;
  title: string;
  content: string;
  updatedAt: string;
  publishedAt: string | null;
  private: boolean;
}
export interface TeamProposal {
  id: string;
  sourceMemberId: string;
  targetMemberId: string;
  targetRevision: number;
  title: string;
  content: string;
  status: "pending" | "accepted" | "declined" | "applied";
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface TeamAsset {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  ownerId: string;
  createdAt: string;
}
/** A reviewed, sanitized picture of a task: references only, never contents. */
export interface TeamSnapshot {
  title: string;
  project: { id: string; name: string };
  files: string[];
  links: string[];
  folders: string[];
  pins: string[];
  branch: string | null;
  activeFile: string | null;
  note: string;
}
export interface StoredSnapshot { hash: string; author: string; createdAt: string; snapshot: TeamSnapshot }
export type EntryKind = "knot" | "request" | "decision" | "acknowledge" | "handoff" | "accept" | "decline" | "split" | "weave" | "link";
export type TeamPlace =
  | { type: "file"; path: string; line?: number; column?: number; label?: string }
  | { type: "folder"; path: string; label?: string }
  | { type: "link"; url: string; label?: string }
  | { type: "commit"; sha: string; label?: string }
  | { type: "image"; assetId: string; x: number; y: number; label?: string };
export interface TeamEntry {
  hash: string;
  seq: number;
  task: string;
  author: string;
  lamport: number;
  kind: EntryKind;
  text: string;
  place: TeamPlace | null;
  snapshot: string | null;
  target: string | null;
  to: string | null;
  parents: string[];
  prev: string | null;
  createdAt: string;
}
export interface TeamThreadSummary {
  id: string;
  title: string;
  entries: number;
  lamport: number;
  updatedAt: string;
  createdAt: string;
  lastKind: EntryKind | null;
  lastAuthor: string | null;
  lastSnapshot: string | null;
  authors: string[];
}
export interface TeamInboxItem extends TeamEntry { title: string }
export interface TeamCursor {
  memberId: string;
  task: string | null;
  pointer: { x: number; y: number } | null;
  editor: { path: string; line: number; column: number; selection?: { line: number; column: number } } | null;
  leading: boolean;
  following: string | null;
  at: string;
}
export interface TeamState {
  room: { id: string; name: string; createdAt: string };
  me: Pick<TeamMember, "id" | "displayName" | "role">;
  members: TeamMember[];
  lanes: TeamLane[];
  proposals: TeamProposal[];
  assets: TeamAsset[];
  threads: TeamThreadSummary[];
  inbox: TeamInboxItem[];
  together: TeamCursor[];
  revision: number;
}
export type TeamLiveEvent = { kind: "cursor"; cursor: TeamCursor | { memberId: string; gone: true } } | { kind: "thread"; task: string; seq: number; entryKind: EntryKind; author: string };
export interface TeamCredentials {
  roomId: string;
  memberId: string;
  memberKey: string;
}
export interface TeamConnection extends TeamCredentials { endpoint: string }

export class TeamRequestError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "TeamRequestError";
  }
}

/** Credentials stay in an Authorization header, never a URL or browser storage. */
export function normalizeEndpoint(value: string): string {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error("Enter a complete workspace address, such as https://teams.example.com."); }
  if (url.username || url.password || url.search || url.hash)
    throw new Error("Use a workspace address without a password, query, or fragment.");
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
    throw new Error("Use HTTPS for a shared workspace. HTTP is supported only on this Mac.");
  return url.toString().replace(/\/$/, "");
}

export async function teamRequest<T>(endpoint: string, path: string, key?: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal; binary?: boolean } = {}): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 15_000);
  try {
    const response = await fetch(`${normalizeEndpoint(endpoint)}${path}`, {
      method: options.method ?? "GET",
      headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
      credentials: "omit",
      redirect: "error",
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new TeamRequestError(response.status, data.error?.code ?? "request_failed", data.error?.message ?? `The workspace returned ${response.status}. Try again.`);
    }
    if (options.binary) return await response.blob() as T;
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  } catch (error) {
    if (error instanceof TeamRequestError || options.signal?.aborted) throw error;
    throw new Error(controller.signal.aborted
      ? "The workspace took too long to respond. Check your connection and try again."
      : "Cannot reach this workspace. Check its address and whether the host is running.");
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
}

export function roomPath(connection: TeamConnection, suffix: string): string {
  return `/v1/rooms/${encodeURIComponent(connection.roomId)}${suffix}`;
}

/** Fetch streams support bearer auth, unlike EventSource's URL-only constructor.
 * `onLive` receives the ephemeral events (cursors, thread appends) that carry
 * their own payload; everything else asks the caller to refresh state. */
export async function watchTeam(connection: TeamConnection, signal: AbortSignal,
  onChange: () => void, onLive?: (event: TeamLiveEvent) => void): Promise<void> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) controller.abort();
  let timedOut = false;
  let timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 15_000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetch(`${normalizeEndpoint(connection.endpoint)}${roomPath(connection, "/events")}`, {
      headers: { Authorization: `Bearer ${connection.memberKey}`, Accept: "text/event-stream" },
      credentials: "omit", redirect: "error", signal: controller.signal,
    });
    if (!response.ok) throw new TeamRequestError(response.status, "stream_failed", "Live updates stopped. Reconnect to load the latest work.");
    if (!response.body) throw new Error("This connection does not support live updates.");
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (!controller.signal.aborted) {
      clearTimeout(timeout);
      timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 45_000);
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const message = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (/^event: ?revoked$/m.test(message)) throw new TeamRequestError(401, "membership_revoked", "Your workspace access ended. Ask the owner for a new invitation.");
        if (/^event: ?(change|presence|ready)$/m.test(message)) onChange();
        const live = /^event: ?(cursor|thread)$/m.exec(message)?.[1];
        if (live && onLive) {
          try {
            const data = JSON.parse(/^data: ?(.+)$/m.exec(message)?.[1] ?? "null") as Record<string, unknown> | null;
            if (data && live === "cursor") onLive({ kind: "cursor", cursor: data as unknown as TeamCursor });
            if (data && live === "thread") onLive({ kind: "thread", task: String(data.task), seq: Number(data.seq), entryKind: data.kind as EntryKind, author: String(data.author) });
          } catch { /* A malformed live frame never breaks the stream; state refresh still catches up. */ }
        }
      }
      if (buffer.length > 65_536) throw new Error("The workspace sent an invalid update. Reconnect to try again.");
    }
  } catch (error) {
    if (timedOut) throw new Error("The workspace stopped sending updates. Reconnect to load the latest work.");
    throw error;
  } finally {
    clearTimeout(timeout); signal.removeEventListener("abort", cancel);
    controller.abort();
    if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
  if (!signal.aborted) throw new Error("Live updates stopped. Reconnect to load the latest work.");
}

export const TEAM_ASSET_TYPES = ["image/png", "image/jpeg", "image/webp", "text/plain", "text/markdown", "application/json"];
export async function prepareTeamAsset(file: File) {
  const mimeType = file.type || (/\.md$/i.test(file.name) ? "text/markdown" : /\.txt$/i.test(file.name) ? "text/plain" : /\.json$/i.test(file.name) ? "application/json" : "");
  if (!TEAM_ASSET_TYPES.includes(mimeType)) throw new Error("Choose a PNG, JPEG, WebP, text, Markdown, or JSON file.");
  if (!file.size || file.size > 2 * 1024 * 1024) throw new Error("Choose a nonempty file up to 2 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return { name: file.name, mimeType, contentBase64: btoa(binary) };
}

/** Stores a snapshot and returns its content hash. The same snapshot is the same hash. */
export function storeSnapshot(connection: TeamConnection, snapshot: TeamSnapshot): Promise<StoredSnapshot> {
  return teamRequest<StoredSnapshot>(connection.endpoint, roomPath(connection, "/snapshots"), connection.memberKey, { method: "POST", body: { snapshot } });
}
export function readThread(connection: TeamConnection, task: string, signal?: AbortSignal): Promise<{ thread: TeamThreadSummary; entries: TeamEntry[] }> {
  return teamRequest(connection.endpoint, roomPath(connection, `/threads/${encodeURIComponent(task)}`), connection.memberKey, { signal });
}
export interface NewEntry { kind: EntryKind; text?: string; place?: TeamPlace | null; snapshot?: string | null; target?: string | null; to?: string | null; parents?: string[]; prev?: string | null; lamport: number; title?: string; idempotencyKey: string }
export function appendEntry(connection: TeamConnection, task: string, entry: NewEntry): Promise<{ entry: TeamEntry; thread: TeamThreadSummary }> {
  return teamRequest(connection.endpoint, roomPath(connection, `/threads/${encodeURIComponent(task)}/entries`), connection.memberKey, { method: "POST", body: entry });
}
export interface CursorUpdate { active: boolean; task?: string | null; pointer?: { x: number; y: number } | null; editor?: TeamCursor["editor"]; leading?: boolean; following?: string | null }
export function sendCursor(connection: TeamConnection, update: CursorUpdate, signal?: AbortSignal): Promise<TeamCursor | { active: false }> {
  return teamRequest(connection.endpoint, roomPath(connection, "/together"), connection.memberKey, { method: "POST", body: update, signal });
}
export function readSnapshot(connection: TeamConnection, hash: string, signal?: AbortSignal): Promise<StoredSnapshot> {
  return teamRequest<StoredSnapshot>(connection.endpoint, roomPath(connection, `/snapshots/${encodeURIComponent(hash)}`), connection.memberKey, { signal });
}
