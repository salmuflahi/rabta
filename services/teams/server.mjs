import http from 'node:http';
import https from 'node:https';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { readFile, rename, mkdir, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX_BODY = 2_850_000;
const MAX_ASSET = 2 * 1024 * 1024;
const MAX_DISK = 64 * 1024 * 1024;
const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/markdown', 'application/json']);
const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);
const stamp = () => new Date().toISOString();
const id = () => randomBytes(12).toString('hex');
const secret = () => randomBytes(32).toString('base64url');
const hash = value => createHash('sha256').update(value).digest('hex');
const equalHash = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

class ApiError extends Error {
  constructor(status, code, message, details) { super(message); Object.assign(this, { status, code, details }); }
}
const fail = (status, code, message, details) => { throw new ApiError(status, code, message, details); };
function text(value, field, max, { empty = false } = {}) {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim()) || value.includes('\0')) fail(400, 'invalid_input', `${field} must be ${empty ? 'at most' : 'between 1 and'} ${max} characters.`);
  return value;
}
function revision(expected, current) {
  if (!Number.isSafeInteger(expected) || expected !== current) fail(409, 'revision_conflict', 'The work changed. Refresh and review the current revision before retrying.', { currentRevision: current });
}
const publicMember = member => ({ id: member.id, displayName: member.displayName, role: member.role });
const publicLane = (lane, isPrivate) => ({ ...lane, private: isPrivate });

