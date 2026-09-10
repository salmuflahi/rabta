import test from 'node:test';
import assert from 'node:assert/strict';
import { canonical, digest, entryHash, inboxFor, orderEntries, relativeReference, sanitizedLink, validateCursor, validateEntry, validatePlace, validateSnapshot } from './threads.mjs';

test('canonical JSON sorts keys at every depth and keeps array order', () => {
  assert.equal(canonical({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } }), '{"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1}');
  assert.equal(digest({ a: 1, b: 2 }), digest({ b: 2, a: 1 }));
  assert.notEqual(digest([1, 2]), digest([2, 1]));
});

test('references stay relative and links lose anything secret', () => {
  assert.equal(relativeReference('src\\deep/file.ts', 'Path'), 'src/deep/file.ts');
  assert.equal(relativeReference('~/notes/todo.md', 'Path'), '~/notes/todo.md');
  for (const bad of ['/etc/passwd', 'C:\\Users\\x', '\\\\server\\share', 'a/../b', '~', '']) assert.throws(() => relativeReference(bad, 'Path'), /Path/);
  assert.equal(sanitizedLink('HTTPS://Example.com/a/b', 'Link'), 'https://example.com/a/b');
  for (const bad of ['https://u:p@example.com/', 'https://example.com/?q=1', 'https://example.com/#frag', 'javascript:alert(1)', 'not a url']) assert.throws(() => sanitizedLink(bad, 'Link'));
});

test('snapshots normalize, dedupe and require substance', () => {
  const snapshot = validateSnapshot({ title: '  Task  ', project: { id: 'p1' }, files: ['a.ts', 'a.ts', 'b.ts'], links: [], activeFile: 'c.ts', branch: 'main' });
  assert.equal(snapshot.title, 'Task'); assert.equal(snapshot.project.name, 'Untitled project');
  assert.deepEqual(snapshot.files, ['a.ts', 'b.ts', 'c.ts'], 'the active file joins the file list');
  assert.equal(snapshot.note, ''); assert.deepEqual(snapshot.folders, []);
  assert.throws(() => validateSnapshot({ title: 'x', project: { id: 'p' } }), /at least one/);
  assert.throws(() => validateSnapshot({ title: 'x', project: { id: 'p' }, files: Array.from({ length: 201 }, (_, i) => `f${i}`) }), /at most 200/);
  assert.throws(() => validateSnapshot({ title: 'x\u0007', project: { id: 'p' }, files: ['a'] }), /Title/);
});

test('places are typed and bounded', () => {
  assert.deepEqual(validatePlace({ type: 'file', path: 'src/a.ts', line: 12, column: 3, label: 'here' }), { type: 'file', path: 'src/a.ts', line: 12, column: 3, label: 'here' });
  assert.deepEqual(validatePlace({ type: 'image', assetId: 'a'.repeat(24), x: 0.123456, y: 1 }), { type: 'image', assetId: 'a'.repeat(24), x: 0.1235, y: 1 });
  assert.equal(validatePlace(null), null);
  assert.throws(() => validatePlace({ type: 'file', path: '/abs' }));
  assert.throws(() => validatePlace({ type: 'commit', sha: 'zz' }));
  assert.throws(() => validatePlace({ type: 'image', assetId: 'a'.repeat(24), x: 2, y: 0 }));
  assert.throws(() => validatePlace({ type: 'desktop' }));
});

