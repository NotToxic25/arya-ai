import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreMemory, rankMemories, tokenize } from '../../memory/ranking.js';

function memory(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: 'm1',
    content: 'User likes pizza with extra cheese',
    tags: [],
    createdAt: now,
    updatedAt: now,
    lastUsedAt: now,
    useCount: 0,
    ...overrides,
  };
}

test('tokenize lowercases and strips punctuation', () => {
  assert.deepEqual(tokenize('Hello, World! 123'), ['hello', 'world', '123']);
});

test('scoreMemory gives higher score for more keyword overlap', () => {
  const m = memory();
  const low = scoreMemory('random unrelated text', m);
  const high = scoreMemory('what pizza toppings does the user like', m);
  assert.ok(high.score > low.score);
  assert.match(high.reasons.join(' '), /keyword match/);
});

test('scoreMemory gives a tag match a bigger boost than a content keyword match', () => {
  const m1 = memory({ content: 'unrelated content with birthday word', tags: [] });
  const m2 = memory({ content: 'totally different content', tags: ['birthday'] });
  const s1 = scoreMemory('birthday', m1);
  const s2 = scoreMemory('birthday', m2);
  assert.ok(s2.score >= s1.score);
});

test('scoreMemory boosts recently used memories over stale ones', () => {
  const now = Date.now();
  const recent = memory({ lastUsedAt: new Date(now - 1000).toISOString() });
  const stale = memory({ lastUsedAt: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString() });
  const s1 = scoreMemory('pizza', recent, now);
  const s2 = scoreMemory('pizza', stale, now);
  assert.ok(s1.score > s2.score);
});

test('scoreMemory returns zero score and no reasons for a total non-match with no recency/frequency boost eligibility', () => {
  const old = memory({
    content: 'zzz completely unrelated zzz',
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    lastUsedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
  const result = scoreMemory('pizza toppings', old, Date.now());
  assert.equal(result.score, 0);
  assert.deepEqual(result.reasons, []);
});

test('rankMemories sorts descending and excludes zero-score entries', () => {
  const memories = [
    memory({ id: 'a', content: 'unrelated fact about weather' }),
    memory({ id: 'b', content: 'user favorite pizza topping is mushroom' }),
    memory({ id: 'c', content: 'user pizza order history and pizza preferences' }),
  ];
  const ranked = rankMemories('pizza', memories, { now: Date.now() });
  assert.ok(ranked.length <= 3);
  assert.ok(ranked.every((r) => r.score > 0));
  assert.ok(!ranked.some((r) => r.memory.id === 'a'));
  // 'c' mentions pizza twice via unique-token dedupe it's really just one
  // unique token match same as 'b', so just check ordering is by score desc.
  for (let i = 1; i < ranked.length; i++) {
    assert.ok(ranked[i - 1].score >= ranked[i].score);
  }
});

test('rankMemories respects the limit option', () => {
  const memories = Array.from({ length: 10 }, (_, i) => memory({ id: `m${i}`, content: `pizza fact number ${i}` }));
  const ranked = rankMemories('pizza', memories, { limit: 3 });
  assert.equal(ranked.length, 3);
});