/** A single-process, durable service. Never exposes native actions or reads clients' files. */
export async function createTeamsService({ dataDir, bootstrapKey, host = '127.0.0.1', port = 47831, allowedOrigins = ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost'], tls, rateLimit = 600 } = {}) {
  if (typeof bootstrapKey !== 'string' || bootstrapKey.length < 32) throw new Error('Set RABTA_TEAMS_BOOTSTRAP_KEY to a random secret of at least 32 characters.');
  if (!LOOPBACK.has(host) && !tls) throw new Error('Non-loopback listeners require a TLS certificate and private key.');
  if (!dataDir) throw new Error('A private data directory is required.');
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const lockPath = path.join(dataDir, 'service.lock');
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); await lock.writeFile(String(process.pid)); }
  catch (error) { throw new Error(`Cannot lock the data directory. Run one service process only; after an unclean shutdown verify no process is running before removing service.lock. (${error.code})`); }
  const dataPath = path.join(dataDir, 'state.json');
  let state = { version: 1, rooms: {} };
  try {
    try { state = JSON.parse(await readFile(dataPath, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (state.version !== 1 || !state.rooms || typeof state.rooms !== 'object' || Array.isArray(state.rooms)) throw new Error('Unsupported or invalid Teams state file.');
  } catch (error) { await lock.close(); await unlink(lockPath); throw error; }
  const origins = new Set(allowedOrigins);
  const streams = new Map();
  const presence = new Map();
  const rates = new Map();
  let serial = Promise.resolve();
  let stopped = false;

  async function persist(next) {
    const json = JSON.stringify(next);
    if (Buffer.byteLength(json) > MAX_DISK) fail(413, 'storage_limit', 'This server has reached its 64 MiB storage limit. Remove shared assets before retrying.');
    const temporary = path.join(dataDir, `state-${id()}.tmp`);
    let file;
    try {
      file = await open(temporary, 'wx', 0o600);
      await file.writeFile(json);
      await file.sync();
      await file.close(); file = undefined;
      await rename(temporary, dataPath);
      const directory = await open(dataDir, 'r');
      try { await directory.sync(); } finally { await directory.close(); }
    } catch (error) {
      if (file) await file.close().catch(() => {});
      await unlink(temporary).catch(() => {});
      throw error;
    }
  }
  function broadcast(roomId, event, payload) {
    for (const stream of streams.get(roomId) || []) {
      if (stream.res.writableLength > 256_000) { stream.res.destroy(); continue; }
      stream.res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    }
  }
  function transaction(operation) {
    const pending = serial.then(async () => {
      const next = structuredClone(state);
      const result = await operation(next);
      if (!result.unchanged) {
        if (result.roomId) next.rooms[result.roomId].revision++;
        await persist(next);
        state = next;
        if (result.roomId) broadcast(result.roomId, 'change', { revision: state.rooms[result.roomId].revision });
      }
      return result.value;
    });
    serial = pending.catch(() => {});
    return pending;
  }
  function bearer(req) {
    const match = /^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(req.headers.authorization || '');
    if (!match) fail(401, 'authentication_required', 'A valid member key is required.');
    return match[1];
  }
  function authenticate(req, roomId, source = state) {
    const digest = hash(bearer(req));
    const room = source.rooms[roomId];
    const member = room && Object.values(room.members).find(candidate => !candidate.revokedAt && equalHash(candidate.keyHash, digest));
    if (!member) fail(401, 'invalid_member_key', 'This room or member key is unavailable. Check the connection or ask for a new invitation.');
    return { room, member };
  }
  function owner(member) { if (member.role !== 'owner') fail(403, 'owner_required', 'Only the room owner can manage membership.'); }
  function roomState(room, member) {
    return {
      room: { id: room.id, name: room.name, createdAt: room.createdAt }, me: publicMember(member), revision: room.revision,
      members: Object.values(room.members).filter(m => !m.revokedAt).map(m => {
        const seen = presence.get(`${room.id}:${m.id}`);
        return { ...publicMember(m), status: seen && Date.now() - Date.parse(seen.lastSeenAt) < 90_000 ? seen.status : 'offline', lastSeenAt: seen?.lastSeenAt || null };
      }),
      lanes: Object.values(room.lanes).filter(l => !room.members[l.memberId]?.revokedAt).flatMap(l => l.memberId === member.id ? [publicLane(l.draft, true)] : l.published ? [publicLane(l.published, false)] : []),
      proposals: Object.values(room.proposals).filter(p => p.sourceMemberId === member.id || p.targetMemberId === member.id),
      assets: Object.values(room.assets).map(({ contentBase64, ...metadata }) => metadata),
    };
  }
  function provision(input) {
    if (input.memberKey === undefined && input.idempotencyKey === undefined) return null;
    if (typeof input.memberKey !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(input.memberKey)) fail(400, 'invalid_member_key', 'Generate a random URL-safe member key with at least 32 bytes of randomness.');
    const requestKey = text(input.idempotencyKey, 'Idempotency key', 128);
    return { memberKey: input.memberKey, requestKeyHash: hash(requestKey) };
  }
  function makeMember(source, room, displayName, role, suppliedKey) {
    const memberKey = suppliedKey || secret(); const memberId = id();
    const digest = hash(memberKey);
    if (equalHash(digest, hash(bootstrapKey)) || Object.values(source.rooms).some(candidate => Object.values(candidate.members).some(member => equalHash(member.keyHash, digest)))) fail(409, 'member_key_reused', 'Generate a distinct member key for this membership.');
    room.members[memberId] = { id: memberId, displayName, role, keyHash: hash(memberKey), joinedAt: stamp() };
    room.lanes[memberId] = { memberId, draft: { memberId, revision: 0, title: 'My work', content: '', updatedAt: stamp(), publishedAt: null }, published: null };
    return { roomId: room.id, memberId, memberKey };
  }
  async function body(req) {
    const contentType = String(req.headers['content-type'] || '').split(';')[0];
    if (contentType !== 'application/json') fail(415, 'json_required', 'Send an application/json body.');
    if (Number(req.headers['content-length']) > MAX_BODY) fail(413, 'body_limit', 'The request is too large.');
    let size = 0; const chunks = [];
    for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY) fail(413, 'body_limit', 'The request is too large.'); chunks.push(chunk); }
    try { const result = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error(); return result; }
    catch { fail(400, 'invalid_json', 'The request body must be a JSON object.'); }
  }
  function send(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); }
  function checkRate(req) {
    // Members sharing an office network keep independent request budgets.
    const token = /^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(req.headers.authorization || '')?.[1];
    const digest = token && hash(token);
    const known = digest && Object.values(state.rooms).some(room => Object.values(room.members).some(member => !member.revokedAt && equalHash(member.keyHash, digest)));
    const now = Date.now(); const key = known ? `member:${digest}` : `public:${req.socket.remoteAddress || 'unknown'}`;
    let rate = rates.get(key);
    if (!rate || now - rate.startedAt >= 60_000) { rate = { startedAt: now, count: 0 }; rates.set(key, rate); }
    if (++rate.count > rateLimit) fail(429, 'rate_limit', 'Too many requests. Wait a minute before retrying.');
  }
  async function handle(req, res) {
    try {
      res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
      const origin = req.headers.origin;
      if (origin && !origins.has(origin)) fail(403, 'origin_denied', 'This app origin is not allowed by the server.');
      if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Max-Age': '600' }); res.end(); return;
      }
      checkRate(req);
      const url = new URL(req.url, 'http://localhost');
      if (url.search) fail(400, 'query_not_supported', 'Do not send keys or other data in the URL.');
      if (req.method === 'GET' && url.pathname === '/health') { send(res, 200, { status: 'ok', service: 'rabta-teams', version: 1 }); return; }
      if (req.method === 'POST' && url.pathname === '/v1/rooms') {
        if (!equalHash(hash(bearer(req)), hash(bootstrapKey))) fail(401, 'invalid_bootstrap_key', 'A valid server administration key is required to create a room.');
        const input = await body(req); const name = text(input.name, 'Room name', 120).trim(); const displayName = text(input.displayName, 'Display name', 80).trim(); const setup = provision(input);
        const result = await transaction(next => {
          const fingerprint = setup && hash(JSON.stringify({ name, displayName, keyHash: hash(setup.memberKey) }));
          if (setup) {
            const existing = Object.values(next.rooms).find(room => room.creationRequest?.requestKeyHash === setup.requestKeyHash);
            if (existing) {
              if (existing.creationRequest.fingerprint !== fingerprint) fail(409, 'idempotency_conflict', 'This request key was already used for different room details.');
              return { unchanged: true, value: { roomId: existing.id, memberId: existing.creationRequest.memberId, memberKey: setup.memberKey } };
            }
          }
          if (Object.keys(next.rooms).length >= 100) fail(409, 'room_limit', 'The server room limit was reached.');
          const roomId = id(); const room = { id: roomId, name, createdAt: stamp(), revision: 0, members: {}, lanes: {}, proposals: {}, assets: {}, invitations: {}, idempotency: {} };
          next.rooms[roomId] = room;
          const value = makeMember(next, room, displayName, 'owner', setup?.memberKey);
          if (setup) room.creationRequest = { requestKeyHash: setup.requestKeyHash, fingerprint, memberId: value.memberId };
          return { roomId, value };
        }); send(res, 201, result); return;
      }
      if (req.method === 'POST' && url.pathname === '/v1/invitations/accept') {
        const input = await body(req); const key = text(input.invitationKey, 'Invitation key', 128); const displayName = text(input.displayName, 'Display name', 80).trim(); const setup = provision(input);
        const result = await transaction(next => {
          const digest = hash(key);
          for (const room of Object.values(next.rooms)) {
            const invitation = Object.values(room.invitations).find(i => !i.revokedAt && equalHash(i.keyHash, digest));
            if (!invitation) continue;
            const fingerprint = setup && hash(JSON.stringify({ displayName, keyHash: hash(setup.memberKey) }));
            if (invitation.usedAt) {
              if (setup && invitation.redemption?.requestKeyHash === setup.requestKeyHash) {
                if (invitation.redemption.fingerprint !== fingerprint) fail(409, 'idempotency_conflict', 'This request key was already used for different member details.');
                const existing = room.members[invitation.redemption.memberId];
                if (existing && !existing.revokedAt && equalHash(existing.keyHash, hash(setup.memberKey))) return { unchanged: true, value: { roomId: room.id, memberId: existing.id, memberKey: setup.memberKey } };
              }
              continue;
            }
            if (Date.parse(invitation.expiresAt) <= Date.now()) continue;
            if (Object.values(room.members).filter(m => !m.revokedAt).length >= 100) fail(409, 'member_limit', 'This room is full.');
            invitation.usedAt = stamp();
            const value = makeMember(next, room, displayName, 'member', setup?.memberKey);
            if (setup) invitation.redemption = { requestKeyHash: setup.requestKeyHash, fingerprint, memberId: value.memberId };
            return { roomId: room.id, value };
          }
          fail(401, 'invalid_invitation', 'The invitation is invalid, expired, already used or revoked. Ask the owner for a new one.');
        }); send(res, 201, result); return;
      }
      const match = /^\/v1\/rooms\/([a-f0-9]{24})\/(.+)$/.exec(url.pathname);
      if (!match) fail(404, 'not_found', 'This endpoint does not exist.');
      const [, roomId, endpoint] = match;
      const { room, member } = authenticate(req, roomId);
      if (req.method === 'GET' && endpoint === 'state') { send(res, 200, roomState(room, member)); return; }
      if (req.method === 'GET' && endpoint === 'events') {
        const active = streams.get(roomId) || new Set();
        if ([...active].filter(s => s.memberId === member.id).length >= 5) fail(429, 'stream_limit', 'Close an existing live connection before opening another.');
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        const stream = { memberId: member.id, res }; active.add(stream); streams.set(roomId, active);
        res.write(`event: ready\ndata: ${JSON.stringify({ revision: room.revision })}\n\n`);
        const heartbeat = setInterval(() => { if (res.writableLength > 256_000) res.destroy(); else res.write(': heartbeat\n\n'); }, 15_000);
        res.on('close', () => { clearInterval(heartbeat); active.delete(stream); if (!active.size) streams.delete(roomId); }); return;
      }
      if (req.method === 'POST' && endpoint === 'presence') {
        const input = await body(req);
        if (!['working', 'away', 'offline'].includes(input.status)) fail(400, 'invalid_status', 'Choose working, away or offline.');
        authenticate(req, roomId); // Membership could be revoked while reading the request.
        const value = { status: input.status, lastSeenAt: stamp() }; presence.set(`${roomId}:${member.id}`, value);
        broadcast(roomId, 'presence', { memberId: member.id, ...value }); send(res, 200, value); return;
      }
      if (req.method === 'GET' && /^assets\/[a-f0-9]{24}$/.test(endpoint)) {
        const asset = room.assets[endpoint.split('/')[1]]; if (!asset) fail(404, 'not_found', 'The asset is unavailable.');
        res.writeHead(200, { 'Content-Type': asset.mimeType, 'Content-Length': asset.size, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(asset.name)}` }); res.end(Buffer.from(asset.contentBase64, 'base64')); return;
      }
      const input = ['POST', 'PUT'].includes(req.method) ? await body(req) : {};
      let revokedMemberId;
      const result = await transaction(next => {
        const { room: current, member: actor } = authenticate(req, roomId, next);
        let value;
        if (req.method === 'PUT' && endpoint === 'lane') {
          const lane = current.lanes[actor.id].draft;
          revision(input.expectedRevision, lane.revision);
          const title = text(input.title, 'Title', 160); const content = text(input.content, 'Content', 100_000, { empty: true });
          Object.assign(lane, { title, content, revision: lane.revision + 1, updatedAt: stamp() }); value = { lane: publicLane(lane, true) };
        } else if (req.method === 'POST' && endpoint === 'lane/publish') {
          const lane = current.lanes[actor.id]; revision(input.expectedRevision, lane.draft.revision);
          lane.draft.publishedAt = stamp(); lane.published = { ...lane.draft }; value = { lane: publicLane(lane.published, false) };
        } else if (req.method === 'DELETE' && endpoint === 'lane/publish') {
          current.lanes[actor.id].published = null; current.lanes[actor.id].draft.publishedAt = null; value = { unpublished: true };
        } else if (req.method === 'POST' && endpoint === 'invitations') {
          owner(actor);
          if (Object.keys(current.invitations).length >= 1000) {
            for (const [key, invitation] of Object.entries(current.invitations)) if (invitation.usedAt || invitation.revokedAt || Date.parse(invitation.expiresAt) <= Date.now()) delete current.invitations[key];
            if (Object.keys(current.invitations).length >= 1000) fail(409, 'invitation_limit', 'Revoke unused invitations before creating more.');
          }
          const invitationKey = secret(); const invitationId = id(); const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          current.invitations[invitationId] = { id: invitationId, keyHash: hash(invitationKey), expiresAt, createdAt: stamp() };
          value = { invitationId, invitationKey, expiresAt };
        } else if (req.method === 'DELETE' && /^invitations\/[a-f0-9]{24}$/.test(endpoint)) {
          owner(actor); const invitation = current.invitations[endpoint.split('/')[1]];
          if (!invitation) fail(404, 'not_found', 'Invitation not found.'); invitation.revokedAt = stamp(); value = { revoked: true };
        } else if (req.method === 'DELETE' && /^members\/[a-f0-9]{24}$/.test(endpoint)) {
          owner(actor); const target = current.members[endpoint.split('/')[1]];
          if (!target || target.revokedAt) fail(404, 'not_found', 'Member not found.');
          if (target.role === 'owner') fail(409, 'owner_protected', 'The room owner cannot be revoked.');
          target.revokedAt = stamp(); revokedMemberId = target.id; value = { revoked: true };
        } else if (req.method === 'POST' && endpoint === 'proposals') {
          const target = typeof input.targetMemberId === 'string' && Object.hasOwn(current.members, input.targetMemberId) ? current.members[input.targetMemberId] : undefined;
          if (!target || target.revokedAt || target.id === actor.id) fail(400, 'invalid_target', 'Choose another active member.');
          const title = text(input.title, 'Proposal title', 160); const content = text(input.content, 'Proposal content', 100_000, { empty: true });
          const key = text(input.idempotencyKey, 'Idempotency key', 128);
          const keyId = `${actor.id}:${hash(key)}`; const fingerprint = hash(JSON.stringify({ targetMemberId: target.id, targetRevision: input.targetRevision, title, content }));
          const previous = current.idempotency[keyId];
          if (previous) {
            if (previous.fingerprint !== fingerprint) fail(409, 'idempotency_conflict', 'This request key was already used for different content.');
            return { unchanged: true, value: { proposal: current.proposals[previous.proposalId] } };
          }
          // Only a published revision is addressable by another member.
          const targetLane = current.lanes[target.id];
          if (!targetLane.published) fail(409, 'preview_required', 'The recipient must publish a preview before receiving a proposal.');
          revision(input.targetRevision, targetLane.published.revision);
          if (Object.keys(current.proposals).length >= 10_000) fail(409, 'proposal_limit', 'This room reached the proposal limit.');
          const proposal = { id: id(), sourceMemberId: actor.id, targetMemberId: target.id, targetRevision: input.targetRevision, title, content, status: 'pending', revision: 0, createdAt: stamp(), updatedAt: stamp() };
          current.proposals[proposal.id] = proposal; current.idempotency[keyId] = { fingerprint, proposalId: proposal.id }; value = { proposal };
        } else if (req.method === 'POST' && /^proposals\/[a-f0-9]{24}\/(review|apply)$/.test(endpoint)) {
          const [, proposalId, operation] = endpoint.split('/'); const proposal = current.proposals[proposalId];
          if (!proposal || proposal.targetMemberId !== actor.id) fail(404, 'not_found', 'Proposal not found for this member.');
          revision(input.expectedRevision, proposal.revision);
          if (current.members[proposal.sourceMemberId].revokedAt) fail(409, 'sender_revoked', 'This proposal sender no longer has room access.');
          const targetLane = current.lanes[actor.id].draft;
          if (operation === 'review') {
            if (proposal.status !== 'pending') fail(409, 'invalid_transition', 'Only pending proposals can be reviewed.');
            if (!['accept', 'decline'].includes(input.decision)) fail(400, 'invalid_decision', 'Choose accept or decline.');
            if (input.decision === 'accept') revision(proposal.targetRevision, targetLane.revision);
            proposal.status = input.decision === 'accept' ? 'accepted' : 'declined';
          } else {
            if (proposal.status !== 'accepted') fail(409, 'review_required', 'Accept and review this proposal before applying it.');
            revision(input.targetRevision, targetLane.revision); revision(proposal.targetRevision, targetLane.revision);
            Object.assign(targetLane, { title: proposal.title, content: proposal.content, revision: targetLane.revision + 1, updatedAt: stamp() });
            proposal.status = 'applied';
          }
          proposal.revision++; proposal.updatedAt = stamp(); value = { proposal, lane: publicLane(targetLane, true) };
        } else if (req.method === 'POST' && endpoint === 'assets') {
          const name = text(input.name, 'Filename', 180).replace(/[\\/\r\n\x00-\x1f\x7f]/g, '_');
          if (!TYPES.has(input.mimeType)) fail(415, 'unsupported_asset', 'Choose PNG, JPEG, WebP, plain text, Markdown or JSON.');
          if (typeof input.contentBase64 !== 'string' || input.contentBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.contentBase64)) fail(400, 'invalid_asset', 'The file must be valid base64.');
          const buffer = Buffer.from(input.contentBase64, 'base64');
          if (buffer.toString('base64') !== input.contentBase64) fail(400, 'invalid_asset', 'The file must use canonical base64 encoding.');
          if (!buffer.length || buffer.length > MAX_ASSET) fail(413, 'asset_limit', 'Files must be between 1 byte and 2 MiB.');
          if (input.mimeType === 'image/png' && buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || input.mimeType === 'image/jpeg' && buffer.subarray(0, 3).toString('hex') !== 'ffd8ff' || input.mimeType === 'image/webp' && (buffer.subarray(0, 4).toString() !== 'RIFF' || buffer.subarray(8, 12).toString() !== 'WEBP')) fail(415, 'asset_type_mismatch', 'The file contents do not match the selected image type.');
          if (Object.keys(current.assets).length >= 1000) fail(409, 'asset_count_limit', 'Remove shared files before uploading more.');
          const asset = { id: id(), name, mimeType: input.mimeType, size: buffer.length, ownerId: actor.id, createdAt: stamp(), contentBase64: buffer.toString('base64') };
          current.assets[asset.id] = asset; const { contentBase64, ...metadata } = asset; value = { asset: metadata };
        } else if (req.method === 'DELETE' && /^assets\/[a-f0-9]{24}$/.test(endpoint)) {
          const assetId = endpoint.split('/')[1]; const asset = current.assets[assetId];
          if (!asset) fail(404, 'not_found', 'Asset not found.');
          if (asset.ownerId !== actor.id && actor.role !== 'owner') fail(403, 'asset_owner_required', 'Only the uploader or room owner can remove this file.');
          delete current.assets[assetId]; value = { deleted: true };
        } else fail(404, 'not_found', 'This endpoint does not exist.');
        return { roomId, value };
      });
      if (revokedMemberId) {
        for (const stream of streams.get(roomId) || []) if (stream.memberId === revokedMemberId) { stream.res.write('event: revoked\ndata: {}\n\n'); stream.res.end(); }
        presence.delete(`${roomId}:${revokedMemberId}`);
      }
      send(res, req.method === 'POST' && ['invitations', 'proposals', 'assets'].includes(endpoint) ? 201 : 200, result);
    } catch (error) {
      if (res.headersSent) { res.end(); return; }
      if (error instanceof ApiError) send(res, error.status, { error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } });
      else send(res, 500, { error: { code: 'server_error', message: 'The server could not save this change. Your local draft is safe to retry.' } });
    }
  }
  const server = tls ? https.createServer(tls, handle) : http.createServer(handle);
  server.requestTimeout = 30_000; server.headersTimeout = 15_000; server.keepAliveTimeout = 5_000; server.maxHeadersCount = 40;
  const sweep = setInterval(() => { for (const [key, rate] of rates) if (Date.now() - rate.startedAt > 120_000) rates.delete(key); }, 60_000); sweep.unref();
  async function stop() {
    if (stopped) return; stopped = true; clearInterval(sweep);
    for (const active of streams.values()) for (const stream of active) stream.res.end();
    await serial;
    await new Promise(resolve => server.close(resolve));
    server.closeAllConnections();
    await lock.close(); await unlink(lockPath);
  }
  try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); }); }
  catch (error) { clearInterval(sweep); await lock.close(); await unlink(lockPath); throw error; }
  const address = server.address();
  return { server, url: `${tls ? 'https' : 'http'}://${host.includes(':') ? `[${host}]` : host}:${address.port}`, stop };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const tls = process.env.RABTA_TEAMS_TLS_CERT && process.env.RABTA_TEAMS_TLS_KEY ? { cert: await readFile(process.env.RABTA_TEAMS_TLS_CERT), key: await readFile(process.env.RABTA_TEAMS_TLS_KEY) } : undefined;
    const service = await createTeamsService({ dataDir: process.env.RABTA_TEAMS_DATA_DIR || path.resolve('.rabta-teams'), bootstrapKey: process.env.RABTA_TEAMS_BOOTSTRAP_KEY, host: process.env.RABTA_TEAMS_HOST || '127.0.0.1', port: Number(process.env.RABTA_TEAMS_PORT || 47831), ...(process.env.RABTA_TEAMS_ORIGINS ? { allowedOrigins: process.env.RABTA_TEAMS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean) } : {}), tls });
    process.stdout.write(`Rabta Teams listening at ${service.url}\n`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => service.stop().then(() => process.exit(0)));
  } catch (error) { process.stderr.write(`Rabta Teams could not start: ${error.message}\n`); process.exitCode = 1; }
}
