import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIProvider } from '../../ai/AIProvider.js';
import { UnsupportedFeatureError } from '../../core/errors.js';

test('AIProvider cannot be instantiated directly', () => {
  assert.throws(() => new AIProvider({ name: 'x' }), TypeError);
});

test('a subclass that does not override generateResponse throws UnsupportedFeatureError', async () => {
  class Bare extends AIProvider {
    constructor() { super({ name: 'bare' }); }
  }
  const p = new Bare();
  await assert.rejects(() => p.generateResponse([]), UnsupportedFeatureError);
});

test('default streamResponse falls back to generateResponse as a single-then-done chunk stream', async () => {
  class Simple extends AIProvider {
    constructor() { super({ name: 'simple' }); }
    async generateResponse() {
      return { role: 'assistant', content: 'hi', toolCalls: null, raw: {} };
    }
  }
  const p = new Simple();
  const chunks = [];
  for await (const chunk of p.streamResponse([])) chunks.push(chunk);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].delta, 'hi');
  assert.equal(chunks[0].done, false);
  assert.equal(chunks[1].done, true);
});
