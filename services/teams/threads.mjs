// Pure rules for capsule snapshots, thread entries and Together cursors.
// No I/O: the service imports these, the tests exercise them directly.
import { createHash } from 'node:crypto';

export const ENTRY_KINDS = ['knot', 'request', 'decision', 'acknowledge', 'handoff', 'accept', 'decline', 'split', 'weave', 'link'];
export const PLACE_TYPES = ['file', 'link', 'folder', 'commit', 'image'];
export const LIMITS = {
  files: 200, links: 100, folders: 50, pins: 100, path: 1024, title: 160, note: 2000, text: 5000,
  snapshotsPerRoom: 5000, entriesPerThread: 5000, threadsPerRoom: 2000, taskId: 80, cursorRatePerSecond: 15, cursorTtlMs: 60_000,
};
const TASK_ID = /^[A-Za-z0-9._-]{1,80}$/;
const HASH = /^[a-f0-9]{64}$/;

export class RuleError extends Error {
  constructor(code, message) { super(message); this.code = code; this.status = 400; }
}
const refuse = (code, message) => { throw new RuleError(code, message); };

/** Stable JSON: object keys sorted at every depth, arrays kept in order. */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const digest = value => createHash('sha256').update(canonical(value)).digest('hex');

function cleanText(value, field, max, { required = true } = {}) {
  if (value === undefined || value === null) { if (required) refuse('invalid_input', `${field} is required.`); return undefined; }
  if (typeof value !== 'string' || value.length > max || /[\0-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) refuse('invalid_input', `${field} must be text of at most ${max} characters.`);
  const trimmed = value.trim();
  if (required && !trimmed) refuse('invalid_input', `${field} is required.`);
  return trimmed;
}
/** A reference the receiver resolves against their own project folder or
 * home. Never absolute, never escaping upwards. */
export function relativeReference(value, field) {
  const path = cleanText(value, field, LIMITS.path);
  if (path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\')) refuse('absolute_path', `${field} must be relative to the project, not an absolute path.`);
  const segments = path.split(/[\\/]+/);
  if (segments.some(segment => segment === '..')) refuse('path_escape', `${field} may not contain parent segments.`);
  if (segments[0] === '~' && segments.length === 1) refuse('invalid_input', `${field} must name a folder or file.`);
  return segments.join('/');
}
/** Only http(s), and never credentials, query strings or fragments. */
export function sanitizedLink(value, field) {
  const raw = cleanText(value, field, 2048);
  let url;
  try { url = new URL(raw); } catch { refuse('invalid_link', `${field} must be a complete http(s) link.`); }
  if (!['http:', 'https:'].includes(url.protocol)) refuse('invalid_link', `${field} must be an http(s) link.`);
  if (url.username || url.password || url.search || url.hash) refuse('link_has_secrets', `${field} may not carry credentials, a query string or a fragment.`);
  return url.toString();
}
function list(value, field, max, map) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) refuse('invalid_input', `${field} must list at most ${max} items.`);
  return [...new Set(value.map((item, index) => map(item, `${field}[${index}]`)))];
}
/** Returns the normalized snapshot; throws RuleError on anything that must not cross the wire. */
export function validateSnapshot(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) refuse('invalid_input', 'A snapshot object is required.');
  const project = input.project && typeof input.project === 'object' ? input.project : {};
  const snapshot = {
    title: cleanText(input.title, 'Title', LIMITS.title),
    project: { id: cleanText(project.id, 'Project id', 120), name: cleanText(project.name, 'Project name', 120, { required: false }) || 'Untitled project' },
    files: list(input.files, 'Files', LIMITS.files, relativeReference),
    links: list(input.links, 'Links', LIMITS.links, sanitizedLink),
    folders: list(input.folders, 'Folders', LIMITS.folders, relativeReference),
    pins: list(input.pins, 'Pins', LIMITS.pins, (item, field) => cleanText(item, field, LIMITS.path)),
    branch: cleanText(input.branch, 'Branch', 200, { required: false }) || null,
    activeFile: cleanText(input.activeFile, 'Active file', LIMITS.path, { required: false }) || null,
    note: cleanText(input.note, 'Note', LIMITS.note, { required: false }) || '',
  };
  if (snapshot.branch && /[\s~^:?*[\\]|^-|\.\.|@\{|\/$|\.lock$/.test(snapshot.branch)) refuse('invalid_input', 'Branch must be a valid git branch name.');
  if (snapshot.activeFile) { snapshot.activeFile = relativeReference(snapshot.activeFile, 'Active file'); if (!snapshot.files.includes(snapshot.activeFile)) snapshot.files.push(snapshot.activeFile); }
  if (!snapshot.files.length && !snapshot.links.length && !snapshot.folders.length && !snapshot.branch) refuse('empty_snapshot', 'A snapshot needs at least one file, link, folder or branch.');
  return snapshot;
}
export function validateTaskId(value) {
  if (typeof value !== 'string' || !TASK_ID.test(value)) refuse('invalid_task', 'Task ids use letters, digits, dots, dashes and underscores, up to 80 characters.');
  return value;
}
export function validatePlace(input) {
  if (input === undefined || input === null) return null;
  if (!input || typeof input !== 'object' || !PLACE_TYPES.includes(input.type)) refuse('invalid_place', 'A place is a file, link, folder, commit or image.');
  const place = { type: input.type };
  const integer = (value, field, max) => { if (value === undefined || value === null) return undefined; if (!Number.isInteger(value) || value < 0 || value > max) refuse('invalid_place', `${field} must be a whole number up to ${max}.`); return value; };
  switch (input.type) {
    case 'file': place.path = relativeReference(input.path, 'Place path'); place.line = integer(input.line, 'Line', 10_000_000); place.column = integer(input.column, 'Column', 100_000); break;
    case 'folder': place.path = relativeReference(input.path, 'Place path'); break;
    case 'link': place.url = sanitizedLink(input.url, 'Place link'); break;
    case 'commit': if (typeof input.sha !== 'string' || !/^[a-f0-9]{7,64}$/.test(input.sha)) refuse('invalid_place', 'A commit place needs a hexadecimal sha.'); place.sha = input.sha; break;
    case 'image':
      if (typeof input.assetId !== 'string' || !/^[a-f0-9]{24}$/.test(input.assetId)) refuse('invalid_place', 'An image place needs a shared asset id.');
      place.assetId = input.assetId;
      for (const axis of ['x', 'y']) { if (typeof input[axis] !== 'number' || !Number.isFinite(input[axis]) || input[axis] < 0 || input[axis] > 1) refuse('invalid_place', 'Image places use x and y between 0 and 1.'); place[axis] = Math.round(input[axis] * 10_000) / 10_000; }
      break;
  }
  const label = cleanText(input.label, 'Place label', 200, { required: false });
  if (label) place.label = label;
  return place;
}
/**
 * Validates one entry against its thread. `context` supplies what the rules
 * need to look up: members, snapshot hashes, prior entries.
 */
export function validateEntry(input, context) {
  if (!input || typeof input !== 'object') refuse('invalid_input', 'An entry object is required.');
  if (!ENTRY_KINDS.includes(input.kind)) refuse('invalid_kind', `Entry kind must be one of ${ENTRY_KINDS.join(', ')}.`);
  const kind = input.kind;
  const needsText = ['knot', 'request', 'decision'].includes(kind);
  const entry = {
    kind,
    text: cleanText(input.text, 'Text', LIMITS.text, { required: needsText }) || '',
    place: validatePlace(input.place),
    snapshot: null, target: null, to: null, parents: [],
    prev: input.prev === undefined || input.prev === null ? null : (HASH.test(input.prev) ? input.prev : refuse('invalid_input', 'prev must be an entry hash.')),
    lamport: Number.isInteger(input.lamport) && input.lamport >= 0 && input.lamport <= Number.MAX_SAFE_INTEGER ? input.lamport : 0,
  };
  if (input.snapshot !== undefined && input.snapshot !== null) {
    if (typeof input.snapshot !== 'string' || !context.hasSnapshot(input.snapshot)) refuse('unknown_snapshot', 'Store the snapshot before referring to it.');
    entry.snapshot = input.snapshot;
  }
  if (['handoff', 'split'].includes(kind) && !entry.snapshot) refuse('snapshot_required', `A ${kind} carries a capsule snapshot.`);
  if (kind === 'handoff') {
    if (typeof input.to !== 'string' || !context.isActiveMember(input.to)) refuse('invalid_target', 'Hand off to another active member.');
    if (input.to === context.actorId) refuse('invalid_target', 'Hand off to another active member.');
    entry.to = input.to;
    if (!entry.text) refuse('invalid_input', 'A hand-off needs a next step.');
  }
  if (['acknowledge', 'accept', 'decline'].includes(kind)) {
    const target = typeof input.target === 'string' ? context.findEntry(input.target) : null;
    if (!target) refuse('unknown_target', 'The entry this refers to is not on this thread.');
    if (kind === 'acknowledge' && target.kind !== 'decision') refuse('invalid_target', 'Only decisions are acknowledged.');
    if (kind !== 'acknowledge') {
      if (target.kind !== 'handoff') refuse('invalid_target', 'Only hand-offs are accepted or declined.');
      if (target.to !== context.actorId) refuse('not_recipient', 'Only the person a hand-off is addressed to can accept or decline it.');
      if (context.entries.some(existing => ['accept', 'decline'].includes(existing.kind) && existing.target === target.hash && existing.author === context.actorId)) refuse('already_answered', 'This hand-off was already answered.');
    } else if (context.entries.some(existing => existing.kind === 'acknowledge' && existing.target === target.hash && existing.author === context.actorId)) refuse('already_answered', 'You already acknowledged this decision.');
    entry.target = target.hash;
  }
  if (kind === 'weave') {
    const parents = Array.isArray(input.parents) ? [...new Set(input.parents)] : [];
    if (parents.length < 1 || parents.length > 2 || parents.some(parent => typeof parent !== 'string' || !context.findEntry(parent))) refuse('invalid_parents', 'A weave names one or two entries on this thread it brings together.');
    entry.parents = parents;
    if (!entry.snapshot) refuse('snapshot_required', 'A weave carries the woven snapshot.');
  }
  if (kind === 'link') {
    if (!entry.place || !['link', 'commit'].includes(entry.place.type)) refuse('invalid_place', 'A link entry points at a link or a commit.');
  }
  return entry;
}
/** Deterministic hash over everything the server stores except the hash itself. */
export function entryHash(entry) {
  const { hash, ...rest } = entry;
  return digest(rest);
}
/** Clients order by Lamport clock, then author id, then server sequence. */
export function orderEntries(entries) {
  return [...entries].sort((a, b) => a.lamport - b.lamport || (a.author < b.author ? -1 : a.author > b.author ? 1 : 0) || a.seq - b.seq);
}
/** Hand-offs addressed to `memberId` that they have not answered. */
export function inboxFor(threads, memberId) {
  const items = [];
  for (const thread of Object.values(threads)) {
    for (const entry of thread.entries) {
      if (entry.kind !== 'handoff' || entry.to !== memberId) continue;
      if (thread.entries.some(other => ['accept', 'decline'].includes(other.kind) && other.target === entry.hash && other.author === memberId)) continue;
      items.push({ ...entry, task: thread.id, title: thread.title });
    }
  }
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
/** Validates a Together update; pointer and editor are optional and independent. */
export function validateCursor(input, { isActiveMember } = { isActiveMember: () => true }) {
  if (!input || typeof input !== 'object') refuse('invalid_input', 'A cursor update object is required.');
  if (typeof input.active !== 'boolean') refuse('invalid_input', 'active must be true or false.');
  const cursor = { active: input.active, task: input.task === undefined || input.task === null ? null : validateTaskId(input.task), pointer: null, editor: null, leading: input.leading === true, following: null };
  if (input.pointer !== undefined && input.pointer !== null) {
    const { x, y } = input.pointer;
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) refuse('invalid_pointer', 'Pointer positions are fractions between 0 and 1.');
    cursor.pointer = { x: Math.round(x * 10_000) / 10_000, y: Math.round(y * 10_000) / 10_000 };
  }
  if (input.editor !== undefined && input.editor !== null) {
    const editor = input.editor;
    if (!editor || typeof editor !== 'object') refuse('invalid_editor', 'An editor cursor names a project-relative file, line and column.');
    const integer = (value, field) => { if (!Number.isInteger(value) || value < 0 || value > 10_000_000) refuse('invalid_editor', `${field} must be a whole number.`); return value; };
    cursor.editor = { path: relativeReference(editor.path, 'Editor path'), line: integer(editor.line, 'Line'), column: integer(editor.column, 'Column') };
    if (editor.selection && typeof editor.selection === 'object') cursor.editor.selection = { line: integer(editor.selection.line, 'Selection line'), column: integer(editor.selection.column, 'Selection column') };
  }
  if (input.following !== undefined && input.following !== null) {
    if (typeof input.following !== 'string' || !isActiveMember(input.following)) refuse('invalid_target', 'Follow an active member.');
    cursor.following = input.following;
  }
  return cursor;
}
