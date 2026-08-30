import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryManager } from '../../memory/memoryManager.js';
import { InMemoryStore } from '../../memory/inMemoryStore.js';
import { StorageError } from '../../core/errors.js';

function makeManager() {
  return new MemoryManager({ store: new InMemoryStore() });
}

// --- creation ---

test('remember() creates and persists a memory with metadata', async () => {
  const mgr = makeManager();
  const record = await mgr.remember('User prefers Celsius over Fahrenheit.', { tags: ['preference'] });
  assert.ok(record.id);
  assert.equal(record.content, 'User prefers Celsius over Fahrenheit.');
  assert.deepEqual(record.tags, ['preference']);
  assert.equal(record.source, 'user');
  assert.equal(record.useCount, 0);
  assert.ok(record.createdAt && record.updatedAt && record.lastUsedAt);
});

test('remember() rejects empty content', async () => {
  const mgr = makeManager();
  await assert.rejects(() => mgr.remember(''), TypeError);
  await assert.rejects(() => mgr.remember('   '), TypeError);
});

// --- secret rejection ---

test('remember() refuses to store content that looks like an API key', async () => {
  const mgr = makeManager();
  await assert.rejects(() => mgr.remember('my key is sk-abcdefghij1234567890'), StorageError);
  assert.equal((await mgr.list()).length, 0);
});

test('remember() refuses to store content that looks like a password', async () => {
  const mgr = makeManager();
  await assert.rejects(() => mgr.remember('password: superSecretValue123'), StorageError);
  assert.equal((await mgr.list()).length, 0);
});

test('remember() refuses to store content that looks like a Bearer auth token', async () => {
  const mgr = makeManager();
  await assert.rejects(() => mgr.remember('Authorization: Bearer abc123def456ghi789'), StorageError);
  assert.equal((await mgr.list()).length, 0);
});

test('update() also refuses to overwrite a memory with secret-looking content', async () => {
  const mgr = makeManager();
  const record = await mgr.remember('safe original content');
  await assert.rejects(() => mgr.update(record.id, { content: 'sk-abcdefghij1234567890' }), StorageError);
  const stillSafe = await mgr.get(record.id);
  assert.equal(stillSafe.content, 'safe original content');
});

// --- explicit confirmation before automatic storage ---

test('proposeMemory() does NOT persist until approvePending() is called', async () => {
  const mgr = makeManager();
  const pending = mgr.proposeMemory('User mentioned liking jazz music.');
  assert.equal((await mgr.list()).length, 0);
  assert.equal(mgr.listPending().length, 1);

  const approved = await mgr.approvePending(pending.id);
  assert.equal(approved.content, 'User mentioned liking jazz music.');
  assert.equal((await mgr.list()).length, 1);
  assert.equal(mgr.listPending().length, 0);
});

test('rejectPending() discards a proposal without ever persisting it', async () => {
  const mgr = makeManager();
  const pending = mgr.proposeMemory('Some auto-detected fact.');
  mgr.rejectPending(pending.id);
  assert.equal((await mgr.list()).length, 0);
  assert.equal(mgr.listPending().length, 0);
});

test('proposeMemory() flags secret-looking content in the pending proposal itself', () => {
  const mgr = makeManager();
  const pending = mgr.proposeMemory('sk-abcdefghij1234567890');
  assert.equal(pending.secretFlag, true);
});

test('approvePending() still enforces the secret check even if a flagged proposal is approved', async () => {
  const mgr = makeManager();
  const pending = mgr.proposeMemory('sk-abcdefghij1234567890');
  await assert.rejects(() => mgr.approvePending(pending.id), StorageError);
});

// --- listing, editing, deletion ---

test('list() returns memories sorted by most recently updated first', async () => {
  const mgr = makeManager();
  const a = await mgr.remember('first memory');
  await new Promise((r) => setTimeout(r, 5));
  const b = await mgr.remember('second memory');
  const list = await mgr.list();
  assert.equal(list[0].id, b.id);
  assert.equal(list[1].id, a.id);
});

test('update() edits content and tags and bumps updatedAt', async () => {
  const mgr = makeManager();
  const record = await mgr.remember('old content', { tags: ['a'] });
  await new Promise((r) => setTimeout(r, 5));
  const updated = await mgr.update(record.id, { content: 'new content', tags: ['a', 'b'] });
  assert.equal(updated.content, 'new content');
  assert.deepEqual(updated.tags, ['a', 'b']);
  assert.notEqual(updated.updatedAt, record.updatedAt);
});

