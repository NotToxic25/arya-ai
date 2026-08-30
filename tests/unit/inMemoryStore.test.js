import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryStore } from '../../memory/inMemoryStore.js';

test('put then getAll returns the stored record', async () => {
  const store = new InMemoryStore();
  await store.put({ id: '1', content: 'hello' });
  const all = await store.getAll();
  assert.equal(all.length, 1);
  assert.equal(all[0].content, 'hello');
});

test('get returns null for a missing id', async () => {
  const store = new InMemoryStore();
  assert.equal(await store.get('nope'), null);
});

test('put overwrites an existing record with the same id', async () => {
  const store = new InMemoryStore();
  await store.put({ id: '1', content: 'v1' });
  await store.put({ id: '1', content: 'v2' });
  const all = await store.getAll();
  assert.equal(all.length, 1);
  assert.equal(all[0].content, 'v2');
});

test('delete removes a record', async () => {
  const store = new InMemoryStore();
  await store.put({ id: '1', content: 'x' });
  await store.delete('1');
  assert.equal((await store.getAll()).length, 0);
});

test('clear empties the store', async () => {
  const store = new InMemoryStore();
  await store.put({ id: '1', content: 'a' });
  await store.put({ id: '2', content: 'b' });
  await store.clear();
  assert.equal((await store.getAll()).length, 0);
});

test('returned records are copies, not live references (mutation isolation)', async () => {
  const store = new InMemoryStore();
  const record = { id: '1', content: 'original' };
  await store.put(record);
  record.content = 'mutated after put';
  const fetched = await store.get('1');
  assert.equal(fetched.content, 'original');
});
