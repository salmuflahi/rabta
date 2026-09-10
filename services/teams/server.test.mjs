import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createTeamsService } from './server.mjs';

async function fixture(t, options = {}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'rabta-teams-test-'));
  const bootstrapKey = randomBytes(32).toString('base64url');
  const settings = { dataDir, bootstrapKey, port: 0, allowedOrigins: ['tauri://localhost'], ...options };
  let service = await createTeamsService(settings);
  t.after(async () => { await service.stop(); await rm(dataDir, { recursive: true, force: true }); });
  async function request(route, { key = bootstrapKey, method = 'GET', body, status = 200, headers = {} } = {}) {
    const response = await fetch(service.url + route, { method, headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const result = response.headers.get('content-type')?.startsWith('application/json') ? await response.json() : await response.text();
    assert.equal(response.status, status, JSON.stringify(result)); return result;
  }
  const create = (name = 'Design room') => request('/v1/rooms', { method: 'POST', body: { name, displayName: 'Owner' }, status: 201 });
  const route = (person, suffix) => `/v1/rooms/${person.roomId}/${suffix}`;
  const call = (person, suffix, options) => request(route(person, suffix), { key: person.memberKey, ...options });
  async function invite(owner, displayName = 'Teammate') {
    const invitation = await call(owner, 'invitations', { method: 'POST', body: {}, status: 201 });
    const member = await request('/v1/invitations/accept', { method: 'POST', body: { invitationKey: invitation.invitationKey, displayName }, key: null, status: 201 });
    return { ...member, invitation };
  }
  return { request, call, route, create, invite, dataDir, bootstrapKey, settings, get service() { return service; }, async restart() { await service.stop(); service = await createTeamsService(settings); } };
}
const save = (f, person, expectedRevision, content, title = 'Current design') => f.call(person, 'lane', { method: 'PUT', body: { expectedRevision, title, content } });
const publish = (f, person, expectedRevision) => f.call(person, 'lane/publish', { method: 'POST', body: { expectedRevision } });
async function stream(f, person) {
  const controller = new AbortController();
  const response = await fetch(f.service.url + f.route(person, 'events'), { headers: { Authorization: `Bearer ${person.memberKey}` }, signal: controller.signal });
  assert.equal(response.status, 200);
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
  async function next(type) {
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      while (true) {
        let end;
        while ((end = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          const event = /^event: (.+)$/m.exec(frame)?.[1];
          if (event === type) return JSON.parse(/^data: (.+)$/m.exec(frame)[1]);
        }
        const value = await reader.read(); if (value.done) throw new Error(`Stream ended before ${type}`); buffer += decoder.decode(value.value, { stream: true });
      }
    } finally { clearTimeout(timeout); }
  }
  return { next, close() { controller.abort(); }, reader };
}

test('two members edit independent private lanes, publish live previews, and withdraw sharing', async t => {
  const f = await fixture(t); const owner = await f.create(); const member = await f.invite(owner);
  const live = await stream(f, member); t.after(() => live.close()); await live.next('ready');
  await Promise.all([save(f, owner, 0, 'Private owner draft'), save(f, member, 0, 'Independent teammate draft')]);
  const change = await live.next('change'); assert.ok(change.revision >= 3);
  const memberState = await f.call(member, 'state');
  assert.equal(memberState.lanes.length, 1); assert.equal(memberState.lanes[0].content, 'Independent teammate draft');
  assert.equal(memberState.lanes[0].private, true);
  assert.ok(!JSON.stringify(memberState).includes('Private owner draft'));
  await publish(f, owner, 1);
  const published = (await f.call(member, 'state')).lanes.find(l => l.memberId === owner.memberId);
  assert.equal(published.content, 'Private owner draft'); assert.equal(published.private, false); assert.ok(published.publishedAt);
  await save(f, owner, 1, 'Unpublished next thought');
  assert.equal((await f.call(member, 'state')).lanes.find(l => l.memberId === owner.memberId).content, 'Private owner draft');
  await f.call(owner, 'lane/publish', { method: 'DELETE' });
  assert.equal((await f.call(member, 'state')).lanes.length, 1);
});

test('same-lane competing writes detect a stale revision and preserve the winning draft', async t => {
  const f = await fixture(t); const owner = await f.create();
  const requests = ['first', 'second'].map(content => fetch(f.service.url + f.route(owner, 'lane'), { method: 'PUT', headers: { Authorization: `Bearer ${owner.memberKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: 0, title: 'Competing edits', content }) }));
  const results = await Promise.all(requests); assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const conflict = await results.find(r => r.status === 409).json(); assert.equal(conflict.error.details.currentRevision, 1);
  const state = await f.call(owner, 'state'); assert.equal(state.lanes[0].revision, 1); assert.ok(['first', 'second'].includes(state.lanes[0].content));
});

test('only the recipient can review/apply a proposal, repeated sends deduplicate, and apply preserves private ownership', async t => {
  const f = await fixture(t); const owner = await f.create(); const teammate = await f.invite(owner); const observer = await f.invite(owner, 'Observer');
  await save(f, owner, 0, 'Original'); await publish(f, owner, 1);
  const body = { targetMemberId: owner.memberId, targetRevision: 1, title: 'Reviewed design', content: 'Proposed improvement', idempotencyKey: 'send-1' };
  const created = await f.call(teammate, 'proposals', { method: 'POST', body, status: 201 });
  const retried = await f.call(teammate, 'proposals', { method: 'POST', body, status: 201 }); assert.equal(retried.proposal.id, created.proposal.id);
  await f.call(teammate, 'proposals', { method: 'POST', body: { ...body, content: 'Different' }, status: 409 });
  assert.equal((await f.call(observer, 'state')).proposals.length, 0);
  const endpoint = `proposals/${created.proposal.id}`;
  await f.call(teammate, `${endpoint}/review`, { method: 'POST', body: { expectedRevision: 0, decision: 'accept' }, status: 404 });
  await f.call(owner, `${endpoint}/apply`, { method: 'POST', body: { expectedRevision: 0, targetRevision: 1 }, status: 409 });
  await f.call(owner, `${endpoint}/review`, { method: 'POST', body: { expectedRevision: 0, decision: 'accept' } });
  assert.equal((await f.call(owner, 'state')).lanes[0].content, 'Original');
  const applied = await f.call(owner, `${endpoint}/apply`, { method: 'POST', body: { expectedRevision: 1, targetRevision: 1 } });
  assert.equal(applied.proposal.status, 'applied'); assert.equal(applied.lane.content, 'Proposed improvement'); assert.equal(applied.lane.revision, 2);
  assert.equal((await f.call(teammate, 'state')).lanes.find(l => l.memberId === owner.memberId).content, 'Original');
  await f.call(owner, `${endpoint}/apply`, { method: 'POST', body: { expectedRevision: 2, targetRevision: 2 }, status: 409 });
});

test('draft changes before review or between acceptance and application cannot be clobbered', async t => {
  const f = await fixture(t); const owner = await f.create(); const member = await f.invite(owner);
  await publish(f, owner, 0);
  const { proposal } = await f.call(member, 'proposals', { method: 'POST', body: { targetMemberId: owner.memberId, targetRevision: 0, title: 'Proposal', content: 'Proposed text', idempotencyKey: 'p-1' }, status: 201 });
  await f.call(owner, `proposals/${proposal.id}/review`, { method: 'POST', body: { expectedRevision: 0, decision: 'accept' } });
  await save(f, owner, 0, 'New private work');
  await f.call(owner, `proposals/${proposal.id}/apply`, { method: 'POST', body: { expectedRevision: 1, targetRevision: 1 }, status: 409 });
  const { proposal: stale } = await f.call(member, 'proposals', { method: 'POST', body: { targetMemberId: owner.memberId, targetRevision: 0, title: 'Stale proposal', content: 'Older text', idempotencyKey: 'p-2' }, status: 201 });
  await f.call(owner, `proposals/${stale.id}/review`, { method: 'POST', body: { expectedRevision: 0, decision: 'accept' }, status: 409 });
  await f.call(owner, `proposals/${stale.id}/review`, { method: 'POST', body: { expectedRevision: 0, decision: 'decline' } });
  assert.equal((await f.call(owner, 'state')).lanes[0].content, 'New private work');
});

test('room keys cannot cross rooms; invitations are single use; owner actions remain scoped', async t => {
  const f = await fixture(t); const one = await f.create('One'); const two = await f.create('Two'); const member = await f.invite(one);
  await f.request(f.route(two, 'state'), { key: member.memberKey, status: 401 });
  await f.request(f.route(one, 'state'), { key: null, status: 401 });
  await f.call(member, 'invitations', { method: 'POST', body: {}, status: 403 });
  await f.call(one, `members/${one.memberId}`, { method: 'DELETE', status: 409 });
  await f.request('/v1/invitations/accept', { method: 'POST', body: { invitationKey: member.invitation.invitationKey, displayName: 'Replay' }, status: 401 });
  const invitation = await f.call(one, 'invitations', { method: 'POST', body: {}, status: 201 });
  await f.call(one, `invitations/${invitation.invitationId}`, { method: 'DELETE' });
  await f.request('/v1/invitations/accept', { method: 'POST', body: { invitationKey: invitation.invitationKey, displayName: 'Revoked' }, status: 401 });
  const disk = await readFile(path.join(f.dataDir, 'state.json'), 'utf8');
  for (const key of [f.bootstrapKey, one.memberKey, two.memberKey, member.memberKey, invitation.invitationKey]) assert.ok(!disk.includes(key));
  assert.ok(!JSON.stringify(await f.call(one, 'state')).includes('keyHash'));
});

test('creation and invitation retries recover credentials after a lost acknowledgement without duplicate rooms or members', async t => {
  const f = await fixture(t);
  const body = { name: 'Recoverable room', displayName: 'Owner', memberKey: randomBytes(32).toString('base64url'), idempotencyKey: 'create-request' };
  const original = await f.request('/v1/rooms', { method: 'POST', body, status: 201 });
  const recovered = await f.request('/v1/rooms', { method: 'POST', body, status: 201 });
  assert.deepEqual(recovered, original); assert.equal(recovered.memberKey, body.memberKey);
  await f.request('/v1/rooms', { method: 'POST', body: { ...body, name: 'Different room' }, status: 409 });
  await f.request('/v1/rooms', { method: 'POST', body: { ...body, idempotencyKey: 'different-request' }, status: 409 });
  const invitation = await f.call(recovered, 'invitations', { method: 'POST', body: {}, status: 201 });
  const joinBody = { invitationKey: invitation.invitationKey, displayName: 'Joining member', memberKey: randomBytes(32).toString('base64url'), idempotencyKey: 'join-request' };
  const joined = await f.request('/v1/invitations/accept', { method: 'POST', body: joinBody, status: 201 });
  await f.restart();
  assert.deepEqual(await f.request('/v1/invitations/accept', { method: 'POST', body: joinBody, status: 201 }), joined);
  assert.equal((await f.call(recovered, 'state')).members.length, 2);
  await f.request('/v1/invitations/accept', { method: 'POST', body: { ...joinBody, displayName: 'Changed name' }, status: 409 });
  await f.request('/v1/invitations/accept', { method: 'POST', body: { ...joinBody, memberKey: randomBytes(32).toString('base64url'), idempotencyKey: 'other-request' }, status: 401 });
  const disk = await readFile(path.join(f.dataDir, 'state.json'), 'utf8');
  for (const privateValue of [body.memberKey, joinBody.memberKey, body.idempotencyKey, joinBody.idempotencyKey]) assert.ok(!disk.includes(privateValue));
  await f.call(recovered, `members/${joined.memberId}`, { method: 'DELETE' });
  await f.request('/v1/invitations/accept', { method: 'POST', body: joinBody, status: 401 });
});

test('revocation terminates live access and denies state, drafts, assets and reconnects', async t => {
  const f = await fixture(t); const owner = await f.create(); const member = await f.invite(owner);
  const { asset } = await f.call(owner, 'assets', { method: 'POST', body: { name: 'brief.txt', mimeType: 'text/plain', contentBase64: Buffer.from('Shared asset').toString('base64') }, status: 201 });
  const live = await stream(f, member); t.after(() => live.close()); await live.next('ready');
  await f.call(member, 'presence', { method: 'POST', body: { status: 'working' } });
  assert.equal((await live.next('presence')).status, 'working');
  await f.call(owner, `members/${member.memberId}`, { method: 'DELETE' });
  await live.next('revoked');
  await f.call(member, 'state', { status: 401 }); await f.call(member, `assets/${asset.id}`, { status: 401 });
  await f.call(member, 'lane', { method: 'PUT', body: { title: 'Forbidden', content: 'Revoked', expectedRevision: 0 }, status: 401 });
  await f.call(member, 'events', { status: 401 });
  assert.ok(!(await f.call(owner, 'state')).members.find(m => m.id === member.memberId));
});

test('explicit assets are shared with members, type-limited and deleted only by the owner or uploader', async t => {
  const f = await fixture(t); const owner = await f.create(); const member = await f.invite(owner); const observer = await f.invite(owner);
  const { asset } = await f.call(member, 'assets', { method: 'POST', body: { name: '../notes.txt', mimeType: 'text/plain', contentBase64: Buffer.from('Hello team').toString('base64') }, status: 201 });
  assert.equal(asset.name, '.._notes.txt'); assert.equal(asset.size, 10); assert.equal(asset.contentBase64, undefined);
  assert.equal(await f.call(owner, `assets/${asset.id}`), 'Hello team');
  await f.call(observer, `assets/${asset.id}`, { method: 'DELETE', status: 403 });
  await f.call(member, 'assets', { method: 'POST', body: { name: 'bad.svg', mimeType: 'image/svg+xml', contentBase64: Buffer.from('<svg/>').toString('base64') }, status: 415 });
  await f.call(member, 'assets', { method: 'POST', body: { name: 'bad.png', mimeType: 'image/png', contentBase64: Buffer.from('not an image').toString('base64') }, status: 415 });
  await f.call(member, 'assets', { method: 'POST', body: { name: 'bad.txt', mimeType: 'text/plain', contentBase64: 'invalid-!==' }, status: 400 });
  await f.call(owner, `assets/${asset.id}`, { method: 'DELETE' });
  await f.call(member, `assets/${asset.id}`, { status: 404 });
});

test('a maximum-sized file uploads and the next byte is rejected without corrupting stored assets', async t => {
  const f = await fixture(t); const owner = await f.create();
  const payload = { name: 'large.txt', mimeType: 'text/plain', contentBase64: Buffer.alloc(2 * 1024 * 1024, 'x').toString('base64') };
  const { asset } = await f.call(owner, 'assets', { method: 'POST', body: payload, status: 201 });
  assert.equal(asset.size, 2 * 1024 * 1024);
  await f.call(owner, 'assets', { method: 'POST', body: { ...payload, contentBase64: Buffer.alloc(2 * 1024 * 1024 + 1, 'x').toString('base64') }, status: 413 });
  assert.equal((await f.call(owner, 'state')).assets.length, 1);
});

test('durable state and published revisions survive restart; reconnect starts from the current state', async t => {
  const f = await fixture(t); const owner = await f.create(); const member = await f.invite(owner);
  await save(f, owner, 0, 'Persistent draft'); await publish(f, owner, 1);
  const original = await f.call(member, 'state');
  await f.restart();
  const recovered = await f.call(member, 'state'); assert.deepEqual(recovered, original);
  const live = await stream(f, member); t.after(() => live.close()); assert.equal((await live.next('ready')).revision, original.revision);
  await save(f, member, 0, 'After reconnect'); await live.next('change');
  assert.equal((await f.call(member, 'state')).lanes.find(l => l.memberId === member.memberId).content, 'After reconnect');
});

test('server refuses unsafe origins, secret URL parameters, large drafts and unauthenticated administration', async t => {
  const f = await fixture(t); const owner = await f.create();
  await f.call(owner, 'state', { headers: { Origin: 'https://malicious.example' }, status: 403 });
  const good = await f.call(owner, 'state', { headers: { Origin: 'tauri://localhost' } }); assert.equal(good.me.id, owner.memberId);
  await f.call(owner, 'state?memberKey=do-not-use-url-keys', { status: 400 });
  await f.call(owner, 'lane', { method: 'PUT', body: { expectedRevision: 0, title: 'Oversize', content: 'x'.repeat(100_001) }, status: 400 });
  await f.request('/v1/rooms', { method: 'POST', key: owner.memberKey, body: { name: 'Unauthorized room', displayName: 'Owner' }, status: 401 });
});

test('one writer owns each data directory; unsafe public HTTP and short bootstrap keys are rejected', async t => {
  const f = await fixture(t);
  await assert.rejects(createTeamsService(f.settings), /Cannot lock/);
  await assert.rejects(createTeamsService({ ...f.settings, host: '0.0.0.0' }), /require a TLS/);
  await assert.rejects(createTeamsService({ ...f.settings, bootstrapKey: 'short' }), /at least 32/);
});

test('corrupt persistent data fails closed and leaves the directory recoverable', async t => {
  const f = await fixture(t); await f.service.stop();
  await writeFile(path.join(f.dataDir, 'state.json'), '{broken');
  await assert.rejects(createTeamsService(f.settings), /JSON/);
  await writeFile(path.join(f.dataDir, 'state.json'), JSON.stringify({ version: 1, rooms: {} }));
  await f.restart(); assert.equal((await f.request('/health')).status, 'ok');
});

test('request rate limits reject excessive calls', async t => {
  const f = await fixture(t, { rateLimit: 2 }); await f.request('/health'); await f.request('/health'); await f.request('/health', { status: 429 });
});

// ---------------------------------------------------------------------------
// Snapshots, threads and Together
// ---------------------------------------------------------------------------

const SNAPSHOT = { title: 'Wire the connector SDK reconnect', project: { id: 'rabta', name: 'Rabta' }, files: ['packages/connector-sdk/src/index.ts', 'apps/desktop/src/App.tsx'], links: ['https://example.com/docs/reconnect'], folders: ['packages/connector-sdk'], branch: 'feat/connector-reconnect', activeFile: 'packages/connector-sdk/src/index.ts', note: 'The retry fires twice.' };
const entry = (f, person, task, body, status = 201) => f.call(person, `threads/${task}/entries`, { method: 'POST', body: { idempotencyKey: randomBytes(8).toString('hex'), ...body }, status });

test('snapshots are content-addressed, sanitized, and refuse absolute paths and secret-bearing links', async t => {
  const f = await fixture(t); const owner = await f.create();
  const first = await f.call(owner, 'snapshots', { method: 'POST', body: { snapshot: SNAPSHOT }, status: 201 });
  assert.match(first.hash, /^[a-f0-9]{64}$/); assert.equal(first.author, owner.memberId);
  const again = await f.call(owner, 'snapshots', { method: 'POST', body: { snapshot: { ...SNAPSHOT, files: [...SNAPSHOT.files].reverse() } }, status: 201 });
  assert.notEqual(again.hash, first.hash, 'order is part of the snapshot');
  const same = await f.call(owner, 'snapshots', { method: 'POST', body: { snapshot: { ...SNAPSHOT } } });
  assert.equal(same.hash, first.hash, 'an identical snapshot is the same snapshot');
  assert.equal((await f.call(owner, `snapshots/${first.hash}`)).snapshot.branch, 'feat/connector-reconnect');
  for (const [snapshot, code] of [
    [{ ...SNAPSHOT, files: ['/Users/sam/secret.txt'] }, 'absolute_path'],
    [{ ...SNAPSHOT, folders: ['../outside'] }, 'path_escape'],
    [{ ...SNAPSHOT, links: ['https://user:pw@example.com/x'] }, 'link_has_secrets'],
    [{ ...SNAPSHOT, links: ['https://example.com/x?token=1'] }, 'link_has_secrets'],
    [{ ...SNAPSHOT, links: ['file:///etc/passwd'] }, 'invalid_link'],
    [{ title: 'Empty', project: { id: 'p' } }, 'empty_snapshot'],
    [{ ...SNAPSHOT, branch: 'bad branch' }, 'invalid_input'],
  ]) {
    const result = await f.call(owner, 'snapshots', { method: 'POST', body: { snapshot }, status: 400 });
    assert.equal(result.error.code, code, JSON.stringify(snapshot));
  }
  const stored = JSON.parse(await readFile(path.join(f.dataDir, 'state.json'), 'utf8'));
  assert.ok(!JSON.stringify(stored).includes('/Users/'), 'no absolute path reached the store');
});

test('thread entries append in order, hand-offs reach the recipient inbox, and answers are checked', async t => {
  const f = await fixture(t); const owner = await f.create(); const member = await f.invite(owner, 'Sam');
  const live = await stream(f, member); t.after(() => live.close()); await live.next('ready');
  const snapshot = await f.call(owner, 'snapshots', { method: 'POST', body: { snapshot: SNAPSHOT }, status: 201 });
  const knot = await entry(f, owner, 'connector-reconnect', { kind: 'knot', title: 'Connector reconnect', text: 'The retry fires twice on a timeout. Start here.', place: { type: 'file', path: 'packages/connector-sdk/src/index.ts', line: 118 }, snapshot: snapshot.hash, lamport: 0 });
  assert.equal(knot.entry.seq, 1); assert.equal(knot.entry.lamport, 1); assert.match(knot.entry.hash, /^[a-f0-9]{64}$/); assert.equal(knot.thread.title, 'Connector reconnect');
  const event = await live.next('thread'); assert.equal(event.task, 'connector-reconnect'); assert.equal(event.kind, 'knot');
  const handoff = await entry(f, owner, 'connector-reconnect', { kind: 'handoff', text: 'Find the second retry and remove it.', to: member.memberId, snapshot: snapshot.hash, lamport: 1, prev: knot.entry.hash });
  assert.equal(handoff.entry.lamport, 2);
  const memberState = await f.call(member, 'state');
  assert.equal(memberState.inbox.length, 1); assert.equal(memberState.inbox[0].hash, handoff.entry.hash); assert.equal(memberState.inbox[0].title, 'Connector reconnect');
  assert.equal((await f.call(owner, 'state')).inbox.length, 0);
  assert.equal((await entry(f, owner, 'connector-reconnect', { kind: 'accept', target: handoff.entry.hash, lamport: 0 }, 400)).error.code, 'not_recipient');
  const accept = await entry(f, member, 'connector-reconnect', { kind: 'accept', target: handoff.entry.hash, lamport: 0 });
  assert.equal(accept.entry.lamport, 3, 'the server clock never goes backwards');
  assert.equal((await f.call(member, 'state')).inbox.length, 0);
  assert.equal((await entry(f, member, 'connector-reconnect', { kind: 'decline', target: handoff.entry.hash, lamport: 0 }, 400)).error.code, 'already_answered');
  const decision = await entry(f, member, 'connector-reconnect', { kind: 'decision', text: '30 seconds, agreed with the client.', lamport: 9 });
  assert.equal(decision.entry.lamport, 10);
  await entry(f, owner, 'connector-reconnect', { kind: 'acknowledge', target: decision.entry.hash, lamport: 0 });
  assert.equal((await entry(f, owner, 'connector-reconnect', { kind: 'acknowledge', target: knot.entry.hash, lamport: 0 }, 400)).error.code, 'invalid_target');
  assert.equal((await entry(f, owner, 'connector-reconnect', { kind: 'handoff', text: 'x', to: owner.memberId, snapshot: snapshot.hash }, 400)).error.code, 'invalid_target');
  assert.equal((await entry(f, owner, 'connector-reconnect', { kind: 'split', text: 'try backoff' }, 400)).error.code, 'snapshot_required');
  assert.equal((await entry(f, owner, 'connector-reconnect', { kind: 'knot', text: 'x', snapshot: 'f'.repeat(64) }, 400)).error.code, 'unknown_snapshot');
  assert.equal((await entry(f, owner, 'bad task!', { kind: 'knot', text: 'x' }, 404)).error.code, 'not_found');
  const thread = await f.call(member, 'threads/connector-reconnect');
  assert.deepEqual(thread.entries.map(e => e.kind), ['knot', 'handoff', 'accept', 'decision', 'acknowledge']);
  assert.deepEqual(thread.entries.map(e => e.seq), [1, 2, 3, 4, 5]);
  const summary = (await f.call(owner, 'state')).threads[0];
  assert.equal(summary.entries, 5); assert.equal(summary.lastSnapshot, snapshot.hash); assert.deepEqual(summary.authors.sort(), [owner.memberId, member.memberId].sort());
});

test('an entry retry with the same key returns the same entry; entries and snapshots survive restart; Together does not', async t => {
  const f = await fixture(t); const owner = await f.create();
  const snapshot = await f.call(owner, 'snapshots', { method: 'POST', body: { snapshot: SNAPSHOT }, status: 201 });
  const body = { idempotencyKey: 'once', kind: 'knot', text: 'Same knot', lamport: 0 };
  const first = await f.call(owner, 'threads/t1/entries', { method: 'POST', body, status: 201 });
  const second = await f.call(owner, 'threads/t1/entries', { method: 'POST', body, status: 200 });
  assert.equal(second.entry.hash, first.entry.hash); assert.equal(second.thread.entries, 1);
  assert.equal((await f.call(owner, 'threads/t1/entries', { method: 'POST', body: { ...body, text: 'Different' }, status: 409 })).error.code, 'idempotency_conflict');
  await f.call(owner, 'together', { method: 'POST', body: { active: true, task: 't1', pointer: { x: 0.5, y: 0.25 } } });
  assert.equal((await f.call(owner, 'state')).together.length, 1);
  assert.ok(!(await readFile(path.join(f.dataDir, 'state.json'), 'utf8')).includes('"pointer"'), 'cursors are never persisted');
  await f.restart();
  const state = await f.call(owner, 'state');
  assert.equal(state.threads[0].entries, 1); assert.equal(state.together.length, 0);
  assert.equal((await f.call(owner, `snapshots/${snapshot.hash}`)).hash, snapshot.hash);
});

test('Together cursors are broadcast, validated, expire, and disappear on leave or revocation', async t => {
  const f = await fixture(t, { cursorTtl: 300 }); const owner = await f.create(); const member = await f.invite(owner, 'Alina');
  const live = await stream(f, owner); t.after(() => live.close()); await live.next('ready');
  const sent = await f.call(member, 'together', { method: 'POST', body: { active: true, task: 't1', pointer: { x: 0.25, y: 0.75 }, editor: { path: 'src/retry.ts', line: 118, column: 4 }, leading: true } });
  assert.equal(sent.memberId, member.memberId); assert.deepEqual(sent.pointer, { x: 0.25, y: 0.75 }); assert.equal(sent.editor.path, 'src/retry.ts');
  const seen = await live.next('cursor'); assert.equal(seen.memberId, member.memberId); assert.equal(seen.editor.line, 118); assert.equal(seen.leading, true);
  const partial = await f.call(member, 'together', { method: 'POST', body: { active: true, pointer: { x: 0.3, y: 0.7 } } });
  assert.equal(partial.editor.path, 'src/retry.ts', 'an update without an editor keeps the last editor position');
  assert.equal(partial.task, 't1');
  assert.deepEqual((await live.next('cursor')).pointer, { x: 0.3, y: 0.7 });
  for (const [body, code] of [[{ active: true, pointer: { x: 2, y: 0 } }, 'invalid_pointer'], [{ active: true, editor: { path: '/abs', line: 1, column: 1 } }, 'absolute_path'], [{ pointer: { x: 0, y: 0 } }, 'invalid_input'], [{ active: true, following: 'nobody' }, 'invalid_target']]) {
    assert.equal((await f.call(member, 'together', { method: 'POST', body, status: 400 })).error.code, code);
  }
  await f.call(member, 'together', { method: 'POST', body: { active: false } });
  const gone = await live.next('cursor'); assert.equal(gone.gone, true); assert.equal(gone.memberId, member.memberId);
  assert.equal((await f.call(owner, 'state')).together.length, 0);
  await f.call(member, 'together', { method: 'POST', body: { active: true, pointer: { x: 0.1, y: 0.1 } } });
  await live.next('cursor');
  const expired = await live.next('cursor'); assert.equal(expired.gone, true, 'silence ends a cursor');
  await f.call(member, 'together', { method: 'POST', body: { active: true, pointer: { x: 0.1, y: 0.1 } } });
  await live.next('cursor');
  await f.call(owner, `members/${member.memberId}`, { method: 'DELETE' });
  const revoked = await live.next('cursor'); assert.equal(revoked.gone, true);
  assert.equal((await f.call(owner, 'state')).together.length, 0);
});

test('Together has its own rate budget and a revoked member cannot append to threads', async t => {
  const f = await fixture(t, { rateLimit: 30 }); const owner = await f.create(); const member = await f.invite(owner);
  const results = await Promise.all(Array.from({ length: 20 }, () => fetch(f.service.url + f.route(owner, 'together'), { method: 'POST', headers: { Authorization: `Bearer ${owner.memberKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ active: true, pointer: { x: 0.5, y: 0.5 } }) })));
  const statuses = results.map(r => r.status).sort((a, b) => a - b);
  assert.equal(statuses.filter(s => s === 200).length, 15); assert.equal(statuses.filter(s => s === 429).length, 5);
  await f.call(owner, 'state', { status: 200 });
  await f.call(owner, `members/${member.memberId}`, { method: 'DELETE' });
  await f.call(member, 'threads/t1/entries', { method: 'POST', body: { idempotencyKey: 'k', kind: 'knot', text: 'late' }, status: 401 });
});