test('entries obey their kind rules against the thread they join', () => {
  const decision = { hash: 'd'.repeat(64), kind: 'decision', author: 'alina', to: null };
  const handoff = { hash: 'h'.repeat(64), kind: 'handoff', author: 'alina', to: 'sam' };
  const context = (actorId, entries = [decision, handoff]) => ({ actorId, entries, hasSnapshot: value => value === 's'.repeat(64), isActiveMember: value => ['alina', 'sam'].includes(value), findEntry: value => entries.find(e => e.hash === value) ?? null });
  assert.equal(validateEntry({ kind: 'knot', text: ' note ', lamport: 3 }, context('sam')).text, 'note');
  assert.throws(() => validateEntry({ kind: 'knot', text: '' }, context('sam')), /Text is required/);
  assert.throws(() => validateEntry({ kind: 'shout', text: 'x' }, context('sam')), /kind/);
  assert.equal(validateEntry({ kind: 'acknowledge', target: decision.hash }, context('sam')).target, decision.hash);
  assert.throws(() => validateEntry({ kind: 'acknowledge', target: handoff.hash }, context('sam')), /Only decisions/);
  assert.equal(validateEntry({ kind: 'accept', target: handoff.hash }, context('sam')).target, handoff.hash);
  assert.throws(() => validateEntry({ kind: 'accept', target: handoff.hash }, context('alina')), /addressed to/);
  assert.throws(() => validateEntry({ kind: 'accept', target: handoff.hash }, context('sam', [decision, handoff, { hash: 'x'.repeat(64), kind: 'decline', target: handoff.hash, author: 'sam' }])), /already answered/);
  assert.equal(validateEntry({ kind: 'handoff', text: 'Next', to: 'sam', snapshot: 's'.repeat(64) }, context('alina')).to, 'sam');
  assert.throws(() => validateEntry({ kind: 'handoff', text: 'Next', to: 'alina', snapshot: 's'.repeat(64) }, context('alina')), /another active member/);
  assert.throws(() => validateEntry({ kind: 'handoff', text: 'Next', to: 'sam' }, context('alina')), /carries a capsule snapshot/);
  assert.deepEqual(validateEntry({ kind: 'weave', parents: [decision.hash, handoff.hash, decision.hash], snapshot: 's'.repeat(64) }, context('sam')).parents, [decision.hash, handoff.hash]);
  assert.throws(() => validateEntry({ kind: 'weave', parents: [], snapshot: 's'.repeat(64) }, context('sam')));
  assert.throws(() => validateEntry({ kind: 'link', place: { type: 'file', path: 'a' } }, context('sam')), /points at a link or a commit/);
  const hashed = { ...validateEntry({ kind: 'knot', text: 'a' }, context('sam')), task: 't', author: 'sam', seq: 1, createdAt: 'now' };
  assert.equal(entryHash({ ...hashed, hash: 'ignored' }), entryHash(hashed));
});

test('ordering follows the Lamport clock, then author, then sequence; the inbox holds unanswered hand-offs', () => {
  const entries = [{ lamport: 2, author: 'b', seq: 3 }, { lamport: 1, author: 'z', seq: 1 }, { lamport: 2, author: 'a', seq: 2 }, { lamport: 2, author: 'a', seq: 1 }];
  assert.deepEqual(orderEntries(entries).map(e => `${e.lamport}${e.author}${e.seq}`), ['1z1', '2a1', '2a2', '2b3']);
  const threads = { t1: { id: 't1', title: 'One', entries: [
    { hash: 'h1', kind: 'handoff', to: 'sam', author: 'alina', createdAt: '2026-09-10T10:00:00Z' },
    { hash: 'h2', kind: 'handoff', to: 'sam', author: 'alina', createdAt: '2026-09-10T11:00:00Z' },
    { hash: 'a1', kind: 'accept', target: 'h1', author: 'sam', createdAt: '2026-09-10T12:00:00Z' },
    { hash: 'h3', kind: 'handoff', to: 'jonah', author: 'sam', createdAt: '2026-09-10T13:00:00Z' },
  ] } };
  assert.deepEqual(inboxFor(threads, 'sam').map(e => e.hash), ['h2']);
  assert.deepEqual(inboxFor(threads, 'jonah').map(e => e.hash), ['h3']);
  assert.deepEqual(inboxFor(threads, 'alina'), []);
});

test('cursor updates are fractions and relative paths only', () => {
  const cursor = validateCursor({ active: true, task: 't1', pointer: { x: 0.33333, y: 0.5 }, editor: { path: 'src/a.ts', line: 3, column: 1, selection: { line: 4, column: 0 } }, leading: true });
  assert.deepEqual(cursor.pointer, { x: 0.3333, y: 0.5 }); assert.equal(cursor.editor.selection.line, 4); assert.equal(cursor.following, null);
  assert.throws(() => validateCursor({ active: 'yes' }));
  assert.throws(() => validateCursor({ active: true, pointer: { x: -0.1, y: 0 } }));
  assert.throws(() => validateCursor({ active: true, editor: { path: '../a', line: 1, column: 1 } }));
  assert.throws(() => validateCursor({ active: true, task: 'bad task' }));
});