test('update() throws StorageError for a nonexistent id', async () => {
  const mgr = makeManager();
  await assert.rejects(() => mgr.update('nope', { content: 'x' }), StorageError);
});

test('remove() deletes a single memory without affecting others', async () => {
  const mgr = makeManager();
  const a = await mgr.remember('keep me');
  const b = await mgr.remember('delete me');
  await mgr.remove(b.id);
  const list = await mgr.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, a.id);
});

test('clearAll() requires explicit confirm:true', async () => {
  const mgr = makeManager();
  await mgr.remember('a');
  await mgr.remember('b');
  await assert.rejects(() => mgr.clearAll(), StorageError);
  await assert.rejects(() => mgr.clearAll({ confirm: false }), StorageError);
  assert.equal((await mgr.list()).length, 2);
  await mgr.clearAll({ confirm: true });
  assert.equal((await mgr.list()).length, 0);
});

// --- retrieval / ranking / explainability ---

test('retrieveRelevant() returns scored, explainable results', async () => {
  const mgr = makeManager();
  await mgr.remember('User loves hiking in the mountains.', { tags: ['hobby'] });
  await mgr.remember('User dislikes spicy food.', { tags: ['food'] });
  const results = await mgr.retrieveRelevant('what outdoor hobby does the user enjoy');
  assert.ok(results.length >= 1);
  assert.ok(results[0].memory.content.includes('hiking'));
  assert.ok(results[0].score > 0);
  assert.ok(Array.isArray(results[0].reasons) && results[0].reasons.length > 0);
});

test('retrieveRelevant() with touch:true increments useCount and lastUsedAt (affecting future ranking)', async () => {
  const mgr = makeManager();
  const record = await mgr.remember('User likes tea in the morning.', { tags: ['drink'] });
  await new Promise((r) => setTimeout(r, 5)); // ensure a distinct millisecond so lastUsedAt is verifiably different
  await mgr.retrieveRelevant('what does the user drink in the morning');
  const after = await mgr.get(record.id);
  assert.equal(after.useCount, 1);
  assert.notEqual(after.lastUsedAt, record.lastUsedAt);
});

test('retrieveRelevant() with touch:false does not mutate useCount', async () => {
  const mgr = makeManager();
  const record = await mgr.remember('User likes coffee in the afternoon.', { tags: ['drink'] });
  await mgr.retrieveRelevant('what does the user drink in the afternoon', { touch: false });
  const after = await mgr.get(record.id);
  assert.equal(after.useCount, 0);
});

test('retrieveRelevant() returns nothing for a query unrelated to any stored memory', async () => {
  const mgr = makeManager();
  await mgr.remember('User owns a red bicycle.');
  const results = await mgr.retrieveRelevant('quantum physics homework help');
  assert.equal(results.length, 0);
});

// --- duplicate prevention (per Phase 4-doc reconciliation) ---

test('remember() with near-identical content refreshes the existing memory instead of creating a duplicate', async () => {
  const mgr = makeManager();
  const first = await mgr.remember('User likes hiking on weekends');
  const second = await mgr.remember('User Likes Hiking On Weekends!!'); // same content, different casing/punctuation
  assert.equal(second.wasDuplicate, true);
  assert.equal(second.id, first.id);
  const all = await mgr.list();
  assert.equal(all.length, 1);
});

test('remember() with genuinely different content creates a separate memory', async () => {
  const mgr = makeManager();
  const first = await mgr.remember('User likes hiking');
  const second = await mgr.remember('User dislikes swimming');
  assert.equal(second.wasDuplicate, false);
  assert.notEqual(second.id, first.id);
  assert.equal((await mgr.list()).length, 2);
});

test('remember() merges tags when refreshing a duplicate rather than losing the originals', async () => {
  const mgr = makeManager();
  await mgr.remember('User likes jazz', { tags: ['music'] });
  const refreshed = await mgr.remember('User likes jazz', { tags: ['hobby'] });
  assert.ok(refreshed.tags.includes('music'));
  assert.ok(refreshed.tags.includes('hobby'));
});

// --- persistence contract (survives "restart" = a fresh manager over the same store) ---

test('memories persist across a fresh MemoryManager instance over the same store (simulated restart)', async () => {
  const sharedStore = new InMemoryStore();
  const mgr1 = new MemoryManager({ store: sharedStore });
  await mgr1.remember('User is a BCA student in Rajkot.');

  const mgr2 = new MemoryManager({ store: sharedStore }); // simulates reopening the app against the same persisted store
  const list = await mgr2.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].content, 'User is a BCA student in Rajkot.');
});
